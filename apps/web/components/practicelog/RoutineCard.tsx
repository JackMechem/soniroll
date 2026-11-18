"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import PracticeTimerRing from "@/components/PracticeTimerRing";
import { AttachmentList } from "@/components/practicelog/Attachments";
import { burstAt } from "@/components/practicelog/Celebrations";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import RecordClip from "@/components/practicelog/RecordClip";
import RoutineTimePicker from "@/components/practicelog/RoutineTime";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import Subtasks from "@/components/practicelog/Subtasks";
import { TOUCH_CHECK, TOUCH_ICON, TOUCH_TEXT } from "@/components/practicelog/touch";
import AttachedNotes, { LegacyNotes } from "@/components/shednotes/AttachedNotes";
import { CheckIcon, CloseIcon, DotsVerticalIcon, PauseIcon, PlayIcon, PlusIcon, RepeatIcon, StopIcon, StopwatchIcon } from "@/components/tools";
import LogTimeDialog, { type LogTarget } from "@/components/practicelog/LogTimeDialog";
import {
  type DayRoutine,
  type RoutineTask,
  newSubtask,
  newTask,
  tasksOf,
  ROUTINE_COLORS,
  describeRepeat,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  isRoutineNow,
  routineStatus,
  progressOf,
  routineSpan,
  scheduleTasks,
  todayKey,
} from "@/lib/practiceLog";
import { pause, resume, skip, stop } from "@/lib/practiceTimerEngine";
import type { Recording } from "@/lib/recordings";
import { useClockMinute } from "@/lib/useClockMinute";
import { type usePracticeLog, useRoutineTimer } from "@/lib/usePracticeLog";

type Log = ReturnType<typeof usePracticeLog>;

/** One routine on one day: its tasks to check off (with when each one is), Start (runs it on the
    Practice Timer), what's attached, notes for the day, and the clips recorded for it that day.
    On a day that's gone, there's nothing to start: Log time puts time on it instead. */
