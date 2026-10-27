import { runClickScheduler, scheduleClick, type ClickEngine, type ClickTrack } from "@web/lib/clickEngine";
import { engineLatency } from "./engine";
import { getAudioContext } from "./metronome";
import { ensureStarted } from "./webAudio/bridge";

/** Desktop version of `lib/clickEngine`. The clicks are the website's own (`scheduleClick`: an
    oscillator into a gain), built in the native Web Audio bridge like every other sound, so they
    share one clock with whatever a tool plays over them. This only adds what the website can't
    know: the scheduler starts once the output's clock is running, the beat display waits for the
    device's output delay, and the Recorder can ask when the first beat plays. */

export * from "@web/lib/clickEngine";

// The output time of the first beat of the latest `startClickEngine`, for the Recorder: its take
// starts on the beat after the count-in. `runClickScheduler` puts the first beat at
// `now() + 0.06` from its first reading of the clock (keep the two in step).
const SCHEDULER_START_SEC = 0.06;
let firstBeat: Promise<number> | null = null;

/** When the latest click engine's first beat plays (output seconds), once it has started. */
export function latestFirstBeat(): Promise<number> | null {
  return firstBeat;
}

export function startClickEngine(tracks: ClickTrack[]): ClickEngine {
  const ctx = getAudioContext();
  let engine: ClickEngine | null = null;
  let stopped = false;
  let resolveFirstBeat: (time: number) => void = () => {};
  firstBeat = new Promise((resolve) => (resolveFirstBeat = resolve));
  void ensureStarted().then(() => {
    if (stopped) return;
    let first = true;
    engine = runClickScheduler(tracks, {
      now: () => {
        const time = ctx.currentTime;
        if (first) resolveFirstBeat(time + SCHEDULER_START_SEC);
        first = false;
        return time;
      },
      play: (time, wave, freq, gain, length) => void scheduleClick(ctx, time, wave, freq, gain, length),
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
