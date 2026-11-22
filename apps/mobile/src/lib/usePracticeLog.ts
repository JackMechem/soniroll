import type { PracticeSession } from '@jam-practice/core/practiceTimer';
import {
  DAY_TASKS_ID,
  DEFAULT_PREFS,
  applyTimerEntries,
  pruneDay,
  reconcileAssigned,
  setDayTaskDone,
  setTaskDone,
  tasksOf,
  todayKey,
  type AssignedRoutine,
  type Attachment,
  type DayLog,
  type DayTask,
  type Occurrence,
  type PracticeLogData,
  type PracticeLogPrefs,
  type Routine,
} from '@jam-practice/core/practiceLog';
import { useCallback, useSyncExternalStore } from 'react';

import { dayTimerRunningFor, startDayTimer } from '@/lib/dayStopwatch';
import { createLiveDoc, useLiveDoc } from '@/lib/liveSynced';
import { getSnapshot, start, subscribe } from '@/lib/practiceTimerEngine';
import { useSyncedSettings } from '@/lib/useSyncedSettings';

/**
 * The Shed Log's data on the phone — the native sibling of the website's `lib/usePracticeLog.ts`:
 * the same synced object (`jam-practice-practice-log`: routines, days and prefs; the shapes and
 * maths are `packages/core/practiceLog.ts`), so the website and the phone share one log. It follows
 * the account live (`lib/liveSynced.ts`). The Shed Log is for account holders: screens show the
 * sign-in pitch signed out, and nothing is logged then.
 */

export const PRACTICE_LOG_KEY = 'jam-practice-practice-log';
const doc = createLiveDoc(PRACTICE_LOG_KEY);

export const EMPTY_LOG: PracticeLogData = { routines: [], days: {}, prefs: DEFAULT_PREFS };

/** The stored object as the log's shape (whatever's missing or odd gets its default). */
const shaped = new WeakMap<object, PracticeLogData>();
function shape(raw: Record<string, unknown>): PracticeLogData {
  let out = shaped.get(raw);
  if (!out) {
    const prefs = raw.prefs && typeof raw.prefs === 'object' ? (raw.prefs as Partial<PracticeLogPrefs>) : {};
    out = {
      routines: Array.isArray(raw.routines) ? (raw.routines as Routine[]) : [],
      days: raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days) ? (raw.days as Record<string, DayLog>) : {},
      prefs: { ...DEFAULT_PREFS, ...prefs },
    };
    shaped.set(raw, out);
  }
  return out;
}

/** Changes the log (the freshest copy, whoever changed it last). Ignored until it's loaded. */
function write(fn: (prev: PracticeLogData) => PracticeLogData) {
  doc.write((raw) => {
    const next = fn(shape(raw));
    // Fields this app doesn't know about are kept.
    return { ...raw, routines: next.routines, days: next.days, prefs: next.prefs };
  });
}

/** `prev` with one day changed (and dropped if it's left empty). */
function withDay(prev: PracticeLogData, key: string, fn: (day: DayLog) => DayLog): PracticeLogData {
  const day = pruneDay(fn(prev.days[key] ?? {}));
  const days = { ...prev.days };
  if (day) days[key] = day;
  else delete days[key];
  return { ...prev, days };
}

