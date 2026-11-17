import { parseTypedChord } from "./typedProgression";

// Bass Genius transcriptions: bass lines written note for note (in Bass Genius's "Bass players"
// tab) and filed under the player they're from. Nothing reads them yet beyond the editor itself —
// the plan is for Bass Genius to later study a player's transcriptions (what they play over which
// chords, at which beat) and walk new changes in that style. So the format keeps exactly what that
// analysis will want, explicitly and unambiguously:
//
// - every note's *sounding* pitch as MIDI (`midi`) alongside its written spelling (`pitch`), so
//   analysis never has to re-derive pitch from notation and notation never loses the spelling;
// - durations as named note values plus dots/triplets (what was written), and `startTicks`/
//   `ticks` helpers to turn them into time;
// - chords as normalized iReal-style symbols ("D-7", "G7b9") at a beat position in each measure,
//   the same grammar the chord charts and the bass-line generator already read.
//
// It round-trips as plain JSON (`TranscriptionFile` / `PlayerFile`) for export and import.

export const TRANSCRIPTION_FORMAT = "sheddex.bass-transcription";
export const PLAYER_FORMAT = "sheddex.bass-player";
export const FORMAT_VERSION = 1;

/** Ticks per quarter note — divisible by 2, 3 and 4 so 16ths and triplets are whole numbers. */
export const TICKS_PER_QUARTER = 48;

export type NoteValue = "w" | "h" | "q" | "8" | "16";
export const NOTE_VALUES: NoteValue[] = ["w", "h", "q", "8", "16"];
const VALUE_TICKS: Record<NoteValue, number> = { w: 192, h: 96, q: 48, "8": 24, "16": 12 };
export const NOTE_VALUE_NAMES: Record<NoteValue, string> = { w: "Whole", h: "Half", q: "Quarter", "8": "Eighth", "16": "Sixteenth" };

export type Step = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export const STEPS: Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const STEP_PC: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A written pitch: letter, accidental (-1 flat … +1 sharp) and octave, as the bass sounds it
    (scientific pitch: the open E string is E1). Notation draws it an octave higher, as bass
    parts are written. */
export type Pitch = { step: Step; alter: -2 | -1 | 0 | 1 | 2; octave: number };

export type TNote = {
  id: string;
  /** Absent for a rest. */
  pitch?: Pitch;
  /** Sounding MIDI number (E1 = 28); absent for a rest. Always kept in sync with `pitch`. */
  midi?: number;
  value: NoteValue;
  dots?: 0 | 1;
  /** Part of a triplet (three of these take the time of two). */
  triplet?: boolean;
  /** Tied into the next note. */
  tie?: boolean;
  /** A ghost / dead note (x notehead): percussive, little or no pitch. */
  ghost?: boolean;
};

/** A chord symbol over a measure, from `beat` (0 = beat 1, in quarter notes) until the next one. */
export type TChord = { beat: number; symbol: string };

export type TMeasure = { id: string; chords: TChord[]; notes: TNote[] };

export type Transcription = {
  title: string;
  /** The tune it's over. */
  tune: string;
  /** Where it's from: album, track, year, timestamp. */
  source: string;
  /** Tempo of the recording, if known. */
  tempo: number | null;
  /** Free notes about it. */
  comments: string;
  timeSignature: { top: number; bottom: number };
  /** The staff's clef. Missing = "bass8" (every Bass Genius transcription). */
  clef?: Clef;
  /** Key signature as a count of sharps (positive) or flats (negative), -7…7. Missing = none. */
  key?: number;
  measures: TMeasure[];
};

// ---- Staff: clef, range, key signature -------------------------------------

/** "bass8": bass clef for bass guitar and upright, written an octave above where it sounds. */
export type Clef = "treble" | "bass" | "bass8";

export const CLEF_NAMES: Record<Clef, string> = { treble: "Treble", bass: "Bass", bass8: "Bass (bass guitar, upright)" };

