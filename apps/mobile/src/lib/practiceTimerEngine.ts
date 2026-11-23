import type { PracticeSession, RunSegment } from '@jam-practice/core/practiceTimer';
import { stepAt as coreStepAt } from '@jam-practice/core/practiceTimer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Vibration } from 'react-native';

import {
  cancelAllTimerNotifications,
  dismissOngoingTimerNotification,
  postOngoingTimerNotification,
  scheduleTimerNotification,
} from '@/lib/notifications';
import { playTransitionChime } from '@/lib/practiceTimerChime';
import { queueLogEntry } from '@/lib/practiceLogQueue';

/** `stepAt`, with a name for a step left unnamed ("Step 2"), so the running view, the bar, the
    notifications and the Shed Log never show a blank title or "Next:" with nothing after it. */
function stepAt(session: PracticeSession, index: number): RunSegment | null {
  const step = coreStepAt(session, index);
  return step && !step.title.trim() ? { ...step, title: `Step ${index + 1}` } : step;
}

export type EngineState = {
  /** A snapshot of the session being run, not a live reference — editing or deleting the saved
      session mid-run doesn't affect (or crash) the run already in progress. */
  session: PracticeSession;
  index: number;
  current: RunSegment;
  next: RunSegment | null;
  /** Wall-clock ms (`Date.now()`), not a page-load-relative clock — this is the one timer in the
      app that has to keep counting correctly across the app being fully backgrounded or killed and
      reopened, not just across a re-render. */
  startedAt: number;
  durationMs: number;
  paused: boolean;
  /** Snapshotted remaining time at the moment of pausing, so resuming can recompute a correct
      `startedAt` (as if the step had started that much earlier) instead of losing track of
      progress. `null` whenever not paused. */
  remainingMsAtPause: number | null;
  soundEnabled: boolean;
  /** Instead of silently auto-advancing when a step's time runs out, hold on `alarming: true`
      (below) and keep vibrating/holding until `skip()`/`stop()` is explicitly called. */
  alarmMode: boolean;
  /** Only meaningful while `alarmMode` is also on — also shows a full-screen prompt
      (`components/PracticeTimerAlert.tsx`) while `alarming`, not just the repeating vibration. */
  fullScreenAlert: boolean;
  /** True once the current step's time has fully elapsed with `alarmMode` on, and the engine is
      holding here — repeating a vibration pattern (if `soundEnabled`) and waiting for `skip()`
      (dismiss and move on) or `stop()` — instead of having already auto-advanced. While true,
      `current`/`startedAt`/`durationMs` still describe the step that just ended (there's nothing
      newly counting down), and `pause()`/`resume()` don't apply — there's nothing to pause. */
  alarming: boolean;
};

const STORAGE_KEY = 'jam-practice-timer-running';
const ALARM_VIBRATE_PATTERN = [0, 500, 500];
/** How often the repeating alarm chime re-plays while `alarming` — the same cadence
    `apps/web/lib/practiceTimerEngine.ts`'s own `ALARM_REPEAT_MS` already uses. */
const ALARM_CHIME_REPEAT_MS = 1500;
/** How many *future* steps' own end-of-segment notifications get scheduled at once, every time the
    plan changes (a fresh start, or a resume) — not just the very next one. A session's whole shape
    is already known up front (every step's own duration — `stepAt` is a pure function of the
    session and an index), so scheduling the entire upcoming cascade means every segment boundary
    still gets a real, OS-delivered notification even if the app is never reopened again until the
    whole session's done — not just the first one. Capped rather than unbounded specifically for an
    indefinite Pomodoro (`totalCycles: null`, which has no natural end at all) — 24 steps ahead is
    comfortably more than one practice session's realistic segment count, and the cascade simply
    regenerates itself (covering the next 24 again) the next time the app is opened and the engine
    re-hydrates, same as any other restore. */
const MAX_SCHEDULED_STEPS = 24;

let state: EngineState | null = null;
let hydrated = false;
let hydrating = false;
const listeners = new Set<() => void>();
const stepToolListeners = new Set<(href: string) => void>();
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let alarmChimeIntervalId: ReturnType<typeof setInterval> | null = null;

