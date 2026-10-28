/**
 * Grades a recorded take: builds the grid of where every note should have landed (from the
 * clicks that actually played), matches each detected stroke to its nearest grid point, and
 * summarises how far off they were.
 *
 * All times are seconds on the recording's own timeline (sample index / sample rate). A grid
 * point is where its click *arrived* at the mic, the click's playback time plus the calibrated
 * round-trip latency, so a stroke dead on the click scores 0 ms.
 */

import { DEFAULT_DETECTOR, detectAll, type DetectorConfig } from "./onset";

export type TakeClick = {
  /** When it played, on the recording timeline (before latency). */
  pos: number;
  beat: number;
  sub: number;
  /** 0 = muted; anything else played. */
  level: number;
  bar: number;
  /** Seconds per beat. */
  beatLen: number;
};

export type Take = {
  samples: Float32Array;
  sr: number;
  clicks: TakeClick[];
  countInBars: number;
};

export type AnalysisParams = {
  latencyMs: number;
  /** Notes per beat you're playing; 0 = work it out beat by beat from what you played. */
  notesPerBeat: number;
  toleranceMs: number;
  sensitivity: number;
  /** Ignore "strokes" that are really the click bleeding into the mic (measured from the count-in). */
  rejectBleed: boolean;
};

export function detectorFor(p: Pick<AnalysisParams, "sensitivity">): DetectorConfig {
  return { ...DEFAULT_DETECTOR, sensitivity: p.sensitivity };
}

/** `n` is the notes per beat of the grid at that beat. */
export type GridPoint = { t: number; bar: number; beat: number; pos: number; n: number; hit: boolean };

/** "on" (graded), "extra" (a second stroke on an already-hit grid point), "countIn", "outside". */
export type HitKind = "on" | "extra" | "countIn" | "outside";

export type Hit = {
  t: number;
  gridT: number;
  /** Positive = late (dragging), negative = early (rushing). */
  errorMs: number;
  peakDb: number;
  bar: number;
  beat: number;
  pos: number;
  n: number;
  kind: HitKind;
};

export type Stats = {
  hits: number;
  missed: number;
  extra: number;
  meanMs: number;
  medianMs: number;
  stdMs: number;
  meanAbsMs: number;
  maxEarlyMs: number;
  maxLateMs: number;
  onCount: number;
  earlyCount: number;
  lateCount: number;
  withinPct: number;
  score: number;
  /** Your tempo / the click's (from a straight-line fit of strokes to the grid). */
  tempoRatio: number | null;
};

export type GroupStat = { label: string; t: number; meanMs: number; stdMs: number; count: number; withinPct: number };

export type Analysis = {
  duration: number;
  /** The grid's notes per beat, or 0 when it changes from beat to beat. */
  notesPerBeat: number;
  /** Whether the grid was worked out from what you played. */
  autoDetected: boolean;
  /** Strokes ignored as the click leaking into the mic. */
  bleedIgnored: number;
  toleranceMs: number;
  countInEnd: number;
  grid: GridPoint[];
  hits: Hit[];
  stats: Stats;
  byPosition: GroupStat[];
  byBar: GroupStat[];
  /** min/max pairs across the whole take, for the overview strip. */
  overview: Float32Array;
};

function gcd(a: number, b: number): number {
  return b === 0 ? Math.max(1, a) : gcd(b, a % b);
}

/** The counting syllable for note `pos` of `n` in a beat ("1 e & a", "1 trip let"); the same
    spot gets the same name whatever the subdivision, so 8ths' "&" and 16ths' "&" group together. */
export function positionLabel(pos: number, n: number): string {
  const d = Math.max(1, n);
  if ((pos * 24) % d !== 0) return `${pos}/${n}`;
  switch ((pos * 24) / d) {
    case 0:
      return "1";
    case 6:
      return "e";
    case 8:
      return "trip";
    case 12:
      return "&";
    case 16:
      return "let";
    case 18:
      return "a";
    default: {
      const g = gcd(pos, n);
      return `${pos / g}/${n / g}`;
    }
  }
}

/** Subdivisions auto-detect chooses between (notes per beat). */
export const AUTO_SUBDIVISIONS = [1, 2, 3, 4, 6, 8];
/** A stroke within this fraction of a beat of a downbeat is that downbeat. */
export const DOWNBEAT_CAPTURE = 1 / 6;
/** Cost (in beats) of changing subdivision from one beat to the next, so one sloppy stroke
    doesn't turn a bar of quarters into 16ths. */
export const SWITCH_COST = 0.1;

