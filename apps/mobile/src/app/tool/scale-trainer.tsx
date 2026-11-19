import { CUSTOM_INSTRUMENT_ID, INSTRUMENTS } from '@jam-practice/core/instruments';
import {
  type Grade,
  describePitch,
  frequencyToMidi,
  gradePitch,
  scoreOf,
} from '@jam-practice/core/noteGrade';
import { midiToNote, noteToFrequency, parseNote, parseRange } from '@jam-practice/core/noteRange';
import { ACCIDENTAL_STYLES, type AccidentalStyle, spellNote } from '@jam-practice/core/noteSpelling';
import {
  DEFAULT_ENABLED_SCALE_IDS,
  SCALE_CATEGORIES,
  SCALE_MODES,
  type ScaleMode,
  type ScaleRound,
  drillQueueForPool,
  randomMode,
  randomScaleRound,
  scaleRoundForPitchClass,
} from '@jam-practice/core/scales';
import {
  type GradeCounts,
  bumpGradeCounts,
  rankWeak,
} from '@jam-practice/core/struggleStats';
import { shuffled } from '@jam-practice/core/trainerUtils';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CountdownLabel, ElapsedTimer } from '@/components/CountdownLabel';
import { Dropdown } from '@/components/Dropdown';
import { MicrophoneIcon, NoteIcon, ScaleIcon, SlidersIcon, StopwatchIcon } from '@/components/icons';
import { SwitchRow } from '@/components/SwitchRow';
import {
  Field,
  GroupLabel,
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
import { SENSITIVITY, type AudioInput, startAudioInput } from '@/lib/audioInput';
import { getAudioContext } from '@/lib/audioContext';
import { startTone } from '@/lib/toneGenerator';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useToolActivity } from '@/lib/toolTime';

/**
 * Native port of `apps/web/components/ScaleTrainer.tsx`. Same shape as Note Trainer (a random
 * prompt, a countdown ring, a mic-listening grading loop) but the prompt is a whole scale played
 * root-to-root rather than a single note — see `handleFrame` below for the degree-by-degree state
 * machine, ported closely from the web source rather than restructured, since this is the trickiest
 * part of the tool and the two apps' grading behavior needs to agree exactly.
 *
 * Laid out like the website's (`components/tool/ear.tsx`): History / Struggles chips (Listen, once
 * there's something in them), the scale in its ring, Start, then Timed / Listen and the Scales,
 * Range, Time per scale, Microphone (Listen) and Sound & display chips.
 *
 * Scoped down from the web version, each for a reason specific to this platform rather than cut for
 * convenience:
 * - **No audio-input device picker and no live level meter** (`InputTest` on web) — `lib/
 *   audioInput.ts`'s own doc comment explains there's no native equivalent of web's
 *   `MediaDeviceInfo` enumeration to build a picker from; `AudioRecorder` always records through
 *   whatever the OS currently treats as the active input.
 * - **"Play scale out loud" uses a plain oscillator waveform picker** (sine/triangle/sawtooth/
 *   square, the same `startTone` helper and option set the Tuner's own tone generator already
 *   uses) instead of web's full `lib/tones.ts` palette, which includes sampled Piano/Rhodes
 *   playback (`lib/sampledTones.ts`) that hasn't been ported to this app at all yet.
 * - **No space-bar start/stop shortcut** (`useSpaceToggle` on web) — there's no established
 *   hardware-keyboard convention anywhere else in this app's mobile port.
 */

const MIN_INTERVAL_SECONDS = 1;
const MAX_INTERVAL_SECONDS = 20;
const DEFAULT_INTERVAL_SECONDS = 6;

const SCALE_NOTE_DURATION_SECONDS = 0.35;
const SCALE_NOTE_GAP_MS = 380;

const MIN_SCALE_COUNT = 5;
const MAX_SCALE_COUNT = 30;
const FRAME_MS = 30;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 1500;

type Waveform = 'sine' | 'triangle' | 'sawtooth' | 'square';
const WAVEFORMS: { value: Waveform; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'square', label: 'Square' },
];

