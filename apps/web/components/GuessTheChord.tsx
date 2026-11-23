"use client";

import { useEffect, useRef, useState } from "react";
import { DisclosureSummary } from "@/components/Disclosure";
import SwitchRow from "@/components/SwitchRow";
import ChordSymbolKeypad, { KeypadKey } from "@/components/ChordSymbolKeypad";
import Hint from "@/components/Hint";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import KeyHint from "@/components/KeyHint";
import PanelsToggle from "@/components/PanelsToggle";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import Select from "@/components/Select";
import {
  FlagIcon,
  ChordIcon,
  PlayIcon,
  SlidersIcon,
  StopwatchIcon,
  ListIcon,
} from "@/components/tools";
import { scheduleClick } from "@/lib/clickEngine";
import { prettyQuality } from "@/lib/iRealPro";
import { getAudioContext } from "@/lib/metronome";
import { GRADE_LABEL, Grade, scoreOf } from "@/lib/noteGrade";
import {
  CHORD_CATEGORIES,
  CHORD_QUALITIES,
  DEFAULT_ENABLED_CHORD_IDS,
  ChordQuality,
  ChordRound,
  chordInputMatchesRound,
  chordQualityById,
  chordRoundForRootAndQuality,
  chordRoundParts,
  drillQueueForPool,
  formatChordParts,
  parseChordInput,
  pcLabel,
  randomChordRound,
} from "@/lib/chords";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import {
  DEFAULT_EAR_TRAINING_TONE_ID,
  EAR_TRAINING_TONES,
  playNote,
  playNotesTogether,
} from "@/lib/tones";
import { ACCIDENTAL_STYLES, AccidentalStyle } from "@/lib/noteSpelling";
import { formatDuration, shuffled } from "@/lib/trainerUtils";
import {
  GradeCounts,
  bumpGradeCounts,
  rankWeak,
} from "@/lib/struggleStats";
import AdvancedSlider from "@/components/AdvancedSlider";
import CountdownLabel from "@/components/CountdownLabel";
import CountdownRing from "@/components/CountdownRing";
import ElapsedTimer from "@/components/ElapsedTimer";
import LearningPath from "@/components/learning/LearningPath";
import LevelComplete from "@/components/learning/LevelComplete";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { cumulativeItems, levelQueue } from "@/lib/learningPath";
import { useLearnSession } from "@/lib/useLearnSession";
import { useToolActivity } from "@/lib/toolTime";
import { formatFileDate } from "@/lib/files";
import { spellAbove } from "@/lib/rootlessVoicings";
import { parseNote } from "@/lib/noteRange";
import { PoolPill } from "@/components/reward/Reward";
import StruggleCounts from "@/components/learning/StruggleCounts";
import { GRADE_COLOR, ANSWER_INPUT, FEEDBACK_LINE, LEVEL_LABEL, PANEL_LIST, PANEL_ROW, PRIMARY_BUTTON, PRIMARY_BUTTON_SM, RESULTS_PANEL, SECONDARY_BUTTON, TEXT_BUTTON_DANGER, startButtonClass, POOL_BUTTON, bestPassingMs, passedRound, IDLE_MARK, IDLE_RING, IDLE_HINT, isTouchFirst, noteGlyphs } from "@/components/learning/quizUi";
import HistoryRow from "@/components/learning/HistoryRow";

const MIN_ROUND_SECONDS = 5;
const MAX_ROUND_SECONDS = 45;
const DEFAULT_ROUND_SECONDS = 15;

/** How many letter names above the root each of a chord's intervals sits (a minor 3rd is 2
    letters up, a ♯9 is 1, a ♯11 is 3), so its notes are spelled from the root: G-7 is G B♭ D F,
    never G A♯ D F. A diminished 7th's 6th semitone is a double-flat 7th (6 letters up). */
const TONE_STEPS: Record<number, number> = {
  0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6,
  13: 1, 14: 1, 15: 1, 17: 3, 18: 3, 21: 5,
};

/** A spelled note name with the octave of `midi` ("Bb" at MIDI 58 → "Bb3"; "Cb" at 59 → "Cb4"). */
function withOctave(name: string, midi: number): string {
  const acc = name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0;
  return `${name}${Math.floor((midi - acc) / 12) - 1}`;
}

const ENHARMONIC_ROOT: Record<string, string> = {
  "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
};

function chordTones(r: ChordRound, root: string) {
  return r.quality.intervals.map((iv) =>
    spellAbove(root, iv, r.quality.id === "dim7" && iv === 9 ? 6 : (TONE_STEPS[iv] ?? 0)),
  );
}
const spellingCost = (r: ChordRound, root: string) =>
  chordTones(r, root).reduce((sum, t) => sum + t.cost, 0);

/** A round's revealed answer and the notes it played, spelled from its root and quality. The
    root follows the accidental style ("C#", or "C#/Db" with Both), except where that spelling
    would need double sharps or flats in the chord and the other one doesn't (A♯ major is shown
    as B♭: B♭ D F, not A♯ C𝄪 E♯). */
function spelledAnswer(r: ChordRound, style: AccidentalStyle, seq: number) {
  const parts = chordRoundParts(r, style, seq);
  const labels = parts.root.split("/");
  let root = labels[0];
  if (labels.length > 1) {
    if (spellingCost(r, labels[1]) < spellingCost(r, root)) root = labels[1];
  } else {
    const other = ENHARMONIC_ROOT[root];
    if (other && spellingCost(r, root) >= 2 && spellingCost(r, other) < spellingCost(r, root)) {
      root = other;
      parts.root = other;
    }
  }
  const notes = chordTones(r, root).map((t, i) => withOctave(t.name, r.rootMidi + r.quality.intervals[i]));
  if (r.bassPc !== null && parts.bass) {
    const bassMidi = parseNote(r.notes[0]) ?? r.rootMidi - 12;
    notes.unshift(withOctave(parts.bass.split("/")[0], bassMidi));
  }
  return { parts, notes };
}

/** How long a chord rings for playback, and (arpeggio style) the gap between its notes — longer
    than a single note or an interval's two notes, since a full chord (especially an extended
    one) needs a moment to actually be heard as a chord. */
const CHORD_NOTE_DURATION_SECONDS = 1.8;
const ARPEGGIO_GAP_MS = 90;

const MIN_ROUND_COUNT = 5;
const MAX_ROUND_COUNT = 50;
const DEFAULT_ROUND_COUNT = 12;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 2000;
/** After a miss, the right chord stays up at least this long (whatever "Next chord after" says). */
const MIN_MISS_PAUSE_MS = 2500;

const DEFAULT_SLASH_CHANCE = 35;

