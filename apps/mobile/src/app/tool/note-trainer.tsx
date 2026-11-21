import { CUSTOM_INSTRUMENT_ID, INSTRUMENTS } from '@jam-practice/core/instruments';
import {
  type Grade,
  describePitch,
  frequencyToMidi,
  gradePitch,
  scoreOf,
} from '@jam-practice/core/noteGrade';
import {
  type ParsedRange,
  midiToNote,
  noteToFrequency,
  parseNote,
  parseRange,
  randomNoteInRange,
} from '@jam-practice/core/noteRange';
import {
  ACCIDENTAL_STYLES,
  type AccidentalStyle,
  spellNote,
} from '@jam-practice/core/noteSpelling';
import {
  type GradeCounts,
  bumpGradeCounts,
  rankWeak,
} from '@jam-practice/core/struggleStats';
import { shuffled } from '@jam-practice/core/trainerUtils';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { getAudioContext } from '@/lib/audioContext';
import { SENSITIVITY, startAudioInput, type AudioInput } from '@/lib/audioInput';
import { startTone } from '@/lib/toneGenerator';
import { useSyncedSettings } from '@/lib/useSyncedSettings';

import { CountdownLabel, ElapsedTimer } from '@/components/CountdownLabel';
import { Dropdown } from '@/components/Dropdown';
import { MicrophoneIcon, NoteIcon, StopwatchIcon } from '@/components/icons';
import { SwitchRow } from '@/components/SwitchRow';
import {
  Field,
  HistoryChip,
  IDLE_RING,
  IdleHint,
  IdleStatus,
  MutedText,
  PillChoice,
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
import { ToneIcon } from '@/components/tool/toolIcons';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useToolActivity } from '@/lib/toolTime';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';

/**
 * Native port of `apps/web/components/NoteTrainer.tsx`. Same "quiz" (notes shown, optionally
 * spoken out loud) and mic-based "listen mode" (graded correct/partial/incorrect live) shape, the
 * same lifetime "Struggles" stats and "Shed weak notes"/"Shed a string" focused sessions, and the
 * same per-config timed "History" list — all pure logic/data, so it ports essentially 1:1. Laid
 * out like the website's (`components/tool/ear.tsx`): History / Struggles chips (Listen, once
 * there's something in them), the note in its ring, Start, then Timed / Listen and the Range, Time
 * per note, Microphone (Listen) and Sound & display chips.
 *
 * Settings sync to the account via `useSyncedSettings`, under the *same* key web already uses
 * (`"jam-practice-note-trainer"`) with the same field names wherever the two platforms share a
 * concept — so a tolerance/instrument/listen-mode setting (and the lifetime struggle stats/
 * history) genuinely carries over between the web and mobile apps, not two drifting copies. The
 * one field intentionally dropped is `inputDeviceId` — see `@/lib/audioInput`'s own doc comment
 * for why there's no native equivalent of web's input-device enumeration to pick one from.
 *
 * Deliberately scoped down from web, matching this app's own established precedent rather than a
 * new decision:
 * - **No input-device picker, no mic "InputTest" meter** — same reasoning as the Tuner (one mic,
 *   no enumeration API); the live "Listening…"/"Heard X" readout during a real session already
 *   covers "is the mic picking anything up" without a separate pre-flight test.
 * - **"Play note out loud" only offers the four plain waveforms** (`startTone`'s own sine/
 *   triangle/sawtooth/square), not web's full `TONES` list (organ/pluck/piano/rhodes) — there's no
 *   sampled-tone playback mechanism on native yet (that's a separate, bigger task: fetching/
 *   decoding real audio assets). Matches the Tuner's own tone-generator picker exactly.
 * - **The instrument dropdown isn't disabled while a session runs** — `Dropdown` has no disabled
 *   state yet; a changed setting just takes effect the next time `start()` runs.
 * - **No keyboard shortcut** (web's "press Space to start/stop") — no physical keyboard.
 */
const SETTINGS_KEY = 'jam-practice-note-trainer';

