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

// Engine time minus the Web Audio context's time. Measured once and kept, because the context's
// clock moves in steps of a few milliseconds: re-measuring for every click would jitter them.
// Re-synced only if the two clocks have drifted (or the engine restarted) by more than 20 ms.
let offset: number | null = null;

function toEngineTime(ctx: { currentTime: number }, time: number): number {
  const measured = engineNow() - ctx.currentTime;
  if (offset === null || Math.abs(measured - offset) > 0.02) offset = measured;
  return time + offset;
}

/** For callers that schedule on a Web Audio context (`time` is on `ctx`'s clock), like the
    Random Sticking Warmup and the trainers' count-in: moved onto the native engine's clock. */
export function scheduleClick(
  ctx: { currentTime: number },
  time: number,
  wave: OscillatorType,
  freq: number,
  gain: number,
  length: number,
): void {
  if (engineStarted()) {
    send({ at: toEngineTime(ctx, time), wave, freq, gain, length });
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