export type StaffInfo = {
  clef: Clef;
  /** Diatonic index (C0 = 0) of the written top line. */
  topLineIndex: number;
  /** Octaves the part is written above where it sounds (bass: 1). */
  writtenShift: number;
  low: number;
  high: number;
  /** Where rests sit (VexFlow key). */
  restKey: string;
  /** The MIDI note the first typed letter lands near. */
  startMidi: number;
};

export const STAFFS: Record<Clef, StaffInfo> = {
  // Piano left hand, cello, trombone…: as written, A0 to C5.
  bass: { clef: "bass", topLineIndex: 3 * 7 + 5, writtenShift: 0, low: 21, high: 72, restKey: "d/3", startMidi: 48 },
  // Bass guitar and upright are written an octave above where they sound; C1 (a low-C extension)
  // to G4.
  bass8: { clef: "bass", topLineIndex: 3 * 7 + 5, writtenShift: 1, low: 24, high: 67, restKey: "d/3", startMidi: 40 },
  // Treble: as written, G2 (a guitar's low notes, written down there) to C7.
  treble: { clef: "treble", topLineIndex: 5 * 7 + 3, writtenShift: 0, low: 43, high: 96, restKey: "b/4", startMidi: 67 },
};

export function staffOf(t: Pick<Transcription, "clef">): StaffInfo {
  return STAFFS[t.clef ?? "bass8"];
}

const SHARP_ORDER: Step[] = ["F", "C", "G", "D", "A", "E", "B"];

/** The alteration the key signature gives each letter. */
export function keyAlters(key: number | undefined): Record<Step, Pitch["alter"]> {
  const out = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 } as Record<Step, Pitch["alter"]>;
  const k = Math.max(-7, Math.min(7, Math.round(key ?? 0)));
  if (k > 0) for (const step of SHARP_ORDER.slice(0, k)) out[step] = 1;
  if (k < 0) for (const step of [...SHARP_ORDER].reverse().slice(0, -k)) out[step] = -1;
  return out;
}

/** Key signatures by count of sharps/flats: the major key's name and its relative minor. */
export const KEY_NAMES: Record<number, { major: string; minor: string }> = {
  [-7]: { major: "Cb", minor: "Ab" },
  [-6]: { major: "Gb", minor: "Eb" },
  [-5]: { major: "Db", minor: "Bb" },
  [-4]: { major: "Ab", minor: "F" },
  [-3]: { major: "Eb", minor: "C" },
  [-2]: { major: "Bb", minor: "G" },
  [-1]: { major: "F", minor: "D" },
  0: { major: "C", minor: "A" },
  1: { major: "G", minor: "E" },
  2: { major: "D", minor: "B" },
  3: { major: "A", minor: "F#" },
  4: { major: "E", minor: "C#" },
  5: { major: "B", minor: "G#" },
  6: { major: "F#", minor: "D#" },
  7: { major: "C#", minor: "A#" },
};

export type TranscriptionFile = {
  format: typeof TRANSCRIPTION_FORMAT;
  version: number;
  exportedAt: string;
  player: { name: string } | null;
  transcription: Transcription;
};

export type PlayerFile = {
  format: typeof PLAYER_FORMAT;
  version: number;
  exportedAt: string;
  player: { name: string; description: string };
  transcriptions: Transcription[];
};

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyMeasure(): TMeasure {
  return { id: newId(), chords: [], notes: [] };
}

export function emptyTranscription(title = "Untitled transcription"): Transcription {
  return {
    title,
    tune: "",
    source: "",
    tempo: null,
    comments: "",
    timeSignature: { top: 4, bottom: 4 },
    measures: [emptyMeasure(), emptyMeasure(), emptyMeasure(), emptyMeasure()],
  };
}

// ---- Pitch -----------------------------------------------------------------

export function midiOf(p: Pitch): number {
  return (p.octave + 1) * 12 + STEP_PC[p.step] + p.alter;
}

