"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DAY_TASKS_ID,
  DEFAULT_PREFS,
  type DayLog,
  type Attachment,
  type DayTask,
  type PracticeLogPrefs,
  type Occurrence,
  type PracticeLogData,
  type Routine,
  type AssignedRoutine,
  reconcileAssigned,
  applyTimerEntries,
  pruneDay,
  setDayTaskDone,
  setTaskDone,
  tasksOf,
  todayKey,
} from "@/lib/practiceLog";
import { dayTimerRunningFor, startDayTimer } from "@/lib/dayStopwatch";
import type { PracticeSession } from "@/lib/practiceTimer";
import {
  PENDING_EVENT,
  getServerSnapshot,
  getSnapshot,
  start,
  subscribe,
  takePendingLogEntries,
} from "@/lib/practiceTimerEngine";
import { DEFAULT_SOUND_SETTINGS, SOUND_SETTINGS_KEY } from "@/lib/practiceTimerSound";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/** The Shed Log's routines and days — one synced object (`packages/core/practiceLog.ts`),
    in the account when signed in, else this browser. A few years of daily entries stays well
    under Convex's 1 MB per-document limit; very long notes every day would be what fills it. */
const KEY = "jam-practice-practice-log";
/** `prev` with one day changed (and dropped if it's left empty). */
function withDay(prev: PracticeLogData, key: string, fn: (day: DayLog) => DayLog): PracticeLogData {
  const day = pruneDay(fn(prev.days[key] ?? {}));
  const days = { ...prev.days };
  if (day) days[key] = day;
  else delete days[key];
  return { ...prev, days };
}

const DEFAULTS: PracticeLogData = { routines: [], days: {}, prefs: DEFAULT_PREFS };

/** The freshest value, shared by every component using the hook (the sidebar, the dashboard, the
    page, the global timer/tool-time sync) — so two edits in one tick, or a timer entry arriving
    mid-edit, each build on the last one, whichever component made it. Only set from loaded data. */
let latest: PracticeLogData | null = null;

