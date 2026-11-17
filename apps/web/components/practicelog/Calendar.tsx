"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { CheckIcon, CloseIcon, MicIcon, PlusIcon, StarIcon } from "@/components/tools";
import RoutineIcon, { routineIconElement } from "@/components/practicelog/RoutineIcon";
import { hasFixedTimes } from "@/components/practicelog/RoutineTime";
import WeekPopover, { type WeekTarget } from "@/components/practicelog/WeekPopover";
import {
  type DayRoutine,
  type PracticeLogData,
  ROUTINE_COLORS,
  WEEKDAY_SHORT,
  addDays,
  formatMinutesShort,
  formatTime,
  fromDateKey,
  dayProgress,
  dayStatus,
  routineStatus,
  type DayStatus,
  minutesOn,
  monthGrid,
  parseTime,
  progressOf,
  routineSpan,
  routinesOn,
  scheduleTasks,
  startOfWeek,
  tasksOf,
  timeString,
  todayKey,
  weekdayOf,
  goalOn,
} from "@/lib/practiceLog";
import type { usePracticeLog } from "@/lib/usePracticeLog";

type Log = ReturnType<typeof usePracticeLog>;

const colorOf = (i: number) => ROUTINE_COLORS[i % ROUTINE_COLORS.length];
/** One-off tasks (not part of a routine) on the calendar. */
const TASK_COLOR = "#64748b";

/** A month, made to read at a glance: each day's routines as small marks in their colours (filled
    once done), the minutes practiced, and a green / yellow wash for days done / partly done. Today
    and the days to come show the routines by name when the cell has room. Tap a day to open it. */
