import {
  emptyMeasure,
  KEY_NAMES,
  measureCapacity,
  noteTicks,
  TICKS_PER_QUARTER,
  type Cursor,
  type TNote,
  type Transcription,
} from "./bassTranscription";

// The notation editor's helpers that aren't single-note edits (those are in `bassTranscription.ts`):
// re-barring for a new time signature, beats under the cursor, and the time and key choices. Shared
// by the website's `components/notation/ScoreEditor.tsx` and the phone's.

/** The time signatures the editor offers. */
export const TIME_SIGNATURES = ["4/4", "3/4", "2/4", "2/2", "5/4", "6/4", "6/8", "9/8", "12/8", "7/8", "5/8"];

const pretty = (name: string) => name.replace("b", "♭").replace("#", "♯");

/** Every key signature as "G major · E minor", fewest accidentals first (sharps before flats). */
export const KEY_OPTIONS: { value: number; label: string }[] = Object.entries(KEY_NAMES)
  .map(([k, n]) => ({ value: Number(k), label: `${pretty(n.major)} major · ${pretty(n.minor)} minor` }))
  .sort((x, y) => Math.abs(x.value) - Math.abs(y.value) || y.value - x.value);

/** "G major" for a key signature (sharps positive, flats negative). */
export function keyLabel(key: number | undefined): string {
  return `${pretty(KEY_NAMES[key ?? 0]?.major ?? "C")} major`;
}

/** Re-bars a score for a new time signature, keeping every note and chord where it falls in time.
    Null when a note would cross the new bar lines (it would have to be split). */
export function rebar(t: Transcription, top: number, bottom: number): Transcription | null {
  const oldCap = measureCapacity(t);
  const cap = measureCapacity({ timeSignature: { top, bottom } });
  const notes: { at: number; note: TNote }[] = [];
  const chords: { at: number; symbol: string }[] = [];
  let end = 0;
  t.measures.forEach((m, mi) => {
    let at = mi * oldCap;
    for (const n of m.notes) {
      notes.push({ at, note: n });
      at += noteTicks(n);
    }
    for (const c of m.chords) chords.push({ at: mi * oldCap + c.beat * TICKS_PER_QUARTER, symbol: c.symbol });
    end = Math.max(end, at);
  });
  const count = Math.max(1, Math.ceil(Math.max(end, t.measures.length * oldCap) / cap));
  const measures = Array.from({ length: count }, () => emptyMeasure());
  // A gap (from a short old bar) becomes rests only where a note follows; trailing space stays empty.
  const filled = new Array<number>(count).fill(0);
  for (const { at, note } of notes) {
    const mi = Math.floor(at / cap);
    const len = noteTicks(note);
    if (at - mi * cap + len > cap + 0.001) return null;
    if (at - mi * cap > filled[mi] + 0.001) return null;
    measures[mi].notes.push(note);
    filled[mi] += len;
  }
  for (const c of chords) {
    const mi = Math.min(count - 1, Math.floor(c.at / cap));
    measures[mi].chords.push({ beat: (c.at - mi * cap) / TICKS_PER_QUARTER, symbol: c.symbol });
  }
  return { ...t, timeSignature: { top, bottom }, measures };
}

/** The beat (in quarters from the bar line) the note at `c` starts on. */
export function startBeat(t: Transcription, c: Cursor): number {
  const notes = t.measures[c.measure]?.notes ?? [];
  return notes.slice(0, Math.max(0, c.note)).reduce((s, n) => s + noteTicks(n), 0) / TICKS_PER_QUARTER;
}

/** The note starting at `beat` in bar `measure` (or -1 if none does). */
export function noteIndexAtBeat(t: Transcription, measure: number, beat: number): number {
  let at = 0;
  const notes = t.measures[measure]?.notes ?? [];
  for (let i = 0; i < notes.length; i++) {
    if (Math.abs(at / TICKS_PER_QUARTER - beat) < 1e-6) return i;
    at += noteTicks(notes[i]);
  }
  return -1;
}

/** 2, 2.5, 2.67 — beats as a short number. */
export function formatBeats(beats: number) {
  return Number.isInteger(beats) ? String(beats) : String(Math.round(beats * 100) / 100);
}

/** The cursor kept inside the score (after an undo made it shorter). */
export function clampCursor(t: Transcription, c: Cursor): Cursor {
  const measure = Math.min(c.measure, t.measures.length - 1);
  const note = Math.min(c.note, t.measures[measure].notes.length - 1);
  return { measure, note };
}
