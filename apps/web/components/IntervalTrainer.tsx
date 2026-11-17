"use client";

import { useEffect, useRef, useState } from "react";
import { CUSTOM_INSTRUMENT_ID, INSTRUMENTS } from "@/lib/instruments";
import SwitchRow from "@/components/SwitchRow";
import Hint from "@/components/Hint";
import InputTest from "@/components/InputTest";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import KeyHint from "@/components/KeyHint";
import PanelsToggle from "@/components/PanelsToggle";
import Disclosure from "@/components/Disclosure";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import Select from "@/components/Select";
import {
  FlagIcon,
  IntervalIcon,
  MicIcon,
  NoteIcon,
  SlidersIcon,
  StopwatchIcon,
} from "@/components/tools";
import {
  AudioInput,
  InputDevice,
  SENSITIVITY,
  listAudioInputs,
  startAudioInput,
} from "@/lib/audioInput";
import { scheduleClick } from "@/lib/clickEngine";
import { getAudioContext } from "@/lib/metronome";
import {
  GRADE_COLOR,
  GRADE_LABEL,
  Grade,
  describePitch,
  frequencyToMidi,
  gradePitch,
  scoreOf,
} from "@/lib/noteGrade";
import { midiToNote, parseNote, parseRange } from "@/lib/noteRange";
import {
  DEFAULT_ENABLED_INTERVAL_IDS,
  Direction,
  INTERVALS,
  IntervalDef,
  IntervalRound,
  chainedIntervalRound,
  drillQueueForPool,
  intervalRoundForPitchClass,
  pitchClassOf,
  randomIntervalRound,
} from "@/lib/intervals";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { DEFAULT_TONE_ID, TONES, playNote } from "@/lib/tones";
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
import { useToolActivity } from "@/lib/toolTime";
import { PoolPill } from "@/components/reward/Reward";
import { GRADE_TAG, PANEL_LIST, PANEL_ROW, PRIMARY_BUTTON, PRIMARY_BUTTON_SM, RESULTS_PANEL, SECONDARY_BUTTON, SECONDARY_BUTTON_SM, TEXT_BUTTON_DANGER, startButtonClass } from "@/components/learning/quizUi";

const MIN_ROUND_SECONDS = 1;
const MAX_ROUND_SECONDS = 15;
const DEFAULT_ROUND_SECONDS = 5;

/** Spacing for "play the interval out loud". */
const INTERVAL_NOTE_DURATION_SECONDS = 0.4;
const INTERVAL_NOTE_GAP_MS = 450;

const MIN_ROUND_COUNT = 5;
const MAX_ROUND_COUNT = 50;
const DEFAULT_ROUND_COUNT = 15;
const FRAME_MS = 30;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 1500;

type Session = {
  total: number;
  index: number;
  round: IntervalRound | null;
  /** 0 (listening for the start) or 1 (listening for the target) — an interval round is always
      exactly these two notes. */
  noteIndex: number;
  best: Grade | null;
  degreeMisses: number;
  hadMistake: boolean;
  results: Grade[];
  rounds: IntervalRound[];
  stable: number;
  last: number | null;
  previousMidi: number | null;
  settled: boolean;
  lastCorrectMidi: number | null;
  queue: IntervalRound[];
};

type Summary = { results: Grade[]; rounds: IntervalRound[] };

/** Everything that affects what intervals are drawn, how they're timed, and how they're graded —
    two attempts only get compared against each other if all of this matches. */
type HistoryConfig = {
  rangeInput: string;
  drillMode: boolean;
  chainIntervals: boolean;
  includeDescending: boolean;
  roundCount: number;
  /** The selected interval ids, sorted and joined, so the set (order doesn't matter) compares
      with a plain `===`. */
  intervalIdsKey: string;
  accidentalStyle: AccidentalStyle;
  roundSeconds: number;
  toleranceCents: number;
  holdMs: number;
  advanceDelayMs: number;
  refA: number;
  sensitivity: string;
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
  "interval-set",
  "interval-range",
  "interval-listen",
  "interval-sound",
];
const SETTINGS_KEY = "jam-practice-interval-trainer";
const DEFAULT_SETTINGS = {
  instrumentId: INSTRUMENTS[0].id,
  customRange: "A1-A6",
  roundSeconds: DEFAULT_ROUND_SECONDS,
  ignoreOctave: false,
  toleranceCents: 50,
  holdMs: 120,
  advanceDelayMs: DEFAULT_ADVANCE_DELAY_MS,
  refA: 440,
  sensitivity: "normal",
  partialCredit: false,
  ignoreRepeatedNotes: false,
  soundFeedback: false,
  playSound: false,
  showNext: false,
  showIntervalNotes: true,
  toneId: DEFAULT_TONE_ID,
  listenMode: false,
  roundCount: DEFAULT_ROUND_COUNT,
  drillMode: false,
  includeDescending: false,
  chainIntervals: false,
  history: [] as HistoryEntry[],
  accidentalStyle: "sharp" as AccidentalStyle,
  inputDeviceId: "",
  intervalIds: DEFAULT_ENABLED_INTERVAL_IDS as string[],
  intervalStats: {} as Record<string, GradeCounts>,
};

