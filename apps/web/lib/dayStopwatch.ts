"use client";

import { useSyncExternalStore } from "react";
import { DAY_STOPWATCH_ID, addDays, fromDateKey, todayKey } from "@/lib/practiceLog";
import { queueLogEntry, setDayTimerCoverage } from "@/lib/practiceTimerEngine";

/**
 * The day timer: a stopwatch for the whole day's practice, separate from the routine / task
 * timer (`practiceTimerEngine`). Start it on its own, or it starts itself when a routine or task
 * timer starts; started that way it stops again when the task does (paused, stopped or finished;
 * `PracticeLogGlobal`), while one started on its own keeps going. A plain module (like the Practice Timer),
 * kept in localStorage, so it keeps running across pages and reloads. Time is handed to the
 * Shed Log every 30 seconds, and on pause, as `DAY_STOPWATCH_ID` entries in the timer's queue
 * (`applyTimerEntries` adds them to the day's `stopwatchMs`); `unflushedMs()` is the part not
 * handed over yet, for a live display. It stops itself at midnight.
 */

/** `byTask`: a routine or task timer started it, so it stops when that does. */
type State = { date: string; running: boolean; since: number; byTask?: boolean };

const KEY = "jam-practice-day-stopwatch";
const FLUSH_MS = 30000;

let state: State | null = null;
let loaded = false;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function notify() {
  for (const l of listeners) l();
}

function save() {
  try {
    if (state) window.localStorage.setItem(KEY, JSON.stringify(state));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}

function endOfDay(date: string) {
  const d = fromDateKey(addDays(date, 1));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Hands the time since the last flush to the log (up to midnight of its day). */
function flush() {
  if (!state?.running) return;
  const now = Math.min(Date.now(), endOfDay(state.date));
  const ms = now - state.since;
  if (ms >= 1000) queueLogEntry({ at: now, ms, done: true, session: "Day timer", title: "Day timer", segmentId: DAY_STOPWATCH_ID, link: { routineId: DAY_STOPWATCH_ID, date: state.date } });
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
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as State) : null;
    if (saved?.running) {
      state = saved;
      flush();
      if (state?.running) startTicking();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  } catch {
    state = null;
  }
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
  return () => listeners.delete(l);
}

function getSnapshot(): State | null {
  ensureLoaded();
  return state;
}

/** Starts (or resumes) today's day timer. `byTask`: a routine or task timer is starting it (an
    already running day timer stays as it was). */
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

export function isDayTimerRunning(): boolean {
  ensureLoaded();
  return !!state?.running;
}

/** Time running since the last hand-over to the log — add it to the day's `stopwatchMs` to show
    the live total. */
export function unflushedMs(): number {
  return state?.running ? Math.max(0, Date.now() - state.since) : 0;
}

/** The day timer's state: which day it's running for, or null when it isn't. */
export function useDayTimer(): { running: boolean; date: string | null } {
  const s = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return { running: !!s?.running, date: s?.running ? s.date : null };
}