/** Spells a MIDI number — flats or sharps for the black keys. */
export function spellMidi(midi: number, preferFlat: boolean): Pitch {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const natural = STEPS.find((s) => STEP_PC[s] === pc);
  if (natural) return { step: natural, alter: 0, octave };
  if (preferFlat) {
    const step = STEPS.find((s) => STEP_PC[s] === pc + 1)!;
    return { step, alter: -1, octave: pc + 1 === 12 ? octave + 1 : octave };
  }
  const step = STEPS.find((s) => STEP_PC[s] === pc - 1)!;
  return { step, alter: 1, octave };
}

export function pitchName(p: Pitch): string {
  const acc = p.alter === -2 ? "𝄫" : p.alter === -1 ? "♭" : p.alter === 1 ? "♯" : p.alter === 2 ? "𝄪" : "";
  return `${p.step}${acc}${p.octave}`;
}

/** Lowest and highest notes the editor allows (C1 — a low-C extension — up to G4). */
export const LOWEST_MIDI = 24;
export const HIGHEST_MIDI = 67;

/** The octave of `step` that's closest to `nearMidi` (how a letter key picks its octave). */
export function nearestPitch(step: Step, alter: Pitch["alter"], nearMidi: number, range: { low: number; high: number } = { low: LOWEST_MIDI, high: HIGHEST_MIDI }): Pitch {
  let best: Pitch = { step, alter, octave: 2 };
  let bestDist = Infinity;
  for (let octave = 0; octave <= 8; octave++) {
    const p: Pitch = { step, alter, octave };
    const m = midiOf(p);
    if (m < range.low || m > range.high) continue;
    const d = Math.abs(m - nearMidi);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

export function withPitch(note: TNote, pitch: Pitch): TNote {
  return { ...note, pitch, midi: midiOf(pitch) };
}

// ---- Time ------------------------------------------------------------------

export function noteTicks(n: Pick<TNote, "value" | "dots" | "triplet">): number {
  let t = VALUE_TICKS[n.value];
  if (n.dots) t *= 1.5;
  if (n.triplet) t = (t * 2) / 3;
  return t;
}

export function measureCapacity(t: Pick<Transcription, "timeSignature">): number {
  return (t.timeSignature.top * TICKS_PER_QUARTER * 4) / t.timeSignature.bottom;
}

export function measureTicks(m: TMeasure): number {
  return m.notes.reduce((s, n) => s + noteTicks(n), 0);
}

/** Every note with where it falls — for playback now and analysis later. Ties are merged into
    the note they start from. */
export type TimedNote = {
  measure: number;
  /** Ticks from the start of the transcription / of its measure. */
  start: number;
  startInMeasure: number;
  ticks: number;
  midi: number | null;
  ghost: boolean;
  /** The chord sounding when the note starts (normalized symbol), if any. */
  chord: string | null;
};

export function timeline(t: Transcription): TimedNote[] {
  const cap = measureCapacity(t);
  const out: TimedNote[] = [];
  let lastChord: string | null = null;
  t.measures.forEach((m, mi) => {
    let at = 0;
    for (const n of m.notes) {
      const beat = at / TICKS_PER_QUARTER;
      for (const c of m.chords) if (c.beat <= beat + 1e-9) lastChord = c.symbol;
      const ticks = noteTicks(n);
      const prev = out[out.length - 1];
      const tiedOn = prev && prev.midi !== null && prev.midi === (n.midi ?? null) && prevTie(t, mi, n);
      if (tiedOn) prev.ticks += ticks;
      else
        out.push({
          measure: mi,
          start: mi * cap + at,
          startInMeasure: at,
          ticks,
          midi: n.pitch ? (n.midi ?? midiOf(n.pitch)) : null,
          ghost: !!n.ghost,
          chord: lastChord,
        });
      at += ticks;
    }
  });
  return out;
}

/** Whether the note before `note` (possibly in the previous measure) is tied into it. */
function prevTie(t: Transcription, mi: number, note: TNote): boolean {
  const m = t.measures[mi];
  const i = m.notes.indexOf(note);
  if (i > 0) return !!m.notes[i - 1].tie;
  const before = t.measures[mi - 1]?.notes;
  return !!before?.length && !!before[before.length - 1].tie;
}

// ---- Chords ----------------------------------------------------------------

/**
 * Reads a measure's chord text — "D-7 G7", "Dm7 / / G7", "C7" — into positioned symbols. Without
 * slashes chords split the bar evenly (two chords = beats 1 and 3); a "/" or "." holds the chord
 * before for a beat. Returns the symbols normalized to iReal suffixes, plus anything unreadable.
 */
export function parseMeasureChords(text: string, beats = 4): { chords: TChord[]; unknown: string[] } {
  const tokens = text.split(/\s+/).filter(Boolean);
  const unknown: string[] = [];
  const explicit = tokens.some((t) => t === "/" || t === ".");
  const symbols: (string | null)[] = [];
  for (const token of tokens) {
    if (token === "/" || token === ".") {
      symbols.push(null);
      continue;
    }
    const parsed = parseTypedChord(token, 0);
    if (!parsed || parsed.slot.kind !== "chord" || parsed.kind !== "name") {
      unknown.push(token);
      continue;
    }
    const s = parsed.slot;
    symbols.push(`${s.letter}${s.accidental ?? ""}${s.quality}${s.bass ? `/${s.bass.letter}${s.bass.accidental ?? ""}` : ""}`);
  }
  const chords: TChord[] = [];
  if (explicit) {
    symbols.forEach((s, i) => {
      if (s && i < beats) chords.push({ beat: i, symbol: s });
    });
  } else {
    const real = symbols.filter((s): s is string => !!s);
    const n = real.length;
    real.forEach((s, k) => {
      const beat = n === 3 && beats === 4 ? [0, 2, 3][k] : Math.floor((k * beats) / Math.max(1, n));
      if (!chords.some((c) => c.beat === beat)) chords.push({ beat, symbol: s });
    });
  }
  return { chords, unknown };
}

/** A measure's chords back as editable text (with slashes when they're not evenly spaced). */
export function measureChordText(chords: TChord[], beats = 4): string {
  if (chords.length === 0) return "";
  const even = parseMeasureChords(chords.map((c) => c.symbol).join(" "), beats).chords;
  if (even.length === chords.length && even.every((c, i) => c.beat === chords[i].beat)) {
    return chords.map((c) => c.symbol).join(" ");
  }
  const slots: string[] = Array(beats).fill("/");
  for (const c of chords) slots[Math.min(beats - 1, Math.floor(c.beat))] = c.symbol;
  while (slots.length > 1 && slots[slots.length - 1] === "/") slots.pop();
  return slots.join(" ");
}

// ---- Editing (pure; the editor keeps a history of these) -------------------

export type Cursor = {
  measure: number;
  /** Index of the selected note in that measure, or -1 for "before the first note". New notes go
      in after it. */
  note: number;
};

/** Rests filling `ticks` (largest first; triplet values for leftovers that need them). */
export function restsFor(ticks: number): TNote[] {
  const shapes: Pick<TNote, "value" | "dots" | "triplet">[] = [
    { value: "w" },
    { value: "h", dots: 1 },
    { value: "h" },
    { value: "q", dots: 1 },
    { value: "q" },
    { value: "q", triplet: true },
    { value: "8", dots: 1 },
    { value: "8" },
    { value: "8", triplet: true },
    { value: "16" },
    { value: "16", triplet: true },
  ];
  const out: TNote[] = [];
  let left = Math.round(ticks);
  while (left > 0) {
    const shape = shapes.find((sh) => noteTicks(sh) <= left);
    if (!shape) break;
    out.push({ id: newId(), ...shape } as TNote);
    left -= noteTicks(shape);
  }
  return out;
}

/** A measure's notes with `written` laid over the span [from, from + its length): notes wholly
    inside are replaced, a note cut off at the end leaves its remainder as rests, nothing else
    moves. `keep` is how many notes before `from` stay as they are. */
function overlay(notes: TNote[], keep: number, from: number, written: TNote[]): TNote[] {
  const end = from + written.reduce((s, n) => s + noteTicks(n), 0);
  const out = [...notes.slice(0, keep), ...written];
  let at = from;
  for (const n of notes.slice(keep)) {
    const len = noteTicks(n);
    const stop = at + len;
    if (stop <= end) {
      at = stop;
      continue; // covered
    }
    if (at < end) out.push(...restsFor(stop - end)); // cut: the rest of it becomes rest
    else out.push(n);
    at = stop;
  }
  return out;
}

const startTicks = (m: TMeasure, index: number) => m.notes.slice(0, index).reduce((s, n) => s + noteTicks(n), 0);

/** Writes `note` after the cursor, over whatever is there (MuseScore's note input): nothing after
    it moves. A note that won't fit in what's left of the measure starts the next one (made if
    needed) instead. Returns the new measures and the cursor on the written note. */
export function writeNote(t: Transcription, cursor: Cursor, note: TNote): { measures: TMeasure[]; cursor: Cursor } {
  const cap = measureCapacity(t);
  const measures = [...t.measures];
  let mi = cursor.measure;
  let keep = cursor.note + 1;
  let from = startTicks(measures[mi], keep);
  if (from + noteTicks(note) > cap && from > 0) {
    mi += 1;
    keep = 0;
    from = 0;
    if (!measures[mi]) measures.push(emptyMeasure());
  }
  const m = measures[mi];
  measures[mi] = { ...m, notes: overlay(m.notes, keep, from, [note]) };
  return { measures, cursor: { measure: mi, note: keep } };
}

/** Kept for older callers: entry now overwrites. */
export const insertNote = writeNote;

/** Changes the selected note's length (value / dot / triplet) without moving anything after it:
    shorter leaves a rest, longer writes over what follows in the measure. Null if it wouldn't fit
    in the measure. */
export function setNoteRhythm(t: Transcription, cursor: Cursor, rhythm: Pick<TNote, "value" | "dots" | "triplet">): TMeasure[] | null {
  const m = t.measures[cursor.measure];
  const n = m?.notes[cursor.note];
  if (!n) return null;
  const from = startTicks(m, cursor.note);
  const next: TNote = { ...n, value: rhythm.value, dots: rhythm.dots ? 1 : undefined, triplet: rhythm.triplet || undefined };
  if (!next.dots) delete next.dots;
  if (!next.triplet) delete next.triplet;
  if (from + noteTicks(next) > measureCapacity(t)) return null;
  const notes = overlay(m.notes, cursor.note, from, [next]);
  return t.measures.map((mm, i) => (i === cursor.measure ? { ...mm, notes } : mm));
}

/** Backspace: a note becomes a rest of the same length (so nothing moves), except the last thing
    in its measure, which just goes. The cursor moves to the note before. */
export function clearNote(t: Transcription, cursor: Cursor): { measures: TMeasure[]; cursor: Cursor } {
  const m = t.measures[cursor.measure];
  const n = m?.notes[cursor.note];
  if (!n) return { measures: t.measures, cursor };
  const last = cursor.note === m.notes.length - 1;
  let notes = m.notes;
  if (last) notes = m.notes.slice(0, -1);
  else if (n.pitch) notes = m.notes.map((x, i) => (i === cursor.note ? { id: x.id, value: x.value, ...(x.dots ? { dots: x.dots } : {}), ...(x.triplet ? { triplet: true } : {}) } : x));
  const measures = t.measures.map((mm, i) => (i === cursor.measure ? { ...mm, notes } : mm));
  return { measures, cursor: { measure: cursor.measure, note: cursor.note - 1 } };
}

export function replaceNote(t: Transcription, cursor: Cursor, change: (n: TNote) => TNote): TMeasure[] {
  return t.measures.map((m, mi) =>
    mi !== cursor.measure ? m : { ...m, notes: m.notes.map((n, ni) => (ni === cursor.note ? change(n) : n)) },
  );
}

/** Overwrites the note at the cursor with `pitch` (or a rest), keeping its rhythm — value, dot,
    triplet — so nothing after it moves. */
export function overwriteNote(t: Transcription, cursor: Cursor, pitch: Pitch | null): TMeasure[] {
  return replaceNote(t, cursor, (n) => {
    const rhythm: TNote = { id: n.id, value: n.value, ...(n.dots ? { dots: n.dots } : {}), ...(n.triplet ? { triplet: true } : {}) };
    return pitch ? withPitch({ ...rhythm, ...(n.pitch && n.tie ? { tie: true } : {}) }, pitch) : rhythm;
  });
}

export function deleteNote(t: Transcription, cursor: Cursor): { measures: TMeasure[]; cursor: Cursor } {
  const m = t.measures[cursor.measure];
  if (!m || cursor.note < 0 || cursor.note >= m.notes.length) return { measures: t.measures, cursor };
  const measures = t.measures.map((mm, mi) => (mi === cursor.measure ? { ...mm, notes: mm.notes.filter((_, ni) => ni !== cursor.note) } : mm));
  return { measures, cursor: { measure: cursor.measure, note: cursor.note - 1 } };
}

/** The cursor one note left/right, crossing barlines. */
export function moveCursor(t: Transcription, cursor: Cursor, dir: -1 | 1): Cursor {
  const m = t.measures[cursor.measure];
  if (dir === 1) {
    if (cursor.note < m.notes.length - 1) return { ...cursor, note: cursor.note + 1 };
    if (cursor.measure < t.measures.length - 1) return { measure: cursor.measure + 1, note: t.measures[cursor.measure + 1].notes.length ? 0 : -1 };
    return cursor;
  }
  if (cursor.note > 0) return { ...cursor, note: cursor.note - 1 };
  if (cursor.note === 0) return { ...cursor, note: -1 };
  if (cursor.measure > 0) return { measure: cursor.measure - 1, note: t.measures[cursor.measure - 1].notes.length - 1 };
  return cursor;
}

/** The pitched note at or before the cursor (what a new letter's octave is chosen relative to). */
export function previousPitch(t: Transcription, cursor: Cursor): number | null {
  for (let mi = cursor.measure; mi >= 0; mi--) {
    const notes = t.measures[mi].notes;
    const from = mi === cursor.measure ? cursor.note : notes.length - 1;
    for (let ni = from; ni >= 0; ni--) {
      const n = notes[ni];
      if (n?.pitch) return n.midi ?? midiOf(n.pitch);
    }
  }
  return null;
}

// ---- Files -----------------------------------------------------------------

export function transcriptionFile(t: Transcription, playerName: string | null): TranscriptionFile {
  return { format: TRANSCRIPTION_FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), player: playerName ? { name: playerName } : null, transcription: t };
}

export function playerFile(name: string, description: string, transcriptions: Transcription[]): PlayerFile {
  return { format: PLAYER_FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), player: { name, description }, transcriptions };
}

