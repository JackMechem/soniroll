"use client";

import { useEffect, useRef, useState } from "react";
import { CUSTOM_INSTRUMENT_ID, INSTRUMENTS } from "@/lib/instruments";
import SwitchRow from "@/components/SwitchRow";
import Hint from "@/components/Hint";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import KeyHint from "@/components/KeyHint";
import PanelsToggle from "@/components/PanelsToggle";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import Select from "@/components/Select";
import {
  FlagIcon,
  IntervalIcon,
  NoteIcon,
  PlayIcon,
  SlidersIcon,
  StopwatchIcon,
} from "@/components/tools";
import { scheduleClick } from "@/lib/clickEngine";
import { getAudioContext } from "@/lib/metronome";
import { GRADE_COLOR, GRADE_LABEL, Grade, scoreOf } from "@/lib/noteGrade";
import { parseRange } from "@/lib/noteRange";
import {
  DEFAULT_ENABLED_INTERVAL_IDS,
  Direction,
  INTERVALS,
  IntervalDef,
  IntervalRound,
  drillQueueForPool,
  intervalRoundForPitchClass,
  pitchClassOf,
  randomIntervalRound,
} from "@/lib/intervals";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import {
  DEFAULT_EAR_TRAINING_TONE_ID,
  EAR_TRAINING_TONES,
  playNote,
  playNotesTogether,
} from "@/lib/tones";
import {
  ACCIDENTAL_STYLES,
  AccidentalStyle,
  spellNote,
} from "@/lib/noteSpelling";
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
import { cumulativeItems, intervalLevelOptions, levelQueue } from "@/lib/learningPath";
import { useLearnSession } from "@/lib/useLearnSession";
import { useToolActivity } from "@/lib/toolTime";
import { PoolPill } from "@/components/reward/Reward";
import { GRADE_TAG, LEVEL_LABEL, answerButtonClass, answerButtonStyle, PANEL_LIST, PANEL_ROW, PRIMARY_BUTTON, PRIMARY_BUTTON_SM, RESULTS_PANEL, SECONDARY_BUTTON, TEXT_BUTTON, TEXT_BUTTON_DANGER, startButtonClass } from "@/components/learning/quizUi";

const MIN_ROUND_SECONDS = 2;
const MAX_ROUND_SECONDS = 20;
const DEFAULT_ROUND_SECONDS = 8;

/** Melodic playback: the two notes in sequence, spaced out. */
const MELODIC_NOTE_DURATION_SECONDS = 0.45;
const MELODIC_NOTE_GAP_MS = 500;
/** Harmonic playback: both notes at once, held a bit longer so they're easy to hear together. */
const HARMONIC_NOTE_DURATION_SECONDS = 1.1;

const MIN_ROUND_COUNT = 5;
const MAX_ROUND_COUNT = 50;
const DEFAULT_ROUND_COUNT = 15;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 1500;

type PlaybackStyle = "melodic" | "harmonic";
const PLAYBACK_STYLES: { value: PlaybackStyle; label: string }[] = [
  { value: "melodic", label: "Melodic (one after another)" },
  { value: "harmonic", label: "Harmonic (together)" },
];

type Session = {
  total: number;
  index: number;
  round: IntervalRound | null;
  best: Grade | null;
  results: Grade[];
  rounds: IntervalRound[];
  queue: IntervalRound[];
  guessedId: string | null;
};

type Summary = { results: Grade[]; rounds: IntervalRound[] };

/** Everything that affects what's played, how it's timed, and how it's graded — two attempts
    only get compared against each other if all of this matches. */
