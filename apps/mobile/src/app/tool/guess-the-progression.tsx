import { formatChordParts, parseChordInput, pcLabel } from '@jam-practice/core/chords';
import { levelQueue } from '@jam-practice/core/learningPath';
import { scoreOf, type Grade } from '@jam-practice/core/noteGrade';
import { ACCIDENTAL_STYLES, type AccidentalStyle } from '@jam-practice/core/noteSpelling';
import {
  DEFAULT_ENABLED_PROGRESSION_IDS,
  PROGRESSIONS,
  PROGRESSION_CATEGORIES,
  chordNameText,
  firstChordRoot,
  gradeAnswer,
  prettyNumeral,
  progressionById,
  progressionRound,
  randomProgressionRound,
  splitAnswer,
  type AnswerMode,
  type Progression,
  type ProgressionRound,
} from '@jam-practice/core/progressions';
import { bumpGradeCounts, rankWeak, type GradeCounts } from '@jam-practice/core/struggleStats';
import { shuffled } from '@jam-practice/core/trainerUtils';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CountdownLabel, ElapsedTimer } from '@/components/CountdownLabel';
import { NoteIcon, PencilIcon, PlayIcon, ProgressionIcon, StopwatchIcon } from '@/components/icons';
import { LearningPath } from '@/components/learning/LearningPath';
import { LevelComplete } from '@/components/learning/LevelComplete';
import { ProgressionAnswerKeyboard } from '@/components/ProgressionAnswerKeyboard';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SwitchRow } from '@/components/SwitchRow';
import {
  FeedbackLine,
  Field,
  GroupLabel,
  HistoryChip,
  IDLE_RING,
  IdleHint,
  IdleStatus,
  LevelLabel,
  MutedText,
  Pill,
  PillChoice,
  PoolHeader,
  QuizRing,
  ResultsPanel,
  SheetText,
  SliderField,
  StrugglesChip,
  TextButton,
  ToolScreen,
  useGradeColors,
} from '@/components/tool/ear';
import { BigButton } from '@/components/tool/meter';
import { Segmented } from '@/components/tool/reward';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { DEFAULT_EAR_TRAINING_TONE_ID, EAR_TRAINING_TONES, asToneId, playChordSequence } from '@/lib/sampledTones';
import { startTone } from '@/lib/toneGenerator';
import { useLearnSession } from '@/lib/useLearnSession';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { useToolActivity } from '@/lib/toolTime';
import { useStopOnBlur } from '@/lib/useStopOnBlur';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';

/**
 * Native port of `apps/web/components/GuessTheProgression.tsx` — same features, same synced
 * settings key: a chord progression plays (the same recorded piano/Rhodes samples, voiced around
 * the key's tonic) and you type it, in Roman numerals (`ii7 V7 I^7`, case = major/minor) or chord
 * names (the first chord's root given), with or without the qualities. Same round/timer/history/
 * struggles machinery as Guess the Chord, plus Learn mode's levelled path. Answers go on
 * `ProgressionAnswerKeyboard`, fixed to the bottom of the screen. Otherwise laid out like the
 * website's (`components/tool/ear.tsx`): History / Struggles chips, the ring and chord slots, Start,
 * Practice / Learn and the option chips.
 */
const MIN_ROUND_SECONDS = 10;
const MAX_ROUND_SECONDS = 90;
const DEFAULT_ROUND_SECONDS = 40;

const MIN_CHORD_SECONDS = 0.8;
const MAX_CHORD_SECONDS = 3;
const DEFAULT_CHORD_SECONDS = 1.6;
const ARPEGGIO_GAP_SECONDS = 0.09;

const MIN_ROUND_COUNT = 3;
const MAX_ROUND_COUNT = 30;
const DEFAULT_ROUND_COUNT = 8;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 3000;

type PlaybackStyle = 'block' | 'arpeggio';
const PLAYBACK_STYLES: { value: PlaybackStyle; label: string }[] = [
  { value: 'block', label: 'Block (all notes at once)' },
  { value: 'arpeggio', label: 'Arpeggio (quick roll)' },
];

