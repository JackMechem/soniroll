import { runClickScheduler, scheduleClick, type ClickEngine, type ClickTrack } from "@web/lib/clickEngine";
import { engineLatency } from "./engine";
import { getAudioContext } from "./metronome";
import { ensureStarted } from "./webAudio/bridge";

/** Desktop version of `lib/clickEngine`. The clicks are the website's own (`scheduleClick`: an
    oscillator into a gain), built in the native Web Audio bridge like every other sound, so they
    share one clock with whatever a tool plays over them. This only adds two things the website
    can't know: the scheduler starts once the output's clock is running, and the beat display
    waits for the device's output delay. */

export * from "@web/lib/clickEngine";

export function startClickEngine(tracks: ClickTrack[]): ClickEngine {
  const ctx = getAudioContext();
  let engine: ClickEngine | null = null;
  let stopped = false;
  void ensureStarted().then(() => {
    if (stopped) return;
    engine = runClickScheduler(tracks, {
      now: () => ctx.currentTime,
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