/**
 * How badly `n` notes per beat explains one beat's strokes, in beats: each stroke's distance to
 * its nearest note, plus a penalty for each note left unplayed and each stroke that has to share
 * a note. `xs` are the strokes between the downbeats as fractions of the beat (0 = this beat's
 * downbeat, 1 = the next one's); `free0`/`free1` say whether those downbeats have no stroke of
 * their own, in which case a stroke can count as a sloppy downbeat. Only notes before `upto`
 * count as unplayed.
 */
export function beatCost(xs: number[], n: number, free0: boolean, free1: boolean, upto: number): number {
  const MISSED = 0.07;
  const EXTRA = 0.25;
  // [position, whether leaving it unplayed counts]
  const points: [number, boolean][] = [];
  for (let j = 1; j < n; j++) points.push([j / n, true]);
  if (free0) points.push([0, false]);
  if (free1) points.push([1, false]);
  const best: (number | null)[] = points.map(() => null);
  let cost = 0;
  for (const x of xs) {
    if (points.length === 0) {
      cost += EXTRA;
      continue;
    }
    let i = 0;
    let e = Infinity;
    points.forEach((p, k) => {
      const d = Math.abs(x - p[0]);
      if (d < e) {
        e = d;
        i = k;
      }
    });
    const b = best[i];
    if (b !== null) {
      cost += EXTRA;
      best[i] = Math.min(b, e);
    } else {
      best[i] = e;
    }
  }
  for (const b of best) if (b !== null) cost += b;
  points.forEach((p, k) => {
    if (p[1] && best[k] === null && p[0] < upto) cost += MISSED;
  });
  return cost;
}

