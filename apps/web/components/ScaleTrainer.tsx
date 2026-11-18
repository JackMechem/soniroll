"use client";

import { useEffect, useRef, useState } from "react";
import { CUSTOM_INSTRUMENT_ID, INSTRUMENTS, instrumentShortName } from "@/lib/instruments";
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
  MicIcon,
  NoteIcon,
  ScaleIcon,
  SlidersIcon,
  StopwatchIcon,
  ListIcon,
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
  DEFAULT_ENABLED_SCALE_IDS,
  SCALE_CATEGORIES,
  SCALE_MODES,
  ScaleMode,
  ScaleRound,
  drillQueueForPool,
  randomMode,
  randomScaleRound,
  scaleRoundForPitchClass,
} from "@/lib/scales";
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
  bumpGradeCounts,
  rankWeak,
} from "@/lib/struggleStats";
import AdvancedSlider from "@/components/AdvancedSlider";
import CountdownLabel from "@/components/CountdownLabel";
import CountdownRing from "@/components/CountdownRing";
import ElapsedTimer from "@/components/ElapsedTimer";
import { useToolActivity } from "@/lib/toolTime";
import { micErrorMessage } from "@/lib/micError";
import { PoolPill } from "@/components/reward/Reward";
import StruggleCounts from "@/components/learning/StruggleCounts";
import { LOCKED_NOTE, GRADE_TAG, PANEL_LIST, PANEL_ROW, PRIMARY_BUTTON, PRIMARY_BUTTON_SM, RESULTS_PANEL, SECONDARY_BUTTON, SECONDARY_BUTTON_SM, TEXT_BUTTON_DANGER, startButtonClass, POOL_BUTTON, IDLE_DASH, IDLE_HINT, bestPassingMs, passedRound, noteGlyphs } from "@/components/learning/quizUi";

/** Mode names that are proper nouns, kept capitalised by `scaleName`. */
const PROPER_SCALE_WORDS = new Set(["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian", "Hindu"]);

/** The shared scale list is in Title Case ("Natural Minor (Aeolian)"); show it in sentence case
    ("Natural minor (Aeolian)"), keeping the mode names capitalised. Display only. */
function scaleName(label: string): string {
  let first = true;
  return label.replace(/[A-Za-z]+/g, (word) => {
    if (first) {
      first = false;
      return word;
    }
    return PROPER_SCALE_WORDS.has(word) ? word : word.toLowerCase();
  });
}
const MIN_INTERVAL_SECONDS = 1;
const MAX_INTERVAL_SECONDS = 20;
const DEFAULT_INTERVAL_SECONDS = 6;

/** Spacing for "play the scale out loud", one note at a time. */
const SCALE_NOTE_DURATION_SECONDS = 0.35;
const SCALE_NOTE_GAP_MS = 380;

const MIN_SCALE_COUNT = 5;
const MAX_SCALE_COUNT = 30;
const FRAME_MS = 30;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 1500;

type Session = {
  total: number;
  index: number;
  round: ScaleRound | null;
  /** Index into `round.notes` of the scale degree currently being listened for. */
  noteIndex: number;
  best: Grade | null;
  /** How many wrong attempts the current scale degree has had (partial-credit mode only; a
      second wrong attempt on the same degree fails the round). */
  degreeMisses: number;
  /** A wrong note (that was then retried and fixed) happened somewhere in this round, so a
      round that finishes is graded "partial" rather than "correct". */
  hadMistake: boolean;
  results: Grade[];
  rounds: ScaleRound[];
  stable: number;
  last: number | null;
  /** The previous note's pitch, so its tail ringing into the next one isn't graded against it. */
  previousMidi: number | null;
  /** False until the previous note has stopped (silence or a genuinely new pitch). */
  settled: boolean;
  /** The pitch of the last note actually matched within this round (null at the start of a
      round) — separate from `previousMidi`, which also covers the previous round's last note for
      tail-ringing purposes. Used only by "Ignore repeated notes" to recognize a fresh attack of
      the same note as a double-attack rather than a new attempt. */
  lastCorrectMidi: number | null;
  /** Drill mode only: scales left to play, popped from the front; a miss goes back on the end. */
  queue: ScaleRound[];
};

