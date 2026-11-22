import type { Href } from 'expo-router';

/**
 * Where a routine's and a task's own screens are (the website's `lib/shedLogPages.ts`):
 * `/tool/shed-log-routine?id=…&date=…` and `/tool/shed-log-task?routine=…&task=…&date=…` (a task
 * in a routine) or `?date=…&task=…` (one of a day's own tasks). `date` is the Shed Log day it was
 * opened from (else today). `from: 'routine'` marks a task opened from its routine's screen, so its
 * link back to the routine goes back rather than stacking another copy.
 */

/** A routine's task (`date`: the day it's looked at for, else today), or a day's own task. */
export type TaskRef = { routineId: string; taskId: string; date?: string } | { date: string; taskId: string };

export function routineRoute(routineId: string, date?: string): Href {
  return { pathname: '/tool/shed-log-routine', params: { id: routineId, ...(date ? { date } : {}) } };
}

export function taskRoute(t: TaskRef, from?: 'routine'): Href {
  const extra = from ? { from } : {};
  if (!('routineId' in t)) return { pathname: '/tool/shed-log-task', params: { date: t.date, task: t.taskId, ...extra } };
  return { pathname: '/tool/shed-log-task', params: { routine: t.routineId, task: t.taskId, ...(t.date ? { date: t.date } : {}), ...extra } };
}