export function usePracticeLog({ drainTimer = false }: { drainTimer?: boolean } = {}) {
  const [data, update, ready] = useSyncedSettings(KEY, DEFAULTS);
  // The Shed Log is for account holders — timer steps are only taken in when signed in.
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    // Not ready = signing in or out: the next account's (or browser's) data hasn't loaded yet.
    latest = ready ? data : null;
  }, [data, ready]);

  const write = useCallback(
    (fn: (prev: PracticeLogData) => PracticeLogData) => {
      const next = fn(latest ?? data);
      latest = next;
      update({ routines: next.routines, days: next.days, prefs: next.prefs });
    },
    [update, data],
  );

  // Steps the Practice Timer ran (routines or plain sessions) are added once the log has loaded.
  useEffect(() => {
    if (!drainTimer || !ready || !isAuthenticated) return;
    const drain = () => {
      const entries = takePendingLogEntries();
      if (entries.length) write((prev) => applyTimerEntries(prev, entries));
    };
    drain();
    window.addEventListener(PENDING_EVENT, drain);
    return () => window.removeEventListener(PENDING_EVENT, drain);
  }, [drainTimer, ready, isAuthenticated, write]);

  const updateDay = useCallback(
    (key: string, fn: (day: DayLog) => DayLog) =>
      write((prev) => {
        const next = pruneDay(fn(prev.days[key] ?? {}));
        const days = { ...prev.days };
        if (next) days[key] = next;
        else delete days[key];
        return { ...prev, days };
      }),
    [write],
  );

  const updateOccurrence = useCallback(
    (key: string, routineId: string, fn: (occ: Occurrence) => Occurrence) =>
      updateDay(key, (day) => ({ ...day, routines: { ...(day.routines ?? {}), [routineId]: fn(day.routines?.[routineId] ?? {}) } })),
    [updateDay],
  );

  /** Checks a routine's task off (logging its planned minutes, on the day timer too unless it's
      running) or on again (taking them back). */
  const toggleTask = useCallback(
    (key: string, routineId: string, taskId: string) =>
      write((prev) => {
        const routine = prev.routines.find((r) => r.id === routineId);
        const occ = prev.days[key]?.routines?.[routineId] ?? {};
        const task = routine ? tasksOf(routine, occ).find((t) => t.id === taskId) : undefined;
        if (!task) return prev;
        const r = setTaskDone(occ, task, !(occ.done ?? []).includes(taskId), !dayTimerRunningFor(key));
        return withDay(prev, key, (day) => ({ ...day, routines: { ...(day.routines ?? {}), [routineId]: r.occ }, stopwatchMs: Math.max(0, (day.stopwatchMs ?? 0) + r.watch) }));
      }),
    [write],
  );

  /** Checks every task of a routine on a day off, or on again. */
  const setAllTasks = useCallback(
    (key: string, routineId: string, done: boolean) =>
      write((prev) => {
        const routine = prev.routines.find((r) => r.id === routineId);
        if (!routine) return prev;
        let occ = prev.days[key]?.routines?.[routineId] ?? {};
        let watch = 0;
        const addTime = !dayTimerRunningFor(key);
        for (const t of tasksOf(routine, occ)) {
          const r = setTaskDone(occ, t, done, addTime);
          occ = r.occ;
          watch += r.watch;
        }
        return withDay(prev, key, (day) => ({ ...day, routines: { ...(day.routines ?? {}), [routineId]: occ }, stopwatchMs: Math.max(0, (day.stopwatchMs ?? 0) + watch) }));
      }),
    [write],
  );

  const saveRoutine = useCallback(
    (routine: Routine) =>
      write((prev) => {
        const r = { ...routine, updatedAt: Date.now() };
        const exists = prev.routines.some((x) => x.id === r.id);
        return { ...prev, routines: exists ? prev.routines.map((x) => (x.id === r.id ? r : x)) : [...prev.routines, r] };
      }),
    [write],
  );

  /** Deletes the routine and what was logged for it (its recordings stay, on their days). */
  const deleteRoutine = useCallback(
    (id: string) =>
      write((prev) => {
        const days: Record<string, DayLog> = {};
        for (const [key, day] of Object.entries(prev.days)) {
          const routines = { ...(day.routines ?? {}) };
          delete routines[id];
          const next = pruneDay({ ...day, routines, added: (day.added ?? []).filter((x) => x !== id) });
          if (next) days[key] = next;
        }
        return { ...prev, routines: prev.routines.filter((r) => r.id !== id), days };
      }),
    [write],
  );

  const addToDay = useCallback(
    (key: string, routineId: string) =>
      updateDay(key, (day) => ({ ...day, added: [...(day.added ?? []).filter((x) => x !== routineId), routineId] })),
    [updateDay],
  );

  const removeFromDay = useCallback(
    (key: string, routineId: string) =>
      updateDay(key, (day) => {
        const routines = { ...(day.routines ?? {}) };
        delete routines[routineId];
        return { ...day, routines, added: (day.added ?? []).filter((x) => x !== routineId) };
      }),
    [updateDay],
  );

  const saveDayTask = useCallback(
    (key: string, task: DayTask) =>
      updateDay(key, (day) => {
        const tasks = day.tasks ?? [];
        return { ...day, tasks: tasks.some((t) => t.id === task.id) ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task] };
      }),
    [updateDay],
  );

  const removeDayTask = useCallback(
    (key: string, id: string) => updateDay(key, (day) => ({ ...day, tasks: (day.tasks ?? []).filter((t) => t.id !== id) })),
    [updateDay],
  );

  const toggleDayTask = useCallback(
    (key: string, id: string) =>
      updateDay(key, (day) => {
        let watch = 0;
        const addTime = !dayTimerRunningFor(key);
        const tasks = (day.tasks ?? []).map((t) => {
          if (t.id !== id) return t;
          const r = setDayTaskDone(t, !t.done, addTime);
          watch = r.watch;
          return r.task;
        });
        return { ...day, tasks, stopwatchMs: Math.max(0, (day.stopwatchMs ?? 0) + watch) };
      }),
    [updateDay],
  );

  /** Adds (or, negative, takes off) time on the day timer — logging time by hand. */
  const addDayTime = useCallback(
    (key: string, ms: number) => updateDay(key, (day) => ({ ...day, stopwatchMs: Math.max(0, (day.stopwatchMs ?? 0) + ms) })),
    [updateDay],
  );

  /** Moves a one-off task to another day. */
  const moveDayTask = useCallback(
    (from: string, to: string, task: DayTask) => {
      if (from === to) return saveDayTask(to, task);
      removeDayTask(from, task.id);
      saveDayTask(to, task);
    },
    [saveDayTask, removeDayTask],
  );

  const setPrefs = useCallback((patch: Partial<PracticeLogPrefs>) => write((prev) => ({ ...prev, prefs: { ...prev.prefs, ...patch } })), [write]);

  /** Brings in, updates or drops the routines teachers assigned (Lessons). */
  const syncAssigned = useCallback(
    (assigned: AssignedRoutine[]) => {
      const base = latest ?? data;
      if (reconcileAssigned(base, assigned, todayKey()) !== base) write((prev) => reconcileAssigned(prev, assigned, todayKey()));
    },
    [write, data],
  );

  return { data, ready, syncAssigned, updateDay, setAllTasks, addDayTime, saveDayTask, removeDayTask, toggleDayTask, moveDayTask, setPrefs, updateOccurrence, toggleTask, saveRoutine, deleteRoutine, addToDay, removeFromDay };
}