export default function RoutineCard({
  date,
  item,
  log,
  recordings,
  dayRoutines,
}: {
  date: string;
  item: DayRoutine;
  log: Log;
  recordings: Recording[] | undefined;
  dayRoutines: { id: string; name: string }[];
}) {
  const { routine, occurrence, added } = item;
  const { engine, startRoutine, runningTask } = useRoutineTimer();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirming, setConfirming] = useState<{ title: string; message: string; label: string; run: () => void } | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [logging, setLogging] = useState<{ target: LogTarget; minutes?: number } | null>(null);
  const today = todayKey();
  const past = date < today;
  const logTask = (task: RoutineTask) => setLogging({ target: { kind: "routine", routineId: routine.id, taskId: task.id }, minutes: task.minutes || undefined });
  const color = ROUTINE_COLORS[routine.color % ROUTINE_COLORS.length];
  const { done, total } = progressOf(routine, occurrence);
  const complete = total > 0 && done === total;
  const schedule = scheduleTasks(routine, occurrence);
  const span = routineSpan(routine, occurrence);
  const running = runningTask(routine.id, date);
  const doneSet = new Set(occurrence.done ?? []);
  const allTasks = tasksOf(routine, occurrence);
  const extraIds = new Set((occurrence.extraTasks ?? []).map((t) => t.id));
  const subDone = new Set(occurrence.subDone ?? []);
  const firstOpen = allTasks.find((t) => !doneSet.has(t.id) && t.minutes > 0);
  const [newTitle, setNewTitle] = useState("");
  const setExtra = (fn: (list: RoutineTask[]) => RoutineTask[]) => log.updateOccurrence(date, routine.id, (o) => ({ ...o, extraTasks: fn(o.extraTasks ?? []) }));
  const skipped = !!occurrence.skipped;
  const mine = recordings?.filter((r) => r.routineId === routine.id) ?? [];
  const timeOverride = occurrence.startTime !== undefined;
  const noteTarget = { kind: "routine" as const, date, routineId: routine.id };
  const noteLabel = `${routine.name || "Untitled routine"} · ${formatShortDate(date)}`;
  const clock = useClockMinute();
  // Its time is now: outlined in its colour.
  const timeIsNow = !!clock && clock.today === date && isRoutineNow(item, clock.nowMin);

  function openMenu(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      x: rect.right - 208,
      y: rect.bottom + 4,
      items: [
        { label: span ? "Change the time" : "Set a time", onSelect: () => setEditingTime(true) },
        ...(timeOverride
          ? [{ label: "Use the routine's own time", onSelect: () => log.updateOccurrence(date, routine.id, (o) => { const n = { ...o }; delete n.startTime; return n; }) }]
          : []),
        complete
          ? { label: "Uncheck every task", onSelect: () => log.setAllTasks(date, routine.id, false) }
          : { label: "Check every task", onSelect: () => log.setAllTasks(date, routine.id, true) },
        added
          ? {
              label: "Remove from this day",
              danger: true,
              onSelect: () => {
                // Ask first when it would take ticks, time or notes with it.
                const o = occurrence;
                const hasWork =
                  (o.done?.length ?? 0) > 0 || (o.subDone?.length ?? 0) > 0 || Object.values(o.spentMs ?? {}).some((ms) => ms > 0) || !!o.notes?.trim() || (o.extraTasks?.length ?? 0) > 0;
                const remove = () => log.removeFromDay(date, routine.id);
                if (!hasWork) return remove();
                setConfirming({
                  title: "Remove it from this day?",
                  message: `${routine.name || "This routine"} comes off ${formatShortDate(date)}, with what you checked off, timed and noted for it there.`,
                  label: "Remove",
                  run: remove,
                });
              },
            }
          : skipped
            ? { label: "Don't skip this day", onSelect: () => log.updateOccurrence(date, routine.id, (o) => ({ ...o, skipped: false })) }
            : { label: "Skip this day", onSelect: () => log.updateOccurrence(date, routine.id, (o) => ({ ...o, skipped: true })) },
      ],
    });
  }

  return (
    <article
      className={`relative flex flex-col gap-3 overflow-hidden rounded-lg bg-surface p-4 pl-5 ${skipped ? "opacity-60" : ""}`}
      style={timeIsNow ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <header className="flex items-start gap-3 pl-1">
        <RoutineIcon icon={routine.icon} color={routine.color} size="md" />
        <div className="min-w-0 flex-1">
          <Link href={`/shed-log/routine?id=${encodeURIComponent(routine.id)}`} className={`block truncate text-base font-semibold hover:underline ${skipped ? "line-through" : ""}`}>
            {routine.name || "Untitled routine"}
          </Link>
          {routine.assigned && <span className="text-[11px] font-medium text-muted">From {routine.assigned.teacher}</span>}
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {span ? (
              <span className={timeOverride ? "font-semibold text-foreground" : ""}>{`${formatTime(span.start)} – ${formatTime(span.end)}`}</span>
            ) : (
              <button type="button" onClick={() => setEditingTime(true)} className={`font-medium text-foreground/80 hover:text-foreground hover:underline ${TOUCH_TEXT}`} title="Set a time">
                Any time · Set a time
              </button>
            )}
            <span>·</span>
            <span>{formatMinutesShort(allTasks.reduce((s, t) => s + t.minutes, 0))}</span>
            <span className="flex basis-full items-center gap-1">
              {added ? "Added to this day" : (
                <>
                  <RepeatIcon className="h-3 w-3" /> {describeRepeat(routine.repeat)}
                </>
              )}
            </span>
            {skipped && <span className="font-semibold text-foreground">· Skipped</span>}
            {!skipped && routineStatus(item, date, today) === "missed" && <span className="text-muted">· Missed</span>}
            {routineStatus(item, date, today) === "partial" && <span className="font-semibold text-warning">· Partly done</span>}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium tabular-nums ${complete ? "text-white" : "text-muted"}`}
          style={complete ? { background: color } : undefined}
        >
          {done}/{total}
        </span>
        <button type="button" onClick={openMenu} aria-label="Routine options" className="-mr-1 shrink-0 rounded-md p-1.5 text-muted pointer-coarse:-my-1.5 pointer-coarse:p-3 hover:bg-surface-hover hover:text-foreground">
          <DotsVerticalIcon className="h-4 w-4" />
        </button>
      </header>

      {total > 0 && (
        <div className="-mt-1 h-1 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(done / total) * 100}%`, background: color }} />
        </div>
      )}

      {editingTime && <RoutineTimePicker date={date} routine={routine} occurrence={occurrence} log={log} onDone={() => setEditingTime(false)} />}

      {engine && running ? (
        <div className="flex items-center gap-4 rounded-md bg-background p-3">
          <PracticeTimerRing size="sm" startedAt={engine.startedAt} durationMs={engine.durationMs} paused={engine.paused} remainingMsAtPause={engine.remainingMsAtPause} alarming={engine.alarming} />
          <div className="min-w-0 flex-1">
            <div className={`text-xs font-semibold ${engine.alarming ? "animate-pulse text-danger" : "text-muted"}`}>
              {engine.alarming ? "Time's up" : engine.paused ? "Paused" : "Now"}
            </div>
            <div className="truncate font-medium">{engine.current.title}</div>
            <div className="truncate text-xs text-muted">{engine.next ? `Next: ${engine.next.title}` : "Last task"}</div>
          </div>
          <div className="flex shrink-0 gap-1">
            {engine.alarming ? (
              <TimerButton label="Continue" onClick={skip} primary>
                <PlayIcon className="h-4 w-4" />
              </TimerButton>
            ) : engine.paused ? (
              <TimerButton label="Resume" onClick={resume} primary>
                <PlayIcon className="h-4 w-4" />
              </TimerButton>
            ) : (
              <TimerButton label="Pause" onClick={pause}>
                <PauseIcon className="h-4 w-4" />
              </TimerButton>
            )}
            {!engine.alarming && (
              <TimerButton label="Skip — don't check it off" onClick={skip}>
                <span className="text-xs font-bold">»</span>
              </TimerButton>
            )}
            <TimerButton label="Stop" onClick={stop}>
              <StopIcon className="h-4 w-4 text-danger" />
            </TimerButton>
          </div>
        </div>
      ) : (
        !skipped &&
        firstOpen &&
        (past ? (
          <button
            type="button"
            onClick={() => logTask(firstOpen)}
            className="flex h-9 items-center justify-center gap-1.5 self-start rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            <StopwatchIcon className="h-4 w-4" />
            Log time
          </button>
        ) : (
          <button
            type="button"
            onClick={() => startRoutine(routine, date, done > 0 ? firstOpen.id : undefined, false, occurrence)}
            // Secondary (a tint, not solid): the day timer's Start timer is the panel's main button.
            className="flex h-9 min-w-0 items-center justify-center gap-1.5 self-start rounded-md bg-accent/10 px-3 text-sm font-medium text-accent hover:bg-accent/15"
          >
            <PlayIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{done > 0 ? `Continue from ${firstOpen.title || "the next task"}` : "Start routine"}</span>
          </button>
        ))
      )}

      {allTasks.length > 0 && (
        <ul className="flex flex-col">
          {schedule.map(({ task, start }) => {
            const checked = doneSet.has(task.id);
            const spent = occurrence.spentMs?.[task.id];
            const isNow = running === task.id;
            return (
              <li key={task.id} className={`group flex items-start gap-3 rounded-md px-1 py-2 ${isNow ? "bg-accent/10" : ""}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`${task.title || "Task"} done`}
                  onClick={(e) => {
                    if (!checked) burstAt(e.currentTarget, color);
                    log.toggleTask(date, routine.id, task.id);
                  }}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors ${TOUCH_CHECK} ${checked ? "log-check border-transparent text-white" : "border-foreground/25 hover:border-muted"}`}
                  style={checked ? { background: color } : undefined}
                >
                  {checked && <CheckIcon className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${checked ? "text-muted line-through" : ""}`}>
                    {task.title || "Untitled task"}
                    {extraIds.has(task.id) && <span className="ml-1.5 rounded-sm bg-foreground/[0.05] px-1 py-px align-middle text-[10px] font-medium text-muted">Today only</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {start !== null && <span className={task.time ? "font-medium" : ""}>{formatTime(start)}</span>}
                    <span>{formatMinutesShort(task.minutes)}</span>
                    {spent ? <span>· {formatMinutesShort(spent / 60000)} logged</span> : null}
                    {checked && !spent && task.minutes > 0 && (
                      <button
                        type="button"
                        onClick={() => log.updateOccurrence(date, routine.id, (o) => ({ ...o, spentMs: { ...(o.spentMs ?? {}), [task.id]: task.minutes * 60000 } }))}
                        className={`rounded-md bg-foreground/[0.05] px-2 py-0.5 font-medium text-foreground hover:bg-surface-hover ${TOUCH_TEXT}`}
                        title="Checked off without the timer — log its time"
                      >
                        + Log {formatMinutesShort(task.minutes)}
                      </button>
                    )}
                  </div>
                  <Subtasks
                    items={task.subtasks ?? []}
                    color={color}
                    isDone={(id) => subDone.has(id)}
                    onToggle={(id) =>
                      log.updateOccurrence(date, routine.id, (o) => {
                        const list = o.subDone ?? [];
                        return { ...o, subDone: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
                      })
                    }
                    {...(extraIds.has(task.id)
                      ? {
                          onAdd: (title: string) => setExtra((list) => list.map((t) => (t.id === task.id ? { ...t, subtasks: [...(t.subtasks ?? []), newSubtask(title)] } : t))),
                          onRemove: (id: string) => setExtra((list) => list.map((t) => (t.id === task.id ? { ...t, subtasks: (t.subtasks ?? []).filter((x) => x.id !== id) } : t))),
                        }
                      : {})}
                  />
                  {task.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{task.notes}</p>}
                  {task.attachments.length > 0 && (
                    <div className="mt-1.5">
                      <AttachmentList items={task.attachments} compact />
                    </div>
                  )}
                </div>
                {!skipped && past && !checked && (
                  <button
                    type="button"
                    onClick={() => logTask(task)}
                    aria-label={`Log time on ${task.title || "this task"}`}
                    title="Log time on this task"
                    className={`shrink-0 rounded-md p-1.5 text-muted opacity-100 hover:bg-surface-hover hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100 ${TOUCH_ICON}`}
                  >
                    <StopwatchIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {!skipped && !past && task.minutes > 0 && !isNow && (
                  <button
                    type="button"
                    onClick={() => startRoutine(routine, date, task.id, true, occurrence)}
                    aria-label={`Time just ${task.title || "this task"}`}
                    title="Time just this task"
                    className={`shrink-0 rounded-md p-1.5 text-muted opacity-100 hover:bg-surface-hover hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100 ${TOUCH_ICON}`}
                  >
                    <PlayIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                {extraIds.has(task.id) && (
                  <button
                    type="button"
                    onClick={() => {
                      const remove = () => setExtra((list) => list.filter((t) => t.id !== task.id));
                      // Ticked or timed: ask first, it takes that with it.
                      if (!(occurrence.done ?? []).includes(task.id) && !((occurrence.spentMs ?? {})[task.id] > 0)) return remove();
                      setConfirming({
                        title: "Remove this task?",
                        message: `"${task.title || "Task"}" comes off ${routine.name || "this routine"} for ${formatShortDate(date)}, with the time logged on it.`,
                        label: "Remove",
                        run: remove,
                      });
                    }}
                    aria-label={`Remove ${task.title || "this task"} from today`}
                    title="Remove from today"
                    className={`shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-danger ${TOUCH_ICON}`}
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!skipped && (
        // A form, so a phone keyboard's Done/Go adds it too; Add shows once something's typed.
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTitle.trim()) return;
            setExtra((list) => [...list, newTask(newTitle.trim())]);
            setNewTitle("");
          }}
          className="flex min-h-9 items-center gap-2 rounded-md border border-dashed border-foreground/15 py-1 pl-3 pr-1 pointer-coarse:min-h-10"
        >
          <PlusIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            enterKeyHint="done"
            aria-label="New task for this day"
            placeholder={`Add a task just for ${date === today ? "today" : formatShortDate(date)}`}
            className="min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none pointer-coarse:text-base"
          />
          {newTitle.trim() && (
            <button type="submit" className="h-7 shrink-0 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover pointer-coarse:h-8">
              Add
            </button>
          )}
        </form>
      )}

      {routine.attachments.length > 0 && <AttachmentList items={routine.attachments} />}

      {occurrence.notes !== undefined && occurrence.notes !== "" && (
        <LegacyNotes
          text={occurrence.notes}
          onChange={(notes) => log.updateOccurrence(date, routine.id, (o) => ({ ...o, notes }))}
          onClear={() => log.updateOccurrence(date, routine.id, (o) => { const n = { ...o }; delete n.notes; return n; })}
          target={noteTarget}
          label={noteLabel}
          newTitle={noteLabel}
          placeholder={`How did ${routine.name || "it"} go today?`}
        />
      )}

      {mine.length > 0 && (
        <div className="flex flex-col gap-2">
          {mine.map((r) => (
            <RecordingCard key={r._id} recording={r} />
          ))}
        </div>
      )}
      <AttachedNotes target={noteTarget} label={noteLabel} newTitle={noteLabel}>
        <RecordClip date={date} routineId={routine.id} routines={dayRoutines} compact />
      </AttachedNotes>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {logging && <LogTimeDialog date={date} log={log} initial={logging.target} initialMinutes={logging.minutes} onClose={() => setLogging(null)} />}
      {/* On <body>: a skipped card is faded, and the fade would carry into the dialog. */}
      {confirming &&
        createPortal(
          <ConfirmDialog
            title={confirming.title}
            message={confirming.message}
            confirmLabel={confirming.label}
            onCancel={() => setConfirming(null)}
            onConfirm={() => {
              confirming.run();
              setConfirming(null);
            }}
          />,
          document.body,
        )}
    </article>
  );
}

function TimerButton({ label, onClick, primary = false, children }: { label: string; onClick: () => void; primary?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-md ${primary ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "hover:bg-surface-hover"}`}
    >
      {children}
    </button>
  );
}
