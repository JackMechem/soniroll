import { prettyQuality } from '@jam-practice/core/iRealPro';
import { describePitch, frequencyToMidi, gradePitch, scoreOf, type Grade } from '@jam-practice/core/noteGrade';
import {
  DEFAULT_ROOTLESS_TYPE_IDS,
  REGISTERS,
  ROOTLESS_CATEGORIES,
  ROOTLESS_TYPES,
  ROOT_NAMES,
  VOICING_SHAPES,
  bottomDegree,
  buildRound,
  correctRoots,
  degreeLabel,
  describeVoicing,
  midiName,
  prettyNote,
  randomRound,
  rootlessTypeById,
  targetSymbol,
  voicingNoteNames,
  voicingSymbol,
  type RootlessRound,
  type RootlessType,
  type VoicingShape,
} from '@jam-practice/core/rootlessVoicings';
import { bumpGradeCounts, rankWeak, type GradeCounts } from '@jam-practice/core/struggleStats';
import { shuffled } from '@jam-practice/core/trainerUtils';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { ElapsedTimer } from '@/components/CountdownLabel';
import { ChoiceList, PoolButton, PoolCount, RunHistoryChip, RunResults, formatScore, type RunEntry } from '@/components/findTheRoot/parts';
import { RootKeys } from '@/components/findTheRoot/RootKeys';
import { ChordIcon, MicrophoneIcon, NoteIcon, PlayIcon, SlidersIcon, StopwatchIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SwitchRow } from '@/components/SwitchRow';
import {
  Field,
  GroupLabel,
  IdleHint,
  IdleMark,
  MutedText,
  OptionsArea,
  Pill,
  PillChoice,
  SheetButton,
  SheetDivider,
  SliderField,
  StrugglesChip,
  ToolScreen,
  useGradeColors,
} from '@/components/tool/ear';
import { BigButton } from '@/components/tool/meter';
import { Segmented } from '@/components/tool/reward';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { SENSITIVITY, startAudioInput, type AudioInput } from '@/lib/audioInput';
import { DEFAULT_EAR_TRAINING_TONE_ID, EAR_TRAINING_TONES, asToneId, playNotesTogether } from '@/lib/sampledTones';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * Native port of `apps/web/components/FindTheRoot.tsx`: a rootless voicing plays (E♭ G B♭ D) and you
 * find the root that makes it the chord asked for (C for a C minor 9), by singing or playing it into
 * the mic (Sing or play) or tapping it on a little piano (Pick). The theory is the website's own
 * module (`@jam-practice/core/rootlessVoicings`), and the settings are the same synced key and
 * fields, so chords, roots, history and struggles follow you between the two.
 *
 * Laid out like the website's tool page: History / Struggles chips once there's something in them,
 * the ring (the chord appears in it once answered), the question and what was heard, the keys in
 * Pick mode, Start, then the Sing or play / Pick switch and the Chords, Roots, Voicing, Rounds and
 * Microphone chips (hidden while a run goes, like the website's).
 *
 * Left out from the website: the input picker and mic test (the phone has one mic, as in the Note
 * Trainer), the mic level bar (the phone's input is gain-normalised, so its level says little; the
 * "Heard …" line shows the mic is working), presets, Shed Log time and the keyboard shortcuts.
 */

/** How long the voicing rings. */
const CHORD_SECONDS = 2.2;
/** In sing mode, how long after the chord stops before the mic counts, so its tail isn't heard as
    an answer. */
const AFTER_CHORD_MS = 250;
/** How often a pitch reading arrives on the phone (`lib/audioInput.ts`'s analysis interval, not the
    website's 30 ms), so the hold time means the same thing. */
const FRAME_MS = 50;

const MIN_ROUNDS = 5;
const MAX_ROUNDS = 40;

/** Clock reads, only from handlers and the mic callback (never during render); kept out here so
    the React Compiler's purity check doesn't flag them, as on the website. */
const nowMs = () => Date.now();

type AnswerMode = 'sing' | 'pick';

const NEXT_OPTIONS = [
  { value: 0, label: 'When I press Next' },
  { value: 2000, label: 'After 2 s' },
  { value: 4000, label: 'After 4 s' },
  { value: 6000, label: 'After 6 s' },
];

const SHAPE_SHORT: Record<VoicingShape, string> = { stacked: 'Root position', inversions: 'Any inversion', ab: 'A and B' };

type Session = {
  total: number;
  /** 1-based number of the round on screen. */
  index: number;
  round: RootlessRound | null;
  /** Set once the round is answered (or given up). */
  grade: Grade | null;
  /** A wrong note was sung or picked before the right one. */
  wrong: boolean;
  results: Grade[];
  rounds: RootlessRound[];
  /** A "Shed weak chords" run plays through this instead of random rounds. */
  queue: RootlessRound[] | null;
  /** Mic frames before this time are ignored: the chord is still sounding. */
  listenFrom: number;
  stable: number;
  last: number | null;
};

type Summary = { results: Grade[]; rounds: RootlessRound[] };

// Same key and fields as the website's (`inputDeviceId` is left to the website: no picker here).
const SETTINGS_KEY = 'jam-practice-find-the-root';
const DEFAULT_SETTINGS = {
  answerMode: 'sing' as AnswerMode,
  typeIds: DEFAULT_ROOTLESS_TYPE_IDS as string[],
  /** Pitch classes 0–11; empty means all 12. */
  roots: [] as number[],
  registerId: 'mid',
  shape: 'stacked' as VoicingShape,
  showVoicingName: true,
  toneId: DEFAULT_EAR_TRAINING_TONE_ID as string,
  roundCount: 10,
  /** 0: wait for Next. */
  advanceDelayMs: 0,
  partialCredit: true,
  listenWhilePlaying: false,
  toleranceCents: 50,
  holdMs: 210,
  sensitivity: 'normal',
  typeStats: {} as Record<string, GradeCounts>,
  history: [] as RunEntry[],
};

/** "C" + "-9" → "C-9", drawn the Chord Charts way (Δ, ø, °, ♭, ♯). */
function chordLabel(symbol: { root: string; suffix: string }) {
  return `${prettyNote(symbol.root)}${prettyQuality(symbol.suffix)}`;
}

type WeakType = { key: string; type: RootlessType; counts: GradeCounts };

function weakTypes(stats: Record<string, GradeCounts>): WeakType[] {
  return rankWeak(stats)
    .map((e) => {
      const type = rootlessTypeById(e.key);
      return type && { key: e.key, type, counts: e.counts };
    })
    .filter((e): e is WeakType => !!e);
}

function FindTheRootScreen() {
  const { colors } = useAppTheme();
  const GRADE_COLOR = useGradeColors();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const answerMode: AnswerMode = settings.answerMode === 'pick' ? 'pick' : 'sing';
  const shape: VoicingShape = VOICING_SHAPES.some((s) => s.value === settings.shape) ? settings.shape : 'stacked';
  const register = REGISTERS.find((r) => r.id === settings.registerId) ?? REGISTERS[1];
  const toneId = asToneId(settings.toneId);
  const sensitivity = settings.sensitivity in SENSITIVITY ? settings.sensitivity : 'normal';
  const roundCount = Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(settings.roundCount)));
  const chosenTypes = ROOTLESS_TYPES.filter((t) => settings.typeIds.includes(t.id));
  // An empty pool means all of them, like the other trainers' pills.
  const pool = chosenTypes.length ? chosenTypes : ROOTLESS_TYPES;
  const roots = settings.roots.filter((r) => Number.isInteger(r) && r >= 0 && r < 12);
  const history = settings.history.filter((h): h is RunEntry => !!h && typeof h.score === 'number' && typeof h.total === 'number');
  const { showVoicingName, partialCredit, listenWhilePlaying, toleranceCents, holdMs } = settings;
  const advanceDelayMs = [0, 2000, 4000, 6000].includes(settings.advanceDelayMs) ? settings.advanceDelayMs : 0;

  const [running, setRunning] = useState(false);
  const [round, setRound] = useState<RootlessRound | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [wrongPicks, setWrongPicks] = useState<number[]>([]);
  /** In Pick mode, the key that answered the round (with 7♭9 any of its four roots counts). */
  const [rightPick, setRightPick] = useState<number | null>(null);
  const [heard, setHeard] = useState<{ text: string; wrong: boolean } | null>(null);
  const [chordSounding, setChordSounding] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number; score: number; done: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastMode, setLastMode] = useState<'normal' | 'weak'>('normal');
  const [error, setError] = useState<string | null>(null);
  /** The last Start failed because the mic couldn't open: the error gets a "Switch to Pick". */
  const [micFailed, setMicFailed] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const inputRef = useRef<AudioInput | null>(null);
  const mountedRef = useRef(true);
  const nextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The source of truth for the struggle stats while a run goes (several bumps can land before the
  // settings come back round through a render).
  const statsRef = useRef(settings.typeStats);
  const cfgRef = useRef({
    answerMode,
    toneId,
    partialCredit,
    listenWhilePlaying,
    toleranceCents,
    holdFrames: Math.max(1, Math.round(holdMs / FRAME_MS)),
    silenceRms: SENSITIVITY[sensitivity].rms,
    advanceDelayMs,
  });

  useEffect(() => {
    cfgRef.current = {
      answerMode,
      toneId,
      partialCredit,
      listenWhilePlaying,
      toleranceCents,
      holdFrames: Math.max(1, Math.round(holdMs / FRAME_MS)),
      silenceRms: SENSITIVITY[sensitivity].rms,
      advanceDelayMs,
    };
  }, [answerMode, toneId, partialCredit, listenWhilePlaying, toleranceCents, holdMs, sensitivity, advanceDelayMs]);

  useEffect(() => {
    statsRef.current = settings.typeStats;
  }, [settings.typeStats]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (nextTimeoutRef.current) clearTimeout(nextTimeoutRef.current);
      if (soundingTimeoutRef.current) clearTimeout(soundingTimeoutRef.current);
      inputRef.current?.stop();
    };
  }, []);

  function toggleType(id: string) {
    updateSettings({
      typeIds: settings.typeIds.includes(id) ? settings.typeIds.filter((x) => x !== id) : [...settings.typeIds, id],
    });
  }

  function toggleRoot(pc: number) {
    updateSettings({ roots: roots.includes(pc) ? roots.filter((r) => r !== pc) : [...roots, pc].sort((a, b) => a - b) });
  }

  function bumpStat(typeId: string, grade: Grade) {
    statsRef.current = bumpGradeCounts(statsRef.current, typeId, grade);
    updateSettings({ typeStats: statsRef.current });
  }

  /** Plays the voicing (with its root under it on the reveal). In sing mode the mic waits until it
      has finished, unless "Listen while it plays" is on. */
  async function playRound(r: RootlessRound, withRoot: boolean) {
    const notes = [...(withRoot ? [r.rootMidi] : []), ...r.midis].map(midiName);
    const session = sessionRef.current;
    const gate = !withRoot && session?.round === r && !cfgRef.current.listenWhilePlaying;
    if (gate && session) session.listenFrom = Infinity;
    if (soundingTimeoutRef.current) clearTimeout(soundingTimeoutRef.current);
    setChordSounding(gate);
    await playNotesTogether(notes, CHORD_SECONDS, cfgRef.current.toneId);
    if (!gate || sessionRef.current !== session || session?.round !== r) return;
    const waitMs = CHORD_SECONDS * 1000 + AFTER_CHORD_MS;
    session.listenFrom = nowMs() + waitMs;
    soundingTimeoutRef.current = setTimeout(() => {
      soundingTimeoutRef.current = null;
      if (mountedRef.current) setChordSounding(false);
    }, waitMs);
  }

  function endSession() {
    if (nextTimeoutRef.current) clearTimeout(nextTimeoutRef.current);
    nextTimeoutRef.current = null;
    if (soundingTimeoutRef.current) clearTimeout(soundingTimeoutRef.current);
    soundingTimeoutRef.current = null;
    inputRef.current?.stop();
    inputRef.current = null;
    sessionRef.current = null;
    setRunning(false);
    setRound(null);
    setStatus(null);
    setHeard(null);
    setWrongPicks([]);
    setRightPick(null);
    setChordSounding(false);
    setProgress(null);
    setSessionStartedAt(null);
  }

  function updateProgress(session: Session) {
    setProgress({ index: session.index, total: session.total, score: scoreOf(session.results), done: session.results.length });
  }

  /** Locks in the round: records it, reveals the chord and plays it with its root. */
  function finishRound(grade: Grade) {
    const session = sessionRef.current;
    if (!session || !session.round || session.grade) return;
    session.grade = grade;
    session.results.push(grade);
    session.rounds.push(session.round);
    bumpStat(session.round.type.id, grade);
    setStatus(grade);
    setChordSounding(false);
    updateProgress(session);
    void playRound(session.round, true);
    const delay = cfgRef.current.advanceDelayMs;
    if (delay > 0) {
      const index = session.index;
      nextTimeoutRef.current = setTimeout(() => {
        nextTimeoutRef.current = null;
        if (sessionRef.current === session && session.index === index) next();
      }, delay);
    }
  }

  function isLastRound(session: Session) {
    return session.queue ? session.queue.length === 0 : session.index >= session.total;
  }

  function finishSession() {
    const session = sessionRef.current;
    if (!session) return;
    const elapsedMs = sessionStartRef.current !== null ? nowMs() - sessionStartRef.current : 0;
    sessionStartRef.current = null;
    if (!session.queue && session.results.length) {
      const entry: RunEntry = {
        at: nowMs(),
        elapsedMs,
        score: scoreOf(session.results),
        total: session.results.length,
        mode: cfgRef.current.answerMode,
      };
      updateSettings({ history: [...history, entry].slice(-50) });
    }
    setSummary({ results: session.results, rounds: session.rounds });
    endSession();
  }

  /** Moves on: the next round, or the results after the last one. */
  function next() {
    const session = sessionRef.current;
    if (!session || !session.grade) return;
    if (nextTimeoutRef.current) clearTimeout(nextTimeoutRef.current);
    nextTimeoutRef.current = null;
    if (isLastRound(session)) {
      finishSession();
      return;
    }
    session.index++;
    startRound(session, session.queue ? session.queue.shift()! : newRound());
  }

  function newRound() {
    return randomRound(pool, roots, shape, register.lowMidi);
  }

  function startRound(session: Session, r: RootlessRound) {
    session.round = r;
    session.grade = null;
    session.wrong = false;
    session.stable = 0;
    session.last = null;
    session.listenFrom = 0;
    setRound(r);
    setStatus(null);
    setWrongPicks([]);
    setRightPick(null);
    setHeard(null);
    updateProgress(session);
    void playRound(r, false);
  }

  async function start(mode: 'normal' | 'weak' = 'normal') {
    setLastMode(mode);
    const weak = mode === 'weak' ? weakTypes(statsRef.current) : [];
    if (mode === 'weak' && weak.length === 0) {
      setError('No struggles yet. A wrong or missed answer adds the chord here.');
      return;
    }
    setError(null);
    setMicFailed(false);
    setSummary(null);
    endSession();

    if (answerMode === 'sing') {
      try {
        const input = await startAudioInput((frame) => handleFrame(frame.freq), () => cfgRef.current.silenceRms);
        if (!mountedRef.current) {
          input.stop();
          return;
        }
        inputRef.current = input;
      } catch {
        setError("Couldn't open the mic. Check that microphone access is allowed, or switch to Pick.");
        setMicFailed(true);
        return;
      }
    }

    // A weak run: one round per struggling chord, on a random root from the pool.
    const queue =
      mode === 'weak'
        ? shuffled(
            weak.map((w) => {
              const pcs = roots.length ? roots : Array.from({ length: 12 }, (_, i) => i);
              const rootPc = pcs[Math.floor(Math.random() * pcs.length)];
              return buildRound(w.type, rootPc, bottomDegree(w.type, shape, Math.random()), register.lowMidi, shape);
            }),
          )
        : null;
    const session: Session = {
      total: queue ? queue.length : roundCount,
      index: 1,
      round: null,
      grade: null,
      wrong: false,
      results: [],
      rounds: [],
      queue,
      listenFrom: 0,
      stable: 0,
      last: null,
    };
    sessionRef.current = session;
    sessionStartRef.current = nowMs();
    setSessionStartedAt(sessionStartRef.current);
    setRunning(true);
    startRound(session, queue ? queue.shift()! : newRound());
  }

  /** On every pitch reading in sing mode: what the mic hears. */
  function handleFrame(freq: number | null) {
    const session = sessionRef.current;
    if (!session || !session.round || session.grade) return;
    if (nowMs() < session.listenFrom) return;
    if (freq === null) {
      session.stable = 0;
      session.last = null;
      setHeard(null);
      return;
    }
    const cfg = cfgRef.current;
    const nearest = Math.round(frequencyToMidi(freq));
    const pc = ((nearest % 12) + 12) % 12;
    const { cents } = describePitch(freq);
    if (nearest === session.last) session.stable++;
    else {
      session.last = nearest;
      session.stable = 1;
    }
    if (session.stable < cfg.holdFrames) return;
    const right = correctRoots(session.round.type, session.round.rootPc).some(
      (rootPc) => gradePitch(freq, midiName(60 + rootPc), { ignoreOctave: true, toleranceCents: cfg.toleranceCents }) === 'correct',
    );
    const text = `${prettyNote(ROOT_NAMES[pc])} (${cents > 0 ? '+' : ''}${cents}¢)`;
    // Unchanged while the same note is held: keep the old state so the screen doesn't re-render.
    setHeard((prev) => (prev && prev.text === text && prev.wrong === !right ? prev : { text, wrong: !right }));
    if (right) finishRound(session.wrong && cfg.partialCredit ? 'partial' : 'correct');
    else session.wrong = true;
  }

  function pick(pc: number) {
    const session = sessionRef.current;
    if (!session || !session.round || session.grade) return;
    if (correctRoots(session.round.type, session.round.rootPc).includes(pc)) {
      setRightPick(pc);
      finishRound(session.wrong && cfgRef.current.partialCredit ? 'partial' : 'correct');
    } else {
      session.wrong = true;
      setWrongPicks((w) => (w.includes(pc) ? w : [...w, pc]));
    }
  }

  function stop() {
    sessionStartRef.current = null;
    endSession();
  }

  // ------------------------------------------------------------------ what's shown

  if (!settingsReady) return <ScreenSpinner />;

  const weakEntries = weakTypes(settings.typeStats);
  const target = round ? targetSymbol(round) : null;
  const voicing = round ? voicingSymbol(round) : null;
  const rightRoots = round ? correctRoots(round.type, round.rootPc) : [];
  const otherRoots = round ? rightRoots.filter((pc) => pc !== round.rootPc).map((pc) => prettyNote(ROOT_NAMES[pc])) : [];
  const glow = status ? GRADE_COLOR[status] : null;
  const lastRound = progress ? progress.index >= progress.total : false;
  const showingSummary = summary !== null && !running;
  const showSide = !running && (history.length > 0 || weakEntries.length > 0);
  const keyState = (pc: number): 'right' | 'wrong' | null =>
    status && rightRoots.includes(pc) ? 'right' : wrongPicks.includes(pc) ? 'wrong' : null;
  // Once answered, the root's key is written the way the answer is (G♯ for G♯-7, not A♭).
  const keyLabel = (pc: number): string | undefined => (status && round && target && pc === round.rootPc ? prettyNote(target.root) : undefined);

  const typeCount = chosenTypes.length || ROOTLESS_TYPES.length;
  const rootsText = roots.length ? `${roots.length} of 12` : 'All 12';

  return (
    <ToolScreen title="Find the Root">
      {/* Hidden until there's something in them, and while a run goes. */}
      {showSide ? (
        <SettingsBar>
          <RunHistoryChip entries={history} running={running} onClear={() => updateSettings({ history: [] })} />
          <StrugglesChip
            entries={weakEntries.map((e) => ({ key: e.key, label: e.type.name, counts: e.counts }))}
            shedLabel="Shed weak chords"
            emptyText="No struggles yet. A wrong or missed answer adds the chord here."
            running={running}
            onShed={() => void start('weak')}
            onClear={() => {
              statsRef.current = {};
              updateSettings({ typeStats: {} });
            }}
          />
        </SettingsBar>
      ) : null}

      {showingSummary && summary ? (
        <RunResults
          score={scoreOf(summary.results)}
          grades={summary.results}
          rows={summary.rounds.map((r) => {
            const v = voicingSymbol(r);
            return { chord: chordLabel(targetSymbol(r)), detail: `${v ? `${chordLabel(v)} · ` : ''}${voicingNoteNames(r).map(prettyNote).join(' ')}` };
          })}
          onAgain={() => void start(lastMode)}
          onClose={() => setSummary(null)}
        />
      ) : (
        <View className="w-full items-center gap-3">
          <View
            className="h-[168px] w-[168px] items-center justify-center rounded-full px-4"
            style={{ borderWidth: 3, borderColor: glow ?? withAlpha(colors.foreground, 0.1) }}
          >
            {!round ? (
              <IdleMark />
            ) : (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.4}
                className="font-ui-bold text-center text-5xl font-bold"
                style={{ color: glow ?? colors.foreground }}
              >
                {status && target ? chordLabel(target) : '?'}
              </Text>
            )}
          </View>

          {/* Before the first round, say what's about to happen (like the other ear trainers). */}
          {!round && !running ? (
            <IdleHint>
              {answerMode === 'sing' ? 'Press Start, listen to the chord, then sing or play its root.' : 'Press Start, listen to the chord, then pick its root.'}
            </IdleHint>
          ) : null}

          {round ? (
            <View className="items-center gap-1">
              <Text className="font-ui text-center text-lg" style={{ color: colors.foreground }}>
                Which root makes it{' '}
                <Text className="font-ui-semibold font-semibold" style={{ color: colors.foreground }}>
                  {round.type.ask}
                </Text>
                ?
              </Text>
              {voicing && (showVoicingName || status) ? (
                <MutedText>
                  On its own it&apos;s{' '}
                  <Text className="font-ui-semibold font-semibold" style={{ color: colors.foreground }}>
                    {chordLabel(voicing)}
                  </Text>
                  {/* A starts on the 3rd and B on the 7th, so it's a clue: only after answering. */}
                  {round.ab && status ? ` · ${round.ab} voicing` : ''}
                </MutedText>
              ) : null}
              {!voicing && status && round.ab ? <MutedText>{round.ab} voicing</MutedText> : null}
              {status && target ? (
                <>
                  <MutedText>
                    <Text className="font-ui-semibold font-semibold" style={{ color: GRADE_COLOR.correct }}>
                      {prettyNote(target.root)}
                    </Text>{' '}
                    under {voicingNoteNames(round).map(prettyNote).join(' ')}{' '}
                    <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                      ({round.order.map(degreeLabel).join(' ')})
                    </Text>
                  </MutedText>
                  {otherRoots.length > 0 ? (
                    <MutedText className="text-xs">It&apos;s a diminished 7th, so {otherRoots.join(', ')} work too.</MutedText>
                  ) : null}
                  <Text className="font-ui-semibold text-center text-sm font-semibold" style={{ color: GRADE_COLOR[status] }}>
                    {status === 'incorrect'
                      ? 'Not this time'
                      : `Yes, ${prettyNote(rightPick === null || rightPick === round.rootPc ? target.root : ROOT_NAMES[rightPick])}${status === 'partial' ? ' · half credit' : ''}`}
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}

          {running && round && !status ? (
            <View className="h-5 items-center justify-center">
              {answerMode === 'sing' ? (
                <Text
                  numberOfLines={1}
                  className="font-ui text-center text-sm tabular-nums"
                  style={{ color: heard?.wrong && !chordSounding ? GRADE_COLOR.incorrect : colors.muted }}
                >
                  {chordSounding
                    ? 'Listening after the chord…'
                    : heard
                      ? heard.wrong
                        ? `Heard ${heard.text}, not it`
                        : `Heard ${heard.text}`
                      : 'Sing or play the root…'}
                </Text>
              ) : (
                <Text className="font-ui text-center text-sm" style={{ color: wrongPicks.length ? GRADE_COLOR.incorrect : colors.muted }}>
                  {wrongPicks.length ? `Not ${prettyNote(ROOT_NAMES[wrongPicks[wrongPicks.length - 1]])}. Try again.` : 'Pick the root…'}
                </Text>
              )}
            </View>
          ) : null}

          {running && round && answerMode === 'pick' ? <RootKeys keyState={keyState} keyLabel={keyLabel} disabled={!!status} onPick={pick} /> : null}

          {running && round ? (
            <View className="flex-row flex-wrap justify-center gap-2">
              <Button label={status ? 'Play it with the root' : 'Replay'} kind="secondary" Icon={PlayIcon} onPress={() => void playRound(round, !!status)} />
              {!status ? (
                <Button label="I give up" kind="secondary" onPress={() => finishRound('incorrect')} />
              ) : (
                <Button label={lastRound ? 'See results' : 'Next'} onPress={next} />
              )}
            </View>
          ) : null}

          {running && progress ? (
            <View className="flex-row items-center">
              <MutedText className="tabular-nums">
                Round {progress.index} of {progress.total} ·{' '}
                {/* No score until a round has finished ("Score 0 of 0" read as broken). */}
                {progress.done > 0 ? `Score ${formatScore(progress.score)} of ${progress.done} · ` : ''}
              </MutedText>
              <ElapsedTimer active={running} startedAt={sessionStartedAt} />
            </View>
          ) : null}
        </View>
      )}

      {error ? (
        <View className="items-center gap-2">
          <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
          {micFailed && answerMode === 'sing' ? (
            <Button
              label="Switch to Pick"
              kind="secondary"
              onPress={() => {
                updateSettings({ answerMode: 'pick' });
                setError(null);
                setMicFailed(false);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {/* While the results show, their own "Try again" is the one start button. */}
      {!showingSummary ? <BigButton label={running ? 'Stop' : 'Start'} secondary={running} onPress={running ? stop : () => void start()} /> : null}

      {/* Hidden while a run goes, so the round has the screen to itself. */}
      {!running ? (
        <OptionsArea
          mode={
            <Segmented
              onPage
              label="Answer by"
              value={answerMode}
              onChange={(v) => updateSettings({ answerMode: v })}
              options={[
                { value: 'sing', label: 'Sing or play' },
                { value: 'pick', label: 'Pick' },
              ]}
            />
          }
        >
          <SettingChip Icon={ChordIcon} label="Chords" value={`${typeCount} of ${ROOTLESS_TYPES.length}`}>
            <PoolCount
              text={`${typeCount} of ${ROOTLESS_TYPES.length} in play`}
              hint="Which chords you can be asked to make. With none picked, all of them can come up. A triad or four-note chord on top is what the voicing makes on its own: a minor 7 without its root is a major triad on the ♭3, a minor 9 a major 7 on the ♭3. The left-hand ones have no name of their own."
            >
              <PoolButton label="All" onPress={() => updateSettings({ typeIds: ROOTLESS_TYPES.map((t) => t.id) })} />
              <PoolButton label="Reset" onPress={() => updateSettings({ typeIds: [...DEFAULT_ROOTLESS_TYPE_IDS] })} />
            </PoolCount>
            {ROOTLESS_CATEGORIES.map((category) => (
              <View key={category} className="gap-1.5">
                <GroupLabel>{category}</GroupLabel>
                <View className="flex-row flex-wrap gap-1.5">
                  {ROOTLESS_TYPES.filter((t) => t.category === category).map((type) => (
                    <Pill
                      key={type.id}
                      on={settings.typeIds.includes(type.id)}
                      label={type.name}
                      accessibilityLabel={`${type.name}: ${describeVoicing(type).toLowerCase()}`}
                      onPress={() => toggleType(type.id)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </SettingChip>

          <SettingChip Icon={NoteIcon} label="Roots" value={rootsText}>
            <PoolCount text={rootsText} hint="Which roots can come up. With none picked, all 12 can.">
              {roots.length > 0 ? <PoolButton label="All" onPress={() => updateSettings({ roots: [] })} /> : null}
            </PoolCount>
            <View className="flex-row flex-wrap gap-1.5">
              {ROOT_NAMES.map((name, pc) => (
                <Pill key={name} on={roots.includes(pc)} label={prettyNote(name)} onPress={() => toggleRoot(pc)} />
              ))}
            </View>
            <Field label="Register" hint="Where the voicing's lowest note sits.">
              <ChoiceList
                label="Register"
                value={register.id}
                options={REGISTERS.map((r) => ({ value: r.id, label: r.label }))}
                onChange={(registerId) => updateSettings({ registerId })}
              />
            </Field>
          </SettingChip>

          <SettingChip Icon={SlidersIcon} label="Voicing" value={SHAPE_SHORT[shape]}>
            <Field
              label="Shape"
              hint="How the notes are stacked. Root position plays the chord on top from its own root (E♭ G B♭ D). Any inversion starts on any of its notes. A and B are the left-hand voicings pianists use: from the 3rd (3 5 7 9) or from the 7th (7 9 3 5)."
            >
              <ChoiceList label="Shape" value={shape} options={VOICING_SHAPES} onChange={(value) => updateSettings({ shape: value })} />
            </Field>
            <SwitchRow
              label="Show the voicing's name"
              checked={showVoicingName}
              onChange={(v) => updateSettings({ showVoicingName: v })}
              hint="Shows the chord the notes make on their own (E♭Δ7) while you answer. Off, you have to hear what it is first. The 13 and altered voicings have no name of their own."
            />
            <Field label="Tone" hint="Which sound plays the voicing.">
              <PillChoice label="Tone" value={toneId} options={EAR_TRAINING_TONES.map((t) => ({ value: t.id, label: t.label }))} onChange={(v) => updateSettings({ toneId: v })} />
            </Field>
          </SettingChip>

          <SettingChip Icon={StopwatchIcon} label="Rounds" value={`${roundCount} rounds`}>
            <SliderField
              label="Number of rounds"
              value={roundCount}
              min={MIN_ROUNDS}
              max={MAX_ROUNDS}
              step={1}
              onChange={(v) => updateSettings({ roundCount: v })}
              hint="How many voicings make up one run."
            />
            <Field label="Next round" hint="Whether the next voicing waits for you to press Next, or starts by itself after the answer.">
              <PillChoice label="Next round" value={advanceDelayMs} options={NEXT_OPTIONS} onChange={(v) => updateSettings({ advanceDelayMs: v })} />
            </Field>
            <SwitchRow
              label="Half credit after a wrong note"
              checked={partialCredit}
              onChange={(v) => updateSettings({ partialCredit: v })}
              hint="Finding the root after a wrong note still counts, for half a point. Off, it counts in full."
            />
          </SettingChip>

          {answerMode === 'sing' ? (
            <SettingChip Icon={MicrophoneIcon} label="Microphone" value={listenWhilePlaying ? 'While it plays' : 'After the chord'}>
              <SwitchRow
                label="Listen while it plays"
                checked={listenWhilePlaying}
                onChange={(v) => updateSettings({ listenWhilePlaying: v })}
                hint="Lets you sing the root against the chord while it's still sounding. Use headphones, or the mic hears the piano and counts its notes as wrong ones. Off, the mic waits until the chord has finished."
              />
              <SheetDivider title="Advanced" />
              <SliderField
                label="Tuning tolerance"
                value={toleranceCents}
                unit="¢"
                min={10}
                max={100}
                step={5}
                onChange={(v) => updateSettings({ toleranceCents: v })}
                hint="How far off pitch still counts as the right note."
              />
              <SliderField
                label="Note hold time"
                value={holdMs}
                unit=" ms"
                min={60}
                max={600}
                step={30}
                onChange={(v) => updateSettings({ holdMs: v })}
                hint="How long a pitch has to stay steady before it counts, so sliding into a note isn't graded on the way."
              />
              <Field label="Input sensitivity" hint="How quiet a sound can be before it's treated as silence. Lower it in a noisy room.">
                <PillChoice
                  label="Input sensitivity"
                  value={sensitivity}
                  options={Object.entries(SENSITIVITY).map(([value, { label }]) => ({ value, label }))}
                  onChange={(v) => updateSettings({ sensitivity: v })}
                />
              </Field>
              <SheetButton
                label="Reset advanced settings"
                onPress={() =>
                  updateSettings({
                    toleranceCents: DEFAULT_SETTINGS.toleranceCents,
                    holdMs: DEFAULT_SETTINGS.holdMs,
                    sensitivity: DEFAULT_SETTINGS.sensitivity,
                  })
                }
              />
            </SettingChip>
          ) : null}
        </OptionsArea>
      ) : null}

      <Text className="font-ui text-xs" style={{ color: colors.muted }}>
        Idea by Rob Moreno
      </Text>
    </ToolScreen>
  );
}

export default withScreenLoader(FindTheRootScreen);
