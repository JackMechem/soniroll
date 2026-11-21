import {
  CLEF_NAMES,
  clearNote,
  emptyMeasure,
  keyAlters,
  measureCapacity,
  measureTicks,
  midiOf,
  moveCursor,
  nearestPitch,
  newId,
  NOTE_VALUE_NAMES,
  noteTicks,
  overwriteNote,
  parseMeasureChords,
  pitchName,
  previousPitch,
  replaceNote,
  setNoteRhythm,
  spellMidi,
  staffOf,
  TICKS_PER_QUARTER,
  timeline,
  withPitch,
  writeNote,
  type Clef,
  type Cursor,
  type NoteValue,
  type Pitch,
  type Step,
  type TNote,
  type Transcription,
} from '@jam-practice/core/bassTranscription';
import { clampCursor, formatBeats, KEY_OPTIONS, keyLabel, noteIndexAtBeat, rebar, startBeat, TIME_SIGNATURES } from '@jam-practice/core/scoreEdit';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { Dropdown } from '@/components/Dropdown';
import { BackspaceIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlayIcon, PlusIcon, StopIcon, TrashIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import Score, { type ScoreHandle } from '@/components/notation/Score';
import { Field, PillChoice } from '@/components/tool/ear';
import { NoteValueIcon } from '@/components/tool/meter';
import { ToolSheet } from '@/components/tool/SettingChip';
import { getAudioContext } from '@/lib/audioContext';
import { playSampledMidi, prepareSampledMidi } from '@/lib/sampledTones';
import { loadUprightBass, playUprightBassNote } from '@/lib/uprightBass';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';
import { TextInput } from '@/components/ThemedTextInput';

const VALUE_ICON: Record<NoteValue, number> = { w: 1, h: 2, q: 4, '8': 8, '16': 16 };
const VALUES: NoteValue[] = ['w', 'h', 'q', '8', '16'];
const LETTERS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const HISTORY = 200;

type BarRange = { from: number; to: number };
type ChordClip = Transcription['measures'][number]['chords'][];
/** Copied chord changes, one list per bar — kept for the session so they can go into another score. */
let chordClipboard: ChordClip | null = null;
function setChordClipboard(clip: ChordClip) {
  chordClipboard = clip;
}

const TOUCH_HELP =
  'Tap a length, then a note name (C to B) to add a note after the cursor; Rest adds a rest and ⌫ turns a note into a rest. More has ties, ghost notes, chords, sharps and flats, octaves and moving the cursor. In Write, touch the staff to see which note it is, hold and slide up or down to change it, and lift to add it (or to re-pitch the note in that spot); a quick swipe just scrolls. Tap a note to select it: a length, dot or triplet then changes that note, and a note name overwrites it. Tap beside the notes in Select to pick a bar; press and hold a bar to copy, paste or clear its chords, select several bars, or add and delete bars. Tap a chord to change it.';

/**
 * The music notation editor on the phone — the website's `apps/web/components/notation/ScoreEditor.tsx`
 * (the one editor every notation is written with: Score Writer, and Rhythm Section's bass players'
 * transcriptions), made for touch the way the website is on a phone: the score scrolls and keeps
 * the cursor's line of music in view, and the palette stays at the bottom like a keyboard — Select
 * / Write, Play, Undo and More; the note lengths, dot, triplet and Rest; then the note names and ⌫.
 * More holds the less-used tools (tie, ghost note, chord, sharps and flats, octaves, moving the
 * cursor, redo). In Write, notes go onto the staff by touch (see `Score`). A chord symbol is typed
 * in a bar that takes the palette's place, with Next to go on to the next note's. Clef, key, time
 * and tempo fold into one row that opens a sheet. Every edit can be undone.
 *
 * The caller saves (`onChange` gets every new version) and draws the title and the rest (`header`).
 * The editor fills its parent down to the screen's bottom edge (`safeBottom` pads the palette for
 * the phone's own bar; pass false inside a view that already does).
 */
export default function ScoreEditor({
  initial,
  onChange,
  header,
  sound = 'piano',
  staffControls = false,
  safeBottom = true,
}: {
  initial: Transcription;
  onChange: (t: Transcription) => void;
  header?: (t: Transcription, setMeta: (patch: Partial<Transcription>) => void) => ReactNode;
  /** What Play sounds like. */
  sound?: 'piano' | 'upright-bass';
  /** Show clef, key, time signature and tempo. */
  staffControls?: boolean;
  safeBottom?: boolean;
}) {
  const { colors, derived } = useAppTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [t, setT] = useState<Transcription>(initial);
  const [cursor, setCursor] = useState<Cursor>({ measure: 0, note: initial.measures[0]?.notes.length ? initial.measures[0].notes.length - 1 : -1 });
  const [value, setValue] = useState<NoteValue>('q');
  const [dotted, setDotted] = useState(false);
  const [triplet, setTriplet] = useState(false);
  const [moreTools, setMoreTools] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [past, setPast] = useState<Transcription[]>([]);
  const [future, setFuture] = useState<Transcription[]>([]);
  const [playing, setPlaying] = useState<{ measure: number; note: number } | null>(null);
  // The screen stays on while the score plays.
  useKeepAwakeWhile(playing !== null);
  const [loadingSound, setLoadingSound] = useState(false);
  // Whether the selection was picked on purpose (tapped / moved to). Then the length, dot and
  // triplet buttons change that note; right after entering a note they set the next one instead.
  const [picked, setPicked] = useState(false);
  const [chordEdit, setChordEdit] = useState<{ measure: number; beat: number; text: string; error: string | null } | null>(null);
  const [mode, setMode] = useState<'select' | 'write'>('select');
  const [range, setRangeState] = useState<BarRange | null>(null);
  // Where a selection of bars started (a long press elsewhere extends it from here).
  const [anchor, setAnchor] = useState(0);
  const [barMenu, setBarMenu] = useState<number | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  // A finger held on the staff in Write: the page stops scrolling so sliding changes the note.
  const [held, setHeld] = useState(false);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scoreRef = useRef<ScoreHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const view = useRef({ scrollY: 0, height: 0, scoreY: 0 });

  // Every change goes to the caller (who saves it). Anything but the score it opened with is a change.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const [opened] = useState(initial);
  useEffect(() => {
    if (t !== opened) onChangeRef.current(t);
  }, [t, opened]);
  const staff = staffOf(t);
  const alters = keyAlters(t.key);

  // After each entry (or a move of the cursor), bring the cursor's line of music into view if it has
  // gone off screen, so you never write without seeing the notes. Not on opening.
  const [openedCursor] = useState(cursor);
  useEffect(() => {
    if (cursor === openedCursor) return;
    const row = scoreRef.current?.rowOf(cursor.measure);
    const v = view.current;
    if (!row || !v.height) return;
    const top = v.scoreY + row.y;
    const bottom = top + row.height;
    if (top < v.scrollY + 4) scrollRef.current?.scrollTo({ y: Math.max(0, top - 8), animated: true });
    else if (bottom > v.scrollY + v.height - 4) scrollRef.current?.scrollTo({ y: Math.max(0, Math.min(top - 8, bottom - v.height + 12)), animated: true });
  }, [cursor, t.measures, openedCursor]);

  const flash = (text: string, error = false) => {
    setNote({ text, error });
    setTimeout(() => setNote((n) => (n?.text === text ? null : n)), 2200);
  };

  /** Applies an edit with undo history. */
  const commit = useCallback(
    (next: Transcription, nextCursor?: Cursor) => {
      setPast((p) => [...p.slice(-HISTORY + 1), t]);
      setFuture([]);
      setT(next);
      if (nextCursor) setCursor(nextCursor);
    },
    [t],
  );
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
  /** Edits the score's details (no undo needed for these). */
  const setMeta = (patch: Partial<Transcription>) => setT((cur) => ({ ...cur, ...patch }));

  const selected: TNote | null = t.measures[cursor.measure]?.notes[cursor.note] ?? null;
  const last = t.measures.length - 1;
  const bars: BarRange | null = range ? { from: Math.min(range.from, last), to: Math.min(range.to, last) } : null;

  // ── Whole bars, and their chord changes ──
  const selectMeasure = (measure: number, extend: boolean) => {
    const a = extend ? anchor : measure;
    if (!extend) setAnchor(measure);
    setRangeState({ from: Math.min(a, measure), to: Math.max(a, measure) });
    // Entering then adds after the bar's last note.
    setCursor({ measure, note: t.measures[measure].notes.length - 1 });
    setPicked(false);
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
  const clearChords = (r: BarRange) => commit({ ...t, measures: t.measures.map((m, i) => (i >= r.from && i <= r.to ? { ...m, chords: [] } : m)) });

  // ── Note entry ──
  /** Overwrites the note at `at` (keeping its rhythm), then moves on to the next note so a run can
      be entered over; past the last note, entry goes back to adding. */
  const overwriteAt = (at: Cursor, pitch: Pitch | null) => {
    const next = { ...t, measures: overwriteNote(t, at, pitch) };
    const after = moveCursor(next, at, 1);
    const moved = after.measure !== at.measure || after.note !== at.note;
    commit(next, moved ? after : at);
    setPicked(moved);
  };
  const newNote = (): TNote => ({ id: newId(), value, ...(dotted ? { dots: 1 as const } : {}), ...(triplet ? { triplet: true } : {}) });
  const addNote = (pitch: Pitch | null) => {
    setRangeState(null);
    if (picked && selected) return overwriteAt(cursor, pitch);
    const n = pitch ? withPitch(newNote(), pitch) : newNote();
    const r = writeNote(t, cursor, n);
    commit({ ...t, measures: r.measures }, r.cursor);
    setPicked(false);
  };
  const addStep = (step: Step) => {
    // Overwriting: the octave nearest the note before the one being replaced.
    const from = picked && selected ? { measure: cursor.measure, note: cursor.note - 1 } : cursor;
    const near = previousPitch(t, from) ?? selected?.midi ?? staff.startMidi;
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
  const setAlter = (alter: Pitch['alter']) =>
    changeSelected((n) => {
      if (!n.pitch) return n;
      const pitch = { ...n.pitch, alter };
      const m = midiOf(pitch);
      return m < staff.low || m > staff.high ? n : withPitch(n, pitch);
    });
  /** A picked note's new length — written over what follows, never pushing it along. */
  const rhythmSelected = (change: (n: TNote) => Pick<TNote, 'value' | 'dots' | 'triplet'>) => {
    if (!selected) return;
    const measures = setNoteRhythm(t, cursor, change(selected));
    if (!measures) return flash("That won't fit in the bar.", true);
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
  const move = (dir: -1 | 1) => {
    setCursor((c) => moveCursor(t, c, dir));
    setPicked(true);
    setRangeState(null);
  };

  // ── Bars ──
  const addMeasureAfter = (at = cursor.measure) => {
    const measures = [...t.measures];
    measures.splice(at + 1, 0, emptyMeasure());
    commit({ ...t, measures }, { measure: at + 1, note: -1 });
    setRangeState(null);
  };
  const deleteMeasure = (at = cursor.measure) => {
    setRangeState(null);
    if (t.measures.length <= 1) {
      commit({ ...t, measures: [emptyMeasure()] }, { measure: 0, note: -1 });
      return;
    }
    const measures = t.measures.filter((_, i) => i !== at);
    const mi = Math.min(at, measures.length - 1);
    commit({ ...t, measures }, { measure: mi, note: measures[mi].notes.length - 1 });
  };

  // ── Chord symbols (typed in a bar in the palette's place, above the selected note) ──
  const openChord = (measure: number, beat: number) => {
    const existing = t.measures[measure]?.chords.find((c) => Math.abs(c.beat - beat) < 1e-6);
    setChordEdit({ measure, beat, text: existing?.symbol ?? '', error: null });
  };
  const addChordAtCursor = () => openChord(cursor.measure, cursor.note >= 0 ? startBeat(t, cursor) : 0);
  /** Saves the chord being typed (empty removes it). `advance` then opens the next note's. */
  const commitChord = (advance: boolean, typed?: string) => {
    if (!chordEdit) return;
    const text = (typed ?? chordEdit.text).trim();
    let symbol: string | null = null;
    if (text) {
      const { chords, unknown } = parseMeasureChords(text, 1);
      if (unknown.length || chords.length !== 1) {
        setChordEdit({ ...chordEdit, text, error: `Didn't understand “${text}”` });
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
    setChordEdit(null);
    if (!advance) return;
    // On to the next note (or the next bar's start).
    const from: Cursor = { measure, note: noteIndexAtBeat(next, measure, beat) };
    const to = moveCursor(next, from, 1);
    if (to.measure === from.measure && to.note === from.note) return;
    setCursor(to);
    setPicked(true);
    const toBeat = to.note >= 0 ? startBeat(next, to) : 0;
    const ex = next.measures[to.measure]?.chords.find((c) => Math.abs(c.beat - toBeat) < 1e-6);
    setChordEdit({ measure: to.measure, beat: toBeat, text: ex?.symbol ?? '', error: null });
  };

  // ── Playback ──
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
      if (sound === 'upright-bass') await loadUprightBass();
      else {
        const midis = [...new Set(timeline(t).flatMap((n) => (n.midi !== null ? [n.midi] : [])))];
        await Promise.all(midis.map((m) => prepareSampledMidi('piano', m)));
      }
    } catch {
      setLoadingSound(false);
      flash("Couldn't load the sound. Check your connection and try again.", true);
      return;
    }
    setLoadingSound(false);
    if (ctx.state === 'suspended') await ctx.resume();
    const bpm = t.tempo ?? 120;
    const tickSec = 60 / bpm / TICKS_PER_QUARTER;
    const cap = measureCapacity(t);
    const from = cursor.measure * cap;
    const start = ctx.currentTime + 0.15;
    // Map timeline notes back to their bar/note for the highlight.
    const positions: { measure: number; note: number; at: number }[] = [];
    t.measures.forEach((m, mi) => {
      let at = mi * cap;
      m.notes.forEach((n, ni) => {
        positions.push({ measure: mi, note: ni, at });
        at += noteTicks(n);
      });
    });
    for (const n of timeline(t)) {
      if (n.start < from || n.midi === null) continue;
      const when = start + (n.start - from) * tickSec;
      if (sound === 'upright-bass') playUprightBassNote(n.midi, when, n.ticks * tickSec * (n.ghost ? 0.4 : 1) + 0.01, n.ghost ? 0.3 : 0.62, n.ghost);
      else playSampledMidi('piano', n.midi, n.ticks * tickSec * (n.ghost ? 0.3 : 0.95), when);
    }
    const lead = (start - ctx.currentTime) * 1000;
    for (const p of positions) {
      if (p.at < from) continue;
      playTimers.current.push(setTimeout(() => setPlaying({ measure: p.measure, note: p.note }), lead + (p.at - from) * tickSec * 1000));
    }
    const end = t.measures.length * cap;
    playTimers.current.push(setTimeout(stopPlayback, lead + ((end - from) * tickSec + 0.3) * 1000));
    setPlaying({ measure: cursor.measure, note: -1 });
  };

  const setTime = (v: string) => {
    const [top, bottom] = v.split('/').map(Number);
    if (top === t.timeSignature.top && bottom === t.timeSignature.bottom) return;
    const next = rebar(t, top, bottom);
    if (!next) return flash('Some notes would cross the new bar lines — shorten them first.', true);
    commit(next, { measure: 0, note: -1 });
  };

  const m = t.measures[cursor.measure];
  const filled = m ? measureTicks(m) : 0;
  const cap = measureCapacity(t);
  const staffSummary = [CLEF_NAMES[t.clef ?? 'bass8'].replace(/ \(.*\)$/, ''), keyLabel(t.key), `${t.timeSignature.top}/${t.timeSignature.bottom}`, `${t.tempo ?? 120} BPM`].join(' · ');
  const status = `Bar ${cursor.measure + 1} ${Math.round((filled / cap) * 100) === 100 ? 'is full' : `has ${formatBeats(filled / TICKS_PER_QUARTER)} of ${cap / TICKS_PER_QUARTER} beats`}${
    selected ? ` · ${selected.pitch ? pitchName(selected.pitch) : 'a rest'} selected` : ''
  }`;
  const activeValue = (v: NoteValue) => (picked && selected ? selected.value === v : value === v);

  // The bar menu (a long press on a bar): its chords, selecting several bars, adding and deleting.
  const menuActions = (measure: number): SheetAction[] => {
    const inRange = !!bars && measure >= bars.from && measure <= bars.to;
    const r: BarRange = inRange && bars ? bars : { from: measure, to: measure };
    const apply = (fn: () => void) => () => {
      if (!inRange) selectMeasure(measure, false);
      fn();
    };
    const ink = colors.foreground;
    const out: SheetAction[] = [];
    if (bars && !inRange) {
      const a = anchor;
      out.push({ key: 'extend', icon: <ChevronRightIcon color={ink} size={20} />, label: `Select ${barsLabel({ from: Math.min(a, measure), to: Math.max(a, measure) })}`, onPress: () => selectMeasure(measure, true) });
    }
    out.push({ key: 'copy', icon: <CheckIcon color={ink} size={20} />, label: `Copy chords (${barsLabel(r)})`, onPress: apply(() => copyChords(r)) });
    if (chordClipboard?.length) {
      const n = chordClipboard.length;
      out.push({ key: 'paste', icon: <PlusIcon color={ink} size={20} />, label: `Paste chords (${n} bar${n === 1 ? '' : 's'})`, onPress: apply(() => pasteChords(r)) });
    }
    out.push({ key: 'clear', icon: <CloseIcon color={ink} size={20} />, label: `Clear chords (${barsLabel(r)})`, onPress: apply(() => clearChords(r)) });
    out.push({ key: 'add', icon: <PlusIcon color={ink} size={20} />, label: `Add a bar after bar ${measure + 1}`, onPress: () => addMeasureAfter(measure) });
    out.push({ key: 'delete', icon: <TrashIcon color={colors.danger} size={20} />, label: `Delete bar ${measure + 1}`, danger: true, onPress: () => deleteMeasure(measure) });
    return out;
  };

  const bottomPad = safeBottom ? insets.bottom : 0;
  // How far the editor's bottom sits above the screen's (the phone's bar, when someone else pads it).
  const edge = safeBottom ? 0 : insets.bottom;

  return (
    <View className="flex-1">
      <ScrollView
        ref={scrollRef}
        scrollEnabled={!held}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          view.current.scrollY = e.nativeEvent.contentOffset.y;
        }}
        onLayout={(e: LayoutChangeEvent) => {
          view.current.height = e.nativeEvent.layout.height;
        }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
      >
        {header?.(t, setMeta)}

        {staffControls ? (
          <Pressable
            onPress={() => setStaffOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Clef, key, time and tempo: ${staffSummary}`}
            android_ripple={{ color: colors['surface-hover'] }}
            className="h-11 flex-row items-center gap-2 overflow-hidden rounded-lg px-3"
            style={{ backgroundColor: derived.fill }}
          >
            <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
              {staffSummary}
            </Text>
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              Change
            </Text>
            <ChevronDownIcon color={colors.muted} size={16} />
          </Pressable>
        ) : null}

        <View
          className="rounded-xl p-3"
          style={{ backgroundColor: colors.surface }}
          onLayout={(e: LayoutChangeEvent) => {
            view.current.scoreY = e.nativeEvent.layout.y + 12;
          }}
        >
          <Score
            handleRef={scoreRef}
            transcription={t}
            cursor={cursor}
            playing={playing}
            range={bars}
            mode={mode}
            onHold={setHeld}
            onChordClick={openChord}
            onSelect={(c) => {
              setAnchor(c.measure);
              setCursor(c);
              setPicked(true);
              setRangeState(null);
            }}
            onSelectMeasure={(measure, extend) => selectMeasure(measure, extend)}
            onLongPressMeasure={setBarMenu}
            onReplace={(measure, n, pitch) => {
              overwriteAt({ measure, note: n }, pitch);
              setRangeState(null);
            }}
            onAdd={(measure, after, pitch) => {
              const r = writeNote(t, { measure, note: after }, withPitch(newNote(), pitch));
              commit({ ...t, measures: r.measures }, r.cursor);
              setPicked(false);
              setRangeState(null);
            }}
          />
        </View>

        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center gap-1.5">
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              How to write by touch
            </Text>
            <InfoButton title="Writing by touch" text={TOUCH_HELP} size={16} />
          </View>
          <SmallButton label="Bar after" onPress={() => addMeasureAfter()} Icon={PlusIcon} />
          <SmallButton label="Delete bar" onPress={() => deleteMeasure()} Icon={TrashIcon} />
        </View>
      </ScrollView>

      {chordEdit ? (
        // Typing a chord: in the palette's place, just above the keyboard.
        <View
          className="gap-2 px-3 pt-3"
          style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: derived.hairline, paddingBottom: (keyboard ? Math.max(0, keyboard - edge) : bottomPad) + 10 }}
        >
          <View className="flex-row items-center gap-2">
            <Text className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.muted }}>
              Chord · bar {chordEdit.measure + 1}, beat {formatBeats(chordEdit.beat + 1)}
            </Text>
            {chordEdit.error ? (
              <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.danger }}>
                {chordEdit.error}
              </Text>
            ) : null}
          </View>
          <View className="flex-row items-center gap-2">
            <TextInput
              value={chordEdit.text}
              onChangeText={(text) => {
                // A space goes on to the next note's chord (chord symbols have none).
                if (text.endsWith(' ') && text.trim()) commitChord(true, text);
                else setChordEdit({ ...chordEdit, text, error: null });
              }}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder="Dm7"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => commitChord(true)}
              accessibilityLabel={`Chord at bar ${chordEdit.measure + 1}, beat ${formatBeats(chordEdit.beat + 1)}`}
              className="font-ui h-11 flex-1 rounded-lg px-3 text-base"
              style={{ backgroundColor: colors.background, color: colors.foreground, borderWidth: 2, borderColor: chordEdit.error ? colors.danger : colors.accent }}
            />
            <Key label="Next" onPress={() => commitChord(true)} />
            <Key label="Done" active onPress={() => commitChord(false)} />
            <Key label="Cancel" accessibilityLabel="Cancel" onPress={() => setChordEdit(null)}>
              <CloseIcon color={colors.foreground} size={18} />
            </Key>
          </View>
        </View>
      ) : (
        <View className="gap-1.5 px-3 pt-2" style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: derived.hairline, paddingBottom: bottomPad + 8 }}>
          <Row>
            <Key label="Select" flex active={mode === 'select'} onPress={() => setMode('select')} />
            <Key label="Write" flex active={mode === 'write'} onPress={() => setMode('write')} />
            <Key label={playing ? 'Stop' : 'Play'} flex active={!!playing} disabled={loadingSound} onPress={() => void play()}>
              {playing ? <StopIcon color={colors['accent-foreground']} size={18} /> : <PlayIcon color={colors.foreground} size={18} />}
              <KeyText active={!!playing}>{loadingSound ? '…' : playing ? 'Stop' : 'Play'}</KeyText>
            </Key>
            <Key label="Undo" flex disabled={!past.length} onPress={undo} />
            <Key label={moreTools ? 'Less' : 'More'} flex active={moreTools} onPress={() => setMoreTools((on) => !on)} />
          </Row>
          <Row>
            {VALUES.map((v) => (
              <Key key={v} label={NOTE_VALUE_NAMES[v]} flex active={activeValue(v)} onPress={() => pickValue(v)}>
                <NoteValueIcon value={VALUE_ICON[v]} color={activeValue(v) ? colors['accent-foreground'] : colors.foreground} height={24} />
              </Key>
            ))}
            <Key label="Dotted" flex active={picked && selected ? !!selected.dots : dotted} onPress={toggleDot}>
              <KeyText active={picked && selected ? !!selected.dots : dotted} big>
                ·
              </KeyText>
            </Key>
            <Key label="Triplet" flex active={picked && selected ? !!selected.triplet : triplet} onPress={toggleTriplet}>
              <KeyText active={picked && selected ? !!selected.triplet : triplet}>3</KeyText>
            </Key>
            <Key label="Rest" flex onPress={() => addNote(null)} />
          </Row>
          {moreTools ? (
            <>
              <Row>
                <Key label="Tie" flex disabled={!selected?.pitch} active={!!selected?.tie} onPress={toggleTie} />
                <Key label="Ghost" flex disabled={!selected?.pitch} active={!!selected?.ghost} onPress={toggleGhost} />
                <Key label="Chord" flex onPress={addChordAtCursor} />
                <Key label="Redo" flex disabled={!future.length} onPress={redo} />
              </Row>
              <Row>
                <Key label="♯" accessibilityLabel="Sharp" flex disabled={!selected?.pitch} active={selected?.pitch?.alter === 1} onPress={() => setAlter(1)} />
                <Key label="♭" accessibilityLabel="Flat" flex disabled={!selected?.pitch} active={selected?.pitch?.alter === -1} onPress={() => setAlter(-1)} />
                <Key label="♮" accessibilityLabel="Natural" flex disabled={!selected?.pitch} onPress={() => setAlter(0)} />
                <Key label="8va" accessibilityLabel="Octave up" flex disabled={!selected?.pitch} onPress={() => transpose(12)} />
                <Key label="8vb" accessibilityLabel="Octave down" flex disabled={!selected?.pitch} onPress={() => transpose(-12)} />
                <Key label="Previous note" flex onPress={() => move(-1)}>
                  <ChevronLeftIcon color={colors.foreground} size={20} />
                </Key>
                <Key label="Next note" flex onPress={() => move(1)}>
                  <ChevronRightIcon color={colors.foreground} size={20} />
                </Key>
              </Row>
            </>
          ) : null}
          <Row>
            {LETTERS.map((s) => (
              <Key key={s} label={s} accessibilityLabel={`Add ${s}`} flex big onPress={() => addStep(s)} />
            ))}
            <Key label="Delete" flex onPress={removeSelected}>
              <BackspaceIcon color={colors.foreground} size={20} />
            </Key>
          </Row>
          <Text numberOfLines={1} className="font-ui px-1 text-xs" style={{ color: note ? (note.error ? colors.danger : colors.accent) : colors.muted, fontVariant: ['tabular-nums'] }}>
            {note ? note.text : status}
          </Text>
        </View>
      )}

      {staffControls ? (
        <ToolSheet visible={staffOpen} onClose={() => setStaffOpen(false)} title="Clef, key, time and tempo">
          <Field label="Clef">
            <PillChoice<Clef> label="Clef" value={t.clef ?? 'bass8'} onChange={(clef) => commit({ ...t, clef })} options={(Object.keys(CLEF_NAMES) as Clef[]).map((c) => ({ value: c, label: CLEF_NAMES[c] }))} />
          </Field>
          <Field label="Key">
            <View className="flex-row">
              <Dropdown<number> value={t.key ?? 0} options={KEY_OPTIONS} onChange={(key) => commit({ ...t, key: key || undefined })} />
            </View>
          </Field>
          <Field label="Time" hint="Changing it re-bars the music: every note and chord keeps its place in time.">
            <PillChoice<string> label="Time" value={`${t.timeSignature.top}/${t.timeSignature.bottom}`} onChange={setTime} options={TIME_SIGNATURES.map((v) => ({ value: v, label: v }))} />
          </Field>
          <Field label="Tempo (BPM)" hint="How fast Play plays it. Leave it empty for 120.">
            <TempoInput value={t.tempo ?? null} onChange={(tempo) => setMeta({ tempo })} />
          </Field>
        </ToolSheet>
      ) : null}

      <ActionSheet
        visible={barMenu !== null}
        title={barMenu !== null ? `Bar ${barMenu + 1}` : undefined}
        actions={barMenu !== null ? menuActions(barMenu) : []}
        onClose={() => setBarMenu(null)}
      />
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View className="flex-row gap-1">{children}</View>;
}

function KeyText({ children, active, big }: { children: ReactNode; active?: boolean; big?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Text numberOfLines={1} className={`font-ui-semibold font-semibold ${big ? 'text-lg' : 'text-sm'}`} style={{ color: active ? colors['accent-foreground'] : colors.foreground }}>
      {children}
    </Text>
  );
}

/** A palette key: on the background colour, or the accent when on. `children` replace the label
    (which is then only read out). */
function Key({
  label,
  accessibilityLabel,
  onPress,
  active,
  disabled,
  flex,
  big,
  children,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  flex?: boolean;
  big?: boolean;
  children?: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      android_ripple={{ color: active ? colors['accent-hover'] : colors['surface-hover'] }}
      className="h-11 flex-row items-center justify-center gap-1 overflow-hidden rounded-lg px-1.5"
      style={[{ backgroundColor: active ? colors.accent : colors.background, opacity: disabled ? 0.4 : 1 }, flex ? { flex: 1, minWidth: 0 } : { minWidth: 44 }]}
    >
      {children ?? (
        <KeyText active={active} big={big}>
          {label}
        </KeyText>
      )}
    </Pressable>
  );
}

function SmallButton({ label, onPress, Icon }: { label: string; onPress: () => void; Icon: typeof PlusIcon }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 flex-row items-center gap-1 overflow-hidden rounded-lg px-3"
      style={{ backgroundColor: derived.fill }}
    >
      <Icon color={colors.foreground} size={16} />
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The tempo as a number field: kept as typed, saved clamped to 20–400 (empty = none). */
export function TempoInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { colors } = useAppTheme();
  const [text, setText] = useState(value === null ? '' : String(value));
  return (
    <TextInput
      value={text}
      onChangeText={(s) => {
        const digits = s.replace(/[^\d]/g, '');
        setText(digits);
        if (!digits) onChange(null);
        else if (Number(digits) >= 20) onChange(Math.min(400, Number(digits)));
      }}
      onEndEditing={() => setText(value === null ? '' : String(value))}
      keyboardType="number-pad"
      placeholder="120"
      placeholderTextColor={colors.muted}
      accessibilityLabel="Tempo (BPM)"
      className="font-ui h-11 rounded-lg px-3 text-base"
      style={{ backgroundColor: colors.background, color: colors.foreground }}
    />
  );
}