/** "Ends 3:45 PM" — the ongoing notification's own body text while a step is actively counting
    down. An *absolute* end time, not a relative "12m left" countdown, deliberately: there's no
    native equivalent here to a real ticking chronometer notification (that needs a dedicated
    Android foreground-service module, a materially bigger undertaking than this), so any text this
    code posts is necessarily static until the next real update — a relative countdown would read as
    *wrong* the moment real time passes, while an absolute clock time stays true no matter when
    someone actually glances at it. */
function formatEndTime(whenMs: number): string {
  const d = new Date(whenMs);
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const period = hours24 < 12 ? 'AM' : 'PM';
  return `Ends ${hours12}:${minutes} ${period}`;
}

/** Reposts the "what's running right now" notification (`lib/notifications.ts`'s own
    `postOngoingTimerNotification`, which replaces in place under a fixed identifier rather than
    stacking) from whatever `state` currently is — called after every meaningful state change
    (a step starting, pausing, resuming, alarming) rather than on a timer, since there's nothing to
    *tick* here, only a handful of discrete moments where what it should say actually changes. */
function updateOngoingNotification() {
  if (!state) return;
  if (state.alarming) {
    void postOngoingTimerNotification({ title: state.current.title, body: "Time's up!" });
  } else if (state.paused) {
    void postOngoingTimerNotification({ title: state.current.title, body: 'Paused' });
  } else {
    void postOngoingTimerNotification({
      title: state.current.title,
      body: formatEndTime(state.startedAt + state.durationMs),
    });
  }
}

function notify() {
  for (const listener of listeners) listener();
}

/** Calls `listener` with the tool's href when a step with a tool starts, as it happens (start,
    skip, auto-advance, Continue after an alarm) — never when a run is restored as the app reopens,
    so opening the app mid-step doesn't jump to another screen. The phone's version of the website's
    `STEP_TOOL_EVENT`; `lib/useOpenStepTools.ts` opens the tool. */
export function onStepTool(listener: (href: string) => void): () => void {
  stepToolListeners.add(listener);
  return () => {
    stepToolListeners.delete(listener);
  };
}

function persist() {
  void (state
    ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    : AsyncStorage.removeItem(STORAGE_KEY)
  ).catch(() => {
    // storage unavailable — the in-memory state is still correct for the rest of this session
  });
}

/** Records the current step for the Shed Log (like the website's engine): `done` when its time ran
    out, otherwise how long it ran before Skip or Stop. Breaks aren't practice, so they're left out.
    A routine's steps carry its `link`, so they check off its tasks; anything else is a session on
    the day it ran. Taken in by the Shed Log signed in (`lib/practiceLogQueue.ts`). */
function recordStep(done: boolean) {
  if (!state || state.current.isBreak) return;
  const elapsed = state.paused
    ? state.durationMs - (state.remainingMsAtPause ?? state.durationMs)
    : Math.min(state.durationMs, Date.now() - state.startedAt);
  const session = state.session;
  queueLogEntry({
    at: Date.now(),
    ms: done ? state.durationMs : Math.max(0, elapsed),
    done,
    session: session.name || 'Practice Timer',
    // The step's own title (blank stays blank: the Shed Log shows the session's name for it).
    title: coreStepAt(session, state.index)?.title ?? state.current.title,
    segmentId: session.type === 'custom' ? (session.segments[state.index]?.id ?? '') : 'pomodoro',
    ...(session.type === 'custom' && session.link ? { link: session.link } : {}),
  });
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
  // time had already run out" (e.g. right after restoring from the app being reopened).
  timeoutId = setTimeout(advance, Math.max(0, ms));
}

/** Replaces whatever notification cascade is currently pending with a fresh one, starting at
    `fromIndex` (whose own remaining time is `remainingMsForFromIndex`, which is its *full*
    duration for a step that just started, or less for a step being resumed mid-way through).
    Always cancels every previously-scheduled Practice Timer notification first — this is the one
    and only place a cascade is scheduled, so every caller (a fresh step loading, or a resume) gets
    this "replace, don't append" behavior for free rather than having to remember to cancel first
    themselves (the natural, in-app `advance()` path in particular needs this: the cascade
    scheduled when the *previous* step started already covers this new step's own notification, so
    without cancelling first, every step boundary would schedule an extra, duplicate copy on top of
    the still-pending one from before). */
