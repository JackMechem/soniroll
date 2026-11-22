/** Where a routine's and a task's own pages are (`/shed-log/routine`, `/shed-log/task`). A task in
    a routine is found by the routine and the task; a one-off task by its day and the task. */

export function routineHref(routineId: string): string {
  return `/shed-log/routine?id=${encodeURIComponent(routineId)}`;
}

export type TaskRef = { routineId: string; taskId: string } | { date: string; taskId: string };

export function taskHref(t: TaskRef): string {
  return "routineId" in t
    ? `/shed-log/task?routine=${encodeURIComponent(t.routineId)}&task=${encodeURIComponent(t.taskId)}`
    : `/shed-log/task?date=${encodeURIComponent(t.date)}&task=${encodeURIComponent(t.taskId)}`;
}