type Register = { id: string; label: string; lowMidi: number; highMidi: number };
const REGISTERS: Register[] = [
  { id: 'low', label: 'Low', lowMidi: 41, highMidi: 52 },
  { id: 'mid', label: 'Mid', lowMidi: 48, highMidi: 59 },
  { id: 'high', label: 'High', lowMidi: 55, highMidi: 66 },
];
const DEFAULT_REGISTER_ID = 'mid';

const KEY_OPTIONS = [
  { value: 'random', label: 'Random' },
  ...Array.from({ length: 12 }, (_, pc) => ({ value: String(pc), label: pcLabel(pc, 'flat', 0) })),
];

const ANSWER_MODES: { value: AnswerMode; label: string }[] = [
  { value: 'numerals', label: 'Roman numerals' },
  { value: 'chords', label: 'Chord names' },
];

type Session = {
  total: number;
  index: number;
  round: ProgressionRound | null;
  best: Grade | null;
  results: Grade[];
  rounds: ProgressionRound[];
  marks: boolean[][];
  answers: string[];
  queue: ProgressionRound[];
};

type Summary = { results: Grade[]; rounds: ProgressionRound[]; marks: boolean[][]; answers: string[] };

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

type HistoryEntry = { at: number; elapsedMs: number; score: number; total: number; config: HistoryConfig };

// Same key and shape as the website's, so both read and write the same synced settings.
const SETTINGS_KEY = 'jam-practice-guess-the-progression';
const DEFAULT_SETTINGS = {
  learnMode: false,
  answerMode: 'numerals' as AnswerMode,
  typeQualities: true,
  keyChoice: 'random',
  registerId: DEFAULT_REGISTER_ID,
  playKeyFirst: false,
  roundSeconds: DEFAULT_ROUND_SECONDS,
  advanceDelayMs: DEFAULT_ADVANCE_DELAY_MS,
  soundFeedback: false,
  roundCount: DEFAULT_ROUND_COUNT,
  drillMode: false,
  progressionIds: DEFAULT_ENABLED_PROGRESSION_IDS as string[],
  progressionStats: {} as Record<string, GradeCounts>,
  toneId: DEFAULT_EAR_TRAINING_TONE_ID as string,
  playbackStyle: 'block' as PlaybackStyle,
  chordSeconds: DEFAULT_CHORD_SECONDS,
  accidentalStyle: 'flat' as AccidentalStyle,
  history: [] as HistoryEntry[],
};

function playClick() {
  startTone(1000, 'sine', 0.5, 0.05);
}

function gradeOf(marks: boolean[]): Grade {
  const right = marks.filter(Boolean).length;
  if (right === marks.length) return 'correct';
  return right > 0 ? 'partial' : 'incorrect';
}

function prettyToken(token: string, mode: AnswerMode): string {
  if (mode === 'numerals') return prettyNumeral(token);
  const parsed = parseChordInput(token);
  if (!parsed) return token;
  const parts = formatChordParts(parsed);
  return `${parts.root}${parts.quality}${parts.bass ? `/${parts.bass}` : ''}`;
}

type WeakProgression = { key: string; progression: Progression; counts: GradeCounts };

function weakEntriesOf(stats: Record<string, GradeCounts>): WeakProgression[] {
  return rankWeak(stats)
    .map((entry) => {
      const progression = progressionById(entry.key);
      return progression && { key: entry.key, progression, counts: entry.counts };
    })
    .filter((e): e is WeakProgression => !!e);
}

