"use client";

import { useEffect, useRef, useState } from "react";
import { DisclosureSummary } from "@/components/Disclosure";
import SwitchRow from "@/components/SwitchRow";
import ChordSymbolKeypad from "@/components/ChordSymbolKeypad";
import Hint from "@/components/Hint";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import KeyHint from "@/components/KeyHint";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import Select from "@/components/Select";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import {
  FlagIcon,
  NoteIcon,
  PlayIcon,
  ProgressionIcon,
  SlidersIcon,
  StopwatchIcon,
  ListIcon,
} from "@/components/tools";
import { scheduleClick } from "@/lib/clickEngine";
import { getAudioContext } from "@/lib/metronome";
import { GRADE_LABEL, Grade, scoreOf } from "@/lib/noteGrade";
import { formatChordParts, parseChordInput, pcLabel } from "@/lib/chords";
import { prettyQuality } from "@/lib/iRealPro";
import {
  AnswerMode,
  DEFAULT_ENABLED_PROGRESSION_IDS,
  PROGRESSIONS,
  PROGRESSION_CATEGORIES,
  Progression,
  ProgressionRound,
  chordNameText,
  firstChordRoot,
  gradeAnswer,
  isMinorFamily,
  parseNumeral,
  prettyNumeral,
  progressionById,
  progressionRound,
  randomProgressionRound,
  splitAnswer,
} from "@/lib/progressions";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import {
  DEFAULT_EAR_TRAINING_TONE_ID,
  EAR_TRAINING_TONES,
  playNote,
  playNotesTogether,
  prepareNotes,
} from "@/lib/tones";
import { ACCIDENTAL_STYLES, AccidentalStyle } from "@/lib/noteSpelling";
import { formatDuration, shuffled } from "@/lib/trainerUtils";
import { GradeCounts, bumpGradeCounts, rankWeak } from "@/lib/struggleStats";
import AdvancedSlider from "@/components/AdvancedSlider";
import CountdownLabel from "@/components/CountdownLabel";
import CountdownRing from "@/components/CountdownRing";
import ElapsedTimer from "@/components/ElapsedTimer";
import LearningPath from "@/components/learning/LearningPath";
import LevelComplete from "@/components/learning/LevelComplete";
import { levelQueue } from "@/lib/learningPath";
import { useLearnSession } from "@/lib/useLearnSession";
import { useToolActivity } from "@/lib/toolTime";
import { formatFileDate } from "@/lib/files";
import { PoolPill } from "@/components/reward/Reward";
import StruggleCounts from "@/components/learning/StruggleCounts";
import { GRADE_COLOR, ANSWER_INPUT, LEVEL_LABEL, PANEL_LIST, PANEL_ROW, PRIMARY_BUTTON, PRIMARY_BUTTON_SM, RESULTS_PANEL, SECONDARY_BUTTON, TEXT_BUTTON_DANGER, startButtonClass, POOL_BUTTON, IDLE_MARK, IDLE_RING, bestPassingMs, passedRound, isTouchFirst, noteGlyphs } from "@/components/learning/quizUi";
import HistoryRow from "@/components/learning/HistoryRow";

const MIN_ROUND_SECONDS = 10;
const MAX_ROUND_SECONDS = 90;
const DEFAULT_ROUND_SECONDS = 40;

const MIN_CHORD_SECONDS = 0.8;
const MAX_CHORD_SECONDS = 3;
const DEFAULT_CHORD_SECONDS = 1.6;
const ARPEGGIO_GAP_MS = 90;

const MIN_ROUND_COUNT = 3;
const MAX_ROUND_COUNT = 30;
const DEFAULT_ROUND_COUNT = 8;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 3000;

type PlaybackStyle = "block" | "arpeggio";
const PLAYBACK_STYLES: { value: PlaybackStyle; label: string }[] = [
  { value: "block", label: "Block (all notes at once)" },
  { value: "arpeggio", label: "Arpeggio (quick roll)" },
];

/** Where the key's tonic is drawn from (the chords are voiced around it). */
type Register = { id: string; label: string; lowMidi: number; highMidi: number };
const REGISTERS: Register[] = [
  { id: "low", label: "Low", lowMidi: 41, highMidi: 52 },
  { id: "mid", label: "Mid", lowMidi: 48, highMidi: 59 },
  { id: "high", label: "High", lowMidi: 55, highMidi: 66 },
];
const DEFAULT_REGISTER_ID = "mid";

const KEY_OPTIONS = [
  { value: "random", label: "Random" },
  ...Array.from({ length: 12 }, (_, pc) => ({
    value: String(pc),
    label: noteGlyphs(pcLabel(pc, "flat", 0)),
  })),
];

type Session = {
  total: number;
  index: number;
  round: ProgressionRound | null;
  best: Grade | null;
  results: Grade[];
  rounds: ProgressionRound[];
  /** Per-chord right/wrong for each graded round, parallel to `rounds`. */
  marks: boolean[][];
  answers: string[];
  queue: ProgressionRound[];
};

type Summary = { results: Grade[]; rounds: ProgressionRound[]; marks: boolean[][]; answers: string[] };

/** Everything that affects what's played, how it's timed and how it's graded — two attempts only
    get compared if all of this matches. */
type HistoryConfig = {
  answerMode: AnswerMode;
  typeQualities: boolean;
  keyChoice: string;
  registerId: string;
  drillMode: boolean;
  roundCount: number;
  progressionIdsKey: string;
  roundSeconds: number;
  advanceDelayMs: number;
  chordSeconds: number;
  playbackStyle: PlaybackStyle;
  playKeyFirst: boolean;
};

