import { CUSTOM_INSTRUMENT_ID, INSTRUMENTS } from '@jam-practice/core/instruments';
import {
  DEFAULT_ENABLED_INTERVAL_IDS,
  INTERVALS,
  chainedIntervalRound,
  drillQueueForPool,
  intervalRoundForPitchClass,
  pitchClassOf,
  randomIntervalRound,
  type Direction,
  type IntervalDef,
  type IntervalRound,
} from '@jam-practice/core/intervals';
import {
  describePitch,
  frequencyToMidi,
  gradePitch,
  scoreOf,
  type Grade,
} from '@jam-practice/core/noteGrade';
import { ACCIDENTAL_STYLES, spellNote, type AccidentalStyle } from '@jam-practice/core/noteSpelling';
import { midiToNote, noteToFrequency, parseNote, parseRange } from '@jam-practice/core/noteRange';
import { bumpGradeCounts, rankWeak, type GradeCounts } from '@jam-practice/core/struggleStats';
import { shuffled } from '@jam-practice/core/trainerUtils';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CountdownLabel, ElapsedTimer } from '@/components/CountdownLabel';
import { Dropdown } from '@/components/Dropdown';
import { IntervalIcon, MicrophoneIcon, NoteIcon, SlidersIcon, StopwatchIcon } from '@/components/icons';
import { SwitchRow } from '@/components/SwitchRow';
import {
  Field,
  HistoryChip,
  IdleHint,
  MutedText,
  OptionsArea,
  Pill,
  PillChoice,
  PoolHeader,
  QuizRing,
  ResultsPanel,
  SheetButton,
  SheetDivider,
  SheetInput,
  SheetText,
  SliderField,
  StrugglesChip,
  ToolScreen,
  instrumentShortName,
  noteGlyphs,
  useGradeColors,
} from '@/components/tool/ear';
import { BigButton } from '@/components/tool/meter';
import { Segmented } from '@/components/tool/reward';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { SENSITIVITY, startAudioInput } from '@/lib/audioInput';
import { startTone } from '@/lib/toneGenerator';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useToolActivity } from '@/lib/toolTime';

/**
 * Native port of `apps/web/components/IntervalTrainer.tsx`. Same two-note-round grading loop as
 * Scale Trainer's own listen mode (start note, then target note — always exactly two), built on
 * the same mic-input/pitch-detection engine the Tuner already proved on-device
 * (`@/lib/audioInput`'s `startAudioInput` + `@jam-practice/core/pitchDetect`'s YIN detector) rather
 * than a new one. Laid out like the website's (`components/tool/ear.tsx`): History / Struggles chips
 * (Listen, once there's something in them), the round in its ring, Start, then Timed / Listen and
 * the Intervals, Range, Time per interval, Microphone (Listen) and Sound & display chips.
 *
 * Settings (including the lifetime "Struggles" stats and the timed "History" list) sync to the
 * signed-in account via `useSyncedSettings`, falling back to this device's own cache when offline
 * or signed out — see that hook's own doc comment.
 *
 * Scoped down from the web version, matching this app's own established mobile precedents:
 * - **No audio-input-device picker, no mic-level test strip.** `@/lib/audioInput`'s own doc
 *   comment explains why there's no native equivalent of web's `MediaDeviceInfo` enumeration to
 *   build one from — `AudioRecorder` always records through whatever the OS currently treats as
 *   the active input. Matches the Tuner's own precedent.
 * - **No keyboard shortcut** (web's `useSpaceToggle`/`KeyHint`) — there's no hardware keyboard to
 *   bind Space to on a touch device.
 * - **"Play interval out loud" plays through the four plain oscillator waveforms
 *   `@/lib/toneGenerator` already supports** (same catalog the Tuner's own tone generator uses),
 *   not web's full `lib/tones.ts` catalog (piano/organ/pluck samples) — no sampled-tone engine has
 *   been ported to native yet.
 */
const MIN_ROUND_SECONDS = 1;
const MAX_ROUND_SECONDS = 15;
const DEFAULT_ROUND_SECONDS = 5;

