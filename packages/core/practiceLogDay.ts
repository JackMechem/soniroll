import {
  type DayRoutine,
  type DayStatus,
  type Occurrence,
  type PracticeLogData,
  type Routine,
  ROUTINE_COLORS,
  dayStatus,
  goalOn,
  minutesOn,
  parseTime,
  progressOf,
  routinesOn,
  scheduleTasks,
  tasksOf,
} from "./practiceLog";

/**
 * The Shed Log's time grid (the calendar's week and day views), without the drawing: a day's
 * routines and tasks as blocks at their times (side by side where they overlap), what has no time,
 * and what dragging one moves. Moved from the website's `components/practicelog/Calendar.tsx` so
 * the phone's day view lays out and drags exactly the same.
 */

/** One-off tasks (not part of a routine) on the calendar. */
export const TASK_COLOR = "#64748b";
/** Dropping snaps to quarter hours. */
export const SNAP = 15;

const colorOf = (i: number) => ROUTINE_COLORS[i % ROUTINE_COLORS.length];

/** Some of the routine's tasks have a clock time of their own, so moving its start doesn't move them. */
export function hasFixedTimes(routine: Routine, occurrence: Occurrence = {}): boolean {
  return tasksOf(routine, occurrence).some((t) => parseTime(t.time) !== null);
}

/** What tapping something on the calendar opens: one routine on a day, or some of a day's own tasks. */
export type CalendarTarget = { kind: "routine"; date: string; routineId: string } | { kind: "tasks"; date: string; ids: string[] };

/** Something being dragged on the time grid: a routine on a day, or one of a day's own tasks. */
export type DragItem =
  | { kind: "routine"; date: string; routineId: string; minutes: number; title: string; color: string; locked: boolean }
  | { kind: "task"; date: string; taskId: string; minutes: number; title: string; color: string };

export type BlockBase = {
  id: string;
  target: CalendarTarget;
  color: string;
  icon?: string;
  colorIdx?: number;
  title: string;
  tasks: string[];
  start: number;
  end: number;
  done: number;
  total: number;
  skipped: boolean;
  /** What dragging it moves (none for a routine whose tasks have clock times of their own). */
  drag: DragItem | null;
};
export type Block = BlockBase & { lane: number; lanes: number };

/** A routine can be dragged unless it's skipped or its tasks keep clock times of their own (moving
    its start wouldn't move them). `locked`: something's been done on its day, so it stays there. */
export function routineDrag(item: DayRoutine, key: string): DragItem | null {
  const { routine, occurrence } = item;
  if (occurrence.skipped || hasFixedTimes(routine, occurrence)) return null;
  return {
    kind: "routine",
    date: key,
    routineId: routine.id,
    minutes: Math.max(SNAP, tasksOf(routine, occurrence).reduce((s, t) => s + t.minutes, 0)),
    title: routine.name || "Untitled routine",
    color: colorOf(routine.color),
    locked: (occurrence.done?.length ?? 0) > 0 || Object.keys(occurrence.spentMs ?? {}).length > 0,
  };
}

/** What dragging one of a day's own tasks moves. */
export function taskDrag(task: { id: string; title: string; minutes: number }, key: string): DragItem {
  return { kind: "task", date: key, taskId: task.id, minutes: Math.max(10, task.minutes), title: task.title || "Task", color: TASK_COLOR };
}

/** The same thing being dragged (a routine on a day, or a task). */
export function isSameDragItem(a: DragItem | null | undefined, b: DragItem): boolean {
  if (!a || a.kind !== b.kind || a.date !== b.date) return false;
  return a.kind === "routine" ? b.kind === "routine" && a.routineId === b.routineId : b.kind === "task" && a.taskId === b.taskId;
}

/** A routine's timed tasks as blocks — tasks back to back are one block. */
export function blocksFor(item: DayRoutine, key: string): BlockBase[] {
  const { routine, occurrence } = item;
  const { done, total } = progressOf(routine, occurrence);
  const drag = routineDrag(item, key);
  const out: BlockBase[] = [];
  let cur: BlockBase | null = null;
  for (const s of scheduleTasks(routine, occurrence)) {
    if (s.start === null || s.end === null) continue;
    if (cur && Math.abs(cur.end - s.start) < 0.5) {
      cur.end = s.end;
      cur.tasks.push(s.task.title || "Task");
    } else {
      cur = {
        id: `${routine.id}-${s.start}`,
        target: { kind: "routine", date: key, routineId: routine.id },
        color: colorOf(routine.color),
        icon: routine.icon ?? "note",
        colorIdx: routine.color,
        title: routine.name || "Untitled routine",
        tasks: [s.task.title || "Task"],
        start: s.start,
        end: Math.max(s.end, s.start + 10),
        done,
        total,
        skipped: !!occurrence.skipped,
        drag,
      };
      out.push(cur);
    }
  }
  return out;
}

/** Side-by-side lanes for blocks that overlap. */
export function layoutLanes(blocks: BlockBase[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Block[] = [];
  let cluster: Block[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const flush = () => {
    for (const b of cluster) b.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= b.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(b.end);
    } else laneEnds[lane] = b.end;
    const block: Block = { ...b, lane, lanes: 1 };
    cluster.push(block);
    out.push(block);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

/** One day on the time grid: its routines and tasks, timed and not, and how it went. */
export type DayInfo = ReturnType<typeof dayInfo>;

export function dayInfo(data: PracticeLogData, key: string, today: string) {
  const items = routinesOn(data, key);
  const tasks = data.days[key]?.tasks ?? [];
  const taskBlocks: BlockBase[] = tasks
    .filter((t) => parseTime(t.time) !== null)
    .map((t) => {
      const start = parseTime(t.time)!;
      return {
        id: `task-${t.id}`,
        target: { kind: "tasks", date: key, ids: [t.id] },
        color: TASK_COLOR,
        title: t.title || "Task",
        tasks: [],
        start,
        end: start + Math.max(10, t.minutes),
        done: t.done ? 1 : 0,
        total: 1,
        skipped: false,
        drag: taskDrag(t, key),
      };
    });
  const minutes = minutesOn(data, key);
  const goal = goalOn(data, key);
  const status: DayStatus | null = dayStatus(data, key, today);
  return {
    key,
    items,
    tasks,
    untimed: items.filter((it) => !scheduleTasks(it.routine, it.occurrence).some((s) => s.start !== null)),
    untimedTasks: tasks.filter((t) => parseTime(t.time) === null),
    blocks: layoutLanes([...items.flatMap((it) => blocksFor(it, key)), ...taskBlocks]),
    status,
    minutes,
    goal,
    goalPct: goal > 0 ? Math.min(1, minutes / goal) : minutes > 0 ? 1 : 0,
  };
}
