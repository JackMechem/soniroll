import { useRef } from "react";
import type { BeatLevel } from "@/lib/clickEngine";
import { MAX_BEATS } from "@/lib/meters";

// Shared tempo/meter logic for the Metronome and Polyrhythm Metric Modulation Metronome
// tools, so both get the same feel (log-scaled tempo slider, note-value-only beat unit, accent
// grouping) for free.

export const MIN_BPM = 20;
export const MAX_BPM = 900;

// The tempo slider is log-scaled: typical tempos (60-200 BPM) get roughly a third of the
// slider's length instead of being squeezed into a sliver of a 20-900 linear range.
export const SLIDER_STEPS = 1000;
export function sliderFromBpm(value: number) {
  const ratio = Math.log(value / MIN_BPM) / Math.log(MAX_BPM / MIN_BPM);
  return Math.round(Math.min(1, Math.max(0, ratio)) * SLIDER_STEPS);
}
export function bpmFromSlider(pos: number) {
  return MIN_BPM * Math.pow(MAX_BPM / MIN_BPM, pos / SLIDER_STEPS);
}
export function clampBpm(n: number) {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));
}

/** Same range clamp, without rounding to a whole number — for chained math (like a run of
    metric modulations) where rounding each step to a display-friendly integer would compound
    into real, audible error over several steps. Round only when showing the result. */
export function clampBpmRange(n: number) {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, n));
}

/** Splits a (possibly fractional) tempo into a whole number and a tenths digit for display —
    e.g. 145.5 -> { whole: 145, tenths: 5 }, or 146 -> { whole: 146, tenths: null }. */
export function splitTenths(value: number): {
  whole: number;
  tenths: number | null;
} {
  const rounded = Math.round(value * 10) / 10;
  const whole = Math.trunc(rounded);
  const tenths = Math.round((rounded - whole) * 10);
  return { whole, tenths: tenths === 0 ? null : tenths };
}

// A beat unit has to be an actual note value (you can't have a "beat unit of 3").
export const NOTE_VALUES: number[] = [1, 2, 4, 8, 16, 32, 64];

export const NOTE_VALUE_NAMES: Record<number, string> = {
  1: "Whole note",
  2: "Half note",
  4: "Quarter note",
  8: "Eighth note",
  16: "Sixteenth note",
  32: "32nd note",
  64: "64th note",
};

/** Converts a tempo expressed as "`fromNoteValue` = `bpm`" into the equivalent tempo for
    `toNoteValue` — e.g. a quarter note at 120 BPM is the same underlying pulse as an eighth note
    at 240 BPM (an eighth note is half as long, so twice as many fit in the same minute). Lets a
    metronome's tempo number refer to a different note value than the meter's own beat unit —
    `lib/clickEngine.ts`'s `ClickSettings.bpm` has no concept of note values itself, it's always
    just "clicks per minute" for whatever the engine is currently counting as one beat. */
export function convertTempo(bpm: number, fromNoteValue: number, toNoteValue: number): number {
  return (bpm * toNoteValue) / fromNoteValue;
}

/** Rounds to the nearest note value, comparing on a log scale since the values are powers of two. */
export function nearestNoteValue(n: number): number {
  const clamped = Math.min(64, Math.max(1, n));
  return NOTE_VALUES.reduce((best, value) =>
    Math.abs(Math.log2(value) - Math.log2(clamped)) <
    Math.abs(Math.log2(best) - Math.log2(clamped))
      ? value
      : best,
  );
}

/** Clicking a beat steps it down a level: accent → normal → soft → muted → accent. */
export const NEXT_LEVEL: Record<BeatLevel, BeatLevel> = { 2: 1, 1: 3, 3: 0, 0: 2 };

export function defaultAccents(
  beats: number,
  previous: BeatLevel[] = [],
): BeatLevel[] {
  return Array.from(
    { length: beats },
    (_, i) => previous[i] ?? (i === 0 ? 2 : 1),
  );
}

/** One accent level per *subdivision* click within a beat, flattened beat-major
    (`beat * (subdivision - 1) + subIndex`) — the same shape/order `lib/clickEngine.ts`'s
    `ClickSettings.subAccents` and `BeatIndicator`'s dots both use. Defaults every slot to
    "normal" (`1`), the one level every subdivision click always played at before this existed. */
export function defaultSubAccents(
  beatsPerBar: number,
  subdivision: number,
  previous: BeatLevel[] = [],
): BeatLevel[] {
  const slots = Math.max(0, Math.round(subdivision) - 1);
  return Array.from(
    { length: beatsPerBar * slots },
    (_, i): BeatLevel => previous[i] ?? 1,
  );
}

export function accentsFromGroups(groups: number[]): BeatLevel[] {
  return groups.flatMap((size) =>
    Array.from({ length: size }, (_, i): BeatLevel => (i === 0 ? 2 : 1)),
  );
}

/** Lengths of the runs that each start on an accented beat, e.g. accents on 1, 4, 6 of 7 -> [3, 2, 2]. */
export function groupsFromAccents(accents: BeatLevel[]): number[] {
  const starts = accents.flatMap((level, i) => (level === 2 ? [i] : []));
  if (starts.length === 0) return [];
  if (starts[0] !== 0) starts.unshift(0);
  return starts.map((start, i) => (starts[i + 1] ?? accents.length) - start);
}

export function parseGroups(text: string): number[] | null {
  if (!/^\s*\d+(?:\s*[+,\s]\s*\d+)*\s*$/.test(text)) return null;
  const groups = text
    .split(/[^\d]+/)
    .filter(Boolean)
    .map(Number);
  const total = groups.reduce((a, b) => a + b, 0);
  return groups.every((g) => g >= 1) && total >= 1 && total <= MAX_BEATS
    ? groups
    : null;
}

export const SUBDIVISIONS = [
  { value: 1, label: "Quarter notes (no subdivision)" },
  { value: 2, label: "Eighth notes" },
  { value: 3, label: "Eighth-note triplets" },
  { value: 4, label: "Sixteenth notes" },
  { value: 5, label: "Sixteenth-note quintuplets" },
  { value: 6, label: "Sixteenth-note sextuplets" },
];

const TAP_RESET_MS = 2000;
const TAP_HISTORY = 5;

/** A "Tap tempo" button's logic: averages the last few taps into a BPM. */
export function useTapTempo(setBpm: (bpm: number) => void) {
  const tapsRef = useRef<number[]>([]);
  return function tap() {
    const now = performance.now();
    const taps = tapsRef.current;
    if (taps.length && now - taps[taps.length - 1] > TAP_RESET_MS)
      taps.length = 0;
    taps.push(now);
    if (taps.length > TAP_HISTORY + 1) taps.shift();
    if (taps.length < 2) return;
    const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    setBpm(60000 / avg);
  };
}