const VALUES = new Set<string>(NOTE_VALUES);
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");

function cleanPitch(raw: unknown): Pitch | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  const step = typeof p.step === "string" ? (p.step.toUpperCase() as Step) : null;
  if (!step || !STEPS.includes(step)) return undefined;
  const alter = Number(p.alter) || 0;
  const octave = Number(p.octave);
  if (!Number.isInteger(octave) || alter < -2 || alter > 2) return undefined;
  return { step, alter: Math.round(alter) as Pitch["alter"], octave };
}

function cleanNote(raw: unknown): TNote | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const value = String(n.value);
  if (!VALUES.has(value)) return null;
  const pitch = cleanPitch(n.pitch);
  const note: TNote = { id: str(n.id, 40) || newId(), value: value as NoteValue };
  if (pitch) {
    note.pitch = pitch;
    note.midi = midiOf(pitch);
  }
  if (n.dots === 1) note.dots = 1;
  if (n.triplet === true) note.triplet = true;
  if (n.tie === true && pitch) note.tie = true;
  if (n.ghost === true && pitch) note.ghost = true;
  return note;
}

/** Validates and cleans a transcription from untrusted JSON (an imported file). */
export function cleanTranscription(raw: unknown): Transcription {
  if (!raw || typeof raw !== "object") throw new Error("Not a transcription.");
  const t = raw as Record<string, unknown>;
  if (!Array.isArray(t.measures)) throw new Error("This transcription has no measures.");
  const measures: TMeasure[] = t.measures.slice(0, 2000).map((rm) => {
    const m = (rm && typeof rm === "object" ? rm : {}) as Record<string, unknown>;
    const chords = Array.isArray(m.chords)
      ? m.chords
          .filter((c): c is { beat: number; symbol: string } => !!c && typeof c === "object" && typeof (c as TChord).symbol === "string")
          .map((c) => ({ beat: Math.max(0, Math.min(3, Number(c.beat) || 0)), symbol: c.symbol.slice(0, 40) }))
      : [];
    const notes = Array.isArray(m.notes) ? m.notes.map(cleanNote).filter((n): n is TNote => !!n) : [];
    return { id: str(m.id, 40) || newId(), chords, notes };
  });
  const tempo = Number(t.tempo);
  return {
    title: str(t.title, 200) || "Untitled transcription",
    tune: str(t.tune, 200),
    source: str(t.source, 500),
    tempo: Number.isFinite(tempo) && tempo > 0 ? Math.round(tempo) : null,
    comments: str(t.comments, 20000),
    timeSignature: { top: 4, bottom: 4 },
    measures: measures.length ? measures : [emptyMeasure()],
  };
}

