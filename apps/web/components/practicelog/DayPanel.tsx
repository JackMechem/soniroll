"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { AttachmentList } from "@/components/practicelog/Attachments";
import RecordClip from "@/components/practicelog/RecordClip";
import RoutineCard from "@/components/practicelog/RoutineCard";
import AttachedNotes, { LegacyNotes } from "@/components/shednotes/AttachedNotes";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import { SHARE_PROGRESS_EVENT, burstAt } from "@/components/practicelog/Celebrations";
import TaskDialog from "@/components/practicelog/TaskDialog";
import Subtasks from "@/components/practicelog/Subtasks";
import LogTimeDialog from "@/components/practicelog/LogTimeDialog";
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
  formatLongDate,
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
  const isToday = date === todayKey();
  const dayRoutines = items.map((i) => ({ id: i.routine.id, name: i.routine.name || "Untitled routine" }));
  const dayRecordings = recordings?.filter((r) => r.logDate === date) ?? [];
  const loose = dayRecordings.filter((r) => !r.routineId || !items.some((i) => i.routine.id === r.routineId));
  const [addMenu, setAddMenu] = useState<MenuState | null>(null);
  const [logging, setLogging] = useState(false);

  function openAddMenu(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const onDay = new Set(items.map((i) => i.routine.id));
    const others = data.routines.filter((r) => !onDay.has(r.id));
    setAddMenu({
      x: Math.min(rect.left, window.innerWidth - 216),
      y: rect.bottom + 4,
      items: [
        { label: "New routine starting this day", icon: <PlusIcon className="h-4 w-4 text-muted" />, onSelect: () => router.push(`/shed-log/routine/edit?date=${date}`) },
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
      <div className={wide && progress.total > 0 ? "grid gap-3 lg:grid-cols-2 lg:items-stretch" : "contents"}>
      {progress.total > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${(progress.done / progress.total) * 100}%`,
                background: progress.done === progress.total ? "linear-gradient(90deg, #4ade80, #22c55e)" : "var(--accent)",
              }}
            />
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums">
            {progress.done === progress.total ? "All done!" : `${progress.done} of ${progress.total} done`}
          </span>
        </div>
      )}

      <DayTimer data={data} date={date} onClear={() => log.updateDay(date, clearDayTime)} />
      </div>
    </DaySection>
  );

  return (
    <section className={`flex flex-col gap-6 ${wide ? "mx-auto w-full max-w-6xl" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onDateChange(addDays(date, -1))} aria-label="Previous day" className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground">
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className={`min-w-0 ${wide ? "" : "flex-1 text-center"}`}>
          <h2 className={`truncate font-extrabold ${wide ? "text-2xl" : "text-xl"}`}>{formatLongDate(date)}</h2>
          <p className="text-xs text-muted">
            {isToday ? "Today · " : ""}
            {minutes > 0 ? `${formatMinutesShort(Math.round(minutes))} practiced` : "Nothing logged yet"}
            {date <= todayKey() && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent(SHARE_PROGRESS_EVENT, { detail: { kind: "day", date } }))}
                  className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                >
                  <ShareIcon className="h-3 w-3" /> Day report
                </button>
              </>
            )}
          </p>
        </div>
        <button type="button" onClick={() => onDateChange(addDays(date, 1))} aria-label="Next day" className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground">
          <ChevronRightIcon className="h-5 w-5" />
        </button>
        {controls && <div className="ml-auto">{controls}</div>}
      </div>

      {progressSection}

      <div className={wide ? "grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8" : "contents"}>
      <div className={wide ? "flex min-w-0 flex-col gap-6" : "contents"}>

      <DaySection
        icon={<RepeatIcon className="h-4 w-4" />}
        title="Routines"
        count={items.length || undefined}
        action={
          <button type="button" onClick={openAddMenu} className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold hover:bg-surface-hover">
            <PlusIcon className="h-3.5 w-3.5" /> Add routine
          </button>
        }
      >
        {items.length === 0 ? (
          <button
            type="button"
            onClick={openAddMenu}
            className="rounded-2xl border border-dashed border-surface-hover p-4 text-left text-sm text-muted hover:border-accent hover:text-foreground"
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
        <div className="flex flex-col gap-1 rounded-2xl bg-surface p-4">
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

      <DaySection icon={<StopwatchIcon className="h-4 w-4" />} title="Log time">
        <LogTimeCard date={date} log={log} minutes={minutes} onMore={() => setLogging(true)} />
      </DaySection>

      <DaySection icon={<PencilIcon className="h-4 w-4" />} title="Notes">
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
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
      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
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
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<{ task: DayTask; isNew: boolean } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
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
        !running && (
          <button type="button" onClick={() => startDayTasks(date, tasks)} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground hover:bg-accent-hover">
            <PlayIcon className="h-3.5 w-3.5" /> Start all
          </button>
        )
      }
    >
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
      {sorted.length === 0 && <p className="text-sm text-muted">One-off things to practice on just this day, outside your routines.</p>}
      {sorted.length > 0 && (
        <ul className="flex flex-col">
          {sorted.map((t) => {
            const isNow = running === t.id;
            const time = parseTime(t.time);
            return (
              <li key={t.id} className={`group flex items-start gap-3 rounded-xl px-1 py-2.5 lg:py-2 ${isNow ? "bg-accent/10" : ""}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={`${t.title} done`}
                  onClick={(e) => {
                    if (!t.done) burstAt(e.currentTarget, "var(--accent)");
                    log.toggleDayTask(date, t.id);
                  }}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors lg:h-5 lg:w-5 ${t.done ? "log-check border-transparent bg-accent text-accent-foreground" : "border-surface-hover hover:border-muted"}`}
                >
                  {t.done && <CheckIcon className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setEditing({ task: t, isNew: false })} className="w-full text-left">
                  <div className={`font-medium ${t.done ? "text-muted line-through" : ""}`}>{t.title}</div>
                  <div className="flex flex-wrap gap-x-2 text-xs text-muted">
                    {time !== null && <span className="font-semibold">{formatTime(time)}</span>}
                    <span>{formatMinutesShort(t.minutes)}</span>
                    {t.spentMs ? <span>· {formatMinutesShort(t.spentMs / 60000)} logged</span> : null}
                  </div>
                  {t.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{t.notes}</p>}
                </button>
                {t.done && !t.spentMs && t.minutes > 0 && (
                  <button
                    type="button"
                    onClick={() => log.saveDayTask(date, { ...t, spentMs: t.minutes * 60000 })}
                    className="mt-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent hover:bg-accent/25"
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
                {isNow && engine ? (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">{engine.paused ? "Paused" : "Timing"}</span>
                ) : (
                  t.minutes > 0 &&
                  !t.done && (
                    <button
                      type="button"
                      onClick={() => startDayTasks(date, tasks, t.id)}
                      aria-label={`Time ${t.title}`}
                      title="Start the timer"
                      className="shrink-0 rounded-full bg-background p-2 text-muted hover:text-foreground lg:bg-transparent lg:p-1.5 lg:opacity-0 lg:hover:bg-background lg:group-hover:opacity-100"
                    >
                      <PlayIcon className="h-3.5 w-3.5" />
                    </button>
                  )
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
                        { label: "Delete", danger: true, onSelect: () => log.removeDayTask(date, t.id) },
                      ],
                    });
                  }}
                  className="shrink-0 rounded-full p-2 text-muted hover:bg-background hover:text-foreground lg:p-1.5"
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
        className="flex items-center gap-2 rounded-xl bg-background py-1.5 pl-3 pr-1.5"
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
          className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-surface hover:text-foreground"
        >
          Details
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
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
          onDelete={editing.isNew ? undefined : () => log.removeDayTask(date, editing.task.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
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
    return <div className="rounded-2xl bg-surface p-4 text-sm text-muted">You can log time once this day comes.</div>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">Practiced without the timer? Add it to the day&apos;s total.</p>
        <span className="shrink-0 text-sm font-bold tabular-nums">{minutes > 0 ? formatMinutesShort(Math.round(minutes)) : "0 min"}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {QUICK_LOG.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              log.addDayTime(date, m * 60000);
              setLast({ date, mins: added + m });
            }}
            className="rounded-xl bg-background px-2 py-2.5 text-sm font-semibold tabular-nums hover:bg-surface-hover active:scale-95 lg:py-2"
          >
            + {formatMinutesShort(m)}
          </button>
        ))}
        <button
          type="button"
          onClick={onMore}
          className="col-span-3 rounded-xl border border-dashed border-surface-hover px-2 py-2.5 text-sm font-semibold text-muted hover:border-accent hover:text-foreground sm:col-span-2 lg:py-2"
        >
          Other amount or a task…
        </button>
      </div>
      {added > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-accent/10 px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5">
            <CheckIcon className="h-4 w-4 text-accent" /> Added {formatMinutesShort(added)}
          </span>
          <button
            type="button"
            onClick={() => {
              log.addDayTime(date, -added * 60000);
              setLast(null);
            }}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/15"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

/** One part of the day: a small heading (icon, title, a count, an action on the right) over its
    cards, so the panel reads as clear sections. */
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
    <div className="flex flex-col gap-2.5">
      <div className="flex min-h-7 items-center gap-2 px-1">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">{icon}</span>
        <h3 className="text-base font-bold">{title}</h3>
        {count !== undefined && <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}