// The changes, as plain functions (they don't depend on the component calling them).
const actions = {
  write,
  updateDay: (key: string, fn: (day: DayLog) => DayLog) => write((prev) => withDay(prev, key, fn)),
  updateOccurrence: (key: string, routineId: string, fn: (occ: Occurrence) => Occurrence) =>
    write((prev) => withDay(prev, key, (day) => ({ ...day, routines: { ...(day.routines ?? {}), [routineId]: fn(day.routines?.[routineId] ?? {}) } }))),
  /** Checks a routine's task off (logging its planned minutes, on the day timer too unless it's
      running) or on again (taking them back). */
  toggleTask: (key: string, routineId: string, taskId: string) =>
    write((prev) => {
      const routine = prev.routines.find((r) => r.id === routineId);
      const occ = prev.days[key]?.routines?.[routineId] ?? {};
      const task = routine ? tasksOf(routine, occ).find((t) => t.id === taskId) : undefined;
      if (!task) return prev;
      const r = setTaskDone(occ, task, !(occ.done ?? []).includes(taskId), !dayTimerRunningFor(key));
      return withDay(prev, key, (day) => ({ ...day, routines: { ...(day.routines ?? {}), [routineId]: r.occ }, stopwatchMs: Math.max(0, (day.stopwatchMs ?? 0) + r.watch) }));
    }),
  /** Checks every task of a routine on a day off, or on again. */
  setAllTasks: (key: string, routineId: string, done: boolean) =>
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
  saveRoutine: (routine: Routine) =>
    write((prev) => {
      const r = { ...routine, updatedAt: Date.now() };
      const exists = prev.routines.some((x) => x.id === r.id);
      return { ...prev, routines: exists ? prev.routines.map((x) => (x.id === r.id ? r : x)) : [...prev.routines, r] };
    }),
  /** Deletes the routine and what was logged for it. */
  deleteRoutine: (id: string) =>
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
  addToDay: (key: string, routineId: string) =>
    write((prev) => withDay(prev, key, (day) => ({ ...day, added: [...(day.added ?? []).filter((x) => x !== routineId), routineId] }))),
  removeFromDay: (key: string, routineId: string) =>
    write((prev) =>
      withDay(prev, key, (day) => {
        const routines = { ...(day.routines ?? {}) };
        delete routines[routineId];
        return { ...day, routines, added: (day.added ?? []).filter((x) => x !== routineId) };
      }),
    ),
  saveDayTask: (key: string, task: DayTask) =>
    write((prev) =>
      withDay(prev, key, (day) => {
        const tasks = day.tasks ?? [];
        return { ...day, tasks: tasks.some((t) => t.id === task.id) ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task] };
      }),
    ),
  removeDayTask: (key: string, id: string) => write((prev) => withDay(prev, key, (day) => ({ ...day, tasks: (day.tasks ?? []).filter((t) => t.id !== id) }))),
  toggleDayTask: (key: string, id: string) =>
    write((prev) =>
      withDay(prev, key, (day) => {
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
    ),
  /** Adds (or, negative, takes off) time on the day timer — logging time by hand. */
  addDayTime: (key: string, ms: number) => write((prev) => withDay(prev, key, (day) => ({ ...day, stopwatchMs: Math.max(0, (day.stopwatchMs ?? 0) + ms) }))),
  /** Moves a one-off task to another day. */
  moveDayTask: (from: string, to: string, task: DayTask) =>
    write((prev) => {
      if (from === to) return withDay(prev, to, (day) => ({ ...day, tasks: (day.tasks ?? []).some((t) => t.id === task.id) ? (day.tasks ?? []).map((t) => (t.id === task.id ? task : t)) : [...(day.tasks ?? []), task] }));
      const removed = withDay(prev, from, (day) => ({ ...day, tasks: (day.tasks ?? []).filter((t) => t.id !== task.id) }));
      return withDay(removed, to, (day) => ({ ...day, tasks: [...(day.tasks ?? []).filter((t) => t.id !== task.id), task] }));
    }),
  setPrefs: (patch: Partial<PracticeLogPrefs>) => write((prev) => ({ ...prev, prefs: { ...prev.prefs, ...patch } })),
  /** Brings in, updates or drops the routines teachers assigned (Lessons). */
  syncAssigned: (assigned: AssignedRoutine[]) => {
    const raw = doc.current();
    if (!raw) return;
    const base = shape(raw);
    if (reconcileAssigned(base, assigned, todayKey()) !== base) write((prev) => reconcileAssigned(prev, assigned, todayKey()));
  },
  /** Folds what the Practice Timer, the day timer and the tools' Log buttons queued into the log. */
  applyEntries: (entries: Parameters<typeof applyTimerEntries>[1]) => {
    if (entries.length) write((prev) => applyTimerEntries(prev, entries));
  },
};

export type PracticeLog = typeof actions & { data: PracticeLogData; ready: boolean };

/** The Shed Log: its data (the account's, signed in), whether it has loaded, and every change. */
export function usePracticeLog(): PracticeLog {
  const snap = useLiveDoc(doc);
  return { ...actions, data: snap.ready ? shape(snap.value) : EMPTY_LOG, ready: snap.ready };
}

// ---------------------------------------------------------------- the routine timer

/** The Practice Timer's sound settings on the phone (`app/tool/practice-timer.tsx`'s key): a routine
    run on the timer rings the same way. */
const SOUND_KEY = 'jam-practice-timer-sound-settings';
const SOUND_DEFAULTS = { soundEnabled: true, alarmMode: false, fullScreenAlert: false };

/** A task's first attached tool, as a timer step's `tool` (opened when the step starts —
    `lib/useOpenStepTools.ts`). */
function taskTool(attachments: Attachment[] | undefined): { tool?: string } {
  const tool = attachments?.find((a) => a.kind === 'tool');
  return tool && tool.kind === 'tool' ? { tool: tool.href } : {};
}

/** The Practice Timer as the Shed Log uses it: what's running, and starting a routine on it. A
    routine runs as a timer session whose steps are its tasks, so the floating timer, alarm mode
    and surviving the app closing all work the same, and each finished task is checked off. */
export function useRoutineTimer() {
  const engine = useSyncExternalStore(subscribe, getSnapshot);
  const [sound] = useSyncedSettings(SOUND_KEY, SOUND_DEFAULTS);

  /** `occ`: that day's occurrence, so tasks added for just that day run too. */
  const startRoutine = useCallback(
    (routine: Routine, date: string, fromTaskId?: string, onlyThis = false, occ?: Occurrence) => {
      let tasks = tasksOf(routine, occ).filter((t) => t.minutes > 0);
      if (fromTaskId) {
        const i = tasks.findIndex((t) => t.id === fromTaskId);
        if (i >= 0) tasks = onlyThis ? [tasks[i]] : tasks.slice(i);
      }
      if (!tasks.length) return;
      const session: PracticeSession = {
        id: `routine:${routine.id}:${date}`,
        name: routine.name || 'Routine',
        type: 'custom',
        // A tool attached for just that day counts too (after the task's own).
        segments: tasks.map((t) => ({ id: t.id, title: t.title || 'Task', minutes: t.minutes, ...taskTool([...(t.attachments ?? []), ...(occ?.taskAttachments?.[t.id] ?? [])]) })),
        updatedAt: Date.now(),
        link: { routineId: routine.id, date },
      };
      start(session, sound.soundEnabled, sound.alarmMode, sound.fullScreenAlert);
      // The day timer runs alongside: starting a routine starts it if it isn't going already (and
      // then it stops with the routine, `ShedLogGlobal`).
      if (date === todayKey()) startDayTimer(true);
    },
    [sound],
  );

  /** Runs a day's own tasks on the timer: just `only`, or every one not done yet. */
  const startDayTasks = useCallback(
    (date: string, tasks: DayTask[], only?: string) => {
      const list = (only ? tasks.filter((t) => t.id === only) : tasks.filter((t) => !t.done)).filter((t) => t.minutes > 0);
      if (!list.length) return;
      const session: PracticeSession = {
        id: `day:${date}`,
        name: list.length === 1 ? list[0].title || 'Task' : "Today's tasks",
        type: 'custom',
        segments: list.map((t) => ({ id: t.id, title: t.title || 'Task', minutes: t.minutes, ...taskTool(t.attachments) })),
        updatedAt: Date.now(),
        link: { routineId: DAY_TASKS_ID, date },
      };
      start(session, sound.soundEnabled, sound.alarmMode, sound.fullScreenAlert);
      if (date === todayKey()) startDayTimer(true);
    },
    [sound],
  );

  /** The running step's task id when the timer is running this routine on this day. */
  function runningTask(routineId: string, date: string): string | null {
    const s = engine?.session;
    if (!engine || !s || s.type !== 'custom' || s.link?.routineId !== routineId || s.link.date !== date) return null;
    return s.segments[engine.index]?.id ?? null;
  }

  return { engine, startRoutine, startDayTasks, runningTask };
}
