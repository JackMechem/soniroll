import { runClickScheduler, type ClickEngine, type ClickTrack } from "@web/lib/clickEngine";
import { engineLatency, engineNow, engineStarted, enqueue, ensureStarted } from "./engine";

/** Desktop version of `lib/clickEngine`: the same scheduler, but each click is played by the
    native engine, placed on its exact sample. Everything else comes from the website's module. */

export * from "@web/lib/clickEngine";

type Click = { at: number; wave: OscillatorType; freq: number; gain: number; length: number };

// Clicks scheduled in the same tick go to Rust in one call.
let batch: Click[] = [];
function send(click: Click) {
  if (batch.length === 0) {
    queueMicrotask(() => {
      const clicks = batch;
      batch = [];
      enqueue("audio_schedule", { clicks });
    });
  }
  batch.push(click);
}

/** `ctx` is whatever `getAudioContext()` returned (here, the native clock), so `time` is on the
    engine clock. Before the engine has started, the click keeps its delay from now. */
export function scheduleClick(
  ctx: { currentTime: number },
  time: number,
  wave: OscillatorType,
  freq: number,
  gain: number,
  length: number,
): void {
  if (engineStarted()) {
    send({ at: time, wave, freq, gain, length });
    return;
  }
  const delay = time - ctx.currentTime;
  void ensureStarted().then(() => send({ at: engineNow() + delay, wave, freq, gain, length }));
}

export function startClickEngine(tracks: ClickTrack[]): ClickEngine {
  let engine: ClickEngine | null = null;
  let stopped = false;
  void ensureStarted().then(() => {
    if (stopped) return;
    engine = runClickScheduler(tracks, {
      now: engineNow,
      play: (at, wave, freq, gain, length) => send({ at, wave, freq, gain, length }),
      latency: engineLatency,
    });
  });
  return {
    stop: () => {
      stopped = true;
      engine?.stop();
    },
  };
}
