"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useRef, useSyncExternalStore } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { type NoteTarget, targetKey } from "@jam-practice/core/shedNotes";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyCard, PageShell } from "@/components/library/shared";
import PageBar, { type Crumb } from "@/components/PageBar";
import { AttachmentList } from "@/components/practicelog/Attachments";
import PageNotes, { type PageNotesHandle } from "@/components/practicelog/PageNotes";
import PageSections, { type PageSection } from "@/components/practicelog/PageSections";
import RecordClip from "@/components/practicelog/RecordClip";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import { useAttachedNotes } from "@/components/shednotes/AttachedNotes";
import { embedText } from "@/components/shednotes/fileEmbedSetup";
import { CheckIcon, PencilIcon, PlayIcon, findToolLink } from "@/components/tools";
import {
  DAY_TASKS_ID,
  type DayTask,
  type RoutineTask,
  formatLongDate,
  formatMinutesShort,
  formatShortDate,
  occursOn,
  todayKey,
} from "@/lib/practiceLog";
import { recordingsApi } from "@/lib/recordings";
import { routineHref } from "@/lib/shedLogPages";
import { usePracticeLog, useRoutineTimer } from "@/lib/usePracticeLog";

const noopSubscribe = () => () => {};
const SHED_LOG_ICON = findToolLink("/shed-log")?.icon;

/**
 * `/shed-log/task?routine=…&task=…` (a task in a routine) or `?date=…&task=…` (a day's own task):
 * one task's page, a dashboard you arrange (`PageSections`) — its notes (a Shed Note, linked from
 * the routine's notes), recordings made for it (Record here saves the clip on the task and puts it
 * in the notes), what's attached, and the days it was practiced. Start runs it on the timer.
 */
export default function TaskPage({ routineId, date, taskId }: { routineId?: string; date?: string; taskId: string }) {
  const log = usePracticeLog();
  const { isAuthenticated } = useConvexAuth();
  const { startRoutine, startDayTasks, runningTask } = useRoutineTimer();
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

  const routineRecs = useQuery(recordingsApi.listForRoutine, isAuthenticated && routineId ? { routineId } : "skip");
  const dayRecs = useQuery(recordingsApi.listForLogRange, isAuthenticated && !routineId && date ? { from: date, to: date } : "skip");
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

  if (!log.ready || !mounted) {
    return (
      <PageShell>
        <PageBar crumbs={[...baseCrumbs, { label: "Task" }]} icon={SHED_LOG_ICON} />
        <LoadingSpinner />
      </PageShell>
    );
  }
  if (!task || (routineId && !routine)) {
    return (
      <PageShell>
        <PageBar crumbs={[...baseCrumbs, { label: "Task" }]} icon={SHED_LOG_ICON} />
        <EmptyCard>That task isn&apos;t there anymore.</EmptyCard>
      </PageShell>
    );
  }

  const title = task.title || "Untitled task";
  const recDate = routineId ? today : (date ?? today);
  const running = routineId ? runningTask(routineId, today) === taskId : date ? runningTask(DAY_TASKS_ID, date) === taskId : false;
  const minutesPracticed = history.reduce((s, h) => s + (h.ms > 0 ? h.ms / 60000 : h.done ? task.minutes : 0), 0);
  const daysDone = history.filter((h) => h.done).length;

  function start() {
    if (!task) return;
    if (routine) {
      const todayOcc = log.data.days[today]?.routines?.[routine.id];
      if (!occursOn(routine.repeat, today) && !(log.data.days[today]?.added ?? []).includes(routine.id)) log.addToDay(today, routine.id);
      startRoutine(routine, today, taskId, true, todayOcc);
    } else if (date) {
      startDayTasks(date, log.data.days[date]?.tasks ?? [], taskId);
    }
  }

  /** A task note made in a routine gets a link in the routine's notes, so they're all reachable there. */
  function linkFromRoutine(note: { title: string }) {
    const main = routineNotes.notes?.[0];
    if (main) void appendLine({ id: main.noteId as Id<"shedNotes">, line: `- [[${note.title}]]` });
  }

  const sections: PageSection[] = [
    {
      id: "notes",
      title: "Notes",
      content: (
        <PageNotes
          target={target}
          targetKey={key}
          label={routine ? `${routine.name || "Routine"} · ${title}` : `${title} (${date ? formatShortDate(date) : ""})`}
          newTitle={routine ? `${routine.name || "Routine"} · ${title}` : `${title} · ${date ? formatShortDate(date) : ""}`}
          onCreated={routine ? linkFromRoutine : undefined}
          handleRef={notesRef}
        />
      ),
    },
    {
      id: "recordings",
      title: "Recordings",
      action: isAuthenticated ? (
        <RecordClip
          date={recDate}
          routineId={routineId ?? null}
          routines={routine ? [{ id: routine.id, name: routine.name || "Routine" }] : []}
          task={{ id: taskId, name: title }}
          compact
          onSaved={(r) => void notesRef.current?.addLine(embedText(r.name, `recording/${r.id}`))}
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
      id: "attached",
      title: "Attached",
      content:
        task.attachments && task.attachments.length > 0 ? (
          <AttachmentList items={task.attachments} />
        ) : (
          <EmptyCard>Nothing attached. {routine && !routine.assigned ? "Edit the routine to attach tunes, charts or tools." : "Edit the task to attach tunes, charts or tools."}</EmptyCard>
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

  return (
    <PageShell>
      <PageBar crumbs={[...baseCrumbs, { label: title }]} icon={SHED_LOG_ICON} />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-foreground/10 pb-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted">
            {formatMinutesShort(task.minutes)}
            {routine ? (
              <>
                {" · in "}
                <Link href={routineHref(routine.id)} className="font-medium text-foreground hover:underline">
                  {routine.name || "Untitled routine"}
                </Link>
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
          {task.minutes > 0 && (
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
    </PageShell>
  );
}
