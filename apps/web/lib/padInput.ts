import { openStream } from "@/lib/audioInput";
import { beginMicUse, endMicUse } from "@/lib/iosAudio";
import { getAudioContext } from "@/lib/metronome";

/**
 * The Time Test's microphone: every sample, in order, each chunk tagged with where it sits on the
 * click's clock (the AudioContext's time), so strokes can be measured against the clicks. The
 * desktop app swaps this module for a native one (`apps/desktop/src/native/padInput.ts`) with
 * the same exports.
 *
 * Here the samples come through an AudioWorklet in the same AudioContext as the clicks, so a
 * chunk's time is exact: its first sample's context frame. A click played at time T reaches the
 * worklet at T plus the round trip (output delay, the air, input delay), which is what the
 * Time Test's calibration measures.
 */

/** `frame` numbers samples in order (no gaps); `time` is where `frame` sits on the click's clock,
    before the round trip (NaN when it isn't known yet). */
export type PadChunk = { samples: Float32Array; frame: number; time: number };

export type PadInput = {
  sampleRate: number;
  /** A guess at the round trip in ms, for before the first calibration. */
  latencyGuessMs: number;
  stop: () => void;
};

const WORKLET = `
class PadTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(2048);
    this.n = 0;
    this.start = 0;
  }
  process(inputs, outputs) {
    const chans = inputs[0] || [];
    const len = (outputs[0] && outputs[0][0] && outputs[0][0].length) || 128;
    if (this.n === 0) this.start = currentFrame;
    for (let i = 0; i < len; i++) {
      let sum = 0;
      for (let c = 0; c < chans.length; c++) sum += chans[c][i];
      this.buf[this.n + i] = chans.length ? sum / chans.length : 0;
    }
    this.n += len;
    if (this.n >= 1024) {
      this.port.postMessage({ frame: this.start, samples: this.buf.slice(0, this.n) });
      this.n = 0;
    }
    return true;
  }
}
registerProcessor("soniroll-pad-tap", PadTap);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

function loadWorklet(ctx: AudioContext): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    loaded.set(ctx, p);
  }
  return p;
}

export async function startPadInput(deviceId: string, onChunk: (chunk: PadChunk) => void): Promise<PadInput> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  if (!ctx.audioWorklet) throw new Error("This browser can't listen to the mic sample by sample.");
  await loadWorklet(ctx);
  beginMicUse();
  let stream: MediaStream;
  try {
    stream = await openStream(deviceId, 1);
  } catch (error) {
    endMicUse();
    throw error;
  }
  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, "soniroll-pad-tap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  // The tap outputs silence; connecting it is what keeps the context processing it.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(tap);
  tap.connect(mute);
  mute.connect(ctx.destination);
  tap.port.onmessage = (e: MessageEvent<{ frame: number; samples: Float32Array }>) => {
    onChunk({ samples: e.data.samples, frame: e.data.frame, time: e.data.frame / ctx.sampleRate });
  };

  const trackLatency = (stream.getAudioTracks()[0]?.getSettings() as { latency?: number } | undefined)?.latency ?? 0.01;
  const latencyGuessMs = ((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0) + trackLatency) * 1000;

  return {
    sampleRate: ctx.sampleRate,
    latencyGuessMs,
    stop: () => {
      tap.port.onmessage = null;
      source.disconnect();
      tap.disconnect();
      mute.disconnect();
      for (const track of stream.getTracks()) track.stop();
      endMicUse();
    },
  };
}
