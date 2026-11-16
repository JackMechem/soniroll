"use client";

import { useEffect, useRef, useState } from "react";
import SwitchRow from "@/components/SwitchRow";
import ChordSymbolKeypad from "@/components/ChordSymbolKeypad";
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
} from "@/components/tools";
import { scheduleClick } from "@/lib/clickEngine";
import { prettyQuality } from "@/lib/iRealPro";
import { getAudioContext } from "@/lib/metronome";
import { GRADE_COLOR, GRADE_LABEL, Grade, scoreOf } from "@/lib/noteGrade";
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
  attempts,
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
import { PoolPill } from "@/components/reward/Reward";

const MIN_ROUND_SECONDS = 5;
const MAX_ROUND_SECONDS = 45;
const DEFAULT_ROUND_SECONDS = 15;

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

const DEFAULT_SLASH_CHANCE = 35;

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
  // start immediately without clicking into it first, and (with "Give the root" on, prefilling
  // the field with the root) lands right after the prefilled text instead of before it.
  useEffect(() => {
    if (!running || !round || status) return;
    const el = inputElRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [round, running, status]);

  function setTypedValue(value: string) {
    setTyped(value);
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
  function scheduleAdvance(index: number) {
    if (skipTimeoutRef.current) return;
    skipTimeoutRef.current = setTimeout(() => {
      skipTimeoutRef.current = null;
      if (sessionRef.current?.index === index) skipRef.current?.();
    }, cfgRef.current.advanceDelayMs);
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
    const pauseMs = cfgRef.current.advanceDelayMs;
    // Only ever reached from gradeAndReveal (a form submit, the "I don't know" button, or the
    // max-time timer), never during render — same ref-mutation timing pattern every trainer here
    // uses.
    noteTimerRef.current = { startedAt: performance.now(), durationMs: pauseMs };
    if (cfgRef.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    scheduleAdvance(session.index);
  }

  /** Grades whatever's currently typed (parsed via `parseChordInput`) against the active round
      and reveals it — used both by an explicit submit and by the "time to answer" timer running
      out, so a timeout still shows the correct answer instead of just silently moving on. Empty
      or unrecognized input simply grades as incorrect, same as a wrong guess. */
  function gradeAndReveal() {
    const session = sessionRef.current;
    if (!session || !session.round || session.best !== null) return;
    const parsed = parseChordInput(typedRef.current);
    const grade: Grade =
      parsed && chordInputMatchesRound(parsed, session.round) ? "correct" : "incorrect";
    session.answers.push(typedRef.current.trim());
    lockInRound(grade);
  }

  function submitAnswer(e?: React.FormEvent) {
    e?.preventDefault();
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
    // The DOM <input> doesn't have the new value yet this same tick (setTypedValue just
    // scheduled the re-render) — wait a frame so the caret is placed against the text that's
    // actually there instead of the stale, shorter value.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
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
            const previousBest = history
              .filter((h) => sameConfig(h.config, config))
              .reduce((min, h) => Math.min(min, h.elapsedMs), Infinity);
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
            setIsNewBest(elapsedMs < previousBest);
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
      // "Give the root" pre-fills the answer with the root's letter, so typing (and struggling)
      // is about the quality/slash bass, not also having to name the root by ear — cleared for a
      // fresh, un-prefilled answer when the setting's off.
      setTypedValue(giveRoot ? pcLabel(next.rootPc, accidentalStyle, roundSeedRef.current) : "");
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
  const bestMs = matchingHistory.length
    ? Math.min(...matchingHistory.map((h) => h.elapsedMs))
    : null;
  const weakEntries = weakChordEntries(settings.chordStats);

  function revealedLabel(r: ChordRound, seq: number) {
    const parts = chordRoundParts(r, accidentalStyle, seq);
    return `${parts.root}${parts.quality}${parts.bass ? `/${parts.bass}` : ""}`;
  }

  const revealedText = round && status ? revealedLabel(round, roundSeed) : null;
  const typedParsed = round && !status ? parseChordInput(typed) : null;
  const typedParts = typedParsed ? formatChordParts(typedParsed) : null;
  const typedPreview = typedParts
    ? `${typedParts.root}${typedParts.quality}${typedParts.bass ? `/${typedParts.bass}` : ""}`
    : null;
  const mainLabel = !round ? "—" : (revealedText ?? typedPreview ?? "?");
  const mainLabelLong = mainLabel.length > 10;
  const glow = running && status ? GRADE_COLOR[status] : null;
  const showCountdown = running;
  const revealedNoteNames =
    revealNotes && status && round
      ? round.notes.join(" · ")
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
      sidePanel={
        <>
          <CollapsiblePanel
            id="history"
            title="History"
            icon={StopwatchIcon}
            summary={bestMs !== null ? `Best ${formatDuration(bestMs)}` : undefined}
          >
            {bestMs !== null && (
              <p className="text-sm font-semibold tabular-nums">
                Best {formatDuration(bestMs)}
              </p>
            )}
            {matchingHistory.length === 0 ? (
              <p className="text-sm text-muted">
                No attempts yet with these settings.
              </p>
            ) : (
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {[...matchingHistory]
                  .sort((a, b) => b.at - a.at)
                  .map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 border-b border-background/70 py-2 text-sm last:border-b-0"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium tabular-nums">
                          {formatDuration(entry.elapsedMs)}
                        </span>
                        <span className="text-xs text-muted">
                          {entry.config.drillMode ? "Drill" : "Quiz"} ·{" "}
                          {new Date(entry.at).toLocaleDateString()}
                        </span>
                      </div>
                      <span
                        className="tabular-nums text-muted"
                        style={
                          entry.score === entry.total
                            ? { color: GRADE_COLOR.correct }
                            : undefined
                        }
                      >
                        {entry.score % 1 === 0
                          ? entry.score
                          : entry.score.toFixed(1)}
                        /{entry.total}
                      </span>
                    </div>
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
                className="self-start text-sm font-medium text-muted hover:text-danger"
              >
                Clear these times
              </button>
            )}
          </CollapsiblePanel>

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
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {weakEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center justify-between gap-3 border-b border-background/70 py-2 text-sm last:border-b-0"
                  >
                    <span className="font-medium">{entry.quality.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                      {entry.counts.incorrect > 0 && (
                        <span style={{ color: GRADE_COLOR.incorrect }}>
                          ✕{entry.counts.incorrect}
                        </span>
                      )}
                      <span className="text-muted">
                        /{attempts(entry.counts)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => void start("weak")}
              disabled={running || weakEntries.length === 0}
              className="self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              Shed weak chords{weakEntries.length > 0 && ` (${weakEntries.length})`}
            </button>
            {weakEntries.length > 0 && (
              <button
                type="button"
                onClick={clearChordStats}
                disabled={running}
                className="self-start text-sm font-medium text-muted hover:text-danger disabled:opacity-50"
              >
                Clear stats
              </button>
            )}
          </CollapsiblePanel>
        </>
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
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({ chordIds: CHORD_QUALITIES.map((q) => q.id) })
                  }
                  disabled={running}
                  className="font-medium text-accent hover:underline disabled:opacity-50"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ chordIds: [] })}
                  disabled={running}
                  className="font-medium text-muted hover:underline disabled:opacity-50"
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
                <span className="text-xs font-semibold text-muted">
                  {category}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CHORD_QUALITIES.filter((q) => q.category === category).map(
                    (quality) => {
                      const selected = settings.chordIds.includes(quality.id);
                      return (
                        <PoolPill key={quality.id} on={selected} onClick={() => toggleChord(quality.id)} disabled={running} title={quality.name} plainClassName="rounded-full px-3 py-1.5 text-xs font-medium">
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
              hint="Pre-fills the answer with the chord's root, so typing (and being graded on) is about the quality and slash bass, not also naming the root by ear. Off makes the whole chord — root included — something you have to work out."
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

          <CollapsiblePanel id="chord-timing" title="Timing" icon={StopwatchIcon}>
            <AdvancedSlider
              label="Max time to answer"
              value={roundSeconds}
              unit="s"
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
              unit="s"
              min={MIN_ADVANCE_DELAY_MS / 1000}
              max={MAX_ADVANCE_DELAY_MS / 1000}
              step={0.25}
              disabled={running}
              hint="How long the revealed answer (with its countdown ring) stays on screen before the next chord plays."
              onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
            />

            <SwitchRow
              label="Sound feedback"
              checked={soundFeedback}
              onChange={setSoundFeedback}
              disabled={running}
              hint="A click each second of the countdown, plus a click the instant a round is graded."
            />

            {!learnMode && (
            <SwitchRow
              label="Drill every chord"
              checked={drillMode}
              onChange={setDrillMode}
              disabled={running}
              hint="Plays every selected chord quality, starting on all 12 keys, each in a random octave (with an independent chance of a slash bass each time)."
            />
            )}

            {!drillMode && !learnMode && (
              <label className="flex flex-col gap-2 text-sm">
                <span className="flex items-center justify-between font-medium text-muted">
                  Number of rounds
                  <span className="tabular-nums text-foreground">
                    {roundCount}
                  </span>
                </span>
                <input
                  type="range"
                  min={MIN_ROUND_COUNT}
                  max={MAX_ROUND_COUNT}
                  step={1}
                  value={roundCount}
                  onChange={(e) => setRoundCount(Number(e.target.value))}
                  disabled={running}
                  style={
                    {
                      "--progress": `${((roundCount - MIN_ROUND_COUNT) / (MAX_ROUND_COUNT - MIN_ROUND_COUNT)) * 100}%`,
                    } as React.CSSProperties
                  }
                  className="slider h-6 w-full cursor-pointer disabled:cursor-default disabled:opacity-60"
                />
              </label>
            )}
            {!drillMode && !learnMode && <Hint>How many chords make up one session.</Hint>}
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
      <div className="flex flex-col items-center gap-3">
        {activeLevel !== null && running && (
          <p className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            Level {activeLevel + 1} · {learn.levels[activeLevel].title} ·{" "}
            {cumulativeItems("chord", activeLevel).length} chords in play
          </p>
        )}
        {status && running && (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-semibold text-muted">
              Next chord in
            </span>
            <span
              className="text-3xl font-bold tabular-nums sm:text-4xl"
              style={{ color: GRADE_COLOR[status] }}
            >
              <CountdownLabel active={running} timerRef={noteTimerRef} />
            </span>
          </div>
        )}
        {!(learnMode && !running) && (
        <div className="relative flex h-44 w-44 items-center justify-center p-4 text-center sm:h-56 sm:w-56">
          <CountdownRing active={showCountdown} timerRef={noteTimerRef} />
          <h1
            className={`relative z-10 font-bold transition-[color,text-shadow] duration-200 ${
              mainLabelLong ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"
            }`}
            style={
              glow
                ? {
                    color: glow,
                    textShadow: `0 0 12px ${glow}, 0 0 32px ${glow}, 0 0 64px ${glow}`,
                  }
                : undefined
            }
          >
            {mainLabel}
          </h1>
        </div>
        )}

        {running && round && (
          <button
            type="button"
            onClick={() => playChordSound(round.notes)}
            className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
          >
            <PlayIcon className="h-3.5 w-3.5" />
            Replay
          </button>
        )}

        {revealedNoteNames && (
          <p className="text-sm font-medium tabular-nums text-muted">
            {revealedNoteNames}
          </p>
        )}

        {running && round && !status && (
          <form onSubmit={submitAnswer} className="flex w-full flex-col items-center gap-2">
            <div className="w-full max-w-[18rem]">
              <ChordSymbolKeypad onInsert={insertSymbol} />
            </div>
            <input
              ref={inputElRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder="e.g. F#^7 or Ab-7/D"
              className="w-full max-w-[16rem] rounded-lg bg-background px-3 py-2 text-center text-lg text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                Submit
              </button>
              <button
                type="button"
                onClick={gradeAndReveal}
                className="rounded-full bg-surface px-4 py-1.5 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
              >
                I don&apos;t know
              </button>
            </div>
          </form>
        )}

        {!(learnMode && !running) && (
        <p className="max-w-xs text-xs text-muted">
          Root, then quality, then an optional /bass: <code>^7</code> major 7,{" "}
          <code>-</code> minor, <code>h7</code> half-diminished (ø7), <code>o7</code> diminished
          7, <code>+</code> augmented — plus common spellings like <code>maj7</code>,{" "}
          <code>m7</code>, <code>dim</code>, <code>sus4</code>. Typed as <code>m7</code>/
          <code>M7</code> are both read as minor 7 (use <code>maj7</code> for major 7, to avoid
          the ambiguity).
        </p>
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
          className="flex w-full flex-col gap-4 rounded-2xl bg-surface p-4 text-left sm:p-6"
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted">Results</p>
              <p className="text-4xl font-bold tabular-nums">
                {score % 1 === 0 ? score : score.toFixed(1)}
                <span className="text-xl font-semibold text-muted">
                  {" "}
                  / {summary.results.length}
                </span>
              </p>
            </div>
            <p className="text-2xl font-semibold tabular-nums text-muted">
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

          <div className="grid grid-cols-2 gap-2 text-center">
            {(["correct", "incorrect"] as const).map((grade) => (
              <div key={grade} className="rounded-xl bg-background px-2 py-3">
                <p
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: GRADE_COLOR[grade] }}
                >
                  {tally(grade)}
                </p>
                <p className="text-xs text-muted">{GRADE_LABEL[grade]}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            {summary.rounds.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-1.5 text-sm"
              >
                <span
                  className="font-semibold"
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
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setSummary(null)}
              className="rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              Close
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={running ? stop : () => void start(learnMode ? "learn" : "normal")}
        className={`rounded-full px-8 py-3 text-base font-semibold transition-colors ${
          running
            ? "bg-surface hover:bg-surface-hover"
            : "bg-accent text-accent-foreground hover:bg-accent-hover"
        }`}
      >
        {running ? "Stop" : learnMode ? `Start level ${learn.selected + 1}` : "Start"}
      </button>
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