const MIN_INTERVAL_SECONDS = 0.5;
const MAX_INTERVAL_SECONDS = 10;
const DEFAULT_INTERVAL_SECONDS = 3;
const NOTE_DURATION_SECONDS = 1;

/** "Shed a string" covers the open note up to two octaves above it, clamped to the instrument's
    own declared range — see `apps/web/components/NoteTrainer.tsx`'s identical constant. */
const STRING_SPAN_SEMITONES = 24;

const MIN_NOTE_COUNT = 5;
const MAX_NOTE_COUNT = 50;
/** How often a real pitch reading actually arrives — matches `ANALYSIS_INTERVAL_MS` in
    `@/lib/audioInput`, *not* web's own `FRAME_MS` (30ms, tuned for `AnalyserNode`'s continuous
    polling) — using the wrong cadence here would stretch or shrink "Note hold time" from what the
    setting actually says. */
const FRAME_MS = 50;

const MAX_WEAK_QUEUE = MAX_NOTE_COUNT;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 1500;

const IGNORE_OCTAVE_RANGE = 'C4-B4';

const DEFAULT_TONE_ID = 'triangle';
type Waveform = 'sine' | 'triangle' | 'sawtooth' | 'square';
const TONES: { value: Waveform; label: string }[] = [
  { value: 'triangle', label: 'Triangle' },
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
];

type Session = {
  total: number;
  index: number;
  target: string | null;
  best: Grade | null;
  wrongPlayed: boolean;
  results: Grade[];
  notes: string[];
  stable: number;
  last: number | null;
  previousMidi: number | null;
  settled: boolean;
  queue: string[];
};

type Summary = { results: Grade[]; notes: string[] };

type StartRequest =
  | { kind: 'normal' }
  | { kind: 'weak' }
  | { kind: 'string'; stringIndex: number };

type HistoryConfig = {
  rangeInput: string;
  ignoreOctave: boolean;
  drillMode: boolean;
  requeuePartials: boolean;
  noteCount: number;
  accidentalStyle: AccidentalStyle;
  intervalSeconds: number;
  toleranceCents: number;
  holdMs: number;
  advanceDelayMs: number;
  refA: number;
  partialCredit: boolean;
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

const DEFAULT_SETTINGS = {
  instrumentId: INSTRUMENTS[0].id,
  customRange: 'A1-A6',
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  ignoreOctave: false,
  toleranceCents: 50,
  holdMs: 120,
  advanceDelayMs: DEFAULT_ADVANCE_DELAY_MS,
  refA: 440,
  sensitivity: 'normal',
  partialCredit: true,
  soundFeedback: false,
  playSound: false,
  showNext: false,
  toneId: DEFAULT_TONE_ID,
  listenMode: false,
  noteCount: 10,
  drillMode: false,
  requeuePartials: false,
  history: [] as HistoryEntry[],
  noteStats: {} as Record<string, GradeCounts>,
  accidentalStyle: 'sharp' as AccidentalStyle,
};

/** A short neutral click for "Sound feedback" — the same tone/length/gain web's own `playClick`
    reuses from the metronome click engine, built directly here since this tool's clicks are one-
    off cues, not part of a tempo-locked scheduler. */
function playClick() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = 1000;
  const t = ctx.currentTime + 0.02;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.start(t);
  osc.stop(t + 0.05);
}