/** A task's first attached tool, as a timer step's `tool` (opened when the step starts). */
function taskTool(attachments: Attachment[] | undefined): { tool?: string } {
  const tool = attachments?.find((a) => a.kind === "tool");
  return tool && tool.kind === "tool" ? { tool: tool.href } : {};
}

/** The Practice Timer as the Shed Log uses it: what's running, and starting a routine on it.
    A routine runs as a timer session whose segments are its tasks, so the sidebar widget, alarm
    mode and surviving a reload all work the same, and each finished task is checked off. */
export function useRoutineTimer() {
  const engine = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [sound] = useSyncedSettings(SOUND_SETTINGS_KEY, DEFAULT_SOUND_SETTINGS);

  /** `occ`: that day's occurrence, so tasks added for just that day run too. */
  function startRoutine(routine: Routine, date: string, fromTaskId?: string, onlyThis = false, occ?: Occurrence) {
    let tasks = tasksOf(routine, occ).filter((t) => t.minutes > 0);
    if (fromTaskId) {
      const i = tasks.findIndex((t) => t.id === fromTaskId);
      if (i >= 0) tasks = onlyThis ? [tasks[i]] : tasks.slice(i);
    }
    if (!tasks.length) return;
    const session: PracticeSession = {
      id: `routine:${routine.id}:${date}`,
      name: routine.name || "Routine",
      type: "custom",
      // A tool attached for just that day counts too (after the task's own).
      segments: tasks.map((t) => ({ id: t.id, title: t.title || "Task", minutes: t.minutes, ...taskTool([...t.attachments, ...(occ?.taskAttachments?.[t.id] ?? [])]) })),
      updatedAt: Date.now(),
      link: { routineId: routine.id, date },
    };
    start(session, sound.soundEnabled, sound.toneId, sound.alarmMode, sound.fullScreenAlert);
    // The day timer runs alongside: starting a routine starts it if it isn't going already (and
    // then it stops with the routine, `PracticeLogGlobal`).
    if (date === todayKey()) startDayTimer(true);
  }

  /** Runs a day's own tasks on the timer: just `only`, or every one not done yet. */
  function startDayTasks(date: string, tasks: DayTask[], only?: string) {
    const list = (only ? tasks.filter((t) => t.id === only) : tasks.filter((t) => !t.done)).filter((t) => t.minutes > 0);
    if (!list.length) return;
    const session: PracticeSession = {
      id: `day:${date}`,
      name: list.length === 1 ? list[0].title || "Task" : "Today's tasks",
      type: "custom",
      segments: list.map((t) => ({ id: t.id, title: t.title || "Task", minutes: t.minutes, ...taskTool(t.attachments) })),
      updatedAt: Date.now(),
      link: { routineId: DAY_TASKS_ID, date },
    };
    start(session, sound.soundEnabled, sound.toneId, sound.alarmMode, sound.fullScreenAlert);
    if (date === todayKey()) startDayTimer(true);
  }

  /** The running step's task id when the timer is running this routine on this day. */
  function runningTask(routineId: string, date: string): string | null {
    const s = engine?.session;
    if (!engine || !s || s.type !== "custom" || s.link?.routineId !== routineId || s.link.date !== date) return null;
    return s.segments[engine.index]?.id ?? null;
  }

  return { engine, startRoutine, startDayTasks, runningTask };
}
