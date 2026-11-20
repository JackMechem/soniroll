import type { Take } from '@jam-practice/core/timeTestAnalysis';

/**
 * A take's waveform at 2 ms a column (min and max of each), for drawing. Reading every sample of a
 * long take again each time the view moves is too slow on a phone, so the waveform draws from
 * this unless it's zoomed right in. The session builds it while recording (`DetailBuilder`);
 * `takeDetail` works it out from a finished take.
 */
export type Detail = { bucketSec: number; min: Float32Array; max: Float32Array };

const PER_SECOND = 500;

export class DetailBuilder {
  private readonly size: number;
  private readonly sr: number;
  private mins: number[] = [];
  private maxs: number[] = [];
  private lo = 0;
  private hi = 0;
  private n = 0;

  constructor(sr: number) {
    this.sr = sr;
    this.size = Math.max(1, Math.round(sr / PER_SECOND));
  }

  add(samples: Float32Array) {
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      if (v < this.lo) this.lo = v;
      if (v > this.hi) this.hi = v;
      if (++this.n === this.size) {
        this.mins.push(this.lo);
        this.maxs.push(this.hi);
        this.lo = 0;
        this.hi = 0;
        this.n = 0;
      }
    }
  }

  finish(): Detail {
    const mins = this.n > 0 ? [...this.mins, this.lo] : this.mins;
    const maxs = this.n > 0 ? [...this.maxs, this.hi] : this.maxs;
    return { bucketSec: this.size / this.sr, min: Float32Array.from(mins), max: Float32Array.from(maxs) };
  }
}

export function takeDetail(take: Take): Detail {
  const b = new DetailBuilder(take.sr);
  b.add(take.samples);
  return b.finish();
}

/** The whole-take strip (`Analysis.overview`'s 1200 min/max pairs) from the detail, to the
    nearest 2 ms. */
export function overviewFromDetail(detail: Detail, duration: number, columns = 1200): Float32Array {
  const out = new Float32Array(columns * 2);
  const span = Math.max(1e-6, duration);
  const n = detail.min.length;
  for (let c = 0; c < columns; c++) {
    const a = Math.min(n, Math.max(0, Math.floor((span * c) / columns / detail.bucketSec)));
    const b = Math.min(n, Math.max(a + 1, Math.ceil((span * (c + 1)) / columns / detail.bucketSec)));
    let lo = 0;
    let hi = 0;
    for (let i = a; i < b; i++) {
      if (detail.min[i] < lo) lo = detail.min[i];
      if (detail.max[i] > hi) hi = detail.max[i];
    }
    out[c * 2] = lo;
    out[c * 2 + 1] = hi;
  }
  return out;
}