/** Index of the first element of sorted `xs` that is >= `v`. */
function lowerBound(xs: number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Notes per beat for each beat (`[downbeat time, beat length]`), from the strokes (sorted
    times): the subdivision that best explains each beat, preferring to stay the same from one
    beat to the next. */
function detectSubdivisions(beats: [number, number][], strokes: number[]): number[] {
  const inRange = (a: number, b: number) => strokes.slice(lowerBound(strokes, a), lowerBound(strokes, b));
  const captured = beats.map(([t, len]) => inRange(t - len * DOWNBEAT_CAPTURE, t + len * DOWNBEAT_CAPTURE).length > 0);
  const costs = beats.map(([t, len], k) => {
    const xs = inRange(t + len * DOWNBEAT_CAPTURE, t + len * (1 - DOWNBEAT_CAPTURE)).map((s) => (s - t) / len);
    const free1 = !(captured[k + 1] ?? false);
    return AUTO_SUBDIVISIONS.map((n) => beatCost(xs, n, !captured[k], free1, Infinity));
  });

  // Cheapest path through the beats (Viterbi), with a toll for each change of subdivision.
  const m = AUTO_SUBDIVISIONS.length;
  if (costs.length === 0) return [];
  let total = [...costs[0]];
  const from: number[][] = [];
  for (const c of costs.slice(1)) {
    const next = new Array<number>(m);
    const back = new Array<number>(m);
    for (let j = 0; j < m; j++) {
      let bi = 0;
      let bv = Infinity;
      for (let i = 0; i < m; i++) {
        const v = total[i] + (i === j ? 0 : SWITCH_COST);
        if (v < bv) {
          bv = v;
          bi = i;
        }
      }
      next[j] = bv + c[j];
      back[j] = bi;
    }
    total = next;
    from.push(back);
  }
  let j = 0;
  for (let k = 1; k < m; k++) if (total[k] < total[j]) j = k;
  const path = [j];
  for (let k = from.length - 1; k >= 0; k--) {
    j = from[k][j];
    path.push(j);
  }
  path.reverse();
  return path.map((k) => AUTO_SUBDIVISIONS[k]);
}

/** How loud the click itself is at the mic, and where it lands relative to latency, measured
    from the count-in while you're not playing yet. Null when the click doesn't reach the mic
    (headphones) or there's no count-in to listen to. */
function clickBleed(take: Take, onsets: [number, number][], lat: number, countInEnd: number): [number, number] | null {
  const arrivals = take.clicks.filter((c) => c.level > 0).map((c) => c.pos + lat).filter((t) => t < countInEnd);
  if (arrivals.length < 2) return null;
  const found: [number, number][] = [];
  for (const a of arrivals) {
    let best: [number, number] | null = null;
    for (const o of onsets) {
      if (Math.abs(o[0] - a) < 0.03 && (!best || Math.abs(o[0] - a) < Math.abs(best[0] - a))) best = o;
    }
    if (best) found.push([best[0] - a, best[1]]);
  }
  if (found.length * 4 < arrivals.length * 3) return null;
  const offsets = found.map((f) => f[0]);
  const offset = median(offsets);
  // The click lands with machine precision; a drummer tapping along doesn't.
  if (median(offsets.map((o) => Math.abs(o - offset))) > 0.002) return null;
  return [Math.max(0, ...found.map((f) => f[1])), offset];
}

/** min/max pairs for `columns` columns of `samples` between `start` and `end` seconds. */
export function peaks(samples: Float32Array, sr: number, start: number, end: number, columns: number): Float32Array {
  const out = new Float32Array(columns * 2);
  const span = Math.max(1e-6, end - start);
  for (let c = 0; c < columns; c++) {
    const a = Math.min(Math.max(0, Math.floor((start + (span * c) / columns) * sr)), samples.length);
    const b = Math.min(Math.max(0, Math.max(Math.ceil((start + (span * (c + 1)) / columns) * sr), a + 1)), samples.length);
    let lo = 0;
    let hi = 0;
    for (let i = a; i < b; i++) {
      const v = samples[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out[c * 2] = lo;
    out[c * 2 + 1] = hi;
  }
  return out;
}

function mean(v: number[]): number {
  return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
}

function std(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length);
}

function median(v: number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
}

function group(label: string, t: number, errors: number[], tol: number): GroupStat {
  return {
    label,
    t,
    meanMs: mean(errors),
    stdMs: std(errors),
    count: errors.length,
    withinPct: errors.length === 0 ? 0 : (100 * errors.filter((e) => Math.abs(e) <= tol).length) / errors.length,
  };
}

function toDb(v: number): number {
  return 20 * Math.log10(Math.max(v, 1e-6));
}

export function analyze(take: Take, p: AnalysisParams): Analysis {
  const lat = p.latencyMs / 1000;
  const duration = take.samples.length / take.sr;
  const tol = Math.max(1, p.toleranceMs);

  const beats = take.clicks.filter((c) => c.sub === 0 && c.bar >= take.countInBars);
  const auto = p.notesPerBeat === 0;
  const firstN = auto ? 1 : p.notesPerBeat;
  const countInEnd = beats.length > 0 ? beats[0].pos + lat - beats[0].beatLen * Math.min(0.5 / firstN, DOWNBEAT_CAPTURE) : duration;

  const onsets: [number, number][] = detectAll(take.samples, take.sr, detectorFor(p)).map((o) => [o.frame / take.sr, o.peak]);

  // Minus click bleed: an onset no louder than the click right where a click arrived is most
  // likely the click itself. (A stroke on the click adds to it, so it's louder.) If that would
  // throw out most of what you played, the measurement is wrong, so nothing is thrown out.
  const bleed = p.rejectBleed ? clickBleed(take, onsets, lat, countInEnd) : null;
  const playedClicks = take.clicks.filter((c) => c.level > 0);
  const bleedFlags = onsets.map(([t, peak]) => {
    if (!bleed) return false;
    const [level, offset] = bleed;
    return peak < level * 1.5 && playedClicks.some((c) => Math.abs(c.pos + lat + offset - t) < 0.008);
  });
  const gradedOnsets = onsets.filter((o) => o[0] >= countInEnd).length;
  const gradedBleed = onsets.filter((o, i) => bleedFlags[i] && o[0] >= countInEnd).length;
  const reject = gradedBleed * 2 <= gradedOnsets;
  const strokes = onsets.filter((_, i) => !(reject && bleedFlags[i]));
  const bleedIgnored = onsets.length - strokes.length;

  // The grid: every note you should have played, at the subdivision you're playing.
  const notes = auto
    ? detectSubdivisions(
        beats.map((b) => [b.pos + lat, b.beatLen]),
        strokes.map((s) => s[0]),
      )
    : beats.map(() => p.notesPerBeat);
  const grid: GridPoint[] = [];
  beats.forEach((b, k) => {
    const n = notes[k];
    for (let j = 0; j < n; j++) {
      const t = b.pos + lat + (j * b.beatLen) / n;
      if (t <= duration) grid.push({ t, bar: b.bar - take.countInBars + 1, beat: b.beat, pos: j, n, hit: false });
    }
  });
  const last = beats[beats.length - 1];
  const gridEnd = Math.min(last ? last.pos + lat + last.beatLen * (1 - DOWNBEAT_CAPTURE) : 0, duration);
  const gridTimes = grid.map((g) => g.t);

  // Nearest grid point for each stroke; the closest stroke to a point is graded, any others extra.
  const hits: Hit[] = [];
  const best: (number | null)[] = grid.map(() => null);
  for (const [t, peak] of strokes) {
    const h: Hit = { t, gridT: t, errorMs: 0, peakDb: toDb(peak), bar: 0, beat: 0, pos: 0, n: 1, kind: "outside" };
    if (t < countInEnd) {
      h.kind = "countIn";
    } else if (t <= gridEnd && grid.length > 0) {
      const i = lowerBound(gridTimes, t);
      const gi = i === 0 ? 0 : i >= grid.length || t - grid[i - 1].t < grid[i].t - t ? i - 1 : i;
      const g = grid[gi];
      h.gridT = g.t;
      h.errorMs = (t - g.t) * 1000;
      h.bar = g.bar;
      h.beat = g.beat;
      h.pos = g.pos;
      h.n = g.n;
      h.kind = "extra";
      const prev = best[gi];
      if (prev === null || Math.abs(hits[prev].errorMs) > Math.abs(h.errorMs)) {
        if (prev !== null) hits[prev].kind = "extra";
        best[gi] = hits.length;
        h.kind = "on";
      }
    }
    hits.push(h);
  }
  grid.forEach((g, i) => (g.hit = best[i] !== null));

  const on = hits.filter((h) => h.kind === "on");
  const errors = on.map((h) => h.errorMs);
  const credit = errors.reduce((sum, e) => sum + (Math.abs(e) <= tol ? 1 : Math.max(0, 1 - (Math.abs(e) - tol) / (2 * tol))), 0);
  let tempoRatio: number | null = null;
  if (on.length >= 8) {
    const xs = on.map((h) => h.gridT);
    const ys = on.map((h) => h.t);
    const mx = mean(xs);
    const my = mean(ys);
    const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const v = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    tempoRatio = v > 0 && cov > 0 ? v / cov : 1;
  }

  const within = errors.filter((e) => Math.abs(e) <= tol).length;
  const stats: Stats = {
    hits: on.length,
    missed: best.filter((b) => b === null).length,
    extra: hits.filter((h) => h.kind === "extra").length,
    meanMs: mean(errors),
    medianMs: median(errors),
    stdMs: std(errors),
    meanAbsMs: mean(errors.map(Math.abs)),
    // (Not Math.min(...errors): a long take can have more strokes than a call takes arguments.)
    maxEarlyMs: errors.reduce((a, e) => Math.min(a, e), 0),
    maxLateMs: errors.reduce((a, e) => Math.max(a, e), 0),
    onCount: within,
    earlyCount: errors.filter((e) => e < -tol).length,
    lateCount: errors.filter((e) => e > tol).length,
    withinPct: errors.length === 0 ? 0 : (100 * within) / errors.length,
    score: errors.length === 0 ? 0 : (100 * credit) / errors.length,
    tempoRatio,
  };

  // By spot in the beat, in order: "1", "e", "trip", "&", …
  const spots = new Map<number, [number, number]>();
  for (const h of on) {
    const g = gcd(h.pos, h.n);
    spots.set(h.pos / h.n, [h.pos / g, h.n / g]);
  }
  const byPosition = [...spots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, [num, den]]) =>
      group(
        positionLabel(num, den),
        0,
        on.filter((h) => h.pos * den === num * h.n).map((h) => h.errorMs),
        tol,
      ),
    );

  const bars = grid.length > 0 ? grid[grid.length - 1].bar : 0;
  const byBar: GroupStat[] = [];
  for (let b = 1; b <= bars; b++) {
    const t = grid.find((g) => g.bar === b)?.t ?? 0;
    byBar.push(group(String(b), t, on.filter((h) => h.bar === b).map((h) => h.errorMs), tol));
  }

  const uniform = notes.length === 0 ? firstN : notes.some((m) => m !== notes[0]) ? 0 : notes[0];
  return {
    duration,
    notesPerBeat: uniform,
    autoDetected: auto,
    bleedIgnored,
    toleranceMs: tol,
    countInEnd,
    overview: peaks(take.samples, take.sr, 0, duration, 1200),
    grid,
    hits,
    stats,
    byPosition,
    byBar,
  };
}