/** A score from anywhere (Score Writer, a note, a file): like `cleanTranscription`, but keeps
    the clef, key and any time signature. */
export function cleanScore(raw: unknown): Transcription {
  const t = cleanTranscription(raw);
  const r = raw as Record<string, unknown>;
  const ts = (r.timeSignature ?? {}) as { top?: unknown; bottom?: unknown };
  const top = Number(ts.top);
  const bottom = Number(ts.bottom);
  if (Number.isInteger(top) && top >= 1 && top <= 16 && [2, 4, 8, 16].includes(bottom)) t.timeSignature = { top, bottom };
  if (r.clef === "treble" || r.clef === "bass" || r.clef === "bass8") t.clef = r.clef;
  const key = Number(r.key);
  if (Number.isInteger(key) && key >= -7 && key <= 7 && key !== 0) t.key = key;
  const beats = (t.timeSignature.top * 4) / t.timeSignature.bottom;
  const rawMeasures = Array.isArray(r.measures) ? r.measures : [];
  t.measures = t.measures.map((m, i) => {
    const rawChords = ((rawMeasures[i] as { chords?: unknown } | undefined)?.chords ?? []) as { beat?: unknown; symbol?: unknown }[];
    const chords = Array.isArray(rawChords)
      ? rawChords.filter((c) => c && typeof c.symbol === "string").map((c) => ({ beat: Math.max(0, Math.min(beats - 0.25, Number(c.beat) || 0)), symbol: String(c.symbol).slice(0, 40) }))
      : m.chords;
    return { ...m, chords };
  });
  return t;
}

export type ImportedFile =
  | { kind: "transcription"; playerName: string | null; transcription: Transcription }
  | { kind: "player"; name: string; description: string; transcriptions: Transcription[] };

/** Reads an exported file (either kind). Throws a readable message if it isn't one. */
export function readImportFile(text: string): ImportedFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const f = raw as Record<string, unknown>;
  if (f?.format === TRANSCRIPTION_FORMAT) {
    const player = f.player as { name?: unknown } | null;
    return { kind: "transcription", playerName: player && typeof player.name === "string" ? player.name : null, transcription: cleanTranscription(f.transcription) };
  }
  if (f?.format === PLAYER_FORMAT) {
    const player = (f.player ?? {}) as { name?: unknown; description?: unknown };
    const list = Array.isArray(f.transcriptions) ? f.transcriptions : [];
    return { kind: "player", name: str(player.name, 120) || "Imported player", description: str(player.description), transcriptions: list.map(cleanTranscription) };
  }
  throw new Error("That isn't a bass transcription or bass player file.");
}
