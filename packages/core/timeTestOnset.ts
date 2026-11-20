/**
 * Finds stick strokes in the mic signal.
 *
 * A practice pad stroke is a sharp broadband transient, so this is a plain amplitude detector
 * rather than anything spectral: high-pass (to drop handling rumble and hum), trigger when the
 * level jumps over a threshold that sits above the room's noise floor, find the stroke's peak,
 * then walk back from the peak to where the attack actually started. Using the attack start
 * rather than the threshold crossing matters: a loud stroke crosses any fixed threshold earlier
 * in its attack than a soft one does, which would read as a timing difference that isn't there.
 */

export type DetectorConfig = {
  /** 0..1; higher catches softer strokes. */
  sensitivity: number;
  /** Strokes quieter than this (linear peak) are ignored. */
  minPeak: number;
  /** Shortest gap between two strokes, in seconds. */
  minGapSec: number;
  /** Overrides the sensitivity-derived threshold (used by calibration). */
  absThreshold: number | null;
};

export const DEFAULT_DETECTOR: DetectorConfig = { sensitivity: 0.6, minPeak: 0, minGapSec: 0.03, absThreshold: null };

/** The trigger level a sensitivity maps to: -14 dBFS at 0 down to -54 dBFS at 1. The Mic chip's
    level meter draws the same line. */
export function sensitivityThreshold(sensitivity: number): number {
  return 10 ** (-0.7 - 2 * Math.min(1, Math.max(0, sensitivity)));
}

export function sensitivityThresholdDb(sensitivity: number): number {
  return 20 * (-0.7 - 2 * Math.min(1, Math.max(0, sensitivity)));
}

/** `frame` is the absolute frame number; `peak` is linear. */
export type Onset = { frame: number; peak: number };

const RING = 1 << 14;
const MASK = RING - 1;

type State =
  | { kind: "idle" }
  /** Triggered; collecting the stroke's peak until `until`. */
  | { kind: "peak"; trigger: number; until: number }
  /** Just emitted a stroke; nothing new until `until` (the minimum gap). */
  | { kind: "hold"; until: number };

export class Detector {
  private readonly sr: number;
  private cfg: DetectorConfig;
  private frame: number;
  private readonly hpA: number;
  private hpX = 0;
  private hpY = 0;
  /** |high-passed signal|, indexed by frame & MASK. */
  private readonly ring = new Float32Array(RING);
  /** The peak-hold envelope, same indexing: what the level was a few ms ago. */
  private readonly envRing = new Float32Array(RING);
  private fast = 0;
  private readonly fastRel: number;
  private noise = 0;
  private readonly noiseK: number;
  private state: State = { kind: "idle" };

  /** `firstFrame` is the absolute frame number of the first sample it'll be fed. */
  constructor(sr: number, cfg: DetectorConfig, firstFrame = 0) {
    this.sr = sr;
    this.cfg = cfg;
    this.frame = firstFrame;
    const hpRc = 1 / (2 * Math.PI * 150);
    this.hpA = hpRc / (hpRc + 1 / sr);
    this.fastRel = Math.exp(-1 / (0.005 * sr));
    this.noiseK = 1 / (0.5 * sr);
  }

  setConfig(cfg: DetectorConfig) {
    this.cfg = cfg;
  }

  private ms(ms: number): number {
    return Math.max(1, Math.round(ms * 0.001 * this.sr));
  }

  private threshold(): number {
    const base = this.cfg.absThreshold ?? sensitivityThreshold(this.cfg.sensitivity);
    return Math.max(base, this.noise * 6, this.cfg.minPeak);
  }

  process(input: Float32Array, out: Onset[]) {
    const lookback = this.ms(3);
    for (let k = 0; k < input.length; k++) {
      const x = input[k];
      const y = this.hpA * (this.hpY + x - this.hpX);
      this.hpX = x;
      this.hpY = y;
      const a = Math.abs(y);
      const f = this.frame;
      this.ring[f & MASK] = a;
      this.fast = Math.max(a, this.fast * this.fastRel);
      this.envRing[f & MASK] = this.fast;
      // A stroke is a sudden jump: well over the threshold *and* well over the level a few ms
      // ago. The second part is what stops a loud stroke's decaying tail (which is still far
      // above the threshold) from counting as more strokes.
      const before = this.envRing[(f - lookback) & MASK];
      const th = this.threshold();
      const rising = a > th && a > before * 3;

      const st = this.state;
      if (st.kind === "idle") {
        if (rising) this.state = { kind: "peak", trigger: f, until: f + this.ms(8) };
        else if (a < th) this.noise += (a - this.noise) * this.noiseK;
      } else if (st.kind === "peak") {
        if (f >= st.until) {
          const onset = this.locate(st.trigger, f);
          out.push(onset);
          this.state = { kind: "hold", until: onset.frame + Math.floor(this.cfg.minGapSec * this.sr) };
        }
      } else if (f >= st.until) {
        this.state = rising ? { kind: "peak", trigger: f, until: f + this.ms(8) } : { kind: "idle" };
      }
      this.frame++;
    }
  }

  /** The stroke's peak in [trigger - 3 ms, end], then back from the peak to the start of the
      attack: the earliest sample over 15% of the peak before a 1 ms stretch of quiet. It never
      looks more than 4 ms before the trigger, so a stroke landing on the tail of another doesn't
      get dated back into that tail. */
  private locate(trigger: number, end: number): Onset {
    const start = Math.max(0, trigger - this.ms(3));
    let p = trigger;
    let peak = 0;
    for (let i = start; i <= end; i++) {
      const v = this.ring[i & MASK];
      if (v > peak) {
        peak = v;
        p = i;
      }
    }
    const onTh = Math.max(peak * 0.15, this.noise * 3);
    const quiet = this.ms(1);
    const limit = Math.max(0, p - this.ms(15), trigger - this.ms(4));
    let onset = p;
    let below = 0;
    let i = p;
    while (i > limit) {
      i--;
      if (this.ring[i & MASK] >= onTh) {
        onset = i;
        below = 0;
      } else if (++below >= quiet) {
        break;
      }
    }
    return { frame: onset, peak };
  }
}

/** Runs the detector over a whole recording (frames counted from 0). */
export function detectAll(samples: Float32Array, sr: number, cfg: DetectorConfig): Onset[] {
  const d = new Detector(sr, cfg, 0);
  const out: Onset[] = [];
  d.process(samples, out);
  // Flush a stroke that was still collecting its peak when the recording ended.
  d.process(new Float32Array(Math.floor(0.02 * sr)), out);
  return out.filter((o) => o.frame < samples.length);
}