async function rescheduleCascade(
  session: PracticeSession,
  fromIndex: number,
  remainingMsForFromIndex: number,
  soundEnabled: boolean,
) {
  await cancelAllTimerNotifications();
  let offsetMs = remainingMsForFromIndex;
  let idx = fromIndex;
  for (let i = 0; i < MAX_SCHEDULED_STEPS; i++) {
    const step = stepAt(session, idx);
    if (!step) return;
    const nextStep = stepAt(session, idx + 1);
    await scheduleTimerNotification({
      title: nextStep ? `${step.title} finished` : 'Session complete',
      body: nextStep ? `Next: ${nextStep.title}` : `${step.title} was the last step.`,
      secondsFromNow: offsetMs / 1000,
      sound: soundEnabled,
    });
    if (!nextStep) return;
    offsetMs += Math.max(1, Math.round(nextStep.minutes * 60 * 1000));
    idx += 1;
  }
}

function stopAlarmVibration() {
  Vibration.cancel();
  if (alarmChimeIntervalId !== null) {
    clearInterval(alarmChimeIntervalId);
    alarmChimeIntervalId = null;
  }
}

/** Starts (or restarts) the repeating alarm — a short double-pulse vibration (`Vibration`'s own
    `repeat` flag) plus the same two-note chime `loadStep` plays on an ordinary transition, replayed
    every `ALARM_CHIME_REPEAT_MS` via a plain `setInterval` — the native sibling of the web engine's
    own `startAlarmSound`, now that `react-native-audio-api` makes a real synthesized chime possible
    here too (see `lib/practiceTimerChime.ts`'s own doc comment for why this wasn't always true). A
    looping *local notification* would still stack a new banner in the tray every repeat (the one
    thing a vibration/chime can do that a notification can't without that downside), so both of
    those stay exactly as they were — only the silent "just vibrate" half of this is new. */
function startAlarmVibration() {
  stopAlarmVibration();
  Vibration.vibrate(ALARM_VIBRATE_PATTERN, true);
  playTransitionChime();
  alarmChimeIntervalId = setInterval(playTransitionChime, ALARM_CHIME_REPEAT_MS);
}

/** Loads the step at `index` as the new current step, or ends the run if the session is over.
    `chime` is false only for the one internal case (restoring after time fully elapsed while the
    app was closed/backgrounded) where an immediate vibration the instant the app reopens would be
    surprising — the OS notification scheduled back when the step *actually* started already
    covers telling the user about it. */
function loadStep(
  session: PracticeSession,
  index: number,
  soundEnabled: boolean,
  alarmMode: boolean,
  fullScreenAlert: boolean,
  chime: boolean,
) {
  stopAlarmVibration();
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
    alarmMode,
    fullScreenAlert,
    alarming: false,
  };
  notify();
  persist();
  updateOngoingNotification();
  scheduleAdvance(durationMs);
  void rescheduleCascade(session, index, durationMs, soundEnabled);
  if (soundEnabled && chime) {
    Vibration.vibrate(120);
    playTransitionChime();
  }
  // `chime` is false only when restoring as the app reopens, which shouldn't jump to another screen.
  const tool = current.tool;
  if (chime && tool) for (const listener of stepToolListeners) listener(tool);
}

/** Enters the "time's up, waiting on you" state instead of loading the next step — what a normal
    `advance()` does instead of auto-advancing when `alarmMode` is on. */
function enterAlarm() {
  if (!state) return;
  state = { ...state, alarming: true };
  notify();
  persist();
  updateOngoingNotification();
  if (state.soundEnabled) startAlarmVibration();
}

function advance() {
  if (!state) return;
  recordStep(true);
  if (state.alarmMode) {
    enterAlarm();
    return;
  }
  loadStep(state.session, state.index + 1, state.soundEnabled, state.alarmMode, state.fullScreenAlert, true);
}

/** Kicks off the one-time async `AsyncStorage` read, restoring a still-running session across an
    app restart/relaunch — the native sibling of the web engine's own (synchronous)
    `ensureInitialized`, just async since `AsyncStorage` is. `getSnapshot()` returns `null` until
    this resolves (same "briefly nothing, then the real value pops in" shape every other
    `AsyncStorage`-backed hook in this app already has — see `useSyncedSettings.ts`), which in
    practice is a single frame, not a visible gap. */
