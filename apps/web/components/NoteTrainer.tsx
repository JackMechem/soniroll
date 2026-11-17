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
  ParsedRange,
  midiToNote,
  parseNote,
  parseRange,
  randomNoteInRange,
} from "@/lib/noteRange";
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
import { scheduleClick } from "@/lib/clickEngine";
import { getAudioContext } from "@/lib/metronome";
import AdvancedSlider from "@/components/AdvancedSlider";
import CountdownLabel from "@/components/CountdownLabel";
import CountdownRing from "@/components/CountdownRing";
import ElapsedTimer from "@/components/ElapsedTimer";
import { useToolActivity } from "@/lib/toolTime";
import { GRADE_TAG, PANEL_LIST, PANEL_ROW, PRIMARY_BUTTON, PRIMARY_BUTTON_SM, RESULTS_PANEL, SECONDARY_BUTTON, SECONDARY_BUTTON_SM, TEXT_BUTTON_DANGER, startButtonClass } from "@/components/learning/quizUi";

const MIN_INTERVAL_SECONDS = 0.5;
const MAX_INTERVAL_SECONDS = 10;
const DEFAULT_INTERVAL_SECONDS = 3;

const NOTE_DURATION_SECONDS = 1;

/** "Shed a string" covers the open note up to two octaves above it (24 semitones) — a reasonable
    single-string span on a fretted or bowed instrument in normal playing position — clamped to
    the instrument's own declared range in case that's the tighter limit. */
const STRING_SPAN_SEMITONES = 24;

const MIN_NOTE_COUNT = 5;
const MAX_NOTE_COUNT = 50;
const FRAME_MS = 30;

/** "Shed weak notes" pulls in every struggling note in range, but caps out here so a long
    history doesn't turn into a marathon session. */
const MAX_WEAK_QUEUE = MAX_NOTE_COUNT;

const MIN_ADVANCE_DELAY_MS = 0;
const MAX_ADVANCE_DELAY_MS = 8000;
const DEFAULT_ADVANCE_DELAY_MS = 1500;

/** With octave ignored, every note is graded by letter name alone, so the pool is just these 12. */
const IGNORE_OCTAVE_RANGE = "C4-B4";

type Session = {
  total: number;
  index: number;
  target: string | null;
  best: Grade | null;
  /** A stable wrong note was played during this note. */
  wrongPlayed: boolean;
  results: Grade[];
  notes: string[];
  stable: number;
  last: number | null;
  /** The previous note's pitch, so its tail ringing into this note isn't graded against it. */
  previousMidi: number | null;
  /** False until the previous note has stopped (silence or a genuinely new pitch). */
  settled: boolean;
  /** Drill mode only: notes left to play, popped from the front; a full miss goes back on the end. */
  queue: string[];
};

type Summary = { results: Grade[]; notes: string[] };

/** What kind of session `start()` should run. `"string"` carries which of the current
    instrument's strings (an index into its `strings` array) to shed. */
type StartRequest =
  | { kind: "normal" }
  | { kind: "weak" }
  | { kind: "string"; stringIndex: number };

/** Everything that affects what notes are drawn, how they're timed, and how they're graded —
    two attempts only get compared against each other if all of this matches. */
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

const PANEL_IDS = ["notes", "note-listen", "note-sound"];
const SETTINGS_KEY = "jam-practice-note-trainer";
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
  accidentalStyle: "sharp" as AccidentalStyle,
  inputDeviceId: "",
};

