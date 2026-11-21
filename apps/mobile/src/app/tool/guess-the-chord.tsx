import {
  CHORD_CATEGORIES,
  CHORD_QUALITIES,
  DEFAULT_ENABLED_CHORD_IDS,
  chordInputMatchesRound,
  chordQualityById,
  chordRoundForRootAndQuality,
  chordRoundParts,
  drillQueueForPool,
  formatChordParts,
  parseChordInput,
  pcLabel,
  randomChordRound,
  type ChordQuality,
  type ChordRound,
} from '@jam-practice/core/chords';
import { prettyQuality } from '@jam-practice/core/iRealPro';
import { scoreOf, type Grade } from '@jam-practice/core/noteGrade';
import { ACCIDENTAL_STYLES, type AccidentalStyle } from '@jam-practice/core/noteSpelling';
import { bumpGradeCounts, rankWeak, type GradeCounts } from '@jam-practice/core/struggleStats';
import { shuffled } from '@jam-practice/core/trainerUtils';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { ChordAnswerKeyboard } from '@/components/ChordAnswerKeyboard';
import { LearningPath } from '@/components/learning/LearningPath';
import { LevelComplete } from '@/components/learning/LevelComplete';
import { cumulativeItems, levelQueue } from '@jam-practice/core/learningPath';
import { useLearnSession } from '@/lib/useLearnSession';
import { CountdownLabel, ElapsedTimer } from '@/components/CountdownLabel';
import { ChordIcon, PlayIcon, StopwatchIcon } from '@/components/icons';
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
  toneLabel,
  LevelLabel,
  MutedText,
  Pill,
  PillChoice,
  PoolHeader,
  QuizRing,
  ResultsPanel,
  SliderField,
  StrugglesChip,
  TextButton,
  ToolScreen,
  noteGlyphs,
  useGradeColors,
} from '@/components/tool/ear';
import { BigButton } from '@/components/tool/meter';
import { Segmented } from '@/components/tool/reward';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { RegisterIcon, ToneIcon } from '@/components/tool/toolIcons';
import { DEFAULT_EAR_TRAINING_TONE_ID, EAR_TRAINING_TONES, asToneId, playNote, playNotesTogether } from '@/lib/sampledTones';
import { startTone } from '@/lib/toneGenerator';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useToolActivity } from '@/lib/toolTime';
import { useStopOnBlur } from '@/lib/useStopOnBlur';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';

/**
 * Native port of `apps/web/components/GuessTheChord.tsx` — same features, same synced settings key:
 * a chord plays (the **same recorded piano/Rhodes samples** as the site, block or rolled), and you
 * type its symbol — root, quality, optional /bass — graded by the same parser (`parseChordInput`,
 * enharmonics don't matter; `m7`/`maj7`/`dim`/`sus4`… all accepted). "Give the root" pre-fills the
 * root, "Chance of a slash chord" adds any bass note, and running out of time grades whatever's
 * typed and reveals the answer. Same session machinery as Guess the Interval: rounds or "Drill
 * every chord", Struggles + "Shed weak chords", History for identical settings.
 *
 * The mobile difference: instead of a text field (whose system keyboard would cover the round)
 * plus web's symbol keypad, answers are typed on `ChordAnswerKeyboard`, fixed to the bottom of the
 * screen, with the typed symbol previewed live in the ring. Otherwise laid out like the website's
 * (`components/tool/ear.tsx`): History / Struggles chips, the ring, Start, Practice / Learn and
 * the option chips.
 */
const MIN_ROUND_SECONDS = 5;
const MAX_ROUND_SECONDS = 45;
const DEFAULT_ROUND_SECONDS = 15;

const CHORD_NOTE_DURATION_SECONDS = 1.8;
const ARPEGGIO_GAP_MS = 90;

const MIN_ROUND_COUNT = 5;
const MAX_ROUND_COUNT = 50;
const DEFAULT_ROUND_COUNT = 12;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 2000;

const DEFAULT_SLASH_CHANCE = 35;

type PlaybackStyle = 'block' | 'arpeggio';
const PLAYBACK_STYLES: { value: PlaybackStyle; label: string }[] = [
  { value: 'block', label: 'Block (all notes at once)' },
  { value: 'arpeggio', label: 'Arpeggio (quick roll)' },
];

