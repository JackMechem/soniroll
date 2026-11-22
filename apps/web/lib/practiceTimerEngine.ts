import { stepAt } from "@/lib/practiceTimer";
import type { PracticeSession, RunSegment } from "@/lib/practiceTimer";
import { playNote } from "@/lib/tones";
import { DAY_STOPWATCH_ID, type PendingTimerEntry, toDateKey } from "@/lib/practiceLog";

export type EngineState = {
  /** A snapshot of the session being run, not a live reference — editing or deleting the saved
      session mid-run doesn't affect (or crash) the run already in progress. */
  session: PracticeSession;
  index: number;
  current: RunSegment;
  next: RunSegment | null;
  /** Wall-clock ms (Date.now(), not performance.now()) the current step started counting from —
      deliberately wall-clock, not the page-load-relative clock every other timer/ring component
      in this app uses, since this one (uniquely) needs to keep counting correctly across an
      actual page reload, not just across a re-render. Consumers that want to feed this into the
      existing `CountdownRing`/`CountdownLabel` (which read `performance.now()`) convert via
      `performance.timeOrigin` — see `components/PracticeTimerRing.tsx` — rather than this file
      reaching into those components' assumptions. */
  startedAt: number;
  durationMs: number;
  paused: boolean;
  /** Snapshotted remaining time at the moment of pausing, so resuming can recompute a correct
      `startedAt` (as if the step had started that much earlier) instead of losing track of
      progress. `null` whenever not paused. */
  remainingMsAtPause: number | null;
  soundEnabled: boolean;
  toneId: string;
  /** Instead of silently auto-advancing when a step's time runs out, hold on `alarming: true`
      (below) and keep repeating the chime until `skip()`/`stop()` is explicitly called. */
  alarmMode: boolean;
  /** Only meaningful while `alarmMode` is also on — also shows a full-screen prompt
      (`components/PracticeTimerAlert.tsx`) while `alarming`, not just the repeating sound. */
  fullScreenAlert: boolean;
  /** True once the current step's time has fully elapsed with `alarmMode` on, and the engine is
      holding here — repeating the alarm sound (if `soundEnabled`) and waiting for `skip()`
      (dismiss and move on) or `stop()` — instead of having already auto-advanced. While true,
      `current`/`startedAt`/`durationMs` still describe the step that just ended (there's nothing
      newly counting down), and `pause()`/`resume()` don't apply — there's nothing to pause. */
  alarming: boolean;
};

const STORAGE_KEY = "jam-practice-timer-running";
/** Steps run (finished or cut short) waiting to be added to the Shed Log — it takes them
    (`takePendingLogEntries`) when it's open, so time is logged even if it wasn't open at the time. */
const PENDING_KEY = "jam-practice-log-pending";
export const PENDING_EVENT = "practice-log-pending";
/** Fired on `window` when a step with a tool starts (`detail`: the tool's href), as it happens:
    never when a run is restored on page load. `useOpenStepTools` opens it. */
export const STEP_TOOL_EVENT = "practice-timer-step-tool";
const ALARM_REPEAT_MS = 1500;

let state: EngineState | null = null;
let initialized = false;
const listeners = new Set<() => void>();
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let alarmIntervalId: ReturnType<typeof setInterval> | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    if (state) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable
  }
}

/** Records the current step for the Shed Log: `done` when its time ran out, otherwise how long
    it ran before being skipped or stopped. Breaks aren't practice, so they're left out. */
function recordStep(done: boolean) {
  if (!state || state.current.isBreak) return;
  const elapsed = state.paused
    ? state.durationMs - (state.remainingMsAtPause ?? state.durationMs)
    : Math.min(state.durationMs, Date.now() - state.startedAt);
  const ms = done ? state.durationMs : Math.max(0, elapsed);
  const session = state.session;
  const entry: PendingTimerEntry = {
    at: Date.now(),
    ms,
    done,
    session: session.name || "Practice Timer",
    title: state.current.title,
    segmentId: session.type === "custom" ? (session.segments[state.index]?.id ?? "") : "pomodoro",
    ...(session.type === "custom" && session.link ? { link: session.link } : {}),
  };
  queueLogEntry(entry);
}