const INTERVAL_NOTE_DURATION_SECONDS = 0.4;
const INTERVAL_NOTE_GAP_MS = 450;

const MIN_ROUND_COUNT = 5;
const MAX_ROUND_COUNT = 50;
const DEFAULT_ROUND_COUNT = 15;
/** The cadence `@/lib/audioInput`'s `startAudioInput` actually delivers frames at (its own
    `ANALYSIS_INTERVAL_MS`) — used to convert "note hold time" (ms) into a frame count, the native
    equivalent of web's `FRAME_MS = 30` (that engine's own, faster ~33Hz polling rate). */
const FRAME_MS = 50;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 1500;

const MIN_REF = 415;
const MAX_REF = 466;

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';
const WAVEFORMS: { value: Wave; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'square', label: 'Square' },
];

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
  return (Object.keys(a) as (keyof HistoryConfig)[]).every((key) => a[key] === b[key]);
}

type HistoryEntry = {
  at: number;
  elapsedMs: number;
  score: number;
  total: number;
  config: HistoryConfig;
};

type WeakInterval = {
  key: string;
  interval: IntervalDef;
  direction: Direction;
  counts: GradeCounts;
  score: number;
};

const SETTINGS_KEY = 'jam-practice-interval-trainer';
const DEFAULT_SETTINGS = {
  instrumentId: INSTRUMENTS[0].id,
  customRange: 'A1-A6',
  roundSeconds: DEFAULT_ROUND_SECONDS,
  ignoreOctave: false,
  toleranceCents: 50,
  holdMs: 120,
  advanceDelayMs: DEFAULT_ADVANCE_DELAY_MS,
  refA: 440,
  sensitivity: 'normal',
  partialCredit: false,
  ignoreRepeatedNotes: false,
  soundFeedback: false,
  playSound: false,
  showNext: false,
  showIntervalNotes: true,
  wave: 'triangle' as Wave,
  listenMode: false,
  roundCount: DEFAULT_ROUND_COUNT,
  drillMode: false,
  includeDescending: false,
  chainIntervals: false,
  history: [] as HistoryEntry[],
  accidentalStyle: 'sharp' as AccidentalStyle,
  intervalIds: DEFAULT_ENABLED_INTERVAL_IDS as string[],
  intervalStats: {} as Record<string, GradeCounts>,
};

/** A short neutral click, for "Sound feedback" — a plain brief oscillator blip rather than a
    pitched note, since it's a cue, not a note to imitate. Self-contained (not routed through the
    Metronome's own click engine) so this screen stays independent of a tool being built in
    parallel against the same shared files. */
function playClick() {
  startTone(1000, 'sine', 0.5, 0.05);
}

