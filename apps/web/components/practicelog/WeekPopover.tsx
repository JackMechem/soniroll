"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { burstAt } from "@/components/practicelog/Celebrations";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import RoutineTimePicker, { hasFixedTimes } from "@/components/practicelog/RoutineTime";
import { CheckIcon, ChevronRightIcon, CloseIcon, PlayIcon, PlusIcon } from "@/components/tools";
import {
  ROUTINE_COLORS,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  parseTime,
  progressOf,
  routineSpan,
  routineStatus,
  routinesOn,
  scheduleTasks,
  todayKey,
  WEEKDAY_SHORT,
  weekdayOf,
} from "@/lib/practiceLog";
import { type usePracticeLog, useRoutineTimer } from "@/lib/usePracticeLog";

type Log = ReturnType<typeof usePracticeLog>;

/** What the popover shows: one routine on a day, or some of a day's own tasks. */
export type WeekTarget = { kind: "routine"; date: string; routineId: string } | { kind: "tasks"; date: string; ids: string[] };

const WIDTH = 320;
const TASK_COLOR = "#64748b";

/**
 * A routine (or a day's own tasks) opened from the week view: tick tasks off right there, start
 * it on the timer, or open the day. A popover beside what was tapped; a bottom sheet on phones.
 * Escape, × and a click outside close it.
 */