function NoteTrainerScreen() {
  const { colors } = useAppTheme();
  const GRADE_COLOR = useGradeColors();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [rangeOpen, setRangeOpen] = useState(false);

  const {
    customRange,
    intervalSeconds,
    playSound,
    showNext,
    listenMode,
    ignoreOctave,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    partialCredit,
    soundFeedback,
    drillMode,
    requeuePartials,
  } = settings;

  const history = settings.history.filter(
    (h): h is HistoryEntry => !!h && typeof h.config === 'object' && h.config !== null,
  );
  const accidentalStyle = ACCIDENTAL_STYLES.some((s) => s.value === settings.accidentalStyle)
    ? settings.accidentalStyle
    : 'sharp';
  const sensitivity = settings.sensitivity in SENSITIVITY ? settings.sensitivity : 'normal';
  const toneId = TONES.some((t) => t.value === settings.toneId) ? settings.toneId : DEFAULT_TONE_ID;
  const noteCount = Math.min(MAX_NOTE_COUNT, Math.max(MIN_NOTE_COUNT, Math.round(settings.noteCount)));
  const instrumentId =
    settings.instrumentId === CUSTOM_INSTRUMENT_ID || INSTRUMENTS.some((i) => i.id === settings.instrumentId)
      ? settings.instrumentId
      : INSTRUMENTS[0].id;
  const instrument = INSTRUMENTS.find((i) => i.id === instrumentId);
  const isCustom = instrumentId === CUSTOM_INSTRUMENT_ID;
  const rangeInput = ignoreOctave
    ? IGNORE_OCTAVE_RANGE
    : isCustom
      ? customRange
      : instrument?.range ?? '';

  const [note, setNote] = useState<string | null>(null);
  const [nextNote, setNextNote] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  useToolActivity('/note-trainer', running);
  useKeepAwakeWhile(running);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [noteSeed, setNoteSeed] = useState(0);
  const [lastRequest, setLastRequest] = useState<StartRequest>({ kind: 'normal' });
  const [noteTimer, setNoteTimer] = useState<{ startedAt: number; durationMs: number } | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  const effectiveIgnoreOctave = lastRequest.kind === 'string' ? false : ignoreOctave;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const upcomingRef = useRef<string | null>(null);
  const noteSeedRef = useRef(0);
  const playSoundRef = useRef(playSound);
  const toneIdRef = useRef(toneId);
  const inputRef = useRef<AudioInput | null>(null);
  const mountedRef = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  // `advance` (inside `start`, below) needs the *current* session-start timestamp at the exact
  // moment a session finishes, not whatever `sessionStartedAt` happened to be at the last render —
  // mirrored into a ref for the same reason every other mid-session value here is read from one.
  const sessionStartedAtRef = useRef<number | null>(null);
  const listenCfgRef = useRef({
    ignoreOctave: effectiveIgnoreOctave,
    accidentalStyle,
    toleranceCents,
    holdFrames: 4,
    advanceDelayMs,
    refA,
    partialCredit,
    soundFeedback,
    silenceRms: SENSITIVITY.normal.rms,
  });
  const skipRef = useRef<(() => void) | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownClickTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const noteStatsRef = useRef(settings.noteStats);

  useEffect(() => {
    playSoundRef.current = playSound;
    toneIdRef.current = toneId;
    listenCfgRef.current = {
      ignoreOctave: effectiveIgnoreOctave,
      accidentalStyle,
      toleranceCents,
      holdFrames: Math.max(1, Math.round(holdMs / FRAME_MS)),
      advanceDelayMs,
      refA,
      partialCredit,
      soundFeedback,
      silenceRms: SENSITIVITY[sensitivity].rms,
    };
  }, [
    playSound,
    toneId,
    effectiveIgnoreOctave,
    accidentalStyle,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    partialCredit,
    soundFeedback,
    sensitivity,
  ]);

  useEffect(() => {
    noteStatsRef.current = settings.noteStats;
  }, [settings.noteStats]);

  useEffect(() => {
    sessionStartedAtRef.current = sessionStartedAt;
  }, [sessionStartedAt]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      countdownClickTimeoutsRef.current.forEach(clearTimeout);
      inputRef.current?.stop();
    };
  }, []);

  function clearCountdownClicks() {
    countdownClickTimeoutsRef.current.forEach(clearTimeout);
    countdownClickTimeoutsRef.current = [];
  }

  function bumpNoteStat(n: string, grade: Grade) {
    noteStatsRef.current = bumpGradeCounts(noteStatsRef.current, n, grade);
    updateSettings({ noteStats: noteStatsRef.current });
  }

  function clearNoteStats() {
    noteStatsRef.current = {};
    updateSettings({ noteStats: {} });
  }

  function weakNotesInRange(stats: Record<string, GradeCounts>, range: ParsedRange): string[] {
    return rankWeak(stats)
      .filter((entry) => {
        const midi = parseNote(entry.key);
        return midi !== null && midi >= range.lowMidi && midi <= range.highMidi;
      })
      .slice(0, MAX_WEAK_QUEUE)
      .map((entry) => entry.key);
  }

  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!listenCfgRef.current.soundFeedback) return;
    const wholeSeconds = Math.floor(durationMs / 1000);
    for (let s = 1; s <= wholeSeconds; s++) {
      countdownClickTimeoutsRef.current.push(setTimeout(playClick, s * 1000));
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
    clearCountdownClicks();
    inputRef.current?.stop();
    inputRef.current = null;
    sessionRef.current = null;
    setRunning(false);
    setStatus(null);
    setHeard(null);
    setProgress(null);
    setWaiting(false);
    setNoteTimer(null);
  }

  function stop() {
    endSession();
  }

  function lockInResult(grade: Grade, index: number) {
    const pauseMs = listenCfgRef.current.advanceDelayMs;
    // Only ever reached from the mic-frame callback (itself started from a button's onPress),
    // never during render — the same documented false positive Guess the Interval/Guess the
    // Chord's own `lockInRound`/`start` already hit with `performance.now()` on web.
    // eslint-disable-next-line react-hooks/purity
    setNoteTimer({ startedAt: Date.now(), durationMs: pauseMs });
    if (listenCfgRef.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    if (!skipTimeoutRef.current) {
      skipTimeoutRef.current = setTimeout(() => {
        skipTimeoutRef.current = null;
        if (sessionRef.current?.index === index) skipRef.current?.();
      }, pauseMs);
    }
  }

  function handleFrame(freq: number | null) {
    const session = sessionRef.current;
    if (!session || session.target === null) return;
    if (freq === null) {
      session.stable = 0;
      session.last = null;
      session.settled = true;
      setHeard(null);
      return;
    }
    const cfg = listenCfgRef.current;
    const { note: heardNote, cents } = describePitch(freq, cfg.refA);
    const shownNote = spellNote(heardNote, cfg.accidentalStyle, noteSeedRef.current, cfg.ignoreOctave);
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

    if (session.best === 'correct' || session.best === 'partial') return;

    const played = gradePitch(freq, session.target, {
      ignoreOctave: cfg.ignoreOctave,
      toleranceCents: cfg.toleranceCents,
      refA: cfg.refA,
    });
    if (played === 'incorrect') {
      session.wrongPlayed = true;
      if (session.best !== 'incorrect') {
        session.best = 'incorrect';
        setStatus('incorrect');
      }
    } else {
      const result: Grade = session.wrongPlayed && cfg.partialCredit ? 'partial' : 'correct';
      session.best = result;
      setStatus(result);
      lockInResult(result, session.index);
    }
  }

  async function start(request: StartRequest = { kind: 'normal' }) {
    setLastRequest(request);
    const weak = request.kind === 'weak';
    const focused = weak || request.kind === 'string';
    const stringOpenNote = request.kind === 'string' ? instrument?.strings?.[request.stringIndex] : undefined;

    let range: ParsedRange | null;
    if (request.kind === 'string') {
      const instrumentRange = instrument ? parseRange(instrument.range) : null;
      const openMidi = stringOpenNote ? parseNote(stringOpenNote) : null;
      range =
        instrumentRange && openMidi !== null
          ? {
              lowMidi: openMidi,
              highMidi: Math.min(instrumentRange.highMidi, openMidi + STRING_SPAN_SEMITONES),
            }
          : null;
      if (!range) {
        setError("Couldn't find that string.");
        return;
      }
    } else {
      range = parseRange(rangeInput);
      if (!range) {
        setError('Enter a valid range like "A1-A6".');
        return;
      }
    }
    const weakQueueSeed = weak ? weakNotesInRange(noteStatsRef.current, range) : [];
    if (weak && weakQueueSeed.length === 0) {
      setError('No struggling notes in this range yet — misses in listen mode build this list up.');
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    inputRef.current?.stop();
    inputRef.current = null;

    const listening = focused ? true : listenMode;
    if (focused && !listenMode) updateSettings({ listenMode: true });
    const drilling = focused ? true : listening && drillMode;

    if (listening) {
      try {
        const input = await startAudioInput((frame) => handleFrame(frame.freq), () => listenCfgRef.current.silenceRms);
        if (!mountedRef.current) {
          input.stop();
          return;
        }
        inputRef.current = input;
      } catch {
        setError("Couldn't open the microphone. Check that microphone access is allowed.");
        return;
      }
      const queue = weak
        ? shuffled(weakQueueSeed)
        : drilling
          ? shuffled(
              Array.from({ length: range.highMidi - range.lowMidi + 1 }, (_, i) => midiToNote(range!.lowMidi + i)),
            )
          : [];
      sessionRef.current = {
        total: drilling ? queue.length : noteCount,
        index: 0,
        target: null,
        best: null,
        wrongPlayed: false,
        results: [],
        notes: [],
        stable: 0,
        last: null,
        previousMidi: null,
        settled: true,
        queue,
      };
      // Only ever reached from `start()`, itself only ever called from a button's onPress —
      // see `lockInResult`'s own comment above on this same documented false positive.
      // eslint-disable-next-line react-hooks/purity
      setSessionStartedAt(Date.now());
    } else {
      sessionRef.current = null;
    }

    const seconds = Math.max(MIN_INTERVAL_SECONDS, intervalSeconds);
    upcomingRef.current = null;
    const advance = () => {
      if (skipTimeoutRef.current) {
        clearTimeout(skipTimeoutRef.current);
        skipTimeoutRef.current = null;
      }
      clearCountdownClicks();
      const session = sessionRef.current;
      if (session) {
        const finishedGrade = session.best ?? 'incorrect';
        if (session.target !== null) {
          session.results.push(finishedGrade);
          session.notes.push(session.target);
          bumpNoteStat(session.target, finishedGrade);
          if (drilling && (finishedGrade === 'incorrect' || (finishedGrade === 'partial' && requeuePartials))) {
            session.queue.push(session.target);
          }
        }
        const done = drilling ? session.queue.length === 0 : session.index >= session.total;
        if (done) {
          const startedAt = sessionStartedAtRef.current;
          const elapsedMs = startedAt ? Date.now() - startedAt : 0;
          setSessionStartedAt(null);
          if (focused) {
            setLastElapsedMs(null);
            setIsNewBest(false);
          } else {
            const config: HistoryConfig = {
              rangeInput,
              ignoreOctave,
              drillMode,
              requeuePartials,
              noteCount,
              accidentalStyle,
              intervalSeconds,
              toleranceCents,
              holdMs,
              advanceDelayMs,
              refA,
              partialCredit,
              sensitivity,
            };
            const previousBest = history
              .filter((h) => sameConfig(h.config, config))
              .reduce((min, h) => Math.min(min, h.elapsedMs), Infinity);
            const entry: HistoryEntry = {
              at: Date.now(),
              elapsedMs,
              score: scoreOf(session.results),
              total: session.results.length,
              config,
            };
            updateSettings({ history: [...history, entry].slice(-50) });
            setLastElapsedMs(elapsedMs);
            setIsNewBest(elapsedMs < previousBest);
          }
          setSummary({ results: session.results, notes: session.notes });
          setNote(null);
          setNextNote(null);
          endSession();
          return;
        }
        session.index++;
        session.previousMidi = session.target !== null ? parseNote(session.target) : null;
        session.settled = session.previousMidi === null;
        session.best = null;
        session.wrongPlayed = false;
        session.stable = 0;
        session.last = null;
        setStatus(null);
        setHeard(null);
        setProgress(
          drilling
            ? { index: session.index, total: session.index + session.queue.length }
            : { index: session.index, total: session.total },
        );
      }

      let next: string;
      let following: string | null;
      if (drilling && session) {
        next = session.queue.shift()!;
        following = session.queue[0] ?? null;
        upcomingRef.current = null;
      } else {
        next = upcomingRef.current ?? randomNoteInRange(range!);
        const isLast = session ? session.index >= session.total : false;
        following = isLast ? null : randomNoteInRange(range!);
        upcomingRef.current = following;
      }
      if (session) session.target = next;
      noteSeedRef.current++;
      setNoteSeed(noteSeedRef.current);
      setNoteTimer({ startedAt: Date.now(), durationMs: seconds * 1000 });
      setNote(next);
      setNextNote(following);
      if (playSoundRef.current && !session) {
        const freq = noteToFrequency(next);
        if (freq !== null) {
          startTone(freq, toneIdRef.current as Waveform, 0.4, Math.min(NOTE_DURATION_SECONDS, seconds));
        }
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

  const noteLabel = (n: string, seq = 0) => spellNote(n, accidentalStyle, seq, effectiveIgnoreOctave);
  const mainLabel = note ? noteLabel(note, noteSeed) : '?';
  const mainLabelIsDouble = mainLabel.includes('/');
  const glow = running && status ? GRADE_COLOR[status] : null;
  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) => summary?.results.filter((g) => g === grade).length ?? 0;
  const currentConfig: HistoryConfig = {
    rangeInput,
    ignoreOctave,
    drillMode,
    requeuePartials,
    noteCount,
    accidentalStyle,
    intervalSeconds,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    partialCredit,
    sensitivity,
  };
  const matchingHistory = history.filter((h) => sameConfig(h.config, currentConfig));
  const bestMs = matchingHistory.length ? Math.min(...matchingHistory.map((h) => h.elapsedMs)) : null;
  const weakEntries = rankWeak(settings.noteStats);
  const parsedRange = parseRange(rangeInput);
  const weakCountInRange = parsedRange ? weakNotesInRange(settings.noteStats, parsedRange).length : 0;

  const rangeSummary = `${instrumentShortName(instrumentId)} · ${ignoreOctave ? 'any octave' : rangeInput.replace('-', '–')}`;
  const showSide = listenMode && !running && (history.length > 0 || weakEntries.length > 0);
  const showingSummary = summary !== null && !running;
  const locked = running ? <SheetText>Stop to change these.</SheetText> : null;

  const chipList = (
    <>
      <SettingChip Icon={NoteIcon} label="Range" value={rangeSummary} open={rangeOpen} onOpenChange={setRangeOpen}>
        {locked}
        <SwitchRow
          label="Ignore octave"
          checked={ignoreOctave}
          onChange={(checked) => updateSettings({ ignoreOctave: checked })}
          disabled={running}
          hint="Collapses the note pool to one octave (12 notes) and, in listen mode, accepts the right note in any octave."
        />
        <Field label="Accidentals" hint="How sharps and flats are spelled, e.g. C# vs Db.">
          <PillChoice label="Accidentals" value={accidentalStyle} options={ACCIDENTAL_STYLES} disabled={running} onChange={(v) => updateSettings({ accidentalStyle: v })} />
        </Field>
        <Field label="Instrument" hint="Sets the range notes are drawn from, to match what you're practicing on.">
          <Dropdown
            value={instrumentId}
            options={[
              ...INSTRUMENTS.map((i) => ({ value: i.id, label: `${i.label} (${i.range.replace('-', '–')})` })),
              { value: CUSTOM_INSTRUMENT_ID, label: 'Custom range…' },
            ]}
            onChange={(v) => updateSettings({ instrumentId: v })}
          />
        </Field>
        {isCustom && !ignoreOctave ? (
          <Field label="Custom range" hint="The lowest and highest notes to draw from, e.g. A1-A6.">
            <SheetInput value={customRange} onChangeText={(v) => updateSettings({ customRange: v })} editable={!running} placeholder="A1-A6" />
          </Field>
        ) : null}
        {instrument?.strings ? (
          <Field
            label="Shed a string"
            hint={`Starts a listen-mode session on every note of just that string — its open note up to two octaves above it (or the top of ${instrument.label}'s range, if that's lower) — always shown and graded with the octave, regardless of Ignore octave above.`}
          >
            <View className="flex-row flex-wrap gap-2">
              {instrument.strings.map((openNote, i) => (
                <SheetButton
                  key={i}
                  label={noteGlyphs(spellNote(openNote, accidentalStyle, i, false))}
                  disabled={running}
                  onPress={() => {
                    setRangeOpen(false);
                    void start({ kind: 'string', stringIndex: i });
                  }}
                />
              ))}
            </View>
          </Field>
        ) : null}
      </SettingChip>

      {/* How long each note shows (Timed), or how long you have to play it and the pause after
          (Listen): the same setting either way, so one name. */}
      <SettingChip Icon={StopwatchIcon} label="Time per note" value={`${intervalSeconds} s`}>
        {locked}
        <SliderField
          label="Time per note"
          value={intervalSeconds}
          unit=" s"
          min={MIN_INTERVAL_SECONDS}
          max={MAX_INTERVAL_SECONDS}
          step={0.5}
          disabled={running}
          onChange={(v) => updateSettings({ intervalSeconds: v })}
          hint={
            listenMode
              ? "How long you have to play each note before it's marked a miss and moves on."
              : 'How long each note stays on screen before the next one shows.'
          }
        />
        {listenMode ? (
          <SliderField
            label="Time between notes"
            value={advanceDelayMs / 1000}
            unit=" s"
            min={MIN_ADVANCE_DELAY_MS / 1000}
            max={MAX_ADVANCE_DELAY_MS / 1000}
            step={0.25}
            disabled={running}
            onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
            hint="How long the graded note (with its countdown ring) stays on screen before the next one starts."
          />
        ) : null}
      </SettingChip>

      {listenMode ? (
        <SettingChip Icon={MicrophoneIcon} label="Microphone" value={SENSITIVITY[sensitivity].label.split(' (')[0]}>
          {locked}
          <SwitchRow
            label="Sound feedback"
            checked={soundFeedback}
            onChange={(checked) => updateSettings({ soundFeedback: checked })}
            disabled={running}
            hint="A click each second of the countdown, plus a click the instant a note is graded."
          />
          <SwitchRow
            label="Drill every note"
            checked={drillMode}
            onChange={(checked) => updateSettings({ drillMode: checked })}
            disabled={running}
            hint="Plays every note in the range once, in a random order, instead of a fixed count."
          />
          {drillMode ? (
            <SwitchRow
              label="Revisit partials"
              checked={requeuePartials}
              onChange={(checked) => updateSettings({ requeuePartials: checked })}
              disabled={running}
              hint="A note you got right after a wrong attempt goes back on the end of the queue too, not just full misses."
            />
          ) : (
            <SliderField
              label="Number of notes"
              value={noteCount}
              min={MIN_NOTE_COUNT}
              max={MAX_NOTE_COUNT}
              step={1}
              disabled={running}
              onChange={(v) => updateSettings({ noteCount: v })}
              hint="How many random notes make up one session."
            />
          )}
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
            min={415}
            max={466}
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
            label="Half credit after a wrong note"
            checked={partialCredit}
            onChange={(checked) => updateSettings({ partialCredit: checked })}
            disabled={running}
            hint="A wrong note played before the right one still counts, but only for half credit instead of a full point."
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
              })
            }
          />
        </SettingChip>
      ) : null}

      <SettingChip
        Icon={ToneIcon}
        label="Sound"
        title="Sound & display"
        value={`${playSound && !listenMode ? (TONES.find((t) => t.value === toneId)?.label ?? 'Played') : 'Silent'}${showNext ? ' · next shown' : ''}`}
      >
        <SwitchRow
          label="Play note out loud"
          checked={playSound && !listenMode}
          onChange={(checked) => updateSettings({ playSound: checked })}
          disabled={listenMode}
          hint="Sounds each note when it appears, so you can hear it as well as see its name. Not available in listen mode."
        />
        <SwitchRow
          label="Show next note"
          checked={showNext}
          onChange={(checked) => updateSettings({ showNext: checked })}
          hint="Shows a preview of the upcoming note next to the current one."
        />
        <Field label="Tone" hint="Which sound plays notes out loud.">
          <PillChoice label="Tone" value={toneId} options={TONES} disabled={!playSound || listenMode} onChange={(v) => updateSettings({ toneId: v })} />
        </Field>
      </SettingChip>
    </>
  );

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady) return <ScreenSpinner />;

  // The mode switch first: it decides what the screen is. Then listen mode's History and Struggles,
  // once there's something in them.
  // Start: while the results show, their own "Try again" is the one start button.
  return (
    <ToolScreen
      title="Note Trainer"
      mode={
        !running ? (
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
        ) : null
      }
      side={
        showSide ? (
          <SettingsBar>
            <HistoryChip
              entries={matchingHistory}
              bestMs={bestMs}
              onClear={() => updateSettings({ history: history.filter((h) => !sameConfig(h.config, currentConfig)) })}
            />
            <StrugglesChip
              entries={weakEntries.map((e) => ({ key: e.key, label: noteGlyphs(noteLabel(e.key)), counts: e.counts }))}
              shedLabel="Shed weak notes"
              shedCount={weakCountInRange}
              emptyText="No struggles tracked yet — a wrong or partial note in listen mode adds it here."
              running={running}
              onShed={() => void start({ kind: 'weak' })}
              onClear={clearNoteStats}
            />
          </SettingsBar>
        ) : null
      }
      action={!showingSummary ? <BigButton label={running ? 'Stop' : 'Start'} secondary={running} onPress={running ? stop : () => void start()} /> : null}
      chips={chipList}
    >
      {showingSummary && summary ? (
        <ResultsPanel
          score={score}
          total={summary.results.length}
          elapsed={lastElapsedMs}
          bestMs={bestMs}
          isNewBest={isNewBest}
          grades={(['correct', 'partial', 'incorrect'] as const).map((g) => ({ grade: g, count: tally(g) }))}
          tags={summary.notes.map((n, i) => ({ label: noteGlyphs(noteLabel(n, i)), grade: summary.results[i] }))}
          onAgain={() => void start(lastRequest)}
          onClose={() => setSummary(null)}
        />
      ) : (
        <View className="items-center gap-2">
          {status && running && listenMode && noteTimer ? (
            <View className="items-center">
              <MutedText className="text-xs">Next note in</MutedText>
              <CountdownLabel
                active={running}
                startedAt={noteTimer.startedAt}
                durationMs={noteTimer.durationMs}
                textClassName="font-ui-semibold text-3xl font-semibold tabular-nums"
                color={GRADE_COLOR[status]}
              />
            </View>
          ) : null}
          <View>
            <QuizRing size={running ? 168 : IDLE_RING} running={running} timer={noteTimer}>
              {running ? (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  className={`font-ui-bold font-bold tabular-nums ${mainLabelIsDouble ? 'text-3xl' : 'text-6xl'}`}
                  style={{ color: glow ?? colors.foreground }}
                >
                  {noteGlyphs(mainLabel)}
                </Text>
              ) : (
                <IdleStatus history={listenMode ? history : []} />
              )}
            </QuizRing>
            {showNext && nextNote && running ? (
              <Text
                accessibilityLabel={`Next note ${noteLabel(nextNote, noteSeed + 1)}`}
                className="font-ui-semibold text-xl font-semibold tabular-nums"
                style={{ position: 'absolute', bottom: 4, left: '100%', marginLeft: 12, color: colors.muted }}
              >
                {noteGlyphs(noteLabel(nextNote, noteSeed + 1))}
              </Text>
            ) : null}
          </View>
          {/* Until there's history, one line of what a round is. */}
          {!running && !(listenMode && history.length) ? (
            <IdleHint>{listenMode ? 'Play each note shown; the mic checks it.' : 'A note shows; play it before the next one.'}</IdleHint>
          ) : null}
          {running && progress ? (
            <View className="items-center gap-0.5">
              <View className="flex-row items-center">
                <MutedText className="tabular-nums">
                  Note {progress.index} of {progress.total} ·{' '}
                </MutedText>
                <ElapsedTimer active={running} startedAt={sessionStartedAt} />
              </View>
              <MutedText className="tabular-nums">{heard ? `Heard ${noteGlyphs(heard)}` : 'Listening…'}</MutedText>
              {waiting ? (
                <View className="mt-2">
                  <Button label="Skip note" kind="secondary" onPress={() => skipRef.current?.()} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      {error ? (
        <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
    </ToolScreen>
  );
}

export default withScreenLoader(NoteTrainerScreen);