function IntervalTrainerScreen() {
  const { colors, derived } = useAppTheme();
  const GRADE_COLOR = useGradeColors();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);

  const {
    customRange,
    roundSeconds,
    playSound,
    showNext,
    showIntervalNotes,
    wave,
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

  const history = settings.history.filter(
    (h): h is HistoryEntry => !!h && typeof h.config === 'object' && h.config !== null,
  );
  const accidentalStyle = ACCIDENTAL_STYLES.some((s) => s.value === settings.accidentalStyle)
    ? settings.accidentalStyle
    : 'sharp';
  const sensitivity = settings.sensitivity in SENSITIVITY ? settings.sensitivity : 'normal';
  const roundCount = Math.min(MAX_ROUND_COUNT, Math.max(MIN_ROUND_COUNT, Math.round(settings.roundCount)));
  const instrumentId =
    settings.instrumentId === CUSTOM_INSTRUMENT_ID || INSTRUMENTS.some((i) => i.id === settings.instrumentId)
      ? settings.instrumentId
      : INSTRUMENTS[0].id;
  const pool = INTERVALS.filter((i) => settings.intervalIds.includes(i.id));
  const directions: Direction[] = includeDescending ? [1, -1] : [1];
  const isCustom = instrumentId === CUSTOM_INSTRUMENT_ID;
  const rangeInput = isCustom ? customRange : INSTRUMENTS.find((i) => i.id === instrumentId)?.range ?? '';

  const [round, setRound] = useState<IntervalRound | null>(null);
  const [nextRound, setNextRound] = useState<IntervalRound | null>(null);
  const [running, setRunning] = useState(false);
  useToolActivity('/interval-trainer', running);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [roundSeed, setRoundSeed] = useState(0);
  const [intervalProgress, setIntervalProgress] = useState(0);
  const [degreeMiss, setDegreeMiss] = useState(false);
  const [lastMode, setLastMode] = useState<'normal' | 'weak'>('normal');
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [noteTimer, setNoteTimer] = useState({ startedAt: 0, durationMs: 1000 });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const upcomingRef = useRef<IntervalRound | null>(null);
  const roundSeedRef = useRef(0);
  const sessionStartRef = useRef<number | null>(null);
  const playSoundRef = useRef(playSound);
  const waveRef = useRef(wave);
  const inputRef = useRef<{ stop: () => void } | null>(null);
  const mountedRef = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  const cfgRef = useRef({
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
  // Source of truth for intervalStats *during* a running session — updateSettings' own
  // module-level cache doesn't re-render this component synchronously within the same event-loop
  // tick, so several bumps in a row (back-to-back frames) need a ref, not `settings`, to avoid
  // each one clobbering the last with a stale read.
  const intervalStatsRef = useRef(settings.intervalStats);

  useEffect(() => {
    playSoundRef.current = playSound;
    waveRef.current = wave;
    cfgRef.current = {
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
    wave,
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
      intervalPlaybackTimeouts.current.forEach(clearTimeout);
      countdownClickTimeouts.current.forEach(clearTimeout);
      inputRef.current?.stop();
    };
  }, []);

  /** Struggle stats are tracked per interval *and* direction — "Major 3rd ascending" and "Major
      3rd descending" are separate struggles, not tied to any particular starting note. */
  function intervalStatKey(intervalId: string, direction: Direction): string {
    return `${intervalId}:${direction}`;
  }

  function parseIntervalStatKey(key: string): { interval: IntervalDef; direction: Direction } | null {
    const [intervalId, directionText] = key.split(':');
    const direction = Number(directionText);
    if (direction !== 1 && direction !== -1) return null;
    const interval = INTERVALS.find((i) => i.id === intervalId);
    return interval ? { interval, direction } : null;
  }

  function bumpIntervalStat(intervalId: string, direction: Direction, grade: Grade) {
    const key = intervalStatKey(intervalId, direction);
    intervalStatsRef.current = bumpGradeCounts(intervalStatsRef.current, key, grade);
    updateSettings({ intervalStats: intervalStatsRef.current });
  }

  function clearIntervalStats() {
    intervalStatsRef.current = {};
    updateSettings({ intervalStats: {} });
  }

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

  /** One click per whole second of the countdown to the next interval, for "Sound feedback". */
  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!cfgRef.current.soundFeedback) return;
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
        setTimeout(() => {
          const freq = noteToFrequency(n);
          if (freq !== null) startTone(freq, waveRef.current, 0.35, INTERVAL_NOTE_DURATION_SECONDS);
        }, i * INTERVAL_NOTE_GAP_MS),
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
    }, cfgRef.current.advanceDelayMs);
  }

  /** Locks in a round's grade and starts the pause-before-next-interval countdown. */
  function lockInRound(grade: Grade) {
    const session = sessionRef.current;
    if (!session) return;
    session.best = grade;
    setStatus(grade);
    const pauseMs = cfgRef.current.advanceDelayMs;
    // `lockInRound` only ever runs from `handleFrame` (a mic-input callback) or `advance` (a
    // timer callback) — never during render — but the compiler's lint integration bails out of
    // analyzing a component this size before it would confirm that itself, same false positive
    // `apps/web/components/GuessTheChord.tsx` already documents for the identical pattern.
    // eslint-disable-next-line react-hooks/purity
    setNoteTimer({ startedAt: Date.now(), durationMs: pauseMs });
    if (cfgRef.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    scheduleAdvance(session.index);
  }

  /** Called roughly 20 times a second with whatever pitch the mic is hearing. */
  function handleFrame(freq: number | null) {
    const session = sessionRef.current;
    if (!session || !session.round) return;
    if (freq === null) {
      session.stable = 0;
      session.last = null;
      session.settled = true;
      setHeard(null);
      return;
    }
    const cfg = cfgRef.current;
    const { note: heardNote, cents } = describePitch(freq, cfg.refA);
    const shownNote = spellNote(heardNote, cfg.accidentalStyle, roundSeedRef.current, cfg.ignoreOctave);
    setHeard(`${shownNote} (${cents > 0 ? '+' : ''}${cents}¢)`);

    const nearest = Math.round(frequencyToMidi(freq, cfg.refA));
    if (nearest === session.last) session.stable++;
    else {
      session.last = nearest;
      session.stable = 1;
    }
    if (session.stable < cfg.holdFrames) return;

    if (!session.settled) {
      if (nearest === session.previousMidi) return;
      session.settled = true;
    }

    if (session.best !== null) return;

    if (cfg.ignoreRepeatedNotes && session.lastCorrectMidi !== null && nearest === session.lastCorrectMidi) {
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

    if (played === 'incorrect') {
      if (!cfg.partialCredit) {
        lockInRound('incorrect');
        return;
      }
      session.hadMistake = true;
      session.degreeMisses++;
      if (session.degreeMisses >= 2) {
        setDegreeMiss(false);
        lockInRound('incorrect');
        return;
      }
      setDegreeMiss(true);
      session.previousMidi = nearest;
      session.settled = false;
      session.stable = 0;
      session.last = null;
      return;
    }

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
      lockInRound(session.hadMistake ? 'partial' : 'correct');
    }
  }

  /** `"weak"` starts a focused session on just the exact interval+direction combos tracked as
      struggles instead of the normal quiz/drill. Always listens (regardless of the "Listen mode"
      toggle, switched on to match) and never touches the timed History list. */
  async function start(mode: 'normal' | 'weak' = 'normal') {
    const weak = mode === 'weak';
    setLastMode(mode);
    const range = parseRange(rangeInput);
    if (!range) {
      setError('Enter a valid range like "A1-A6".');
      return;
    }
    const weakList = weak ? weakIntervalEntries(intervalStatsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError('No struggling intervals yet — misses in listen mode build this list up.');
      return;
    }
    if (!weak && pool.length === 0) {
      setError('Select at least one interval to practice.');
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
    const drilling = weak ? true : listening && drillMode;
    const chaining = !weak && !drilling && chainIntervals;

    if (listening) {
      try {
        const input = await startAudioInput((frame) => handleFrame(frame.freq), () => cfgRef.current.silenceRms);
        if (!mountedRef.current) {
          input.stop();
          return;
        }
        inputRef.current = input;
      } catch {
        setError("Couldn't access the microphone. Check the app's microphone permission.");
        return;
      }
      const queue = weak
        ? shuffled(weakList.map((e) => randomIntervalRound(range, [e.interval], [e.direction])))
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
      // `start` only ever runs from a button's `onPress` (or recursively, via "Try again"/"Shed
      // weak intervals") — never during render. Same documented false positive as `lockInRound`'s
      // own `Date.now()` call above.
      // eslint-disable-next-line react-hooks/purity
      sessionStartRef.current = Date.now();
      setSessionStartedAt(sessionStartRef.current);
    } else {
      sessionRef.current = null;
      setSessionStartedAt(null);
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
        const finishedGrade = session.best ?? 'incorrect';
        if (session.round) {
          session.results.push(finishedGrade);
          session.rounds.push(session.round);
          bumpIntervalStat(session.round.interval.id, session.round.direction, finishedGrade);
          if (drilling && finishedGrade === 'incorrect') {
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
        const done = drilling ? session.queue.length === 0 : session.index >= session.total;
        if (done) {
          const elapsedMs = sessionStartRef.current ? Date.now() - sessionStartRef.current : 0;
          sessionStartRef.current = null;
          setSessionStartedAt(null);
          if (weak) {
            setLastElapsedMs(null);
            setIsNewBest(false);
          } else {
            const config: HistoryConfig = {
              rangeInput,
              drillMode,
              chainIntervals,
              includeDescending,
              roundCount,
              intervalIdsKey: pool.map((i) => i.id).sort().join(','),
              accidentalStyle,
              roundSeconds,
              toleranceCents,
              holdMs,
              advanceDelayMs,
              refA,
              sensitivity,
            };
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
        setProgress(
          drilling
            ? { index: session.index, total: session.index + session.queue.length }
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
          following = fromMidi !== null ? chainedIntervalRound(fromMidi, range, pool, directions) : randomIntervalRound(range, pool, directions);
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
      setNoteTimer({ startedAt: Date.now(), durationMs: seconds * 1000 });
      setRound(next);
      setNextRound(following);
      if (playSoundRef.current && !session) {
        playIntervalSound(next.notes);
      }
    };

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

  const arrow = (r: IntervalRound) => (r.direction === 1 ? '↑' : '↓');
  const rootLabel = (r: IntervalRound, seq = 0) => spellNote(midiToNote(r.startMidi), accidentalStyle, seq, ignoreOctave);
  const roundLabel = (r: IntervalRound, seq = 0) => `${rootLabel(r, seq)} ${arrow(r)} ${r.interval.label}`;
  const mainLabel = round ? roundLabel(round, roundSeed) : '?';
  const glow = running && status ? GRADE_COLOR[status] : null;
  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) => summary?.results.filter((g) => g === grade).length ?? 0;
  const currentConfig: HistoryConfig = {
    rangeInput,
    drillMode,
    chainIntervals,
    includeDescending,
    roundCount,
    intervalIdsKey: pool.map((i) => i.id).sort().join(','),
    accidentalStyle,
    roundSeconds,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    sensitivity,
  };
  const matchingHistory = history.filter((h) => sameConfig(h.config, currentConfig));
  const bestMs = matchingHistory.length ? Math.min(...matchingHistory.map((h) => h.elapsedMs)) : null;
  const weakEntries = weakIntervalEntries(settings.intervalStats);
  const showingSummary = summary !== null && !running;

  const rangeSummary = `${instrumentShortName(instrumentId)} · ${ignoreOctave ? 'any octave' : rangeInput.replace('-', '–')}`;
  const showSide = listenMode && !running && (history.length > 0 || weakEntries.length > 0);
  const locked = running ? <SheetText>Stop to change these.</SheetText> : null;

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady) return <ScreenSpinner />;

  return (
    <ToolScreen title="Interval Trainer">
      {/* Listen mode's History and Struggles, once there's something in them. */}
      {showSide ? (
        <SettingsBar>
          <HistoryChip
            entries={matchingHistory}
            bestMs={bestMs}
            onClear={() => updateSettings({ history: history.filter((h) => !sameConfig(h.config, currentConfig)) })}
          />
          <StrugglesChip
            entries={weakEntries.map((e) => ({ key: e.key, label: `${e.interval.label} ${e.direction === 1 ? '↑' : '↓'}`, counts: e.counts }))}
            shedLabel="Shed weak intervals"
            emptyText="No struggles tracked yet — a wrong or partial round in listen mode adds it here."
            running={running}
            onShed={() => void start('weak')}
            onClear={clearIntervalStats}
          />
        </SettingsBar>
      ) : null}

      {showingSummary && summary ? (
        <ResultsPanel
          score={score}
          total={summary.results.length}
          elapsed={lastElapsedMs}
          bestMs={bestMs}
          isNewBest={isNewBest}
          grades={(['correct', 'partial', 'incorrect'] as const).map((g) => ({ grade: g, count: tally(g) }))}
          tags={summary.rounds.map((r, i) => ({ label: noteGlyphs(roundLabel(r, i)), grade: summary.results[i] }))}
          onAgain={() => void start(lastMode)}
          onClose={() => setSummary(null)}
        />
      ) : (
        <View className="w-full items-center gap-2">
          {status && running ? (
            <View className="items-center">
              <MutedText className="text-xs">Next interval in</MutedText>
              <CountdownLabel
                active={running}
                startedAt={noteTimer.startedAt}
                durationMs={noteTimer.durationMs}
                textClassName="font-ui-semibold text-3xl font-semibold tabular-nums"
                color={GRADE_COLOR[status]}
              />
            </View>
          ) : null}
          <QuizRing size={168} running={running} timer={noteTimer}>
            {running ? (
              <Text
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                className="font-ui-bold text-center text-2xl font-bold"
                style={{ color: glow ?? colors.foreground }}
              >
                {noteGlyphs(mainLabel)}
              </Text>
            ) : null}
          </QuizRing>
          {/* Before the first round, say what's about to happen. */}
          {!running ? (
            <IdleHint>{listenMode ? 'Press Start, then play each interval. The mic checks it.' : 'Press Start, then play each interval shown.'}</IdleHint>
          ) : null}

          {showNext && nextRound && running ? <MutedText className="text-xs">Next: {noteGlyphs(roundLabel(nextRound, roundSeed + 1))}</MutedText> : null}

          {listenMode && running && round && showIntervalNotes ? (
            <View className="flex-row flex-wrap justify-center gap-1.5">
              {round.notes.map((n, i) => {
                const label = spellNote(n, accidentalStyle, roundSeed, true);
                const matched = i < intervalProgress;
                const failed = i === intervalProgress && status === 'incorrect';
                const retrying = i === intervalProgress && degreeMiss && !failed;
                const current = i === intervalProgress && !matched && !failed && !retrying;
                const color = matched ? GRADE_COLOR.correct : failed ? GRADE_COLOR.incorrect : retrying ? GRADE_COLOR.partial : undefined;
                return (
                  <View
                    key={i}
                    className="rounded-md px-2.5 py-1"
                    style={{
                      backgroundColor: color ? withAlpha(color, 0.15) : derived.fill,
                      borderWidth: 1.5,
                      borderColor: current ? colors.accent : 'transparent',
                    }}
                  >
                    <Text className="font-ui-semibold text-xs font-semibold tabular-nums" style={{ color: color ?? colors.foreground }}>
                      {noteGlyphs(label)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {running && progress ? (
            <View className="items-center gap-0.5">
              <View className="flex-row items-center">
                <MutedText className="tabular-nums">
                  Interval {progress.index} of {progress.total} ·{' '}
                </MutedText>
                <ElapsedTimer active={running} startedAt={sessionStartedAt} />
              </View>
              <MutedText className="tabular-nums">{heard ? `Heard ${noteGlyphs(heard)}` : 'Listening…'}</MutedText>
              {waiting ? (
                <View className="mt-2">
                  <Button label="Skip interval" kind="secondary" onPress={() => skipRef.current?.()} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      {error ? (
        <Text className="text-center text-sm font-ui" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}

      {/* While the results show, their own "Try again" is the one start button. */}
      {!showingSummary ? <BigButton label={running ? 'Stop' : 'Start'} secondary={running} onPress={running ? stop : () => void start()} /> : null}

      <OptionsArea
        mode={
          <Segmented
            onPage
            label="Mode"
            value={listenMode ? 'listen' : 'timed'}
            onChange={(v) => updateSettings({ listenMode: v === 'listen' })}
            disabled={running}
            options={[
              { value: 'timed', label: 'Timed' },
              { value: 'listen', label: 'Listen' },
            ]}
          />
        }
      >
        <SettingChip Icon={IntervalIcon} label="Intervals" value={`${pool.length} of ${INTERVALS.length}`}>
          {locked}
          <PoolHeader
            count={pool.length}
            total={INTERVALS.length}
            disabled={running}
            onAll={() => updateSettings({ intervalIds: INTERVALS.map((i) => i.id) })}
            onNone={() => updateSettings({ intervalIds: [] })}
            hint="Which intervals can be picked for a round. At least one must stay selected."
          />
          <View className="flex-row flex-wrap gap-1.5">
            {INTERVALS.map((interval) => {
              const selected = settings.intervalIds.includes(interval.id);
              return (
                <Pill
                  key={interval.id}
                  on={selected}
                  label={interval.label}
                  disabled={running}
                  onPress={() =>
                    updateSettings({
                      intervalIds: selected ? settings.intervalIds.filter((x) => x !== interval.id) : [...settings.intervalIds, interval.id],
                    })
                  }
                />
              );
            })}
          </View>
          <SwitchRow
            label="Include descending intervals"
            checked={includeDescending}
            onChange={(v) => updateSettings({ includeDescending: v })}
            disabled={running}
            hint="Lets a round ask for the interval below the starting note, not just above it."
          />
        </SettingChip>

        <SettingChip Icon={NoteIcon} label="Range" value={rangeSummary}>
          {locked}
          <SwitchRow
            label="Ignore octave"
            checked={ignoreOctave}
            onChange={(v) => updateSettings({ ignoreOctave: v })}
            disabled={running}
            hint="Hides the octave number (e.g. Major 3rd instead of C4 Major 3rd) and accepts either note played in any octave."
          />
          <Field label="Accidentals" hint="How sharps and flats are spelled, e.g. C# vs Db.">
            <PillChoice label="Accidentals" value={accidentalStyle} options={ACCIDENTAL_STYLES} disabled={running} onChange={(v) => updateSettings({ accidentalStyle: v })} />
          </Field>
          <Field label="Instrument" hint="Sets the range starting notes are drawn from, to match what you're practicing on.">
            <Dropdown
              value={instrumentId}
              options={[
                ...INSTRUMENTS.map((i) => ({ value: i.id, label: `${i.label} (${i.range.replace('-', '–')})` })),
                { value: CUSTOM_INSTRUMENT_ID, label: 'Custom range…' },
              ]}
              onChange={(v) => updateSettings({ instrumentId: v })}
            />
          </Field>
          {isCustom ? (
            <Field label="Custom range" hint="The lowest and highest notes to draw starting notes from, e.g. A1-A6.">
              <SheetInput value={customRange} onChangeText={(v) => updateSettings({ customRange: v })} editable={!running} placeholder="A1-A6" />
            </Field>
          ) : null}
        </SettingChip>

        <SettingChip Icon={StopwatchIcon} label="Time per interval" value={`${roundSeconds} s`}>
          {locked}
          <SliderField
            label="Time per interval"
            value={roundSeconds}
            unit=" s"
            min={MIN_ROUND_SECONDS}
            max={MAX_ROUND_SECONDS}
            step={0.5}
            disabled={running}
            onChange={(v) => updateSettings({ roundSeconds: v })}
            hint={
              listenMode
                ? "How long you have to finish playing each round before it's marked a miss and moves on."
                : 'How long each round stays on screen before the next one shows.'
            }
          />
          {listenMode ? (
            <SliderField
              label="Time between rounds"
              value={advanceDelayMs / 1000}
              unit=" s"
              min={MIN_ADVANCE_DELAY_MS / 1000}
              max={MAX_ADVANCE_DELAY_MS / 1000}
              step={0.25}
              disabled={running}
              onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
              hint="How long the graded round stays on screen before the next one starts."
            />
          ) : null}
        </SettingChip>

        {listenMode ? (
          <SettingChip Icon={MicrophoneIcon} label="Microphone" value={SENSITIVITY[sensitivity].label.split(' (')[0]}>
            {locked}
            <SwitchRow
              label="Sound feedback"
              checked={soundFeedback}
              onChange={(v) => updateSettings({ soundFeedback: v })}
              disabled={running}
              hint="A click each second of the countdown, plus a click the instant a round is graded."
            />
            <SwitchRow
              label="Continue from previous note"
              checked={chainIntervals}
              onChange={(v) => updateSettings({ chainIntervals: v })}
              disabled={running || drillMode}
              hint="After the first round, each one continues from where the last interval left off instead of a fresh starting note."
            />
            <SwitchRow
              label="Drill every interval"
              checked={drillMode}
              onChange={(v) => updateSettings({ drillMode: v })}
              disabled={running || chainIntervals}
              hint="Plays every selected interval, in every selected direction, starting on all 12 keys, each in a random octave."
            />
            {!drillMode ? (
              <SliderField
                label="Number of rounds"
                value={roundCount}
                min={MIN_ROUND_COUNT}
                max={MAX_ROUND_COUNT}
                step={1}
                disabled={running}
                onChange={(v) => updateSettings({ roundCount: v })}
                hint="How many intervals make up one session."
              />
            ) : null}
            <SheetDivider title="Advanced" />
            <SliderField
              label="Tuning tolerance"
              value={toleranceCents}
              unit="¢"
              min={10}
              max={100}
              step={5}
              disabled={running}
              onChange={(v) => updateSettings({ toleranceCents: v })}
              hint="How many cents off pitch still counts as correct, so a slightly out-of-tune instrument still passes."
            />
            <SliderField
              label="Note hold time"
              value={holdMs}
              unit=" ms"
              min={30}
              max={300}
              step={30}
              disabled={running}
              onChange={(v) => updateSettings({ holdMs: v })}
              hint="How long a pitch has to stay steady before it's graded, so a quick slide or slip isn't counted."
            />
            <SliderField
              label="Reference pitch (A4)"
              value={refA}
              unit=" Hz"
              min={MIN_REF}
              max={MAX_REF}
              step={1}
              disabled={running}
              onChange={(v) => updateSettings({ refA: v })}
              hint="The frequency concert A is tuned to. 440 is standard."
            />
            <Field label="Input sensitivity" hint="How quiet a signal can be before it's treated as silence — raise it in a noisy room.">
              <PillChoice
                label="Input sensitivity"
                value={sensitivity}
                options={Object.entries(SENSITIVITY).map(([value, { label }]) => ({ value, label }))}
                disabled={running}
                onChange={(v) => updateSettings({ sensitivity: v })}
              />
            </Field>
            <SwitchRow
              label="Partial credit"
              checked={partialCredit}
              onChange={(v) => updateSettings({ partialCredit: v })}
              disabled={running}
              hint="A wrong note gets one retry; missing it twice fails the round instead of failing on the first miss."
            />
            <SwitchRow
              label="Ignore repeated notes"
              checked={ignoreRepeatedNotes}
              onChange={(v) => updateSettings({ ignoreRepeatedNotes: v })}
              disabled={running}
              hint="A fresh attack of the note you just played (e.g. a double pluck) is ignored instead of graded as wrong."
            />
            <SheetButton
              label="Reset advanced settings"
              disabled={running}
              onPress={() =>
                updateSettings({
                  toleranceCents: DEFAULT_SETTINGS.toleranceCents,
                  holdMs: DEFAULT_SETTINGS.holdMs,
                  refA: DEFAULT_SETTINGS.refA,
                  sensitivity: DEFAULT_SETTINGS.sensitivity,
                  partialCredit: DEFAULT_SETTINGS.partialCredit,
                  ignoreRepeatedNotes: DEFAULT_SETTINGS.ignoreRepeatedNotes,
                })
              }
            />
          </SettingChip>
        ) : null}

        <SettingChip Icon={SlidersIcon} label="Sound & display">
          <SwitchRow
            label="Play interval out loud"
            checked={playSound && !listenMode}
            onChange={(v) => updateSettings({ playSound: v })}
            disabled={listenMode}
            hint="Plays both notes of the interval in order as it appears. Not available in listen mode."
          />
          <SwitchRow
            label="Show next interval"
            checked={showNext}
            onChange={(v) => updateSettings({ showNext: v })}
            hint="Shows a preview of the upcoming interval under the current one."
          />
          <SwitchRow
            label="Show interval notes"
            checked={showIntervalNotes}
            onChange={(v) => updateSettings({ showIntervalNotes: v })}
            hint="The two notes under the ring in listen mode, showing your progress through the round."
          />
          <Field label="Tone" hint="Which oscillator sound plays an interval out loud.">
            <PillChoice label="Tone" value={wave} options={WAVEFORMS} disabled={!playSound || listenMode} onChange={(v) => updateSettings({ wave: v })} />
          </Field>
        </SettingChip>
      </OptionsArea>
    </ToolScreen>
  );
}

export default withScreenLoader(IntervalTrainerScreen);