type HistoryConfig = {
  rangeInput: string;
  drillMode: boolean;
  includeDescending: boolean;
  roundCount: number;
  /** The selected interval ids, sorted and joined, so the set (order doesn't matter) compares
      with a plain `===`. */
  intervalIdsKey: string;
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
  "guess-intervals",
  "guess-range",
  "guess-timing",
  "guess-sound",
];
const SETTINGS_KEY = "jam-practice-guess-the-interval";
const DEFAULT_SETTINGS = {
  learnMode: false,
  instrumentId: INSTRUMENTS[0].id,
  customRange: "A1-A6",
  roundSeconds: DEFAULT_ROUND_SECONDS,
  advanceDelayMs: DEFAULT_ADVANCE_DELAY_MS,
  soundFeedback: false,
  roundCount: DEFAULT_ROUND_COUNT,
  drillMode: false,
  includeDescending: false,
  intervalIds: DEFAULT_ENABLED_INTERVAL_IDS as string[],
  intervalStats: {} as Record<string, GradeCounts>,
  toneId: DEFAULT_EAR_TRAINING_TONE_ID,
  playbackStyle: "melodic" as PlaybackStyle,
  revealNotes: true,
  accidentalStyle: "sharp" as AccidentalStyle,
  history: [] as HistoryEntry[],
};

