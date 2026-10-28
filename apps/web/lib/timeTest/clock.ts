/**
 * Maps mic sample numbers to the click's clock and back.
 *
 * Every chunk of mic samples arrives with an anchor: its first sample's number and where that
 * sample sits on the click's clock. On the website the two come from the same AudioContext, so
 * the anchors lie on one exact line. On desktop each anchor is the capture time the audio system
 * reported for a callback, which jitters a little, so a lookup uses the median offset of the
 * anchors around it: callback jitter, xruns and slow drift between the sound card and the
 * system clock all wash out.
 */

/** How many anchors either side of a lookup feed its median. */
const NEIGHBOURS = 24;

export class ClockMap {
  readonly sr: number;
  /** [frame, time] pairs, both increasing. */
  private anchors: [number, number][] = [];

  constructor(sr: number) {
    this.sr = sr;
  }

  push(frame: number, time: number) {
    if (!Number.isFinite(time)) return;
    this.anchors.push([frame, time]);
  }

  get empty() {
    return this.anchors.length === 0;
  }

  /** Drops all but the most recent `keep` anchors (when nothing needs the history). */
  trim(keep: number) {
    if (this.anchors.length > keep * 2) this.anchors.splice(0, this.anchors.length - keep);
  }

  private medianOffset(center: number): number {
    const n = this.anchors.length;
    if (n === 0) return 0;
    const hi = Math.min(center + NEIGHBOURS, n);
    const lo = Math.min(Math.max(0, center - NEIGHBOURS), hi - 1);
    const offs = this.anchors.slice(lo, hi).map(([f, t]) => t - f / this.sr);
    offs.sort((a, b) => a - b);
    return offs[offs.length >> 1];
  }

  private index(pred: (a: [number, number]) => boolean): number {
    let lo = 0;
    let hi = this.anchors.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pred(this.anchors[mid])) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Where `frame` sits on the click's clock. */
  timeOf(frame: number): number {
    return this.medianOffset(this.index((a) => a[0] < frame)) + frame / this.sr;
  }

  /** The inverse of `timeOf`: which frame lines up with click time `t`. */
  frameOf(t: number): number {
    return (t - this.medianOffset(this.index((a) => a[1] < t))) * this.sr;
  }
}