function GuessTheProgressionScreen() {
  const { colors } = useAppTheme();
  const GRADE_COLOR = useGradeColors();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const learn = useLearnSession('progression');

  const { roundSeconds, advanceDelayMs, soundFeedback, drillMode, typeQualities, playKeyFirst, playbackStyle, chordSeconds, learnMode } = settings;
  const answerMode: AnswerMode = settings.answerMode === 'chords' ? 'chords' : 'numerals';
  const history = settings.history.filter((h): h is HistoryEntry => !!h && typeof h.config === 'object' && h.config !== null);
  const accidentalStyle = ACCIDENTAL_STYLES.some((s) => s.value === settings.accidentalStyle) ? settings.accidentalStyle : 'flat';
  const toneId = asToneId(settings.toneId);
  const roundCount = Math.min(MAX_ROUND_COUNT, Math.max(MIN_ROUND_COUNT, Math.round(settings.roundCount)));
  const register = REGISTERS.find((r) => r.id === settings.registerId) ?? REGISTERS.find((r) => r.id === DEFAULT_REGISTER_ID)!;
  const keyChoice = KEY_OPTIONS.some((k) => k.value === settings.keyChoice) ? settings.keyChoice : 'random';
  const fixedPc = keyChoice === 'random' ? null : Number(keyChoice);
  const pool = PROGRESSIONS.filter((p) => settings.progressionIds.includes(p.id));

  const [round, setRound] = useState<ProgressionRound | null>(null);
  const [running, setRunning] = useState(false);
  useToolActivity('/guess-the-progression', running);
  // Leaving the screen stops the session (it would keep timing out questions as misses).
  useStopOnBlur(running, endSession);
  useKeepAwakeWhile(running);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const [typed, setTyped] = useState('');
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [lastMode, setLastMode] = useState<'normal' | 'weak'>('normal');
  const [noteTimer, setNoteTimer] = useState({ startedAt: 0, durationMs: 1000 });
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [activeLevel, setActiveLevel] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const audioCfgRef = useRef({ toneId, playbackStyle, chordSeconds, playKeyFirst });
  const sessionRef = useRef<Session | null>(null);
  const cfgRef = useRef({ advanceDelayMs, soundFeedback, answerMode, typeQualities, accidentalStyle });
  const typedRef = useRef('');
  const skipRef = useRef<(() => void) | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The progression currently sounding, so stop/replay/the next round can cut it off.
  const playbackRef = useRef<{ cancel: () => void } | null>(null);
  // Bumped whenever playback is cancelled, so one still loading its samples never starts late.
  const playGenRef = useRef(0);
  const mountedRef = useRef(true);
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const statsRef = useRef(settings.progressionStats);

  useEffect(() => {
    audioCfgRef.current = { toneId, playbackStyle, chordSeconds, playKeyFirst };
    cfgRef.current = { advanceDelayMs, soundFeedback, answerMode, typeQualities, accidentalStyle };
  }, [toneId, playbackStyle, chordSeconds, playKeyFirst, advanceDelayMs, soundFeedback, answerMode, typeQualities, accidentalStyle]);

  useEffect(() => {
    statsRef.current = settings.progressionStats;
  }, [settings.progressionStats]);

  useEffect(() => {
    const highlights = highlightTimeouts.current;
    const clicks = countdownClickTimeouts.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
      highlights.forEach(clearTimeout);
      clicks.forEach(clearTimeout);
      playbackRef.current?.cancel();
    };
  }, []);

  function setTypedValue(value: string) {
    setTyped(value);
    typedRef.current = value;
  }

  /** Appends a key's text. Keys that start the next chord add the separating space themselves —
      "ii" then "V" types "ii V" — unless all that's there so far is that chord's ♭/♯. */
  function insertText(text: string, newChord: boolean) {
    const current = typedRef.current;
    const last = current.split(' ').pop() ?? '';
    const accidentalOnly = /^[b#]+$/.test(last);
    const needsSpace = newChord && last !== '' && !(accidentalOnly && !/^[b#]$/.test(text));
    if (text === ' ' && (current === '' || current.endsWith(' '))) return;
    setTypedValue(current + (needsSpace ? ' ' : '') + text);
  }

  function bumpStat(id: string, grade: Grade) {
    statsRef.current = bumpGradeCounts(statsRef.current, id, grade);
    updateSettings({ progressionStats: statsRef.current });
  }

  function clearPlayback() {
    playGenRef.current++;
    playbackRef.current?.cancel();
    playbackRef.current = null;
    highlightTimeouts.current.forEach(clearTimeout);
    highlightTimeouts.current = [];
    setPlayingIndex(null);
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

  /** Plays the progression (after the key's tonic chord and a beat's rest, with "Play the key
      first"), lighting each chord's slot as it sounds. */
  async function playProgression(r: ProgressionRound) {
    clearPlayback();
    const gen = playGenRef.current;
    const { toneId: instrument, chordSeconds: secs, playKeyFirst: withKey, playbackStyle: style } = audioCfgRef.current;
    const chords = withKey ? [r.tonicVoicing, [], ...r.voicings] : r.voicings;
    const playback = await playChordSequence(chords, {
      stepSeconds: secs,
      ringSeconds: secs + 0.35,
      instrument,
      arpeggioGapSeconds: style === 'arpeggio' ? ARPEGGIO_GAP_SECONDS : 0,
    });
    if (gen !== playGenRef.current || !mountedRef.current) {
      playback.cancel();
      return;
    }
    playbackRef.current = playback;
    const offset = withKey ? 2 : 0;
    r.voicings.forEach((_, i) => highlightTimeouts.current.push(setTimeout(() => setPlayingIndex(i), (offset + i) * secs * 1000 + 50)));
    highlightTimeouts.current.push(setTimeout(() => setPlayingIndex(null), (offset + r.voicings.length) * secs * 1000 + 50));
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

  function scheduleAdvance(index: number) {
    if (skipTimeoutRef.current) return;
    skipTimeoutRef.current = setTimeout(() => {
      skipTimeoutRef.current = null;
      if (sessionRef.current?.index === index) skipRef.current?.();
    }, cfgRef.current.advanceDelayMs);
  }

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
    // eslint-disable-next-line react-hooks/purity -- only reached from key presses / the timer, never during render (same as web)
    setNoteTimer({ startedAt: Date.now(), durationMs: pauseMs });
    if (cfgRef.current.soundFeedback) {
      playClick();
      scheduleCountdownClicks(pauseMs);
    }
    scheduleAdvance(session.index);
  }

  const currentConfig: HistoryConfig = {
    answerMode,
    typeQualities,
    keyChoice,
    registerId: register.id,
    drillMode,
    roundCount,
    progressionIdsKey: pool.map((p) => p.id).sort().join(','),
    roundSeconds,
    advanceDelayMs,
    chordSeconds,
    playbackStyle,
    playKeyFirst,
  };

  /** `'weak'` runs one round per struggling progression (no History); `'learn'` plays a
      learning-path level (`levelIndex`, else the selected one), scored at the end. */
  function start(mode: 'normal' | 'weak' | 'learn' = 'normal', levelIndex?: number) {
    const weak = mode === 'weak';
    const learnLevel = mode === 'learn' ? (levelIndex ?? learn.selected) : null;
    if (mode !== 'learn') setLastMode(mode);
    learn.clearResult();
    const weakList = weak ? weakEntriesOf(statsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError('No struggling progressions yet — a wrong or missed answer builds this list up.');
      return;
    }
    if (learnLevel === null && !weak && pool.length === 0) {
      setError('Select at least one progression to practice.');
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearPlayback();

    const low = register.lowMidi;
    const high = register.highMidi;
    const drilling = weak || learnLevel !== null ? true : drillMode;
    const queue =
      learnLevel !== null
        ? levelQueue('progression', learnLevel).map((id) => progressionRound(progressionById(id)!, low, high, fixedPc))
        : weak
          ? shuffled(weakList.map((e) => progressionRound(e.progression, low, high, fixedPc)))
          : drilling
            ? shuffled(pool.map((p) => progressionRound(p, low, high, fixedPc)))
            : [];

    sessionRef.current = { total: drilling ? queue.length : roundCount, index: 0, round: null, best: null, results: [], rounds: [], marks: [], answers: [], queue };
    // eslint-disable-next-line react-hooks/purity -- only reached from a button press, never during render (same as web)
    sessionStartRef.current = Date.now();
    setSessionStartedAt(sessionStartRef.current);

    const seconds = Math.max(MIN_ROUND_SECONDS, roundSeconds);
    const config = currentConfig;
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
          bumpStat(session.round.progression.id, finishedGrade);
          if (drilling && learnLevel === null && finishedGrade !== 'correct') {
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
          const elapsedMs = sessionStartRef.current ? Date.now() - sessionStartRef.current : 0;
          sessionStartRef.current = null;
          if (weak) {
            setLastElapsedMs(null);
            setIsNewBest(false);
          } else {
            const previousBest = history.filter((h) => sameConfig(h.config, config)).reduce((min, h) => Math.min(min, h.elapsedMs), Infinity);
            const entry: HistoryEntry = { at: Date.now(), elapsedMs, score: scoreOf(session.results), total: session.results.length, config };
            updateSettings({ history: [...history, entry].slice(-50) });
            setLastElapsedMs(elapsedMs);
            setIsNewBest(elapsedMs < previousBest);
          }
          setSummary({ results: session.results, rounds: session.rounds, marks: session.marks, answers: session.answers });
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
      const next = drilling && session ? session.queue.shift()! : randomProgressionRound(pool, low, high, fixedPc);
      if (session) session.round = next;
      setNoteTimer({ startedAt: Date.now(), durationMs: seconds * 1000 });
      setRound(next);
      setTypedValue(cfgRef.current.answerMode === 'chords' ? firstChordRoot(next, cfgRef.current.accidentalStyle) : '');
      void playProgression(next);
    };

    const onTimeUp = () => gradeAndReveal();
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

  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) => summary?.results.filter((g) => g === grade).length ?? 0;
  const matchingHistory = history.filter((h) => sameConfig(h.config, currentConfig));
  const bestMs = matchingHistory.length ? Math.min(...matchingHistory.map((h) => h.elapsedMs)) : null;
  const weakEntries = weakEntriesOf(settings.progressionStats);

  function answerFor(r: ProgressionRound, i: number): string {
    return answerMode === 'chords' ? prettyToken(chordNameText(r, i, accidentalStyle), 'chords') : prettyNumeral(r.progression.chords[i].numeral);
  }

  const typedTokens = splitAnswer(typed, answerMode);
  const right = marks ? marks.filter(Boolean).length : 0;
  const centerLabel = !round ? '?' : status && marks ? `${right}/${marks.length}` : '?';
  const glow = running && status ? GRADE_COLOR[status] : null;
  const answering = running && !!round && !status;
  const showingSummary = summary !== null && !running;

  if (!settingsReady) return <ScreenSpinner />;

  const showSide = !running && (history.length > 0 || weakEntries.length > 0);
  const keyLabel = KEY_OPTIONS.find((k) => k.value === keyChoice)?.label ?? 'Random';

  // How to write an answer, for the Answer chip's sheet and the first round's keyboard.
  const answerHowTo =
    answerMode === 'numerals'
      ? `One numeral per chord: upper case major, lower case minor${typeQualities ? ', then the quality — ii7, V7, I^7 (IΔ7), iih7 (iiø7), viio' : ''}. ♭/♯ go before a numeral.`
      : `The chord names — ${typeQualities ? 'full symbols like D-7 G7 C^7' : 'just roots, with - for minor: D- G C'}. You're given the first chord's root.`;

  // The mode switch first, then History and Struggles (hidden until there's something in them, and
  // while a session runs). While answering, the keyboard is pinned at the bottom (`footer`) with a
  // quiet Stop above it; results bring their own Try again. The chips hide while a session runs.
  const chipList = (
    <>
      {!learnMode ? (
        <SettingChip Icon={ProgressionIcon} label="Progressions" value={`${pool.length} of ${PROGRESSIONS.length}`}>
          <PoolHeader
            count={pool.length}
            total={PROGRESSIONS.length}
            onAll={() => updateSettings({ progressionIds: PROGRESSIONS.map((p) => p.id) })}
            onNone={() => updateSettings({ progressionIds: [] })}
            hint="Which progressions can be picked for a round. At least one must stay selected."
          />
          {PROGRESSION_CATEGORIES.map((category) => (
            <View key={category} className="gap-1.5">
              <GroupLabel>{category}</GroupLabel>
              <View className="flex-row flex-wrap gap-1.5">
                {PROGRESSIONS.filter((p) => p.category === category).map((p) => {
                  const selected = settings.progressionIds.includes(p.id);
                  return (
                    <Pill
                      key={p.id}
                      on={selected}
                      label={p.name}
                      onPress={() =>
                        updateSettings({
                          progressionIds: selected ? settings.progressionIds.filter((x) => x !== p.id) : [...settings.progressionIds, p.id],
                        })
                      }
                    />
                  );
                })}
              </View>
            </View>
          ))}
          <SwitchRow
            label="Drill every progression"
            checked={drillMode}
            onChange={(v) => updateSettings({ drillMode: v })}
            hint="Plays each selected progression once, in shuffled order; any you don't get fully right come back later in a new key."
          />
        </SettingChip>
      ) : null}

      <SettingChip
        Icon={PencilIcon}
        label="Answer"
        value={
          answerMode === 'numerals'
            ? typeQualities
              ? 'Numerals + qualities'
              : 'Numerals only'
            : typeQualities
              ? 'Chord symbols'
              : 'Chord roots only'
        }
      >
        <Field label="Answer with" hint="Type the progression as Roman numerals (ii V I), or as chord names in the key that was played (Dm G C).">
          <Segmented label="Answer with" value={answerMode} options={ANSWER_MODES} onChange={(v) => updateSettings({ answerMode: v })} />
        </Field>
        <Field label="How to write it">
          <SheetText>{answerHowTo}</SheetText>
        </Field>
        <SwitchRow
          label="Type chord qualities"
          checked={typeQualities}
          onChange={(v) => updateSettings({ typeQualities: v })}
          hint={
            answerMode === 'numerals'
              ? 'On: each numeral needs its quality too (ii7, V7, I^7, iiø7). Off: just the numerals — upper case for major, lower case for minor.'
              : 'On: each chord needs its full symbol (D-7, G7, C^7). Off: just the roots, with a minor sign (D-) where the chord is minor.'
          }
        />
        {answerMode === 'chords' ? (
          <Field label="Accidentals" hint="How sharps and flats are spelled in the given root and revealed chords, e.g. F# vs Gb.">
            <PillChoice label="Accidentals" value={accidentalStyle} options={ACCIDENTAL_STYLES} onChange={(v) => updateSettings({ accidentalStyle: v })} />
          </Field>
        ) : null}
      </SettingChip>

      <SettingChip Icon={NoteIcon} label="Key & sound" value={`${keyLabel} · ${register.label}`}>
        <Field label="Key" hint="A new random key every round, or always the same one.">
          <PillChoice label="Key" value={keyChoice} options={KEY_OPTIONS} onChange={(v) => updateSettings({ keyChoice: v })} />
        </Field>
        <Field label="Register" hint="How high or low the chords sit.">
          <PillChoice label="Register" value={register.id} options={REGISTERS.map((r) => ({ value: r.id, label: r.label }))} onChange={(v) => updateSettings({ registerId: v })} />
        </Field>
        <SwitchRow
          label="Play the key first"
          checked={playKeyFirst}
          onChange={(v) => updateSettings({ playKeyFirst: v })}
          hint="Plays the key's tonic chord, then a beat of rest, before the progression — handy for one that doesn't start on I."
        />
        <SliderField
          label="Chord length"
          value={chordSeconds}
          unit=" s"
          min={MIN_CHORD_SECONDS}
          max={MAX_CHORD_SECONDS}
          step={0.1}
          onChange={(v) => updateSettings({ chordSeconds: Math.round(v * 10) / 10 })}
          hint="How long each chord lasts before the next — shorter is faster and harder."
        />
        <Field label="Playback style" hint="Whether each chord's notes play all at once or as a quick rolled arpeggio.">
          <PillChoice label="Playback style" value={playbackStyle} options={PLAYBACK_STYLES} onChange={(v) => updateSettings({ playbackStyle: v })} />
        </Field>
        <Field label="Tone" hint="Which sound plays the chords.">
          <PillChoice label="Tone" value={toneId} options={EAR_TRAINING_TONES.map((t) => ({ value: t.id, label: t.label }))} onChange={(v) => updateSettings({ toneId: v })} />
        </Field>
        <SwitchRow
          label="Sound feedback"
          checked={soundFeedback}
          onChange={(v) => updateSettings({ soundFeedback: v })}
          hint="A click each second of the countdown, plus a click the instant a round is graded."
        />
      </SettingChip>

      <SettingChip Icon={StopwatchIcon} label="Timing" value={`${roundSeconds} s`}>
        <SliderField
          label="Max time to answer"
          value={roundSeconds}
          unit=" s"
          min={MIN_ROUND_SECONDS}
          max={MAX_ROUND_SECONDS}
          step={1}
          onChange={(v) => updateSettings({ roundSeconds: v })}
          hint="How long you have to enter and submit an answer (counting while it plays) before it's graded as typed."
        />
        <SliderField
          label="Time between rounds"
          value={advanceDelayMs / 1000}
          unit=" s"
          min={MIN_ADVANCE_DELAY_MS / 1000}
          max={MAX_ADVANCE_DELAY_MS / 1000}
          step={0.25}
          onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
          hint="How long the revealed answer stays on screen before the next progression plays."
        />
        {!drillMode && !learnMode ? (
          <SliderField
            label="Number of rounds"
            value={roundCount}
            min={MIN_ROUND_COUNT}
            max={MAX_ROUND_COUNT}
            step={1}
            onChange={(v) => updateSettings({ roundCount: v })}
            hint="How many progressions make up one session."
          />
        ) : null}
      </SettingChip>
    </>
  );

  return (
    <ToolScreen
      title="Guess the Progression"
      mode={
        !running ? (
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
              entries={weakEntries.map((e) => ({ key: e.key, label: e.progression.name, counts: e.counts }))}
              shedLabel="Shed weak progressions"
              emptyText="No struggles tracked yet — a progression you don't get fully right adds it here."
              running={running}
              onShed={() => start('weak')}
              onClear={() => {
                statsRef.current = {};
                updateSettings({ progressionStats: {} });
              }}
            />
          </SettingsBar>
        ) : null
      }
      footer={
        answering ? (
          <View>
            {/* How to write the answer, beside the keyboard, in the first round only. */}
            {progress?.index === 1 ? (
              <Text className="font-ui px-4 pb-2 text-center text-xs leading-4" style={{ color: colors.muted }}>
                {answerHowTo}
              </Text>
            ) : null}
            <ProgressionAnswerKeyboard
              mode={answerMode}
              onInsert={insertText}
              onBackspace={() => setTypedValue(typedRef.current.slice(0, -1))}
              onClear={() => setTypedValue('')}
              onGiveUp={gradeAndReveal}
              onSubmit={gradeAndReveal}
            />
          </View>
        ) : null
      }
      action={
        !answering && (!showingSummary || learnMode) ? (
          <BigButton
            label={running ? 'Stop' : learnMode ? `Start level ${learn.selected + 1}` : 'Start'}
            secondary={running}
            onPress={running ? endSession : () => start(learnMode ? 'learn' : 'normal')}
          />
        ) : null
      }
      chips={!running ? chipList : null}
    >


      {learnMode && !running ? (
        <LearningPath track="progression" progress={learn.progress} selected={learn.selected} onSelect={learn.select} onStart={() => start('learn')} />
      ) : showingSummary && summary ? (
        <ResultsPanel
          score={score}
          total={summary.results.length}
          elapsed={lastElapsedMs}
          bestMs={bestMs}
          isNewBest={isNewBest}
          grades={(['correct', 'partial', 'incorrect'] as const).map((g) => ({ grade: g, count: tally(g) }))}
          tags={summary.rounds.map((r, i) => ({
            label:
              r.progression.chords.map((_, j) => answerFor(r, j)).join(' ') +
              (summary.results[i] !== 'correct' && summary.answers[i] ? ` · you: ${summary.answers[i]}` : ''),
            grade: summary.results[i],
          }))}
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
          <QuizRing size={running ? 112 : IDLE_RING} running={running} timer={noteTimer}>
            {running ? (
              <Text className="font-ui-bold text-center text-3xl font-bold tabular-nums" style={{ color: glow ?? colors.foreground }}>
                {centerLabel}
              </Text>
            ) : (
              <IdleStatus history={history} />
            )}
          </QuizRing>
          {/* How to write the answer is in the Answer chip, and beside the keyboard in round 1. */}
          {!running && !history.length ? <IdleHint>You&apos;ll hear a few chords, then write them down.</IdleHint> : null}

          {running && round ? (
            <>
              <View className="flex-row flex-wrap justify-center gap-1.5">
                {round.progression.chords.map((_, i) => {
                  const mark = marks?.[i];
                  const token = typedTokens[i];
                  const shown = status ? answerFor(round, i) : token ? prettyToken(token, answerMode) : '?';
                  const color = status ? (mark ? GRADE_COLOR.correct : GRADE_COLOR.incorrect) : undefined;
                  return (
                    // Right / wrong tints the box; the chord that's playing gets an accent edge.
                    <View
                      key={i}
                      className="h-[60px] items-center justify-center rounded-lg px-2.5"
                      style={{
                        minWidth: 56,
                        backgroundColor: color ? withAlpha(color, 0.12) : colors.surface,
                        borderWidth: 2,
                        borderColor: playingIndex === i ? colors.accent : (color ?? 'transparent'),
                      }}
                    >
                      <Text className="font-ui-semibold text-lg font-semibold" style={{ color: color ?? (token ? colors.foreground : colors.muted) }}>
                        {shown}
                      </Text>
                      {status && !mark && token ? (
                        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                          You: {prettyToken(token, answerMode)}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
              <FeedbackLine>
                <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                  {status ? (
                    <>
                      Key of {pcLabel(round.tonicPc, accidentalStyle, 0)}
                      {round.progression.minor ? ' minor' : ''} · {round.progression.name} · next in{' '}
                    </>
                  ) : answerMode === 'chords' ? (
                    `${round.progression.chords.length} chords · starts on ${firstChordRoot(round, accidentalStyle)}`
                  ) : (
                    `${round.progression.chords.length} chords`
                  )}
                </Text>
                {status ? <CountdownLabel active={running} startedAt={noteTimer.startedAt} durationMs={noteTimer.durationMs} textClassName="font-ui text-xs tabular-nums" /> : null}
              </FeedbackLine>
              <Button label="Replay" kind="secondary" Icon={PlayIcon} onPress={() => void playProgression(round)} />
            </>
          ) : null}

          {running && progress ? (
            <View className="flex-row items-center">
              <MutedText className="tabular-nums">
                Progression {progress.index} of {progress.total} ·{' '}
              </MutedText>
              <ElapsedTimer active={running} startedAt={sessionStartedAt} />
            </View>
          ) : null}
          {/* While answering, the keyboard's at the bottom: a quiet Stop. */}
          {answering ? <TextButton label="Stop" onPress={endSession} /> : null}
        </View>
      )}

      {error ? (
        <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
          {error}
        </Text>
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

export default withScreenLoader(GuessTheProgressionScreen);