export type Calibration = {
  ok: boolean;
  latencyMs: number;
  spreadMs: number;
  matched: number;
  total: number;
  clickLevel: number;
  message: string;
};

/** Works out the round-trip latency from a take of the metronome playing into the mic with
    nobody playing: the typical gap between each click playing and the mic hearing it. */
export function calibrate(take: Take): Calibration {
  const played = take.clicks.filter((c) => c.level > 0);
  const total = played.length;
  const fail = (message: string, matched = 0): Calibration => ({ ok: false, latencyMs: 0, spreadMs: 0, matched, total, clickLevel: 0, message });

  // How loud the clicks are at the mic: the median of the peak in each click's listening
  // window. A median, so one loud noise in the room can't set the trigger level.
  const windowPeak = (c: TakeClick) => {
    const a = Math.floor(Math.max(0, c.pos - 0.02) * take.sr);
    const b = Math.min(Math.floor((c.pos + 0.25) * take.sr), take.samples.length);
    let m = 0;
    for (let i = a; i < b; i++) m = Math.max(m, Math.abs(take.samples[i]));
    return m;
  };
  const typical = median(played.map(windowPeak));
  if (typical < 0.003) return fail("The mic didn't pick anything up. Check the input and that it isn't muted.");
  const cfg: DetectorConfig = { ...DEFAULT_DETECTOR, absThreshold: typical * 0.3, minGapSec: 0.1 };
  const times = detectAll(take.samples, take.sr, cfg).map((o) => [o.frame / take.sr, o.peak] as const);

  const deltas: number[] = [];
  const levels: number[] = [];
  for (const c of played) {
    // The click can only be heard after it plays, and within a quarter second of it.
    const hit = times.find(([t]) => t >= c.pos - 0.02 && t <= c.pos + 0.25);
    if (hit) {
      deltas.push((hit[0] - c.pos) * 1000);
      levels.push(hit[1]);
    }
  }
  if (deltas.length < Math.max(total, 2) / 2) {
    return fail(
      "Couldn't hear the clicks clearly. Play the click through speakers (or hold your headphones up to the mic), turn it up, and stay quiet while it runs.",
      deltas.length,
    );
  }
  const lat = median(deltas);
  const spread = median(deltas.map((d) => Math.abs(d - lat)));
  const ok = spread < 5;
  return {
    ok,
    latencyMs: lat,
    spreadMs: spread,
    matched: deltas.length,
    total,
    clickLevel: median(levels),
    message: ok
      ? `Measured ${lat.toFixed(1)} ms from ${deltas.length} clicks.`
      : `Measured ${lat.toFixed(1)} ms, but it varied by ±${spread.toFixed(1)} ms. Try again somewhere quieter.`,
  };
}

