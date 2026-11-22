import { DAY_STOPWATCH_ID, addDays, fromDateKey, todayKey } from '@jam-practice/core/practiceLog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { queueLogEntry, setDayTimerCoverage } from '@/lib/practiceLogQueue';

/**
 * The day timer — the native sibling of the website's `lib/dayStopwatch.ts`: a stopwatch for the
 * whole day's practice, separate from the routine / task timer (the Practice Timer engine). Start
 * it on its own, or it starts itself when a routine or task timer starts; started that way it
 * stops again when that run does (paused, stopped, finished or replaced; `ShedLogGlobal`), while one
 * started on its own keeps going. Kept on the phone (`jam-practice-day-stopwatch`, the website's key), so it
 * keeps running while the app is closed: it's a start time, not a ticking count. Its time is
 * handed to the Shed Log every 30 seconds, on pause and when the app goes to the background, as
 * `DAY_STOPWATCH_ID` entries (`applyTimerEntries` adds them to the day's `stopwatchMs`). It stops
 * itself at midnight. Each device has its own (as each browser does on the website).
 */

/** `byTask`: a routine or task timer started it, so it stops when that does. */
type State = { date: string; running: boolean; since: number; byTask?: boolean };

const KEY = 'jam-practice-day-stopwatch';
const FLUSH_MS = 30000;

let state: State | null = null;
let loaded = false;
let loading = false;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function notify() {
  for (const l of listeners) l();
}

function save() {
  void (state ? AsyncStorage.setItem(KEY, JSON.stringify(state)) : AsyncStorage.removeItem(KEY)).catch(() => {});
}

function endOfDay(date: string) {
  const d = fromDateKey(addDays(date, 1));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Hands the time since the last hand-over to the log (up to midnight of its day). */
function flush() {
  if (!state?.running) return;
  const now = Math.min(Date.now(), endOfDay(state.date));
  const ms = now - state.since;
  if (ms >= 1000) {
    queueLogEntry({ at: now, ms, done: true, session: 'Day timer', title: 'Day timer', segmentId: DAY_STOPWATCH_ID, link: { routineId: DAY_STOPWATCH_ID, date: state.date } });
  }
  state = { ...state, since: now };
  // Past midnight: that day's timer stops.
  if (Date.now() >= endOfDay(state.date)) {
    state = null;
    stopTicking();
  }
  save();
  notify();
}

function startTicking() {
  if (timer === null) timer = setInterval(flush, FLUSH_MS);
}
function stopTicking() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function ensureLoaded() {
  if (loaded || loading) return;
  loading = true;
  AppState.addEventListener('change', (s) => {
    if (s !== 'active') flush();
  });
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      const saved = raw ? (JSON.parse(raw) as State) : null;
      // Started on this phone before the saved copy was read: that one wins.
      if (saved?.running && !state) {
        state = saved;
        flush();
        if (state?.running) startTicking();
      }
    })
    .catch(() => {})
    .finally(() => {
      loaded = true;
      notify();
    });
}

setDayTimerCoverage((date) => {
  ensureLoaded();
  return !!state?.running && state.date === date;
});

/** Whether the day timer is running for `date` (then that day's practice is already being counted). */
export function dayTimerRunningFor(date: string): boolean {
  ensureLoaded();
  return !!state?.running && state.date === date;
}

function subscribe(l: () => void) {
  ensureLoaded();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): State | null {
  ensureLoaded();
  return state;
}

/** Starts (or resumes) today's day timer. `byTask`: a routine or task timer is starting it (an
    already running day timer stays as it was, so one you started yourself stays yours). */
export function startDayTimer(byTask = false) {
  ensureLoaded();
  if (state?.running && state.date === todayKey()) return;
  if (state?.running) flush();
  state = { date: todayKey(), running: true, since: Date.now(), ...(byTask ? { byTask: true } : {}) };
  startTicking();
  save();
  notify();
}

/** Pauses it (its time so far is kept on the day). */
export function pauseDayTimer() {
  ensureLoaded();
  if (!state?.running) return;
  flush();
  state = null;
  stopTicking();
  save();
  notify();
}

/** Stops it without keeping the time since the last hand-over (for clearing a day's time). */
export function discardDayTimer() {
  ensureLoaded();
  if (!state) return;
  state = null;
  stopTicking();
  save();
  notify();
}

/** Whether the running day timer was started by a routine or task timer. */
export function dayTimerStartedByTask(): boolean {
  ensureLoaded();
  return !!state?.running && !!state.byTask;
}

/** The day timer's state: which day it's running for (or null when it isn't), and when its time
    was last handed to the log (`since`) — the live total is the day's `stopwatchMs` plus
    `now - since`. */
export function useDayTimer(): { running: boolean; date: string | null; since: number } {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  return { running: !!s?.running, date: s?.running ? s.date : null, since: s?.since ?? 0 };
}