type Summary = { results: Grade[]; rounds: ScaleRound[] };

/** Everything that affects what scales are drawn, how they're timed, and how they're graded —
    two attempts only get compared against each other if all of this matches. */
type HistoryConfig = {
  rangeInput: string;
  drillMode: boolean;
  scaleCount: number;
  /** The selected scale mode ids, sorted and joined, so the set (order doesn't matter) compares
      with a plain `===`. */
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

const PANEL_IDS = ["scale-modes", "scale-range", "scale-timing", "scale-listen", "scale-sound"];
const SETTINGS_KEY = "jam-practice-scale-trainer";
const DEFAULT_SETTINGS = {
  instrumentId: INSTRUMENTS[0].id,
  customRange: "A1-A6",
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
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
  showScaleNotes: true,
  toneId: DEFAULT_TONE_ID,
  listenMode: false,
  scaleCount: 10,
  drillMode: false,
  history: [] as HistoryEntry[],
  accidentalStyle: "sharp" as AccidentalStyle,
  inputDeviceId: "",
  scaleModes: DEFAULT_ENABLED_SCALE_IDS as string[],
  scaleStats: {} as Record<string, GradeCounts>,
};

export default function ScaleTrainer() {
  const [settings, updateSettings] = useSyncedSettings(
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
  );
  const {
    customRange,
    intervalSeconds,
    playSound,
    showNext,
    showScaleNotes,
    toneId,
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
  const scaleCount = Math.min(
    MAX_SCALE_COUNT,
    Math.max(MIN_SCALE_COUNT, Math.round(settings.scaleCount)),
  );
  const instrumentId =
    settings.instrumentId === CUSTOM_INSTRUMENT_ID ||
    INSTRUMENTS.some((i) => i.id === settings.instrumentId)
      ? settings.instrumentId
      : INSTRUMENTS[0].id;
  const pool = SCALE_MODES.filter((m) => settings.scaleModes.includes(m.id));
  const setInstrumentId = (instrumentId: string) =>
    updateSettings({ instrumentId });
  const setCustomRange = (customRange: string) =>
    updateSettings({ customRange });
  const setIntervalSeconds = (intervalSeconds: number) =>
    updateSettings({ intervalSeconds });
  const setPlaySound = (playSound: boolean) => updateSettings({ playSound });
  const setShowNext = (showNext: boolean) => updateSettings({ showNext });
  const setShowScaleNotes = (showScaleNotes: boolean) =>
    updateSettings({ showScaleNotes });
  const setToneId = (toneId: string) => updateSettings({ toneId });
  const setListenMode = (listenMode: boolean) => updateSettings({ listenMode });
  const setScaleCount = (scaleCount: number) => updateSettings({ scaleCount });
  const setDrillMode = (drillMode: boolean) => updateSettings({ drillMode });
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
  const toggleScaleMode = (id: string) =>
    updateSettings({
      scaleModes: settings.scaleModes.includes(id)
        ? settings.scaleModes.filter((x) => x !== id)
        : [...settings.scaleModes, id],
    });

  const [round, setRound] = useState<ScaleRound | null>(null);
  const [nextRound, setNextRound] = useState<ScaleRound | null>(null);
  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/scale-trainer", running);
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
  // How many notes of the current round have been matched, for the note-by-note pills.
  const [scaleProgress, setScaleProgress] = useState(0);
  // Partial-credit mode only: the current degree has had one wrong attempt and is waiting for
  // a retry, for the note pill's "try again" styling.
  const [degreeMiss, setDegreeMiss] = useState(false);
  // So "Try again" repeats a "Shed weak scales" run instead of falling back to a normal one.
  const [lastMode, setLastMode] = useState<"normal" | "weak">("normal");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noteTimerRef = useRef({ startedAt: 0, durationMs: 1000 });
  const upcomingRef = useRef<ScaleRound | null>(null);
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
  const scalePlaybackTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The source of truth for scaleStats *during* a running session — see the identical note on
  // Note Trainer's noteStatsRef for why a ref (not the settings value) is what gets bumped.
  const scaleStatsRef = useRef(settings.scaleStats);

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
    scaleStatsRef.current = settings.scaleStats;
  }, [settings.scaleStats]);

  const isCustom = instrumentId === CUSTOM_INSTRUMENT_ID;
  const rangeInput = isCustom
    ? customRange
    : (INSTRUMENTS.find((i) => i.id === instrumentId)?.range ?? "");
  // The chip names the instrument too ("Bass · E1–G4"), since the range alone doesn't say what
  // it's set up for.
  const rangeSummary = `${instrumentShortName(instrumentId)} · ${ignoreOctave ? "any octave" : rangeInput.replace("-", "–")}`;

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

  /** Struggle stats are tracked per *key* of a mode, not just the mode overall — "F# Dorian" and
      "C Dorian" are separate struggles — so a scale is either played through or it isn't, and a
      "shed" session can drill the exact key that's actually giving trouble rather than a random
      root of the same mode. The stat key folds both into one string: the root's pitch class
      (0-11, not a spelled letter, so it stays the same struggle across accidental-style changes
      and doesn't care what octave it was played in) and the mode id. */
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

  /** Undoes `scaleStatKey`, dropping anything that doesn't parse to a real pitch class and mode
      (stale data from an older format, or a mode that's since been removed). */
  function parseScaleStatKey(key: string): { pitchClass: number; mode: ScaleMode } | null {
    const [pitchClassText, modeId] = key.split(":");
    const pitchClass = Number(pitchClassText);
    if (!Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass > 11) return null;
    const mode = SCALE_MODES.find((m) => m.id === modeId);
    return mode ? { pitchClass, mode } : null;
  }

  /** Records one more grade for this key+mode in the lifetime struggle stats. */
  function bumpScaleStat(pitchClass: number, modeId: string, grade: Grade) {
    const key = scaleStatKey(pitchClass, modeId);
    scaleStatsRef.current = bumpGradeCounts(scaleStatsRef.current, key, grade);
    updateSettings({ scaleStats: scaleStatsRef.current });
  }

  function clearScaleStats() {
    scaleStatsRef.current = {};
    updateSettings({ scaleStats: {} });
  }

  /** A note name for a bare pitch class (no octave), spelled per the current accidental style —
      e.g. 6 -> "F#" or "Gb". */
  function pitchClassLabel(pitchClass: number, seq = 0): string {
    return noteGlyphs(spellNote(midiToNote(60 + pitchClass), accidentalStyle, seq, true));
  }

  /** Every struggling key+mode in `stats`, worst first. A plain function of its arguments (not
      the ref) so it's just as safe to call during render (for the button's count) as from inside
      a running session (via `scaleStatsRef.current`). */
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

  /** A short neutral click, for "Sound feedback" — reuses the metronome's click tone rather than
      a pitched note, since this is a cue, not a note to imitate. */
  function playClick() {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    scheduleClick(ctx, ctx.currentTime + 0.02, "sine", 1000, 0.5, 0.05);
  }

  /** One click per whole second of the countdown to the next scale (so it ticks in step with
      the "Next scale in Ns" readout), for "Sound feedback". */
  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!listenCfg.current.soundFeedback) return;
    const wholeSeconds = Math.floor(durationMs / 1000);
    for (let s = 1; s <= wholeSeconds; s++) {
      countdownClickTimeouts.current.push(setTimeout(playClick, s * 1000));
    }
  }

  /** Plays every note of the scale in order, spaced out, for "Play scale out loud". */
  function playScaleSound(notes: string[]) {
    clearScalePlayback();
    notes.forEach((n, i) => {
      scalePlaybackTimeouts.current.push(
        setTimeout(
          () => playNote(n, SCALE_NOTE_DURATION_SECONDS, toneIdRef.current),
          i * SCALE_NOTE_GAP_MS,
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

  /** Locks in a round's grade and starts the pause-before-next-scale countdown: retargets the
      ring/label (previously counting down the listening time) to the pause instead, so it visibly
      counts down to the next scale, and plays the click/tick sounds when "Sound feedback" is on. */
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
    setHeard(`${noteGlyphs(shownNote)} (${cents > 0 ? "+" : ""}${cents}¢)`);

    const nearest = Math.round(frequencyToMidi(freq, cfg.refA));
    if (nearest === session.last) session.stable++;
    else {
      session.last = nearest;
      session.stable = 1;
    }
    if (session.stable < cfg.holdFrames) return;

    // The tail of the previous note ringing on shouldn't be graded as an attempt at this one;
    // wait until it's stopped or a genuinely different pitch is heard. This applies both between
    // scale degrees within a round and between rounds.
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
        // A wrong note anywhere in the sequence fails the whole scale immediately.
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
    setScaleProgress(session.noteIndex);

    if (session.noteIndex >= session.round.notes.length) {
      lockInRound(session.hadMistake ? "partial" : "correct");
    }
  }

  /** `"weak"` starts a focused session on just the exact key+mode combos tracked as struggles
      (see `weakScaleEntries`) instead of the normal quiz/drill — one round per struggling key,
      not the full 12-key sweep "Drill every scale" does per mode, so it stays a quick, targeted
      practice on exactly what's giving trouble. Always listens (regardless of the "Listen mode"
      toggle, which is switched on to match) and never touches the timed History list, since a
      short weak-scales session isn't a fair comparison against a full one. */
  async function start(mode: "normal" | "weak" = "normal") {
    const weak = mode === "weak";
    setLastMode(mode);
    const range = parseRange(rangeInput);
    if (!range) {
      setError('Enter a valid range like "A1-A6".');
      return;
    }
    const weakList = weak ? weakScaleEntries(scaleStatsRef.current) : [];
    if (weak && weakList.length === 0) {
      setError(
        "No struggling scales yet — misses in listen mode build this list up.",
      );
      return;
    }
    if (!weak && pool.length === 0) {
      setError("Select at least one scale to practice.");
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
    // "Drill every scale" and "shed weak scales" both play through a fixed queue rather than
    // `scaleCount` random draws — same machinery either way, just a different starting queue.
    const drilling = weak ? true : listening && drillMode;
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
      } catch (e) {
        setError(micErrorMessage(e, "Couldn't open the mic. Try again, or pick another input."));
        return;
      }
      const queue = weak
        ? shuffled(
            weakList.map((e) =>
              scaleRoundForPitchClass(range, e.mode, e.pitchClass),
            ),
          )
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
      sessionStartRef.current = performance.now();
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
        // Lock in the scale that just finished; a timeout counts as a miss.
        const finishedGrade = session.best ?? "incorrect";
        if (session.round) {
          session.results.push(finishedGrade);
          session.rounds.push(session.round);
          const pitchClass = ((session.round.rootMidi % 12) + 12) % 12;
          bumpScaleStat(pitchClass, session.round.mode.id, finishedGrade);
          // Drill mode: a miss goes back on the end of the queue — with a freshly randomized
          // octave for the retry, so a repeated miss doesn't look like the exact same round.
          if (drilling && finishedGrade === "incorrect") {
            session.queue.push(
              scaleRoundForPitchClass(range, session.round.mode, pitchClass),
            );
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
            // A weed-out session over a handful of struggling modes isn't a fair comparison
            // against a full quiz/drill, so it doesn't join that leaderboard.
            setLastElapsedMs(null);
            setIsNewBest(false);
          } else {
            const config: HistoryConfig = {
              rangeInput,
              drillMode,
              scaleCount,
              scaleModesKey: pool
                .map((m) => m.id)
                .sort()
                .join(","),
              accidentalStyle,
              intervalSeconds,
              toleranceCents,
              holdMs,
              advanceDelayMs,
              refA,
              sensitivity,
            };
            // Compare against times recorded before this one, so tying/beating an empty
            // history (a first attempt) still counts as a new best.
            const previousBest =
              bestPassingMs(history.filter((h) => sameConfig(h.config, config))) ?? Infinity;
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
            setIsNewBest(passedRound(entry) && elapsedMs < previousBest);
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
        setScaleProgress(0);
        setDegreeMiss(false);
        // Drill mode's total grows when a scale gets requeued, so "X of Y" reflects what's
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
      noteTimerRef.current = {
        startedAt: performance.now(),
        durationMs: seconds * 1000,
      };
      setRound(next);
      setNextRound(following);
      if (playSoundRef.current && !session) {
        playScaleSound(next.notes);
      }
    };

    // Moving on early (a finished scale, or the skip button) restarts the timer so the next
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

  const rootLabel = (r: ScaleRound, seq = 0) =>
    noteGlyphs(spellNote(midiToNote(r.rootMidi), accidentalStyle, seq, ignoreOctave));
  const roundLabel = (r: ScaleRound, seq = 0) =>
    `${rootLabel(r, seq)} ${scaleName(r.mode.label)}`;
  const mainLabel = running && round ? roundLabel(round, roundSeed) : "—";
  const glow = running && status ? GRADE_COLOR[status] : null;
  const showCountdown = running;
  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) =>
    summary?.results.filter((g) => g === grade).length ?? 0;
  const currentConfig: HistoryConfig = {
    rangeInput,
    drillMode,
    scaleCount,
    scaleModesKey: pool
      .map((m) => m.id)
      .sort()
      .join(","),
    accidentalStyle,
    intervalSeconds,
    toleranceCents,
    holdMs,
    advanceDelayMs,
    refA,
    sensitivity,
  };
  const matchingHistory = history.filter((h) =>
    sameConfig(h.config, currentConfig),
  );
  const bestMs = bestPassingMs(matchingHistory);
  const weakEntries = weakScaleEntries(settings.scaleStats);

  return (
    <ToolLayout
      title="Scale Trainer"
      presets={toolPresets("scale-trainer", settings, updateSettings)}
      // Hidden until there's something in them, so a first visit leads with the tool itself.
      sidePanel={
        listenMode && (history.length > 0 || weakEntries.length > 0) && (
          <>
            <CollapsiblePanel
              id="history"
              title="History"
              icon={ListIcon}
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
                  No struggles tracked yet — a wrong or partial scale in listen mode adds it here.
                </p>
              ) : (
                <div className={PANEL_LIST}>
                  {weakEntries.map((entry) => (
                    <div
                      key={entry.key}
                      className={PANEL_ROW}
                    >
                      <span className="font-medium">
                        {pitchClassLabel(entry.pitchClass)} {scaleName(entry.mode.label)}
                      </span>
                      <StruggleCounts counts={entry.counts} />
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
                Shed weak scales{weakEntries.length > 0 && ` (${weakEntries.length})`}
              </button>
              {weakEntries.length > 0 && (
                <button
                  type="button"
                  onClick={clearScaleStats}
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
          <CollapsiblePanel id="scale-modes" title="Scales" icon={ScaleIcon} summary={`${pool.length} of ${SCALE_MODES.length}`}>
            {running && <p className={LOCKED_NOTE}>Stop to change these.</p>}
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted">
                {pool.length} of {SCALE_MODES.length} selected
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({ scaleModes: SCALE_MODES.map((m) => m.id) })
                  }
                  disabled={running}
                  className={POOL_BUTTON}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ scaleModes: [] })}
                  disabled={running}
                  className={POOL_BUTTON}
                >
                  None
                </button>
              </div>
            </div>
            <Hint>Which scale modes can be picked for a round. At least one must stay selected.</Hint>

            {SCALE_CATEGORIES.map((category) => (
              <div key={category} className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">
                  {category}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SCALE_MODES.filter((m) => m.category === category).map(
                    (mode) => {
                      const selected = settings.scaleModes.includes(mode.id);
                      return (
                        <PoolPill key={mode.id} on={selected} onClick={() => toggleScaleMode(mode.id)} disabled={running} title={mode.aka && scaleName(mode.aka)} plainClassName="rounded-md px-3 py-1.5 text-xs font-medium">
                          {scaleName(mode.label)}
                        </PoolPill>
                      );
                    },
                  )}
                </div>
              </div>
            ))}
          </CollapsiblePanel>

          <CollapsiblePanel id="scale-range" title="Range" icon={NoteIcon} summary={rangeSummary}>
            {running && <p className={LOCKED_NOTE}>Stop to change these.</p>}
            <SwitchRow
              label="Ignore octave"
              checked={ignoreOctave}
              onChange={setIgnoreOctave}
              disabled={running}
              hint="Hides the octave number (e.g. C Dorian instead of C4 Dorian) and accepts the scale played in any octave."
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
                    label: `${instrument.label} (${instrument.range.replace("-", "–")})`,
                  })),
                  { value: CUSTOM_INSTRUMENT_ID, label: "Custom range…" },
                ]}
              />
            </label>
            <Hint>Sets the range roots are drawn from, to match what you&apos;re practicing on.</Hint>

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
              <Hint>The lowest and highest notes to draw scale roots from, e.g. A1-A6.</Hint>
            )}

          </CollapsiblePanel>

          {/* Timing in its own chip: how long each scale shows (Timed), or how long you have to play
              it and the pause after (Listen). Same setting (`intervalSeconds`) either way. */}
          <CollapsiblePanel
            id="scale-timing"
            title={listenMode ? "Time to play" : "Time per scale"}
            icon={StopwatchIcon}
            summary={`${intervalSeconds} s`}
          >
            {running && <p className={LOCKED_NOTE}>Stop to change these.</p>}
            <AdvancedSlider
              label={listenMode ? "Time to play" : "Time per scale"}
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
                  : "How long each scale stays on screen before the next one shows."
              }
            />
            {listenMode && (
              <AdvancedSlider
                label="Time between scales"
                value={advanceDelayMs / 1000}
                unit=" s"
                min={MIN_ADVANCE_DELAY_MS / 1000}
                max={MAX_ADVANCE_DELAY_MS / 1000}
                step={0.25}
                disabled={running}
                hint="How long the graded scale (with its countdown ring) stays on screen before the next one starts."
                onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
              />
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            id="scale-listen"
            title="Microphone"
            icon={MicIcon}
            summary={inputDeviceId ? (inputs.find((d) => d.id === inputDeviceId)?.label ?? "Chosen mic") : "Default mic"}
            asMode
            toggle={{
              checked: listenMode,
              onChange: setListenMode,
              disabled: running,
            }}
          >
            {running && <p className={LOCKED_NOTE}>Stop to change these.</p>}
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
              disabled={!listenMode || running}
              hint="Plays every selected scale in all 12 keys, each in a random octave."
            />

            {!drillMode && (
              <AdvancedSlider
                label="Number of scales"
                value={scaleCount}
                unit=""
                min={MIN_SCALE_COUNT}
                max={MAX_SCALE_COUNT}
                step={1}
                disabled={running || !listenMode}
                onChange={(v) => setScaleCount(v)}
                hint="How many random scales make up one session."
              />
            )}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Audio input</span>
              <Select
                value={inputDeviceId}
                onChange={setInputDeviceId}
                disabled={running}
                options={[
                  { value: "", label: "Default mic" },
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
                hint="A wrong note gets one retry; missing it twice fails the scale instead of failing on the first miss."
              />
              <SwitchRow
                label="Ignore repeated notes"
                checked={ignoreRepeatedNotes}
                onChange={setIgnoreRepeatedNotes}
                disabled={running || !listenMode}
                hint="A fresh attack of the note you just played (e.g. a double pluck, or playing C then C again instead of D) is ignored instead of graded as wrong."
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
            id="scale-sound"
            title="Sound & display"
            icon={SlidersIcon}
          >
            <SwitchRow
              label="Play scale out loud"
              checked={playSound && !listenMode}
              onChange={setPlaySound}
              disabled={listenMode}
              hint="Plays each note of the scale in order as it appears. Not available in listen mode."
            />

            <SwitchRow
              label="Show next scale"
              checked={showNext}
              onChange={setShowNext}
              hint="Shows a preview of the upcoming scale next to the current one."
            />

            <SwitchRow
              label="Show scale notes"
              checked={showScaleNotes}
              onChange={setShowScaleNotes}
              hint="The row of note pills below the circle in listen mode, showing progress through the scale."
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
            <Hint>Which sound plays a scale out loud.</Hint>
          </CollapsiblePanel>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        {status && running && (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium text-muted">
              Next scale in
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
              title={round?.mode.aka && scaleName(round.mode.aka)}
              className={!running ? IDLE_DASH : "relative z-10 font-bold in-[.classic-look]:font-extrabold transition-colors duration-200"}
              style={
                glow
                  ? {
                      color: glow,
                    }
                  : undefined
              }
            >
              {running && round ? (
                // The note on its own line, the scale under it, smaller, so a long scale name
                // never fills the ring edge to edge.
                <span className="flex flex-col items-center gap-1">
                  <span className="whitespace-nowrap text-4xl leading-none sm:text-5xl">{rootLabel(round, roundSeed)}</span>
                  <span className="text-balance text-lg leading-tight sm:text-2xl">{scaleName(round.mode.label)}</span>
                </span>
              ) : (
                mainLabel
              )}
            </p>
            {/* Before the first round, say what's about to happen. */}
            {!running && (
              <p className={IDLE_HINT}>
                {listenMode
                  ? "Press Start, then play each scale. The mic follows along."
                  : "Press Start, then play each scale shown."}
              </p>
            )}
          </div>
          {showNext && nextRound && running && (
            <span
              aria-label={`Next scale ${roundLabel(nextRound, roundSeed + 1)}`}
              className="absolute bottom-1 left-full ml-3 max-w-[9rem] text-sm font-medium text-muted sm:text-base"
            >
              {roundLabel(nextRound, roundSeed + 1)}
            </span>
          )}
        </div>

        {listenMode && running && round && showScaleNotes && (
          <div className="flex flex-wrap justify-center gap-1.5 px-2">
            {round.notes.map((n, i) => {
              const label = noteGlyphs(spellNote(n, accidentalStyle, roundSeed, true));
              const matched = i < scaleProgress;
              const failed = i === scaleProgress && status === "incorrect";
              // Missed once and waiting for a retry (partial-credit mode only).
              const retrying = i === scaleProgress && degreeMiss && !failed;
              const current = i === scaleProgress && !matched && !failed && !retrying;
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
              Scale {progress.index} of {progress.total}
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
                Skip scale
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

      {/* While the results show, their own "Try again" is the one start button. */}
      {!(summary && !running) && (
      <button
        type="button"
        onClick={running ? stop : () => void start()}
        className={startButtonClass(running)}
      >
        {running ? "Stop" : "Start"}
      </button>
      )}
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to start or stop
      </KeyHint>
    </ToolLayout>
  );
}