function sameConfig(a: HistoryConfig, b: HistoryConfig): boolean {
  return (Object.keys(a) as (keyof HistoryConfig)[]).every((key) => a[key] === b[key]);
}

type HistoryEntry = {
  at: number;
  elapsedMs: number;
  score: number;
  total: number;
  config: HistoryConfig;
};

const SETTINGS_KEY = "jam-practice-guess-the-progression";
const DEFAULT_SETTINGS = {
  learnMode: false,
  answerMode: "numerals" as AnswerMode,
  typeQualities: true,
  keyChoice: "random",
  registerId: DEFAULT_REGISTER_ID,
  playKeyFirst: false,
  roundSeconds: DEFAULT_ROUND_SECONDS,
  advanceDelayMs: DEFAULT_ADVANCE_DELAY_MS,
  soundFeedback: false,
  roundCount: DEFAULT_ROUND_COUNT,
  drillMode: false,
  progressionIds: DEFAULT_ENABLED_PROGRESSION_IDS as string[],
  progressionStats: {} as Record<string, GradeCounts>,
  toneId: DEFAULT_EAR_TRAINING_TONE_ID,
  playbackStyle: "block" as PlaybackStyle,
  chordSeconds: DEFAULT_CHORD_SECONDS,
  accidentalStyle: "flat" as AccidentalStyle,
  history: [] as HistoryEntry[],
};

/** Every chord correct → correct, some → partial, none → incorrect. */
function gradeOf(marks: boolean[]): Grade {
  const right = marks.filter(Boolean).length;
  if (right === marks.length) return "correct";
  return right > 0 ? "partial" : "incorrect";
}

/** How one typed token is drawn while typing: a numeral with its suffix's glyphs, or a chord name
    the same way Guess the Chord previews it. */
function prettyToken(token: string, mode: AnswerMode): string {
  if (mode === "numerals") return prettyNumeral(token);
  const parsed = parseChordInput(token);
  if (!parsed) return token;
  const parts = formatChordParts(parsed);
  return `${parts.root}${parts.quality}${parts.bass ? `/${parts.bass}` : ""}`;
}

/** A progression numeral split into accidental, numeral and suffix ("iih7" → "", "ii", "h7"). */
const NUMERAL_PARTS = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/;

/** Why a chord that names the right numeral (or root) was still marked wrong, shown under its
    slot ("missing ø7", "should be minor"), so "ii V I" for "iiø7 V7 i" doesn't read as 0 / 3 for
    no reason. Null when the numeral/root itself is wrong (the slot already shows the right one). */
function slotReason(
  token: string | undefined,
  round: ProgressionRound,
  index: number,
  mode: AnswerMode,
  qualities: boolean,
): string | null {
  if (!token) return null;
  const chord = round.progression.chords[index];
  const minor = isMinorFamily(chord.quality.id);
  let typedRaw: string;
  let targetSuffix: string;
  if (mode === "numerals") {
    const parsed = parseNumeral(token);
    if (!parsed || parsed.degree !== chord.degree) return null;
    if (parsed.lower !== minor) return minor ? "should be lowercase" : "should be upper case";
    typedRaw = parsed.qualityRaw;
    targetSuffix = NUMERAL_PARTS.exec(chord.numeral)?.[3] ?? "";
  } else {
    const parsed = parseChordInput(token);
    if (!parsed || parsed.rootPc !== (round.tonicPc + chord.degree) % 12) return null;
    if (parsed.bassPc !== null) return "no slash bass";
    const typedMinor = parsed.qualityId
      ? isMinorFamily(parsed.qualityId)
      : /^(-|m(?!aj)|min|h|ø|o|°|dim)/i.test(parsed.qualityRaw.trim());
    if (typedMinor !== minor) return minor ? "should be minor" : "should be major";
    typedRaw = parsed.qualityRaw;
    targetSuffix = chord.quality.suffix;
  }
  if (!qualities) return null;
  const target = prettyQuality(targetSuffix);
  if (!target) return "just the triad";
  return typedRaw.trim() ? `should be ${target}` : `missing ${target}`;
}

const UPPER_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];
const LOWER_NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii"];
const ROOT_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const DIGIT_KEYS = ["7", "6", "9", "11", "13"];