/**
 * Live feedback while recording: how far a stroke at `t` (on the click's clock, latency already
 * removed) is from the nearest note. `downbeats` are the graded beats heard so far (time, beat
 * length). With `notes` 0 the subdivision is worked out from the strokes so far in this beat.
 * The final analysis recomputes all of this precisely.
 */
export class LiveGrader {
  private strokes: number[] = [];
  private lastN = 1;

  reset() {
    this.strokes = [];
    this.lastN = 1;
  }

  grade(t: number, first: { time: number; len: number }, last: { time: number; len: number }, notes: number): number | null {
    const len = last.len;
    // Strokes in the count-in (before the first graded beat) aren't graded.
    if (t < first.time - len * DOWNBEAT_CAPTURE) return null;
    this.strokes.push(t);
    // The beat this stroke is in (an early downbeat counts as the next beat), extrapolated if
    // its click hasn't been heard yet.
    const downbeat = last.time + Math.floor((t - last.time) / len + DOWNBEAT_CAPTURE) * len;
    const x = (t - downbeat) / len;
    let n = notes;
    if (n <= 0) {
      const xs = this.strokes.map((s) => (s - downbeat) / len).filter((v) => v >= -DOWNBEAT_CAPTURE);
      const onDownbeat = xs.some((v) => Math.abs(v) <= DOWNBEAT_CAPTURE);
      const inner = xs.filter((v) => v > DOWNBEAT_CAPTURE);
      const prev = this.lastN;
      const cost = (k: number) => beatCost(inner, k, !onDownbeat, true, x) + (k === prev ? 0 : SWITCH_COST);
      n = AUTO_SUBDIVISIONS.reduce((a, b) => (cost(b) < cost(a) ? b : a));
      this.lastN = n;
    }
    if (this.strokes.length > 64) this.strokes.splice(0, 32);
    let bestMs = Infinity;
    for (let j = 0; j <= n; j++) {
      const ms = (x - j / n) * len * 1000;
      if (Math.abs(ms) < Math.abs(bestMs)) bestMs = ms;
    }
    return bestMs;
  }
}
