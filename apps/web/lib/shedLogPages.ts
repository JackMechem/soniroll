/** Where a routine's and a task's own pages are (`/shed-log/routine`, `/shed-log/task`). A task in
    a routine is found by the routine and the task; a one-off task by its day and the task. */

export function routineHref(routineId: string): string {
  return `/shed-log/routine?id=${encodeURIComponent(routineId)}`;
}

/** A routine's task (`date`: the day it's looked at from, else today), or a day's own task. */
export type TaskRef = { routineId: string; taskId: string; date?: string } | { date: string; taskId: string };

export function taskHref(t: TaskRef): string {
  if (!("routineId" in t)) return `/shed-log/task?date=${encodeURIComponent(t.date)}&task=${encodeURIComponent(t.taskId)}`;
  const day = t.date ? `&date=${encodeURIComponent(t.date)}` : "";
  return `/shed-log/task?routine=${encodeURIComponent(t.routineId)}&task=${encodeURIComponent(t.taskId)}${day}`;
}
