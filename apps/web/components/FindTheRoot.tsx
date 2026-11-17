"use client";

import { useEffect, useRef, useState } from "react";
import AdvancedSlider from "@/components/AdvancedSlider";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import Disclosure from "@/components/Disclosure";
import ElapsedTimer from "@/components/ElapsedTimer";
import Hint from "@/components/Hint";
import InputTest from "@/components/InputTest";
import KeyHint from "@/components/KeyHint";
import PanelsToggle from "@/components/PanelsToggle";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { PoolPill } from "@/components/reward/Reward";
import {
  ChordIcon,
  FlagIcon,
  KeyboardIcon,
  MicIcon,
  PlayIcon,
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
import { prettyQuality } from "@/lib/iRealPro";
import {
  GRADE_COLOR,
  GRADE_LABEL,
  Grade,
  describePitch,
  frequencyToMidi,
  gradePitch,
  scoreOf,
} from "@/lib/noteGrade";
import {
  DEFAULT_ROOTLESS_TYPE_IDS,
  REGISTERS,
  ROOTLESS_CATEGORIES,
  ROOTLESS_TYPES,
  ROOT_NAMES,
  RootlessRound,
  RootlessType,
  VOICING_SHAPES,
  VoicingShape,
  buildRound,
  bottomDegree,
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
} from "@/lib/rootlessVoicings";
import { GradeCounts, attempts, bumpGradeCounts, rankWeak } from "@/lib/struggleStats";
import {
  DEFAULT_EAR_TRAINING_TONE_ID,
  EAR_TRAINING_TONES,
  playNotesTogether,
} from "@/lib/tones";
import { useToolActivity } from "@/lib/toolTime";
import { formatDuration, shuffled } from "@/lib/trainerUtils";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/** How long the voicing rings. */
const CHORD_SECONDS = 2.2;
/** In sing mode, how long after the chord stops before the mic counts, so its tail isn't heard
    as an answer. */
const AFTER_CHORD_MS = 250;
const FRAME_MS = 30;

const MIN_ROUNDS = 5;
const MAX_ROUNDS = 40;

/** Clock reads, only ever from event handlers and the mic callback (never during render). Kept
    out here so the React Compiler's purity check, which can't tell a handler from render in a
    component this size, doesn't flag them. */
const nowMs = () => performance.now();
const wallClock = () => Date.now();

type AnswerMode = "sing" | "pick";

const NEXT_OPTIONS = [
  { value: "0", label: "When I press Next" },
  { value: "2000", label: "After 2 seconds" },
  { value: "4000", label: "After 4 seconds" },
  { value: "6000", label: "After 6 seconds" },
];

type HistoryEntry = {
  at: number;
  elapsedMs: number;
  score: number;
  total: number;
  mode: AnswerMode;
};

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
  /** Mic frames before this time (`performance.now()`) are ignored: the chord is still sounding. */
  listenFrom: number;
  stable: number;
  last: number | null;
};

type Summary = { results: Grade[]; rounds: RootlessRound[] };

const PANEL_IDS = ["root-chords", "root-roots", "root-voicing", "root-rounds", "root-listen"];
const SETTINGS_KEY = "jam-practice-find-the-root";
const DEFAULT_SETTINGS = {
  answerMode: "sing" as AnswerMode,
  typeIds: DEFAULT_ROOTLESS_TYPE_IDS as string[],
  /** Pitch classes 0–11; empty means all 12. */
  roots: [] as number[],
  registerId: "mid",
  shape: "stacked" as VoicingShape,
  showVoicingName: true,
  toneId: DEFAULT_EAR_TRAINING_TONE_ID,
  roundCount: 10,
  /** 0: wait for Next. */
  advanceDelayMs: 0,
  partialCredit: true,
  listenWhilePlaying: false,
  inputDeviceId: "",
  toleranceCents: 50,
  holdMs: 210,
  sensitivity: "normal",
  typeStats: {} as Record<string, GradeCounts>,
  history: [] as HistoryEntry[],
};

/** "C" + "-9" → "C-9", drawn the Chord Charts way (Δ, ø, °, ♭, ♯). */
function chordLabel(symbol: { root: string; suffix: string }) {
  return `${prettyNote(symbol.root)}${prettyQuality(symbol.suffix)}`;
}

