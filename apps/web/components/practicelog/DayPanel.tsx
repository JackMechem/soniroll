"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { AttachmentList } from "@/components/practicelog/Attachments";
import RecordClip from "@/components/practicelog/RecordClip";
import RoutineCard from "@/components/practicelog/RoutineCard";
import AttachedNotes, { LegacyNotes } from "@/components/shednotes/AttachedNotes";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import { SHARE_PROGRESS_EVENT } from "@/components/practicelog/Celebrations";
import TaskDialog from "@/components/practicelog/TaskDialog";
import Subtasks from "@/components/practicelog/Subtasks";
import TaskCheck from "@/components/practicelog/TaskCheck";
import { TOUCH_ICON, TOUCH_TEXT } from "@/components/practicelog/touch";
import LogTimeDialog, { type LogTarget } from "@/components/practicelog/LogTimeDialog";
import DayTimer, { useDayTimerMs } from "@/components/practicelog/DayTimer";
import { CheckIcon, ChecklistIcon, ChevronLeftIcon, ChevronRightIcon, DotsVerticalIcon, MicIcon, findToolLink, PencilIcon, PlayIcon, PlusIcon, RepeatIcon, ShareIcon, StopwatchIcon } from "@/components/tools";
import {
  type DayTask,
  addDays,
  clearDayTime,
  dayProgress,
  newDayTask,
  newSubtask,
  parseTime,
  progressOf,
  formatLongDate,
  formatShortDate,
  formatMinutesShort,
  formatTime,
  minutesOn,
  routinesOn,
  todayKey,
} from "@/lib/practiceLog";
import type { Recording } from "@/lib/recordings";
import { type usePracticeLog, useRoutineTimer } from "@/lib/usePracticeLog";

type Log = ReturnType<typeof usePracticeLog>;

/** Everything on one day: its routines, Practice Timer time, minutes logged by hand, the day's
    notes and attachments, and the clips recorded that day. */
