"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NoteValueIcon } from "@/components/MeterFields";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import { ChevronRightIcon, PlayIcon, StopIcon } from "@/components/tools";
import Score, { type ScoreHandle } from "@/components/notation/Score";
import {
  CLEF_NAMES,
  KEY_NAMES,
  keyAlters,
  staffOf,
  type Clef,
  clearNote,
  setNoteRhythm,
  emptyMeasure,
  writeNote,
  measureCapacity,
  measureTicks,
  midiOf,
  moveCursor,
  nearestPitch,
  newId,
  noteTicks,
  overwriteNote,
  NOTE_VALUE_NAMES,
  parseMeasureChords,
  pitchName,
  previousPitch,
  replaceNote,
  spellMidi,
  TICKS_PER_QUARTER,
  timeline,
  withPitch,
  type Cursor,
  type NoteValue,
  type Pitch,
  type Step,
  type TNote,
  type Transcription,
} from "@/lib/bassTranscription";
import { getAudioContext } from "@/lib/metronome";
import { playSampledNote, prepareSampledNote } from "@/lib/sampledTones";
import { loadUprightBass, playUprightBassNote } from "@/lib/uprightBass";

const VALUE_KEYS: Record<string, NoteValue> = { "3": "16", "4": "8", "5": "q", "6": "h", "7": "w" };
const VALUE_ICON: Record<NoteValue, number> = { w: 1, h: 2, q: 4, "8": 8, "16": 16 };
const STEP_KEYS = new Set(["a", "b", "c", "d", "e", "f", "g"]);
const HISTORY = 200;

type BarRange = { from: number; to: number };
type ChordClip = Transcription["measures"][number]["chords"][];
/** Copied chord changes, one list per bar — kept for the session so they can go into another
    transcription too. */
let chordClipboard: ChordClip | null = null;
function setChordClipboard(clip: ChordClip) {
  chordClipboard = clip;
}

const TIME_SIGNATURES = ["4/4", "3/4", "2/4", "2/2", "5/4", "6/4", "6/8", "9/8", "12/8", "7/8", "5/8"];

/** Re-bars a score for a new time signature, keeping every note and chord where it falls in time.
    Null when a note would cross the new bar lines (it would have to be split). */