function formatScore(score: number) {
  return score % 1 === 0 ? String(score) : score.toFixed(1);
}

/** The root keys, laid out like a piano: white keys below, black keys above them. */
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEYS: { pc: number; col: number }[] = [
  { pc: 1, col: 2 },
  { pc: 3, col: 4 },
  { pc: 6, col: 8 },
  { pc: 8, col: 10 },
  { pc: 10, col: 12 },
];

export default function FindTheRoot() {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const answerMode: AnswerMode = settings.answerMode === "pick" ? "pick" : "sing";
  const shape: VoicingShape = VOICING_SHAPES.some((s) => s.value === settings.shape)
    ? settings.shape
    : "stacked";
  const register = REGISTERS.find((r) => r.id === settings.registerId) ?? REGISTERS[1];
  const toneId = EAR_TRAINING_TONES.some((t) => t.id === settings.toneId)
    ? settings.toneId
    : DEFAULT_EAR_TRAINING_TONE_ID;
  const sensitivity = settings.sensitivity in SENSITIVITY ? settings.sensitivity : "normal";
  const roundCount = Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(settings.roundCount)));
  const chosenTypes = ROOTLESS_TYPES.filter((t) => settings.typeIds.includes(t.id));
  // An empty pool means all of them, like the other trainers' pills.
  const pool = chosenTypes.length ? chosenTypes : ROOTLESS_TYPES;
  const roots = settings.roots.filter((r) => Number.isInteger(r) && r >= 0 && r < 12);
  const history = settings.history.filter(
    (h): h is HistoryEntry => !!h && typeof h.score === "number" && typeof h.total === "number",
  );
  const { showVoicingName, partialCredit, listenWhilePlaying, toleranceCents, holdMs } = settings;
  const advanceDelayMs = [0, 2000, 4000, 6000].includes(settings.advanceDelayMs)
    ? settings.advanceDelayMs
    : 0;

  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/find-the-root", running);
  const [round, setRound] = useState<RootlessRound | null>(null);
  const [status, setStatus] = useState<Grade | null>(null);
  const [wrongPicks, setWrongPicks] = useState<number[]>([]);
  const [heard, setHeard] = useState<{ text: string; wrong: boolean } | null>(null);
  const [chordSounding, setChordSounding] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number; score: number; done: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastMode, setLastMode] = useState<"normal" | "weak">("normal");
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<InputDevice[]>([]);

  const sessionRef = useRef<Session | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const inputRef = useRef<AudioInput | null>(null);
  const mountedRef = useRef(true);
  const nextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The source of truth for the struggle stats while a session runs (several bumps can land
  // before the settings round-trip back through a render).
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

  function toggleType(id: string) {
    updateSettings({
      typeIds: settings.typeIds.includes(id)
        ? settings.typeIds.filter((x) => x !== id)
        : [...settings.typeIds, id],
    });
  }

  function toggleRoot(pc: number) {
    updateSettings({
      roots: roots.includes(pc) ? roots.filter((r) => r !== pc) : [...roots, pc].sort((a, b) => a - b),
    });
  }

  function bumpStat(typeId: string, grade: Grade) {
    statsRef.current = bumpGradeCounts(statsRef.current, typeId, grade);
    updateSettings({ typeStats: statsRef.current });
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

  /** Plays the voicing (with its root under it on the reveal). In sing mode the mic waits until
      it has finished, unless "Listen while it plays" is on. */
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
    setChordSounding(false);
    setProgress(null);
  }

  function updateProgress(session: Session) {
    setProgress({
      index: session.index,
      total: session.total,
      score: scoreOf(session.results),
      done: session.results.length,
    });
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
      const entry: HistoryEntry = {
        at: wallClock(),
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
    setHeard(null);
    updateProgress(session);
    void playRound(r, false);
  }

  async function start(mode: "normal" | "weak" = "normal") {
    setLastMode(mode);
    const weak = mode === "weak" ? weakTypes(statsRef.current) : [];
    if (mode === "weak" && weak.length === 0) {
      setError("No struggles yet. A wrong or missed answer adds the chord here.");
      return;
    }
    setError(null);
    setSummary(null);
    endSession();

    if (answerMode === "sing") {
      try {
        const input = await startAudioInput(
          inputDeviceId,
          (frame) => handleFrame(frame.freq),
          () => cfgRef.current.silenceRms,
        );
        if (!mountedRef.current) {
          input.stop();
          return;
        }
        inputRef.current = input;
        // Device names only show once the mic is allowed.
        void listAudioInputs().then(setInputs).catch(() => {});
      } catch {
        setError("Couldn't open the microphone. Check the browser's microphone permission, or switch to Pick.");
        return;
      }
    }

    // A weak run: one round per struggling chord, on a random root from the pool.
    const queue =
      mode === "weak"
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
    setRunning(true);
    startRound(session, queue ? queue.shift()! : newRound());
  }

  /** ~30 times a second in sing mode: what pitch the mic hears. */
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
      (rootPc) =>
        gradePitch(freq, midiName(60 + rootPc), {
          ignoreOctave: true,
          toleranceCents: cfg.toleranceCents,
        }) === "correct",
    );
    setHeard({ text: `${prettyNote(ROOT_NAMES[pc])} (${cents > 0 ? "+" : ""}${cents}¢)`, wrong: !right });
    if (right) finishRound(session.wrong && cfg.partialCredit ? "partial" : "correct");
    else session.wrong = true;
  }

  function pick(pc: number) {
    const session = sessionRef.current;
    if (!session || !session.round || session.grade) return;
    if (correctRoots(session.round.type, session.round.rootPc).includes(pc)) {
      finishRound(session.wrong && cfgRef.current.partialCredit ? "partial" : "correct");
    } else {
      session.wrong = true;
      setWrongPicks((w) => (w.includes(pc) ? w : [...w, pc]));
    }
  }

  function stop() {
    sessionStartRef.current = null;
    endSession();
  }

  useSpaceToggle(running ? stop : () => void start());

  // Enter moves on once a round is answered.
  const enterRef = useRef<() => boolean>(() => false);
  useEffect(() => {
    enterRef.current = () => {
      if (!running || !status) return false;
      next();
      return true;
    };
  });
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [role='dialog'], [role='listbox']")) return;
      if (enterRef.current()) e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ------------------------------------------------------------------ what's shown

  const weakEntries = weakTypes(settings.typeStats);
  const bestPct = history.length
    ? Math.max(...history.map((h) => (h.total ? Math.round((h.score / h.total) * 100) : 0)))
    : null;
  const target = round ? targetSymbol(round) : null;
  const voicing = round ? voicingSymbol(round) : null;
  const rightRoots = round ? correctRoots(round.type, round.rootPc) : [];
  const otherRoots = round
    ? rightRoots.filter((pc) => pc !== round.rootPc).map((pc) => prettyNote(ROOT_NAMES[pc]))
    : [];
  const glow = status ? GRADE_COLOR[status] : null;
  const summaryScore = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) => summary?.results.filter((g) => g === grade).length ?? 0;
  const lastRound = progress ? progress.index >= progress.total : false;
  const keyState = (pc: number): "right" | "wrong" | null =>
    status && rightRoots.includes(pc) ? "right" : wrongPicks.includes(pc) ? "wrong" : null;

  return (
    <ToolLayout
      title="Find the Root"
      presets={toolPresets("find-the-root", settings, updateSettings)}
      optionsMode={
        <Segmented
          onPage
          label="Answer by"
          value={answerMode}
          onChange={(v) => updateSettings({ answerMode: v })}
          disabled={running}
          options={[
            { value: "sing", label: "Sing or play" },
            { value: "pick", label: "Pick" },
          ]}
        />
      }
      sidePanel={
        <>
          <CollapsiblePanel
            id="history"
            title="History"
            icon={StopwatchIcon}
            summary={bestPct !== null ? `Best ${bestPct}%` : undefined}
          >
            {history.length === 0 ? (
              <p className="text-sm text-muted">No finished runs yet.</p>
            ) : (
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {[...history]
                  .sort((a, b) => b.at - a.at)
                  .map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 border-b border-background/70 py-2 text-sm last:border-b-0"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium tabular-nums">
                          {formatScore(entry.score)}/{entry.total}
                        </span>
                        <span className="text-xs text-muted">
                          {entry.mode === "pick" ? "Picked" : "Sung or played"} ·{" "}
                          {new Date(entry.at).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="text-xs tabular-nums text-muted">
                        {formatDuration(entry.elapsedMs)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => updateSettings({ history: [] })}
                disabled={running}
                className="self-start text-sm font-medium text-muted hover:text-danger disabled:opacity-50"
              >
                Clear history
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
                No struggles yet. A wrong or missed answer adds the chord here.
              </p>
            ) : (
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {weakEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center justify-between gap-3 border-b border-background/70 py-2 text-sm last:border-b-0"
                  >
                    <span className="font-medium">{entry.type.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                      {entry.counts.incorrect > 0 && (
                        <span style={{ color: GRADE_COLOR.incorrect }}>✕{entry.counts.incorrect}</span>
                      )}
                      {entry.counts.partial > 0 && (
                        <span style={{ color: GRADE_COLOR.partial }}>½{entry.counts.partial}</span>
                      )}
                      <span className="text-muted">/{attempts(entry.counts)}</span>
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
                onClick={() => {
                  statsRef.current = {};
                  updateSettings({ typeStats: {} });
                }}
                disabled={running}
                className="self-start text-sm font-medium text-muted hover:text-danger disabled:opacity-50"
              >
                Clear stats
              </button>
            )}
          </CollapsiblePanel>
        </>
      }
      options={
        running ? null : (
          <>
            <PanelsToggle ids={PANEL_IDS} />
            <CollapsiblePanel
              id="root-chords"
              title="Chords"
              icon={ChordIcon}
              summary={`${chosenTypes.length || ROOTLESS_TYPES.length} of ${ROOTLESS_TYPES.length}`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted">
                  {chosenTypes.length || ROOTLESS_TYPES.length} of {ROOTLESS_TYPES.length} in play
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => updateSettings({ typeIds: ROOTLESS_TYPES.map((t) => t.id) })}
                    className="font-medium text-accent hover:underline"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ typeIds: [...DEFAULT_ROOTLESS_TYPE_IDS] })}
                    className="font-medium text-muted hover:underline"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <Hint>
                Which chords you can be asked to make. With none picked, all of them can come up.
                A triad or four-note chord on top is what the voicing makes on its own: a minor 7
                without its root is a major triad on the ♭3, a minor 9 a major 7 on the ♭3. The
                left-hand ones have no name of their own.
              </Hint>
              {ROOTLESS_CATEGORIES.map((category) => (
                <div key={category} className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted">{category}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ROOTLESS_TYPES.filter((t) => t.category === category).map((type) => (
                      <PoolPill
                        key={type.id}
                        on={settings.typeIds.includes(type.id)}
                        onClick={() => toggleType(type.id)}
                        title={`${type.name}: ${describeVoicing(type).toLowerCase()}`}
                      >
                        {type.name}
                      </PoolPill>
                    ))}
                  </div>
                </div>
              ))}
            </CollapsiblePanel>

            <CollapsiblePanel
              id="root-roots"
              title="Roots"
              icon={KeyboardIcon}
              summary={roots.length ? `${roots.length} of 12` : "All 12"}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted">
                  {roots.length ? `${roots.length} of 12` : "All 12"}
                </span>
                {roots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => updateSettings({ roots: [] })}
                    className="font-medium text-accent hover:underline"
                  >
                    All
                  </button>
                )}
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {ROOT_NAMES.map((name, pc) => (
                  <PoolPill
                    key={name}
                    on={roots.includes(pc)}
                    onClick={() => toggleRoot(pc)}
                    plainClassName="rounded-full px-2 py-1.5 text-xs font-medium"
                  >
                    {prettyNote(name)}
                  </PoolPill>
                ))}
              </div>
              <Hint>Which roots can come up. With none picked, all 12 can.</Hint>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Register</span>
                <Select
                  value={register.id}
                  onChange={(registerId) => updateSettings({ registerId })}
                  options={REGISTERS.map((r) => ({ value: r.id, label: r.label }))}
                />
              </label>
              <Hint>Where the voicing&apos;s lowest note sits.</Hint>
            </CollapsiblePanel>

            <CollapsiblePanel
              id="root-voicing"
              title="Voicing"
              icon={SlidersIcon}
              summary={shape === "ab" ? "A and B" : shape === "inversions" ? "Any inversion" : "Root position"}
            >
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Shape</span>
                <Select
                  value={shape}
                  onChange={(value) => updateSettings({ shape: value })}
                  options={VOICING_SHAPES}
                />
              </label>
              <Hint>
                How the notes are stacked. Root position plays the chord on top from its own root
                (E♭ G B♭ D). Any inversion starts on any of its notes. A and B are the left-hand
                voicings pianists use: from the 3rd (3 5 7 9) or from the 7th (7 9 3 5).
              </Hint>
              <SwitchRow
                label="Show the voicing's name"
                checked={showVoicingName}
                onChange={(v) => updateSettings({ showVoicingName: v })}
                hint="Shows the chord the notes make on their own (E♭Δ7) while you answer. Off, you have to hear what it is first. The 13 and altered voicings have no name of their own."
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Tone</span>
                <Select
                  value={toneId}
                  onChange={(value) => updateSettings({ toneId: value })}
                  options={EAR_TRAINING_TONES.map((t) => ({ value: t.id, label: t.label }))}
                />
              </label>
              <Hint>Which sound plays the voicing.</Hint>
            </CollapsiblePanel>

            <CollapsiblePanel
              id="root-rounds"
              title="Rounds"
              icon={StopwatchIcon}
              summary={`${roundCount} rounds`}
            >
              <label className="flex flex-col gap-2 text-sm">
                <span className="flex items-center justify-between font-medium text-muted">
                  Number of rounds
                  <span className="tabular-nums text-foreground">{roundCount}</span>
                </span>
                <input
                  type="range"
                  min={MIN_ROUNDS}
                  max={MAX_ROUNDS}
                  step={1}
                  value={roundCount}
                  onChange={(e) => updateSettings({ roundCount: Number(e.target.value) })}
                  style={
                    {
                      "--progress": `${((roundCount - MIN_ROUNDS) / (MAX_ROUNDS - MIN_ROUNDS)) * 100}%`,
                    } as React.CSSProperties
                  }
                  className="slider h-6 w-full cursor-pointer"
                />
              </label>
              <Hint>How many voicings make up one run.</Hint>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Next round</span>
                <Select
                  value={String(advanceDelayMs)}
                  onChange={(value) => updateSettings({ advanceDelayMs: Number(value) })}
                  options={NEXT_OPTIONS}
                />
              </label>
              <Hint>Whether the next voicing waits for you to press Next, or starts by itself after the answer.</Hint>
              <SwitchRow
                label="Half credit after a wrong note"
                checked={partialCredit}
                onChange={(v) => updateSettings({ partialCredit: v })}
                hint="Finding the root after a wrong note still counts, for half a point. Off, it counts in full."
              />
            </CollapsiblePanel>

            {answerMode === "sing" && (
              <CollapsiblePanel id="root-listen" title="Listen" icon={MicIcon}>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-muted">Audio input</span>
                  <Select
                    value={inputDeviceId}
                    onChange={(value) => updateSettings({ inputDeviceId: value })}
                    options={[
                      { value: "", label: "Default input" },
                      ...inputs.map((d) => ({ value: d.id, label: d.label })),
                    ]}
                  />
                </label>
                <Hint>Which microphone or audio interface to listen through.</Hint>
                <InputTest deviceId={inputDeviceId} silenceRms={SENSITIVITY[sensitivity].rms} />
                <SwitchRow
                  label="Listen while it plays"
                  checked={listenWhilePlaying}
                  onChange={(v) => updateSettings({ listenWhilePlaying: v })}
                  hint="Lets you sing the root against the chord while it's still sounding. Use headphones, or the mic hears the piano and counts its notes as wrong ones. Off, the mic waits until the chord has finished."
                />
                <Disclosure title="Advanced">
                  <AdvancedSlider
                    label="Tuning tolerance"
                    value={toleranceCents}
                    unit="¢"
                    min={10}
                    max={100}
                    step={5}
                    onChange={(v) => updateSettings({ toleranceCents: v })}
                    hint="How far off pitch still counts as the right note."
                  />
                  <AdvancedSlider
                    label="Note hold time"
                    value={holdMs}
                    unit=" ms"
                    min={60}
                    max={600}
                    step={30}
                    onChange={(v) => updateSettings({ holdMs: v })}
                    hint="How long a pitch has to stay steady before it counts, so sliding into a note isn't graded on the way."
                  />
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-muted">Input sensitivity</span>
                    <Select
                      value={sensitivity}
                      onChange={(value) => updateSettings({ sensitivity: value })}
                      options={Object.entries(SENSITIVITY).map(([value, { label }]) => ({ value, label }))}
                    />
                  </label>
                  <Hint>How quiet a sound can be before it&apos;s treated as silence. Lower it in a noisy room.</Hint>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        toleranceCents: DEFAULT_SETTINGS.toleranceCents,
                        holdMs: DEFAULT_SETTINGS.holdMs,
                        sensitivity: DEFAULT_SETTINGS.sensitivity,
                      })
                    }
                    className="self-start rounded-lg bg-background px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
                  >
                    Reset advanced settings
                  </button>
                </Disclosure>
              </CollapsiblePanel>
            )}
          </>
        )
      }
    >
      <div className="flex w-full flex-col items-center gap-3">
        <div className="relative flex h-40 w-40 items-center justify-center rounded-full p-4 text-center sm:h-48 sm:w-48">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full border-4 transition-colors duration-200"
            style={{ borderColor: glow ?? "var(--surface)" }}
          />
          <p
            className={`relative z-10 font-bold transition-[color,text-shadow] duration-200 ${
              status && target && chordLabel(target).length > 6 ? "text-3xl sm:text-4xl" : "text-5xl sm:text-6xl"
            }`}
            style={
              glow
                ? { color: glow, textShadow: `0 0 12px ${glow}, 0 0 32px ${glow}` }
                : undefined
            }
          >
            {!round ? "—" : status && target ? chordLabel(target) : "?"}
          </p>
        </div>

        {round && (
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-lg">
              Make it <span className="font-semibold">{round.type.ask}</span>
            </p>
            {voicing && (showVoicingName || status) && (
              <p className="text-sm text-muted">
                You&apos;re hearing{" "}
                <span className="font-semibold text-foreground">{chordLabel(voicing)}</span>
                {/* A starts on the 3rd and B on the 7th, so it's a clue: only after answering. */}
                {round.ab && status && ` · ${round.ab} voicing`}
              </p>
            )}
            {!voicing && status && round.ab && (
              <p className="text-sm text-muted">{round.ab} voicing</p>
            )}
            {status && (
              <>
                <p className="text-sm text-muted">
                  <span className="font-semibold" style={{ color: GRADE_COLOR.correct }}>
                    {prettyNote(target!.root)}
                  </span>{" "}
                  under {voicingNoteNames(round).map(prettyNote).join(" ")}{" "}
                  <span className="text-xs">
                    ({round.order.map(degreeLabel).join(" ")})
                  </span>
                </p>
                {otherRoots.length > 0 && (
                  <p className="max-w-xs text-xs text-muted">
                    It&apos;s a diminished 7th, so {otherRoots.join(", ")} work too.
                  </p>
                )}
                <p className="text-sm font-semibold" style={{ color: GRADE_COLOR[status] }}>
                  {status === "incorrect" ? "Not this time" : GRADE_LABEL[status]}
                </p>
              </>
            )}
          </div>
        )}

        {running && round && answerMode === "sing" && !status && (
          <p
            className="min-h-5 text-sm tabular-nums"
            style={heard?.wrong ? { color: GRADE_COLOR.incorrect } : undefined}
          >
            {chordSounding
              ? "Listening after the chord…"
              : heard
                ? heard.wrong
                  ? `Heard ${heard.text}, not it`
                  : `Heard ${heard.text}`
                : "Sing or play the root…"}
          </p>
        )}

        {running && round && answerMode === "pick" && (
          <div
            role="group"
            aria-label="Pick the root"
            className="grid w-full max-w-sm gap-1"
            style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
          >
            {BLACK_KEYS.map(({ pc, col }) => (
              <RootKey
                key={pc}
                pc={pc}
                black
                style={{ gridColumn: `${col} / span 2`, gridRow: 1 }}
                state={keyState(pc)}
                disabled={!!status}
                onPick={pick}
              />
            ))}
            {WHITE_KEYS.map((pc, i) => (
              <RootKey
                key={pc}
                pc={pc}
                style={{ gridColumn: `${i * 2 + 1} / span 2`, gridRow: 2 }}
                state={keyState(pc)}
                disabled={!!status}
                onPick={pick}
              />
            ))}
          </div>
        )}

        {running && round && (
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => void playRound(round, !!status)}
              className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
            >
              <PlayIcon className="h-3.5 w-3.5" />
              {status ? "Play it with the root" : "Replay"}
            </button>
            {!status ? (
              <button
                type="button"
                onClick={() => finishRound("incorrect")}
                className="rounded-full bg-surface px-4 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
              >
                I give up
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                {lastRound ? "See results" : "Next"}
              </button>
            )}
          </div>
        )}

        {running && progress && (
          <p className="text-sm tabular-nums text-muted">
            Round {progress.index} of {progress.total} · {formatScore(progress.score)}/{progress.done} ·{" "}
            <ElapsedTimer active={running} startRef={sessionStartRef} />
          </p>
        )}
      </div>

      {summary && !running && (
        <section
          aria-label="Results"
          className="flex w-full flex-col gap-4 rounded-2xl bg-surface p-4 text-left sm:p-6"
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted">Results</p>
              <p className="text-4xl font-bold tabular-nums">
                {formatScore(summaryScore)}
                <span className="text-xl font-semibold text-muted"> / {summary.results.length}</span>
              </p>
            </div>
            <p className="text-2xl font-semibold tabular-nums text-muted">
              {summary.results.length ? Math.round((summaryScore / summary.results.length) * 100) : 0}%
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(["correct", "partial", "incorrect"] as const).map((grade) => (
              <div key={grade} className="rounded-xl bg-background px-2 py-3">
                <p className="text-2xl font-bold tabular-nums" style={{ color: GRADE_COLOR[grade] }}>
                  {tally(grade)}
                </p>
                <p className="text-xs text-muted">{grade === "partial" ? "Half" : GRADE_LABEL[grade]}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {summary.rounds.map((r, i) => {
              const v = voicingSymbol(r);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-1.5 text-sm"
                >
                  <span className="font-semibold" style={{ color: GRADE_COLOR[summary.results[i]] }}>
                    {chordLabel(targetSymbol(r))}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {v ? `${chordLabel(v)} · ` : ""}
                    {voicingNoteNames(r).map(prettyNote).join(" ")}
                  </span>
                </div>
              );
            })}
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
        onClick={running ? stop : () => void start()}
        className={`rounded-full px-8 py-3 text-base font-semibold transition-colors ${
          running ? "bg-surface hover:bg-surface-hover" : "bg-accent text-accent-foreground hover:bg-accent-hover"
        }`}
      >
        {running ? "Stop" : "Start"}
      </button>
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to start or stop, <KeyHint.Key>Enter</KeyHint.Key> for the next one
      </KeyHint>
    </ToolLayout>
  );
}

/** One key of the root picker. */
function RootKey({
  pc,
  black = false,
  style,
  state,
  disabled,
  onPick,
}: {
  pc: number;
  black?: boolean;
  style: React.CSSProperties;
  state: "right" | "wrong" | null;
  disabled: boolean;
  onPick: (pc: number) => void;
}) {
  const color = state === "right" ? GRADE_COLOR.correct : state === "wrong" ? GRADE_COLOR.incorrect : null;
  return (
    <button
      type="button"
      onClick={() => onPick(pc)}
      disabled={disabled}
      aria-label={prettyNote(ROOT_NAMES[pc])}
      style={{
        ...style,
        ...(color
          ? {
              color,
              background: `color-mix(in srgb, ${color} 18%, var(--surface))`,
              boxShadow: `inset 0 0 0 2px ${color}`,
            }
          : {}),
      }}
      className={`rounded-lg font-semibold transition-colors disabled:cursor-default ${
        black
          ? "h-11 bg-foreground text-xs text-background hover:opacity-85 sm:h-12"
          : "h-14 bg-surface text-sm text-foreground hover:bg-surface-hover sm:h-16"
      } ${disabled && !color ? "opacity-60" : ""}`}
    >
      {prettyNote(ROOT_NAMES[pc])}
    </button>
  );
}