type Register = { id: string; label: string; lowMidi: number; highMidi: number };
const REGISTERS: Register[] = [
  { id: 'low', label: 'Low', lowMidi: 36, highMidi: 47 },
  { id: 'mid', label: 'Mid', lowMidi: 48, highMidi: 59 },
  { id: 'high', label: 'High', lowMidi: 60, highMidi: 71 },
  { id: 'wide', label: 'Wide (low to high)', lowMidi: 36, highMidi: 71 },
];
const DEFAULT_REGISTER_ID = 'mid';

type Session = {
  total: number;
  index: number;
  round: ChordRound | null;
  best: Grade | null;
  results: Grade[];
  rounds: ChordRound[];
  answers: string[];
  queue: ChordRound[];
};

type Summary = { results: Grade[]; rounds: ChordRound[]; answers: string[] };

type HistoryConfig = {
  registerId: string;
  drillMode: boolean;
  roundCount: number;
  chordIdsKey: string;
  slashChance: number;
  roundSeconds: number;
  advanceDelayMs: number;
  playbackStyle: PlaybackStyle;
};

function sameConfig(a: HistoryConfig, b: HistoryConfig): boolean {
  return (Object.keys(a) as (keyof HistoryConfig)[]).every((key) => a[key] === b[key]);
}

type HistoryEntry = { at: number; elapsedMs: number; score: number; total: number; config: HistoryConfig };

// Same key and shape as the website's, so both read and write the same synced settings.
const SETTINGS_KEY = 'jam-practice-guess-the-chord';
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
  toneId: DEFAULT_EAR_TRAINING_TONE_ID as string,
  playbackStyle: 'block' as PlaybackStyle,
  revealNotes: true,
  accidentalStyle: 'sharp' as AccidentalStyle,
  history: [] as HistoryEntry[],
};

function playClick() {
  startTone(1000, 'sine', 0.5, 0.05);
}

type WeakChord = { key: string; quality: ChordQuality; counts: GradeCounts };

function weakChordEntries(stats: Record<string, GradeCounts>): WeakChord[] {
  return rankWeak(stats)
    .map((entry) => {
      const quality = chordQualityById(entry.key);
      return quality && { key: entry.key, quality, counts: entry.counts };
    })
    .filter((e): e is WeakChord => !!e);
}