export default function DayPanel({
  date,
  log,
  recordings,
  onDateChange,
  wide = false,
  controls,
}: {
  date: string;
  log: Log;
  recordings: Recording[] | undefined;
  onDateChange: (date: string) => void;
  /** Day view: the panel has the whole page, so the side cards get a column of their own. */
  wide?: boolean;
  /** Shown at the end of the date header (the view switch, in day view). */
  controls?: React.ReactNode;
}) {
  const router = useRouter();
  const { data } = log;
  const day = data.days[date] ?? {};
  const items = routinesOn(data, date);
  const watch = useDayTimerMs(data, date);
  const minutes = minutesOn(data, date, watch.liveMs);
  const progress = dayProgress(data, date);
  // The day's "x of y done" bar sums the routines and the extra tasks; with just one of them it
  // only repeats that routine's own bar (or the Extra tasks count), so it's left out.
  const progressParts = items.filter((i) => !i.occurrence.skipped && progressOf(i.routine, i.occurrence).total > 0).length + ((day.tasks?.length ?? 0) > 0 ? 1 : 0);
  const showProgress = progress.total > 0 && progressParts > 1;
  const isToday = date === todayKey();
  // The day timer shows today, or another day that has time; with neither, no empty "Progress".
  const hasProgress = showProgress || isToday || watch.ms > 0;
  // A day that's gone: nothing to start, so logging time for it comes first.
  const past = date < todayKey();
  const dayRoutines = items.map((i) => ({ id: i.routine.id, name: i.routine.name || "Untitled routine" }));
  const dayRecordings = recordings?.filter((r) => r.logDate === date) ?? [];
  const loose = dayRecordings.filter((r) => !r.routineId || !items.some((i) => i.routine.id === r.routineId));
  const [addMenu, setAddMenu] = useState<MenuState | null>(null);
  const [logging, setLogging] = useState(false);

  function openAddMenu(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const onDay = new Set(items.map((i) => i.routine.id));
    const others = data.routines.filter((r) => !onDay.has(r.id));
    // Nothing else to pick from: go straight to a new routine rather than a one-item menu.
    if (others.length === 0) {
      router.push(`/shed-log/routine/edit?date=${date}`);
      return;
    }
    setAddMenu({
      x: Math.min(rect.left, window.innerWidth - 296),
      y: rect.bottom + 4,
      // Wide enough for "Add <routine name> to this day".
      width: 288,
      items: [
        { label: "New routine", icon: <PlusIcon className="h-4 w-4 text-muted" />, onSelect: () => router.push(`/shed-log/routine/edit?date=${date}`) },
        ...others.map((r) => ({
          label: `Add ${r.name || "Untitled routine"} to this day`,
          icon: <RoutineIcon icon={r.icon} color={r.color} size="sm" />,
          onSelect: () => log.addToDay(date, r.id),
        })),
      ],
    });
  }

  const progressSection = (
    <DaySection icon={<CheckIcon className="h-4 w-4" />} title="Progress">
      <div className={wide && showProgress ? "grid gap-3 lg:grid-cols-2 lg:items-stretch" : "contents"}>
      {showProgress && (
        <div className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${(progress.done / progress.total) * 100}%`,
                background: progress.done === progress.total ? "var(--success)" : "var(--accent)",
              }}
            />
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {progress.done === progress.total ? "All done!" : `${progress.done} of ${progress.total} done`}
          </span>
        </div>
      )}

      <DayTimer data={data} date={date} onClear={() => log.updateDay(date, clearDayTime)} />
      </div>
    </DaySection>
  );

  const logTimeSection = (
    <DaySection icon={<StopwatchIcon className="h-4 w-4" />} title="Log time">
      <LogTimeCard date={date} log={log} minutes={minutes} onMore={() => setLogging(true)} />
    </DaySection>
  );

  return (
    <section className={`flex flex-col gap-5 ${wide ? "mx-auto w-full max-w-6xl" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onDateChange(addDays(date, -1))} aria-label="Previous day" className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className={`min-w-0 ${wide ? "" : "flex-1 text-center"}`}>
          <h2 className={`truncate font-semibold ${wide ? "text-xl" : "text-base"}`}>{formatLongDate(date)}</h2>
          <p className="text-xs text-muted">
            {isToday ? "Today · " : ""}
            {minutes > 0 ? `${formatMinutesShort(Math.round(minutes))} practiced` : "Nothing logged yet"}
            {date <= todayKey() && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent(SHARE_PROGRESS_EVENT, { detail: { kind: "day", date } }))}
                  className={`inline-flex items-center gap-1 font-medium text-foreground/80 hover:text-foreground hover:underline ${TOUCH_TEXT}`}
                >
                  <ShareIcon className="h-3 w-3" /> Day report
                </button>
              </>
            )}
          </p>
        </div>
        <button type="button" onClick={() => onDateChange(addDays(date, 1))} aria-label="Next day" className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
          <ChevronRightIcon className="h-5 w-5" />
        </button>
        {controls && <div className="ml-auto">{controls}</div>}
      </div>

      {hasProgress && progressSection}

      {past && logTimeSection}

      <div className={wide ? "grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8" : "contents"}>
      <div className={wide ? "flex min-w-0 flex-col gap-6" : "contents"}>

      <DaySection
        icon={<RepeatIcon className="h-4 w-4" />}
        title="Routines"
        count={items.length || undefined}
        action={
          <button type="button" onClick={openAddMenu} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground pointer-coarse:h-8">
            <PlusIcon className="h-3.5 w-3.5" /> Add routine
          </button>
        }
      >
        {items.length === 0 ? (
          <button
            type="button"
            onClick={openAddMenu}
            className="rounded-lg border border-dashed border-foreground/15 p-4 text-left text-sm text-muted hover:border-foreground/30 hover:text-foreground"
          >
            {data.routines.length === 0 ? "No routines yet. Make one to plan what to practice and when." : "No routines on this day. Add one?"}
          </button>
        ) : (
          items.map((item) => (
            <RoutineCard key={item.routine.id} date={date} item={item} log={log} recordings={recordings} dayRoutines={dayRoutines} />
          ))
        )}
      </DaySection>

      <DayTasks date={date} log={log} />
      </div>

      <div className={wide ? "flex min-w-0 flex-col gap-6" : "contents"}>

      {(day.sessions?.length ?? 0) > 0 && (
        <DaySection icon={<StopwatchIcon className="h-4 w-4" />} title="Timed practice" count={day.sessions!.length}>
        <div className="flex flex-col gap-1 rounded-lg bg-surface px-4 py-3">
          <ul className="flex flex-col text-sm">
            {day.sessions!.map((s, i) => {
              const tool = s.tool ? findToolLink(s.tool) : undefined;
              const ToolIcon = tool?.icon ?? StopwatchIcon;
              return (
              <li key={i} className="flex items-center justify-between gap-2 py-0.5">
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <ToolIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                  {s.tool ? <Link href={s.tool} className="truncate hover:underline">{s.title}</Link> : s.title}
                  {s.session !== s.title && <span className="text-muted"> · {s.session}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {formatTime(new Date(s.at).getHours() * 60 + new Date(s.at).getMinutes())} · {formatMinutesShort(Math.max(1, Math.round(s.ms / 60000)))}
                </span>
              </li>
              );
            })}
          </ul>
        </div>
        </DaySection>
      )}

      {!past && logTimeSection}

      <DaySection icon={<PencilIcon className="h-4 w-4" />} title="Notes">
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
          {!!day.notes && (
            <LegacyNotes
              text={day.notes}
              onChange={(notes) => log.updateDay(date, (d) => ({ ...d, notes }))}
              onClear={() => log.updateDay(date, (d) => { const n = { ...d }; delete n.notes; return n; })}
              target={{ kind: "day", date }}
              label={formatLongDate(date)}
              newTitle={`Practice · ${formatLongDate(date)}`}
              placeholder="What you worked on, how it went"
            />
          )}
          <AttachedNotes target={{ kind: "day", date }} label={formatLongDate(date)} newTitle={`Practice · ${formatLongDate(date)}`} />
          <AttachmentList items={day.attachments ?? []} onChange={(attachments) => log.updateDay(date, (d) => ({ ...d, attachments }))} />
        </div>
      </DaySection>

      <DaySection icon={<MicIcon className="h-4 w-4" />} title="Recordings" count={dayRecordings.length || undefined}>
      <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
        {dayRecordings.length === 0 && <p className="text-sm text-muted">No clips recorded on this day.</p>}
        {loose.map((r) => (
          <RecordingCard key={r._id} recording={r} />
        ))}
        {dayRecordings.length > loose.length && (
          <p className="text-xs text-muted">
            {dayRecordings.length - loose.length} more with{" "}
            {[...new Set(dayRecordings.filter((r) => !loose.includes(r)).map((r) => items.find((i) => i.routine.id === r.routineId)?.routine.name))].filter(Boolean).join(", ")} above.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <RecordClip date={date} routines={dayRoutines} />
        </div>
      </div>
      </DaySection>
      </div>
      </div>
      {addMenu && <ContextMenu menu={addMenu} onClose={() => setAddMenu(null)} />}
      {logging && <LogTimeDialog date={date} log={log} onClose={() => setLogging(false)} />}
    </section>
  );
}

/** The day's own tasks (not part of a routine): a quick-add box, a checklist, and the timer. */
function DayTasks({ date, log }: { date: string; log: Log }) {
  const tasks = log.data.days[date]?.tasks ?? [];
  const { engine, startDayTasks, runningTask } = useRoutineTimer();
  const running = runningTask("day", date);
  // A day that's gone: its tasks get time logged, not timed.
  const past = date < todayKey();
  const [logging, setLogging] = useState<{ target: LogTarget; minutes?: number } | null>(null);
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<{ task: DayTask; isNew: boolean } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // A task with something on it (ticked, timed, notes, subtasks, attachments) asks before it goes;
  // a bare one is deleted at once.
  const [deleting, setDeleting] = useState<DayTask | null>(null);
  const askDelete = (t: DayTask) => {
    const hasWork = t.done || (t.spentMs ?? 0) > 0 || !!t.notes?.trim() || (t.subtasks?.length ?? 0) > 0 || (t.attachments?.length ?? 0) > 0;
    if (hasWork) setDeleting(t);
    else log.removeDayTask(date, t.id);
  };
  const sorted = [...tasks].sort((a, b) => {
    const ta = parseTime(a.time);
    const tb = parseTime(b.time);
    if (ta !== null && tb !== null) return ta - tb;
    return ta !== null ? -1 : tb !== null ? 1 : 0;
  });
  const open = tasks.filter((t) => !t.done && t.minutes > 0);

  function quickAdd() {
    const t = title.trim();
    if (!t) return;
    log.saveDayTask(date, { ...newDayTask(t) });
    setTitle("");
  }

  return (
    <DaySection
      icon={<ChecklistIcon className="h-4 w-4" />}
      title="Extra tasks"
      count={tasks.length ? `${tasks.filter((t) => t.done).length}/${tasks.length}` : undefined}
      action={
        open.length > 1 &&
        !running &&
        !past && (
          <button type="button" onClick={() => startDayTasks(date, tasks)} className="flex h-7 items-center gap-1 rounded-md bg-accent/10 px-2.5 text-xs font-medium text-accent hover:bg-accent/15 pointer-coarse:h-8">
            <PlayIcon className="h-3.5 w-3.5" /> Start all
          </button>
        )
      }
    >
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
      {sorted.length === 0 && <p className="text-sm text-muted">One-off things to practice on just this day, outside your routines.</p>}
      {sorted.length > 0 && (
        <ul className="flex flex-col">
          {sorted.map((t) => {
            const isNow = running === t.id;
            const time = parseTime(t.time);
            return (
              <li key={t.id} className={`group flex items-start gap-3 rounded-md px-1 py-2.5 lg:py-2 ${isNow ? "bg-accent/10" : ""}`}>
                <div className="min-w-0 flex-1">
                {/* The box, the name and its minutes are one target that ticks it (Edit is in ⋮). */}
                <TaskCheck
                  checked={t.done}
                  label={t.title}
                  color="var(--accent)"
                  boxClass="h-6 w-6 lg:h-5 lg:w-5"
                  onToggle={() => log.toggleDayTask(date, t.id)}
                  meta={[
                    time !== null && <span className="font-medium">{formatTime(time)}</span>,
                    formatMinutesShort(t.minutes),
                    !!t.spentMs && `${formatMinutesShort(t.spentMs / 60000)} logged`,
                  ]}
                />
                <div className="pl-9 lg:pl-8">
                {t.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{t.notes}</p>}
                {t.done && !t.spentMs && t.minutes > 0 && (
                  <button
                    type="button"
                    onClick={() => log.saveDayTask(date, { ...t, spentMs: t.minutes * 60000 })}
                    className={`mt-1 rounded-md bg-foreground/[0.05] px-2 py-0.5 text-xs font-medium hover:bg-surface-hover ${TOUCH_TEXT}`}
                    title="Checked off without the timer — log its time"
                  >
                    + Log {formatMinutesShort(t.minutes)}
                  </button>
                )}
                <Subtasks
                  items={t.subtasks ?? []}
                  isDone={(id) => !!t.subtasks?.find((x) => x.id === id)?.done}
                  onToggle={(id) => log.saveDayTask(date, { ...t, subtasks: (t.subtasks ?? []).map((x) => (x.id === id ? { ...x, done: !x.done } : x)) })}
                  onAdd={(title) => log.saveDayTask(date, { ...t, subtasks: [...(t.subtasks ?? []), newSubtask(title)] })}
                  onRemove={(id) => log.saveDayTask(date, { ...t, subtasks: (t.subtasks ?? []).filter((x) => x.id !== id) })}
                />
                </div>
                </div>
                {isNow && engine ? (
                  <span className="shrink-0 rounded-sm bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">{engine.paused ? "Paused" : "Timing"}</span>
                ) : (
                  !t.done &&
                  (past ? (
                    <button
                      type="button"
                      onClick={() => setLogging({ target: { kind: "task", taskId: t.id }, minutes: t.minutes || undefined })}
                      aria-label={`Log time on ${t.title}`}
                      title="Log time on this task"
                      className={`shrink-0 rounded-md bg-foreground/[0.05] p-2 text-muted hover:text-foreground lg:border-transparent lg:p-1.5 lg:opacity-0 lg:hover:bg-surface-hover lg:group-hover:opacity-100 ${TOUCH_ICON}`}
                    >
                      <StopwatchIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                  t.minutes > 0 && (
                    <button
                      type="button"
                      onClick={() => startDayTasks(date, tasks, t.id)}
                      aria-label={`Time ${t.title}`}
                      title="Start the timer"
                      className={`shrink-0 rounded-md bg-foreground/[0.05] p-2 text-muted hover:text-foreground lg:border-transparent lg:p-1.5 lg:opacity-0 lg:hover:bg-surface-hover lg:group-hover:opacity-100 ${TOUCH_ICON}`}
                    >
                      <PlayIcon className="h-3.5 w-3.5" />
                    </button>
                  )
                  ))
                )}
                <button
                  type="button"
                  aria-label="Task options"
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenu({
                      x: r.right - 208,
                      y: r.bottom + 4,
                      items: [
                        { label: "Edit", onSelect: () => setEditing({ task: t, isNew: false }) },
                        { label: "Move to the next day", onSelect: () => log.moveDayTask(date, addDays(date, 1), { ...t, done: false }) },
                        { label: "Delete", danger: true, onSelect: () => askDelete(t) },
                      ],
                    });
                  }}
                  className={`shrink-0 rounded-md p-2 text-muted hover:bg-surface-hover hover:text-foreground lg:p-1.5 ${TOUCH_ICON}`}
                >
                  <DotsVerticalIcon className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          quickAdd();
        }}
        className="flex items-center gap-2 rounded-md bg-background py-1 pl-3 pr-1"
      >
        <PlusIcon className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="done"
          aria-label="New extra task"
          placeholder="Add an extra task"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none lg:py-1 lg:text-sm"
        />
        <button
          type="button"
          onClick={() => setEditing({ task: newDayTask(title.trim()), isNew: true })}
          title="Add with a time, length and notes"
          className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground pointer-coarse:h-8"
        >
          Details
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="h-8 shrink-0 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {editing && (
        <TaskDialog
          initial={editing.task}
          date={date}
          isNew={editing.isNew}
          onSave={(task, to) => {
            log.moveDayTask(date, to, task);
            if (editing.isNew) setTitle("");
          }}
          onDelete={editing.isNew ? undefined : () => askDelete(editing.task)}
          onClose={() => setEditing(null)}
        />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {deleting &&
        createPortal(
          <ConfirmDialog
            title="Delete this task?"
            message={`"${deleting.title || "Task"}" comes off ${formatShortDate(date)}, along with anything logged or noted on it.`}
            confirmLabel="Delete"
            onCancel={() => setDeleting(null)}
            onConfirm={() => {
              log.removeDayTask(date, deleting.id);
              setDeleting(null);
            }}
          />,
          document.body,
        )}

      {logging && <LogTimeDialog date={date} log={log} initial={logging.target} initialMinutes={logging.minutes} onClose={() => setLogging(null)} />}
    </div>
    </DaySection>
  );
}

const QUICK_LOG = [5, 10, 15, 30, 45, 60];

/** Time practiced without the timer: one tap adds it to the day's total (with Undo); "Other…"
    opens the dialog for any amount, or to put it on a particular task. */
function LogTimeCard({ date, log, minutes, onMore }: { date: string; log: Log; minutes: number; onMore: () => void }) {
  const [last, setLast] = useState<{ date: string; mins: number } | null>(null);
  const future = date > todayKey();
  const added = last?.date === date ? last.mins : 0;

  if (future) {
    return <div className="rounded-lg bg-surface px-4 py-3 text-sm text-muted">You can log time once this day comes.</div>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">{date < todayKey() ? `Practiced on ${formatShortDate(date)}? Add the time to that day.` : "Practiced without the timer? Add it to the day."}</p>
        <span className="shrink-0 text-sm font-medium tabular-nums">{minutes > 0 ? formatMinutesShort(Math.round(minutes)) : "0 min"}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_LOG.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              log.addDayTime(date, m * 60000);
              setLast({ date, mins: added + m });
            }}
            className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium tabular-nums hover:bg-surface-hover lg:h-8 lg:px-2.5"
          >
            +{formatMinutesShort(m)}
          </button>
        ))}
        <button type="button" onClick={onMore} className="h-9 rounded-md px-2.5 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground lg:h-8">
          Other…
        </button>
      </div>
      {added > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-accent/10 px-3 py-1.5 text-sm">
          <span className="flex items-center gap-1.5">
            <CheckIcon className="h-4 w-4 text-accent" /> Added {formatMinutesShort(added)}
          </span>
          <button
            type="button"
            onClick={() => {
              log.addDayTime(date, -added * 60000);
              setLast(null);
            }}
            className="rounded-md px-2 py-1 text-xs font-medium hover:bg-accent/15"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

/** One part of the day: a small heading (a muted icon, the title, a count, an action on the right)
    over its card, so the panel reads as clear sections. */
function DaySection({
  icon,
  title,
  count,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number | string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center gap-2 px-0.5">
        <span className="flex shrink-0 text-muted">{icon}</span>
        <h3 className="text-sm font-medium">{title}</h3>
        {count !== undefined && <span className="text-xs tabular-nums text-muted">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}