export default function NoteTrainer() {
  const [settings, updateSettings] = useSyncedSettings(
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
  );
  const {
    customRange,
    intervalSeconds,
    playSound,
    showNext,
    toneId,
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
  const noteCount = Math.min(
    MAX_NOTE_COUNT,
    Math.max(MIN_NOTE_COUNT, Math.round(settings.noteCount)),
  );
  const instrumentId =
    settings.instrumentId === CUSTOM_INSTRUMENT_ID ||
    INSTRUMENTS.some((i) => i.id === settings.instrumentId)
      ? settings.instrumentId
      : INSTRUMENTS[0].id;
  const instrument = INSTRUMENTS.find((i) => i.id === instrumentId);
  const setInstrumentId = (instrumentId: string) =>
    updateSettings({ instrumentId });
  const setCustomRange = (customRange: string) =>
    updateSettings({ customRange });
  const setIntervalSeconds = (intervalSeconds: number) =>
    updateSettings({ intervalSeconds });
  const setPlaySound = (playSound: boolean) => updateSettings({ playSound });
  const setShowNext = (showNext: boolean) => updateSettings({ showNext });
  const setToneId = (toneId: string) => updateSettings({ toneId });
  const setListenMode = (listenMode: boolean) => updateSettings({ listenMode });
  const setNoteCount = (noteCount: number) => updateSettings({ noteCount });
  const setDrillMode = (drillMode: boolean) => updateSettings({ drillMode });
  const setRequeuePartials = (requeuePartials: boolean) =>
    updateSettings({ requeuePartials });
  const setAccidentalStyle = (accidentalStyle: AccidentalStyle) =>
    updateSettings({ accidentalStyle });
  const setInputDeviceId = (inputDeviceId: string) =>
    updateSettings({ inputDeviceId });
  const setSoundFeedback = (soundFeedback: boolean) =>
    updateSettings({ soundFeedback });
  const [note, setNote] = useState<string | null>(null);
  const [nextNote, setNextNote] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/note-trainer", running);
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
  // Mirrors noteSeedRef for the render-time reads (noteLabel in JSX); the ref itself is only
  // read from the audio callback, which runs outside render.
  const [noteSeed, setNoteSeed] = useState(0);
  // So "Try again" repeats a "Shed weak notes" run instead of falling back to a normal one.
  const [lastRequest, setLastRequest] = useState<StartRequest>({ kind: "normal" });
  // "Shed a string" always shows (and grades) the full note+octave, regardless of the "Ignore
  // octave" setting — knowing which specific pitch you're on matters when it's just one string.
  // Left in place after the session ends too, so the results screen matches what was practiced.
  const effectiveIgnoreOctave =
    lastRequest.kind === "string" ? false : ignoreOctave;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noteTimerRef = useRef({ startedAt: 0, durationMs: 1000 });
  const upcomingRef = useRef<string | null>(null);
  // Bumped every time a new target note is chosen, so "random" accidental spelling stays put
  // for as long as that note's on screen instead of re-rolling on every re-render.
  const noteSeedRef = useRef(0);
  // When the current listen-mode session started, for the "your time" shown when it finishes.
  const sessionStartRef = useRef<number | null>(null);
  const playSoundRef = useRef(playSound);
  const toneIdRef = useRef(toneId);
  const inputRef = useRef<AudioInput | null>(null);
  const mountedRef = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  const listenCfg = useRef({
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
  const countdownClickTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The source of truth for noteStats *during* a running session: a session bumps this once per
  // note, several times before the next `updateSettings({ noteStats })` round-trips back through
  // a render, so reading the settings value itself here would silently drop all but the last bump.
  const noteStatsRef = useRef(settings.noteStats);

  useEffect(() => {
    playSoundRef.current = playSound;
    toneIdRef.current = toneId;
    listenCfg.current = {
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

  // Keeps the ref caught up with anything that changed it from outside a running session (the
  // initial load from localStorage, or the "Clear stats" button).
  useEffect(() => {
    noteStatsRef.current = settings.noteStats;
  }, [settings.noteStats]);

  const isCustom = instrumentId === CUSTOM_INSTRUMENT_ID;
  // Ignoring octave means only the letter name is graded, so the instrument's range doesn't
  // matter — the note pool collapses to one octave's worth (12 notes).
  const rangeInput = ignoreOctave
    ? IGNORE_OCTAVE_RANGE
    : isCustom
      ? customRange
      : (INSTRUMENTS.find((i) => i.id === instrumentId)?.range ?? "");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
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

  function clearCountdownClicks() {
    countdownClickTimeouts.current.forEach(clearTimeout);
    countdownClickTimeouts.current = [];
  }

  /** Records one more grade for this note in the lifetime struggle stats. */
  function bumpNoteStat(note: string, grade: Grade) {
    noteStatsRef.current = bumpGradeCounts(noteStatsRef.current, note, grade);
    updateSettings({ noteStats: noteStatsRef.current });
  }

  function clearNoteStats() {
    noteStatsRef.current = {};
    updateSettings({ noteStats: {} });
  }

  /** Every struggling note in `stats` that's actually playable in `range`, worst first, capped so
      a long history doesn't turn "shed weak notes" into a marathon. A plain function of its
      arguments (not the ref) so it's just as safe to call during render (for the button's count)
      as from inside a running session (via `noteStatsRef.current`, for freshness there). */
  function weakNotesInRange(
    stats: Record<string, GradeCounts>,
    range: ParsedRange,
  ): string[] {
    return rankWeak(stats)
      .filter((entry) => {
        const midi = parseNote(entry.key);
        return midi !== null && midi >= range.lowMidi && midi <= range.highMidi;
      })
      .slice(0, MAX_WEAK_QUEUE)
      .map((entry) => entry.key);
  }

  /** A short neutral click, for "Sound feedback" — reuses the metronome's click tone rather than
      a pitched note, since this is a cue, not a note to imitate. */
  function playClick() {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    scheduleClick(ctx, ctx.currentTime + 0.02, "sine", 1000, 0.5, 0.05);
  }

  /** One click per whole second of the countdown to the next note (so it ticks in step with
      the "Next note in Ns" readout), for "Sound feedback". */
  function scheduleCountdownClicks(durationMs: number) {
    clearCountdownClicks();
    if (!listenCfg.current.soundFeedback) return;
    const wholeSeconds = Math.floor(durationMs / 1000);
    for (let s = 1; s <= wholeSeconds; s++) {
      countdownClickTimeouts.current.push(setTimeout(playClick, s * 1000));
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
  }

  function stop() {
    endSession();
  }

  /** Locks in a correct/partial result and starts the pause-before-next-note countdown:
      retargets the ring/label (previously counting down the max time) to the pause instead, so
      it visibly counts down to the next note, and plays the click/tick sounds when
      "Sound feedback" is on. */
  function lockInResult(grade: Grade, index: number) {
    const pauseMs = listenCfg.current.advanceDelayMs;
    noteTimerRef.current = { startedAt: performance.now(), durationMs: pauseMs };
    if (listenCfg.current.soundFeedback) {
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

  /** Called ~30 times a second with whatever pitch the input is hearing. */
  function handleFrame(freq: number | null) {
    const session = sessionRef.current;
    if (!session || session.target === null) return;
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
    // Reuses the current target's seed so a "random" spelling doesn't flicker every frame.
    const shownNote = spellNote(
      heardNote,
      cfg.accidentalStyle,
      noteSeedRef.current,
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
    // wait until it's stopped or a genuinely different pitch is heard.
    if (!session.settled) {
      if (nearest === session.previousMidi) return;
      session.settled = true;
    }

    // Once the note has been played right (cleanly or after a slip), later notes don't change it.
    if (session.best === "correct" || session.best === "partial") return;

    const played = gradePitch(freq, session.target, {
      ignoreOctave: cfg.ignoreOctave,
      toleranceCents: cfg.toleranceCents,
      refA: cfg.refA,
    });
    if (played === "incorrect") {
      session.wrongPlayed = true;
      if (session.best !== "incorrect") {
        session.best = "incorrect";
        setStatus("incorrect");
      }
    } else {
      // A wrong note before the right one only earns partial credit.
      const result: Grade =
        session.wrongPlayed && cfg.partialCredit ? "partial" : "correct";
      session.best = result;
      setStatus(result);
      lockInResult(result, session.index);
    }
  }

  /** `"weak"` starts a focused session on just the notes tracked as struggles (see
      `weakNotesInRange`) instead of the normal quiz/drill. `"string"` instead sheds one specific
      string of the current instrument — every note from its open string up to
      `STRING_SPAN_SEMITONES` above it (clamped to the instrument's own range), always graded and
      shown with the octave regardless of "Ignore octave" (see `effectiveIgnoreOctave`), computed
      straight from the instrument's own declared range rather than `rangeInput`/`customRange`, so
      it's unaffected by whatever those happen to be set to. Both modes always listen (regardless
      of the "Listen mode" toggle, which is switched on to match) and never touch the timed
      History list, since a short focused session isn't a fair comparison against a full one. */
  async function start(request: StartRequest = { kind: "normal" }) {
    setLastRequest(request);
    const weak = request.kind === "weak";
    // Either kind of focused session (weak or one string) shares the same queue machinery and
    // both skip the timed History list — see the doc comment above.
    const focused = weak || request.kind === "string";
    const stringOpenNote =
      request.kind === "string" ? instrument?.strings?.[request.stringIndex] : undefined;

    let range: ParsedRange | null;
    if (request.kind === "string") {
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
    const weakQueueSeed = weak
      ? weakNotesInRange(noteStatsRef.current, range)
      : [];
    if (weak && weakQueueSeed.length === 0) {
      setError(
        "No struggling notes in this range yet — misses in listen mode build this list up.",
      );
      return;
    }
    setError(null);
    setSummary(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    inputRef.current?.stop();
    inputRef.current = null;

    const listening = focused ? true : listenMode;
    if (focused && !listenMode) updateSettings({ listenMode: true });
    // "Drill every note", "shed weak notes" and "shed a string" all play through a fixed queue
    // rather than `noteCount` random draws — same machinery either way, just a different queue.
    const drilling = focused ? true : listening && drillMode;
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
        ? shuffled(weakQueueSeed)
        : drilling
          ? shuffled(
              Array.from({ length: range.highMidi - range.lowMidi + 1 }, (_, i) =>
                midiToNote(range.lowMidi + i),
              ),
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
      clearCountdownClicks();
      const session = sessionRef.current;
      if (session) {
        // Lock in the note that just finished; silence counts as a miss.
        const finishedGrade = session.best ?? "incorrect";
        if (session.target !== null) {
          session.results.push(finishedGrade);
          session.notes.push(session.target);
          bumpNoteStat(session.target, finishedGrade);
          // Drill mode: a full miss goes back on the end of the queue, and optionally so
          // does a partial.
          if (
            drilling &&
            (finishedGrade === "incorrect" ||
              (finishedGrade === "partial" && requeuePartials))
          ) {
            session.queue.push(session.target);
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
          if (focused) {
            // A weed-out session over a handful of struggling notes, or over just one string,
            // isn't a fair comparison against a full quiz/drill, so it doesn't join that
            // leaderboard.
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
            // Compare against times recorded before this one, so tying/beating an empty
            // history (a first attempt) still counts as a new best.
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
        // A held note ringing on shouldn't be graded against the next target; wait for it to
        // stop (silence, or a pitch that isn't this one) before grading resumes.
        session.previousMidi =
          session.target !== null ? parseNote(session.target) : null;
        session.settled = session.previousMidi === null;
        session.best = null;
        session.wrongPlayed = false;
        session.stable = 0;
        session.last = null;
        setStatus(null);
        setHeard(null);
        // Drill mode's total grows when a note gets requeued, so "X of Y" reflects what's
        // actually left rather than staying fixed at the range size.
        setProgress(
          drilling
            ? {
                index: session.index,
                total: session.index + session.queue.length,
              }
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
        next = upcomingRef.current ?? randomNoteInRange(range);
        const isLast = session ? session.index >= session.total : false;
        following = isLast ? null : randomNoteInRange(range);
        upcomingRef.current = following;
      }
      if (session) session.target = next;
      noteSeedRef.current++;
      setNoteSeed(noteSeedRef.current);
      noteTimerRef.current = {
        startedAt: performance.now(),
        durationMs: seconds * 1000,
      };
      setNote(next);
      setNextNote(following);
      if (playSoundRef.current && !session) {
        playNote(
          next,
          Math.min(NOTE_DURATION_SECONDS, seconds),
          toneIdRef.current,
        );
      }
    };

    // Moving on early (a correct note, or the skip button) restarts the timer so the next
    // note gets its own full max time rather than continuing on the old note's schedule.
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

  // With "Ignore octave" on, the octave number is left out everywhere notes are shown — except
  // during (or just after) a "Shed a string" session, which always shows it.
  const noteLabel = (n: string, seq = 0) =>
    spellNote(n, accidentalStyle, seq, effectiveIgnoreOctave);
  const mainLabel = note ? noteLabel(note, noteSeed) : "—";
  // "Both" spellings (e.g. "C#/Db") is wider than a single note name, so it needs to shrink
  // to still fit inside the circle.
  const mainLabelIsDouble = mainLabel.includes("/");
  const glow = running && status ? GRADE_COLOR[status] : null;
  // The countdown ring only makes sense while a timer is actually running down.
  // A max-time timer now always runs while a session is active, even in "next note when
  // correct" mode, so the ring can just track `running`.
  const showCountdown = running;
  const score = summary ? scoreOf(summary.results) : 0;
  const tally = (grade: Grade) =>
    summary?.results.filter((g) => g === grade).length ?? 0;
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
  const matchingHistory = history.filter((h) =>
    sameConfig(h.config, currentConfig),
  );
  const bestMs = matchingHistory.length
    ? Math.min(...matchingHistory.map((h) => h.elapsedMs))
    : null;
  const weakEntries = rankWeak(settings.noteStats);
  const parsedRange = parseRange(rangeInput);
  const weakCountInRange = parsedRange
    ? weakNotesInRange(settings.noteStats, parsedRange).length
    : 0;

  return (
    <ToolLayout
      title="Note Trainer"
      presets={toolPresets("note-trainer", settings, updateSettings)}
      credit="Idea by Rob Moreno"
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
                  No struggles tracked yet — a wrong or partial note in listen mode adds it here.
                </p>
              ) : (
                <div className={PANEL_LIST}>
                  {weakEntries.map((entry) => (
                    <div
                      key={entry.key}
                      className={PANEL_ROW}
                    >
                      <span className="font-medium tabular-nums">
                        {noteLabel(entry.key)}
                      </span>
                      <span className="flex items-center gap-2 text-xs tabular-nums">
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
                onClick={() => void start({ kind: "weak" })}
                disabled={running || weakCountInRange === 0}
                className={PRIMARY_BUTTON_SM}
              >
                Shed weak notes{weakCountInRange > 0 && ` (${weakCountInRange})`}
              </button>
              {weakEntries.length > 0 && (
                <button
                  type="button"
                  onClick={clearNoteStats}
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
          <CollapsiblePanel id="notes" title="Notes" icon={NoteIcon} summary={rangeInput}>
            <SwitchRow
              label="Ignore octave"
              checked={ignoreOctave}
              onChange={(checked) => updateSettings({ ignoreOctave: checked })}
              disabled={running}
              hint="Collapses the note pool to one octave (12 notes) and, in listen mode, accepts the right note in any octave."
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
                disabled={running || ignoreOctave}
                options={[
                  ...INSTRUMENTS.map((instrument) => ({
                    value: instrument.id,
                    label: `${instrument.label} (${instrument.range})`,
                  })),
                  { value: CUSTOM_INSTRUMENT_ID, label: "Custom range…" },
                ]}
              />
            </label>
            <Hint>Sets the range notes are drawn from, to match what you&apos;re practicing on.</Hint>

            {isCustom && !ignoreOctave && (
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
            {isCustom && !ignoreOctave && (
              <Hint>The lowest and highest notes to draw from, e.g. A1-A6.</Hint>
            )}

            {instrument?.strings && (
              <div className="flex flex-col gap-2 text-sm">
                <span className="font-medium text-muted">Shed a string</span>
                <div className="flex flex-wrap gap-2">
                  {instrument.strings.map((openNote, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => void start({ kind: "string", stringIndex: i })}
                      disabled={running}
                      className={`${SECONDARY_BUTTON_SM} tabular-nums`}
                    >
                      {spellNote(openNote, accidentalStyle, i, false)}
                    </button>
                  ))}
                </div>
                <Hint>
                  Starts a listen-mode session on every note of just that string — its open note
                  up to two octaves above it (or the top of {instrument.label}&apos;s range, if
                  that&apos;s lower) — always shown and graded with the octave, regardless of
                  Ignore octave above.
                </Hint>
              </div>
            )}

            {/* In listen mode this becomes "Max time", shown in the Listen mode section instead. */}
            {!listenMode && (
              <AdvancedSlider
                label="Interval"
                value={intervalSeconds}
                unit="s"
                min={MIN_INTERVAL_SECONDS}
                max={MAX_INTERVAL_SECONDS}
                step={0.5}
                disabled={running}
                onChange={setIntervalSeconds}
                hint="How long each note stays on screen before the next one shows."
              />
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            id="note-listen"
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
              value={intervalSeconds}
              unit="s"
              min={MIN_INTERVAL_SECONDS}
              max={MAX_INTERVAL_SECONDS}
              step={0.5}
              disabled={running}
              onChange={setIntervalSeconds}
              hint="How long you have to play each note before it's marked a miss and moves on."
            />

            <AdvancedSlider
              label="Time between notes"
              value={advanceDelayMs / 1000}
              unit="s"
              min={MIN_ADVANCE_DELAY_MS / 1000}
              max={MAX_ADVANCE_DELAY_MS / 1000}
              step={0.25}
              disabled={running}
              hint="How long the graded note (with its countdown ring) stays on screen before the next one starts."
              onChange={(v) => updateSettings({ advanceDelayMs: Math.round(v * 1000) })}
            />

            <SwitchRow
              label="Sound feedback"
              checked={soundFeedback}
              onChange={setSoundFeedback}
              disabled={running}
              hint="A click each second of the countdown, plus a click the instant a note is graded."
            />

            <SwitchRow
              label="Drill every note"
              checked={drillMode}
              onChange={setDrillMode}
              disabled={!listenMode || running}
              hint="Plays every note in the range once, in a random order, instead of a fixed count."
            />

            {drillMode ? (
              <SwitchRow
                label="Revisit partials"
                checked={requeuePartials}
                onChange={setRequeuePartials}
                disabled={!listenMode || running}
                hint="A note you got right after a wrong attempt goes back on the end of the queue too, not just full misses."
              />
            ) : (
              <label className="flex flex-col gap-2 text-sm">
                <span className="flex items-center justify-between font-medium text-muted">
                  Number of notes
                  <span className="tabular-nums text-foreground">
                    {noteCount}
                  </span>
                </span>
                <input
                  type="range"
                  min={MIN_NOTE_COUNT}
                  max={MAX_NOTE_COUNT}
                  step={1}
                  value={noteCount}
                  onChange={(e) => setNoteCount(Number(e.target.value))}
                  disabled={running || !listenMode}
                  style={
                    {
                      "--progress": `${((noteCount - MIN_NOTE_COUNT) / (MAX_NOTE_COUNT - MIN_NOTE_COUNT)) * 100}%`,
                    } as React.CSSProperties
                  }
                  className="slider h-6 w-full cursor-pointer disabled:cursor-default disabled:opacity-60"
                />
              </label>
            )}
            {!drillMode && <Hint>How many random notes make up one session.</Hint>}

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
                label="Half credit after a wrong note"
                checked={partialCredit}
                onChange={(checked) =>
                  updateSettings({ partialCredit: checked })
                }
                disabled={running || !listenMode}
                hint="A wrong note played before the right one still counts, but only for half credit instead of a full point."
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
            id="note-sound"
            title="Sound & display"
            icon={SlidersIcon}
          >
            <SwitchRow
              label="Play note out loud"
              checked={playSound && !listenMode}
              onChange={setPlaySound}
              disabled={listenMode}
              hint="Sounds each note when it appears, so you can hear it as well as see its name. Not available in listen mode."
            />

            <SwitchRow
              label="Show next note"
              checked={showNext}
              onChange={setShowNext}
              hint="Shows a preview of the upcoming note next to the current one."
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
            <Hint>Which sound plays notes out loud.</Hint>
          </CollapsiblePanel>
        </>
      }
    >
      <div className="flex flex-col items-center gap-2">
        {status && running && listenMode && (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium text-muted">
              Next note in
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
          <div className="relative flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48">
            <CountdownRing active={showCountdown} timerRef={noteTimerRef} />
            <h1
              className={`relative z-10 font-bold tabular-nums transition-colors duration-200 ${
                mainLabelIsDouble
                  ? "text-3xl sm:text-4xl"
                  : "text-6xl sm:text-7xl"
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
            </h1>
            {/* Before the first round, say what's about to happen. */}
            {!note && !running && (
              <p className="absolute inset-x-0 bottom-0 z-10 text-sm text-muted sm:bottom-3">
                {listenMode
                  ? "Press Start, then play each note. The mic checks it."
                  : "Press Start, then play each note shown."}
              </p>
            )}
          </div>
          {showNext && nextNote && running && (
            <span
              aria-label={`Next note ${noteLabel(nextNote, noteSeed + 1)}`}
              className="absolute bottom-1 left-full ml-3 text-xl font-medium tabular-nums text-muted sm:text-2xl"
            >
              {noteLabel(nextNote, noteSeed + 1)}
            </span>
          )}
        </div>
        {running && progress && (
          <div className="flex flex-col items-center gap-0.5 text-sm text-muted">
            <span className="tabular-nums">
              Note {progress.index} of {progress.total}
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
                Skip note
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
            {summary.notes.map((n, i) => (
              <span
                key={i}
                title={GRADE_LABEL[summary.results[i]]}
                className={`${GRADE_TAG} tabular-nums`}
                style={{
                  color: GRADE_COLOR[summary.results[i]],
                  background: `color-mix(in srgb, ${GRADE_COLOR[summary.results[i]]} 15%, transparent)`,
                }}
              >
                {noteLabel(n, i)}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void start(lastRequest)}
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
