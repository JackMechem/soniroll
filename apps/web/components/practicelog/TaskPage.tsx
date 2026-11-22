"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { type NoteTarget, TASK_NOTE_START, targetKey } from "@jam-practice/core/shedNotes";
import LoadingSpinner from "@/components/LoadingSpinner";
import { BackButton, EmptyCard, PageShell } from "@/components/library/shared";
import PageBar, { type Crumb } from "@/components/PageBar";
import { AttachmentList } from "@/components/practicelog/Attachments";
import PageNotes, { type PageNotesHandle } from "@/components/practicelog/PageNotes";
import PageSections, { type PageSection } from "@/components/practicelog/PageSections";
import LogTimeDialog from "@/components/practicelog/LogTimeDialog";
import RecordClip from "@/components/practicelog/RecordClip";
import { RunningTimer } from "@/components/practicelog/RoutineCard";
import Subtasks from "@/components/practicelog/Subtasks";
import TaskCheck from "@/components/practicelog/TaskCheck";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import { useAttachedNotes } from "@/components/shednotes/AttachedNotes";
import { embedText } from "@/components/shednotes/fileEmbedSetup";
import { CheckIcon, PencilIcon, PlayIcon, StopwatchIcon, findToolLink } from "@/components/tools";
import {
  DAY_TASKS_ID,
  type DayTask,
  ROUTINE_COLORS,
  type RoutineTask,
  formatLongDate,
  formatMinutesShort,
  formatShortDate,
  occursOn,
  todayKey,
} from "@/lib/practiceLog";
import { useDeviceUrls } from "@/lib/deviceFiles";
import { recordingsApi } from "@/lib/recordings";
import { followSide, openNotePeek } from "@/lib/notePeek";
import { routineHref } from "@/lib/shedLogPages";
import { usePracticeLog, useRoutineTimer } from "@/lib/usePracticeLog";

const noopSubscribe = () => () => {};
const SHED_LOG_ICON = findToolLink("/shed-log")?.icon;

/**
 * `/shed-log/task?routine=…&task=…` (a task in a routine) or `?date=…&task=…` (a day's own task):
 * one task's page, a dashboard you arrange (`PageSections`) — its notes (a Shed Note, linked from
 * the routine's notes), recordings made for it (Record here saves the clip on the task and puts it
 * in the notes), what's attached, and the days it was practiced. Start runs it on the timer.
 *
 * `inPanel`: drawn in the side view (`NotePeek`) — no page bar, and its notes and routine open in
 * the view too. As a page of its own it has Back (to the page you came from).
 */
