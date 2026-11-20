import { CUSTOM_INSTRUMENT_ID, INSTRUMENTS } from '@jam-practice/core/instruments';
import {
  DEFAULT_ENABLED_INTERVAL_IDS,
  INTERVALS,
  drillQueueForPool,
  intervalRoundForPitchClass,
  pitchClassOf,
  randomIntervalRound,
  type Direction,
  type IntervalDef,
  type IntervalRound,
} from '@jam-practice/core/intervals';
import { scoreOf, type Grade } from '@jam-practice/core/noteGrade';
import { parseRange } from '@jam-practice/core/noteRange';
import { ACCIDENTAL_STYLES, spellNote, type AccidentalStyle } from '@jam-practice/core/noteSpelling';
import { bumpGradeCounts, rankWeak, type GradeCounts } from '@jam-practice/core/struggleStats';
import { shuffled } from '@jam-practice/core/trainerUtils';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { LearningPath } from '@/components/learning/LearningPath';
import { LevelComplete } from '@/components/learning/LevelComplete';
import { cumulativeItems, intervalLevelOptions, levelQueue } from '@jam-practice/core/learningPath';
import { useLearnSession } from '@/lib/useLearnSession';
import { CountdownLabel, ElapsedTimer } from '@/components/CountdownLabel';
import { Dropdown } from '@/components/Dropdown';
import { IntervalIcon, NoteIcon, PlayIcon, StopwatchIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SwitchRow } from '@/components/SwitchRow';
import {
  AnswerButton,
  FeedbackLine,
  Field,
  IdleHint,
  IdleSummary,
  toneLabel,
  LevelLabel,
  MutedText,
  OptionsArea,
  Pill,
  PillChoice,
  PoolHeader,
  QuizRing,
  ResultsPanel,
  SheetInput,
  SliderField,
  StrugglesChip,
  HistoryChip,
  TextButton,
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
import { DEFAULT_EAR_TRAINING_TONE_ID, EAR_TRAINING_TONES, asToneId, playNote, playNotesTogether } from '@/lib/sampledTones';
import { startTone } from '@/lib/toneGenerator';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useToolActivity } from '@/lib/toolTime';

/**
 * Native port of `apps/web/components/GuessTheInterval.tsx` — same features, same synced settings
 * key (so settings, struggle stats and history follow you between the site and the app): it plays
 * an interval with the **same recorded piano/Rhodes samples** the site uses (`@/lib/sampledTones`),
 * melodic or harmonic, and you pick which interval it was from a grid of the selected ones. Same
 * timed-round machinery as web — max time to answer, a pause before the next round with its own
 * countdown, optional click feedback, a fixed number of rounds or "Drill every interval" (misses
 * requeued in a fresh octave), lifetime Struggles with "Shed weak intervals", and a History of
 * times for identical settings.
 *
 * Laid out like the website's (`components/tool/ear.tsx`): History / Struggles chips above the
 * round, the ring, the answer grid and Start; Practice / Learn and the option chips under it
 * (hidden while a session runs). The only web feature without a counterpart is the Space-bar
 * shortcut (no hardware keyboard).
 */
const MIN_ROUND_SECONDS = 2;
const MAX_ROUND_SECONDS = 20;
const DEFAULT_ROUND_SECONDS = 8;

const MELODIC_NOTE_DURATION_SECONDS = 0.45;
const MELODIC_NOTE_GAP_MS = 500;
const HARMONIC_NOTE_DURATION_SECONDS = 1.1;

const MIN_ROUND_COUNT = 5;
const MAX_ROUND_COUNT = 50;
const DEFAULT_ROUND_COUNT = 15;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 1500;