function GuessTheChordScreen() {
  const { colors } = useAppTheme();
  const GRADE_COLOR = useGradeColors();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const learnMode = settings.learnMode;
  const learn = useLearnSession('chord');

  const { roundSeconds, advanceDelayMs, soundFeedback, drillMode, slashChance, giveRoot, playbackStyle, revealNotes } = settings;
  const history = settings.history.filter((h): h is HistoryEntry => !!h && typeof h.config === 'object' && h.config !== null);
  const accidentalStyle = ACCIDENTAL_STYLES.some((s) => s.value === settings.accidentalStyle) ? settings.accidentalStyle : 'sharp';
  const toneId = asToneId(settings.toneId);
  const roundCount = Math.min(MAX_ROUND_COUNT, Math.max(MIN_ROUND_COUNT, Math.round(settings.roundCount)));
  const register = REGISTERS.find((r) => r.id === settings.registerId) ?? REGISTERS.find((r) => r.id === DEFAULT_REGISTER_ID)!;
  const pool = CHORD_QUALITIES.filter((q) => settings.chordIds.includes(q.id));

  const [round, setRound] = useState<ChordRound | null>(null);
  const [running, setRunning] = useState(false);
  useToolActivity('/guess-the-chord', running);
  // Leaving the screen stops the session (it would keep timing out questions as misses).
  useStopOnBlur(running, endSession);
  useKeepAwakeWhile(running);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  // Whether the open round was graded because its time ran out (not Submit / I don't know).
  const [timedOut, setTimedOut] = useState(false);
  const [typed, setTyped] = useState('');
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
  const sessionRef = useRef<Session | null>(null);
  const cfgRef = useRef({ advanceDelayMs, soundFeedback });
  // What's typed, readable from the session timer's closure (created once per session).
  const typedRef = useRef('');
  const skipRef = useRef<(() => void) | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
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
    const playback = playbackTimeouts.current;
    const clicks = countdownClickTimeouts.current;
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
      playback.forEach(clearTimeout);
      clicks.forEach(clearTimeout);
    };
  }, []);

  function setTypedValue(value: string) {
    setTyped(value);
    typedRef.current = value;
  }

  function bumpChordStat(qualityId: string, grade: Grade) {
    chordStatsRef.current = bumpGradeCounts(chordStatsRef.current, qualityId, grade);
    updateSettings({ chordStats: chordStatsRef.current });
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

  function playChordSound(notes: string[]) {
    clearPlayback();
    if (playbackStyleRef.current === 'arpeggio') {
      notes.forEach((n, i) => {
        playbackTimeouts.current.push(setTimeout(() => playNote(n, CHORD_NOTE_DURATION_SECONDS, toneIdRef.current), i * ARPEGGIO_GAP_MS));
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

  function scheduleAdvance(index: number) {
    if (skipTimeoutRef.current) return;
    skipTimeoutRef.current = setTimeout(() => {
      skipTimeoutRef.current = null;
      if (sessionRef.current?.index === index) skipRef.current?.();
    }, cfgRef.current.advanceDelayMs);
  }

  function lockInRound(grade: Grade) {
    const session = sessionRef.current;
    if (!session || !session.round) return;
    session.best = grade;
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

  /** Grades whatever's typed and reveals the answer — from Submit, "I don't know" (graded as
      typed, usually wrong), or the max-time timer running out. */
  function gradeAndReveal() {
    const session = sessionRef.current;
    if (!session || !session.round || session.best !== null) return;
    const parsed = parseChordInput(typedRef.current);
    const grade: Grade = parsed && chordInputMatchesRound(parsed, session.round) ? 'correct' : 'incorrect';
    session.answers.push(typedRef.current.trim());
    lockInRound(grade);
  }

  function giveUp() {
    setTypedValue('');
    gradeAndReveal();
  }

  /** `'learn'` plays a learning-path level (`levelIndex`, else the selected one): a fixed set of
      rounds over the chords unlocked so far (no slash bass), scored at the end to pass the level. */
  function start(mode: 'normal' | 'weak' | 'learn' = 'normal', levelIndex?: number) {
    const weak = mode === 'weak';
    const learnLevel = mode === 'learn' ? (levelIndex ?? learn.selected) : null;
    if (mode !== 'learn') setLastMode(mode);
    learn.clearResult();
    const weakList = weak ? weakChordEntries(chordStatsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError('No struggling chords yet — a wrong or missed answer builds this list up.');
      return;
    }
    if (learnLevel === null && !weak && pool.length === 0) {
      setError('Select at least one chord quality to practice.');
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearPlayback();

    const slashProbability = slashChance / 100;
    const drilling = weak || learnLevel !== null ? true : drillMode;
    const queue = learnLevel !== null
      ? levelQueue('chord', learnLevel).map((id) => randomChordRound(register.lowMidi, register.highMidi, [chordQualityById(id)!], 0))
      : weak
      ? shuffled(weakList.map((e) => randomChordRound(register.lowMidi, register.highMidi, [e.quality], slashProbability)))
      : drilling
        ? shuffled(drillQueueForPool(register.lowMidi, register.highMidi, pool, slashProbability))
        : [];

    sessionRef.current = { total: drilling ? queue.length : roundCount, index: 0, round: null, best: null, results: [], rounds: [], answers: [], queue };
    // eslint-disable-next-line react-hooks/purity -- only reached from a button press, never during render (same as web)
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
          bumpChordStat(session.round.quality.id, finishedGrade);
          if (drilling && learnLevel === null && finishedGrade === 'incorrect') {
            const requeued = chordRoundForRootAndQuality(register.lowMidi, register.highMidi, session.round.quality, session.round.rootPc, session.round.bassPc);
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
              registerId: register.id,
              drillMode,
              roundCount,
              chordIdsKey: pool.map((q) => q.id).sort().join(','),
              slashChance,
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
          setSummary({ results: session.results, rounds: session.rounds, answers: session.answers });
          setRound(null);
          endSession();
          return;
        }
        session.index++;
        session.best = null;
        setStatus(null);
        setProgress(drilling && learnLevel === null ? { index: session.index, total: session.index + session.queue.length } : { index: session.index, total: session.total });
      }
      const next = drilling && session ? session.queue.shift()! : randomChordRound(register.lowMidi, register.highMidi, pool, slashProbability);
      if (session) session.round = next;
      roundSeedRef.current++;
      setRoundSeed(roundSeedRef.current);
      setNoteTimer({ startedAt: Date.now(), durationMs: seconds * 1000 });
      setRound(next);
      setTimedOut(false);
      setTypedValue(giveRoot ? pcLabel(next.rootPc, accidentalStyle, roundSeedRef.current) : '');
      playChordSound(next.notes);
    };

    const onTimeUp = () => {
      if (sessionRef.current?.round && sessionRef.current.best === null) setTimedOut(true);
      gradeAndReveal();
    };
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
  const currentConfig: HistoryConfig = {
    registerId: register.id,
    drillMode,
    roundCount,
    chordIdsKey: pool.map((q) => q.id).sort().join(','),
    slashChance,
    roundSeconds,
    advanceDelayMs,
    playbackStyle,
  };
  const matchingHistory = history.filter((h) => sameConfig(h.config, currentConfig));
  const bestMs = matchingHistory.length ? Math.min(...matchingHistory.map((h) => h.elapsedMs)) : null;
  const weakEntries = weakChordEntries(settings.chordStats);

  // Roots and basses with ♯ / ♭, like everywhere else ("C♯sus", not "C#sus").
  function revealedLabel(r: ChordRound, seq: number) {
    const parts = chordRoundParts(r, accidentalStyle, seq);
    return `${noteGlyphs(parts.root)}${parts.quality}${parts.bass ? `/${noteGlyphs(parts.bass)}` : ''}`;
  }

  const revealedText = round && status ? revealedLabel(round, roundSeed) : null;
  const typedParsed = round && !status ? parseChordInput(typed) : null;
  const typedParts = typedParsed ? formatChordParts(typedParsed) : null;
  const typedPreview = typedParts ? `${noteGlyphs(typedParts.root)}${typedParts.quality}${typedParts.bass ? `/${noteGlyphs(typedParts.bass)}` : ''}` : null;
  const mainLabel = !round ? '?' : (revealedText ?? typedPreview ?? (typed ? typed : '?'));
  const glow = running && status === 'correct' ? GRADE_COLOR.correct : null;
  const answering = running && !!round && !status;
  const showingSummary = summary !== null && !running;

  // Time ran out with nothing typed past the root we gave you: say so, not "You typed C♯".
  const givenRoot = giveRoot && round ? pcLabel(round.rootPc, accidentalStyle, roundSeed) : '';
  const untouched = !typed.trim() || typed.trim() === givenRoot;
  const missLine =
    status === 'incorrect' ? (timedOut && untouched ? "Time's up" : typed.trim() ? `You typed ${typedPreviewOf(typed)}` : 'No answer') : null;

  if (!settingsReady) return <ScreenSpinner />;

  const showSide = !running && (history.length > 0 || weakEntries.length > 0);

  // The mode switch first, then History and Struggles (hidden until there's something in them, and
  // while a session runs). While answering, the keyboard is pinned at the bottom (`footer`) with a
  // quiet Stop above it; results bring their own Try again. The chips hide while a session runs.
  const chipList = (
    <>
      {!learnMode ? (
        <SettingChip Icon={ChordIcon} label="Chords" value={`${pool.length} of ${CHORD_QUALITIES.length}`}>
          <PoolHeader
            count={pool.length}
            total={CHORD_QUALITIES.length}
            onAll={() => updateSettings({ chordIds: CHORD_QUALITIES.map((q) => q.id) })}
            onNone={() => updateSettings({ chordIds: [] })}
            hint="Which chord qualities can be picked for a round. At least one must stay selected."
          />
          {CHORD_CATEGORIES.map((category) => (
            <View key={category} className="gap-1.5">
              <GroupLabel>{category}</GroupLabel>
              <View className="flex-row flex-wrap gap-1.5">
                {CHORD_QUALITIES.filter((q) => q.category === category).map((quality) => {
                  const selected = settings.chordIds.includes(quality.id);
                  return (
                    <Pill
                      key={quality.id}
                      on={selected}
                      label={`C${prettyQuality(quality.suffix)}`}
                      accessibilityLabel={quality.name}
                      onPress={() =>
                        updateSettings({ chordIds: selected ? settings.chordIds.filter((x) => x !== quality.id) : [...settings.chordIds, quality.id] })
                      }
                    />
                  );
                })}
              </View>
            </View>
          ))}
          <SliderField
            label="Chance of a slash (bass note) chord"
            value={slashChance}
            unit="%"
            min={0}
            max={100}
            step={5}
            onChange={(v) => updateSettings({ slashChance: v })}
            hint="How often a round adds a bass note that isn't the root — anywhere from a normal inversion to a genuinely weird, unrelated bass note."
          />
          <SwitchRow
            label="Give the root"
            checked={giveRoot}
            onChange={(v) => updateSettings({ giveRoot: v })}
            hint="Pre-fills the answer with the chord's root, so it's about the quality and slash bass. Off makes the whole chord — root included — something you have to work out."
          />
          <SwitchRow
            label="Drill every chord"
            checked={drillMode}
            onChange={(v) => updateSettings({ drillMode: v })}
            hint="Plays every selected chord quality, starting on all 12 keys, each in a random octave (with an independent chance of a slash bass each time)."
          />
        </SettingChip>
      ) : null}

      <SettingChip Icon={RegisterIcon} label="Register" value={register.label}>
        <Field label="Register" hint="Which octave range the chord's root is drawn from — just where it sits for listening.">
          <PillChoice label="Register" value={register.id} options={REGISTERS.map((r) => ({ value: r.id, label: r.label }))} onChange={(v) => updateSettings({ registerId: v })} />
        </Field>
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
          hint="How long you have to enter and submit an answer before it's graded as typed."
        />
        <SliderField
          label="Time between rounds"
          value={advanceDelayMs / 1000}
          unit=" s"
          min={MIN_ADVANCE_DELAY_MS / 1000}
          max={MAX_ADVANCE_DELAY_MS / 1000}
          step={0.25}
          onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
          hint="How long the revealed answer (with its countdown ring) stays on screen before the next chord plays."
        />
        {!drillMode && !learnMode ? (
          <SliderField
            label="Number of rounds"
            value={roundCount}
            min={MIN_ROUND_COUNT}
            max={MAX_ROUND_COUNT}
            step={1}
            onChange={(v) => updateSettings({ roundCount: v })}
            hint="How many chords make up one session."
          />
        ) : null}
      </SettingChip>

      <SettingChip
        Icon={ToneIcon}
        label="Sound"
        title="Sound & display"
        value={`${toneLabel(toneId)} · ${PLAYBACK_STYLES.find((p) => p.value === playbackStyle)?.label.split(' (')[0] ?? ''}`}
      >
        <Field label="Playback style" hint="Whether the chord's notes play all at once or as a quick rolled arpeggio.">
          <PillChoice label="Playback style" value={playbackStyle} options={PLAYBACK_STYLES} onChange={(v) => updateSettings({ playbackStyle: v })} />
        </Field>
        <Field label="Tone" hint="Which sound plays the chord.">
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
          hint="Shows the actual notes that were played once a round is graded."
        />
        <Field label="Accidentals" hint="How sharps and flats are spelled in the revealed answer, e.g. C# vs Db.">
          <PillChoice label="Accidentals" value={accidentalStyle} options={ACCIDENTAL_STYLES} onChange={(v) => updateSettings({ accidentalStyle: v })} />
        </Field>
      </SettingChip>
    </>
  );

  return (
    <ToolScreen
      title="Guess the Chord"
      // The Learn path scrolls by itself in the space it's given.
      scroll={!(learnMode && !running)}
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
              entries={weakEntries.map((e) => ({ key: e.key, label: e.quality.name, counts: e.counts }))}
              shedLabel="Shed weak chords"
              emptyText="No struggles tracked yet — a wrong answer adds it here."
              running={running}
              onShed={() => start('weak')}
              onClear={() => {
                chordStatsRef.current = {};
                updateSettings({ chordStats: {} });
              }}
            />
          </SettingsBar>
        ) : null
      }
      footer={
        answering ? (
          <View>
            {/* How to type a symbol, beside the keyboard, in the first round only. */}
            {progress?.index === 1 ? (
              <Text className="font-ui px-4 pb-2 text-center text-xs leading-4" style={{ color: colors.muted }}>
                Root, quality, then an optional /bass: F♯Δ7, A♭-7/D.
              </Text>
            ) : null}
            <ChordAnswerKeyboard
              onInsert={(t) => setTypedValue(typedRef.current + t)}
              onBackspace={() => setTypedValue(typedRef.current.slice(0, -1))}
              onClear={() => setTypedValue('')}
              onGiveUp={giveUp}
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
        <LearningPath track="chord" progress={learn.progress} selected={learn.selected} onSelect={learn.select} onStart={() => start('learn')} />
      ) : showingSummary && summary ? (
        <ResultsPanel
          score={score}
          total={summary.results.length}
          elapsed={lastElapsedMs}
          bestMs={bestMs}
          isNewBest={isNewBest}
          grades={(['correct', 'incorrect'] as const).map((g) => ({ grade: g, count: tally(g) }))}
          tags={summary.rounds.map((r, i) => ({
            label:
              summary.results[i] === 'incorrect' && summary.answers[i] ? `${revealedLabel(r, i)} · you: ${summary.answers[i]}` : revealedLabel(r, i),
            grade: summary.results[i],
          }))}
          onAgain={() => start(lastMode)}
          onClose={() => setSummary(null)}
        />
      ) : (
        <View className="w-full items-center gap-3">
          {activeLevel !== null && running ? (
            <LevelLabel>
              Level {activeLevel + 1} · {learn.levels[activeLevel].title} · {cumulativeItems('chord', activeLevel).length} chords in play
            </LevelLabel>
          ) : null}
          <QuizRing size={running ? 144 : IDLE_RING} running={running} timer={noteTimer}>
            {running ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.4}
                className="font-ui-bold text-center text-4xl font-bold"
                style={{ color: glow ?? (answering && typedPreview ? colors.accent : colors.foreground) }}
              >
                {mainLabel}
              </Text>
            ) : (
              <IdleStatus history={history} />
            )}
          </QuizRing>
          {!running && !history.length ? <IdleHint>You&apos;ll hear a chord, then type its symbol.</IdleHint> : null}

          {running && round ? (
            <>
              <View className="items-center">
                <FeedbackLine>
                  {missLine ? (
                    <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: GRADE_COLOR.incorrect }}>
                      {missLine}
                    </Text>
                  ) : null}
                </FeedbackLine>
                <FeedbackLine>
                  {revealNotes && status ? <MutedText className="tabular-nums">{noteGlyphs(round.notes.join(' · '))}</MutedText> : null}
                </FeedbackLine>
              </View>
              <Button label="Replay" kind="secondary" Icon={PlayIcon} onPress={() => playChordSound(round.notes)} />
              <View className="min-h-6 items-center justify-center">
                {status ? (
                  <View className="flex-row items-center">
                    <MutedText>Next chord in </MutedText>
                    <CountdownLabel active={running} startedAt={noteTimer.startedAt} durationMs={noteTimer.durationMs} />
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {running && progress ? (
            <View className="flex-row items-center">
              <MutedText className="tabular-nums">
                Chord {progress.index} of {progress.total} ·{' '}
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

/** What was typed, formatted like a chord symbol when it reads as one ("you typed F♯Δ7"). */
function typedPreviewOf(text: string): string {
  const parsed = parseChordInput(text);
  const parts = parsed ? formatChordParts(parsed) : null;
  return parts ? `${noteGlyphs(parts.root)}${parts.quality}${parts.bass ? `/${noteGlyphs(parts.bass)}` : ''}` : text.trim();
}

export default withScreenLoader(GuessTheChordScreen);