export default function GuessTheInterval() {
  const [settings, updateSettings] = useSyncedSettings(
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
  );
  const {
    customRange,
    roundSeconds,
    advanceDelayMs,
    soundFeedback,
    drillMode,
    includeDescending,
    roundCount: rawRoundCount,
    playbackStyle,
    revealNotes,
  } = settings;
  const learnMode = settings.learnMode;
  const learn = useLearnSession("interval");
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
  const instrumentId =
    settings.instrumentId === CUSTOM_INSTRUMENT_ID ||
    INSTRUMENTS.some((i) => i.id === settings.instrumentId)
      ? settings.instrumentId
      : INSTRUMENTS[0].id;
  const pool = INTERVALS.filter((i) => settings.intervalIds.includes(i.id));
  const directions: Direction[] = includeDescending ? [1, -1] : [1];
  const setInstrumentId = (instrumentId: string) =>
    updateSettings({ instrumentId });
  const setCustomRange = (customRange: string) =>
    updateSettings({ customRange });
  const setRoundSeconds = (roundSeconds: number) =>
    updateSettings({ roundSeconds });
  const setDrillMode = (drillMode: boolean) => updateSettings({ drillMode });
  const setIncludeDescending = (includeDescending: boolean) =>
    updateSettings({ includeDescending });
  const setRoundCount = (roundCount: number) => updateSettings({ roundCount });
  const setSoundFeedback = (soundFeedback: boolean) =>
    updateSettings({ soundFeedback });
  const setToneId = (toneId: string) => updateSettings({ toneId });
  const setPlaybackStyle = (playbackStyle: PlaybackStyle) =>
    updateSettings({ playbackStyle });
  const setRevealNotes = (revealNotes: boolean) =>
    updateSettings({ revealNotes });
  const setAccidentalStyle = (accidentalStyle: AccidentalStyle) =>
    updateSettings({ accidentalStyle });
  const toggleInterval = (id: string) =>
    updateSettings({
      intervalIds: settings.intervalIds.includes(id)
        ? settings.intervalIds.filter((x) => x !== id)
        : [...settings.intervalIds, id],
    });

  const [round, setRound] = useState<IntervalRound | null>(null);
  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/guess-the-interval", running);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [guessedId, setGuessedId] = useState<string | null>(null);
  const [answerChoices, setAnswerChoices] = useState<IntervalDef[]>([]);
  const [progress, setProgress] = useState<{
    index: number;
    total: number;
  } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [roundSeed, setRoundSeed] = useState(0);
  // So "Try again" repeats a "Shed weak intervals" run instead of falling back to a normal one.
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
  // A learning-path level's own playback style, overriding the setting while it runs.
  const learnStyleRef = useRef<PlaybackStyle | null>(null);
  const mountedRef = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  const cfgRef = useRef({ advanceDelayMs, soundFeedback });
  const skipRef = useRef<(() => void) | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The source of truth for intervalStats *during* a running session — see the identical note on
  // Note Trainer's noteStatsRef for why a ref (not the settings value) is what gets bumped.
  const intervalStatsRef = useRef(settings.intervalStats);

  useEffect(() => {
    toneIdRef.current = toneId;
    playbackStyleRef.current = playbackStyle;
    cfgRef.current = { advanceDelayMs, soundFeedback };
  }, [toneId, playbackStyle, advanceDelayMs, soundFeedback]);

  useEffect(() => {
    intervalStatsRef.current = settings.intervalStats;
  }, [settings.intervalStats]);

  const isCustom = instrumentId === CUSTOM_INSTRUMENT_ID;
  const rangeInput = isCustom
    ? customRange
    : (INSTRUMENTS.find((i) => i.id === instrumentId)?.range ?? "");

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

  /** Struggle stats are tracked per interval only — direction isn't something this tool asks you
      to identify (just "which interval"), so an ascending and descending Major 3rd share one
      struggle entry, unlike Interval Trainer's per-direction tracking. */
  function bumpIntervalStat(intervalId: string, grade: Grade) {
    intervalStatsRef.current = bumpGradeCounts(intervalStatsRef.current, intervalId, grade);
    updateSettings({ intervalStats: intervalStatsRef.current });
  }

  function clearIntervalStats() {
    intervalStatsRef.current = {};
    updateSettings({ intervalStats: {} });
  }

  type WeakInterval = { key: string; interval: IntervalDef; counts: GradeCounts; score: number };

  /** Every struggling interval in `stats`, worst first. A plain function of its arguments (not
      the ref) so it's just as safe to call during render (for the button's count) as from inside
      a running session (via `intervalStatsRef.current`). */
  function weakIntervalEntries(stats: Record<string, GradeCounts>): WeakInterval[] {
    return rankWeak(stats)
      .map((entry) => {
        const interval = INTERVALS.find((i) => i.id === entry.key);
        return interval && { key: entry.key, interval, counts: entry.counts, score: entry.score };
      })
      .filter((e): e is WeakInterval => !!e);
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

  /** One click per whole second of the countdown to the next interval, for "Sound feedback". */
  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!cfgRef.current.soundFeedback) return;
    const wholeSeconds = Math.floor(durationMs / 1000);
    for (let s = 1; s <= wholeSeconds; s++) {
      countdownClickTimeouts.current.push(setTimeout(playClick, s * 1000));
    }
  }

  /** Plays the interval's two notes, melodic (in order, spaced out) or harmonic (together),
      per the "Playback style" setting. */
  function playIntervalSound(notes: string[]) {
    clearPlayback();
    if ((learnStyleRef.current ?? playbackStyleRef.current) === "harmonic") {
      void playNotesTogether(notes, HARMONIC_NOTE_DURATION_SECONDS, toneIdRef.current);
    } else {
      notes.forEach((n, i) => {
        playbackTimeouts.current.push(
          setTimeout(
            () => playNote(n, MELODIC_NOTE_DURATION_SECONDS, toneIdRef.current),
            i * MELODIC_NOTE_GAP_MS,
          ),
        );
      });
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
    setGuessedId(null);
    setProgress(null);
    setActiveLevel(null);
    learnStyleRef.current = null;
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

  /** Locks in a round's grade and starts the pause-before-next-interval countdown: retargets the
      ring/label (previously counting down the time left to answer) to the pause instead, so it
      visibly counts down to the next interval, and plays the click/tick sounds when "Sound
      feedback" is on. */
  function lockInRound(grade: Grade) {
    const session = sessionRef.current;
    if (!session) return;
    session.best = grade;
    setStatus(grade);
    const pauseMs = cfgRef.current.advanceDelayMs;
    // Only ever reached from a button's onClick (submitGuess), never during render — same
    // ref-mutation timing pattern CountdownRing/CountdownLabel rely on throughout the other
    // trainers, which the compiler's purity check doesn't flag there (it bails out of analyzing
    // those larger components before reaching it); this smaller component compiles far enough to
    // actually hit the check, surfacing what's otherwise a pre-existing, harmless pattern.
    // eslint-disable-next-line react-hooks/purity -- see comment above; not called during render
    noteTimerRef.current = { startedAt: performance.now(), durationMs: pauseMs };
    if (cfgRef.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    scheduleAdvance(session.index);
  }

  /** Called when the player picks an answer (or gives up with "I don't know", `id === null`). */
  function submitGuess(id: string | null) {
    const session = sessionRef.current;
    if (!session || !session.round || session.best !== null) return;
    session.guessedId = id;
    setGuessedId(id);
    lockInRound(id === session.round.interval.id ? "correct" : "incorrect");
  }

  /** `"weak"` starts a focused session on just the intervals tracked as struggles (see
      `weakIntervalEntries`) instead of the normal quiz/drill — one round per struggling interval,
      not the full 12-key sweep "Drill every interval" does, so it stays a quick, targeted
      practice on exactly what's giving trouble. Never touches the timed History list, since a
      short weak-intervals session isn't a fair comparison against a full one. */
  async function start(mode: "normal" | "weak" | "learn" = "normal", levelIndex?: number) {
    const weak = mode === "weak";
    // `"learn"`: a learning-path level (`levelIndex`, else the selected one) — a fixed set of
    // rounds over the intervals unlocked so far, in that level's directions/playback style,
    // scored at the end to pass the level.
    const learnLevel = mode === "learn" ? (levelIndex ?? learn.selected) : null;
    if (mode !== "learn") setLastMode(mode);
    learn.clearResult();
    const range = parseRange(rangeInput);
    if (!range) {
      setError('Enter a valid range like "A1-A6".');
      return;
    }
    const weakList = weak ? weakIntervalEntries(intervalStatsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError(
        "No struggling intervals yet — a wrong guess builds this list up.",
      );
      return;
    }
    if (learnLevel === null && !weak && pool.length === 0) {
      setError("Select at least one interval to practice.");
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearPlayback();

    // "Drill every interval" and "shed weak intervals" both play through a fixed queue rather
    // than `roundCount` random draws — same machinery either way, just a different queue.
    const drilling = weak || learnLevel !== null ? true : drillMode;
    const learnOptions = learnLevel !== null ? intervalLevelOptions(learnLevel) : null;
    learnStyleRef.current = learnOptions ? (learnOptions.harmonic ? "harmonic" : "melodic") : null;
    const queue = learnLevel !== null
      ? levelQueue("interval", learnLevel).map((id) =>
          randomIntervalRound(range, [INTERVALS.find((i) => i.id === id)!], learnOptions!.directions),
        )
      : weak
      ? shuffled(weakList.map((e) => randomIntervalRound(range, [e.interval], directions)))
      : drilling
        ? shuffled(drillQueueForPool(range, pool, directions))
        : [];
    // The set of intervals the answer buttons offer: a weak session might be shedding an
    // interval that's since been deselected from the main pool, so its choices come from
    // whatever's actually in the queue, not from `pool`, to make sure the right answer is
    // always one of the options on screen.
    const choiceIntervals = learnLevel !== null
      ? INTERVALS.filter((i) => cumulativeItems("interval", learnLevel).includes(i.id))
      : weak
      ? INTERVALS.filter((i) => weakList.some((e) => e.interval.id === i.id))
      : pool;
    setAnswerChoices(choiceIntervals);

    sessionRef.current = {
      total: drilling ? queue.length : roundCount,
      index: 0,
      round: null,
      best: null,
      results: [],
      rounds: [],
      queue,
      guessedId: null,
    };
    // Only ever reached from start() itself (a button's onClick, or a space-bar toggle) — see the
    // identical, longer note on lockInRound above; not called during render.
    // eslint-disable-next-line react-hooks/purity -- see comment above; not called during render
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
        // Lock in the interval that just finished; a timeout (no guess) counts as a miss.
        const finishedGrade = session.best ?? "incorrect";
        if (session.round) {
          session.results.push(finishedGrade);
          session.rounds.push(session.round);
          bumpIntervalStat(session.round.interval.id, finishedGrade);
          // Drill mode: a miss goes back on the end of the queue — with a freshly randomized
          // octave for the retry, so a repeated miss doesn't look like the exact same round.
          if (drilling && learnLevel === null && finishedGrade === "incorrect") {
            const pitchClass = pitchClassOf(session.round.startMidi);
            const requeued = intervalRoundForPitchClass(
              range,
              session.round.interval,
              session.round.direction,
              pitchClass,
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
            // A weed-out session over a handful of struggling intervals isn't a fair comparison
            // against a full quiz/drill, so it doesn't join that leaderboard.
            setLastElapsedMs(null);
            setIsNewBest(false);
          } else {
            const config: HistoryConfig = {
              rangeInput,
              drillMode,
              includeDescending,
              roundCount,
              intervalIdsKey: pool
                .map((i) => i.id)
                .sort()
                .join(","),
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
          setSummary({ results: session.results, rounds: session.rounds });
          setRound(null);
          endSession();
          return;
        }
        session.index++;
        session.best = null;
        session.guessedId = null;
        setStatus(null);
        setGuessedId(null);
        // Drill mode's total grows when an interval gets requeued, so "X of Y" reflects what's
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
        drilling && session ? session.queue.shift()! : randomIntervalRound(range, pool, directions);
      if (session) session.round = next;
      roundSeedRef.current++;
      setRoundSeed(roundSeedRef.current);
      noteTimerRef.current = {
        startedAt: performance.now(),
        durationMs: seconds * 1000,
      };
      setRound(next);
      playIntervalSound(next.notes);
    };

    // Answering early (or the "I don't know" button) restarts the timer so the next round gets
    // its own full max time rather than continuing on the old round's schedule.
    skipRef.current = () => {
      advance();
      if (sessionRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(advance, seconds * 1000);
      }
    };

    advance();
    setRunning(true);
    setActiveLevel(learnLevel);
    intervalRef.current = setInterval(advance, seconds * 1000);
  }

  useSpaceToggle(running ? stop : () => void start(learnMode ? "learn" : "normal"));

  const arrow = (r: IntervalRound) => (r.direction === 1 ? "↑" : "↓");
  const revealedLabel = (r: IntervalRound) => `${arrow(r)} ${r.interval.label}`;
  const mainLabel = round ? (status ? revealedLabel(round) : "?") : "—";
  const mainLabelLong = mainLabel.length > 16;
  const glow = running && status ? GRADE_COLOR[status] : null;
  const showCountdown = running;
  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) =>
    summary?.results.filter((g) => g === grade).length ?? 0;
  const currentConfig: HistoryConfig = {
    rangeInput,
    drillMode,
    includeDescending,
    roundCount,
    intervalIdsKey: pool
      .map((i) => i.id)
      .sort()
      .join(","),
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
  const weakEntries = weakIntervalEntries(settings.intervalStats);
  const revealedNotes =
    revealNotes && status && round
      ? `${spellNote(round.notes[0], accidentalStyle, roundSeed, false)} → ${spellNote(round.notes[1], accidentalStyle, roundSeed, false)}`
      : null;

  return (
    <ToolLayout
      title="Guess the Interval"
      presets={toolPresets("guess-the-interval", settings, updateSettings)}
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
              <p className="text-sm font-medium tabular-nums">
                Best {formatDuration(bestMs)}
              </p>
            )}
            {matchingHistory.length === 0 ? (
              <p className="text-sm text-muted">
                No attempts yet with these settings.
              </p>
            ) : (
              <div className={PANEL_LIST}>
                {[...matchingHistory]
                  .sort((a, b) => b.at - a.at)
                  .map((entry, i) => (
                    <div
                      key={i}
                      className={PANEL_ROW}
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
                className={TEXT_BUTTON_DANGER}
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
                No struggles tracked yet — a wrong guess adds it here.
              </p>
            ) : (
              <div className={PANEL_LIST}>
                {weakEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className={PANEL_ROW}
                  >
                    <span className="font-medium">{entry.interval.label}</span>
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
              className={PRIMARY_BUTTON_SM}
            >
              Shed weak intervals{weakEntries.length > 0 && ` (${weakEntries.length})`}
            </button>
            {weakEntries.length > 0 && (
              <button
                type="button"
                onClick={clearIntervalStats}
                disabled={running}
                className={TEXT_BUTTON_DANGER}
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
          <CollapsiblePanel id="guess-intervals" title="Intervals" icon={IntervalIcon} summary={`${pool.length} of ${INTERVALS.length}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted">
                {pool.length} of {INTERVALS.length} selected
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({ intervalIds: INTERVALS.map((i) => i.id) })
                  }
                  disabled={running}
                  className="font-medium text-accent hover:underline disabled:opacity-50"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ intervalIds: [] })}
                  disabled={running}
                  className="font-medium text-muted hover:underline disabled:opacity-50"
                >
                  None
                </button>
              </div>
            </div>
            <Hint>
              Which intervals can be played — and the choices offered for each round. At least one
              must stay selected.
            </Hint>

            <div className="flex flex-wrap gap-1.5">
              {INTERVALS.map((interval) => {
                const selected = settings.intervalIds.includes(interval.id);
                return (
                  <PoolPill key={interval.id} on={selected} onClick={() => toggleInterval(interval.id)} disabled={running} plainClassName="rounded-md px-3 py-1.5 text-xs font-medium">
                    {interval.label}
                  </PoolPill>
                );
              })}
            </div>

            <SwitchRow
              label="Include descending intervals"
              checked={includeDescending}
              onChange={setIncludeDescending}
              disabled={running}
              hint="Lets a round play the interval below the starting note, not just above it — the choices are still just the interval's name, not its direction."
            />
          </CollapsiblePanel>
          )}

          <CollapsiblePanel id="guess-range" title="Range" icon={NoteIcon} summary={rangeInput}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Instrument</span>
              <Select
                value={instrumentId}
                onChange={setInstrumentId}
                disabled={running}
                options={[
                  ...INSTRUMENTS.map((instrument) => ({
                    value: instrument.id,
                    label: `${instrument.label} (${instrument.range})`,
                  })),
                  { value: CUSTOM_INSTRUMENT_ID, label: "Custom range…" },
                ]}
              />
            </label>
            <Hint>
              The register the starting note is drawn from — a comfortable range for your ear, not
              necessarily an instrument you&apos;re playing along with.
            </Hint>

            {isCustom && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Custom range</span>
                <input
                  type="text"
                  value={customRange}
                  onChange={(e) => setCustomRange(e.target.value)}
                  disabled={running}
                  placeholder="A1-A6"
                  className="h-9 rounded-md bg-foreground/[0.05] px-3 text-foreground outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
                />
              </label>
            )}
            {isCustom && (
              <Hint>The lowest and highest notes to draw starting notes from, e.g. A1-A6.</Hint>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel id="guess-timing" title="Timing" icon={StopwatchIcon}>
            <AdvancedSlider
              label="Max time to answer"
              value={roundSeconds}
              unit="s"
              min={MIN_ROUND_SECONDS}
              max={MAX_ROUND_SECONDS}
              step={0.5}
              disabled={running}
              onChange={setRoundSeconds}
              hint="How long you have to pick an answer before it's marked a miss and moves on."
            />

            <AdvancedSlider
              label="Time between rounds"
              value={advanceDelayMs / 1000}
              unit="s"
              min={MIN_ADVANCE_DELAY_MS / 1000}
              max={MAX_ADVANCE_DELAY_MS / 1000}
              step={0.25}
              disabled={running}
              hint="How long the revealed answer (with its countdown ring) stays on screen before the next interval plays."
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
              label="Drill every interval"
              checked={drillMode}
              onChange={setDrillMode}
              disabled={running}
              hint="Plays every selected interval, in every selected direction, starting on all 12 keys, each in a random octave."
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
            {!drillMode && <Hint>How many intervals make up one session.</Hint>}
          </CollapsiblePanel>

          <CollapsiblePanel
            id="guess-sound"
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
            <Hint>Whether the two notes play one after another or together.</Hint>

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
            <Hint>Which sound plays the interval.</Hint>

            <SwitchRow
              label="Reveal notes after answering"
              checked={revealNotes}
              onChange={setRevealNotes}
              hint="Shows the actual note names once a round is graded, e.g. C4 → E4."
            />

            {revealNotes && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Accidentals</span>
                <Select
                  value={accidentalStyle}
                  onChange={setAccidentalStyle}
                  options={ACCIDENTAL_STYLES}
                />
              </label>
            )}
            {revealNotes && (
              <Hint>How sharps and flats are spelled in the revealed notes, e.g. C# vs Db.</Hint>
            )}
          </CollapsiblePanel>
        </>
        )
      }
    >
      {learnMode && !running && (
        <LearningPath
          track="interval"
          progress={learn.progress}
          selected={learn.selected}
          onSelect={learn.select}
          onStart={() => void start("learn")}
        />
      )}
      <div className="flex flex-col items-center gap-3">
        {activeLevel !== null && running && (
          <p className={LEVEL_LABEL}>
            Level {activeLevel + 1} · {learn.levels[activeLevel].title}
          </p>
        )}
        {status && running && (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium text-muted">
              Next interval in
            </span>
            <span
              className="text-3xl font-semibold tabular-nums sm:text-4xl"
              style={{ color: GRADE_COLOR[status] }}
            >
              <CountdownLabel active={running} timerRef={noteTimerRef} />
            </span>
          </div>
        )}
        {!(learnMode && !running) && (
        <div className="relative flex h-44 w-44 items-center justify-center p-4 text-center sm:h-56 sm:w-56">
          <CountdownRing active={showCountdown} timerRef={noteTimerRef} />
          <p
            className={`relative z-10 font-bold in-[.classic-look]:font-extrabold transition-colors duration-200 ${
              mainLabelLong ? "text-xl sm:text-2xl" : "text-4xl sm:text-5xl"
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
          {/* Before the first round, say what's about to happen. */}
          {!round && !running && <p className="absolute inset-x-0 bottom-6 z-10 text-sm text-muted">Press Start, listen to two notes, then pick the interval.</p>}
        </div>
        )}

        {running && round && (
          <button
            type="button"
            onClick={() => playIntervalSound(round.notes)}
            className={SECONDARY_BUTTON}
          >
            <PlayIcon className="h-3.5 w-3.5" />
            Replay
          </button>
        )}

        {revealedNotes && (
          <p className="text-sm font-medium tabular-nums text-muted">
            {revealedNotes}
          </p>
        )}

        {running && round && answerChoices.length > 0 && (
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
            {answerChoices.map((interval) => {
              const answered = status !== null;
              const isCorrectAnswer = interval.id === round.interval.id;
              const isGuess = interval.id === guessedId;
              const color = !answered
                ? undefined
                : isCorrectAnswer
                  ? GRADE_COLOR.correct
                  : isGuess
                    ? GRADE_COLOR.incorrect
                    : undefined;
              return (
                <button
                  key={interval.id}
                  type="button"
                  onClick={() => submitGuess(interval.id)}
                  disabled={answered}
                  style={answerButtonStyle(color)}
                  className={answerButtonClass(color, answered)}
                >
                  {interval.label}
                </button>
              );
            })}
          </div>
        )}

        {running && round && !status && (
          <button
            type="button"
            onClick={() => submitGuess(null)}
            className={TEXT_BUTTON}
          >
            I don&apos;t know
          </button>
        )}

        {running && progress && (
          <p className="tabular-nums text-sm text-muted">
            Interval {progress.index} of {progress.total}
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

          <div className="flex flex-wrap gap-1.5">
            {summary.rounds.map((r, i) => (
              <span
                key={i}
                title={GRADE_LABEL[summary.results[i]]}
                className={GRADE_TAG}
                style={{
                  color: GRADE_COLOR[summary.results[i]],
                  background: `color-mix(in srgb, ${GRADE_COLOR[summary.results[i]]} 15%, transparent)`,
                }}
              >
                {revealedLabel(r)}
              </span>
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

      <button
        type="button"
        onClick={running ? stop : () => void start(learnMode ? "learn" : "normal")}
        className={startButtonClass(running)}
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
