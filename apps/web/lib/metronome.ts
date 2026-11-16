import { setSteadyInterval } from "@/lib/steadyTimer";

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

export function parseBeatsPerBar(timeSignature: string): number {
  const numerator = Number(timeSignature.split("/")[0]);
  return Number.isFinite(numerator) && numerator > 0 ? numerator : 4;
}

function scheduleClick(ctx: AudioContext, time: number, accent: boolean) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = accent ? 1500 : 900;
  gain.gain.setValueAtTime(accent ? 0.9 : 0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
  osc.start(time);
  osc.stop(time + 0.06);
  return osc;
}

export type CountOff = {
  stop: () => void;
  durationMs: number;
};

const SCHEDULE_INTERVAL_MS = 100;
const SCHEDULE_LOOKAHEAD_SEC = 0.2;

export function playCountOff(
  bpm: number,
  timeSignature: string,
  bars = 8,
  accentFirstBeat = false,
  continueIndefinitely = false,
  onBeat?: (beat: number) => void,
): CountOff {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();

  const beatsPerBar = parseBeatsPerBar(timeSignature);
  const beatDuration = 60 / bpm;
  const totalBeats = beatsPerBar * bars;
  const startTime = ctx.currentTime + 0.05;

  const oscillators: OscillatorNode[] = [];
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  function scheduleBeat(i: number) {
    const time = startTime + i * beatDuration;
    if (onBeat) {
      const t = setTimeout(
        () => {
          timeouts.delete(t);
          onBeat(i % beatsPerBar);
        },
        Math.max(0, (time - ctx.currentTime) * 1000),
      );
      timeouts.add(t);
    }
    const accent = accentFirstBeat && i % beatsPerBar === 0;
    oscillators.push(scheduleClick(ctx, time, accent));
  }

  for (let i = 0; i < totalBeats; i++) scheduleBeat(i);

  const durationMs = (totalBeats * beatDuration + 0.1) * 1000;

  let stopTimer: (() => void) | null = null;
  if (continueIndefinitely) {
    let nextBeat = totalBeats;
    stopTimer = setSteadyInterval(() => {
      const horizon = ctx.currentTime + SCHEDULE_LOOKAHEAD_SEC;
      while (startTime + nextBeat * beatDuration < horizon) {
        scheduleBeat(nextBeat);
        nextBeat++;
      }
    }, SCHEDULE_INTERVAL_MS);
  }

  return {
    durationMs: continueIndefinitely ? Infinity : durationMs,
    stop: () => {
      stopTimer?.();
      for (const t of timeouts) clearTimeout(t);
      timeouts.clear();
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          // already stopped
        }
      }
    },
  };
}