/** Whether the day timer is running for a day — set by `dayStopwatch.ts` (which imports this
    file, so it registers itself rather than being imported here). */
let dayTimerCovers: ((date: string) => boolean) | null = null;
export function setDayTimerCoverage(fn: (date: string) => boolean) {
  dayTimerCovers = fn;
}

/** Adds practice to the queue the Shed Log takes in — the timer's steps, and time in tools.
    Each entry notes whether the day timer was running for its day (`covered`): if it wasn't, the
    time is added to the day timer too, so the day timer is the day's whole practice time. */
export function queueLogEntry(entry: PendingTimerEntry) {
  if (entry.segmentId !== DAY_STOPWATCH_ID && entry.covered === undefined) {
    entry = { ...entry, covered: dayTimerCovers?.(entry.link?.date ?? toDateKey(new Date(entry.at))) ?? false };
  }
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    const list = raw ? (JSON.parse(raw) as PendingTimerEntry[]) : [];
    list.push(entry);
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-500)));
    window.dispatchEvent(new Event(PENDING_EVENT));
  } catch {
    // storage unavailable — this practice just isn't logged
  }
}

/** Takes (and clears) the steps waiting to be logged. */
export function takePendingLogEntries(): PendingTimerEntry[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    window.localStorage.removeItem(PENDING_KEY);
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? (list as PendingTimerEntry[]) : [];
  } catch {
    return [];
  }
}

function clearScheduled() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function scheduleAdvance(ms: number) {
  clearScheduled();
  // A negative/zero delay still fires on the next tick, which is exactly right for "this step's
  // time had already run out" (e.g. right after restoring from a reload).
  timeoutId = setTimeout(advance, Math.max(0, ms));
}

function playTransitionChime(toneId: string) {
  playNote("C5", 0.3, toneId);
  setTimeout(() => playNote("G5", 0.4, toneId), 150);
}

function stopAlarmSound() {
  if (alarmIntervalId !== null) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
}

/** Starts (or restarts) the repeating alarm chime — the same two-note transition chime, just
    played again every `ALARM_REPEAT_MS` until `stopAlarmSound()` is called (`skip()`/`stop()`, or
    the run ending naturally). */
function startAlarmSound(toneId: string) {
  stopAlarmSound();
  playTransitionChime(toneId);
  alarmIntervalId = setInterval(() => playTransitionChime(toneId), ALARM_REPEAT_MS);
}

/** Loads the step at `index` as the new current step, or ends the run if the session is over.
    `chime` is false only for the one internal case (restoring after time fully elapsed while the
    tab was closed) where playing a sound the instant a page loads would be surprising — and
    browsers would very likely block an unprompted autoplay there anyway. */
function loadStep(
  session: PracticeSession,
  index: number,
  soundEnabled: boolean,
  toneId: string,
  alarmMode: boolean,
  fullScreenAlert: boolean,
  chime: boolean,
) {
  stopAlarmSound();
  const current = stepAt(session, index);
  if (!current) {
    endRun();
    return;
  }
  const next = stepAt(session, index + 1);
  const durationMs = Math.max(1, Math.round(current.minutes * 60 * 1000));
  state = {
    session,
    index,
    current,
    next,
    startedAt: Date.now(),
    durationMs,
    paused: false,
    remainingMsAtPause: null,
    soundEnabled,
    toneId,
    alarmMode,
    fullScreenAlert,
    alarming: false,
  };
  notify();
  persist();
  scheduleAdvance(durationMs);
  if (soundEnabled && chime) playTransitionChime(toneId);
  // `chime` is false only when restoring on page load, which shouldn't jump to another page.
  if (chime && current.tool) window.dispatchEvent(new CustomEvent(STEP_TOOL_EVENT, { detail: current.tool }));
}

/** Enters the "time's up, waiting on you" state instead of loading the next step — what a normal
    `advance()` does instead of auto-advancing when `alarmMode` is on. */
function enterAlarm() {
  if (!state) return;
  state = { ...state, alarming: true };
  notify();
  persist();
  if (state.soundEnabled) startAlarmSound(state.toneId);
}

