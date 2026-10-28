/**
 * Ported from `apps/web/lib/meterControls.ts` — tempo/meter math shared by the Metronome tool
 * (and, on web, the Polyrhythm Metric Modulation Metronome). Pure logic plus one hook
 * (`useTapTempo`, plain `useState`/`Date.now()` — no DOM dependency, works identically on native).
 */
import { useCallback, useRef } from "react";
import type { BeatLevel } from "./clickSounds";

export const MIN_BPM = 20;
export const MAX_BPM = 900;

/** A log-scaled slider position <-> BPM mapping, so the low end of the range (where small BPM
    differences matter far more musically) gets proportionally more of the slider's own travel. */
const SLIDER_STEPS = 1000;

export function sliderFromBpm(value: number): number {
  const clamped = clampBpmRange(value);
  const ratio = Math.log(clamped / MIN_BPM) / Math.log(MAX_BPM / MIN_BPM);
  return Math.round(ratio * SLIDER_STEPS);
}

export function bpmFromSlider(pos: number): number {
  const ratio = pos / SLIDER_STEPS;
  return MIN_BPM * Math.pow(MAX_BPM / MIN_BPM, ratio);
}

/** Clamp + round to the nearest whole BPM — what's actually stored/displayed most of the time. */
export function clampBpm(n: number): number {
  return Math.round(clampBpmRange(n));
}

/** Clamp without rounding — for chaining through more math (e.g. `convertTempo`) before a final
    `clampBpm`/`Math.round` at the edge. */
export function clampBpmRange(n: number): number {
  if (!Number.isFinite(n)) return MIN_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, n));
}

/** Splits a possibly-fractional BPM into its whole part and one decimal digit, for display
    (e.g. a tap-tempo average that lands on 121.4). */
export function splitTenths(value: number): { whole: number; tenths: number } {
  const rounded = Math.round(value * 10) / 10;
  const whole = Math.trunc(rounded);
  const tenths = Math.round((rounded - whole) * 10);
  return { whole, tenths };
}

export const NOTE_VALUES = [1, 2, 4, 8, 16, 32, 64] as const;

export const NOTE_VALUE_NAMES: Record<number, string> = {
  1: "Whole note",
  2: "Half note",
  4: "Quarter note",
  8: "Eighth note",
  16: "16th note",
  32: "32nd note",
  64: "64th note",
};

export const SHORT_NOTE_NAME: Record<number, string> = {
  1: "Whole",
  2: "Half",
  4: "Quarter",
  8: "Eighth",
  16: "16th",
  32: "32nd",
  64: "64th",
};

/** `bpm` expressed in terms of `fromNoteValue` (e.g. quarter notes), converted to the equivalent
    rate in terms of `toNoteValue` (e.g. eighth notes) — a half-length note has twice as many fit
    in the same minute, so halving the note value doubles the resulting tempo. */
export function convertTempo(bpm: number, fromNoteValue: number, toNoteValue: number): number {
  return (bpm * toNoteValue) / fromNoteValue;
}

/** Snaps an arbitrary positive number to the nearest power-of-two note value, on a log2 scale (so
    "nearest" means nearest in perceived note-value terms, not nearest in raw integer distance —
    7 is "closer" to 8 than to 4 on this scale, matching how someone typing a beat unit expects
    rounding to behave). */
export function nearestNoteValue(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 4;
  const target = Math.log2(n);
  let best: number = NOTE_VALUES[0];
  let bestDist = Infinity;
  for (const v of NOTE_VALUES) {
    const dist = Math.abs(Math.log2(v) - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = v;
    }
  }
  return best;
}

/** Cycling order for clicking a beat/subdivision bar: accent -> normal -> muted -> accent. */
// The mobile app's cycle stays accent → normal → muted; a soft beat set on the website goes to muted.
export const NEXT_LEVEL: Record<BeatLevel, BeatLevel> = { 2: 1, 1: 0, 3: 0, 0: 2 };

/** Builds a `beats`-long accent array, defaulting beat 0 to accented and the rest to normal, but
    keeping whatever's already in `previous` at each index that still exists (so growing/shrinking
    the bar count doesn't discard accents you've already set on the beats that survive). */
export function defaultAccents(beats: number, previous: BeatLevel[] = []): BeatLevel[] {
  return Array.from({ length: beats }, (_, i) => previous[i] ?? (i === 0 ? 2 : 1));
}

/** Same idea for subdivision ticks — `beatsPerBar * max(0, round(subdivision) - 1)` entries,
    flattened beat-major, defaulting to level 1 (normal). */
export function defaultSubAccents(
  beatsPerBar: number,
  subdivision: number,
  previous: BeatLevel[] = [],
): BeatLevel[] {
  const dotCount = Math.max(0, Math.round(subdivision) - 1);
  const length = beatsPerBar * dotCount;
  return Array.from({ length }, (_, i) => previous[i] ?? 1);
}

/** Expands accent groupings (e.g. `[3, 2, 2]`, meaning "accent every 3rd then 2nd then 2nd beat")
    into a flat per-beat accent array — the first beat of each group is accented, the rest normal. */
export function accentsFromGroups(groups: number[]): BeatLevel[] {
  return groups.flatMap((size) => Array.from({ length: size }, (_, i) => (i === 0 ? 2 : 1)) as BeatLevel[]);
}

/** The inverse of `accentsFromGroups` — reads an accent array back out as run-lengths starting at
    each accented beat, for seeding a `GroupsField`'s own text input from the current accents. */
export function groupsFromAccents(accents: BeatLevel[]): number[] {
  const groups: number[] = [];
  for (const level of accents) {
    if (level === 2 || groups.length === 0) groups.push(1);
    else groups[groups.length - 1]++;
  }
  return groups;
}

/** Parses a "3+2+2"-style accent-grouping string. Returns `null` for anything that doesn't parse
    as a sum of positive integers, or whose total exceeds `maxBeats`. */
export function parseGroups(text: string, maxBeats: number): number[] | null {
  const parts = text.split("+").map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const groups = parts.map(Number);
  if (groups.some((n) => n <= 0)) return null;
  const total = groups.reduce((a, b) => a + b, 0);
  if (total === 0 || total > maxBeats) return null;
  return groups;
}

export type SubdivisionOption = { value: number; label: string };

export const SUBDIVISIONS: SubdivisionOption[] = [
  { value: 1, label: "None" },
  { value: 2, label: "8th notes" },
  { value: 3, label: "8th triplets" },
  { value: 4, label: "16th notes" },
  { value: 5, label: "16th quintuplets" },
  { value: 6, label: "16th sextuplets" },
];

const TAP_HISTORY = 5;
const TAP_RESET_MS = 2000;

/** A tap-tempo hook: each call to the returned `tap()` records `Date.now()`; once there are at
    least two taps close enough together (gap < `TAP_RESET_MS`), it averages the intervals between
    the last several taps and calls `setBpm` with the result. A gap longer than that resets the tap
    history, so an old, stale run of taps can't skew a fresh one. */
export function useTapTempo(setBpm: (bpm: number) => void): () => void {
  const tapsRef = useRef<number[]>([]);

  return useCallback(() => {
    const now = Date.now();
    const taps = tapsRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1] > TAP_RESET_MS) {
      taps.length = 0;
    }
    taps.push(now);
    if (taps.length > TAP_HISTORY + 1) taps.shift();
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((t, i) => t - taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avg > 0) setBpm(clampBpm(60000 / avg));
    }
  }, [setBpm]);
}