export default function WeekPopover({
  target,
  anchor,
  log,
  onClose,
  onOpenDay,
}: {
  target: WeekTarget;
  anchor: DOMRect;
  log: Log;
  onClose: () => void;
  /** Switches to the day on its own (not given in day view). */
  onOpenDay?: (date: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // Beside the thing tapped (right if there's room, else left), kept on screen once its height is known.
  const fitsRight = anchor.right + 8 + WIDTH <= window.innerWidth - 8;
  const left = Math.max(8, Math.min(window.innerWidth - WIDTH - 8, fitsRight ? anchor.right + 8 : anchor.left - 8 - WIDTH));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || window.innerWidth < 640) return;
    const h = el.getBoundingClientRect().height;
    el.style.top = `${Math.max(8, Math.min(anchor.top - 8, window.innerHeight - h - 8))}px`;
  });

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/40 sm:bg-transparent" onPointerDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-label="Day details"
        onPointerDown={(e) => e.stopPropagation()}
        style={{ position: "fixed", top: anchor.top, left, width: WIDTH }}
        className="log-pop flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface shadow-2xl max-sm:!bottom-0 max-sm:!left-0 max-sm:!top-auto max-sm:!w-full max-sm:max-h-[80dvh] max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-surface-hover sm:hidden" />
        {target.kind === "routine" ? (
          <RoutineBody target={target} log={log} onClose={onClose} onOpenDay={onOpenDay} />
        ) : (
          <TasksBody target={target} log={log} onClose={onClose} onOpenDay={onOpenDay} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function dayLabel(date: string) {
  const today = todayKey();
  return date === today ? "Today" : `${WEEKDAY_SHORT[weekdayOf(date)]}, ${formatShortDate(date)}`;
}

function RoutineBody({ target, log, onClose, onOpenDay }: { target: Extract<WeekTarget, { kind: "routine" }>; log: Log; onClose: () => void; onOpenDay?: (date: string) => void }) {
  const { date, routineId } = target;
  const item = routinesOn(log.data, date).find((i) => i.routine.id === routineId);
  const { engine, startRoutine, runningTask } = useRoutineTimer();
  const [picking, setPicking] = useState(false);
  if (!item) return <Empty onClose={onClose} />;
  const { routine, occurrence } = item;
  const color = ROUTINE_COLORS[routine.color % ROUTINE_COLORS.length];
  const { done, total } = progressOf(routine, occurrence);
  const complete = total > 0 && done === total;
  const span = routineSpan(routine, occurrence);
  const schedule = scheduleTasks(routine, occurrence);
  const doneSet = new Set(occurrence.done ?? []);
  const skipped = !!occurrence.skipped;
  const status = routineStatus(item, date, todayKey());
  const running = runningTask(routine.id, date);
  const firstOpen = schedule.find((s) => !doneSet.has(s.task.id) && s.task.minutes > 0)?.task;
  const minutes = schedule.reduce((s, x) => s + x.task.minutes, 0);

  return (
    <>
      <header className="flex items-start gap-3 p-4 pb-3">
        <RoutineIcon icon={routine.icon} color={routine.color} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className={`truncate text-base font-semibold ${skipped ? "line-through opacity-60" : ""}`}>{routine.name || "Untitled routine"}</h3>
          <p className="text-xs text-muted">
            {dayLabel(date)} · {span ? `${formatTime(span.start)} – ${formatTime(span.end)}` : "Any time"} · {formatMinutesShort(minutes)}
            {span && !hasFixedTimes(routine, occurrence) && !picking && (
              <>
                {" · "}
                <button type="button" onClick={() => setPicking(true)} className="font-semibold text-accent hover:underline">
                  Change time
                </button>
              </>
            )}
          </p>
          {(skipped || complete || status === "missed" || status === "partial") && (
            <p className={`mt-0.5 text-xs font-semibold ${complete ? "text-green-600 dark:text-green-400" : skipped ? "text-muted" : status === "missed" ? "text-muted" : "text-amber-600 dark:text-amber-400"}`}>
              {skipped ? "Skipped this day" : complete ? "All done" : status === "missed" ? "Missed" : "Partly done"}
            </p>
          )}
        </div>
        <CloseButton onClose={onClose} />
      </header>
      {total > 0 && (
        <div className="mx-4 mb-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(done / total) * 100}%`, background: color }} />
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted">
            {done}/{total}
          </span>
        </div>
      )}
      {picking ? (
        <div className="mx-3 mb-2">
          <RoutineTimePicker date={date} routine={routine} occurrence={occurrence} log={log} onDone={() => setPicking(false)} />
        </div>
      ) : (
        !span &&
        !skipped && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="mx-3 mb-2 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-foreground/20 px-3 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
          >
            <PlusIcon className="h-4 w-4" /> Set a time
          </button>
        )
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto px-2">
        {schedule.map(({ task, start }) => {
          const checked = doneSet.has(task.id);
          const isNow = running === task.id;
          return (
            <li key={task.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={skipped}
                onClick={(e) => {
                  if (!checked) burstAt(e.currentTarget.querySelector("[data-box]") ?? e.currentTarget, color);
                  log.toggleTask(date, routine.id, task.id);
                }}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:opacity-50 sm:py-2 ${isNow ? "bg-accent/10" : ""}`}
              >
                <span
                  data-box
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors sm:h-5 sm:w-5 ${checked ? "log-check border-transparent text-white" : "border-surface-hover"}`}
                  style={checked ? { background: color } : undefined}
                >
                  {checked && <CheckIcon className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${checked ? "text-muted line-through" : ""}`}>{task.title || "Task"}</span>
                  <span className="block text-xs text-muted">
                    {start !== null && `${formatTime(start)} · `}
                    {formatMinutesShort(task.minutes)}
                    {isNow && engine && <span className="font-semibold text-accent"> · {engine.paused ? "Paused" : "Timing now"}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {schedule.length === 0 && <li className="px-2 py-2 text-sm text-muted">No tasks in this routine.</li>}
      </ul>
      <footer className="flex flex-wrap items-center gap-2 border-t border-surface-hover p-3">
        {skipped ? (
          <button
            type="button"
            onClick={() => log.updateOccurrence(date, routine.id, (o) => ({ ...o, skipped: false }))}
            className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover"
          >
            Don&apos;t skip this day
          </button>
        ) : (
          date === todayKey() &&
          firstOpen &&
          !running && (
            <button
              type="button"
              onClick={() => {
                startRoutine(routine, date, done > 0 ? firstOpen.id : undefined, false, occurrence);
                onClose();
              }}
              className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
            >
              <PlayIcon className="h-4 w-4" /> {done > 0 ? "Continue" : "Start routine"}
            </button>
          )
        )}
        <OpenDayButton date={date} onOpenDay={onOpenDay} onClose={onClose} />
      </footer>
    </>
  );
}

function TasksBody({ target, log, onClose, onOpenDay }: { target: Extract<WeekTarget, { kind: "tasks" }>; log: Log; onClose: () => void; onOpenDay?: (date: string) => void }) {
  const { date, ids } = target;
  const all = log.data.days[date]?.tasks ?? [];
  const tasks = all.filter((t) => ids.includes(t.id));
  const { engine, startDayTasks, runningTask } = useRoutineTimer();
  if (!tasks.length) return <Empty onClose={onClose} />;
  const running = runningTask("day", date);
  const done = tasks.filter((t) => t.done).length;
  const open = tasks.filter((t) => !t.done && t.minutes > 0);

  return (
    <>
      <header className="flex items-start gap-3 p-4 pb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: TASK_COLOR }}>
          <CheckIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{tasks.length === 1 ? tasks[0].title || "Task" : "Extra tasks"}</h3>
          <p className="text-xs text-muted">
            {dayLabel(date)} · {done} of {tasks.length} done
          </p>
        </div>
        <CloseButton onClose={onClose} />
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2">
        {tasks.map((t) => {
          const time = parseTime(t.time);
          const isNow = running === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={t.done}
                onClick={(e) => {
                  if (!t.done) burstAt(e.currentTarget.querySelector("[data-box]") ?? e.currentTarget, "var(--accent)");
                  log.toggleDayTask(date, t.id);
                }}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-hover sm:py-2 ${isNow ? "bg-accent/10" : ""}`}
              >
                <span
                  data-box
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors sm:h-5 sm:w-5 ${t.done ? "log-check border-transparent bg-accent text-accent-foreground" : "border-surface-hover"}`}
                >
                  {t.done && <CheckIcon className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${t.done ? "text-muted line-through" : ""}`}>{t.title || "Task"}</span>
                  <span className="block text-xs text-muted">
                    {time !== null && `${formatTime(time)} · `}
                    {formatMinutesShort(t.minutes)}
                    {isNow && engine && <span className="font-semibold text-accent"> · {engine.paused ? "Paused" : "Timing now"}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="flex flex-wrap items-center gap-2 border-t border-surface-hover p-3">
        {date === todayKey() && open.length > 0 && !running && (
          <button
            type="button"
            onClick={() => {
              startDayTasks(date, all, open.length === 1 ? open[0].id : undefined);
              onClose();
            }}
            className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            <PlayIcon className="h-4 w-4" /> {open.length === 1 ? "Start" : "Start all"}
          </button>
        )}
        <OpenDayButton date={date} onOpenDay={onOpenDay} onClose={onClose} />
      </footer>
    </>
  );
}

function OpenDayButton({ date, onOpenDay, onClose }: { date: string; onOpenDay?: (date: string) => void; onClose: () => void }) {
  if (!onOpenDay) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onOpenDay(date);
        onClose();
      }}
      className="ml-auto flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
    >
      Open day <ChevronRightIcon className="h-4 w-4" />
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
      <CloseIcon className="h-4 w-4" />
    </button>
  );
}

function Empty({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 p-4 text-sm text-muted">
      It isn&apos;t on this day any more.
      <CloseButton onClose={onClose} />
    </div>
  );
}