function advance() {
  if (!state) return;
  recordStep(true);
  if (state.alarmMode) {
    enterAlarm();
    return;
  }
  loadStep(
    state.session,
    state.index + 1,
    state.soundEnabled,
    state.toneId,
    state.alarmMode,
    state.fullScreenAlert,
    true,
  );
}

function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as EngineState;
    const current = stepAt(saved.session, saved.index);
    if (!current) return; // the saved run had already ended
    if (saved.paused) {
      state = { ...saved, current, next: stepAt(saved.session, saved.index + 1) };
      // Paused: nothing to schedule, just restore the frozen state as-is.
      return;
    }
    const remaining = saved.durationMs - (Date.now() - saved.startedAt);
    if (remaining <= 0) {
      if (saved.alarmMode) {
        // Was already alarming, or its time ran out while the tab was closed — either way, hold
        // here on this same step rather than silently moving past it; that's the whole point of
        // alarm mode. No sound on restore, same autoplay-would-likely-be-blocked reasoning as the
        // non-alarm-mode branch below.
        state = { ...saved, current, next: stepAt(saved.session, saved.index + 1) };
        if (!saved.alarming) recordStep(true);
        state = { ...state, alarming: true };
      } else {
        // Enough real time passed while the tab was closed that this step is already over — move
        // on to the next one, starting fresh, rather than trying to simulate every step that
        // might have silently elapsed in between (could be a lot, for a long-closed tab and a
        // short segment) or a chime firing the instant the page loads.
        state = { ...saved, current, next: stepAt(saved.session, saved.index + 1) };
        recordStep(true);
        loadStep(
          saved.session,
          saved.index + 1,
          saved.soundEnabled,
          saved.toneId,
          saved.alarmMode,
          saved.fullScreenAlert,
          false,
        );
      }
    } else {
      state = { ...saved, current, next: stepAt(saved.session, saved.index + 1) };
      scheduleAdvance(remaining);
    }
  } catch {
    // ignore unreadable/corrupt storage
  }
}

export function subscribe(listener: () => void) {
  ensureInitialized();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): EngineState | null {
  ensureInitialized();
  return state;
}

export function getServerSnapshot(): EngineState | null {
  return null;
}

/** Starts a fresh run of `session` from its first step. Silently does nothing for a session with
    no steps at all (an empty custom segment list) — nothing meaningful to run. */
export function start(
  session: PracticeSession,
  soundEnabled: boolean,
  toneId: string,
  alarmMode: boolean,
  fullScreenAlert: boolean,
) {
  clearScheduled();
  loadStep(session, 0, soundEnabled, toneId, alarmMode, fullScreenAlert, true);
}

export function pause() {
  if (!state || state.paused || state.alarming) return;
  const remaining = state.durationMs - (Date.now() - state.startedAt);
  clearScheduled();
  state = { ...state, paused: true, remainingMsAtPause: Math.max(0, remaining) };
  notify();
  persist();
}

export function resume() {
  if (!state || !state.paused || state.remainingMsAtPause === null) return;
  const remaining = state.remainingMsAtPause;
  state = {
    ...state,
    paused: false,
    // Backdate startedAt by however much of this step had already elapsed, so the existing
    // "elapsed = now - startedAt" math (CountdownRing, etc.) keeps working unchanged.
    startedAt: Date.now() - (state.durationMs - remaining),
    remainingMsAtPause: null,
  };
  notify();
  persist();
  scheduleAdvance(remaining);
}

/** Skips straight to the next step — same as if the current one's time had just run out (with
    `alarmMode` off), or dismisses an active alarm and moves on (with it on). Either way, silences
    any repeating alarm sound first. */
export function skip() {
  if (!state) return;
  // While alarming, the step already counted as done when its time ran out.
  if (!state.alarming) recordStep(false);
  loadStep(
    state.session,
    state.index + 1,
    state.soundEnabled,
    state.toneId,
    state.alarmMode,
    state.fullScreenAlert,
    true,
  );
}

/** Ends the run entirely. */
export function stop() {
  if (state && !state.alarming) recordStep(false);
  endRun();
}

function endRun() {
  clearScheduled();
  stopAlarmSound();
  state = null;
  notify();
  persist();
}