type Session = {
  total: number;
  index: number;
  round: ScaleRound | null;
  noteIndex: number;
  best: Grade | null;
  degreeMisses: number;
  hadMistake: boolean;
  results: Grade[];
  rounds: ScaleRound[];
  stable: number;
  last: number | null;
  previousMidi: number | null;
  settled: boolean;
  lastCorrectMidi: number | null;
  queue: ScaleRound[];
};

type Summary = { results: Grade[]; rounds: ScaleRound[] };

type HistoryConfig = {
  rangeInput: string;
  drillMode: boolean;
  scaleCount: number;
  scaleModesKey: string;
  accidentalStyle: AccidentalStyle;
  intervalSeconds: number;
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

const SETTINGS_KEY = 'jam-practice-scale-trainer';
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
  partialCredit: false,
  ignoreRepeatedNotes: false,
  soundFeedback: false,
  playSound: false,
  showNext: false,
  showScaleNotes: true,
  waveform: 'triangle' as Waveform,
  listenMode: false,
  scaleCount: 10,
  drillMode: false,
  history: [] as HistoryEntry[],
  accidentalStyle: 'sharp' as AccidentalStyle,
  scaleModes: DEFAULT_ENABLED_SCALE_IDS as string[],
  scaleStats: {} as Record<string, GradeCounts>,
};

function disabledStyle(disabled: boolean) {
  return { opacity: disabled ? 0.45 : 1 } as const;
}