function rebar(t: Transcription, top: number, bottom: number): Transcription | null {
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

const midiFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * The music notation editor — the one every notation in soniroll is written with (Score Writer,
 * notation in Shed Notes, Bass Genius transcriptions): the score (click a note or measure to put
 * the cursor there), a palette for note values, rests, dots, triplets, ties, ghost notes,
 * accidentals and octave, chord symbols typed onto the score, and Play. Everything can also be
 * done from the keyboard (letters type notes in the key, 3–7 note values, and so on). Undo/redo
 * cover every edit. With `staffControls`, the clef, key, time signature and tempo are set here too.
 * The caller saves: `onChange` gets every new version; `header` draws the title and the rest.
 */
export default function ScoreEditor({
  initial,
  onChange,
  header,
  sound = "piano",
  staffControls = false,
  autoFocus = false,
  underAppBar = false,
}: {
  initial: Transcription;
  onChange: (t: Transcription) => void;
  /** Drawn above the palette, with the score and a way to change its details. */
  header?: (t: Transcription, setMeta: (patch: Partial<Transcription>) => void) => React.ReactNode;
  /** What Play sounds like. */
  sound?: "piano" | "upright-bass";
  /** Show clef, key, time signature and tempo. (On phones they fold into one summary row.) */
  staffControls?: boolean;
  autoFocus?: boolean;
  /** On a page under the app's phone top bar (not in a dialog): the palette, which stays stuck
      at the top while the score scrolls, sits just below that bar instead of under it. */
  underAppBar?: boolean;
}) {
  const [t, setT] = useState<Transcription>(initial);
  const [cursor, setCursor] = useState<Cursor>({ measure: 0, note: initial.measures[0]?.notes.length ? initial.measures[0].notes.length - 1 : -1 });
  const [value, setValue] = useState<NoteValue>("q");
  const [dotted, setDotted] = useState(false);
  // Phones: the less-used tools hide behind "More" so the palette stays two rows.
  const [moreTools, setMoreTools] = useState(false);
  // Phones: clef, key, time and tempo fold into one summary row until opened.
  const [staffOpen, setStaffOpen] = useState(false);
  const [triplet, setTriplet] = useState(false);
  const [past, setPast] = useState<Transcription[]>([]);
  const [future, setFuture] = useState<Transcription[]>([]);
  const [playing, setPlaying] = useState<{ measure: number; note: number } | null>(null);
  const [loadingSound, setLoadingSound] = useState(false);
  // Whether the selection was picked on purpose (clicked / arrowed to). Then the note-value, dot
  // and triplet buttons change that note; right after typing a note they set the next one instead.
  const [picked, setPicked] = useState(false);
  // The inline chord input above the score: which beat of which bar, where to draw it, the text.
  const [chordEdit, setChordEdit] = useState<{ measure: number; beat: number; left: number; top: number; text: string; error: string | null } | null>(null);
  // Select: clicks only select (a note, or whole bars). Write: clicking the staff adds notes.
  const [mode, setMode] = useState<"select" | "write">("select");
  const [range, setRangeState] = useState<BarRange | null>(null);
  const rangeAnchor = useRef(0);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [clipNote, setClipNote] = useState<string | null>(null);
  const scoreRef = useRef<ScoreHandle>(null);
  /** Set once the chord input has been saved or cancelled, so its blur on the way out does nothing. */
  const chordClosed = useRef(false);
  /** When the chord input last closed by losing focus — the click that did that shouldn't also edit. */
  const chordBlurredAt = useRef(0);
  const justClosedChord = () => Date.now() - chordBlurredAt.current < 400;
  const editorRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const scoreBoxRef = useRef<HTMLDivElement>(null);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Every change goes to the caller (who saves it).
  const latest = useRef(t);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  // Anything but the score it opened with is a change. (Kept from the first render: a caller that
  // passes a fresh `initial` after its own save mustn't make that look like an edit.)
  const [opened] = useState(initial);
  useEffect(() => {
    latest.current = t;
    if (t !== opened) onChangeRef.current(t);
  }, [t, opened]);
  useEffect(() => {
    if (autoFocus) editorRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const staff = staffOf(t);
  const alters = keyAlters(t.key);

  // After each entry (or a move of the cursor), bring the cursor's line of music into view if it
  // has gone off screen or under the stuck palette, so you never write without seeing the notes.
  // Not on opening.
  const [openedCursor] = useState(cursor);
  useEffect(() => {
    if (cursor === openedCursor) return;
    revealCaret(scoreBoxRef.current, paletteRef.current);
  }, [cursor, t.measures, openedCursor]);

  /** Applies an edit with undo history. */
  const commit = useCallback((next: Transcription, nextCursor?: Cursor) => {
    setPast((p) => [...p.slice(-HISTORY + 1), latest.current]);
    setFuture([]);
    setT(next);
    if (nextCursor) setCursor(nextCursor);
  }, []);
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setFuture((f) => [t, ...f]);
    setPast((p) => p.slice(0, -1));
    setT(prev);
    setCursor((c) => clampCursor(prev, c));
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast((p) => [...p, t]);
    setFuture((f) => f.slice(1));
    setT(next);
    setCursor((c) => clampCursor(next, c));
  };
  /** Edits the transcription's details (no undo needed for these). */
  const setMeta = (patch: Partial<Transcription>) => {
    setT((cur) => ({ ...cur, ...patch }));
  };

  const selected: TNote | null = t.measures[cursor.measure]?.notes[cursor.note] ?? null;
  const last = t.measures.length - 1;
  const bars: BarRange | null = range ? { from: Math.min(range.from, last), to: Math.min(range.to, last) } : null;

  // ---- Selecting whole bars, and copying their chord changes ----
  const selectMeasure = (measure: number, extend: boolean) => {
    if (!extend) rangeAnchor.current = measure;
    const a = rangeAnchor.current;
    setRangeState({ from: Math.min(a, measure), to: Math.max(a, measure) });
    // Typing then adds after the bar's last note.
    setCursor({ measure, note: t.measures[measure].notes.length - 1 });
    setPicked(false);
  };
  const clearRange = () => setRangeState(null);
  const flash = (text: string) => {
    setClipNote(text);
    setTimeout(() => setClipNote((c) => (c === text ? null : c)), 1800);
  };
  const barsLabel = (r: BarRange) => (r.from === r.to ? `bar ${r.from + 1}` : `bars ${r.from + 1}–${r.to + 1}`);
  const copyChords = (r: BarRange) => {
    setChordClipboard(t.measures.slice(r.from, r.to + 1).map((m) => m.chords.map((c) => ({ ...c }))));
    flash(`Copied the chords in ${barsLabel(r)}`);
  };
  /** Pastes the copied chords from the first selected bar, replacing those bars' chords (notes
      untouched). A selection longer than one bar is filled, repeating the copied bars. */
  const pasteChords = (r: BarRange) => {
    const clip = chordClipboard;
    if (!clip?.length) return;
    const count = r.to > r.from ? r.to - r.from + 1 : clip.length;
    const measures = [...t.measures];
    while (measures.length < r.from + count) measures.push(emptyMeasure());
    for (let i = 0; i < count; i++) {
      const mi = r.from + i;
      measures[mi] = { ...measures[mi], chords: clip[i % clip.length].map((c) => ({ ...c })) };
    }
    commit({ ...t, measures });
    setRangeState({ from: r.from, to: r.from + count - 1 });
    flash(`Pasted chords into ${barsLabel({ from: r.from, to: r.from + count - 1 })}`);
  };
  const clearChords = (r: BarRange) => {
    commit({ ...t, measures: t.measures.map((m, i) => (i >= r.from && i <= r.to ? { ...m, chords: [] } : m)) });
  };
  const openMenu = (measure: number | null, x: number, y: number) => {
    if (measure === null) return;
    let r = bars;
    if (!r || measure < r.from || measure > r.to) {
      rangeAnchor.current = measure;
      r = { from: measure, to: measure };
      setRangeState(r);
      setCursor({ measure, note: t.measures[measure].notes.length - 1 });
      setPicked(false);
    }
    const sel = r;
    const items: MenuItem[] = [{ label: `Copy chords (${barsLabel(sel)})`, onSelect: () => copyChords(sel) }];
    if (chordClipboard?.length) {
      const n = chordClipboard.length;
      items.push({ label: `Paste chords (${n} bar${n === 1 ? "" : "s"})`, onSelect: () => pasteChords(sel) });
    }
    items.push({ label: "Clear chords", onSelect: () => clearChords(sel), danger: true });
    setMenu({ x, y, items });
  };

  // ---- Note entry ----
  /** Overwrites the note at `at` (keeping its rhythm), then moves on to the next note so a run can
      be typed over; past the last note, typing goes back to adding. */
  const overwriteAt = (at: Cursor, pitch: Pitch | null) => {
    const next = { ...t, measures: overwriteNote(t, at, pitch) };
    const after = moveCursor(next, at, 1);
    const moved = after.measure !== at.measure || after.note !== at.note;
    commit(next, moved ? after : at);
    setPicked(moved);
  };
  const addNote = (pitch: Pitch | null) => {
    setRangeState(null);
    if (picked && selected) return overwriteAt(cursor, pitch);
    const note: TNote = { id: newId(), value, ...(dotted ? { dots: 1 as const } : {}), ...(triplet ? { triplet: true } : {}) };
    const n = pitch ? withPitch(note, pitch) : note;
    const r = writeNote(t, cursor, n);
    commit({ ...t, measures: r.measures }, r.cursor);
    setPicked(false);
  };
  const addStep = (step: Step) => {
    // Overwriting: the octave nearest the note before the one being replaced.
    const from = picked && selected ? { measure: cursor.measure, note: cursor.note - 1 } : cursor;
    const near = previousPitch(t, from) ?? (selected?.midi ?? staff.startMidi);
    // Letters follow the key signature (F in G major is F♯), like other notation programs.
    addNote(nearestPitch(step, alters[step], near, staff));
  };
  const changeSelected = (change: (n: TNote) => TNote) => {
    if (!selected) return;
    commit({ ...t, measures: replaceNote(t, cursor, change) });
  };
  const transpose = (semitones: number) =>
    changeSelected((n) => {
      if (!n.pitch) return n;
      const midi = midiOf(n.pitch) + semitones;
      if (midi < staff.low || midi > staff.high) return n;
      const pitch = Math.abs(semitones) === 12 ? { ...n.pitch, octave: n.pitch.octave + semitones / 12 } : spellMidi(midi, semitones < 0);
      return withPitch(n, pitch);
    });
  const setAlter = (alter: Pitch["alter"]) =>
    changeSelected((n) => {
      if (!n.pitch) return n;
      const pitch = { ...n.pitch, alter };
      const m = midiOf(pitch);
      return m < staff.low || m > staff.high ? n : withPitch(n, pitch);
    });
  /** A picked note's new length — written over what follows, never pushing it along. */
  const [rhythmError, setRhythmError] = useState(false);
  const rhythmSelected = (change: (n: TNote) => Pick<TNote, "value" | "dots" | "triplet">) => {
    if (!selected) return;
    const measures = setNoteRhythm(t, cursor, change(selected));
    if (!measures) {
      setRhythmError(true);
      setTimeout(() => setRhythmError(false), 1800);
      return;
    }
    commit({ ...t, measures });
  };
  const pickValue = (v: NoteValue) => {
    setValue(v);
    if (picked && selected) rhythmSelected((n) => ({ value: v, dots: n.dots, triplet: n.triplet }));
  };
  const toggleDot = () => {
    if (picked && selected) rhythmSelected((n) => ({ value: n.value, dots: n.dots ? 0 : 1, triplet: n.triplet }));
    else setDotted((d) => !d);
  };
  const toggleTriplet = () => {
    if (picked && selected) rhythmSelected((n) => ({ value: n.value, dots: n.dots, triplet: !n.triplet }));
    else setTriplet((v) => !v);
  };
  const toggleTie = () => changeSelected((n) => (n.pitch ? { ...n, tie: !n.tie } : n));
  const toggleGhost = () => changeSelected((n) => (n.pitch ? { ...n, ghost: !n.ghost } : n));
  const removeSelected = () => {
    setRangeState(null);
    if (!selected) {
      setCursor((c) => moveCursor(t, c, -1));
      return;
    }
    const r = clearNote(t, cursor);
    commit({ ...t, measures: r.measures }, r.cursor);
    setPicked(false);
  };

  // ---- Measures ----
  const addMeasureAfter = () => {
    const measures = [...t.measures];
    measures.splice(cursor.measure + 1, 0, emptyMeasure());
    commit({ ...t, measures }, { measure: cursor.measure + 1, note: -1 });
  };
  const deleteMeasure = () => {
    if (t.measures.length <= 1) {
      commit({ ...t, measures: [emptyMeasure()] }, { measure: 0, note: -1 });
      return;
    }
    const measures = t.measures.filter((_, i) => i !== cursor.measure);
    const mi = Math.min(cursor.measure, measures.length - 1);
    commit({ ...t, measures }, { measure: mi, note: measures[mi].notes.length - 1 });
  };
  // ---- Chord symbols (typed straight onto the score, above a note) ----
  /** The beat (in quarters from the bar line) the note at `c` starts on; bar start for none. */
  const beatOf = (c: Cursor) => startBeat(t, c);
  const openChord = (measure: number, beat: number) => {
    const anchor = scoreRef.current?.anchorFor(measure, beat);
    if (!anchor) return;
    const existing = t.measures[measure]?.chords.find((c) => Math.abs(c.beat - beat) < 1e-6);
    chordClosed.current = false;
    setChordEdit({ measure, beat, left: anchor.left, top: anchor.top, text: existing?.symbol ?? "", error: null });
  };
  const addChordAtCursor = () => openChord(cursor.measure, cursor.note >= 0 ? beatOf(cursor) : 0);
  /** Saves the chord being typed (empty removes it). `advance` then opens the next note's. */
  const commitChord = (advance: boolean) => {
    if (!chordEdit || chordClosed.current) return;
    const text = chordEdit.text.trim();
    let symbol: string | null = null;
    if (text) {
      const { chords, unknown } = parseMeasureChords(text, 1);
      if (unknown.length || chords.length !== 1) {
        setChordEdit({ ...chordEdit, error: `Didn't understand “${text}”` });
        return;
      }
      symbol = chords[0].symbol;
    }
    const { measure, beat } = chordEdit;
    const measures = t.measures.map((m, i) => {
      if (i !== measure) return m;
      const others = m.chords.filter((c) => Math.abs(c.beat - beat) > 1e-6);
      return { ...m, chords: symbol ? [...others, { beat, symbol }].sort((a, b) => a.beat - b.beat) : others };
    });
    const next = { ...t, measures };
    const existing = t.measures[measure]?.chords.find((c) => Math.abs(c.beat - beat) < 1e-6)?.symbol ?? null;
    if (existing !== symbol) commit(next);
    chordClosed.current = true;
    setChordEdit(null);
    if (advance) {
      // On to the next note (or the next bar's start).
      const from: Cursor = { measure, note: noteIndexAtBeat(next, measure, beat) };
      const to = moveCursor(next, from, 1);
      if (to.measure !== from.measure || to.note !== from.note) {
        setCursor(to);
        setPicked(true);
        const anchor = scoreRef.current?.anchorFor(to.measure, to.note >= 0 ? startBeat(next, to) : 0);
        const ex = next.measures[to.measure]?.chords.find((c) => Math.abs(c.beat - (to.note >= 0 ? startBeat(next, to) : 0)) < 1e-6);
        chordClosed.current = false;
        if (anchor) setChordEdit({ measure: to.measure, beat: to.note >= 0 ? startBeat(next, to) : 0, left: anchor.left, top: anchor.top, text: ex?.symbol ?? "", error: null });
        return;
      }
    }
    editorRef.current?.focus({ preventScroll: true });
  };

  // ---- Playback ----
  const stopPlayback = useCallback(() => {
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];
    setPlaying(null);
  }, []);
  useEffect(() => stopPlayback, [stopPlayback]);
  const play = async () => {
    if (playing) return stopPlayback();
    setLoadingSound(true);
    const ctx = getAudioContext();
    try {
      if (sound === "upright-bass") await loadUprightBass();
      else {
        const midis = [...new Set(timeline(t).flatMap((n) => (n.midi !== null ? [n.midi] : [])))];
        await Promise.all(midis.map((m) => prepareSampledNote(ctx, "piano", midiFreq(m))));
      }
    } catch {
      setLoadingSound(false);
      return;
    }
    setLoadingSound(false);
    await ctx.resume();
    const bpm = t.tempo ?? 120;
    const tickSec = 60 / bpm / TICKS_PER_QUARTER;
    const cap = measureCapacity(t);
    const from = cursor.measure * cap;
    const start = ctx.currentTime + 0.15;
    // Map timeline notes back to their measure/note index for the highlight.
    const positions: { measure: number; note: number; at: number }[] = [];
    t.measures.forEach((m, mi) => {
      let at = mi * cap;
      m.notes.forEach((n, ni) => {
        positions.push({ measure: mi, note: ni, at });
        at += noteTicks(n);
      });
    });
    const notes = timeline(t).filter((n) => n.start >= from);
    for (const n of notes) {
      const when = start + (n.start - from) * tickSec;
      if (n.midi === null) continue;
      if (sound === "upright-bass") playUprightBassNote(n.midi, when, n.ticks * tickSec * (n.ghost ? 0.4 : 1) + 0.01, n.ghost ? 0.3 : 0.62, n.ghost);
      else playSampledNote(ctx, "piano", midiFreq(n.midi), n.ticks * tickSec * (n.ghost ? 0.3 : 0.95), when);
    }
    for (const p of positions) {
      if (p.at < from) continue;
      playTimers.current.push(setTimeout(() => setPlaying({ measure: p.measure, note: p.note }), (start - ctx.currentTime + (p.at - from) * tickSec) * 1000));
    }
    const end = t.measures.length * cap;
    playTimers.current.push(setTimeout(() => stopPlayback(), (start - ctx.currentTime + (end - from) * tickSec + 0.3) * 1000));
    setPlaying({ measure: cursor.measure, note: -1 });
  };

  // ---- Keyboard ----
  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    let handled = true;
    if (mod && (k === "z" || k === "Z")) {
      if (e.shiftKey) redo();
      else undo();
    }
    else if (mod && k === "y") redo();
    else if (mod && (k === "k" || k === "K")) addChordAtCursor();
    else if (mod && (k === "c" || k === "C") && bars) copyChords(bars);
    else if (mod && (k === "v" || k === "V") && bars) pasteChords(bars);
    else if (mod) handled = false;
    else if (STEP_KEYS.has(k.toLowerCase()) && !e.altKey) addStep(k.toUpperCase() as Step);
    else if (k === "0" || k === "r" || k === "R") addNote(null);
    else if (VALUE_KEYS[k]) pickValue(VALUE_KEYS[k]);
    else if (k === ".") toggleDot();
    else if (k === "t" || k === "T") toggleTriplet();
    else if (k === "+" || k === "=") toggleTie();
    else if (k === "x" || k === "X") toggleGhost();
    else if (k === "#") setAlter(selected?.pitch ? (Math.min(2, selected.pitch.alter + 1) as Pitch["alter"]) : 1);
    else if (k === "-") setAlter(selected?.pitch ? (Math.max(-2, selected.pitch.alter - 1) as Pitch["alter"]) : -1);
    else if (k === "n" || k === "N") setAlter(0);
    else if (k === "ArrowUp") transpose(e.shiftKey ? 12 : 1);
    else if (k === "ArrowDown") transpose(e.shiftKey ? -12 : -1);
    else if (k === "ArrowLeft") {
      setCursor((c) => moveCursor(t, c, -1));
      setPicked(true);
      clearRange();
    } else if (k === "ArrowRight") {
      setCursor((c) => moveCursor(t, c, 1));
      setPicked(true);
      clearRange();
    } else if (k === "Escape") {
      setPicked(false);
      clearRange();
      setMode("select");
    } else if (k === "w" || k === "W") setMode("write");
    else if (k === "Backspace" || k === "Delete") removeSelected();
    else if (k === " ") void play();
    else handled = false;
    if (handled) e.preventDefault();
  };

  const m = t.measures[cursor.measure];
  const filled = m ? measureTicks(m) : 0;
  const cap = measureCapacity(t);

  const btn = (active = false) =>
    `flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-sm font-medium transition-colors disabled:opacity-40 pointer-coarse:h-10 pointer-coarse:min-w-10 ${
      active ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "bg-background text-foreground hover:bg-surface-hover"
    }`;

  /** Phones: the rhythm row's buttons share the row equally. */
  const phoneRow = "max-sm:order-1 max-sm:flex-1 max-sm:px-1 max-sm:pointer-coarse:min-w-0";

  const keyOptions = Object.entries(KEY_NAMES)
    .map(([k, n]) => ({ value: Number(k), label: `${n.major.replace("b", "♭").replace("#", "♯")} major · ${n.minor.replace("b", "♭").replace("#", "♯")} minor` }))
    .sort((x, y) => Math.abs(x.value) - Math.abs(y.value) || y.value - x.value);
  const setTime = (value: string) => {
    const [top, bottom] = value.split("/").map(Number);
    if (top === t.timeSignature.top && bottom === t.timeSignature.bottom) return;
    const next = rebar(t, top, bottom);
    if (!next) {
      flash("Some notes would cross the new bar lines — shorten them first.");
      return;
    }
    commit(next, { measure: 0, note: -1 });
  };

  const staffSummary = [
    CLEF_NAMES[t.clef ?? "bass8"].replace(/ \(.*\)$/, ""),
    `${(KEY_NAMES[t.key ?? 0]?.major ?? "C").replace("b", "♭").replace("#", "♯")} major`,
    `${t.timeSignature.top}/${t.timeSignature.bottom}`,
    `${t.tempo ?? 120} BPM`,
  ].join(" · ");

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      {header?.(t, setMeta)}

      {staffControls && (
        <button
          type="button"
          onClick={() => setStaffOpen((o) => !o)}
          aria-expanded={staffOpen}
          aria-label={`Clef, key, time and tempo: ${staffSummary}`}
          className="-mb-1 flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 text-left text-sm transition-colors hover:bg-surface-hover sm:hidden"
        >
          <span className="min-w-0 flex-1 truncate font-medium">{staffSummary}</span>
          <span className="shrink-0 text-xs text-muted">{staffOpen ? "Done" : "Change"}</span>
          <ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 text-muted ${staffOpen ? "-rotate-90" : "rotate-90"}`} />
        </button>
      )}
      {staffControls && (
        <div className={`${staffOpen ? "grid" : "hidden"} grid-cols-2 gap-2 sm:grid sm:grid-cols-4`}>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Clef</span>
            <Select<Clef> value={t.clef ?? "bass8"} options={(Object.keys(CLEF_NAMES) as Clef[]).map((c) => ({ value: c, label: CLEF_NAMES[c] }))} onChange={(clef) => commit({ ...t, clef })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Key</span>
            <Select<number> value={t.key ?? 0} options={keyOptions} onChange={(key) => commit({ ...t, key: key || undefined })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Time</span>
            <Select<string> value={`${t.timeSignature.top}/${t.timeSignature.bottom}`} options={TIME_SIGNATURES.map((v) => ({ value: v, label: v }))} onChange={setTime} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Tempo</span>
            <input
              type="number"
              min={20}
              max={400}
              value={t.tempo ?? ""}
              onChange={(e) => setMeta({ tempo: e.target.value ? Math.max(20, Math.min(400, Math.round(Number(e.target.value)))) : null })}
              placeholder="Optional"
              aria-label="Tempo (BPM)"
              className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
        </div>
      )}

      <div ref={editorRef} tabIndex={0} onKeyDown={onKeyDown} className="flex flex-col gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        {/* Palette */}
        <div
          ref={paletteRef}
          className={`sticky z-10 flex flex-col gap-2 rounded-lg bg-surface p-2.5 ${underAppBar ? "top-[calc(env(safe-area-inset-top)+4rem)] lg:top-2" : "top-2"}`}
        >
          {/* On phones the less-used tools (tie, ghost, chord, accidentals, octaves, redo) hide
              behind "More", and Undo and More move up beside Play (CSS order), so the palette (which
              stays stuck at the top) is two rows plus the note names and doesn't cover half the
              screen. Undo always shows. */}
          <div className="flex flex-wrap items-center gap-1">
            <div className="flex shrink-0 gap-0.5 rounded-full bg-background p-0.5" role="radiogroup" aria-label="Mouse mode">
              {(
                [
                  ["select", "Select", "Clicks only select a note, or a whole bar (Shift+click for a range). Esc"],
                  ["write", "Write", "Clicking the staff adds a note, or re-pitches the one in that spot (on a touch screen, hold to see the note, lift to add it). W"],
                ] as const
              ).map(([m, label, title]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  title={title}
                  className={`h-8 rounded-full px-3 text-sm font-medium transition-colors pointer-coarse:h-9 ${mode === m ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void play()} className={btn(!!playing)} title="Play from this bar (Space)">
              {loadingSound ? <LoadingSpinner size="sm" inline label="Loading sound" /> : playing ? <StopIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
              {playing ? "Stop" : "Play"}
            </button>
            <span className="mx-1 hidden h-6 w-px shrink-0 bg-foreground/10 sm:block" />
            {/* Phones: the lengths, dot, triplet and Rest share one full row (a line break before
                them, equal widths), so Rest doesn't wrap onto a row of its own. */}
            <span aria-hidden className="hidden basis-full max-sm:order-1 max-sm:block" />
            {(["w", "h", "q", "8", "16"] as NoteValue[]).map((v) => (
              <button key={v} type="button" onClick={() => pickValue(v)} className={`${btn(picked && selected ? selected.value === v : value === v)} ${phoneRow}`} title={`${NOTE_VALUE_NAMES[v]} (${Object.keys(VALUE_KEYS).find((k) => VALUE_KEYS[k] === v)})`} aria-label={NOTE_VALUE_NAMES[v]}>
                <NoteValueIcon value={VALUE_ICON[v]} className="h-6 w-3" />
              </button>
            ))}
            <button type="button" onClick={toggleDot} className={`${btn(picked && selected ? !!selected.dots : dotted)} ${phoneRow}`} title="Dotted (.)" aria-label="Dotted">
              <span className="text-xl leading-none">·</span>
            </button>
            <button type="button" onClick={toggleTriplet} className={`${btn(picked && selected ? !!selected.triplet : triplet)} ${phoneRow}`} title="Triplet (T)" aria-label="Triplet">
              <span className="sm:hidden">3</span>
              <span className="max-sm:hidden">Triplet</span>
            </button>
            <span className="mx-1 hidden h-6 w-px shrink-0 bg-foreground/10 sm:block" />
            <button type="button" onClick={() => addNote(null)} className={`${btn()} ${phoneRow}`} title="Rest (0 or R)">
              Rest
            </button>
            <div className={`${moreTools ? "contents" : "hidden"} sm:contents max-sm:*:order-2`}>
            <span aria-hidden className="hidden basis-full max-sm:block" />
            <button type="button" onClick={toggleTie} disabled={!selected?.pitch} className={btn(!!selected?.tie)} title="Tie to the next note (+)">
              Tie
            </button>
            <button type="button" onClick={toggleGhost} disabled={!selected?.pitch} className={btn(!!selected?.ghost)} title="Ghost note: an x note head (X)" aria-label="Ghost note">
              Ghost
            </button>
            <button type="button" onClick={addChordAtCursor} className={btn(!!chordEdit)} title="Add a chord symbol above the selected note (Ctrl+K)">
              + Chord
            </button>
            <span className="mx-1 hidden h-6 w-px shrink-0 bg-foreground/10 sm:block" />
            <button type="button" onClick={() => setAlter(1)} disabled={!selected?.pitch} className={btn(selected?.pitch?.alter === 1)} title="Sharp (#)">
              ♯
            </button>
            <button type="button" onClick={() => setAlter(-1)} disabled={!selected?.pitch} className={btn(selected?.pitch?.alter === -1)} title="Flat (-)">
              ♭
            </button>
            <button type="button" onClick={() => setAlter(0)} disabled={!selected?.pitch} className={btn()} title="Natural (N)">
              ♮
            </button>
            <button type="button" onClick={() => transpose(12)} disabled={!selected?.pitch} className={btn()} title="Octave up (Shift+↑)">
              8va
            </button>
            <button type="button" onClick={() => transpose(-12)} disabled={!selected?.pitch} className={btn()} title="Octave down (Shift+↓)">
              8vb
            </button>
            </div>
            <span className="mx-1 hidden h-6 w-px shrink-0 bg-foreground/10 sm:block" />
            <button type="button" onClick={undo} disabled={!past.length} className={btn()} title="Undo (Ctrl+Z)">
              Undo
            </button>
            <button type="button" onClick={redo} disabled={!future.length} className={`${btn()} max-sm:order-2 ${moreTools ? "" : "max-sm:hidden"}`} title="Redo (Ctrl+Shift+Z)">
              Redo
            </button>
            <button
              type="button"
              onClick={() => setMoreTools((on) => !on)}
              aria-expanded={moreTools}
              className={`${btn(moreTools)} sm:hidden`}
            >
              {moreTools ? "Less" : "More"}
              <ChevronRightIcon className={`h-3.5 w-3.5 ${moreTools ? "-rotate-90" : "rotate-90"}`} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 sm:gap-1.5">
            {/* On phones the note names always fill their own row (the status goes on the line
                below), so the keys are the same size before and after the first note. */}
            <div className="flex items-center gap-1 max-sm:w-full sm:gap-1.5">
              {(["C", "D", "E", "F", "G", "A", "B"] as Step[]).map((s) => (
                <button key={s} type="button" onClick={() => addStep(s)} className={`${btn()} w-9 text-base sm:w-10 max-sm:flex-1 max-sm:pointer-coarse:min-w-0`} title={`Add ${s} (${s})`}>
                  {s}
                </button>
              ))}
              <button type="button" onClick={removeSelected} className={`${btn()} max-sm:flex-1 max-sm:pointer-coarse:min-w-0`} title="Delete (Backspace)" aria-label="Delete">
                ⌫
              </button>
            </div>
            {rhythmError && <span className="text-xs text-danger">That won&apos;t fit in the bar.</span>}
            {clipNote && <span className="text-xs text-accent">{clipNote}</span>}
            <span className="ml-auto text-xs text-muted tabular-nums">
              Bar {cursor.measure + 1} {Math.round((filled / cap) * 100) === 100 ? "is full" : `has ${formatBeats(filled / TICKS_PER_QUARTER)} of ${cap / TICKS_PER_QUARTER} beats`}
              {selected ? ` · ${selected.pitch ? pitchName(selected.pitch) : "a rest"} selected` : ""}
            </span>
          </div>
        </div>

        {/* Score */}
        <div ref={scoreBoxRef} className="rounded-lg bg-surface p-3 sm:p-5" onMouseDown={() => editorRef.current?.focus({ preventScroll: true })}>
          <Score
            handleRef={scoreRef}
            onChordClick={(measure, beat) => openChord(measure, beat)}
            overlay={
              chordEdit && (
                <div
                  className="absolute z-20 flex flex-col gap-1"
                  style={{ left: chordEdit.left, top: chordEdit.top }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseMove={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    value={chordEdit.text}
                    onChange={(e) => setChordEdit({ ...chordEdit, text: e.target.value, error: null })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitChord(false);
                      } else if (e.key === "Tab" || e.key === " ") {
                        e.preventDefault();
                        commitChord(true);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        chordClosed.current = true;
                        setChordEdit(null);
                        editorRef.current?.focus({ preventScroll: true });
                      }
                    }}
                    onBlur={() => {
                      chordBlurredAt.current = Date.now();
                      if (chordEdit.error === null) commitChord(false);
                    }}
                    placeholder="Dm7"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-label={`Chord at bar ${chordEdit.measure + 1}, beat ${chordEdit.beat + 1}`}
                    className="w-28 rounded-md border-2 border-accent bg-foreground/[0.05] px-2 py-1 font-mono text-sm text-foreground shadow-md outline-none"
                  />
                  {chordEdit.error && <span className="rounded bg-background px-1.5 py-0.5 text-xs text-danger shadow">{chordEdit.error}</span>}
                </div>
              )
            }
            mode={mode}
            range={bars}
            onSelectMeasure={(measure, extend) => {
              if (justClosedChord()) return;
              selectMeasure(measure, extend);
              editorRef.current?.focus({ preventScroll: true });
            }}
            onMenu={openMenu}
            transcription={t} cursor={cursor} playing={playing} onSelect={(c) => {
              if (justClosedChord()) return;
              rangeAnchor.current = c.measure;
              setCursor(c);
              setPicked(true);
              clearRange();
            }}
            onReplace={(measure, note, pitch) => {
              if (justClosedChord()) return;
              overwriteAt({ measure, note }, pitch);
              clearRange();
              editorRef.current?.focus({ preventScroll: true });
            }}
            onAdd={(measure, after, pitch) => {
              if (justClosedChord()) return;
              const note: TNote = withPitch({ id: newId(), value, ...(dotted ? { dots: 1 as const } : {}), ...(triplet ? { triplet: true } : {}) }, pitch);
              const r = writeNote(t, { measure, note: after }, note);
              commit({ ...t, measures: r.measures }, r.cursor);
              setPicked(false);
              clearRange();
              editorRef.current?.focus({ preventScroll: true });
            }} />
          {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
        </div>

        {/* Measure tools */}
        <div className="flex justify-end gap-2">
          <div className="flex gap-1.5">
            <button type="button" onClick={addMeasureAfter} className="flex h-9 items-center justify-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
              + Bar after
            </button>
            <button type="button" onClick={deleteMeasure} className="flex h-9 items-center justify-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover hover:text-danger">
              Delete bar
            </button>
          </div>
        </div>

        <details className="px-1 text-xs text-muted">
          <summary className="cursor-pointer select-none font-medium hover:text-foreground">
            <span className="[@media(pointer:coarse)]:hidden">Keyboard and mouse shortcuts</span>
            <span className="hidden [@media(pointer:coarse)]:inline">How to write on a touch screen</span>
          </summary>
          <p className="mt-2 [@media(pointer:coarse)]:hidden">{KEY_HELP}</p>
          <p className="mt-2 hidden [@media(pointer:coarse)]:block">{TOUCH_HELP}</p>
        </details>
      </div>
    </div>
  );
}

const KEY_HELP =
  "Select mode (Esc): clicks only select — a note, or a whole bar (click beside its notes; Shift+click another bar for a range); right-click bars to copy, paste or clear their chords (Ctrl+C / Ctrl+V). Write mode (W): clicking the staff adds notes. Keys: A–G add a note (nearest the last one) · 3 4 5 6 7 = 16th, 8th, quarter, half, whole · . dot · T triplet · 0 or R rest · ↑ ↓ semitone, Shift+↑ ↓ octave · # sharp, - flat, N natural · + tie · X ghost note · ← → move · Backspace turns a note into a rest · Space play · Ctrl+Z undo. Chords: select a note, then + Chord (Ctrl+K), type it, Enter — Space/Tab goes on to the next note's, an empty one removes it, click a chord to edit it. In write mode, click the staff to add a note there, or above/below an existing note to change its pitch (the preview shows which); click a note's head (or arrow to it) to select it — typing then overwrites it and moves on, keeping the rhythm — then the note-value, dot and triplet buttons change that note; Esc goes back to entering. New notes go after the cursor.";

const TOUCH_HELP =
  "Tap a length, then a note name (C to B) to add a note after the cursor; the rest button adds a rest and ⌫ deletes. More has sharps and flats, octaves, ties, ghost notes and chords. In Write, hold a finger on the staff to see which note it is, slide up or down to change it, and lift to add it (or to re-pitch the note in that spot); scroll away to cancel. Tap a note to select it: a length, dot or triplet then changes that note, and a note name overwrites it.";

/** Scrolls the line of music with the cursor in it (the row holding the caret) into view inside
    whatever scrolls the editor (the page, or a dialog), clear of the stuck palette above it, but
    only when it's out of view. */
function revealCaret(scoreBox: HTMLElement | null, palette: HTMLElement | null) {
  const row = scoreBox?.querySelector(".notation-caret")?.closest("[data-row]");
  if (!(row instanceof HTMLElement)) return;
  let scroller: HTMLElement | null = row.parentElement;
  while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
  const box = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const top = Math.max(box.top, palette ? palette.getBoundingClientRect().bottom : box.top) + 8;
  const bottom = Math.min(box.bottom, window.innerHeight) - 16;
  const r = row.getBoundingClientRect();
  let delta = 0;
  if (r.top < top) delta = r.top - top;
  else if (r.bottom > bottom) delta = Math.min(r.bottom - bottom, r.top - top);
  if (Math.abs(delta) < 1) return;
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  (scroller ?? document.scrollingElement)?.scrollBy({ top: delta, behavior });
}

/** The beat (in quarters from the bar line) the note at `c` starts on. */
function startBeat(t: Transcription, c: Cursor): number {
  const notes = t.measures[c.measure]?.notes ?? [];
  return notes.slice(0, Math.max(0, c.note)).reduce((s, n) => s + noteTicks(n), 0) / TICKS_PER_QUARTER;
}

/** The note starting at `beat` in bar `measure` (or -1 if none does). */
function noteIndexAtBeat(t: Transcription, measure: number, beat: number): number {
  let at = 0;
  const notes = t.measures[measure]?.notes ?? [];
  for (let i = 0; i < notes.length; i++) {
    if (Math.abs(at / TICKS_PER_QUARTER - beat) < 1e-6) return i;
    at += noteTicks(notes[i]);
  }
  return -1;
}

/** 2, 2.5, 2.67 — beats as a short number. */
function formatBeats(beats: number) {
  return Number.isInteger(beats) ? String(beats) : String(Math.round(beats * 100) / 100);
}

function clampCursor(t: Transcription, c: Cursor): Cursor {
  const measure = Math.min(c.measure, t.measures.length - 1);
  const note = Math.min(c.note, t.measures[measure].notes.length - 1);
  return { measure, note };
}
