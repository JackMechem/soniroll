import { ClockMap } from '@jam-practice/core/timeTestClock';

/**
 * Where the phone's mic samples sit on the click's clock (the `AudioContext`'s `currentTime`).
 *
 * On the website the mic is tapped inside the same `AudioContext` as the clicks, so every chunk of
 * samples comes with its exact context time. The phone's recorder (`react-native-audio-api`'s
 * `AudioRecorder`) runs its own input stream and only numbers its samples (`when` is just frames
 * delivered / sample rate), so here each chunk is dated by **when it reached JavaScript**: the
 * context time read as the chunk arrives, minus the chunk's own length, is an upper bound on where
 * its first sample sits. Arrival is late by a varying amount (the recorder's thread hand-off, a busy
 * JS thread, `currentTime` only moving once per render burst), but never early, so the **smallest**
 * offset over a few seconds of chunks is the steady one: what's left is a fixed delay (the input
 * buffering), which calibration measures along with the speaker-to-mic round trip, exactly like the
 * website's.
 *
 * `add` gives each chunk's time as it arrives (the smallest offset over the last few seconds, for
 * the live readout); `settled` re-dates a finished take using chunks either side of each one, so a
 * slow start (the JS thread busy just as the mic opens) doesn't skew the first bars. A sliding
 * window rather than one offset for the whole take, so the mic's and the speaker's clocks drifting
 * apart (separate hardware clocks, up to ~0.1 ms a second) is followed too.
 */

/** How many seconds of chunks either side feed each estimate. */
const WINDOW_SEC = 3;
/** Observations kept (about an hour of 1024-sample chunks). */
const MAX_OBSERVATIONS = 200_000;

export class ArrivalClock {
  readonly sr: number;
  private readonly window: number;
  /** Chunk start frames and their arrival offsets (`arrival - end frame / sr`), in order. */
  private frames: number[] = [];
  private offsets: number[] = [];

  constructor(sr: number, chunkLength: number) {
    this.sr = sr;
    this.window = Math.max(8, Math.round((WINDOW_SEC * sr) / Math.max(1, chunkLength)));
  }

  /** Notes a chunk of `n` frames starting at `frame` that reached JS at context time `arrival`, and
      returns where its first sample sits on the context clock (best guess so far). */
  add(frame: number, n: number, arrival: number): number {
    if (!Number.isFinite(arrival)) return NaN;
    this.frames.push(frame);
    this.offsets.push(arrival - (frame + n) / this.sr);
    if (this.frames.length > MAX_OBSERVATIONS) {
      this.frames.splice(0, this.frames.length - MAX_OBSERVATIONS / 2);
      this.offsets.splice(0, this.offsets.length - MAX_OBSERVATIONS / 2);
    }
    const end = this.offsets.length;
    let min = Infinity;
    for (let i = Math.max(0, end - this.window); i < end; i++) min = Math.min(min, this.offsets[i]);
    return frame / this.sr + min;
  }

  /** A clock map for frames from `fromFrame` on, each chunk dated from the chunks a few seconds
      either side of it (past and future). */
  settled(fromFrame: number): ClockMap {
    const map = new ClockMap(this.sr);
    const n = this.frames.length;
    const half = this.window >> 1;
    for (let i = 0; i < n; i++) {
      // One chunk before the take too, so its first frames have an anchor at or before them.
      if (i + 1 < n && this.frames[i + 1] <= fromFrame) continue;
      let min = Infinity;
      for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) min = Math.min(min, this.offsets[j]);
      map.push(this.frames[i], this.frames[i] / this.sr + min);
    }
    return map;
  }
}