function ScaleTrainerScreen() {
  const { colors, derived } = useAppTheme();
  const GRADE_COLOR = useGradeColors();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const {
    customRange,
    intervalSeconds,
    playSound,
    showNext,
    showScaleNotes,
    waveform,
    listenMode,
    ignoreOctave,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    drillMode,
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
  const scaleCount = Math.min(MAX_SCALE_COUNT, Math.max(MIN_SCALE_COUNT, Math.round(settings.scaleCount)));
  const instrumentId =
    settings.instrumentId === CUSTOM_INSTRUMENT_ID || INSTRUMENTS.some((i) => i.id === settings.instrumentId)
      ? settings.instrumentId
      : INSTRUMENTS[0].id;
  const pool = SCALE_MODES.filter((m) => settings.scaleModes.includes(m.id));

  const setInstrumentId = (v: string) => updateSettings({ instrumentId: v });
  const setCustomRange = (v: string) => updateSettings({ customRange: v });
  const setIntervalSeconds = (v: number) => updateSettings({ intervalSeconds: v });
  const setPlaySound = (v: boolean) => updateSettings({ playSound: v });
  const setShowNext = (v: boolean) => updateSettings({ showNext: v });
  const setShowScaleNotes = (v: boolean) => updateSettings({ showScaleNotes: v });
  const setWaveform = (v: Waveform) => updateSettings({ waveform: v });
  const setListenMode = (v: boolean) => updateSettings({ listenMode: v });
  const setScaleCount = (v: number) => updateSettings({ scaleCount: v });
  const setDrillMode = (v: boolean) => updateSettings({ drillMode: v });
  const setIgnoreOctave = (v: boolean) => updateSettings({ ignoreOctave: v });
  const setPartialCredit = (v: boolean) => updateSettings({ partialCredit: v });
  const setIgnoreRepeatedNotes = (v: boolean) => updateSettings({ ignoreRepeatedNotes: v });
  const setSoundFeedback = (v: boolean) => updateSettings({ soundFeedback: v });
  const setAccidentalStyle = (v: AccidentalStyle) => updateSettings({ accidentalStyle: v });
  const toggleScaleMode = (id: string) =>
    updateSettings({
      scaleModes: settings.scaleModes.includes(id)
        ? settings.scaleModes.filter((x) => x !== id)
        : [...settings.scaleModes, id],
    });

  const [round, setRound] = useState<ScaleRound | null>(null);
  const [nextRound, setNextRound] = useState<ScaleRound | null>(null);
  const [running, setRunning] = useState(false);
  useToolActivity('/scale-trainer', running);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [roundSeed, setRoundSeed] = useState(0);
  const [scaleProgress, setScaleProgress] = useState(0);
  const [degreeMiss, setDegreeMiss] = useState(false);
  const [lastMode, setLastMode] = useState<'normal' | 'weak'>('normal');
  const [noteTimer, setNoteTimer] = useState<{ startedAt: number; durationMs: number } | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const upcomingRef = useRef<ScaleRound | null>(null);
  const roundSeedRef = useRef(0);
  // Logic-only mirror of `sessionStartedAt`, read from inside `advance()`'s closure (which needs
  // the *current* value at the moment a round finishes, not whatever was captured when `advance`
  // itself was created) — the same split `note-trainer.tsx`'s own `sessionStartedAtRef` uses.
  const sessionStartedAtRef = useRef<number | null>(null);
  const waveformRef = useRef(waveform);
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
  const scalePlaybackTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scaleStatsRef = useRef(settings.scaleStats);

  useEffect(() => {
    waveformRef.current = waveform;
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
    waveform,
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
    scaleStatsRef.current = settings.scaleStats;
  }, [settings.scaleStats]);

  useEffect(() => {
    sessionStartedAtRef.current = sessionStartedAt;
  }, [sessionStartedAt]);

  const isCustom = instrumentId === CUSTOM_INSTRUMENT_ID;
  const rangeInput = isCustom ? customRange : INSTRUMENTS.find((i) => i.id === instrumentId)?.range ?? '';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      scalePlaybackTimeouts.current.forEach(clearTimeout);
      countdownClickTimeouts.current.forEach(clearTimeout);
      inputRef.current?.stop();
    };
  }, []);

  function scaleStatKey(pitchClass: number, modeId: string): string {
    return `${pitchClass}:${modeId}`;
  }

  type WeakScale = {
    key: string;
    mode: ScaleMode;
    pitchClass: number;
    counts: GradeCounts;
    score: number;
  };

  function parseScaleStatKey(key: string): { pitchClass: number; mode: ScaleMode } | null {
    const [pitchClassText, modeId] = key.split(':');
    const pitchClass = Number(pitchClassText);
    if (!Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass > 11) return null;
    const mode = SCALE_MODES.find((m) => m.id === modeId);
    return mode ? { pitchClass, mode } : null;
  }

  function bumpScaleStat(pitchClass: number, modeId: string, grade: Grade) {
    const key = scaleStatKey(pitchClass, modeId);
    scaleStatsRef.current = bumpGradeCounts(scaleStatsRef.current, key, grade);
    updateSettings({ scaleStats: scaleStatsRef.current });
  }

  function clearScaleStats() {
    scaleStatsRef.current = {};
    updateSettings({ scaleStats: {} });
  }

  function pitchClassLabel(pitchClass: number, seq = 0): string {
    return spellNote(midiToNote(60 + pitchClass), accidentalStyle, seq, true);
  }

  function weakScaleEntries(stats: Record<string, GradeCounts>): WeakScale[] {
    return rankWeak(stats)
      .map((entry) => {
        const parsed = parseScaleStatKey(entry.key);
        return parsed && { ...parsed, key: entry.key, counts: entry.counts, score: entry.score };
      })
      .filter((entry): entry is WeakScale => !!entry);
  }

  function clearScalePlayback() {
    scalePlaybackTimeouts.current.forEach(clearTimeout);
    scalePlaybackTimeouts.current = [];
  }

  function clearCountdownClicks() {
    countdownClickTimeouts.current.forEach(clearTimeout);
    countdownClickTimeouts.current = [];
  }

  function playClick() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!listenCfg.current.soundFeedback) return;
    const wholeSeconds = Math.floor(durationMs / 1000);
    for (let s = 1; s <= wholeSeconds; s++) {
      countdownClickTimeouts.current.push(setTimeout(playClick, s * 1000));
    }
  }

  function playScaleSound(notes: string[]) {
    clearScalePlayback();
    notes.forEach((n, i) => {
      scalePlaybackTimeouts.current.push(
        setTimeout(() => {
          const freq = noteToFrequency(n);
          if (freq !== null) startTone(freq, waveformRef.current, 0.35, SCALE_NOTE_DURATION_SECONDS);
        }, i * SCALE_NOTE_GAP_MS),
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
    clearScalePlayback();
    clearCountdownClicks();
    inputRef.current?.stop();
    inputRef.current = null;
    sessionRef.current = null;
    setRunning(false);
    setStatus(null);
    setHeard(null);
    setProgress(null);
    setWaiting(false);
    setScaleProgress(0);
    setDegreeMiss(false);
    setNoteTimer(null);
  }

  function stop() {
    endSession();
  }

  function scheduleAdvance(index: number) {
    if (skipTimeoutRef.current) return;
    skipTimeoutRef.current = setTimeout(() => {
      skipTimeoutRef.current = null;
      if (sessionRef.current?.index === index) skipRef.current?.();
    }, listenCfg.current.advanceDelayMs);
  }

  function lockInRound(grade: Grade) {
    const session = sessionRef.current;
    if (!session) return;
    session.best = grade;
    setStatus(grade);
    const pauseMs = listenCfg.current.advanceDelayMs;
    // Only ever reached from the mic-frame callback (itself started from a button's onPress),
    // never during render — the same documented false positive note-trainer.tsx's own
    // `lockInResult` already hits with this exact call.
    // eslint-disable-next-line react-hooks/purity
    setNoteTimer({ startedAt: Date.now(), durationMs: pauseMs });
    if (listenCfg.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    scheduleAdvance(session.index);
  }

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
    const cfg = listenCfg.current;
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
    setScaleProgress(session.noteIndex);

    if (session.noteIndex >= session.round.notes.length) {
      lockInRound(session.hadMistake ? 'partial' : 'correct');
    }
  }

  async function start(mode: 'normal' | 'weak' = 'normal') {
    const weak = mode === 'weak';
    setLastMode(mode);
    const range = parseRange(rangeInput);
    if (!range) {
      setError('Enter a valid range like "A1-A6".');
      return;
    }
    const weakList = weak ? weakScaleEntries(scaleStatsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError('No struggling scales yet — misses in listen mode build this list up.');
      return;
    }
    if (!weak && pool.length === 0) {
      setError('Select at least one scale to practice.');
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    inputRef.current?.stop();
    inputRef.current = null;
    clearScalePlayback();

    const listening = weak ? true : listenMode;
    if (weak && !listenMode) updateSettings({ listenMode: true });
    const drilling = weak ? true : listening && drillMode;

    if (listening) {
      try {
        const input = await startAudioInput(
          (frame) => handleFrame(frame.freq),
          () => listenCfg.current.silenceRms,
        );
        if (!mountedRef.current) {
          input.stop();
          return;
        }
        inputRef.current = input;
      } catch {
        setError("Couldn't open the microphone. Check the app's microphone permission.");
        return;
      }
      const queue = weak
        ? shuffled(weakList.map((e) => scaleRoundForPitchClass(range, e.mode, e.pitchClass)))
        : drilling
          ? shuffled(drillQueueForPool(range, pool))
          : [];
      sessionRef.current = {
        total: drilling ? queue.length : scaleCount,
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
      // Only ever reached from `start()`, itself only ever called from a button's onPress — see
      // `lockInRound`'s own comment above on this same documented false positive.
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
      clearScalePlayback();
      clearCountdownClicks();
      const session = sessionRef.current;
      if (session) {
        const finishedGrade = session.best ?? 'incorrect';
        if (session.round) {
          session.results.push(finishedGrade);
          session.rounds.push(session.round);
          const pitchClass = ((session.round.rootMidi % 12) + 12) % 12;
          bumpScaleStat(pitchClass, session.round.mode.id, finishedGrade);
          if (drilling && finishedGrade === 'incorrect') {
            session.queue.push(scaleRoundForPitchClass(range, session.round.mode, pitchClass));
          }
        }
        const done = drilling ? session.queue.length === 0 : session.index >= session.total;
        if (done) {
          const startedAt = sessionStartedAtRef.current;
          const elapsedMs = startedAt ? Date.now() - startedAt : 0;
          setSessionStartedAt(null);
          if (weak) {
            setLastElapsedMs(null);
            setIsNewBest(false);
          } else {
            const config: HistoryConfig = {
              rangeInput,
              drillMode,
              scaleCount,
              scaleModesKey: pool.map((m) => m.id).sort().join(','),
              accidentalStyle,
              intervalSeconds,
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
        session.previousMidi = session.round ? parseNote(session.round.notes[session.round.notes.length - 1]) : null;
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
        setScaleProgress(0);
        setDegreeMiss(false);
        setProgress(
          drilling
            ? { index: session.index, total: session.index + session.queue.length }
            : { index: session.index, total: session.total },
        );
      }

      let next: ScaleRound;
      let following: ScaleRound | null;
      if (drilling && session) {
        next = session.queue.shift()!;
        following = session.queue[0] ?? null;
        upcomingRef.current = null;
      } else {
        next = upcomingRef.current ?? randomScaleRound(range, randomMode(pool));
        const isLast = session ? session.index >= session.total : false;
        following = isLast ? null : randomScaleRound(range, randomMode(pool));
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
      if (playSound && !session) {
        playScaleSound(next.notes);
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

  const rootLabel = (r: ScaleRound, seq = 0) => spellNote(midiToNote(r.rootMidi), accidentalStyle, seq, ignoreOctave);
  const roundLabel = (r: ScaleRound, seq = 0) => `${rootLabel(r, seq)} ${r.mode.label}`;
  const mainLabel = round ? roundLabel(round, roundSeed) : '?';
  const mainLabelLong = mainLabel.length > 16;
  const glow = running && status ? GRADE_COLOR[status] : null;
  const showCountdown = running;
  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) => summary?.results.filter((g) => g === grade).length ?? 0;
  const currentConfig: HistoryConfig = {
    rangeInput,
    drillMode,
    scaleCount,
    scaleModesKey: pool.map((m) => m.id).sort().join(','),
    accidentalStyle,
    intervalSeconds,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    sensitivity,
  };
  const matchingHistory = history.filter((h) => sameConfig(h.config, currentConfig));
  const bestMs = matchingHistory.length ? Math.min(...matchingHistory.map((h) => h.elapsedMs)) : null;
  const weakEntries = weakScaleEntries(settings.scaleStats);

  const instrumentLabel = instrumentShortName(instrumentId);
  const rangeSummary = `${instrumentLabel} · ${ignoreOctave ? 'any octave' : rangeInput.replace('-', '–')}`;
  const showSide = listenMode && !running && (history.length > 0 || weakEntries.length > 0);
  const showingSummary = summary !== null && !running;
  const locked = running ? <SheetText>Stop to change these.</SheetText> : null;

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady) return <ScreenSpinner />;

  return (
    <ToolScreen title="Scale Trainer">
      {/* Listen mode's History and Struggles, once there's something in them. */}
      {showSide ? (
        <SettingsBar>
          <HistoryChip
            entries={matchingHistory}
            bestMs={bestMs}
            onClear={() => updateSettings({ history: history.filter((h) => !sameConfig(h.config, currentConfig)) })}
          />
          <StrugglesChip
            entries={weakEntries.map((e) => ({ key: e.key, label: `${noteGlyphs(pitchClassLabel(e.pitchClass))} ${e.mode.label}`, counts: e.counts }))}
            shedLabel="Shed weak scales"
            emptyText="No struggles tracked yet — a wrong or partial scale in listen mode adds it here."
            running={running}
            onShed={() => void start('weak')}
            onClear={clearScaleStats}
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
          {status && running && noteTimer ? (
            <View className="items-center">
              <MutedText className="text-xs">Next scale in</MutedText>
              <CountdownLabel
                active={running}
                startedAt={noteTimer.startedAt}
                durationMs={noteTimer.durationMs}
                textClassName="font-ui-semibold text-3xl font-semibold tabular-nums"
                color={GRADE_COLOR[status]}
              />
            </View>
          ) : null}
          <QuizRing size={168} running={showCountdown} timer={noteTimer}>
            {running ? (
              <Text
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                className={`font-ui-bold text-center font-bold ${mainLabelLong ? 'text-xl' : 'text-2xl'}`}
                style={{ color: glow ?? colors.foreground }}
              >
                {noteGlyphs(mainLabel)}
              </Text>
            ) : null}
          </QuizRing>
          {/* Before the first round, say what's about to happen. */}
          {!running ? (
            <IdleHint>{listenMode ? 'Press Start, then play each scale. The mic follows along.' : 'Press Start, then play each scale shown.'}</IdleHint>
          ) : null}

          {running && showNext && nextRound ? <MutedText className="text-xs">Next: {noteGlyphs(roundLabel(nextRound, roundSeed + 1))}</MutedText> : null}

          {listenMode && running && round && showScaleNotes ? (
            <View className="flex-row flex-wrap justify-center gap-1.5 px-2">
              {round.notes.map((n, i) => {
                const label = spellNote(n, accidentalStyle, roundSeed, true);
                const matched = i < scaleProgress;
                const failed = i === scaleProgress && status === 'incorrect';
                const retrying = i === scaleProgress && degreeMiss && !failed;
                const current = i === scaleProgress && !matched && !failed && !retrying;
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
                  Scale {progress.index} of {progress.total} ·{' '}
                </MutedText>
                <ElapsedTimer active={running} startedAt={sessionStartedAt} />
              </View>
              <MutedText className="tabular-nums">{heard ? `Heard ${noteGlyphs(heard)}` : 'Listening…'}</MutedText>
              {waiting ? (
                <View className="mt-2">
                  <Button label="Skip scale" kind="secondary" onPress={() => skipRef.current?.()} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      {error ? (
        <Text className="px-4 text-center text-sm font-ui" style={{ color: colors.danger }}>
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
            onChange={(v) => setListenMode(v === 'listen')}
            disabled={running}
            options={[
              { value: 'timed', label: 'Timed' },
              { value: 'listen', label: 'Listen' },
            ]}
          />
        }
      >
        <SettingChip Icon={ScaleIcon} label="Scales" value={`${pool.length} of ${SCALE_MODES.length}`}>
          {locked}
          <PoolHeader
            count={pool.length}
            total={SCALE_MODES.length}
            disabled={running}
            onAll={() => updateSettings({ scaleModes: SCALE_MODES.map((m) => m.id) })}
            onNone={() => updateSettings({ scaleModes: [] })}
            hint="Which scale modes can be picked for a round. At least one must stay selected."
          />
          {SCALE_CATEGORIES.map((category) => (
            <View key={category} className="gap-1.5">
              <GroupLabel>{category}</GroupLabel>
              <View className="flex-row flex-wrap gap-1.5">
                {SCALE_MODES.filter((m) => m.category === category).map((mode) => (
                  <Pill key={mode.id} on={settings.scaleModes.includes(mode.id)} label={mode.label} disabled={running} onPress={() => toggleScaleMode(mode.id)} />
                ))}
              </View>
            </View>
          ))}
        </SettingChip>

        <SettingChip Icon={NoteIcon} label="Range" value={rangeSummary}>
          {locked}
          <SwitchRow
            label="Ignore octave"
            checked={ignoreOctave}
            onChange={setIgnoreOctave}
            disabled={running}
            hint="Hides the octave number (e.g. C Dorian instead of C4 Dorian) and accepts the scale played in any octave."
          />
          <Field label="Accidentals" hint="How sharps and flats are spelled, e.g. C# vs Db.">
            <PillChoice label="Accidentals" value={accidentalStyle} options={ACCIDENTAL_STYLES} disabled={running} onChange={setAccidentalStyle} />
          </Field>
          <Field label="Instrument" hint="Sets the range roots are drawn from, to match what you're practicing on.">
            <View style={disabledStyle(running)} pointerEvents={running ? 'none' : 'auto'}>
              <Dropdown
                value={instrumentId}
                options={[
                  ...INSTRUMENTS.map((i) => ({ value: i.id, label: `${i.label} (${i.range.replace('-', '–')})` })),
                  { value: CUSTOM_INSTRUMENT_ID, label: 'Custom range…' },
                ]}
                onChange={setInstrumentId}
              />
            </View>
          </Field>
          {isCustom ? (
            <Field label="Custom range" hint="The lowest and highest notes to draw scale roots from, e.g. A1-A6.">
              <SheetInput value={customRange} onChangeText={setCustomRange} editable={!running} placeholder="A1-A6" />
            </Field>
          ) : null}
        </SettingChip>

        <SettingChip Icon={StopwatchIcon} label="Time per scale" value={`${intervalSeconds} s`}>
          {locked}
          <SliderField
            label="Time per scale"
            value={intervalSeconds}
            unit=" s"
            min={MIN_INTERVAL_SECONDS}
            max={MAX_INTERVAL_SECONDS}
            step={0.5}
            disabled={running}
            onChange={setIntervalSeconds}
            hint={
              listenMode
                ? "How long you have to finish playing each scale before it's marked a miss and moves on."
                : 'How long each scale stays on screen before the next one shows.'
            }
          />
          {listenMode ? (
            <SliderField
              label="Time between scales"
              value={advanceDelayMs / 1000}
              unit=" s"
              min={MIN_ADVANCE_DELAY_MS / 1000}
              max={MAX_ADVANCE_DELAY_MS / 1000}
              step={0.25}
              disabled={running}
              onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
              hint="How long the graded scale (with its countdown ring) stays on screen before the next one starts."
            />
          ) : null}
        </SettingChip>

        {listenMode ? (
          <SettingChip Icon={MicrophoneIcon} label="Microphone" value={SENSITIVITY[sensitivity].label.split(' (')[0]}>
            {locked}
            <SwitchRow
              label="Sound feedback"
              checked={soundFeedback}
              onChange={setSoundFeedback}
              disabled={running}
              hint="A click each second of the countdown, plus a click the instant a scale is graded."
            />
            <SwitchRow
              label="Drill every scale"
              checked={drillMode}
              onChange={setDrillMode}
              disabled={running}
              hint="Plays every selected scale in all 12 keys, each in a random octave."
            />
            {!drillMode ? (
              <SliderField
                label="Number of scales"
                value={scaleCount}
                min={MIN_SCALE_COUNT}
                max={MAX_SCALE_COUNT}
                step={1}
                disabled={running}
                onChange={setScaleCount}
                hint="How many random scales make up one session."
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
                onChange={(value) => updateSettings({ sensitivity: value })}
              />
            </Field>
            <SwitchRow
              label="Partial credit"
              checked={partialCredit}
              onChange={setPartialCredit}
              disabled={running}
              hint="A wrong note gets one retry; missing it twice fails the scale instead of failing on the first miss."
            />
            <SwitchRow
              label="Ignore repeated notes"
              checked={ignoreRepeatedNotes}
              onChange={setIgnoreRepeatedNotes}
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
            label="Play scale out loud"
            checked={playSound && !listenMode}
            onChange={setPlaySound}
            disabled={listenMode}
            hint="Plays each note of the scale in order as it appears. Not available in listen mode."
          />
          <SwitchRow label="Show next scale" checked={showNext} onChange={setShowNext} hint="Shows a preview of the upcoming scale below the current one." />
          <SwitchRow
            label="Show scale notes"
            checked={showScaleNotes}
            onChange={setShowScaleNotes}
            hint="The row of notes under the circle in listen mode, showing your progress through the scale."
          />
          <Field label="Waveform" hint="Which tone plays a scale out loud.">
            <PillChoice label="Waveform" value={waveform} options={WAVEFORMS} disabled={!playSound || listenMode} onChange={setWaveform} />
          </Field>
        </SettingChip>
      </OptionsArea>
    </ToolScreen>
  );
}

export default withScreenLoader(ScaleTrainerScreen);