export default function IntervalTrainer() {
  const [settings, updateSettings] = useSyncedSettings(
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
  );
  const {
    customRange,
    roundSeconds,
    playSound,
    showNext,
    showIntervalNotes,
    toneId,
    listenMode,
    ignoreOctave,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    drillMode,
    includeDescending,
    chainIntervals,
    partialCredit,
    ignoreRepeatedNotes,
    soundFeedback,
  } = settings;
  // Drop any entries saved before "config" existed (or otherwise malformed) rather than
  // crashing on them.
  const history = settings.history.filter(
    (h): h is HistoryEntry =>
      !!h && typeof h.config === "object" && h.config !== null,
  );
  const accidentalStyle = ACCIDENTAL_STYLES.some(
    (s) => s.value === settings.accidentalStyle,
  )
    ? settings.accidentalStyle
    : "sharp";
  const sensitivity =
    settings.sensitivity in SENSITIVITY ? settings.sensitivity : "normal";
  const roundCount = Math.min(
    MAX_ROUND_COUNT,
    Math.max(MIN_ROUND_COUNT, Math.round(settings.roundCount)),
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
  const setPlaySound = (playSound: boolean) => updateSettings({ playSound });
  const setShowNext = (showNext: boolean) => updateSettings({ showNext });
  const setShowIntervalNotes = (showIntervalNotes: boolean) =>
    updateSettings({ showIntervalNotes });
  const setToneId = (toneId: string) => updateSettings({ toneId });
  const setListenMode = (listenMode: boolean) => updateSettings({ listenMode });
  const setRoundCount = (roundCount: number) => updateSettings({ roundCount });
  const setDrillMode = (drillMode: boolean) => updateSettings({ drillMode });
  const setIncludeDescending = (includeDescending: boolean) =>
    updateSettings({ includeDescending });
  const setChainIntervals = (chainIntervals: boolean) =>
    updateSettings({ chainIntervals });
  const setIgnoreOctave = (ignoreOctave: boolean) =>
    updateSettings({ ignoreOctave });
  const setPartialCredit = (partialCredit: boolean) =>
    updateSettings({ partialCredit });
  const setIgnoreRepeatedNotes = (ignoreRepeatedNotes: boolean) =>
    updateSettings({ ignoreRepeatedNotes });
  const setSoundFeedback = (soundFeedback: boolean) =>
    updateSettings({ soundFeedback });
  const setAccidentalStyle = (accidentalStyle: AccidentalStyle) =>
    updateSettings({ accidentalStyle });
  const setInputDeviceId = (inputDeviceId: string) =>
    updateSettings({ inputDeviceId });
  const toggleInterval = (id: string) =>
    updateSettings({
      intervalIds: settings.intervalIds.includes(id)
        ? settings.intervalIds.filter((x) => x !== id)
        : [...settings.intervalIds, id],
    });

  const [round, setRound] = useState<IntervalRound | null>(null);
  const [nextRound, setNextRound] = useState<IntervalRound | null>(null);
  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/interval-trainer", running);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<InputDevice[]>([]);
  const [status, setStatus] = useState<Grade | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    index: number;
    total: number;
  } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  // Mirrors roundSeedRef for the render-time reads (labels in JSX); the ref itself is only
  // read from the audio callback, which runs outside render.
  const [roundSeed, setRoundSeed] = useState(0);
  // How many notes of the current round have been matched (0, 1 or 2), for the note-by-note pills.
  const [intervalProgress, setIntervalProgress] = useState(0);
  // Partial-credit mode only: the current degree has had one wrong attempt and is waiting for
  // a retry, for the note pill's "try again" styling.
  const [degreeMiss, setDegreeMiss] = useState(false);
  // So "Try again" repeats a "Shed weak intervals" run instead of falling back to a normal one.
  const [lastMode, setLastMode] = useState<"normal" | "weak">("normal");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noteTimerRef = useRef({ startedAt: 0, durationMs: 1000 });
  const upcomingRef = useRef<IntervalRound | null>(null);
  // Bumped every time a new round is chosen, so "random" accidental spelling stays put for as
  // long as that round's on screen instead of re-rolling on every re-render.
  const roundSeedRef = useRef(0);
  // When the current listen-mode session started, for the "your time" shown when it finishes.
  const sessionStartRef = useRef<number | null>(null);
  const playSoundRef = useRef(playSound);
  const toneIdRef = useRef(toneId);
  const inputRef = useRef<AudioInput | null>(null);
  const mountedRef = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  const listenCfg = useRef({
    accidentalStyle,
    ignoreOctave,
    toleranceCents,
    holdFrames: 4,
    advanceDelayMs,
    refA,
    partialCredit,
    ignoreRepeatedNotes,
    soundFeedback,
    silenceRms: SENSITIVITY.normal.rms,
  });
  const skipRef = useRef<(() => void) | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalPlaybackTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The source of truth for intervalStats *during* a running session — see the identical note on
  // Note Trainer's noteStatsRef for why a ref (not the settings value) is what gets bumped.
  const intervalStatsRef = useRef(settings.intervalStats);

  useEffect(() => {
    playSoundRef.current = playSound;
    toneIdRef.current = toneId;
    listenCfg.current = {
      accidentalStyle,
      ignoreOctave,
      toleranceCents,
      holdFrames: Math.max(1, Math.round(holdMs / FRAME_MS)),
      advanceDelayMs,
      refA,
      partialCredit,
      ignoreRepeatedNotes,
      soundFeedback,
      silenceRms: SENSITIVITY[sensitivity].rms,
    };
  }, [
    playSound,
    toneId,
    accidentalStyle,
    ignoreOctave,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    partialCredit,
    ignoreRepeatedNotes,
    soundFeedback,
    sensitivity,
  ]);

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
      intervalPlaybackTimeouts.current.forEach(clearTimeout);
      countdownClickTimeouts.current.forEach(clearTimeout);
      inputRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listAudioInputs()
        .then((devices) => {
          if (!cancelled) setInputs(devices);
        })
        .catch(() => {});
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, []);

  const inputDeviceId = inputs.some((d) => d.id === settings.inputDeviceId)
    ? settings.inputDeviceId
    : "";

  /** Struggle stats are tracked per interval *and* direction — "Major 3rd ascending" and "Major
      3rd descending" are separate struggles, not tied to any particular starting note (unlike
      Scale Trainer's per-key tracking, an interval is the same interval wherever you start it).
      The stat key folds both into one string. */
  function intervalStatKey(intervalId: string, direction: Direction): string {
    return `${intervalId}:${direction}`;
  }

  type WeakInterval = {
    key: string;
    interval: IntervalDef;
    direction: Direction;
    counts: GradeCounts;
    score: number;
  };

  /** Undoes `intervalStatKey`, dropping anything that doesn't parse to a real interval and
      direction (stale data from an older format, or an interval that's since been removed). */
  function parseIntervalStatKey(
    key: string,
  ): { interval: IntervalDef; direction: Direction } | null {
    const [intervalId, directionText] = key.split(":");
    const direction = Number(directionText);
    if (direction !== 1 && direction !== -1) return null;
    const interval = INTERVALS.find((i) => i.id === intervalId);
    return interval ? { interval, direction } : null;
  }

  /** Records one more grade for this interval+direction in the lifetime struggle stats. */
  function bumpIntervalStat(intervalId: string, direction: Direction, grade: Grade) {
    const key = intervalStatKey(intervalId, direction);
    intervalStatsRef.current = bumpGradeCounts(intervalStatsRef.current, key, grade);
    updateSettings({ intervalStats: intervalStatsRef.current });
  }

  function clearIntervalStats() {
    intervalStatsRef.current = {};
    updateSettings({ intervalStats: {} });
  }

  /** Every struggling interval+direction in `stats`, worst first. A plain function of its
      arguments (not the ref) so it's just as safe to call during render (for the button's count)
      as from inside a running session (via `intervalStatsRef.current`). */
  function weakIntervalEntries(stats: Record<string, GradeCounts>): WeakInterval[] {
    return rankWeak(stats)
      .map((entry) => {
        const parsed = parseIntervalStatKey(entry.key);
        return parsed && { ...parsed, key: entry.key, counts: entry.counts, score: entry.score };
      })
      .filter((entry): entry is WeakInterval => !!entry);
  }

  function clearIntervalPlayback() {
    intervalPlaybackTimeouts.current.forEach(clearTimeout);
    intervalPlaybackTimeouts.current = [];
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

  /** One click per whole second of the countdown to the next interval (so it ticks in step with
      the "Next interval in Ns" readout), for "Sound feedback". */
  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!listenCfg.current.soundFeedback) return;
    const wholeSeconds = Math.floor(durationMs / 1000);
    for (let s = 1; s <= wholeSeconds; s++) {
      countdownClickTimeouts.current.push(setTimeout(playClick, s * 1000));
    }
  }

  /** Plays both notes of the interval in order, spaced out, for "Play interval out loud". */
  function playIntervalSound(notes: string[]) {
    clearIntervalPlayback();
    notes.forEach((n, i) => {
      intervalPlaybackTimeouts.current.push(
        setTimeout(
          () => playNote(n, INTERVAL_NOTE_DURATION_SECONDS, toneIdRef.current),
          i * INTERVAL_NOTE_GAP_MS,
        ),
      );
    });
  }

  function endSession() {
    if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
    skipTimeoutRef.current = null;
    skipRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    clearIntervalPlayback();
    clearCountdownClicks();
    inputRef.current?.stop();
    inputRef.current = null;
    sessionRef.current = null;
    setRunning(false);
    setStatus(null);
    setHeard(null);
    setProgress(null);
    setWaiting(false);
    setIntervalProgress(0);
    setDegreeMiss(false);
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
    }, listenCfg.current.advanceDelayMs);
  }

  /** Locks in a round's grade and starts the pause-before-next-interval countdown: retargets the
      ring/label (previously counting down the listening time) to the pause instead, so it visibly
      counts down to the next interval, and plays the click/tick sounds when "Sound feedback" is
      on. */
  function lockInRound(grade: Grade) {
    const session = sessionRef.current;
    if (!session) return;
    session.best = grade;
    setStatus(grade);
    const pauseMs = listenCfg.current.advanceDelayMs;
    noteTimerRef.current = { startedAt: performance.now(), durationMs: pauseMs };
    if (listenCfg.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    scheduleAdvance(session.index);
  }

  /** Called ~30 times a second with whatever pitch the input is hearing. */
  function handleFrame(freq: number | null) {
    const session = sessionRef.current;
    if (!session || !session.round) return;
    if (freq === null) {
      session.stable = 0;
      session.last = null;
      // Silence means whatever was ringing has stopped, so grading can resume.
      session.settled = true;
      setHeard(null);
      return;
    }
    const cfg = listenCfg.current;
    const { note: heardNote, cents } = describePitch(freq, cfg.refA);
    // Reuses the current round's seed so a "random" spelling doesn't flicker every frame.
    const shownNote = spellNote(
      heardNote,
      cfg.accidentalStyle,
      roundSeedRef.current,
      cfg.ignoreOctave,
    );
    setHeard(`${shownNote} (${cents > 0 ? "+" : ""}${cents}¢)`);

    const nearest = Math.round(frequencyToMidi(freq, cfg.refA));
    if (nearest === session.last) session.stable++;
    else {
      session.last = nearest;
      session.stable = 1;
    }
    if (session.stable < cfg.holdFrames) return;

    // The tail of the previous note ringing on shouldn't be graded as an attempt at this one;
    // wait until it's stopped or a genuinely different pitch is heard. This applies both between
    // the start/target of a round and between rounds.
    if (!session.settled) {
      if (nearest === session.previousMidi) return;
      session.settled = true;
    }

    // Once this round's grade is locked in (pass or fail), further input doesn't change it —
    // it's just waiting for the scheduled advance.
    if (session.best !== null) return;

    // A fresh attack of the exact note just matched — e.g. a double pluck, or genuinely playing
    // it twice by accident — isn't a new attempt at the next degree; ignore it and keep waiting.
    if (
      cfg.ignoreRepeatedNotes &&
      session.lastCorrectMidi !== null &&
      nearest === session.lastCorrectMidi
    ) {
      session.previousMidi = nearest;
      session.settled = false;
      session.stable = 0;
      session.last = null;
      return;
    }

    const expected = session.round.notes[session.noteIndex];
    const played = gradePitch(freq, expected, {
      ignoreOctave: cfg.ignoreOctave,
      toleranceCents: cfg.toleranceCents,
      refA: cfg.refA,
    });

    if (played === "incorrect") {
      if (!cfg.partialCredit) {
        // A wrong note anywhere in the round fails it immediately.
        lockInRound("incorrect");
        return;
      }
      // Partial credit: the same degree gets one retry before the round fails.
      session.hadMistake = true;
      session.degreeMisses++;
      if (session.degreeMisses >= 2) {
        setDegreeMiss(false);
        lockInRound("incorrect");
        return;
      }
      // First miss on this degree: flag it and keep listening for the same note, rather than
      // moving on. Settle first so the wrong note's own tail isn't graded as a second attempt.
      setDegreeMiss(true);
      session.previousMidi = nearest;
      session.settled = false;
      session.stable = 0;
      session.last = null;
      return;
    }

    // The right note: settle before grading the next one, so its own tail isn't mistaken for
    // an attempt at the degree after it.
    session.previousMidi = nearest;
    session.lastCorrectMidi = nearest;
    session.settled = false;
    session.stable = 0;
    session.last = null;
    session.degreeMisses = 0;
    setDegreeMiss(false);
    session.noteIndex++;
    setIntervalProgress(session.noteIndex);

    if (session.noteIndex >= session.round.notes.length) {
      lockInRound(session.hadMistake ? "partial" : "correct");
    }
  }

  /** `"weak"` starts a focused session on just the exact interval+direction combos tracked as
      struggles (see `weakIntervalEntries`) instead of the normal quiz/drill — one round per
      struggling combo, not the full 12-key sweep "Drill every interval" does, so it stays a
      quick, targeted practice on exactly what's giving trouble. Always listens (regardless of the
      "Listen mode" toggle, which is switched on to match) and never touches the timed History
      list, since a short weak-intervals session isn't a fair comparison against a full one. */
  async function start(mode: "normal" | "weak" = "normal") {
    const weak = mode === "weak";
    setLastMode(mode);
    const range = parseRange(rangeInput);
    if (!range) {
      setError('Enter a valid range like "A1-A6".');
      return;
    }
    const weakList = weak ? weakIntervalEntries(intervalStatsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError(
        "No struggling intervals yet — misses in listen mode build this list up.",
      );
      return;
    }
    if (!weak && pool.length === 0) {
      setError("Select at least one interval to practice.");
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    inputRef.current?.stop();
    inputRef.current = null;
    clearIntervalPlayback();

    const listening = weak ? true : listenMode;
    if (weak && !listenMode) updateSettings({ listenMode: true });
    // "Drill every interval" and "shed weak intervals" both play through a fixed queue rather
    // than `roundCount` random draws — same machinery either way, just a different queue.
    const drilling = weak ? true : listening && drillMode;
    // Chaining only makes sense for the free-running quiz style, not a fixed drill/weak queue.
    const chaining = !weak && !drilling && chainIntervals;
    if (listening) {
      try {
        const input = await startAudioInput(
          inputDeviceId,
          (frame) => handleFrame(frame.freq),
          () => listenCfg.current.silenceRms,
        );
        if (!mountedRef.current) {
          input.stop();
          return;
        }
        inputRef.current = input;
        // Device labels only become available once permission is granted.
        void listAudioInputs().then(setInputs);
      } catch {
        setError(
          "Couldn't open the audio input. Check the browser's microphone permission.",
        );
        return;
      }
      const queue = weak
        ? shuffled(
            weakList.map((e) =>
              randomIntervalRound(range, [e.interval], [e.direction]),
            ),
          )
        : drilling
          ? shuffled(drillQueueForPool(range, pool, directions))
          : [];
      sessionRef.current = {
        total: drilling ? queue.length : roundCount,
        index: 0,
        round: null,
        noteIndex: 0,
        best: null,
        degreeMisses: 0,
        hadMistake: false,
        results: [],
        rounds: [],
        stable: 0,
        last: null,
        previousMidi: null,
        settled: true,
        lastCorrectMidi: null,
        queue,
      };
      sessionStartRef.current = performance.now();
    } else {
      sessionRef.current = null;
    }

    const seconds = Math.max(MIN_ROUND_SECONDS, roundSeconds);
    upcomingRef.current = null;
    const advance = () => {
      if (skipTimeoutRef.current) {
        clearTimeout(skipTimeoutRef.current);
        skipTimeoutRef.current = null;
      }
      clearIntervalPlayback();
      clearCountdownClicks();
      const session = sessionRef.current;
      if (session) {
        // Lock in the interval that just finished; a timeout counts as a miss.
        const finishedGrade = session.best ?? "incorrect";
        if (session.round) {
          session.results.push(finishedGrade);
          session.rounds.push(session.round);
          bumpIntervalStat(session.round.interval.id, session.round.direction, finishedGrade);
          // Drill mode: a miss goes back on the end of the queue — with a freshly randomized
          // octave for the retry, so a repeated miss doesn't look like the exact same round.
          if (drilling && finishedGrade === "incorrect") {
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
              chainIntervals,
              includeDescending,
              roundCount,
              intervalIdsKey: pool
                .map((i) => i.id)
                .sort()
                .join(","),
              accidentalStyle,
              roundSeconds,
              toleranceCents,
              holdMs,
              advanceDelayMs,
              refA,
              sensitivity,
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
          setNextRound(null);
          endSession();
          return;
        }
        session.index++;
        // A held note ringing on shouldn't be graded against the next round's first note; wait
        // for it to stop (silence, or a pitch that isn't this one) before grading resumes.
        session.previousMidi = session.round
          ? parseNote(session.round.notes[session.round.notes.length - 1])
          : null;
        session.settled = session.previousMidi === null;
        session.lastCorrectMidi = null;
        session.best = null;
        session.noteIndex = 0;
        session.degreeMisses = 0;
        session.hadMistake = false;
        session.stable = 0;
        session.last = null;
        setStatus(null);
        setHeard(null);
        setIntervalProgress(0);
        setDegreeMiss(false);
        // Drill mode's total grows when an interval gets requeued, so "X of Y" reflects what's
        // actually left rather than staying fixed at the pool size.
        setProgress(
          drilling
            ? {
                index: session.index,
                total: session.index + session.queue.length,
              }
            : { index: session.index, total: session.total },
        );
      }

      let next: IntervalRound;
      let following: IntervalRound | null;
      if (drilling && session) {
        next = session.queue.shift()!;
        following = session.queue[0] ?? null;
        upcomingRef.current = null;
      } else {
        next = upcomingRef.current ?? randomIntervalRound(range, pool, directions);
        const isLast = session ? session.index >= session.total : false;
        if (isLast) {
          following = null;
        } else if (chaining) {
          const fromMidi = parseNote(next.notes[next.notes.length - 1]);
          following =
            fromMidi !== null
              ? chainedIntervalRound(fromMidi, range, pool, directions)
              : randomIntervalRound(range, pool, directions);
        } else {
          following = randomIntervalRound(range, pool, directions);
        }
        upcomingRef.current = following;
      }
      if (session) {
        session.round = next;
        session.noteIndex = 0;
      }
      roundSeedRef.current++;
      setRoundSeed(roundSeedRef.current);
      noteTimerRef.current = {
        startedAt: performance.now(),
        durationMs: seconds * 1000,
      };
      setRound(next);
      setNextRound(following);
      if (playSoundRef.current && !session) {
        playIntervalSound(next.notes);
      }
    };

    // Moving on early (a finished interval, or the skip button) restarts the timer so the next
    // round gets its own full max time rather than continuing on the old round's schedule.
    skipRef.current = () => {
      advance();
      if (sessionRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(advance, seconds * 1000);
      }
    };

    advance();
    setWaiting(listening);
    setRunning(true);
    intervalRef.current = setInterval(advance, seconds * 1000);
  }

  useSpaceToggle(running ? stop : () => void start());

  const arrow = (r: IntervalRound) => (r.direction === 1 ? "↑" : "↓");
  const rootLabel = (r: IntervalRound, seq = 0) =>
    spellNote(midiToNote(r.startMidi), accidentalStyle, seq, ignoreOctave);
  // The starting note is always shown, even mid-chain — a chained round that hid it would leave
  // no way to recover after a wrong note, since there'd be nothing on screen to re-orient from.
  const roundLabel = (r: IntervalRound, seq = 0) =>
    `${rootLabel(r, seq)} ${arrow(r)} ${r.interval.label}`;
  const mainLabel = round ? roundLabel(round, roundSeed) : "—";
  const mainLabelLong = mainLabel.length > 16;
  const glow = running && status ? GRADE_COLOR[status] : null;
  const showCountdown = running;
  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) =>
    summary?.results.filter((g) => g === grade).length ?? 0;
  const currentConfig: HistoryConfig = {
    rangeInput,
    drillMode,
    chainIntervals,
    includeDescending,
    roundCount,
    intervalIdsKey: pool
      .map((i) => i.id)
      .sort()
      .join(","),
    accidentalStyle,
    roundSeconds,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    sensitivity,
  };
  const matchingHistory = history.filter((h) =>
    sameConfig(h.config, currentConfig),
  );
  const bestMs = matchingHistory.length
    ? Math.min(...matchingHistory.map((h) => h.elapsedMs))
    : null;
  const weakEntries = weakIntervalEntries(settings.intervalStats);

  return (
    <ToolLayout
      title="Interval Trainer"
      presets={toolPresets("interval-trainer", settings, updateSettings)}
      sidePanel={
        listenMode && (
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
                            {entry.config.drillMode
                              ? "Drill"
                              : entry.config.chainIntervals
                                ? "Chained"
                                : "Quiz"}{" "}
                            · {new Date(entry.at).toLocaleDateString()}
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
                  No struggles tracked yet — a wrong or partial interval in listen mode adds it
                  here.
                </p>
              ) : (
                <div className={PANEL_LIST}>
                  {weakEntries.map((entry) => (
                    <div
                      key={entry.key}
                      className={PANEL_ROW}
                    >
                      <span className="font-medium">
                        {entry.interval.label} {entry.direction === 1 ? "↑" : "↓"}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                        {entry.counts.incorrect > 0 && (
                          <span style={{ color: GRADE_COLOR.incorrect }}>
                            ✕{entry.counts.incorrect}
                          </span>
                        )}
                        {entry.counts.partial > 0 && (
                          <span style={{ color: GRADE_COLOR.partial }}>
                            ~{entry.counts.partial}
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
        )
      }
      optionsMode={
        <Segmented
          onPage
          label="Mode"
          value={listenMode ? "listen" : "timed"}
          onChange={(v) => setListenMode(v === "listen")}
          disabled={running}
          options={[
            { value: "timed", label: "Timed" },
            { value: "listen", label: "Listen" },
          ]}
        />
      }
      options={
        <>
          <PanelsToggle ids={PANEL_IDS} />
          <CollapsiblePanel id="interval-set" title="Intervals" icon={IntervalIcon} summary={`${pool.length} of ${INTERVALS.length}`}>
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
            <Hint>Which intervals can be picked for a round. At least one must stay selected.</Hint>

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
              hint="Lets a round ask for the interval below the starting note, not just above it."
            />
          </CollapsiblePanel>

          <CollapsiblePanel id="interval-range" title="Range" icon={NoteIcon} summary={rangeInput}>
            <SwitchRow
              label="Ignore octave"
              checked={ignoreOctave}
              onChange={setIgnoreOctave}
              disabled={running}
              hint="Hides the octave number (e.g. Major 3rd instead of C4 Major 3rd) and accepts either note played in any octave."
            />

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Accidentals</span>
              <Select
                value={accidentalStyle}
                onChange={setAccidentalStyle}
                disabled={running}
                options={ACCIDENTAL_STYLES}
              />
            </label>
            <Hint>How sharps and flats are spelled, e.g. C# vs Db.</Hint>

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
            <Hint>Sets the range starting notes are drawn from, to match what you&apos;re practicing on.</Hint>

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

            {/* In listen mode this becomes "Max time", shown in the Listen mode section instead. */}
            {!listenMode && (
              <AdvancedSlider
                label="Interval"
                value={roundSeconds}
                unit="s"
                min={MIN_ROUND_SECONDS}
                max={MAX_ROUND_SECONDS}
                step={0.5}
                disabled={running}
                onChange={setRoundSeconds}
                hint="How long each round stays on screen before the next one shows."
              />
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            id="interval-listen"
            title="Listen"
            icon={MicIcon}
            asMode
            toggle={{
              checked: listenMode,
              onChange: setListenMode,
              disabled: running,
            }}
          >
            <AdvancedSlider
              label="Max time"
              value={roundSeconds}
              unit="s"
              min={MIN_ROUND_SECONDS}
              max={MAX_ROUND_SECONDS}
              step={0.5}
              disabled={running}
              onChange={setRoundSeconds}
              hint="How long you have to finish playing each round before it's marked a miss and moves on."
            />

            <AdvancedSlider
              label="Time between rounds"
              value={advanceDelayMs / 1000}
              unit="s"
              min={MIN_ADVANCE_DELAY_MS / 1000}
              max={MAX_ADVANCE_DELAY_MS / 1000}
              step={0.25}
              disabled={running}
              hint="How long the graded round (with its countdown ring) stays on screen before the next one starts."
              onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
            />

            <SwitchRow
              label="Sound feedback"
              checked={soundFeedback}
              onChange={setSoundFeedback}
              disabled={running}
              hint="A click each second of the countdown, plus a click the instant a round is graded."
            />

            <SwitchRow
              label="Continue from previous note"
              checked={chainIntervals}
              onChange={setChainIntervals}
              disabled={!listenMode || running || drillMode}
              hint="After the first round, each one continues from where the last interval left off instead of a fresh starting note — one long chain."
            />

            <SwitchRow
              label="Drill every interval"
              checked={drillMode}
              onChange={setDrillMode}
              disabled={!listenMode || running || chainIntervals}
              hint="Plays every selected interval, in every selected direction, starting on all 12 keys, each in a random octave."
            />

            {!drillMode && (
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
                  disabled={running || !listenMode}
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

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Audio input</span>
              <Select
                value={inputDeviceId}
                onChange={setInputDeviceId}
                disabled={running}
                options={[
                  { value: "", label: "Default input" },
                  ...inputs.map((d) => ({ value: d.id, label: d.label })),
                ]}
              />
            </label>
            <Hint>Which microphone or audio interface listen mode listens through.</Hint>

            <InputTest
              deviceId={inputDeviceId}
              disabled={running}
              silenceRms={SENSITIVITY[sensitivity].rms}
              refA={refA}
            />

            <Disclosure title="Advanced">
              <AdvancedSlider
                label="Tuning tolerance"
                value={toleranceCents}
                unit="¢"
                min={10}
                max={100}
                step={5}
                disabled={running || !listenMode}
                onChange={(v) => updateSettings({ toleranceCents: v })}
                hint="How many cents off pitch still counts as correct, so a slightly out-of-tune instrument still passes."
              />
              <AdvancedSlider
                label="Note hold time"
                value={holdMs}
                unit=" ms"
                min={30}
                max={300}
                step={30}
                disabled={running || !listenMode}
                onChange={(v) => updateSettings({ holdMs: v })}
                hint="How long a pitch has to stay steady before it's graded, so a quick slide or slip isn't counted."
              />
              <AdvancedSlider
                label="Reference pitch (A4)"
                value={refA}
                unit=" Hz"
                min={415}
                max={466}
                step={1}
                disabled={running || !listenMode}
                onChange={(v) => updateSettings({ refA: v })}
                hint="The frequency concert A is tuned to. 440 is standard."
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">
                  Input sensitivity
                </span>
                <Select
                  value={sensitivity}
                  onChange={(value) => updateSettings({ sensitivity: value })}
                  disabled={running || !listenMode}
                  options={Object.entries(SENSITIVITY).map(
                    ([value, { label }]) => ({
                      value,
                      label,
                    }),
                  )}
                />
              </label>
              <Hint>How quiet a signal can be before it&apos;s treated as silence — raise it in a noisy room.</Hint>
              <SwitchRow
                label="Partial credit"
                checked={partialCredit}
                onChange={setPartialCredit}
                disabled={running || !listenMode}
                hint="A wrong note gets one retry; missing it twice fails the round instead of failing on the first miss."
              />
              <SwitchRow
                label="Ignore repeated notes"
                checked={ignoreRepeatedNotes}
                onChange={setIgnoreRepeatedNotes}
                disabled={running || !listenMode}
                hint="A fresh attack of the note you just played (e.g. a double pluck) is ignored instead of graded as wrong."
              />
              <button
                type="button"
                onClick={() =>
                  updateSettings({
                    toleranceCents: DEFAULT_SETTINGS.toleranceCents,
                    holdMs: DEFAULT_SETTINGS.holdMs,
                    refA: DEFAULT_SETTINGS.refA,
                    sensitivity: DEFAULT_SETTINGS.sensitivity,
                    partialCredit: DEFAULT_SETTINGS.partialCredit,
                    ignoreRepeatedNotes: DEFAULT_SETTINGS.ignoreRepeatedNotes,
                  })
                }
                disabled={running}
                className={`self-start ${SECONDARY_BUTTON_SM}`}
              >
                Reset advanced settings
              </button>
            </Disclosure>
          </CollapsiblePanel>

          <CollapsiblePanel
            id="interval-sound"
            title="Sound & display"
            icon={SlidersIcon}
          >
            <SwitchRow
              label="Play interval out loud"
              checked={playSound && !listenMode}
              onChange={setPlaySound}
              disabled={listenMode}
              hint="Plays both notes of the interval in order as it appears. Not available in listen mode."
            />

            <SwitchRow
              label="Show next interval"
              checked={showNext}
              onChange={setShowNext}
              hint="Shows a preview of the upcoming interval next to the current one."
            />

            <SwitchRow
              label="Show interval notes"
              checked={showIntervalNotes}
              onChange={setShowIntervalNotes}
              hint="The two note pills below the circle in listen mode, showing progress through the round."
            />

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Tone</span>
              <Select
                value={toneId}
                onChange={setToneId}
                disabled={!playSound}
                options={TONES.map((tone) => ({
                  value: tone.id,
                  label: tone.label,
                }))}
              />
            </label>
            <Hint>Which sound plays an interval out loud.</Hint>
          </CollapsiblePanel>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
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
        <div className="relative">
          <div className="relative flex h-44 w-44 items-center justify-center p-4 text-center sm:h-56 sm:w-56">
            <CountdownRing active={showCountdown} timerRef={noteTimerRef} />
            <p
              className={`relative z-10 font-bold in-[.classic-look]:font-extrabold transition-colors duration-200 ${
                mainLabelLong ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"
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
            {!round && !running && (
              <p className="absolute inset-x-0 bottom-6 z-10 text-sm text-muted">
                {listenMode
                  ? "Press Start, then play each interval. The mic checks it."
                  : "Press Start, then play each interval shown."}
              </p>
            )}
          </div>
          {showNext && nextRound && running && (
            <span
              aria-label={`Next interval ${roundLabel(nextRound, roundSeed + 1)}`}
              className="absolute bottom-1 left-full ml-3 max-w-[9rem] text-sm font-medium text-muted sm:text-base"
            >
              {roundLabel(nextRound, roundSeed + 1)}
            </span>
          )}
        </div>

        {listenMode && running && round && showIntervalNotes && (
          <div className="flex flex-wrap justify-center gap-1.5 px-2">
            {round.notes.map((n, i) => {
              const label = spellNote(n, accidentalStyle, roundSeed, true);
              const matched = i < intervalProgress;
              const failed = i === intervalProgress && status === "incorrect";
              // Missed once and waiting for a retry (partial-credit mode only).
              const retrying = i === intervalProgress && degreeMiss && !failed;
              const current = i === intervalProgress && !matched && !failed && !retrying;
              const color = matched
                ? GRADE_COLOR.correct
                : failed
                  ? GRADE_COLOR.incorrect
                  : retrying
                    ? GRADE_COLOR.partial
                    : undefined;
              return (
                <span
                  key={i}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                    current ? "border-accent" : color ? "" : "border-foreground/15"
                  }`}
                  style={{
                    color,
                    borderColor: color && !current ? color : undefined,
                    background: color
                      ? `color-mix(in srgb, ${color} 12%, transparent)`
                      : undefined,
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {running && progress && (
          <div className="flex flex-col items-center gap-0.5 text-sm text-muted">
            <span className="tabular-nums">
              Interval {progress.index} of {progress.total}
              {" · "}
              <ElapsedTimer active={running} startRef={sessionStartRef} />
            </span>
            <span className="tabular-nums">
              {heard ? `Heard ${heard}` : "Listening…"}
            </span>
            {waiting && (
              <button
                type="button"
                onClick={() => skipRef.current?.()}
                className={`mt-2 ${SECONDARY_BUTTON}`}
              >
                Skip interval
              </button>
            )}
          </div>
        )}
      </div>

      {summary && !running && (
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
            {(["correct", "partial", "incorrect"] as const).map((grade) => (
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
                {roundLabel(r, i)}
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
        onClick={running ? stop : () => void start()}
        className={startButtonClass(running)}
      >
        {running ? "Stop" : "Start"}
      </button>
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to start or stop
      </KeyHint>
    </ToolLayout>
  );
}