export default function TaskPage({ routineId, date, taskId, inPanel = false }: { routineId?: string; date?: string; taskId: string; inPanel?: boolean }) {
  const router = useRouter();
  const log = usePracticeLog();
  const { isAuthenticated } = useConvexAuth();
  const { engine, startRoutine, startDayTasks, runningTask } = useRoutineTimer();
  const [logging, setLogging] = useState(false);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const notesRef = useRef<PageNotesHandle | null>(null);
  const appendLine = useMutation(api.shedNotes.appendLine);
  const today = todayKey();

  const routine = routineId ? log.data.routines.find((r) => r.id === routineId) : undefined;
  // A routine's task, or one added to it for a day; else a day's own task.
  const task: RoutineTask | DayTask | undefined = useMemo(() => {
    if (routineId) {
      const own = routine?.tasks.find((t) => t.id === taskId);
      if (own) return own;
      for (const day of Object.values(log.data.days)) {
        const extra = day.routines?.[routineId]?.extraTasks?.find((t) => t.id === taskId);
        if (extra) return extra;
      }
      return undefined;
    }
    return date ? log.data.days[date]?.tasks?.find((t) => t.id === taskId) : undefined;
  }, [routineId, routine, taskId, date, log.data.days]);

  const target: NoteTarget = routineId ? { kind: "task", routineId, taskId } : { kind: "dayTask", date: date ?? "", taskId };
  const key = targetKey(target);
  const routineNotes = useAttachedNotes({ kind: "routineNotes", routineId: routineId ?? "" }, !!routineId);

  // `useDeviceUrls`: a recording kept on this device (no storage plan) plays from here too.
  const routineRecs = useDeviceUrls(useQuery(recordingsApi.listForRoutine, isAuthenticated && routineId ? { routineId } : "skip"));
  const dayRecs = useDeviceUrls(useQuery(recordingsApi.listForLogRange, isAuthenticated && !routineId && date ? { from: date, to: date } : "skip"));
  const recordings = (routineId ? routineRecs : dayRecs)?.filter((r) => r.taskId === taskId);

  // The days it was practiced: checked off or timed.
  const history = useMemo(() => {
    if (!routineId) return [];
    return Object.entries(log.data.days)
      .map(([d, day]) => {
        const occ = day.routines?.[routineId];
        if (!occ) return null;
        const done = occ.done?.includes(taskId) ?? false;
        const ms = occ.spentMs?.[taskId] ?? 0;
        return done || ms > 0 ? { date: d, done, ms } : null;
      })
      .filter((x): x is { date: string; done: boolean; ms: number } => x !== null)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [log.data.days, routineId, taskId]);

  const baseCrumbs: Crumb[] = routineId
    ? [
        { label: "Shed Log", href: "/shed-log" },
        { label: "Routines", href: "/shed-log/routines" },
        { label: routine?.name || "Routine", href: routineHref(routineId) },
      ]
    : [
        { label: "Shed Log", href: "/shed-log" },
        { label: date ? formatShortDate(date) : "Day", href: date ? `/shed-log?date=${date}` : "/shed-log" },
      ];

  /** The page around it: nothing extra in the side view; a page bar and Back as a page. */
  const frame = (label: string, children: React.ReactNode) =>
    inPanel ? (
      <>{children}</>
    ) : (
      <PageShell>
        <PageBar crumbs={[...baseCrumbs, { label }]} icon={SHED_LOG_ICON} />
        <BackButton onClick={() => (window.history.length > 1 ? router.back() : router.push("/shed-log"))} />
        {children}
      </PageShell>
    );

  if (!log.ready || !mounted) return frame("Task", <LoadingSpinner />);
  if (!task || (routineId && !routine)) return frame("Task", <EmptyCard>That task isn&apos;t there anymore.</EmptyCard>);

  const title = task.title || "Untitled task";
  // The day it's looked at for (the Shed Log's day it was opened from; else today).
  const day = date ?? today;
  const past = day < today;
  const running = runningTask(routineId ?? DAY_TASKS_ID, day) === taskId;
  const occ = routineId ? log.data.days[day]?.routines?.[routineId] : undefined;
  const dayTask = routineId ? undefined : (task as DayTask);
  const checked = routineId ? (occ?.done ?? []).includes(taskId) : !!dayTask?.done;
  const spentMs = (routineId ? occ?.spentMs?.[taskId] : dayTask?.spentMs) ?? 0;
  const color = routine ? ROUTINE_COLORS[routine.color % ROUTINE_COLORS.length] : "var(--accent)";
  const minutesPracticed = history.reduce((s, h) => s + (h.ms > 0 ? h.ms / 60000 : h.done ? task.minutes : 0), 0);
  const daysDone = history.filter((h) => h.done).length;

  function start() {
    if (!task) return;
    if (routine) {
      if (!occursOn(routine.repeat, day) && !(log.data.days[day]?.added ?? []).includes(routine.id)) log.addToDay(day, routine.id);
      startRoutine(routine, day, taskId, true, occ);
    } else if (date) {
      startDayTasks(date, log.data.days[date]?.tasks ?? [], taskId);
    }
  }

  const toggleDone = () => (routineId ? log.toggleTask(day, routineId, taskId) : log.toggleDayTask(day, taskId));
  const subDone = new Set(routineId ? (occ?.subDone ?? []) : (task.subtasks ?? []).filter((x) => x.done).map((x) => x.id));
  const toggleSub = (id: string) => {
    if (routineId) {
      log.updateOccurrence(day, routineId, (o) => {
        const list = o.subDone ?? [];
        return { ...o, subDone: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
      });
    } else if (dayTask) {
      log.saveDayTask(day, { ...dayTask, subtasks: (dayTask.subtasks ?? []).map((x) => (x.id === id ? { ...x, done: !x.done } : x)) });
    }
  };

  /** A task note made in a routine gets a link in the routine's notes, so they're all reachable there. */
  function linkFromRoutine(note: { title: string }) {
    const main = routineNotes.notes?.[0];
    if (main) void appendLine({ id: main.noteId as Id<"shedNotes">, line: `- [[${note.title}]]` });
  }

  const sections: PageSection[] = [
    {
      // The day itself, like the task on the Shed Log: ticked off, time on it, its checklist, the timer.
      id: "day",
      title: day === today ? "Today" : formatLongDate(day),
      content: (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
          {engine && running && <RunningTimer engine={engine} />}
          <TaskCheck
            checked={checked}
            label={title}
            color={color}
            onToggle={toggleDone}
            meta={[formatMinutesShort(task.minutes), spentMs > 0 && `${formatMinutesShort(spentMs / 60000)} logged`, checked ? "Done" : null]}
          />
          {(task.subtasks?.length ?? 0) > 0 && (
            <div className="pl-8">
              <Subtasks items={task.subtasks ?? []} color={color} isDone={(id) => subDone.has(id)} onToggle={toggleSub} />
            </div>
          )}
          <div className="flex flex-wrap gap-2 pl-8">
            {!past && !running && task.minutes > 0 && (
              <button type="button" onClick={start} className="flex h-8 items-center gap-1.5 rounded-md bg-accent/10 px-3 text-sm font-medium text-accent hover:bg-accent/15">
                <PlayIcon className="h-3.5 w-3.5" /> Time it
              </button>
            )}
            <button type="button" onClick={() => setLogging(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
              <StopwatchIcon className="h-3.5 w-3.5 text-muted" /> Log time
            </button>
          </div>
        </div>
      ),
    },
    {
      id: "notes",
      title: "Notes",
      content: (
        <PageNotes
          target={target}
          targetKey={key}
          label={routine ? `${routine.name || "Routine"} · ${title}` : `${title} (${date ? formatShortDate(date) : ""})`}
          newTitle={routine ? `${routine.name || "Routine"} · ${title}` : `${title} · ${date ? formatShortDate(date) : ""}`}
          newBody={() => TASK_NOTE_START}
          onCreated={routine ? linkFromRoutine : undefined}
          onOpen={(id) => (inPanel ? followSide({ kind: "note", id }) : openNotePeek(id))}
          handleRef={notesRef}
        />
      ),
    },
    {
      id: "recordings",
      title: "Recordings",
      action: isAuthenticated ? (
        <RecordClip
          date={day}
          routineId={routineId ?? null}
          routines={routine ? [{ id: routine.id, name: routine.name || "Routine" }] : []}
          task={{ id: taskId, name: title }}
          compact
          onSaved={(r) => void notesRef.current?.addRecording(embedText(r.name, `recording/${r.id}`))}
        />
      ) : undefined,
      content: !isAuthenticated ? (
        <EmptyCard>Sign in to record clips — recordings are saved to your account.</EmptyCard>
      ) : recordings === undefined ? (
        <LoadingSpinner />
      ) : recordings.length === 0 ? (
        <EmptyCard>No recordings of this task yet. Record one here: it&apos;s saved on the task and goes in its notes.</EmptyCard>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {recordings.map((r) => (
            <RecordingCard key={r._id} recording={r} />
          ))}
        </div>
      ),
    },
    {
      // A routine's task: what it always has (the routine editor's), and what's attached for just
      // this day, here. A day's own task: its attachments, here.
      id: "attached",
      title: "Attached",
      content: routineId ? (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Every time</span>
            {(task.attachments?.length ?? 0) > 0 ? (
              <AttachmentList items={task.attachments ?? []} />
            ) : (
              <p className="text-sm text-muted">Nothing yet. {routine && !routine.assigned ? "Edit the routine to attach tunes, charts or tools for every day." : ""}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Just for {day === today ? "today" : formatShortDate(day)}</span>
            <AttachmentList
              items={occ?.taskAttachments?.[taskId] ?? []}
              onChange={(items) => log.updateOccurrence(day, routineId, (o) => ({ ...o, taskAttachments: { ...(o.taskAttachments ?? {}), [taskId]: items } }))}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-surface p-4">
          <AttachmentList items={dayTask?.attachments ?? []} onChange={(attachments) => dayTask && log.saveDayTask(day, { ...dayTask, attachments })} />
        </div>
      ),
    },
    ...(routineId
      ? [
          {
            id: "history",
            title: "History",
            content:
              history.length === 0 ? (
                <EmptyCard>Not practiced yet.</EmptyCard>
              ) : (
                <ul className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
                  {history.map((h) => (
                    <li key={h.date}>
                      <Link href={`/shed-log?date=${h.date}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${h.done ? "bg-accent text-accent-foreground" : "border-[1.5px] border-foreground/25"}`}>
                          {h.done && <CheckIcon className="h-2.5 w-2.5" />}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">{formatLongDate(h.date)}</span>
                        <span className="text-xs tabular-nums text-muted">{h.ms > 0 ? formatMinutesShort(Math.max(1, Math.round(h.ms / 60000))) : h.done ? "Checked off" : ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]
      : []),
  ];

  return frame(
    title,
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-foreground/10 pb-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className={inPanel ? "text-xl font-extrabold" : "text-2xl font-extrabold sm:text-3xl"}>{title}</h1>
          <p className="text-sm text-muted">
            {formatMinutesShort(task.minutes)}
            {routine ? (
              <>
                {" · in "}
                {inPanel ? (
                  <button type="button" onClick={() => followSide({ kind: "routine", id: routine.id })} className="font-medium text-foreground hover:underline">
                    {routine.name || "Untitled routine"}
                  </button>
                ) : (
                  <Link href={routineHref(routine.id)} className="font-medium text-foreground hover:underline">
                    {routine.name || "Untitled routine"}
                  </Link>
                )}
              </>
            ) : date ? (
              ` · ${formatLongDate(date)}`
            ) : null}
          </p>
          {routineId && (
            <p className="text-xs tabular-nums text-muted">
              {daysDone} day{daysDone === 1 ? "" : "s"} checked off · {formatMinutesShort(Math.round(minutesPracticed))} practiced
            </p>
          )}
          {task.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{task.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {routine && !routine.assigned && (
            <Link href={`/shed-log/routine/edit?id=${encodeURIComponent(routine.id)}`} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
              <PencilIcon className="h-4 w-4 text-muted" /> Edit routine
            </Link>
          )}
          {task.minutes > 0 && !past && (
            <button
              type="button"
              onClick={start}
              disabled={running}
              className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
            >
              <PlayIcon className="h-4 w-4" /> {running ? "Timing now" : "Start"}
            </button>
          )}
        </div>
      </div>
      <PageSections pageKey={key} sections={sections} />
      {logging && (
        <LogTimeDialog
          date={day}
          log={log}
          initial={routineId ? { kind: "routine", routineId, taskId } : { kind: "task", taskId }}
          initialMinutes={task.minutes || undefined}
          onClose={() => setLogging(false)}
        />
      )}
    </>,
  );
}