function ensureHydrated() {
  if (hydrated || hydrating) return;
  hydrating = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      hydrated = true;
      if (!raw) return;
      const saved = JSON.parse(raw) as EngineState;
      const current = stepAt(saved.session, saved.index);
      if (!current) return; // the saved run had already ended
      if (saved.paused) {
        state = { ...saved, current, next: stepAt(saved.session, saved.index + 1) };
        notify();
        updateOngoingNotification(); // re-assert in case it was dismissed (device reboot, swipe)
        return; // paused: nothing to schedule, just restore the frozen state as-is
      }
      const remaining = saved.durationMs - (Date.now() - saved.startedAt);
      if (remaining <= 0) {
        if (saved.alarmMode) {
          // Was already alarming, or its time ran out while the app was closed — either way, hold
          // here on this same step rather than silently moving past it; no vibration on restore,
          // same "don't surprise someone the instant the app reopens" reasoning as the non-alarm
          // branch below.
          state = { ...saved, current, next: stepAt(saved.session, saved.index + 1) };
          if (!saved.alarming) recordStep(true);
          state = { ...state, alarming: true };
          notify();
          updateOngoingNotification();
        } else {
          // Enough real time passed while the app was away that this step is already over — move
          // on to the next one, starting fresh, rather than trying to simulate every step that
          // might have silently elapsed in between.
          state = { ...saved, current, next: stepAt(saved.session, saved.index + 1) };
          recordStep(true);
          loadStep(saved.session, saved.index + 1, saved.soundEnabled, saved.alarmMode, saved.fullScreenAlert, false);
        }
      } else {
        // Still genuinely counting down — the notification cascade scheduled back when this step
        // started is still correctly pending at the OS level regardless of what happened to this
        // app's own process meanwhile, so there's nothing to reschedule here, only the in-memory
        // state and the local JS auto-advance timer.
        state = { ...saved, current, next: stepAt(saved.session, saved.index + 1) };
        notify();
        updateOngoingNotification(); // re-assert in case it was dismissed (device reboot, swipe)
        scheduleAdvance(remaining);
      }
    })
    .catch(() => {
      hydrated = true;
      // unreadable/corrupt storage — start with nothing running, same as a fresh install
    });
}

export function subscribe(listener: () => void) {
  ensureHydrated();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): EngineState | null {
  ensureHydrated();
  return state;
}

/** Starts a fresh run of `session` from its first step. Silently does nothing for a session with
    no steps at all (an empty custom segment list) — nothing meaningful to run. */
export function start(session: PracticeSession, soundEnabled: boolean, alarmMode: boolean, fullScreenAlert: boolean) {
  clearScheduled();
  loadStep(session, 0, soundEnabled, alarmMode, fullScreenAlert, true);
}

export function pause() {
  if (!state || state.paused || state.alarming) return;
  const remaining = state.durationMs - (Date.now() - state.startedAt);
  clearScheduled();
  void cancelAllTimerNotifications(); // nothing should fire while paused
  state = { ...state, paused: true, remainingMsAtPause: Math.max(0, remaining) };
  notify();
  persist();
  updateOngoingNotification();
}

export function resume() {
  if (!state || !state.paused || state.remainingMsAtPause === null) return;
  const remaining = state.remainingMsAtPause;
  state = {
    ...state,
    paused: false,
    // Backdate startedAt by however much of this step had already elapsed, so the existing
    // "elapsed = now - startedAt" math keeps working unchanged.
    startedAt: Date.now() - (state.durationMs - remaining),
    remainingMsAtPause: null,
  };
  notify();
  persist();
  updateOngoingNotification();
  scheduleAdvance(remaining);
  void rescheduleCascade(state.session, state.index, remaining, state.soundEnabled);
}

/** Skips straight to the next step — same as if the current one's time had just run out (with
    `alarmMode` off), or dismisses an active alarm and moves on (with it on). Either way, silences
    any repeating alarm vibration; `loadStep` itself replaces the whole pending notification
    cascade with a fresh one starting from the new step, so nothing further needs cancelling here. */
export function skip() {
  if (!state) return;
  // While alarming, the step already counted as done when its time ran out.
  if (!state.alarming) recordStep(false);
  loadStep(state.session, state.index + 1, state.soundEnabled, state.alarmMode, state.fullScreenAlert, true);
}

/** Ends the run entirely (what was done of the current step goes to the Shed Log). */
export function stop() {
  if (state && !state.alarming) recordStep(false);
  endRun();
}

function endRun() {
  clearScheduled();
  stopAlarmVibration();
  void cancelAllTimerNotifications();
  void dismissOngoingTimerNotification();
  state = null;
  notify();
  persist();
}