function KeypadKey({
  label,
  caption,
  title,
  onPress,
  wide,
}: {
  label: string;
  caption?: string;
  title?: string;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-label={title ?? label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-md bg-foreground/[0.05] px-1.5 py-1.5 hover:bg-surface-hover pointer-coarse:min-h-10 ${
        wide ? "col-span-2" : ""
      }`}
    >
      <span className="text-base font-semibold leading-none">{label}</span>
      {caption && <span className="text-xs leading-none text-muted">{caption}</span>}
    </button>
  );
}

export default function GuessTheProgression() {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const {
    roundSeconds,
    advanceDelayMs,
    soundFeedback,
    drillMode,
    roundCount: rawRoundCount,
    typeQualities,
    playKeyFirst,
    playbackStyle,
    chordSeconds,
  } = settings;
  const learnMode = settings.learnMode;
  const learn = useLearnSession("progression");
  const answerMode: AnswerMode = settings.answerMode === "chords" ? "chords" : "numerals";
  const history = settings.history.filter(
    (h): h is HistoryEntry => !!h && typeof h.config === "object" && h.config !== null,
  );
  const accidentalStyle = ACCIDENTAL_STYLES.some((s) => s.value === settings.accidentalStyle)
    ? settings.accidentalStyle
    : "flat";
  const toneId = EAR_TRAINING_TONES.some((t) => t.id === settings.toneId)
    ? settings.toneId
    : DEFAULT_EAR_TRAINING_TONE_ID;
  const roundCount = Math.min(MAX_ROUND_COUNT, Math.max(MIN_ROUND_COUNT, Math.round(rawRoundCount)));
  const register =
    REGISTERS.find((r) => r.id === settings.registerId) ??
    REGISTERS.find((r) => r.id === DEFAULT_REGISTER_ID)!;
  const keyChoice = KEY_OPTIONS.some((k) => k.value === settings.keyChoice) ? settings.keyChoice : "random";
  const fixedPc = keyChoice === "random" ? null : Number(keyChoice);
  const pool = PROGRESSIONS.filter((p) => settings.progressionIds.includes(p.id));
  const toggleProgression = (id: string) =>
    updateSettings({
      progressionIds: settings.progressionIds.includes(id)
        ? settings.progressionIds.filter((x) => x !== id)
        : [...settings.progressionIds, id],
    });

  const [round, setRound] = useState<ProgressionRound | null>(null);
  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/guess-the-progression", running);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const [typed, setTyped] = useState("");
  /** Shown under the chords when Submit is held back (too few or too many chords typed). */
  const [typeHint, setTypeHint] = useState<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [lastMode, setLastMode] = useState<"normal" | "weak">("normal");
  // The learning-path level being played (0-based), while a learn-mode session runs.
  const [activeLevel, setActiveLevel] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noteTimerRef = useRef({ startedAt: 0, durationMs: 1000 });
  const sessionStartRef = useRef<number | null>(null);
  const audioCfgRef = useRef({ toneId, playbackStyle, chordSeconds, playKeyFirst });
  const mountedRef = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  const cfgRef = useRef({ advanceDelayMs, soundFeedback, answerMode, typeQualities });
  // Mirrors `typed` for the timeout grader, whose closure is created once per session.
  const typedRef = useRef("");
  const skipRef = useRef<(() => void) | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Bumped whenever playback is cancelled, so a progression still loading its samples doesn't
  // start once it's no longer wanted (stopped, replayed, or the round moved on).
  const playGenRef = useRef(0);
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inputElRef = useRef<HTMLInputElement | null>(null);
  const statsRef = useRef(settings.progressionStats);

  useEffect(() => {
    audioCfgRef.current = { toneId, playbackStyle, chordSeconds, playKeyFirst };
    cfgRef.current = { advanceDelayMs, soundFeedback, answerMode, typeQualities };
  }, [toneId, playbackStyle, chordSeconds, playKeyFirst, advanceDelayMs, soundFeedback, answerMode, typeQualities]);

  useEffect(() => {
    statsRef.current = settings.progressionStats;
  }, [settings.progressionStats]);

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

  // Focus the answer field for each fresh round, cursor at the end (after a prefilled root). Not
  // on a touch screen: the phone's keyboard would pop up over the keypad.
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

  function bumpStat(id: string, grade: Grade) {
    statsRef.current = bumpGradeCounts(statsRef.current, id, grade);
    updateSettings({ progressionStats: statsRef.current });
  }

  function clearStats() {
    statsRef.current = {};
    updateSettings({ progressionStats: {} });
  }

  type WeakProgression = { key: string; progression: Progression; counts: GradeCounts; score: number };

  function weakEntriesOf(stats: Record<string, GradeCounts>): WeakProgression[] {
    return rankWeak(stats)
      .map((entry) => {
        const progression = progressionById(entry.key);
        return progression && { key: entry.key, progression, counts: entry.counts, score: entry.score };
      })
      .filter((e): e is WeakProgression => !!e);
  }

  function clearPlayback() {
    playGenRef.current++;
    playbackTimeouts.current.forEach(clearTimeout);
    playbackTimeouts.current = [];
    setPlayingIndex(null);
  }

  function clearCountdownClicks() {
    countdownClickTimeouts.current.forEach(clearTimeout);
    countdownClickTimeouts.current = [];
  }

  function playClick() {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    scheduleClick(ctx, ctx.currentTime + 0.02, "sine", 1000, 0.5, 0.05);
  }

  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!cfgRef.current.soundFeedback) return;
    const wholeSeconds = Math.floor(durationMs / 1000);
    for (let s = 1; s <= wholeSeconds; s++) {
      countdownClickTimeouts.current.push(setTimeout(playClick, s * 1000));
    }
  }

  function playChord(notes: string[], seconds: number) {
    const { toneId: tone, playbackStyle: style } = audioCfgRef.current;
    if (style === "arpeggio") {
      notes.forEach((n, i) => {
        playbackTimeouts.current.push(setTimeout(() => playNote(n, seconds, tone), i * ARPEGGIO_GAP_MS));
      });
    } else {
      void playNotesTogether(notes, seconds, tone);
    }
  }

  /** Plays the whole progression (optionally after the key's tonic chord and a beat's rest),
      lighting each chord's slot as it sounds. Every sample is loaded first, so the chords land on
      time even on a first play instead of each waiting on its own fetch. */
  async function playProgression(r: ProgressionRound) {
    clearPlayback();
    const gen = playGenRef.current;
    const { toneId: tone, chordSeconds: secs, playKeyFirst: withKey } = audioCfgRef.current;
    const chords = withKey ? [r.tonicVoicing, ...r.voicings] : r.voicings;
    await prepareNotes(chords.flat(), tone);
    if (gen !== playGenRef.current || !mountedRef.current) return;
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const stepMs = secs * 1000;
    // Rings a little past the next chord so the changes sound connected, not chopped.
    const ring = secs + 0.35;
    let at = 0;
    if (withKey) {
      playChord(r.tonicVoicing, ring);
      at = stepMs * 2;
    }
    r.voicings.forEach((notes, i) => {
      playbackTimeouts.current.push(
        setTimeout(() => {
          setPlayingIndex(i);
          playChord(notes, ring);
        }, at + i * stepMs),
      );
    });
    playbackTimeouts.current.push(
      setTimeout(() => setPlayingIndex(null), at + r.voicings.length * stepMs),
    );
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
    setMarks(null);
    setProgress(null);
    setActiveLevel(null);
  }

  function stop() {
    endSession();
  }

  function scheduleAdvance(index: number) {
    if (skipTimeoutRef.current) return;
    skipTimeoutRef.current = setTimeout(() => {
      skipTimeoutRef.current = null;
      if (sessionRef.current?.index === index) skipRef.current?.();
    }, cfgRef.current.advanceDelayMs);
  }

  /** Grades what's typed against the round and reveals it — from Submit, "I don't know", or the
      time running out, so a timeout still shows the answer. */
  function gradeAndReveal() {
    const session = sessionRef.current;
    if (!session || !session.round || session.best !== null) return;
    const { answerMode: mode, typeQualities: qualities } = cfgRef.current;
    const roundMarks = gradeAnswer(typedRef.current, session.round, mode, qualities);
    const grade = gradeOf(roundMarks);
    session.best = grade;
    session.answers.push(typedRef.current.trim());
    session.marks.push(roundMarks);
    setMarks(roundMarks);
    setStatus(grade);
    const pauseMs = cfgRef.current.advanceDelayMs;
    // Only reached from an event handler or the round timer, never during render.
    // eslint-disable-next-line react-hooks/purity
    noteTimerRef.current = { startedAt: performance.now(), durationMs: pauseMs };
    if (cfgRef.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    scheduleAdvance(session.index);
  }

  /** Submit only grades a complete answer: with fewer (or more) chords typed than the
      progression has, the question stays open and says so, rather than scoring the chords against
      the wrong slots. (Running out of time still grades whatever's there.) */
  function submitAnswer(e?: React.FormEvent) {
    e?.preventDefault();
    const session = sessionRef.current;
    if (!session?.round) return;
    const want = session.round.progression.chords.length;
    const got = splitAnswer(typedRef.current, cfgRef.current.answerMode).length;
    if (got === 0) {
      setTypeHint("Type the chords first, or press I don't know.");
      return;
    }
    if (got !== want) {
      setTypeHint(`${want} chords — you typed ${got}`);
      return;
    }
    gradeAndReveal();
  }

  /** Inserts keypad text at the cursor. `newChord` keys (a numeral, a root letter, a numeral's
      ♭/♯) start the next chord, so a space goes in first when the cursor's in the middle of one
      — "ii" then "V" types "ii V" — unless all that's there so far is that chord's accidental. */
  function insertText(text: string, newChord = false) {
    const el = inputElRef.current;
    const start = el?.selectionStart ?? typed.length;
    const end = el?.selectionEnd ?? typed.length;
    const before = typed.slice(0, start);
    const current = before.split(/\s/).pop() ?? "";
    const accidentalOnly = /^[b#♭♯]+$/.test(current);
    const needsSpace = newChord && current !== "" && !(accidentalOnly && !/^[b#♭♯]$/.test(text));
    const insert = (needsSpace ? " " : "") + text;
    const next = before + insert + typed.slice(end);
    setTypedValue(next);
    const pos = start + insert.length;
    // On a touch screen, don't focus a field that isn't already: it would open the keyboard.
    const refocus = !isTouchFirst() || document.activeElement === el;
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

  /** The text a fresh round's answer field starts with — the first chord's root in "Chord names"
      mode (the one thing you're given), nothing for numerals. */
  function prefillFor(r: ProgressionRound): string {
    return cfgRef.current.answerMode === "chords" ? firstChordRoot(r, accidentalStyle) : "";
  }

  const currentConfig: HistoryConfig = {
    answerMode,
    typeQualities,
    keyChoice,
    registerId: register.id,
    drillMode,
    roundCount,
    progressionIdsKey: pool
      .map((p) => p.id)
      .sort()
      .join(","),
    roundSeconds,
    advanceDelayMs,
    chordSeconds,
    playbackStyle,
    playKeyFirst,
  };

  /** `"weak"` runs one round per progression tracked as a struggle, and never joins History.
      `"learn"` plays a learning-path level (`levelIndex`, else the selected one): a fixed set of
      rounds over that level's progressions, scored at the end to pass (or not) the level. */
  function start(mode: "normal" | "weak" | "learn" = "normal", levelIndex?: number) {
    const weak = mode === "weak";
    const learnLevel = mode === "learn" ? (levelIndex ?? learn.selected) : null;
    if (mode !== "learn") setLastMode(mode);
    learn.clearResult();
    const weakList = weak ? weakEntriesOf(statsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError("No struggling progressions yet — a wrong or missed answer builds this list up.");
      return;
    }
    if (learnLevel === null && !weak && pool.length === 0) {
      setError("Select at least one progression to practice.");
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearPlayback();

    const low = register.lowMidi;
    const high = register.highMidi;
    const drilling = weak || learnLevel !== null ? true : drillMode;
    const queue = learnLevel !== null
      ? levelQueue("progression", learnLevel).map((id) => progressionRound(progressionById(id)!, low, high, fixedPc))
      : weak
      ? shuffled(weakList.map((e) => progressionRound(e.progression, low, high, fixedPc)))
      : drilling
        ? shuffled(pool.map((p) => progressionRound(p, low, high, fixedPc)))
        : [];

    sessionRef.current = {
      total: drilling ? queue.length : roundCount,
      index: 0,
      round: null,
      best: null,
      results: [],
      rounds: [],
      marks: [],
      answers: [],
      queue,
    };
    // Only reached from a button or the space-bar toggle, never during render.
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
        const finishedGrade = session.best ?? "incorrect";
        if (session.round) {
          session.results.push(finishedGrade);
          session.rounds.push(session.round);
          bumpStat(session.round.progression.id, finishedGrade);
          // Drill mode: anything short of fully right comes back later, in a new key.
          if (drilling && learnLevel === null && finishedGrade !== "correct") {
            session.queue.push(progressionRound(session.round.progression, low, high, fixedPc));
          }
        }
        const done = drilling ? session.queue.length === 0 : session.index >= session.total;
        if (done && learnLevel !== null) {
          sessionStartRef.current = null;
          learn.finish(learnLevel, session.results);
          setRound(null);
          endSession();
          return;
        }
        if (done) {
          const elapsedMs = sessionStartRef.current ? performance.now() - sessionStartRef.current : 0;
          sessionStartRef.current = null;
          if (weak) {
            setLastElapsedMs(null);
            setIsNewBest(false);
          } else {
            const config = currentConfig;
            const previousBest =
              bestPassingMs(history.filter((h) => sameConfig(h.config, config))) ?? Infinity;
            const entry: HistoryEntry = {
              at: Date.now(),
              elapsedMs,
              score: scoreOf(session.results),
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
            marks: session.marks,
            answers: session.answers,
          });
          setRound(null);
          endSession();
          return;
        }
        session.index++;
        session.best = null;
        setStatus(null);
        setMarks(null);
        setProgress(
          drilling && learnLevel === null
            ? { index: session.index, total: session.index + session.queue.length }
            : { index: session.index, total: session.total },
        );
      }

      const next =
        drilling && session
          ? session.queue.shift()!
          : randomProgressionRound(pool, low, high, fixedPc);
      if (session) session.round = next;
      noteTimerRef.current = { startedAt: performance.now(), durationMs: seconds * 1000 };
      setRound(next);
      setTypedValue(prefillFor(next));
      void playProgression(next);
    };

    const onTimeUp = () => gradeAndReveal();

    // Answering early restarts the timer so the next round gets its own full time.
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

  useSpaceToggle(running ? stop : () => start(learnMode ? "learn" : "normal"));

  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) => summary?.results.filter((g) => g === grade).length ?? 0;
  const matchingHistory = history.filter((h) => sameConfig(h.config, currentConfig));
  const bestMs = bestPassingMs(matchingHistory);
  const weakEntries = weakEntriesOf(settings.progressionStats);

  /** The correct answer for one chord, in the current answer mode. */
  function answerFor(r: ProgressionRound, i: number): string {
    return answerMode === "chords"
      ? prettyToken(chordNameText(r, i, accidentalStyle), "chords")
      : prettyNumeral(r.progression.chords[i].numeral);
  }

  const typedTokens = splitAnswer(typed, answerMode);
  const right = marks ? marks.filter(Boolean).length : 0;
  const centerLabel = !running || !round ? "?" : status && marks ? `${right}/${marks.length}` : "?";
  const glow = running && status ? GRADE_COLOR[status] : null;
  const keyName = round ? noteGlyphs(pcLabel(round.tonicPc, accidentalStyle, 0)) : null;

  return (
    <ToolLayout
      title="Guess the Progression"
      presets={toolPresets("guess-the-progression", settings, updateSettings)}
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
                <p className="text-sm font-medium tabular-nums">Best {formatDuration(bestMs)}</p>
              )}
              {matchingHistory.length === 0 ? (
                <p className="text-sm text-muted">Finish a round with these settings to see it here.</p>
              ) : (
                <div className={PANEL_LIST}>
                  {[...matchingHistory]
                    .sort((a, b) => b.at - a.at)
                    .map((entry, i) => (
                      <HistoryRow key={i} score={entry.score} total={entry.total} elapsedMs={entry.elapsedMs}>
                        {entry.config.drillMode ? "Drill" : "Quiz"} · {formatFileDate(entry.at)}
                      </HistoryRow>
                    ))}
                </div>
              )}
              {matchingHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({ history: history.filter((h) => !sameConfig(h.config, currentConfig)) })
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
                    <span className="font-medium">{entry.progression.name}</span>
                    <StruggleCounts counts={entry.counts} />
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => start("weak")}
              disabled={running || weakEntries.length === 0}
              className={PRIMARY_BUTTON_SM}
            >
              Shed weak progressions{weakEntries.length > 0 && ` (${weakEntries.length})`}
            </button>
            {weakEntries.length > 0 && (
              <button
                type="button"
                onClick={clearStats}
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
      // Hidden while a session runs, so the round has the screen to itself.
      options={
        running ? null : (
        <>
          {!learnMode && (
          <CollapsiblePanel
            id="progression-set"
            title="Progressions"
            icon={ProgressionIcon}
            summary={`${pool.length} of ${PROGRESSIONS.length}`}
            wide
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted">
                {pool.length} of {PROGRESSIONS.length} selected
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => updateSettings({ progressionIds: PROGRESSIONS.map((p) => p.id) })}
                  disabled={running}
                  className={POOL_BUTTON}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ progressionIds: [] })}
                  disabled={running}
                  className={POOL_BUTTON}
                >
                  None
                </button>
              </div>
            </div>
            <Hint>Which progressions can be picked for a round. At least one must stay selected.</Hint>
            {PROGRESSION_CATEGORIES.map((category) => (
              <div key={category} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">{category}</span>
                <div className="flex flex-wrap gap-1.5">
                  {PROGRESSIONS.filter((p) => p.category === category).map((p) => {
                    const selected = settings.progressionIds.includes(p.id);
                    return (
                      <PoolPill key={p.id} on={selected} onClick={() => toggleProgression(p.id)} disabled={running} title={p.chords.map((c) => prettyNumeral(c.numeral)).join(" ")} plainClassName="rounded-md px-3 py-1.5 text-xs font-medium">
                        {p.name}
                      </PoolPill>
                    );
                  })}
                </div>
              </div>
            ))}
            <SwitchRow
              label="Drill every progression"
              checked={drillMode}
              onChange={(v) => updateSettings({ drillMode: v })}
              disabled={running}
              hint="Plays each selected progression once, in shuffled order; any you don't get fully right come back later in a new key."
            />
          </CollapsiblePanel>
          )}

          <CollapsiblePanel
            id="progression-answer"
            title="Answer"
            icon={SlidersIcon}
            summary={
              answerMode === "numerals"
                ? typeQualities
                  ? "Numerals + qualities"
                  : "Numerals only"
                : typeQualities
                  ? "Chord symbols"
                  : "Chord roots only"
            }
          >
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Answer with</span>
              <Segmented
                label="Answer with"
                value={answerMode}
                onChange={(v) => updateSettings({ answerMode: v })}
                disabled={running}
                options={[
                  { value: "numerals", label: "Roman numerals" },
                  { value: "chords", label: "Chord names" },
                ]}
              />
            </div>
            <Hint>Type the progression as Roman numerals (ii V I), or as chord names in the key that was played (Dm G C).</Hint>
            <SwitchRow
              label="Type chord qualities"
              checked={typeQualities}
              onChange={(v) => updateSettings({ typeQualities: v })}
              disabled={running}
              hint={
                answerMode === "numerals"
                  ? "On: each numeral needs its quality too (ii7, V7, I^7, iiø7). Off: just the numerals — upper case for major, lower case for minor."
                  : "On: each chord needs its full symbol (D-7, G7, C^7). Off: just the roots, with a minor sign (D-) where the chord is minor."
              }
            />
            {answerMode === "chords" && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-muted">Accidentals</span>
                  <Select
                    value={accidentalStyle}
                    onChange={(v) => updateSettings({ accidentalStyle: v })}
                    options={ACCIDENTAL_STYLES}
                  />
                </label>
                <Hint>How sharps and flats are spelled in the given root and revealed chords, e.g. F# vs Gb.</Hint>
              </>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            id="progression-key"
            title="Key & sound"
            icon={NoteIcon}
            summary={keyChoice === "random" ? `Random · ${register.label}` : `${KEY_OPTIONS.find((k) => k.value === keyChoice)?.label} · ${register.label}`}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Key</span>
              <Select
                value={keyChoice}
                onChange={(v) => updateSettings({ keyChoice: v })}
                disabled={running}
                options={KEY_OPTIONS}
              />
            </label>
            <Hint>A new random key every round, or always the same one.</Hint>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Register</span>
              <Select
                value={register.id}
                onChange={(v) => updateSettings({ registerId: v })}
                disabled={running}
                options={REGISTERS.map((r) => ({ value: r.id, label: r.label }))}
              />
            </label>
            <Hint>How high or low the chords sit.</Hint>
            <SwitchRow
              label="Play the key first"
              checked={playKeyFirst}
              onChange={(v) => updateSettings({ playKeyFirst: v })}
              disabled={running}
              hint="Plays the key's tonic chord, then a beat of rest, before the progression — handy for one that doesn't start on I."
            />
            <AdvancedSlider
              label="Chord length"
              value={chordSeconds}
              unit=" s"
              min={MIN_CHORD_SECONDS}
              max={MAX_CHORD_SECONDS}
              step={0.1}
              onChange={(v) => updateSettings({ chordSeconds: v })}
              hint="How long each chord lasts before the next — shorter is faster and harder."
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Playback style</span>
              <Select
                value={playbackStyle}
                onChange={(v) => updateSettings({ playbackStyle: v })}
                options={PLAYBACK_STYLES}
              />
            </label>
            <Hint>Whether each chord&apos;s notes play all at once or as a quick rolled arpeggio.</Hint>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Tone</span>
              <Select
                value={toneId}
                onChange={(v) => updateSettings({ toneId: v })}
                options={EAR_TRAINING_TONES.map((tone) => ({ value: tone.id, label: tone.label }))}
              />
            </label>
            <Hint>Which sound plays the chords.</Hint>
            <SwitchRow
              label="Sound feedback"
              checked={soundFeedback}
              onChange={(v) => updateSettings({ soundFeedback: v })}
              hint="A click each second of the countdown, plus a click the instant a round is graded."
            />
          </CollapsiblePanel>

          <CollapsiblePanel id="progression-timing" title="Timing" icon={StopwatchIcon} summary={`${roundSeconds} s`}>
            <AdvancedSlider
              label="Max time to answer"
              value={roundSeconds}
              unit=" s"
              min={MIN_ROUND_SECONDS}
              max={MAX_ROUND_SECONDS}
              step={1}
              disabled={running}
              onChange={(v) => updateSettings({ roundSeconds: v })}
              hint="How long you have to type and submit an answer (counting while it plays) before it's marked and moves on."
            />
            <AdvancedSlider
              label="Time between rounds"
              value={advanceDelayMs / 1000}
              unit=" s"
              min={MIN_ADVANCE_DELAY_MS / 1000}
              max={MAX_ADVANCE_DELAY_MS / 1000}
              step={0.25}
              disabled={running}
              hint="How long the revealed answer stays on screen before the next progression plays."
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
                onChange={(v) => updateSettings({ roundCount: v })}
                hint="How many progressions make up one session."
              />
            )}
          </CollapsiblePanel>
        </>
        )
      }
    >
      {learnMode && !running && (
        <LearningPath
          track="progression"
          progress={learn.progress}
          selected={learn.selected}
          onSelect={learn.select}
          onStart={() => start("learn")}
        />
      )}
      <div className="flex w-full flex-col items-center gap-3">
        {activeLevel !== null && running && (
          <p className={LEVEL_LABEL}>
            Level {activeLevel + 1} · {learn.levels[activeLevel].title}
          </p>
        )}
        {/* Steps aside while a finished run's results show. */}
        {!(learnMode && !running) && !(summary && !running) && (
        // Smaller while a round runs, so the keypads, Submit and Stop all fit on a laptop screen.
        <div className={`relative flex items-center justify-center p-4 text-center ${running ? "h-28 w-28" : "h-36 w-36 sm:h-44 sm:w-44"}`}>
          {!running && <span aria-hidden className={IDLE_RING} />}
          <CountdownRing active={running} timerRef={noteTimerRef} />
          <span
            className={!running ? IDLE_MARK : "relative z-10 text-3xl font-bold tabular-nums transition-colors duration-200"}
            style={
              glow
                ? { color: glow }
                : undefined
            }
          >
            {centerLabel}
          </span>
        </div>
        )}
        {/* Before the first round, say what's about to happen (like the other ear trainers). */}
        {!learnMode && !running && !summary && (
          <p className="max-w-sm text-center text-sm text-muted">Press Start, listen to the chords, then write them down.</p>
        )}

        {round && running && (
          <>
            <div className="flex flex-wrap justify-center gap-1.5" aria-label="Chords">
              {round.progression.chords.map((_, i) => {
                const mark = marks?.[i];
                const shown = status ? answerFor(round, i) : typedTokens[i] ? prettyToken(typedTokens[i], answerMode) : "?";
                const color = status ? (mark ? GRADE_COLOR.correct : GRADE_COLOR.incorrect) : undefined;
                const reason = status && !mark ? slotReason(typedTokens[i], round, i, answerMode, typeQualities) : null;
                return (
                  // A fixed height with room for the "You: …" line, so answering doesn't grow it.
                  <div
                    key={i}
                    // Right / wrong tints the box; the chord that's playing gets an accent outline
                    // on top, so a replay never hides which ones were wrong.
                    className={`flex h-[3.75rem] min-w-14 flex-col items-center justify-center rounded-md border px-2.5 outline-offset-2 transition-colors ${
                      color ? "" : "border-foreground/15 bg-surface"
                    } ${playingIndex === i ? "outline-2 outline-accent" : ""}`}
                    style={color ? { borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` } : undefined}
                  >
                    <span
                      className={`text-lg font-semibold ${reason ? "leading-6" : "leading-7"} ${!status && !typedTokens[i] ? "text-muted" : ""}`}
                      style={color ? { color } : undefined}
                    >
                      {shown}
                    </span>
                    {status && !mark && typedTokens[i] && (
                      <span className="text-xs leading-4 text-muted">
                        You: {prettyToken(typedTokens[i], answerMode)}
                      </span>
                    )}
                    {reason && <span className="text-xs leading-4 text-muted">{reason}</span>}
                  </div>
                );
              })}
            </div>
            <p
              role="status"
              className={`h-5 max-w-full truncate text-xs leading-5 ${typeHint && !status ? "font-medium text-danger" : "text-muted"}`}
            >
              {status ? (
                <>
                  Key of {keyName}
                  {round.progression.minor ? " minor" : ""} · {round.progression.name} · next in{" "}
                  <CountdownLabel active={running} timerRef={noteTimerRef} />
                </>
              ) : typeHint ? (
                typeHint
              ) : answerMode === "chords" ? (
                `${round.progression.chords.length} chords · starts on ${noteGlyphs(firstChordRoot(round, accidentalStyle))}`
              ) : (
                `${round.progression.chords.length} chords`
              )}
            </p>
          </>
        )}

        {/* The answer box and buttons stay in place once answered, with Next where Submit was. */}
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
            {/* The keypads below can type every answer, so a tap on the box shows its caret but not
                the phone's keyboard (FB-26). Set before focus, from the tap itself, so a hardware
                keyboard or a mouse click still types normally. */}
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
              aria-label="Your answer"
              placeholder={
                answerMode === "numerals"
                  ? typeQualities
                    ? "e.g. ii7 V7 I^7"
                    : "e.g. ii V I"
                  : typeQualities
                    ? "e.g. D-7 G7 C^7"
                    : "e.g. D- G C"
              }
              className={`${ANSWER_INPUT} max-w-[20rem]`}
            />
            {/* Replay, Submit and I don't know on one row (Next takes Submit's place). */}
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => void playProgression(round)}
                className={SECONDARY_BUTTON}
              >
                <PlayIcon className="h-3.5 w-3.5" />
                Replay
              </button>
              <button
                type="submit"
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
            {/* The keypads sit under the buttons and go away once the round is graded, so the
                result isn't followed by a greyed-out keypad, and Next stays where Submit was. On
                a desktop the page is centred vertically, so there they only turn invisible (still
                taking their space); removing them would slide everything down under the pointer. */}
            <fieldset
              disabled={!!status}
              className={`flex w-full max-w-[22rem] min-w-0 flex-col gap-2 ${status ? "max-lg:hidden lg:invisible" : ""}`}
            >
              {answerMode === "numerals" ? (
                <div role="group" aria-label="Numeral keypad" className="grid grid-cols-8 gap-1">
                  {UPPER_NUMERALS.map((n) => (
                    <KeypadKey key={n} label={n} title={`${n} (major)`} onPress={() => insertText(n, true)} />
                  ))}
                  <KeypadKey label="♭" title="Flat (before a numeral)" onPress={() => insertText("b", true)} />
                  {LOWER_NUMERALS.map((n) => (
                    <KeypadKey key={n} label={n} title={`${n} (minor)`} onPress={() => insertText(n, true)} />
                  ))}
                  <KeypadKey label="♯" title="Sharp (before a numeral)" onPress={() => insertText("#", true)} />
                </div>
              ) : (
                <div role="group" aria-label="Root keypad" className="grid grid-cols-7 gap-1">
                  {ROOT_LETTERS.map((l) => (
                    <KeypadKey key={l} label={l} onPress={() => insertText(l, true)} />
                  ))}
                </div>
              )}
              {/* With numerals, ♭/♯ go before a numeral (the numeral rows have them), never inside
                  a chord's quality, so the symbol keypad leaves its own pair out. */}
              {(typeQualities || answerMode === "chords") && (
                <ChordSymbolKeypad
                  onInsert={(t) => insertText(t)}
                  omit={answerMode === "numerals" ? ["#", "b"] : undefined}
                />
              )}
              <div className="grid grid-cols-7 gap-1">
                {typeQualities ? (
                  DIGIT_KEYS.map((d) => <KeypadKey key={d} label={d} onPress={() => insertText(d)} />)
                ) : (
                  <div className="col-span-5" />
                )}
                <KeypadKey label="␣" caption="next" title="Next chord (space)" onPress={() => insertText(" ")} />
                <KeypadKey label="⌫" caption="delete" title="Delete" onPress={backspace} />
              </div>
            </fieldset>
          </form>
        )}

        {!running && !learnMode && (
          <details className="max-w-xs text-xs text-muted">
            <DisclosureSummary>How to type your answer</DisclosureSummary>
            <p className="mt-2">
            {answerMode === "numerals" ? (
              <>
                One numeral per chord, separated by spaces: upper case is major, lower case minor
                {typeQualities && (
                  <>
                    , then the quality — <code>ii7</code> minor 7, <code>V7</code> dominant 7,{" "}
                    <code>I^7</code> major 7, <code>iih7</code> half-diminished, <code>viio</code>{" "}
                    diminished
                  </>
                )}
                . Use <code>b</code>/<code>#</code> before a numeral for ♭VII, ♯IV, ….
              </>
            ) : (
              <>
                The chord names, separated by spaces —{" "}
                {typeQualities ? (
                  <>
                    full symbols like <code>D-7 G7 C^7</code>
                  </>
                ) : (
                  <>
                    just roots, with <code>-</code> for minor: <code>D- G C</code>
                  </>
                )}
                . You&apos;re given the first chord&apos;s root.
              </>
            )}
            </p>
          </details>
        )}

        {running && progress && (
          <p className="tabular-nums text-sm text-muted">
            Progression {progress.index} of {progress.total}
            {" · "}
            <ElapsedTimer active={running} startRef={sessionStartRef} />
          </p>
        )}
      </div>

      {summary && !running && !learnMode && (
        <section aria-label="Results" className={RESULTS_PANEL}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted">Results</p>
              <p className="text-3xl font-semibold tabular-nums">
                {score % 1 === 0 ? score : score.toFixed(1)}
                <span className="text-lg font-medium text-muted"> / {summary.results.length}</span>
              </p>
            </div>
            <p className="text-xl font-medium tabular-nums text-muted">
              {summary.results.length ? Math.round((score / summary.results.length) * 100) : 0}%
            </p>
          </div>

          {lastElapsedMs !== null && (
            <p className="text-xs text-muted tabular-nums">
              Time {formatDuration(lastElapsedMs)}
              {bestMs !== null && ` · Best ${formatDuration(bestMs)}`}
              {isNewBest && (
                <span className="ml-1.5 font-semibold" style={{ color: GRADE_COLOR.correct }}>
                  New best!
                </span>
              )}
            </p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {(["correct", "partial", "incorrect"] as const).map((grade) => (
              <div key={grade} className="flex items-baseline gap-1.5">
                <p className="font-semibold tabular-nums" style={{ color: GRADE_COLOR[grade] }}>
                  {tally(grade)}
                </p>
                <p className="text-muted">{GRADE_LABEL[grade]}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col divide-y divide-foreground/10 rounded-md bg-foreground/[0.05]">
            {summary.rounds.map((r, i) => (
              <div key={i} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {r.progression.chords.map((_, j) => (
                    <span
                      key={j}
                      className="font-medium"
                      style={{ color: summary.marks[i]?.[j] ? GRADE_COLOR.correct : GRADE_COLOR.incorrect }}
                    >
                      {answerFor(r, j)}
                    </span>
                  ))}
                  <span className="text-xs text-muted">
                    · {noteGlyphs(pcLabel(r.tonicPc, accidentalStyle, 0))}
                    {r.progression.minor ? " minor" : ""}
                  </span>
                </div>
                {summary.results[i] !== "correct" && summary.answers[i] && (
                  <span className="truncate text-xs text-muted">you typed &quot;{summary.answers[i]}&quot;</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => start(lastMode)}
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
        onClick={running ? stop : () => start(learnMode ? "learn" : "normal")}
        className={startButtonClass(running)}
      >
        {running ? "Stop" : learnMode ? `Start level ${learn.selected + 1}` : "Start"}
      </button>
      )}
      {learn.result && (
        <LevelComplete
          result={learn.result}
          toneId={toneId}
          onNext={() => start("learn", learn.result!.levelNumber)}
          onRetry={() => start("learn", learn.result!.levelNumber - 1)}
          onClose={learn.clearResult}
        />
      )}
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to start or stop
      </KeyHint>
    </ToolLayout>
  );
}