export function MonthView({
  year,
  month,
  data,
  selected,
  onSelect,
  clipsByDate,
}: {
  year: number;
  month: number;
  data: PracticeLogData;
  selected: string;
  onSelect: (date: string) => void;
  clipsByDate: Map<string, number>;
}) {
  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const today = todayKey();
  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-surface lg:min-h-0 lg:flex-1">
      <div className="grid grid-cols-7 border-b border-foreground/10">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted">
            {d}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-7">
        {days.map((key, i) => {
          const d = fromDateKey(key);
          const inMonth = d.getMonth() === month;
          const items = routinesOn(data, key);
          const minutes = minutesOn(data, key);
          const clips = clipsByDate.get(key) ?? 0;
          const isSel = key === selected;
          const tasks = data.days[key]?.tasks ?? [];
          const goal = goalOn(data, key);
          const goalMet = goal > 0 && minutes >= goal;
          const heat = minutes > 0 ? 6 + 16 * Math.min(1, goal > 0 ? minutes / goal : 1) : 0;
          const past = key < today;
          const { done, total } = dayProgress(data, key);
          // A past day: green with a check when everything was done, yellow with a dash when some
          // of it was. A day where nothing was done only gets a quiet muted X by the date — a run
          // of missed days shouldn't read as a wall of errors.
          const status = dayStatus(data, key, today);
          const tint = status && status !== "missed" ? status : null;
          // Names only where they tell you something: today and the days to come (what's planned).
          const named = !past && (items.length > 0 || tasks.length > 0);
          const label = [
            d.toDateString(),
            items.length ? `${items.length} routine${items.length === 1 ? "" : "s"}` : "",
            status ? STATUS_LABEL[status] : "",
            minutes > 0 ? `${formatMinutesShort(Math.round(minutes))} practiced` : "",
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-label={label}
              aria-pressed={isSel}
              className={`@container relative flex min-h-[4.5rem] flex-col gap-1 border-foreground/10 p-1 text-left transition-colors sm:min-h-[7rem] sm:p-1.5 lg:min-h-0 lg:overflow-hidden ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${
                isSel ? "ring-2 ring-inset ring-accent" : "hover:bg-surface-hover/50"
              } ${inMonth ? "" : "opacity-60"}`}
              style={
                tint
                  ? { background: `color-mix(in srgb, ${STATUS_COLOR[tint]} ${tint === "partial" ? 14 : 16}%, transparent)` }
                  : heat
                    ? { background: `color-mix(in srgb, var(--accent) ${heat}%, transparent)` }
                    : undefined
              }
            >
              <div className="flex items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <span
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums ${
                      key === today ? "bg-accent text-accent-foreground" : inMonth ? "" : "text-muted"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {status && <StatusBadge status={status} />}
                </span>
                {/* Not on phones: there's no room beside the date (the wash and the mark say enough). */}
                <span className="hidden items-center gap-1 text-[10px] font-medium tabular-nums text-muted sm:flex">
                  {goalMet && <StarIcon filled className="h-3.5 w-3.5 text-amber-400" />}
                  {clips > 0 && (
                    <span className="flex items-center gap-0.5" title={`${clips} recording${clips === 1 ? "" : "s"}`}>
                      <MicIcon className="h-3 w-3" />
                      {clips}
                    </span>
                  )}
                </span>
              </div>
              {/* Phones: a dot per routine. */}
              <div className="flex flex-wrap gap-0.5 px-0.5 sm:hidden">
                {items.map((it) => (
                  <RoutineDot key={it.routine.id} item={it} past={past} />
                ))}
                {tasks.length > 0 && <span className="h-1.5 w-1.5 rounded-full" style={tasks.every((t) => t.done) ? { background: TASK_COLOR } : { boxShadow: `inset 0 0 0 1.5px ${TASK_COLOR}`, opacity: past ? 0.45 : 1 }} />}
              </div>
              <div className="hidden min-h-0 min-w-0 flex-1 flex-col gap-1 sm:flex">
                {/* Wide cells: today and the days to come list their routines by name. */}
                {named && (
                  <div className="hidden min-w-0 flex-col gap-0.5 @min-[8.5rem]:flex">
                    {items.slice(0, tasks.length ? 2 : 3).map((it) => (
                      <RoutineChip key={it.routine.id} item={it} />
                    ))}
                    {items.length > (tasks.length ? 2 : 3) && <span className="px-1 text-[10px] font-medium text-muted">+{items.length - (tasks.length ? 2 : 3)} more</span>}
                    {tasks.length > 0 && <TasksChip tasks={tasks} />}
                  </div>
                )}
                {(items.length > 0 || tasks.length > 0) && (
                  <div className={`flex min-w-0 flex-wrap gap-1 ${named ? "@min-[8.5rem]:hidden" : ""}`}>
                    {items.map((it) => (
                      <RoutineMark key={it.routine.id} item={it} past={past} />
                    ))}
                    {tasks.length > 0 && <TasksMark tasks={tasks} past={past} />}
                  </div>
                )}
                {/* What the day came to: minutes practiced, or how much is ticked off. */}
                {key <= today && (minutes > 0 || done > 0 || key === today) && (
                  <div className="mt-auto flex min-w-0 flex-wrap items-baseline justify-between gap-x-1.5 leading-tight">
                    {minutes > 0 && (
                      <span className={`whitespace-nowrap text-xs font-semibold tabular-nums ${goalMet ? "text-green-700 dark:text-green-400" : ""}`}>{formatMinutesShort(Math.round(minutes))}</span>
                    )}
                    {total > 0 && done < total && (done > 0 || key === today) && (
                      <span className="whitespace-nowrap text-[10px] font-medium tabular-nums text-muted" title={`${done} of ${total} tasks done`}>
                        {done}/{total} done
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A routine in a month cell: its icon in a ring of its colour, filling as its tasks are done —
    solid once they all are. Faded on a past day it wasn't finished. */
function RoutineMark({ item, past }: { item: DayRoutine; past: boolean }) {
  const { done, total } = progressOf(item.routine, item.occurrence);
  const name = item.routine.name || "Untitled routine";
  const skipped = !!item.occurrence.skipped;
  if (total > 0 && done === total && !skipped)
    return (
      <span title={`${name} · done`} className="flex">
        <RoutineIcon icon={item.routine.icon} color={item.routine.color} size="xs" />
      </span>
    );
  const color = colorOf(item.routine.color);
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <span
      title={`${name}${skipped ? " · skipped" : total ? ` · ${done}/${total} done` : ""}`}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{
        color,
        boxShadow: `inset 0 0 0 1.5px ${color}`,
        background: pct > 0 ? `conic-gradient(color-mix(in srgb, ${color} 40%, transparent) ${pct}%, transparent 0)` : undefined,
        opacity: skipped ? 0.3 : past ? 0.45 : 1,
      }}
    >
      {routineIconElement(item.routine.icon, "h-2.5 w-2.5")}
    </span>
  );
}

/** The day's own tasks in a month cell: one grey mark, solid once they're all done. */
function TasksMark({ tasks, past }: { tasks: { done: boolean }[]; past: boolean }) {
  const done = tasks.filter((t) => t.done).length;
  const all = done === tasks.length;
  return (
    <span
      title={`${tasks.length === 1 ? "1 task" : `${tasks.length} tasks`} · ${done}/${tasks.length} done`}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={all ? { background: TASK_COLOR, color: "white" } : { boxShadow: `inset 0 0 0 1.5px ${TASK_COLOR}`, color: TASK_COLOR, opacity: past ? 0.45 : 1 }}
    >
      <CheckIcon className="h-2.5 w-2.5" />
    </span>
  );
}

function TasksChip({ tasks }: { tasks: { title: string; done: boolean }[] }) {
  const done = tasks.filter((t) => t.done).length;
  const all = done === tasks.length;
  return (
    <span
      className="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] font-medium leading-tight"
      style={{ background: `color-mix(in srgb, ${TASK_COLOR} ${all ? 30 : 14}%, transparent)` }}
    >
      {all ? <CheckIcon className="h-3 w-3 shrink-0" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: TASK_COLOR }} />}
      <span className="truncate">{tasks.length === 1 ? tasks[0].title : `${tasks.length} tasks`}</span>
      {!all && tasks.length > 1 && done > 0 && <span className="ml-auto shrink-0 tabular-nums text-muted">{done}/{tasks.length}</span>}
    </span>
  );
}

function RoutineDot({ item, past }: { item: DayRoutine; past: boolean }) {
  const { done, total } = progressOf(item.routine, item.occurrence);
  const complete = total > 0 && done === total && !item.occurrence.skipped;
  const color = colorOf(item.routine.color);
  return (
    <span
      className="h-1.5 w-1.5 rounded-full"
      style={complete ? { background: color } : { boxShadow: `inset 0 0 0 1.5px ${color}`, opacity: item.occurrence.skipped ? 0.3 : past ? 0.45 : 1 }}
    />
  );
}

/** `fill`: the chip fills from the left as its tasks are done. */
function RoutineChip({ item, status = null, fill = false }: { item: DayRoutine; status?: DayStatus | null; fill?: boolean }) {
  const { done, total } = progressOf(item.routine, item.occurrence);
  const complete = total > 0 && done === total;
  const color = colorOf(item.routine.color);
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <span
      className={`flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] font-medium leading-tight ${item.occurrence.skipped ? "line-through opacity-50" : ""}`}
      style={{
        background:
          fill && !complete && pct > 0
            ? `linear-gradient(90deg, color-mix(in srgb, ${color} 32%, transparent) ${pct}%, color-mix(in srgb, ${color} 14%, transparent) ${pct}%)`
            : `color-mix(in srgb, ${color} ${complete ? 30 : 14}%, transparent)`,
      }}
    >
      <RoutineIcon icon={item.routine.icon} color={item.routine.color} size="xs" />
      <span className="truncate">{item.routine.name || "Untitled routine"}</span>
      {complete ? (
        <CheckIcon className="ml-auto h-3 w-3 shrink-0" />
      ) : status === "partial" ? (
        <span className="ml-auto flex shrink-0 items-center gap-0.5 font-medium text-amber-600 dark:text-amber-400" title="Partly done">
          {!fill && <span className="tabular-nums">{done}/{total}</span>}
          <span className="h-0.5 w-2 rounded-full bg-current" />
        </span>
      ) : (
        !fill && done > 0 && <span className="ml-auto shrink-0 tabular-nums text-muted">{done}/{total}</span>
      )}
    </span>
  );
}

const HOUR_PX = 48;
/** Dropping snaps to quarter hours. */
const SNAP = 15;

type BlockBase = {
  id: string;
  target: WeekTarget;
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
type Block = BlockBase & { lane: number; lanes: number };

/** A routine's timed tasks as blocks — tasks back to back are one block. */
function blocksFor(item: DayRoutine, key: string): BlockBase[] {
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
function layoutLanes(blocks: BlockBase[]): Block[] {
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

/** Where a pointer is in a day's column, as minutes into the day (snapped to half hours). */
function slotAt(e: React.MouseEvent, firstHour: number, hourPx: number): number {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const half = Math.floor(((e.clientY - r.top) / hourPx) * 2);
  return Math.min(24 * 60 - 30, firstHour * 60 + Math.max(0, half) * 30);
}

/** One day on the time grid: its routines and tasks, timed and not, and how it went. */
type DayInfo = ReturnType<typeof dayInfo>;

function dayInfo(data: PracticeLogData, key: string, today: string) {
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
        drag: { kind: "task", date: key, taskId: t.id, minutes: Math.max(10, t.minutes), title: t.title || "Task", color: TASK_COLOR },
      };
    });
  const minutes = minutesOn(data, key);
  const goal = goalOn(data, key);
  return {
    key,
    items,
    tasks,
    untimed: items.filter((it) => !scheduleTasks(it.routine, it.occurrence).some((s) => s.start !== null)),
    untimedTasks: tasks.filter((t) => parseTime(t.time) === null),
    blocks: layoutLanes([...items.flatMap((it) => blocksFor(it, key)), ...taskBlocks]),
    status: dayStatus(data, key, today),
    minutes,
    goal,
    goalPct: goal > 0 ? Math.min(1, minutes / goal) : minutes > 0 ? 1 : 0,
  };
}

// ---------------------------------------------------------------- dragging onto a time

/** Something being dragged on the time grid: a routine on a day, or one of a day's own tasks. */
type DragItem =
  | { kind: "routine"; date: string; routineId: string; minutes: number; title: string; color: string; locked: boolean }
  | { kind: "task"; date: string; taskId: string; minutes: number; title: string; color: string };
/** Where it would land: a day, at a time (minutes into the day) or any time (null). */
type Drop = { key: string; min: number | null };
type Drag = { item: DragItem; drop: Drop | null };

/** A routine can be dragged unless it's skipped or its tasks keep clock times of their own (moving
    its start wouldn't move them). `locked`: something's been done on its day, so it stays there. */
function routineDrag(item: DayRoutine, key: string): DragItem | null {
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

// While a drag runs (and just after it ends), taps and swipes are ignored — the pointer-up that
// ends a drag would otherwise also click what's under it.
let dragActive = false;
let dragEndedAt = 0;
function justDragged() {
  return dragActive || Date.now() - dragEndedAt < 250;
}

/**
 * Drag to schedule: hold a routine or task (a long press on touch screens) and drop it on a time
 * in a day's column, or on "Any time". Columns are `[data-drop]` elements (`data-day`, and
 * `data-drop="grid"` or `"any"`). Dropping on another day moves it there.
 */
function useTimeDrag({
  log,
  hourPx,
  firstHour,
  lastHour,
  scroller,
  onDropped,
}: {
  log: Log;
  hourPx: number;
  firstHour: number;
  lastHour: number;
  scroller: React.RefObject<HTMLDivElement | null>;
  onDropped: (key: string) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<Drag | null>(null);

  // A finger that's dragging mustn't scroll the page.
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (live.current && e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", onTouchMove);
  }, []);

  function dropAt(x: number, y: number, item: DragItem, offset: number): Drop | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
    const key = el?.dataset.day;
    if (!el || !key) return null;
    if (key !== item.date && item.kind === "routine") {
      // A routine that's been started stays on its day, and can't go to a day that already has it.
      if (item.locked || routinesOn(log.data, key).some((i) => i.routine.id === item.routineId)) return null;
    }
    if (el.dataset.drop === "any") return { key, min: null };
    const r = el.getBoundingClientRect();
    const raw = firstHour * 60 + ((y - r.top) / hourPx) * 60 - offset;
    const latest = Math.max(firstHour * 60, lastHour * 60 - Math.min(item.minutes, 60));
    return { key, min: Math.max(firstHour * 60, Math.min(latest, Math.round(raw / SNAP) * SNAP)) };
  }

  function apply(item: DragItem, drop: Drop) {
    const time = drop.min === null ? null : timeString(drop.min);
    if (item.kind === "task") {
      const task = log.data.days[item.date]?.tasks?.find((t) => t.id === item.taskId);
      if (task) log.moveDayTask(item.date, drop.key, { ...task, time });
      onDropped(drop.key);
      return;
    }
    const routine = log.data.routines.find((r) => r.id === item.routineId);
    if (!routine) return;
    if (drop.key !== item.date) {
      // Moved to another day: added there, and taken off (or skipped on) the day it was on.
      const from = routinesOn(log.data, item.date).find((i) => i.routine.id === routine.id);
      log.addToDay(drop.key, routine.id);
      if (from?.added) log.removeFromDay(item.date, routine.id);
      else log.updateOccurrence(item.date, routine.id, (o) => ({ ...o, skipped: true }));
    }
    // The routine's own time needs no override for the day.
    log.updateOccurrence(drop.key, routine.id, (o) => {
      const n = { ...o };
      if (time === routine.startTime) delete n.startTime;
      else n.startTime = time;
      return n;
    });
    onDropped(drop.key);
  }

  /** Pointer-down on something draggable; `offset` = minutes between its top and the pointer. */
  function begin(e: React.PointerEvent, item: DragItem, offset = 0) {
    if (e.button !== 0) return;
    const touch = e.pointerType === "touch";
    const sx = e.clientX;
    const sy = e.clientY;
    let x = sx;
    let y = sy;
    let active = false;
    let frame = 0;
    const hold = touch ? window.setTimeout(() => activate(), 350) : 0;

    const set = (d: Drag | null) => {
      live.current = d;
      setDrag(d);
    };
    const refresh = () => {
      const drop = dropAt(x, y, item, offset);
      const prev = live.current;
      if (prev && (prev.drop?.key !== drop?.key || prev.drop?.min !== drop?.min)) set({ ...prev, drop });
    };
    // Held near the top or bottom of the grid, it scrolls (not when just passing through).
    let edgeSince = 0;
    const tick = () => {
      const el = scroller.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const inside = x >= r.left && x <= r.right;
        const dir = inside && y >= r.top && y < r.top + 32 ? -1 : inside && y <= r.bottom && y > r.bottom - 32 ? 1 : 0;
        if (!dir) edgeSince = 0;
        else if (!edgeSince) edgeSince = performance.now();
        else if (performance.now() - edgeSince > 250) el.scrollTop += dir * 8;
      }
      refresh();
      frame = requestAnimationFrame(tick);
    };
    function activate() {
      active = true;
      dragActive = true;
      document.body.style.cursor = "grabbing";
      if (touch) navigator.vibrate?.(10);
      set({ item, drop: dropAt(x, y, item, offset) });
      frame = requestAnimationFrame(tick);
    }
    const move = (ev: PointerEvent) => {
      x = ev.clientX;
      y = ev.clientY;
      if (active) return;
      const dist = Math.hypot(x - sx, y - sy);
      // On a touch screen moving first means scrolling; with a mouse it starts the drag.
      if (touch && dist > 8) finish(false);
      else if (!touch && dist > 4) activate();
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => ev.key === "Escape" && finish(false);
    function finish(commit: boolean) {
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      if (!active) return;
      active = false;
      dragActive = false;
      dragEndedAt = Date.now();
      document.body.style.cursor = "";
      const d = live.current;
      set(null);
      if (commit && d?.drop) apply(d.item, d.drop);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
  }

  /** Props for something draggable. */
  function handle(item: DragItem | null, offsetOf?: (e: React.PointerEvent) => number) {
    if (!item) return {};
    return {
      onPointerDown: (e: React.PointerEvent) => begin(e, item, offsetOf?.(e) ?? 0),
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      "data-dragging": isSame(drag?.item, item) || undefined,
    };
  }

  return { drag, handle };
}

function isSame(a: DragItem | undefined, b: DragItem): boolean {
  if (!a || a.kind !== b.kind || a.date !== b.date) return false;
  return a.kind === "routine" ? b.kind === "routine" && a.routineId === b.routineId : b.kind === "task" && a.taskId === b.taskId;
}

/** Classes for things you can drag: a grab cursor, no text selection or long-press menu, and faded
    while it's being dragged. */
const DRAGGABLE = "cursor-grab select-none [-webkit-touch-callout:none] data-[dragging]:opacity-40";

const COLS = { week: "grid-cols-[3rem_repeat(7,minmax(0,1fr))]", day: "grid-cols-[3rem_minmax(0,1fr)]" };

/**
 * The time grid for a week (seven columns) or one day: each routine's timed tasks where they fall,
 * untimed ones in the "Any time" row above. Click a free time to add something there; drag a
 * routine or task to a time (or another day) to schedule it.
 */
function TimeGrid({
  log,
  days,
  selected,
  onSelect,
  onOpen,
  onOpenDay,
  onAddTask,
  single = false,
  className = "",
}: {
  log: Log;
  days: DayInfo[];
  selected: string;
  onSelect: (date: string) => void;
  onOpen: (e: React.MouseEvent, target: WeekTarget) => void;
  onOpenDay?: (date: string) => void;
  onAddTask: (date: string, time: string | null) => void;
  /** One day: no day headers, taller hours, bigger "Any time" pills. */
  single?: boolean;
  className?: string;
}) {
  const { data } = log;
  const router = useRouter();
  const today = todayKey();
  const hourPx = single ? 64 : HOUR_PX;
  const cols = single ? COLS.day : COLS.week;
  const allBlocks = days.flatMap((d) => d.blocks);
  // The whole day, midnight to midnight; it opens scrolled to the first thing planned (or 8 AM).
  const firstHour = 0;
  const lastHour = 24;
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const scroller = useRef<HTMLDivElement>(null);
  const earliest = allBlocks.length ? Math.min(...allBlocks.map((b) => b.start)) : 8 * 60;
  const { drag, handle } = useTimeDrag({ log, hourPx, firstHour, lastHour, scroller, onDropped: onSelect });

  // Scrolled to the first block (or 8 AM) when the days change.
  const first = days[0]?.key;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = Math.max(0, ((earliest - firstHour * 60) / 60) * hourPx - 16);
  }, [first, earliest, firstHour, hourPx]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hasUntimed = single || days.some((d) => d.untimed.length > 0 || d.untimedTasks.length > 0);

  const [menu, setMenu] = useState<MenuState | null>(null);
  // The free half hour under the mouse, shown as a "+ 3:00 PM" slot.
  const [ghost, setGhost] = useState<{ key: string; min: number } | null>(null);
  const open = (e: React.MouseEvent, target: WeekTarget) => {
    if (!justDragged()) onOpen(e, target);
  };

  function openSlotMenu(e: React.MouseEvent, key: string, min: number) {
    onSelect(key);
    const onDay = new Set(routinesOn(data, key).map((i) => i.routine.id));
    const free = data.routines.filter((r) => !onDay.has(r.id));
    // An any-time routine already on the day can be put at this time.
    const untimed = routinesOn(data, key).filter((it) => !routineSpan(it.routine, it.occurrence) && routineDrag(it, key));
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: `Task at ${formatTime(min)}`, icon: <PlusIcon className="h-4 w-4 text-accent" />, onSelect: () => onAddTask(key, timeString(min)) },
        ...untimed.map((it) => ({
          label: `${it.routine.name || "Untitled routine"} at ${formatTime(min)}`,
          icon: <RoutineIcon icon={it.routine.icon} color={it.routine.color} size="sm" />,
          onSelect: () => log.updateOccurrence(key, it.routine.id, (o) => ({ ...o, startTime: timeString(min) })),
        })),
        { label: "New routine starting this day", icon: <PlusIcon className="h-4 w-4 text-muted" />, onSelect: () => router.push(`/shed-log/routine/edit?date=${key}`) },
        ...free.map((r) => ({
          label: `Add ${r.name || "Untitled routine"} at ${formatTime(min)}`,
          icon: <RoutineIcon icon={r.icon} color={r.color} size="sm" />,
          onSelect: () => {
            log.addToDay(key, r.id);
            if (!hasFixedTimes(r)) log.updateOccurrence(key, r.id, (o) => ({ ...o, startTime: timeString(min) }));
          },
        })),
      ],
    });
  }

  return (
    <div className={`flex-col ${className}`}>
      {!single && (
        <div className={`grid ${cols} border-b border-foreground/10`}>
          <div />
          {days.map(({ key, minutes, status, goalPct }) => {
            const isSel = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                onDoubleClick={() => onOpenDay?.(key)}
                title="Click to open the day · double-click for day view"
                aria-pressed={isSel}
                className={`flex flex-col items-center gap-1 py-2 transition-colors ${isSel ? "bg-accent/10" : "hover:bg-surface-hover/50"}`}
              >
                <span className={`text-xs font-medium ${isSel ? "text-accent" : "text-muted"}`}>{WEEKDAY_SHORT[weekdayOf(key)]}</span>
                <DayNumber dayKey={key} today={today} status={status} />
                <DayGoal dayKey={key} today={today} minutes={minutes} pct={goalPct} status={status} />
              </button>
            );
          })}
        </div>
      )}
      {hasUntimed && (
        <div className={`grid ${cols} border-b border-foreground/10`}>
          <div className={`px-1 text-right text-[10px] font-medium leading-tight text-muted ${single ? "py-3" : "py-1.5"}`}>Any time</div>
          {days.map(({ key, untimed, untimedTasks }) => {
            const over = drag?.drop?.key === key && drag.drop.min === null;
            return (
              <div
                key={key}
                data-drop="any"
                data-day={key}
                className={`flex min-w-0 border-l border-foreground/10 transition-colors ${single ? "min-h-14 flex-wrap items-center gap-1.5 p-2" : "flex-col gap-0.5 p-0.5"} ${over ? "bg-accent/15 ring-2 ring-inset ring-accent" : key === selected && !single ? "bg-accent/5" : ""}`}
              >
                {untimed.map((it) =>
                  single ? (
                    <AgendaPill key={it.routine.id} item={it} dayKey={key} today={today} onOpen={open} className={`w-auto max-w-full ${DRAGGABLE}`} dragProps={handle(routineDrag(it, key))} />
                  ) : (
                    <button
                      key={it.routine.id}
                      type="button"
                      onClick={(e) => open(e, { kind: "routine", date: key, routineId: it.routine.id })}
                      title="Click to open · drag onto a time to schedule it"
                      {...handle(routineDrag(it, key))}
                      className={`min-w-0 rounded-sm text-left transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-accent ${routineDrag(it, key) ? DRAGGABLE : ""}`}
                    >
                      <RoutineChip item={it} status={routineStatus(it, key, today)} fill />
                    </button>
                  ),
                )}
                {single
                  ? untimedTasks.map((t) => (
                      <AgendaTasksPill
                        key={t.id}
                        tasks={[t]}
                        dayKey={key}
                        onOpen={open}
                        className={`w-auto max-w-full ${DRAGGABLE}`}
                        dragProps={handle({ kind: "task", date: key, taskId: t.id, minutes: Math.max(10, t.minutes), title: t.title || "Task", color: TASK_COLOR })}
                      />
                    ))
                  : untimedTasks.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => open(e, { kind: "tasks", date: key, ids: untimedTasks.map((t) => t.id) })}
                        title={untimedTasks.length === 1 ? "Click to open · drag onto a time to schedule it" : undefined}
                        {...(untimedTasks.length === 1
                          ? handle({ kind: "task", date: key, taskId: untimedTasks[0].id, minutes: Math.max(10, untimedTasks[0].minutes), title: untimedTasks[0].title || "Task", color: TASK_COLOR })
                          : {})}
                        className={`min-w-0 rounded-sm text-left transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-accent ${untimedTasks.length === 1 ? DRAGGABLE : ""}`}
                      >
                        <TasksChip tasks={untimedTasks} />
                      </button>
                    )}
                {single && untimed.length === 0 && untimedTasks.length === 0 && (
                  <span className="pointer-events-none px-1 text-xs text-muted">{over ? "Drop to do it any time" : "Nothing without a time"}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div ref={scroller} className="max-h-[32rem] overflow-y-auto lg:h-0 lg:max-h-none lg:min-h-[20rem] lg:flex-1">
        {allBlocks.length === 0 && !drag && (
          <div className="pointer-events-none sticky top-2 z-20 h-0">
            <p className="mx-auto w-fit max-w-[90%] rounded-md bg-background/90 px-3 py-1 text-center text-xs text-muted">
              {single ? "Nothing at a set time. Drag a routine onto a time, or tap a time to add a task." : "Nothing at a set time this week. Drag a routine onto a time, or click a time to add a task."}
            </p>
          </div>
        )}
        <div className={`relative grid ${cols}`} style={{ height: hours.length * hourPx }}>
          <div className="relative">
            {hours.map((h, i) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted" style={{ top: i * hourPx }}>
                {i === 0 ? "" : formatTime(h * 60).replace(/:00(?= )/, "")}
              </span>
            ))}
          </div>
          {days.map(({ key, blocks }) => {
            const drop = drag?.drop?.key === key && drag.drop.min !== null ? drag.drop.min : null;
            return (
              <div
                key={key}
                data-drop="grid"
                data-day={key}
                className={`relative cursor-cell border-l border-foreground/10 ${key === selected && !single ? "bg-accent/5" : ""}`}
                onPointerMove={(e) => {
                  if (e.pointerType !== "mouse" || drag) return;
                  if (e.target !== e.currentTarget) {
                    if (ghost) setGhost(null);
                    return;
                  }
                  const min = slotAt(e, firstHour, hourPx);
                  if (ghost?.key !== key || ghost.min !== min) setGhost({ key, min });
                }}
                onPointerLeave={() => setGhost(null)}
                onClick={(e) => {
                  if (e.target === e.currentTarget && !justDragged()) openSlotMenu(e, key, slotAt(e, firstHour, hourPx));
                }}
              >
                {hours.map((h, i) => (
                  <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-foreground/[0.07]" style={{ top: i * hourPx }} />
                ))}
                {single &&
                  hours.map((h, i) => (
                    <div key={`${h}-half`} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/5" style={{ top: i * hourPx + hourPx / 2 }} />
                  ))}
                {ghost?.key === key && !drag && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 flex items-start gap-1 rounded-md border border-dashed border-accent/60 bg-accent/10 px-1 py-0.5 text-[11px] font-medium text-accent"
                    style={{ top: ((ghost.min - firstHour * 60) / 60) * hourPx + 1, height: hourPx / 2 - 2 }}
                  >
                    <PlusIcon className="mt-px h-3 w-3 shrink-0" /> <span className="truncate">{formatTime(ghost.min)}</span>
                  </div>
                )}
                {blocks.map((b) => {
                  const top = ((b.start - firstHour * 60) / 60) * hourPx;
                  const height = Math.max(18, ((b.end - b.start) / 60) * hourPx - 2);
                  const complete = b.total > 0 && b.done === b.total;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={(e) => open(e, b.target)}
                      title={`${b.title}: ${formatTime(b.start)} – ${formatTime(b.end)}${b.tasks.length ? `\n${b.tasks.join(", ")}` : ""}${b.drag ? "\nDrag to move it" : ""}`}
                      {...handle(b.drag, (e) => (((e.clientY - e.currentTarget.getBoundingClientRect().top) / hourPx) * 60))}
                      className={`absolute z-[1] overflow-hidden rounded-md text-left leading-tight transition-[filter,box-shadow] hover:z-[2] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-accent ${single ? "py-1 pl-4 pr-2 text-xs" : "py-0.5 pl-2.5 pr-1 text-[11px]"} ${b.skipped ? "opacity-40 line-through" : ""} ${b.drag ? DRAGGABLE : ""}`}
                      style={{
                        top,
                        height,
                        left: `calc(${(b.lane / b.lanes) * 100}% + 1px)`,
                        width: `calc(${100 / b.lanes}% - 2px)`,
                        background: `color-mix(in srgb, ${b.color} ${complete ? 45 : 22}%, var(--surface))`,
                      }}
                    >
                      {/* The same rounded bar down the left as the routine cards in the day panel. */}
                      <span aria-hidden className={`absolute w-1 rounded-full ${single ? "bottom-1.5 left-1.5 top-1.5" : "bottom-1 left-1 top-1"}`} style={{ background: b.color }} />
                      <span className="flex items-center gap-1 font-medium">
                        {b.icon !== undefined && <RoutineIcon icon={b.icon} color={b.colorIdx ?? 0} size="xs" />}
                        {complete && <CheckIcon className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{b.title}</span>
                        {single && height <= 34 && <span className="shrink-0 font-normal text-muted">{formatTime(b.start)}</span>}
                      </span>
                      {height > 34 && (
                        <span className="block truncate text-muted">
                          {formatTime(b.start)}
                          {single && ` – ${formatTime(b.end)}`}
                          {b.total > 1 && b.done > 0 && !complete && ` · ${b.done}/${b.total}`}
                        </span>
                      )}
                      {height > 52 && b.tasks.length > 0 && <span className="block truncate">{b.tasks.join(" · ")}</span>}
                      {b.total > 1 && b.done > 0 && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: `linear-gradient(90deg, ${b.color} ${(b.done / b.total) * 100}%, transparent 0)` }} />
                      )}
                    </button>
                  );
                })}
                {drop !== null && drag && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 z-[5] overflow-hidden rounded-md border-2 border-dashed px-1.5 py-0.5 text-[11px] font-medium leading-tight shadow-md"
                    style={{
                      top: ((drop - firstHour * 60) / 60) * hourPx,
                      height: Math.max(20, (drag.item.minutes / 60) * hourPx - 2),
                      borderColor: drag.item.color,
                      background: `color-mix(in srgb, ${drag.item.color} 30%, var(--surface))`,
                    }}
                  >
                    {(drag.item.minutes / 60) * hourPx >= 36 ? (
                      <>
                        <span className="block truncate">{drag.item.title}</span>
                        <span className="block truncate text-muted">
                          {formatTime(drop)} – {formatTime(drop + drag.item.minutes)}
                        </span>
                      </>
                    ) : (
                      <span className="block truncate">
                        {formatTime(drop)} · {drag.item.title}
                      </span>
                    )}
                  </div>
                )}
                {key === today && nowMin >= firstHour * 60 && nowMin <= lastHour * 60 && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger" style={{ top: ((nowMin - firstHour * 60) / 60) * hourPx }}>
                    <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-danger" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Opens a routine or tasks in the week popover, beside what was tapped. */
function usePopover(onSelect: (date: string) => void) {
  const [pop, setPop] = useState<{ target: WeekTarget; anchor: DOMRect } | null>(null);
  const open = (e: React.MouseEvent, target: WeekTarget) => {
    e.stopPropagation();
    onSelect(target.date);
    // Open where it was clicked; a keyboard press (no pointer position) opens beside the whole button.
    const anchor = e.detail > 0 ? new DOMRect(e.clientX, e.clientY, 0, 0) : (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPop({ target, anchor });
  };
  return { pop, open, close: () => setPop(null) };
}

/**
 * A week. On wider screens a time grid (see `TimeGrid`); on phones a list of the seven days with
 * each one's routines as big buttons. Either way, tapping a routine (or a day's tasks) opens it in
 * a popover to tick tasks off or start it, and swiping sideways changes the week.
 */
export function WeekView({
  log,
  selected,
  onSelect,
  onStep,
  onOpenDay,
  onAddTask,
}: {
  log: Log;
  selected: string;
  onSelect: (date: string) => void;
  /** -1 / +1: the week before / after. */
  onStep: (n: number) => void;
  /** Opens the day on its own (day view). */
  onOpenDay: (date: string) => void;
  /** A new one-off task on a day, at a time ("HH:MM") or any time. */
  onAddTask: (date: string, time: string | null) => void;
}) {
  const { data } = log;
  const start = startOfWeek(selected);
  const today = todayKey();
  const perDay = useMemo(() => Array.from({ length: 7 }, (_, i) => dayInfo(data, addDays(start, i), today)), [start, data, today]);
  const { pop, open: openPop, close } = usePopover(onSelect);
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg bg-surface lg:min-h-0 lg:flex-1"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s || justDragged()) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) onStep(dx < 0 ? 1 : -1);
      }}
    >
      {/* Phones: the seven days as a list. */}
      <ul className="flex flex-col divide-y divide-foreground/10 sm:hidden">
        {perDay.map(({ key, items, tasks, minutes, status, goalPct }) => {
          const isSel = key === selected;
          return (
            <li key={key} className={`flex gap-3 px-2.5 py-2.5 transition-colors ${isSel ? "bg-accent/10" : ""}`}>
              <button type="button" onClick={() => onSelect(key)} aria-pressed={isSel} aria-label={fromDateKey(key).toDateString()} className="flex w-11 shrink-0 flex-col items-center gap-1 pt-0.5">
                <span className={`text-[11px] font-medium ${isSel ? "text-accent" : "text-muted"}`}>{WEEKDAY_SHORT[weekdayOf(key)]}</span>
                <DayNumber dayKey={key} today={today} status={status} />
                <DayGoal dayKey={key} today={today} minutes={minutes} pct={goalPct} status={status} />
              </button>
              <div className="grid min-w-0 flex-1 grid-cols-2 content-start gap-1.5">
                {items.map((it) => (
                  <AgendaPill key={it.routine.id} item={it} dayKey={key} today={today} onOpen={openPop} />
                ))}
                {tasks.length > 0 && <AgendaTasksPill tasks={tasks} dayKey={key} onOpen={openPop} />}
                {items.length === 0 && tasks.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onAddTask(key, null)}
                    className="col-span-2 flex min-h-10 items-center gap-1.5 rounded-md border border-dashed border-foreground/15 px-3 text-xs font-medium text-muted active:bg-surface-hover"
                  >
                    <PlusIcon className="h-3.5 w-3.5" /> {key < today ? "Nothing planned" : "Add a task"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Wider screens: the time grid. */}
      <TimeGrid
        log={log}
        days={perDay}
        selected={selected}
        onSelect={onSelect}
        onOpen={openPop}
        onOpenDay={onOpenDay}
        onAddTask={onAddTask}
        className="hidden sm:flex lg:min-h-0 lg:flex-1"
      />
      {pop && <WeekPopover target={pop.target} anchor={pop.anchor} log={log} onClose={close} onOpenDay={onOpenDay} />}
    </div>
  );
}

/** One day as a time grid, like a column of the week but roomier: drag routines and tasks onto a
    time, tap one to tick it off or start it, tap a free time to add something. */
export function DayView({
  log,
  date,
  onSelect,
  onAddTask,
}: {
  log: Log;
  date: string;
  onSelect: (date: string) => void;
  onAddTask: (date: string, time: string | null) => void;
}) {
  const { data } = log;
  const today = todayKey();
  const day = useMemo(() => dayInfo(data, date, today), [data, date, today]);
  const { pop, open, close } = usePopover(onSelect);
  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-surface lg:min-h-0 lg:flex-1">
      <TimeGrid log={log} days={[day]} selected={date} onSelect={onSelect} onOpen={open} onAddTask={onAddTask} single className="flex lg:min-h-0 lg:flex-1" />
      {pop && <WeekPopover target={pop.target} anchor={pop.anchor} log={log} onClose={close} />}
    </div>
  );
}

/** The date in a circle: the accent for today, the day's status colour for a past day. */
function DayNumber({ dayKey, today, status }: { dayKey: string; today: string; status: DayStatus | null }) {
  const isToday = dayKey === today;
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium tabular-nums ${isToday ? "bg-accent text-accent-foreground" : status === "missed" ? "text-muted" : status ? "text-white" : ""}`}
      style={!isToday && status && status !== "missed" ? { background: STATUS_COLOR[status] } : undefined}
      title={status ? STATUS_LABEL[status] : undefined}
    >
      {fromDateKey(dayKey).getDate()}
    </span>
  );
}

/** Under the date: minutes practiced and a small bar toward that day's goal (none for days to come). */
function DayGoal({ dayKey, today, minutes, pct, status }: { dayKey: string; today: string; minutes: number; pct: number; status: DayStatus | null }) {
  if (dayKey > today) return <span className="h-[1.375rem]" />;
  const met = pct >= 1;
  return (
    <span className="flex flex-col items-center gap-1">
      <span className={`flex h-3 items-center gap-0.5 whitespace-nowrap text-[10px] tabular-nums ${status === "missed" && minutes === 0 ? "text-muted" : met ? "font-medium text-green-600 dark:text-green-400" : "text-muted"}`}>
        {minutes > 0 ? (
          formatMinutesShort(Math.round(minutes))
        ) : status === "missed" ? (
          <>
            <CloseIcon className="h-2.5 w-2.5" /> Missed
          </>
        ) : (
          "0 min"
        )}
      </span>
      <span className="h-1 w-9 overflow-hidden rounded-full bg-foreground/10" title={met ? "Daily goal met" : undefined}>
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%`, background: met ? STATUS_COLOR.done : "var(--accent)" }} />
      </span>
    </span>
  );
}

/** A routine on the phone list: its icon, name, time and how much is done. Opens the popover. */
function AgendaPill({
  item,
  dayKey,
  today,
  onOpen,
  className = "",
  dragProps,
}: {
  item: DayRoutine;
  dayKey: string;
  today: string;
  onOpen: (e: React.MouseEvent, target: WeekTarget) => void;
  className?: string;
  dragProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const { routine, occurrence } = item;
  const color = colorOf(routine.color);
  const span = routineSpan(routine, occurrence);
  const { done, total } = progressOf(routine, occurrence);
  const status = routineStatus(item, dayKey, today);
  const skipped = !!occurrence.skipped;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e, { kind: "routine", date: dayKey, routineId: routine.id })}
      {...dragProps}
      className={`flex min-h-10 min-w-0 items-center gap-1.5 rounded-md py-1.5 pl-1.5 pr-2 text-left ${skipped ? "opacity-50" : ""} ${className}`}
      style={{ background: `color-mix(in srgb, ${color} ${total > 0 && done === total ? 30 : 15}%, transparent)` }}
    >
      <RoutineIcon icon={routine.icon} color={routine.color} size="sm" />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-xs font-medium ${skipped ? "line-through" : ""}`}>{routine.name || "Untitled routine"}</span>
        {span && <span className="block truncate text-[10px] text-muted">{formatTime(span.start)}</span>}
      </span>
      <ProgressMark done={done} total={total} color={color} status={skipped ? null : status} />
    </button>
  );
}

/** A day's own tasks on the phone list, as one pill. */
function AgendaTasksPill({
  tasks,
  dayKey,
  onOpen,
  className = "",
  dragProps,
}: {
  tasks: { id: string; title: string; done: boolean }[];
  dayKey: string;
  onOpen: (e: React.MouseEvent, target: WeekTarget) => void;
  className?: string;
  dragProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const done = tasks.filter((t) => t.done).length;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e, { kind: "tasks", date: dayKey, ids: tasks.map((t) => t.id) })}
      {...dragProps}
      className={`flex min-h-10 min-w-0 items-center gap-1.5 rounded-md py-1.5 pl-1.5 pr-2 text-left ${className}`}
      style={{ background: `color-mix(in srgb, ${TASK_COLOR} ${done === tasks.length ? 30 : 15}%, transparent)` }}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: TASK_COLOR }}>
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{tasks.length === 1 ? tasks[0].title || "Task" : `${tasks.length} tasks`}</span>
      <ProgressMark done={done} total={tasks.length} color={TASK_COLOR} status={null} />
    </button>
  );
}

/** A small ring filling up as tasks are done: a check when all are, an X when the day was missed. */
function ProgressMark({ done, total, color, status }: { done: number; total: number; color: string; status: DayStatus | null }) {
  if (total > 0 && done === total)
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
        <CheckIcon className="h-3 w-3" />
      </span>
    );
  if (status === "missed")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-muted">
        <CloseIcon className="h-3 w-3" />
      </span>
    );
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 -rotate-90" aria-label={`${done} of ${total} done`}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-foreground/15" />
      {done > 0 && <circle cx="10" cy="10" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(done / total) * c} ${c}`} />}
    </svg>
  );
}

const STATUS_COLOR: Record<DayStatus, string> = { done: "#22c55e", partial: "#eab308", missed: "#ef4444" };
const STATUS_LABEL: Record<DayStatus, string> = { done: "Everything done", partial: "Partly done", missed: "Missed" };

/** The mark by a past day's date: a green check, a yellow dash — or, when nothing was done, just a
    small muted X (quiet on purpose: a run of missed days shouldn't fill the month with red). */
function StatusBadge({ status }: { status: DayStatus }) {
  if (status === "missed")
    return (
      <span className="flex h-4 w-4 items-center justify-center text-muted/70" title={STATUS_LABEL[status]}>
        <CloseIcon className="h-2.5 w-2.5" />
      </span>
    );
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ background: STATUS_COLOR[status] }} title={STATUS_LABEL[status]}>
      {status === "done" ? <CheckIcon className="h-3 w-3" /> : <span className="h-0.5 w-2 rounded-full bg-white" />}
    </span>
  );
}