type PlaybackStyle = 'melodic' | 'harmonic';
const PLAYBACK_STYLES: { value: PlaybackStyle; label: string }[] = [
  { value: 'melodic', label: 'Melodic (one after another)' },
  { value: 'harmonic', label: 'Harmonic (together)' },
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

type HistoryConfig = {
  rangeInput: string;
  drillMode: boolean;
  includeDescending: boolean;
  roundCount: number;
  intervalIdsKey: string;
  roundSeconds: number;
  advanceDelayMs: number;
  playbackStyle: PlaybackStyle;
};

function sameConfig(a: HistoryConfig, b: HistoryConfig): boolean {
  return (Object.keys(a) as (keyof HistoryConfig)[]).every((key) => a[key] === b[key]);
}

type HistoryEntry = { at: number; elapsedMs: number; score: number; total: number; config: HistoryConfig };

// Same key and shape as the website's, so both read and write the same synced settings.
const SETTINGS_KEY = 'jam-practice-guess-the-interval';
const DEFAULT_SETTINGS = {
  learnMode: false,
  instrumentId: INSTRUMENTS[0].id,
  customRange: 'A1-A6',
  roundSeconds: DEFAULT_ROUND_SECONDS,
  advanceDelayMs: DEFAULT_ADVANCE_DELAY_MS,
  soundFeedback: false,
  roundCount: DEFAULT_ROUND_COUNT,
  drillMode: false,
  includeDescending: false,
  intervalIds: DEFAULT_ENABLED_INTERVAL_IDS as string[],
  intervalStats: {} as Record<string, GradeCounts>,
  toneId: DEFAULT_EAR_TRAINING_TONE_ID as string,
  playbackStyle: 'melodic' as PlaybackStyle,
  revealNotes: true,
  accidentalStyle: 'sharp' as AccidentalStyle,
  history: [] as HistoryEntry[],
};

function playClick() {
  startTone(1000, 'sine', 0.5, 0.05);
}

type WeakInterval = { key: string; interval: IntervalDef; counts: GradeCounts };

/** Every struggling interval, worst first (per interval — direction isn't asked here). */
function weakIntervalEntries(stats: Record<string, GradeCounts>): WeakInterval[] {
  return rankWeak(stats)
    .map((entry) => {
      const interval = INTERVALS.find((i) => i.id === entry.key);
      return interval && { key: entry.key, interval, counts: entry.counts };
    })
    .filter((e): e is WeakInterval => !!e);
}

function GuessTheIntervalScreen() {
  const { colors } = useAppTheme();
  const GRADE_COLOR = useGradeColors();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const learnMode = settings.learnMode;
  const learn = useLearnSession('interval');

  const { customRange, roundSeconds, advanceDelayMs, soundFeedback, drillMode, includeDescending, playbackStyle, revealNotes } = settings;
  const history = settings.history.filter((h): h is HistoryEntry => !!h && typeof h.config === 'object' && h.config !== null);
  const accidentalStyle = ACCIDENTAL_STYLES.some((s) => s.value === settings.accidentalStyle) ? settings.accidentalStyle : 'sharp';
  const toneId = asToneId(settings.toneId);
  const roundCount = Math.min(MAX_ROUND_COUNT, Math.max(MIN_ROUND_COUNT, Math.round(settings.roundCount)));
  const instrumentId =
    settings.instrumentId === CUSTOM_INSTRUMENT_ID || INSTRUMENTS.some((i) => i.id === settings.instrumentId) ? settings.instrumentId : INSTRUMENTS[0].id;
  const pool = INTERVALS.filter((i) => settings.intervalIds.includes(i.id));
  const directions: Direction[] = includeDescending ? [1, -1] : [1];
  const isCustom = instrumentId === CUSTOM_INSTRUMENT_ID;
  const rangeInput = isCustom ? customRange : (INSTRUMENTS.find((i) => i.id === instrumentId)?.range ?? '');

  const [round, setRound] = useState<IntervalRound | null>(null);
  const [running, setRunning] = useState(false);
  useToolActivity('/guess-the-interval', running);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [guessedId, setGuessedId] = useState<string | null>(null);
  const [answerChoices, setAnswerChoices] = useState<IntervalDef[]>([]);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [roundSeed, setRoundSeed] = useState(0);
  const [lastMode, setLastMode] = useState<'normal' | 'weak'>('normal');
  const [noteTimer, setNoteTimer] = useState({ startedAt: 0, durationMs: 1000 });
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  // The learning-path level being played (0-based), while a learn-mode session runs.
  const [activeLevel, setActiveLevel] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundSeedRef = useRef(0);
  const sessionStartRef = useRef<number | null>(null);
  const toneIdRef = useRef(toneId);
  const playbackStyleRef = useRef(playbackStyle);
  // A learning-path level's own playback style, overriding the setting while it runs.
  const learnStyleRef = useRef<PlaybackStyle | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const cfgRef = useRef({ advanceDelayMs, soundFeedback });
  const skipRef = useRef<(() => void) | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalStatsRef = useRef(settings.intervalStats);

  useEffect(() => {
    toneIdRef.current = toneId;
    playbackStyleRef.current = playbackStyle;
    cfgRef.current = { advanceDelayMs, soundFeedback };
  }, [toneId, playbackStyle, advanceDelayMs, soundFeedback]);

  useEffect(() => {
    intervalStatsRef.current = settings.intervalStats;
  }, [settings.intervalStats]);

  useEffect(() => {
    const playback = playbackTimeouts.current;
    const clicks = countdownClickTimeouts.current;
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
      playback.forEach(clearTimeout);
      clicks.forEach(clearTimeout);
    };
  }, []);

  function bumpIntervalStat(intervalId: string, grade: Grade) {
    intervalStatsRef.current = bumpGradeCounts(intervalStatsRef.current, intervalId, grade);
    updateSettings({ intervalStats: intervalStatsRef.current });
  }

  function clearPlayback() {
    playbackTimeouts.current.forEach(clearTimeout);
    playbackTimeouts.current = [];
  }

  function clearCountdownClicks() {
    countdownClickTimeouts.current.forEach(clearTimeout);
    countdownClickTimeouts.current = [];
  }

  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!cfgRef.current.soundFeedback) return;
    for (let s = 1; s <= Math.floor(durationMs / 1000); s++) countdownClickTimeouts.current.push(setTimeout(playClick, s * 1000));
  }

  function playIntervalSound(notes: string[]) {
    clearPlayback();
    if ((learnStyleRef.current ?? playbackStyleRef.current) === 'harmonic') {
      void playNotesTogether(notes, HARMONIC_NOTE_DURATION_SECONDS, toneIdRef.current);
    } else {
      notes.forEach((n, i) => {
        playbackTimeouts.current.push(setTimeout(() => playNote(n, MELODIC_NOTE_DURATION_SECONDS, toneIdRef.current), i * MELODIC_NOTE_GAP_MS));
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

  function scheduleAdvance(index: number) {
    if (skipTimeoutRef.current) return;
    skipTimeoutRef.current = setTimeout(() => {
      skipTimeoutRef.current = null;
      if (sessionRef.current?.index === index) skipRef.current?.();
    }, cfgRef.current.advanceDelayMs);
  }

  function lockInRound(grade: Grade) {
    const session = sessionRef.current;
    if (!session) return;
    session.best = grade;
    setStatus(grade);
    const pauseMs = cfgRef.current.advanceDelayMs;
    // eslint-disable-next-line react-hooks/purity -- only reached from button presses, never during render (same as web)
    setNoteTimer({ startedAt: Date.now(), durationMs: pauseMs });
    if (cfgRef.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    scheduleAdvance(session.index);
  }

  /** The player's pick, or `null` for "I don't know". */
  function submitGuess(id: string | null) {
    const session = sessionRef.current;
    if (!session || !session.round || session.best !== null) return;
    session.guessedId = id;
    setGuessedId(id);
    lockInRound(id === session.round.interval.id ? 'correct' : 'incorrect');
  }

  /** `'learn'` plays a learning-path level (`levelIndex`, else the selected one): a fixed set of
      rounds over the intervals unlocked so far, in that level's directions/playback style. */
  function start(mode: 'normal' | 'weak' | 'learn' = 'normal', levelIndex?: number) {
    const weak = mode === 'weak';
    const learnLevel = mode === 'learn' ? (levelIndex ?? learn.selected) : null;
    if (mode !== 'learn') setLastMode(mode);
    learn.clearResult();
    const range = parseRange(rangeInput);
    if (!range) {
      setError('Enter a valid range like "A1-A6".');
      return;
    }
    const weakList = weak ? weakIntervalEntries(intervalStatsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError('No struggling intervals yet — a wrong guess builds this list up.');
      return;
    }
    if (learnLevel === null && !weak && pool.length === 0) {
      setError('Select at least one interval to practice.');
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearPlayback();

    const drilling = weak || learnLevel !== null ? true : drillMode;
    const learnOptions = learnLevel !== null ? intervalLevelOptions(learnLevel) : null;
    learnStyleRef.current = learnOptions ? (learnOptions.harmonic ? 'harmonic' : 'melodic') : null;
    const queue = learnLevel !== null
      ? levelQueue('interval', learnLevel).map((id) => randomIntervalRound(range, [INTERVALS.find((i) => i.id === id)!], learnOptions!.directions))
      : weak
      ? shuffled(weakList.map((e) => randomIntervalRound(range, [e.interval], directions)))
      : drilling
        ? shuffled(drillQueueForPool(range, pool, directions))
        : [];
    // A weak session may shed an interval since deselected — offer what's actually in the queue.
    setAnswerChoices(learnLevel !== null ? INTERVALS.filter((i) => cumulativeItems('interval', learnLevel).includes(i.id)) : weak ? INTERVALS.filter((i) => weakList.some((e) => e.interval.id === i.id)) : pool);

    sessionRef.current = { total: drilling ? queue.length : roundCount, index: 0, round: null, best: null, results: [], rounds: [], queue, guessedId: null };
    // eslint-disable-next-line react-hooks/purity -- only reached from button presses, never during render (same as web)
    sessionStartRef.current = Date.now();
    setSessionStartedAt(sessionStartRef.current);

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
        const finishedGrade = session.best ?? 'incorrect';
        if (session.round) {
          session.results.push(finishedGrade);
          session.rounds.push(session.round);
          bumpIntervalStat(session.round.interval.id, finishedGrade);
          if (drilling && learnLevel === null && finishedGrade === 'incorrect') {
            const requeued = intervalRoundForPitchClass(range, session.round.interval, session.round.direction, pitchClassOf(session.round.startMidi));
            if (requeued) session.queue.push(requeued);
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
          const elapsedMs = sessionStartRef.current ? Date.now() - sessionStartRef.current : 0;
          sessionStartRef.current = null;
          if (weak) {
            setLastElapsedMs(null);
            setIsNewBest(false);
          } else {
            const config: HistoryConfig = {
              rangeInput,
              drillMode,
              includeDescending,
              roundCount,
              intervalIdsKey: pool.map((i) => i.id).sort().join(','),
              roundSeconds,
              advanceDelayMs,
              playbackStyle,
            };
            const previousBest = history.filter((h) => sameConfig(h.config, config)).reduce((min, h) => Math.min(min, h.elapsedMs), Infinity);
            const entry: HistoryEntry = { at: Date.now(), elapsedMs, score: scoreOf(session.results), total: session.results.length, config };
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
        setProgress(drilling && learnLevel === null ? { index: session.index, total: session.index + session.queue.length } : { index: session.index, total: session.total });
      }
      const next = drilling && session ? session.queue.shift()! : randomIntervalRound(range, pool, directions);
      if (session) session.round = next;
      roundSeedRef.current++;
      setRoundSeed(roundSeedRef.current);
      setNoteTimer({ startedAt: Date.now(), durationMs: seconds * 1000 });
      setRound(next);
      playIntervalSound(next.notes);
    };

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

  const revealedLabel = (r: IntervalRound) => `${r.direction === 1 ? '↑' : '↓'} ${r.interval.label}`;
  const mainLabel = running && round ? (status ? revealedLabel(round) : '?') : '?';
  const glow = running && status === 'correct' ? GRADE_COLOR.correct : null;
  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) => summary?.results.filter((g) => g === grade).length ?? 0;
  const currentConfig: HistoryConfig = {
    rangeInput,
    drillMode,
    includeDescending,
    roundCount,
    intervalIdsKey: pool.map((i) => i.id).sort().join(','),
    roundSeconds,
    advanceDelayMs,
    playbackStyle,
  };
  const matchingHistory = history.filter((h) => sameConfig(h.config, currentConfig));
  const bestMs = matchingHistory.length ? Math.min(...matchingHistory.map((h) => h.elapsedMs)) : null;
  const weakEntries = weakIntervalEntries(settings.intervalStats);
  const revealedNotes =
    revealNotes && status && round
      ? `${spellNote(round.notes[0], accidentalStyle, roundSeed, false)} → ${spellNote(round.notes[1], accidentalStyle, roundSeed, false)}`
      : null;
  const showingSummary = summary !== null && !running;

  const pickedLabel =
    status === 'incorrect' ? (guessedId ? `You picked ${answerChoices.find((i) => i.id === guessedId)?.label ?? 'another interval'}` : 'No answer') : null;

  if (!settingsReady) return <ScreenSpinner />;

  const showSide = !running && (history.length > 0 || weakEntries.length > 0);
  const instrumentLabel = isCustom ? 'Custom' : instrumentShortName(instrumentId);

  return (
    <ToolScreen title="Guess the Interval">
      {/* Hidden until there's something in them, and while a session runs. */}
      {showSide ? (
        <SettingsBar>
          <HistoryChip
            entries={matchingHistory}
            bestMs={bestMs}
            onClear={() => updateSettings({ history: history.filter((h) => !sameConfig(h.config, currentConfig)) })}
          />
          <StrugglesChip
            entries={weakEntries.map((e) => ({ key: e.key, label: e.interval.label, counts: e.counts }))}
            shedLabel="Shed weak intervals"
            emptyText="No struggles tracked yet — a wrong guess adds it here."
            running={running}
            onShed={() => start('weak')}
            onClear={() => {
              intervalStatsRef.current = {};
              updateSettings({ intervalStats: {} });
            }}
          />
        </SettingsBar>
      ) : null}

      {/* The mode decides what the screen is, so it sits above the display. */}
      {!running ? (
        <View className="w-full items-center">
          <Segmented
            onPage
            label="Mode"
            value={learnMode ? 'learn' : 'practice'}
            onChange={(v) => updateSettings({ learnMode: v === 'learn' })}
            options={[
              { value: 'practice', label: 'Practice' },
              { value: 'learn', label: 'Learn' },
            ]}
          />
        </View>
      ) : null}

      {learnMode && !running ? (
        <LearningPath track="interval" progress={learn.progress} selected={learn.selected} onSelect={learn.select} onStart={() => start('learn')} />
      ) : showingSummary && summary ? (
        <ResultsPanel
          score={score}
          total={summary.results.length}
          elapsed={lastElapsedMs}
          bestMs={bestMs}
          isNewBest={isNewBest}
          grades={(['correct', 'incorrect'] as const).map((g) => ({ grade: g, count: tally(g) }))}
          tags={summary.rounds.map((r, i) => ({ label: revealedLabel(r), grade: summary.results[i] }))}
          onAgain={() => start(lastMode)}
          onClose={() => setSummary(null)}
        />
      ) : (
        <View className="w-full items-center gap-3">
          {activeLevel !== null && running ? (
            <LevelLabel>
              Level {activeLevel + 1} · {learn.levels[activeLevel].title}
            </LevelLabel>
          ) : null}
          <QuizRing size={running ? 144 : 176} running={running} timer={noteTimer}>
            {running ? (
              <Text
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                className={`font-ui-bold text-center font-bold ${round && status ? 'text-2xl' : 'text-4xl'}`}
                style={{ color: glow ?? colors.foreground }}
              >
                {mainLabel}
              </Text>
            ) : (
              <IdleSummary
                value={String(pool.length)}
                label={pool.length === 1 ? 'interval' : 'intervals'}
                detail={`${drillMode ? 'Every key' : `${roundCount} rounds`} · ${instrumentLabel}`}
              />
            )}
          </QuizRing>
          {!running ? <IdleHint>Press Start, listen to two notes, then pick the interval.</IdleHint> : null}

          {running && round ? (
            <>
              <FeedbackLine>
                <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold">
                  {pickedLabel ? <Text style={{ color: GRADE_COLOR.incorrect }}>{pickedLabel}</Text> : null}
                  {pickedLabel && revealedNotes ? <Text style={{ color: colors.muted }}> · </Text> : null}
                  {revealedNotes ? <Text style={{ color: colors.muted }}>{noteGlyphs(revealedNotes)}</Text> : null}
                </Text>
              </FeedbackLine>
              <Button label="Replay" kind="secondary" Icon={PlayIcon} onPress={() => playIntervalSound(round.notes)} />
            </>
          ) : null}

          {running && round && answerChoices.length > 0 ? (
            <View className="w-full flex-row flex-wrap justify-center" style={{ gap: 6 }}>
              {answerChoices.map((interval) => {
                const answered = status !== null;
                const color = !answered
                  ? undefined
                  : interval.id === round.interval.id
                    ? GRADE_COLOR.correct
                    : interval.id === guessedId
                      ? GRADE_COLOR.incorrect
                      : undefined;
                return <AnswerButton key={interval.id} label={interval.label} width="32%" color={color} answered={answered} onPress={() => submitGuess(interval.id)} />;
              })}
            </View>
          ) : null}

          {/* "I don't know" until answered, then the countdown to the next one, in the same slot. */}
          {running && round ? (
            <View className="min-h-11 items-center justify-center">
              {!status ? (
                <TextButton label="I don't know" onPress={() => submitGuess(null)} />
              ) : (
                <View className="flex-row items-center">
                  <MutedText>Next interval in </MutedText>
                  <CountdownLabel active={running} startedAt={noteTimer.startedAt} durationMs={noteTimer.durationMs} />
                </View>
              )}
            </View>
          ) : null}

          {running && progress ? (
            <View className="flex-row items-center">
              <MutedText className="tabular-nums">
                Interval {progress.index} of {progress.total} ·{' '}
              </MutedText>
              <ElapsedTimer active={running} startedAt={sessionStartedAt} />
            </View>
          ) : null}
        </View>
      )}

      {error ? (
        <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}

      {/* While the results show, their own "Try again" is the one start button. */}
      {!showingSummary || learnMode ? (
        <BigButton
          label={running ? 'Stop' : learnMode ? `Start level ${learn.selected + 1}` : 'Start'}
          secondary={running}
          onPress={running ? endSession : () => start(learnMode ? 'learn' : 'normal')}
        />
      ) : null}

      {/* Hidden while a session runs, so the round has the screen to itself. */}
      {!running ? (
        <OptionsArea>
          {!learnMode ? (
            <SettingChip Icon={IntervalIcon} label="Intervals" value={`${pool.length} of ${INTERVALS.length}`}>
              <PoolHeader
                count={pool.length}
                total={INTERVALS.length}
                onAll={() => updateSettings({ intervalIds: INTERVALS.map((i) => i.id) })}
                onNone={() => updateSettings({ intervalIds: [] })}
                hint="Which intervals can be played — and the choices offered for each round. At least one must stay selected."
              />
              <View className="flex-row flex-wrap gap-1.5">
                {INTERVALS.map((interval) => {
                  const selected = settings.intervalIds.includes(interval.id);
                  return (
                    <Pill
                      key={interval.id}
                      on={selected}
                      label={interval.label}
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
                hint="Lets a round play the interval below the starting note, not just above it — the choices are still just the interval's name, not its direction."
              />
              <SwitchRow
                label="Drill every interval"
                checked={drillMode}
                onChange={(v) => updateSettings({ drillMode: v })}
                hint="Plays every selected interval, in every selected direction, starting on all 12 keys, each in a random octave."
              />
            </SettingChip>
          ) : null}

          <SettingChip Icon={NoteIcon} label="Range" value={`${instrumentLabel} · ${rangeInput.replace('-', '–')}`}>
            <Field
              label="Instrument"
              hint="The register the starting note is drawn from — a comfortable range for your ear, not necessarily an instrument you're playing along with."
            >
              <Dropdown
                value={instrumentId}
                options={[...INSTRUMENTS.map((i) => ({ value: i.id, label: `${i.label} (${i.range.replace('-', '–')})` })), { value: CUSTOM_INSTRUMENT_ID, label: 'Custom range…' }]}
                onChange={(v) => updateSettings({ instrumentId: v })}
              />
            </Field>
            {isCustom ? (
              <Field label="Custom range" hint="The lowest and highest notes to draw starting notes from, e.g. A1-A6.">
                <SheetInput value={customRange} onChangeText={(v) => updateSettings({ customRange: v })} placeholder="A1-A6" />
              </Field>
            ) : null}
          </SettingChip>

          <SettingChip Icon={StopwatchIcon} label="Timing" value={`${roundSeconds} s`}>
            <SliderField
              label="Max time to answer"
              value={roundSeconds}
              unit=" s"
              min={MIN_ROUND_SECONDS}
              max={MAX_ROUND_SECONDS}
              step={0.5}
              onChange={(v) => updateSettings({ roundSeconds: v })}
              hint="How long you have to pick an answer before it's marked a miss and moves on."
            />
            <SliderField
              label="Time between rounds"
              value={advanceDelayMs / 1000}
              unit=" s"
              min={MIN_ADVANCE_DELAY_MS / 1000}
              max={MAX_ADVANCE_DELAY_MS / 1000}
              step={0.25}
              onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
              hint="How long the revealed answer (with its countdown ring) stays on screen before the next interval plays."
            />
            {!drillMode && !learnMode ? (
              <SliderField
                label="Number of rounds"
                value={roundCount}
                min={MIN_ROUND_COUNT}
                max={MAX_ROUND_COUNT}
                step={1}
                onChange={(v) => updateSettings({ roundCount: v })}
                hint="How many intervals make up one session."
              />
            ) : null}
          </SettingChip>

          <SettingChip
            Icon={ToneIcon}
            label="Sound & display"
            value={`${toneLabel(toneId)} · ${PLAYBACK_STYLES.find((p) => p.value === playbackStyle)?.label.split(' (')[0] ?? ''}`}
          >
            <Field label="Playback style" hint="Whether the two notes play one after another or together.">
              <PillChoice label="Playback style" value={playbackStyle} options={PLAYBACK_STYLES} onChange={(v) => updateSettings({ playbackStyle: v })} />
            </Field>
            <Field label="Tone" hint="Which sound plays the interval.">
              <PillChoice label="Tone" value={toneId} options={EAR_TRAINING_TONES.map((t) => ({ value: t.id, label: t.label }))} onChange={(v) => updateSettings({ toneId: v })} />
            </Field>
            <SwitchRow
              label="Sound feedback"
              checked={soundFeedback}
              onChange={(v) => updateSettings({ soundFeedback: v })}
              hint="A click each second of the countdown, plus a click the instant a round is graded."
            />
            <SwitchRow
              label="Reveal notes after answering"
              checked={revealNotes}
              onChange={(v) => updateSettings({ revealNotes: v })}
              hint="Shows the actual note names once a round is graded, e.g. C4 → E4."
            />
            {revealNotes ? (
              <Field label="Accidentals" hint="How sharps and flats are spelled in the revealed notes, e.g. C# vs Db.">
                <PillChoice label="Accidentals" value={accidentalStyle} options={ACCIDENTAL_STYLES} onChange={(v) => updateSettings({ accidentalStyle: v })} />
              </Field>
            ) : null}
          </SettingChip>
        </OptionsArea>
      ) : null}

      {learn.result ? (
        <LevelComplete
          result={learn.result}
          instrument={toneId}
          onNext={() => start('learn', learn.result!.levelNumber)}
          onRetry={() => start('learn', learn.result!.levelNumber - 1)}
          onClose={learn.clearResult}
        />
      ) : null}
    </ToolScreen>
  );
}

export default withScreenLoader(GuessTheIntervalScreen);