/** Reads a typed answer the way most musicians write chords: an upper-case M in the quality means
    major ("CM7" is C major 7, "CmM7" minor-major 7), a lower-case m minor. The shared parser
    (also used by the mobile app) folds case, so the M is spelled out as "maj" here first. */
function readChord(raw: string) {
  const m = /^(\s*[A-Ga-g](?:#|b|♯|♭)?)(.*)$/.exec(raw);
  // A bare Δ (what the keypad's Δ key types) means major 7, as on a chart: "CΔ", "CΔ/E".
  const text = m ? m[1] + m[2].replace(/M(?![Aa])/g, "maj").replace(/^(-?)\s*[\^Δ∆]\s*(?=$|\/)/, "$1^7") : raw;
  return parseChordInput(text);
}

const ROOT_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
/** With the letters and the symbol keypad, these type every chord in the pool, so on a touch
    screen the phone's keyboard can stay down. */
const DIGIT_KEYS = ["2", "5", "6", "7", "9", "11", "13"];

/** With "Give the root" on, the answer field holds only the quality (the root sits in a badge
    beside it); this puts the given root back in front. If what's typed already starts with a root
    letter (someone typing the whole chord out of habit), it's taken as it is, never doubled. */
function withGivenRoot(text: string, root: string | null): string {
  const t = text.trim();
  if (!root || /^[A-G]/.test(t)) return t;
  return root + t;
}

type PlaybackStyle = "block" | "arpeggio";
const PLAYBACK_STYLES: { value: PlaybackStyle; label: string }[] = [
  { value: "block", label: "Block (all notes at once)" },
  { value: "arpeggio", label: "Arpeggio (quick roll)" },
];

/** Which octave a round's root is drawn from — a chord isn't "played on an instrument" the way
    the other trainers' notes/scales/intervals are, so there's no instrument list here, just a
    plain register choice. */
type Register = { id: string; label: string; lowMidi: number; highMidi: number };
const REGISTERS: Register[] = [
  { id: "low", label: "Low", lowMidi: 36, highMidi: 47 },
  { id: "mid", label: "Mid", lowMidi: 48, highMidi: 59 },
  { id: "high", label: "High", lowMidi: 60, highMidi: 71 },
  { id: "wide", label: "Wide (low to high)", lowMidi: 36, highMidi: 71 },
];
const DEFAULT_REGISTER_ID = "mid";

type Session = {
  total: number;
  index: number;
  round: ChordRound | null;
  best: Grade | null;
  results: Grade[];
  rounds: ChordRound[];
  /** What was actually typed for each graded round, parallel to `results`/`rounds` — shown in
      the results list so a wrong answer can be compared against what was actually typed. */
  answers: string[];
  queue: ChordRound[];
};

type Summary = { results: Grade[]; rounds: ChordRound[]; answers: string[] };

/** Everything that affects what's played, how it's timed, and how it's graded — two attempts
    only get compared against each other if all of this matches. */
type HistoryConfig = {
  registerId: string;
  drillMode: boolean;
  roundCount: number;
  /** The selected chord ids, sorted and joined, so the set (order doesn't matter) compares with
      a plain `===`. */
  chordIdsKey: string;
  slashChance: number;
  roundSeconds: number;
  advanceDelayMs: number;
  playbackStyle: PlaybackStyle;
};

function sameConfig(a: HistoryConfig, b: HistoryConfig): boolean {
  return (Object.keys(a) as (keyof HistoryConfig)[]).every(
    (key) => a[key] === b[key],
  );
}

type HistoryEntry = {
  at: number;
  elapsedMs: number;
  score: number;
  total: number;
  config: HistoryConfig;
};

const PANEL_IDS = [
  "chord-set",
  "chord-range",
  "chord-timing",
  "chord-sound",
];
const SETTINGS_KEY = "jam-practice-guess-the-chord";
const DEFAULT_SETTINGS = {
  learnMode: false,
  registerId: DEFAULT_REGISTER_ID,
  roundSeconds: DEFAULT_ROUND_SECONDS,
  advanceDelayMs: DEFAULT_ADVANCE_DELAY_MS,
  soundFeedback: false,
  roundCount: DEFAULT_ROUND_COUNT,
  drillMode: false,
  slashChance: DEFAULT_SLASH_CHANCE,
  giveRoot: true,
  chordIds: DEFAULT_ENABLED_CHORD_IDS as string[],
  chordStats: {} as Record<string, GradeCounts>,
  toneId: DEFAULT_EAR_TRAINING_TONE_ID,
  playbackStyle: "block" as PlaybackStyle,
  revealNotes: true,
  accidentalStyle: "sharp" as AccidentalStyle,
  history: [] as HistoryEntry[],
};

export default function GuessTheChord() {
  const [settings, updateSettings] = useSyncedSettings(
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
  );
  const {
    roundSeconds,
    advanceDelayMs,
    soundFeedback,
    drillMode,
    roundCount: rawRoundCount,
    slashChance,
    giveRoot,
    playbackStyle,
    revealNotes,
  } = settings;
  const learnMode = settings.learnMode;
  const learn = useLearnSession("chord");
  const history = settings.history.filter(
    (h): h is HistoryEntry =>
      !!h && typeof h.config === "object" && h.config !== null,
  );
  const accidentalStyle = ACCIDENTAL_STYLES.some(
    (s) => s.value === settings.accidentalStyle,
  )
    ? settings.accidentalStyle
    : "sharp";
  // Guards against a toneId saved before the Tone options here were narrowed to just Piano/Rhodes
  // (e.g. still "triangle" from an earlier session) — falls back to the new default instead of
  // silently keeping a tone that's no longer offered in the dropdown.
  const toneId = EAR_TRAINING_TONES.some((t) => t.id === settings.toneId)
    ? settings.toneId
    : DEFAULT_EAR_TRAINING_TONE_ID;
  const roundCount = Math.min(
    MAX_ROUND_COUNT,
    Math.max(MIN_ROUND_COUNT, Math.round(rawRoundCount)),
  );
  const register =
    REGISTERS.find((r) => r.id === settings.registerId) ??
    REGISTERS.find((r) => r.id === DEFAULT_REGISTER_ID)!;
  const pool = CHORD_QUALITIES.filter((q) => settings.chordIds.includes(q.id));
  const setRegisterId = (registerId: string) => updateSettings({ registerId });
  const setRoundSeconds = (roundSeconds: number) =>
    updateSettings({ roundSeconds });
  const setDrillMode = (drillMode: boolean) => updateSettings({ drillMode });
  const setRoundCount = (roundCount: number) => updateSettings({ roundCount });
  const setGiveRoot = (giveRoot: boolean) => updateSettings({ giveRoot });
  const setSoundFeedback = (soundFeedback: boolean) =>
    updateSettings({ soundFeedback });
  const setToneId = (toneId: string) => updateSettings({ toneId });
  const setPlaybackStyle = (playbackStyle: PlaybackStyle) =>
    updateSettings({ playbackStyle });
  const setRevealNotes = (revealNotes: boolean) =>
    updateSettings({ revealNotes });
  const setAccidentalStyle = (accidentalStyle: AccidentalStyle) =>
    updateSettings({ accidentalStyle });
  const toggleChord = (id: string) =>
    updateSettings({
      chordIds: settings.chordIds.includes(id)
        ? settings.chordIds.filter((x) => x !== id)
        : [...settings.chordIds, id],
    });

  const [round, setRound] = useState<ChordRound | null>(null);
  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/guess-the-chord", running);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [typed, setTyped] = useState("");
  /** Shown under the answer field when Submit can't read what's typed (it doesn't count). */
  const [typeHint, setTypeHint] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    index: number;
    total: number;
  } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [roundSeed, setRoundSeed] = useState(0);
  // So "Try again" repeats a "Shed weak chords" run instead of falling back to a normal one.
  const [lastMode, setLastMode] = useState<"normal" | "weak">("normal");
  // The learning-path level being played (0-based), while a learn-mode session runs.
  const [activeLevel, setActiveLevel] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noteTimerRef = useRef({ startedAt: 0, durationMs: 1000 });
  // Bumped every time a new round is chosen, so "random" accidental spelling stays put for as
  // long as that round's on screen instead of re-rolling on every re-render.
  const roundSeedRef = useRef(0);
  const sessionStartRef = useRef<number | null>(null);
  const toneIdRef = useRef(toneId);
  const playbackStyleRef = useRef(playbackStyle);
  const mountedRef = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  const cfgRef = useRef({ advanceDelayMs, soundFeedback });
  // The source of truth for what's currently typed, mirrored alongside `typed` so the timeout
  // grader (which runs from a `setInterval` closure created once per session, not re-created on
  // every keystroke) always sees the latest value instead of whatever was typed when that
  // closure was created.
  const typedRef = useRef("");
  /** The root shown beside the answer field this round ("Give the root"), or null. */
  const givenRootRef = useRef<string | null>(null);
  const skipRef = useRef<(() => void) | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inputElRef = useRef<HTMLInputElement | null>(null);
  // The source of truth for chordStats *during* a running session — see the identical note on
  // Note Trainer's noteStatsRef for why a ref (not the settings value) is what gets bumped.
  const chordStatsRef = useRef(settings.chordStats);

  useEffect(() => {
    toneIdRef.current = toneId;
    playbackStyleRef.current = playbackStyle;
    cfgRef.current = { advanceDelayMs, soundFeedback };
  }, [toneId, playbackStyle, advanceDelayMs, soundFeedback]);

  useEffect(() => {
    chordStatsRef.current = settings.chordStats;
  }, [settings.chordStats]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
      playbackTimeouts.current.forEach(clearTimeout);
      countdownClickTimeouts.current.forEach(clearTimeout);
    };
  }, []);

  // Autofocus the answer field for each fresh, ungraded round, cursor at the end — so typing can
  // start immediately without clicking into it first. Not on a
  // touch screen: the phone's keyboard would pop up over the symbol keypad.
  useEffect(() => {
    if (!running || !round || status || isTouchFirst()) return;
    const el = inputElRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [round, running, status]);

  function setTypedValue(value: string) {
    setTyped(value);
    setTypeHint(null);
    typedRef.current = value;
  }

  /** Struggle stats are tracked per chord quality only — not root, not the slash bass (which is
      randomized independently of the quality anyway) — mirroring Guess the Interval's per-
      interval (not per-note) keying. */
  function bumpChordStat(qualityId: string, grade: Grade) {
    chordStatsRef.current = bumpGradeCounts(chordStatsRef.current, qualityId, grade);
    updateSettings({ chordStats: chordStatsRef.current });
  }

  function clearChordStats() {
    chordStatsRef.current = {};
    updateSettings({ chordStats: {} });
  }

  type WeakChord = { key: string; quality: ChordQuality; counts: GradeCounts; score: number };

  /** Every struggling quality in `stats`, worst first. A plain function of its arguments (not
      the ref) so it's just as safe to call during render (for the button's count) as from inside
      a running session (via `chordStatsRef.current`). */
  function weakChordEntries(stats: Record<string, GradeCounts>): WeakChord[] {
    return rankWeak(stats)
      .map((entry) => {
        const quality = chordQualityById(entry.key);
        return quality && { key: entry.key, quality, counts: entry.counts, score: entry.score };
      })
      .filter((e): e is WeakChord => !!e);
  }

  function clearPlayback() {
    playbackTimeouts.current.forEach(clearTimeout);
    playbackTimeouts.current = [];
  }

  function clearCountdownClicks() {
    countdownClickTimeouts.current.forEach(clearTimeout);
    countdownClickTimeouts.current = [];
  }

  /** A short neutral click, for "Sound feedback" — reuses the metronome's click tone rather than
      a pitched note, since this is a cue, not a note to imitate. */
  function playClick() {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    scheduleClick(ctx, ctx.currentTime + 0.02, "sine", 1000, 0.5, 0.05);
  }

  /** One click per whole second of the countdown to the next chord, for "Sound feedback". */
  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!cfgRef.current.soundFeedback) return;
    const wholeSeconds = Math.floor(durationMs / 1000);
    for (let s = 1; s <= wholeSeconds; s++) {
      countdownClickTimeouts.current.push(setTimeout(playClick, s * 1000));
    }
  }

  /** Plays every note of the chord — all at once ("block") or quickly rolled ("arpeggio") — per
      the "Playback style" setting. */
  function playChordSound(notes: string[]) {
    clearPlayback();
    if (playbackStyleRef.current === "arpeggio") {
      notes.forEach((n, i) => {
        playbackTimeouts.current.push(
          setTimeout(
            () => playNote(n, CHORD_NOTE_DURATION_SECONDS, toneIdRef.current),
            i * ARPEGGIO_GAP_MS,
          ),
        );
      });
    } else {
      void playNotesTogether(notes, CHORD_NOTE_DURATION_SECONDS, toneIdRef.current);
    }
  }

  function endSession() {
    if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
    skipTimeoutRef.current = null;
    skipRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    clearPlayback();
    clearCountdownClicks();
    sessionRef.current = null;
    setRunning(false);
    setStatus(null);
    setProgress(null);
    setActiveLevel(null);
  }

  function stop() {
    endSession();
  }

  /** Lets the round's pass/fail be seen briefly before moving on. */
  function scheduleAdvance(index: number, delayMs: number) {
    if (skipTimeoutRef.current) return;
    skipTimeoutRef.current = setTimeout(() => {
      skipTimeoutRef.current = null;
      if (sessionRef.current?.index === index) skipRef.current?.();
    }, delayMs);
  }

  /** Locks in a round's grade and starts the pause-before-next-chord countdown: retargets the
      ring/label (previously counting down the time left to answer) to the pause instead, so it
      visibly counts down to the next chord, and plays the click/tick sounds when "Sound
      feedback" is on. */
  function lockInRound(grade: Grade) {
    const session = sessionRef.current;
    if (!session || !session.round) return;
    session.best = grade;
    setStatus(grade);
    // A miss holds a little longer, so there's time to read the right chord against what was
    // typed ("Next" moves on sooner).
    const pauseMs =
      grade === "incorrect"
        ? Math.max(cfgRef.current.advanceDelayMs, MIN_MISS_PAUSE_MS)
        : cfgRef.current.advanceDelayMs;
    // Only ever reached from gradeAndReveal (a form submit, the "I don't know" button, or the
    // max-time timer), never during render — same ref-mutation timing pattern every trainer here
    // uses.
    // eslint-disable-next-line react-hooks/purity
    noteTimerRef.current = { startedAt: performance.now(), durationMs: pauseMs };
    if (cfgRef.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    scheduleAdvance(session.index, pauseMs);
  }

  /** Grades whatever's currently typed (parsed via `parseChordInput`) against the active round
      and reveals it — used both by an explicit submit and by the "time to answer" timer running
      out, so a timeout still shows the correct answer instead of just silently moving on. Empty
      or unrecognized input grades as incorrect here, same as a wrong guess; an explicit Submit
      checks it first (`submitAnswer`) and doesn't count something it can't read. */
  function gradeAndReveal() {
    const session = sessionRef.current;
    if (!session || !session.round || session.best !== null) return;
    const answer = withGivenRoot(typedRef.current, givenRootRef.current);
    const parsed = readChord(answer);
    const grade: Grade =
      parsed && chordInputMatchesRound(parsed, session.round) ? "correct" : "incorrect";
    session.answers.push(answer);
    lockInRound(grade);
  }

  function submitAnswer(e?: React.FormEvent) {
    e?.preventDefault();
    const text = withGivenRoot(typedRef.current, givenRootRef.current);
    if (!text) {
      setTypeHint("Type a chord first, or press I don't know.");
      return;
    }
    // Something that doesn't read as a chord yet ("Exyz") is never graded: Submit is disabled
    // and Enter does nothing (the line under the field already says "Not a chord name yet").
    if (!readChord(text)?.qualityId) {
      setTypeHint("Couldn't read that chord. Try Cmaj7, D-7 or G7/B.");
      return;
    }
    gradeAndReveal();
  }

  /** Inserts a symbol-keypad key's text at the answer field's current cursor position (not just
      appended to the end), then puts the cursor right after it so tapping several keys in a row
      reads naturally. `selectionStart`/`selectionEnd` survive the field losing focus to the
      button click (each key's `onMouseDown` also prevents that focus change outright, so the
      field never visibly loses focus at all), so this works whether or not the tap blurs it. */
  function insertSymbol(text: string) {
    const el = inputElRef.current;
    const start = el?.selectionStart ?? typed.length;
    const end = el?.selectionEnd ?? typed.length;
    const next = typed.slice(0, start) + text + typed.slice(end);
    setTypedValue(next);
    const pos = start + text.length;
    // On a touch screen, only keep the caret where it was if the field already has focus —
    // focusing it would open the phone's keyboard over the keypad.
    const refocus = !isTouchFirst() || document.activeElement === el;
    // The DOM <input> doesn't have the new value yet this same tick (setTypedValue just
    // scheduled the re-render) — wait a frame so the caret is placed against the text that's
    // actually there instead of the stale, shorter value.
    requestAnimationFrame(() => {
      if (!refocus) return;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function backspace() {
    const el = inputElRef.current;
    const start = el?.selectionStart ?? typed.length;
    const end = el?.selectionEnd ?? typed.length;
    const from = start === end ? Math.max(0, start - 1) : start;
    setTypedValue(typed.slice(0, from) + typed.slice(end));
    const refocus = !isTouchFirst() || document.activeElement === el;
    requestAnimationFrame(() => {
      if (!refocus) return;
      el?.focus();
      el?.setSelectionRange(from, from);
    });
  }

  /** `"weak"` starts a focused session on just the qualities tracked as struggles (see
      `weakChordEntries`) instead of the normal quiz/drill — one round per struggling quality, not
      the full 12-key sweep "Drill every chord" does, so it stays a quick, targeted practice on
      exactly what's giving trouble. Never touches the timed History list, since a short focused
      session isn't a fair comparison against a full one. */
  async function start(mode: "normal" | "weak" | "learn" = "normal", levelIndex?: number) {
    const weak = mode === "weak";
    // `"learn"`: a learning-path level (`levelIndex`, else the selected one) — a fixed set of
    // rounds over that level's chords (no slash bass), scored at the end to pass the level.
    const learnLevel = mode === "learn" ? (levelIndex ?? learn.selected) : null;
    if (mode !== "learn") setLastMode(mode);
    learn.clearResult();
    const weakList = weak ? weakChordEntries(chordStatsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError("No struggling chords yet — a wrong or missed answer builds this list up.");
      return;
    }
    if (learnLevel === null && !weak && pool.length === 0) {
      setError("Select at least one chord quality to practice.");
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearPlayback();

    const slashProbability = slashChance / 100;
    // "Drill every chord" and "shed weak chords" both play through a fixed queue rather than
    // `roundCount` random draws — same machinery either way, just a different queue.
    const drilling = weak || learnLevel !== null ? true : drillMode;
    const queue = learnLevel !== null
      ? levelQueue("chord", learnLevel).map((id) =>
          randomChordRound(register.lowMidi, register.highMidi, [chordQualityById(id)!], 0),
        )
      : weak
      ? shuffled(
          weakList.map((e) =>
            randomChordRound(register.lowMidi, register.highMidi, [e.quality], slashProbability),
          ),
        )
      : drilling
        ? shuffled(
            drillQueueForPool(register.lowMidi, register.highMidi, pool, slashProbability),
          )
        : [];

    sessionRef.current = {
      total: drilling ? queue.length : roundCount,
      index: 0,
      round: null,
      best: null,
      results: [],
      rounds: [],
      answers: [],
      queue,
    };
    // Only ever reached from start() itself (a button's onClick, or a space-bar toggle) — not
    // called during render.
    // eslint-disable-next-line react-hooks/purity
    sessionStartRef.current = performance.now();

    const seconds = Math.max(MIN_ROUND_SECONDS, roundSeconds);
    const advance = () => {
      if (skipTimeoutRef.current) {
        clearTimeout(skipTimeoutRef.current);
        skipTimeoutRef.current = null;
      }
      clearPlayback();
      clearCountdownClicks();
      const session = sessionRef.current;
      if (session) {
        // Every path that reaches here (an explicit submit, "I don't know", or the max-time
        // timer via onTimeUp) already ran gradeAndReveal — which sets session.best and pushes
        // this round's typed answer — before scheduleAdvance ever gets here, so `best` and
        // `answers` are always already in sync with what's about to be pushed below.
        const finishedGrade = session.best ?? "incorrect";
        if (session.round) {
          session.results.push(finishedGrade);
          session.rounds.push(session.round);
          bumpChordStat(session.round.quality.id, finishedGrade);
          // Drill mode: a miss goes back on the end of the queue — with a freshly randomized
          // octave for the retry (same quality, root and slash bass), so a repeated miss doesn't
          // look like the identical round stuck on screen.
          if (drilling && learnLevel === null && finishedGrade === "incorrect") {
            const requeued = chordRoundForRootAndQuality(
              register.lowMidi,
              register.highMidi,
              session.round.quality,
              session.round.rootPc,
              session.round.bassPc,
            );
            if (requeued) session.queue.push(requeued);
          }
        }
        const done = drilling
          ? session.queue.length === 0
          : session.index >= session.total;
        if (done && learnLevel !== null) {
          sessionStartRef.current = null;
          learn.finish(learnLevel, session.results);
          setRound(null);
          endSession();
          return;
        }
        if (done) {
          const elapsedMs = sessionStartRef.current
            ? performance.now() - sessionStartRef.current
            : 0;
          sessionStartRef.current = null;
          if (weak) {
            // A weed-out session over a handful of struggling chords isn't a fair comparison
            // against a full quiz/drill, so it doesn't join that leaderboard.
            setLastElapsedMs(null);
            setIsNewBest(false);
          } else {
            const config: HistoryConfig = {
              registerId: register.id,
              drillMode,
              roundCount,
              chordIdsKey: pool
                .map((q) => q.id)
                .sort()
                .join(","),
              slashChance,
              roundSeconds,
              advanceDelayMs,
              playbackStyle,
            };
            // Compare against times recorded before this one, so tying/beating an empty
            // history (a first attempt) still counts as a new best.
            const previousBest =
              bestPassingMs(history.filter((h) => sameConfig(h.config, config))) ?? Infinity;
            const score = scoreOf(session.results);
            const entry: HistoryEntry = {
              at: Date.now(),
              elapsedMs,
              score,
              total: session.results.length,
              config,
            };
            updateSettings({ history: [...history, entry].slice(-50) });
            setLastElapsedMs(elapsedMs);
            setIsNewBest(passedRound(entry) && elapsedMs < previousBest);
          }
          setSummary({
            results: session.results,
            rounds: session.rounds,
            answers: session.answers,
          });
          setRound(null);
          endSession();
          return;
        }
        session.index++;
        session.best = null;
        setStatus(null);
        // Drill mode's total grows when a chord gets requeued, so "X of Y" reflects what's
        // actually left rather than staying fixed at the pool size.
        setProgress(
          drilling && learnLevel === null
            ? {
                index: session.index,
                total: session.index + session.queue.length,
              }
            : { index: session.index, total: session.total },
        );
      }

      const next =
        drilling && session
          ? session.queue.shift()!
          : randomChordRound(register.lowMidi, register.highMidi, pool, slashProbability);
      if (session) session.round = next;
      roundSeedRef.current++;
      setRoundSeed(roundSeedRef.current);
      noteTimerRef.current = {
        startedAt: performance.now(),
        durationMs: seconds * 1000,
      };
      setRound(next);
      // "Give the root" shows the root in a badge beside the field, so typing (and struggling)
      // is about the quality/slash bass, not also having to name the root by ear. The field
      // itself starts empty either way.
      givenRootRef.current = giveRoot ? pcLabel(next.rootPc, accidentalStyle, roundSeedRef.current) : null;
      setTypedValue("");
      playChordSound(next.notes);
    };

    // Grades whatever's typed the instant the "max time to answer" runs out, instead of the
    // periodic tick just silently advancing — see `gradeAndReveal`'s own note on why.
    const onTimeUp = () => gradeAndReveal();

    // Answering early (or the "I don't know" button) restarts the timer so the next round gets
    // its own full max time rather than continuing on the old round's schedule.
    skipRef.current = () => {
      advance();
      if (sessionRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(onTimeUp, seconds * 1000);
      }
    };

    advance();
    setRunning(true);
    setActiveLevel(learnLevel);
    intervalRef.current = setInterval(onTimeUp, seconds * 1000);
  }

  useSpaceToggle(running ? stop : () => void start(learnMode ? "learn" : "normal"));

  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) =>
    summary?.results.filter((g) => g === grade).length ?? 0;
  const currentConfig: HistoryConfig = {
    registerId: register.id,
    drillMode,
    roundCount,
    chordIdsKey: pool
      .map((q) => q.id)
      .sort()
      .join(","),
    slashChance,
    roundSeconds,
    advanceDelayMs,
    playbackStyle,
  };
  const matchingHistory = history.filter((h) =>
    sameConfig(h.config, currentConfig),
  );
  const bestMs = bestPassingMs(matchingHistory);
  const weakEntries = weakChordEntries(settings.chordStats);

  function revealedLabel(r: ChordRound, seq: number) {
    const { parts } = spelledAnswer(r, accidentalStyle, seq);
    return noteGlyphs(`${parts.root}${parts.quality}${parts.bass ? `/${parts.bass}` : ""}`);
  }

  const revealedText = round && status ? revealedLabel(round, roundSeed) : null;
  // The same root the round started with (`pcLabel` is deterministic for a given seed).
  const givenRoot = giveRoot && round ? pcLabel(round.rootPc, accidentalStyle, roundSeed) : null;
  const fullTyped = withGivenRoot(typed, givenRoot);
  const typedParsed = round && !status ? readChord(fullTyped) : null;
  // "?" until the round is answered, so the circle never looks like it's giving the answer away.
  const mainLabel = !running || !round ? "?" : (revealedText ?? "?");
  const mainLabelLong = mainLabel.length > 6;
  // The big label shows the right chord once answered: green when the answer was right, the
  // normal text colour when it wasn't (what was typed is shown in a small line underneath).
  const glow = running && status === "correct" ? GRADE_COLOR.correct : null;
  const typedAnswer = fullTyped;
  const typedAnswerParsed = status === "incorrect" && typedAnswer ? readChord(typedAnswer) : null;
  const typedAnswerParts = typedAnswerParsed ? formatChordParts(typedAnswerParsed) : null;
  const missLine =
    status !== "incorrect"
      ? null
      : !typedAnswer
        ? "No answer"
        : `You typed ${
            typedAnswerParts
              ? `${typedAnswerParts.root}${typedAnswerParts.quality}${typedAnswerParts.bass ? `/${typedAnswerParts.bass}` : ""}`
              : typedAnswer
          }`;
  // What the typed chord reads as, live under the field ("Reads as C-7 · Minor 7").
  const typedQuality = typedParsed?.qualityId ? chordQualityById(typedParsed.qualityId) : undefined;
  const readingLine = !typedParsed
    ? null
    : typedQuality
      ? `Reads as ${noteGlyphs(`${typedParsed.rootLetter}${typedParsed.rootAccidental ?? ""}`)}${prettyQuality(typedQuality.suffix)}${
          typedParsed.bassLetter ? `/${noteGlyphs(`${typedParsed.bassLetter}${typedParsed.bassAccidental ?? ""}`)}` : ""
        } · ${typedQuality.name}`
      : "Not a chord name yet";
  const canSubmit = !!typedQuality;
  const showCountdown = running;
  const revealedNoteNames =
    revealNotes && status && round
      ? spelledAnswer(round, accidentalStyle, roundSeed).notes.map(noteGlyphs).join(" · ")
      : null;

  return (
    <ToolLayout
      title="Guess the Chord"
      presets={toolPresets("guess-the-chord", settings, updateSettings)}
      optionsMode={
        <Segmented
          onPage
          label="Mode"
          value={learnMode ? "learn" : "practice"}
          onChange={(v) => updateSettings({ learnMode: v === "learn" })}
          disabled={running}
          options={[
            { value: "practice", label: "Practice" },
            { value: "learn", label: "Learn" },
          ]}
        />
      }
      // Hidden until there's something in them, so a first visit leads with the tool itself.
      sidePanel={
        (history.length > 0 || weakEntries.length > 0) && (
        <>
          {/* Only finished rounds land here; a stopped round counts toward Struggles only. */}
          {history.length > 0 && (
            <CollapsiblePanel
              id="history"
              title="History"
              icon={ListIcon}
              summary={
                bestMs !== null
                  ? `Best ${formatDuration(bestMs)}`
                  : matchingHistory.length > 0
                    ? `${matchingHistory.length} ${matchingHistory.length === 1 ? "round" : "rounds"}`
                    : "None yet"
              }
            >
              {bestMs !== null && (
                <p className="text-sm font-medium tabular-nums">
                  Best {formatDuration(bestMs)}
                </p>
              )}
              {matchingHistory.length === 0 ? (
                <p className="text-sm text-muted">
                  Finish a round with these settings to see it here.
                </p>
              ) : (
                <div className={PANEL_LIST}>
                  {[...matchingHistory]
                    .sort((a, b) => b.at - a.at)
                    .map((entry, i) => (
                      <HistoryRow key={i} score={entry.score} total={entry.total} elapsedMs={entry.elapsedMs}>
                        {entry.config.drillMode ? "Drill" : "Quiz"} ·{" "}
                        {formatFileDate(entry.at)}
                      </HistoryRow>
                    ))}
                </div>
              )}
              {matchingHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      history: history.filter(
                        (h) => !sameConfig(h.config, currentConfig),
                      ),
                    })
                  }
                  className={TEXT_BUTTON_DANGER}
                >
                  Clear these times
                </button>
              )}
            </CollapsiblePanel>
          )}

          <CollapsiblePanel
            id="struggles"
            title="Struggles"
            icon={FlagIcon}
            summary={weakEntries.length ? `${weakEntries.length} weak` : undefined}
          >
            {weakEntries.length === 0 ? (
              <p className="text-sm text-muted">
                No struggles tracked yet — a wrong or missed answer adds it here.
              </p>
            ) : (
              <div className={PANEL_LIST}>
                {weakEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className={PANEL_ROW}
                  >
                    <span className="font-medium">{entry.quality.name}</span>
                    <StruggleCounts counts={entry.counts} />
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => void start("weak")}
              disabled={running || weakEntries.length === 0}
              className={PRIMARY_BUTTON_SM}
            >
              Shed weak chords{weakEntries.length > 0 && ` (${weakEntries.length})`}
            </button>
            {weakEntries.length > 0 && (
              <button
                type="button"
                onClick={clearChordStats}
                disabled={running}
                className={TEXT_BUTTON_DANGER}
              >
                Clear stats
              </button>
            )}
          </CollapsiblePanel>
        </>
        )
      }
      // Hidden while a session runs, so the round has the screen to itself.
      options={
        running ? null : (
        <>
          <PanelsToggle ids={PANEL_IDS} />
          {!learnMode && (
          <CollapsiblePanel id="chord-set" title="Chords" icon={ChordIcon} summary={`${pool.length} of ${CHORD_QUALITIES.length}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted">
                {pool.length} of {CHORD_QUALITIES.length} selected
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({ chordIds: CHORD_QUALITIES.map((q) => q.id) })
                  }
                  disabled={running}
                  className={POOL_BUTTON}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ chordIds: [] })}
                  disabled={running}
                  className={POOL_BUTTON}
                >
                  None
                </button>
              </div>
            </div>
            <Hint>
              Which chord qualities can be picked for a round. At least one must stay selected.
            </Hint>

            {CHORD_CATEGORIES.map((category) => (
              <div key={category} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">
                  {category}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CHORD_QUALITIES.filter((q) => q.category === category).map(
                    (quality) => {
                      const selected = settings.chordIds.includes(quality.id);
                      return (
                        <PoolPill key={quality.id} on={selected} onClick={() => toggleChord(quality.id)} disabled={running} title={quality.name} plainClassName="rounded-md px-3 py-1.5 text-xs font-medium">
                          C{prettyQuality(quality.suffix)}
                        </PoolPill>
                      );
                    },
                  )}
                </div>
              </div>
            ))}

            <AdvancedSlider
              label="Chance of a slash (bass note) chord"
              value={slashChance}
              unit="%"
              min={0}
              max={100}
              step={5}
              disabled={running}
              onChange={(v) => updateSettings({ slashChance: v })}
              hint="How often a round adds a bass note that isn't the root — anywhere from a normal inversion to a genuinely weird, unrelated bass note."
            />

            <SwitchRow
              label="Give the root"
              checked={giveRoot}
              onChange={setGiveRoot}
              disabled={running}
              hint="Shows the chord's root beside the answer box, so you only type the quality and slash bass, not also name the root by ear. Off makes the whole chord, root included, something you have to work out."
            />

            <SwitchRow
              label="Drill every chord"
              checked={drillMode}
              onChange={setDrillMode}
              disabled={running}
              hint="Plays every selected chord quality, starting on all 12 keys, each in a random octave (with an independent chance of a slash bass each time)."
            />
          </CollapsiblePanel>
          )}

          <CollapsiblePanel id="chord-range" title="Register" icon={SlidersIcon} summary={register.label}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Register</span>
              <Select
                value={register.id}
                onChange={setRegisterId}
                disabled={running}
                options={REGISTERS.map((r) => ({ value: r.id, label: r.label }))}
              />
            </label>
            <Hint>
              Which octave range the chord&apos;s root is drawn from — not an instrument&apos;s
              playable range, just where it sits for listening.
            </Hint>
          </CollapsiblePanel>

          <CollapsiblePanel id="chord-timing" title="Timing" icon={StopwatchIcon} summary={`${roundSeconds} s`}>
            <AdvancedSlider
              label="Max time to answer"
              value={roundSeconds}
              unit=" s"
              min={MIN_ROUND_SECONDS}
              max={MAX_ROUND_SECONDS}
              step={1}
              disabled={running}
              onChange={setRoundSeconds}
              hint="How long you have to type and submit an answer before it's marked a miss and moves on."
            />

            <AdvancedSlider
              label="Time between rounds"
              value={advanceDelayMs / 1000}
              unit=" s"
              min={MIN_ADVANCE_DELAY_MS / 1000}
              max={MAX_ADVANCE_DELAY_MS / 1000}
              step={0.25}
              disabled={running}
              hint="How long the revealed answer (with its countdown ring) stays on screen before the next chord plays."
              onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
            />

            {!drillMode && !learnMode && (
              <AdvancedSlider
                label="Number of rounds"
                value={roundCount}
                unit=""
                min={MIN_ROUND_COUNT}
                max={MAX_ROUND_COUNT}
                step={1}
                disabled={running}
                onChange={setRoundCount}
                hint="How many chords make up one session."
              />
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            id="chord-sound"
            title="Sound & display"
            icon={SlidersIcon}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Playback style</span>
              <Select
                value={playbackStyle}
                onChange={setPlaybackStyle}
                disabled={running}
                options={PLAYBACK_STYLES}
              />
            </label>
            <Hint>Whether the chord&apos;s notes play all at once or as a quick rolled arpeggio.</Hint>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Tone</span>
              <Select
                value={toneId}
                onChange={setToneId}
                options={EAR_TRAINING_TONES.map((tone) => ({
                  value: tone.id,
                  label: tone.label,
                }))}
              />
            </label>
            <Hint>
              Which sound plays the chord — Piano or Rhodes read the most like an actual chord.
            </Hint>

            <SwitchRow
              label="Reveal notes after answering"
              checked={revealNotes}
              onChange={setRevealNotes}
              hint="Shows the actual notes that were played once a round is graded."
            />

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Accidentals</span>
              <Select
                value={accidentalStyle}
                onChange={setAccidentalStyle}
                options={ACCIDENTAL_STYLES}
              />
            </label>
            <Hint>How sharps and flats are spelled in the revealed answer, e.g. C# vs Db.</Hint>

            <SwitchRow
              label="Sound feedback"
              checked={soundFeedback}
              onChange={setSoundFeedback}
              hint="A click each second of the countdown, plus a click the instant a round is graded."
            />
          </CollapsiblePanel>
        </>
        )
      }
    >
      {learnMode && !running && (
        <LearningPath
          track="chord"
          progress={learn.progress}
          selected={learn.selected}
          onSelect={learn.select}
          onStart={() => void start("learn")}
        />
      )}
      <div className="flex w-full flex-col items-center gap-3">
        {activeLevel !== null && running && (
          <p className={LEVEL_LABEL}>
            Level {activeLevel + 1} · {learn.levels[activeLevel].title} ·{" "}
            {cumulativeItems("chord", activeLevel).length} chords in play
          </p>
        )}
        {/* Steps aside while a finished run's results show. */}
        {!(learnMode && !running) && !(summary && !running) && (
        // Smaller while a round runs, so the keypad, Submit and Stop all fit on the screen.
        <div className={`relative flex items-center justify-center p-4 text-center ${running ? "h-32 w-32" : "h-44 w-44 sm:h-56 sm:w-56"}`}>
          {!running && <span aria-hidden className={IDLE_RING} />}
          <CountdownRing active={showCountdown} timerRef={noteTimerRef} />
          <p
            className={!running ? IDLE_MARK : `relative z-10 font-bold in-[.classic-look]:font-extrabold transition-colors duration-200 ${
              mainLabelLong ? "text-lg leading-tight" : "text-2xl"
            }`}
            style={
              glow
                ? {
                    color: glow,
                  }
                : undefined
            }
          >
            {mainLabel}
          </p>
        </div>
        )}
        {/* Before the first round, say what's about to happen. */}
        {!running && !learnMode && !summary && <p className={IDLE_HINT}>Press Start, listen to the chord, then type its symbol.</p>}

        {/* Two lines that are always there while a round runs (what you typed, the notes), so
            answering doesn't move the keypad or buttons. */}
        {running && round && (
          <div className="flex w-full flex-col items-center">
            {givenRoot && !status ? (
              <p className={`${FEEDBACK_LINE} text-muted`}>Root given: {noteGlyphs(givenRoot)} · type the quality</p>
            ) : (
              <p className={`${FEEDBACK_LINE} text-danger`}>{missLine}</p>
            )}
            <p className={`${FEEDBACK_LINE} tabular-nums text-muted`}>{revealedNoteNames}</p>
          </div>
        )}

        {/* Stays in place once answered (greyed out), with Next where Submit was. */}
        {running && round && (
          <form
            onSubmit={(e) => {
              if (status) {
                e.preventDefault();
                skipRef.current?.();
              } else submitAnswer(e);
            }}
            className="flex w-full flex-col items-center gap-2"
          >
            <div className="flex w-full max-w-[22rem] flex-col gap-1">
              {!giveRoot && (
                <div role="group" aria-label="Root keypad" className="grid grid-cols-7 gap-1">
                  {ROOT_LETTERS.map((l) => (
                    <KeypadKey key={l} label={l} disabled={!!status} onPress={() => insertSymbol(l)} />
                  ))}
                </div>
              )}
              <ChordSymbolKeypad onInsert={insertSymbol} disabled={!!status} />
              <div role="group" aria-label="Number keypad" className="grid grid-cols-8 gap-1">
                {DIGIT_KEYS.map((d) => (
                  <KeypadKey key={d} label={d} disabled={!!status} onPress={() => insertSymbol(d)} />
                ))}
                <KeypadKey label="⌫" title="Delete" disabled={!!status} onPress={backspace} />
              </div>
            </div>
            <div className="flex w-full max-w-[16rem] items-center gap-2">
            {givenRoot && (
              <span
                className="flex h-11 shrink-0 items-center rounded-md bg-foreground/[0.08] px-3 text-lg font-semibold text-foreground"
                title="The root is given; type the rest"
              >
                {noteGlyphs(givenRoot)}
              </span>
            )}
            {/* The keypad types every answer, so a tap on the box shows its caret but not the
                phone's keyboard (as in Guess the Progression). Set from the tap itself, before
                focus, so a hardware keyboard or a mouse click still types normally. */}
            <input
              ref={inputElRef}
              type="text"
              onPointerDown={(e) => {
                e.currentTarget.inputMode = e.pointerType === "touch" ? "none" : "text";
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              readOnly={!!status}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={givenRoot ? "e.g. ^7, -7 or 7/B" : "e.g. F#^7 or Ab-7/D"}
              aria-label={givenRoot ? `Your answer: the chord quality (the root, ${givenRoot}, is given)` : "Your answer"}
              aria-describedby="chord-type-hint"
              className={`${ANSWER_INPUT} min-w-0`}
            />
            </div>
            <p id="chord-type-hint" role="status" className="h-5 max-w-full truncate text-sm leading-5 text-muted">
              {status ? (
                <>
                  Next chord in <CountdownLabel active={running} timerRef={noteTimerRef} />
                </>
              ) : (
                (typeHint ?? readingLine)
              )}
            </p>
            {/* Replay, Submit and I don't know on one centred row; once answered, Next takes
                Submit's place and I don't know only turns invisible, so nothing moves. */}
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => playChordSound(round.notes)}
                className={SECONDARY_BUTTON}
              >
                <PlayIcon className="h-3.5 w-3.5" />
                Replay
              </button>
              <button
                type="submit"
                disabled={!status && !canSubmit}
                className={PRIMARY_BUTTON}
              >
                {status ? "Next" : "Submit"}
              </button>
              <button
                type="button"
                onClick={gradeAndReveal}
                disabled={!!status}
                className={`${SECONDARY_BUTTON} ${status ? "invisible" : ""}`}
              >
                I don&apos;t know
              </button>
            </div>
          </form>
        )}

        {!(learnMode && !running) && (
        // Keyed by the round, so it closes again for each new chord rather than staying open
        // and pushing the progress line off the screen.
        <details key={running ? roundSeed : "idle"} className="w-full max-w-xs text-left text-xs text-muted">
          <DisclosureSummary className="mx-auto">How to type a chord</DisclosureSummary>
          <p className="mt-2">Root, then the quality, then an optional /bass note.</p>
          <ul className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <li className="contents"><code>^7</code> <span>or <code>maj7</code>, <code>M7</code>: major 7</span></li>
            <li className="contents"><code>-7</code> <span>or <code>m7</code>: minor 7</span></li>
            <li className="contents"><code>7</code> <span>dominant 7</span></li>
            <li className="contents"><code>h7</code> <span>or <code>m7b5</code>: half-diminished (ø7)</span></li>
            <li className="contents"><code>o7</code> <span>or <code>dim7</code>: diminished 7</span></li>
            <li className="contents"><code>+</code> <span>or <code>aug</code>: augmented</span></li>
            <li className="contents"><code>sus4</code> <span>suspended</span></li>
            <li className="contents"><code>/E</code> <span>bass note, as in <code>C/E</code></span></li>
          </ul>
          <p className="mt-1.5">Upper-case M is major, lower-case m is minor.</p>
        </details>
        )}

        {running && progress && (
          <p className="tabular-nums text-sm text-muted">
            Chord {progress.index} of {progress.total}
            {" · "}
            <ElapsedTimer active={running} startRef={sessionStartRef} />
          </p>
        )}
      </div>

      {summary && !running && !learnMode && (
        <section
          aria-label="Results"
          className={RESULTS_PANEL}
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted">Results</p>
              <p className="text-3xl font-semibold tabular-nums">
                {score % 1 === 0 ? score : score.toFixed(1)}
                <span className="text-lg font-medium text-muted">
                  {" "}
                  / {summary.results.length}
                </span>
              </p>
            </div>
            <p className="text-xl font-medium tabular-nums text-muted">
              {summary.results.length
                ? Math.round((score / summary.results.length) * 100)
                : 0}
              %
            </p>
          </div>

          {lastElapsedMs !== null && (
            <p className="text-xs text-muted tabular-nums">
              Time {formatDuration(lastElapsedMs)}
              {bestMs !== null && ` · Best ${formatDuration(bestMs)}`}
              {isNewBest && (
                <span
                  className="ml-1.5 font-semibold"
                  style={{ color: GRADE_COLOR.correct }}
                >
                  New best!
                </span>
              )}
            </p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {(["correct", "incorrect"] as const).map((grade) => (
              <div key={grade} className="flex items-baseline gap-1.5">
                <p
                  className="font-semibold tabular-nums"
                  style={{ color: GRADE_COLOR[grade] }}
                >
                  {tally(grade)}
                </p>
                <p className="text-muted">{GRADE_LABEL[grade]}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col divide-y divide-foreground/10 rounded-md bg-foreground/[0.05]">
            {summary.rounds.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span
                  className="font-medium"
                  style={{ color: GRADE_COLOR[summary.results[i]] }}
                >
                  {revealedLabel(r, i)}
                </span>
                {summary.results[i] === "incorrect" && summary.answers[i] && (
                  <span className="truncate text-xs text-muted">
                    you typed &quot;{summary.answers[i]}&quot;
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void start(lastMode)}
              className={PRIMARY_BUTTON}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setSummary(null)}
              className={SECONDARY_BUTTON}
            >
              Close
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* While the results show, their own "Try again" is the one start button. */}
      {!(summary && !running && !learnMode) && (
      <button
        type="button"
        onClick={running ? stop : () => void start(learnMode ? "learn" : "normal")}
        className={startButtonClass(running)}
      >
        {running ? "Stop" : learnMode ? `Start level ${learn.selected + 1}` : "Start"}
      </button>
      )}
      {learn.result && (
        <LevelComplete
          result={learn.result}
          toneId={toneId}
          onNext={() => void start("learn", learn.result!.levelNumber)}
          onRetry={() => void start("learn", learn.result!.levelNumber - 1)}
          onClose={learn.clearResult}
        />
      )}
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to start or stop
      </KeyHint>
    </ToolLayout>
  );
}
