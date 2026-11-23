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
import { BackButton, PageShell } from "@/components/library/shared";
import PageBar, { type Crumb } from "@/components/PageBar";
import { AttachmentList } from "@/components/practicelog/Attachments";
import PageNotes, { type PageNotesHandle } from "@/components/practicelog/PageNotes";
import PageSections, { type PageSection } from "@/components/practicelog/PageSections";
import { FILL, PageTitle, QUIET_BUTTON, Quiet, ROWS, RecordingList } from "@/components/practicelog/pageParts";
import LogTimeDialog from "@/components/practicelog/LogTimeDialog";
import RecordClip from "@/components/practicelog/RecordClip";
import { RunningTimer } from "@/components/practicelog/RoutineCard";
import Subtasks from "@/components/practicelog/Subtasks";
import { useAttachedNotes } from "@/components/shednotes/AttachedNotes";
import { embedText } from "@/components/shednotes/fileEmbedSetup";
import { CheckIcon, PencilIcon, PlayIcon, StopwatchIcon, findToolLink } from "@/components/tools";
import {
  type Attachment,
  DAY_TASKS_ID,
  type DayTask,
  describeRepeat,
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
import { openNotePeek } from "@/lib/notePeek";
import { usePaneId } from "@/lib/paneContext";
import { goBackOr } from "@/lib/goBack";
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
 * Its notes open in the side view (from inside the side view, in it, with Back). As a page of its
 * own it has Back (to the page you came from); in a pane the pane's bar has Back and the trail.
 */
export default function TaskPage({ routineId, date, taskId }: { routineId?: string; date?: string; taskId: string }) {
  const router = useRouter();
  const inPane = usePaneId() !== null;
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

  /** The page around it: the page bar (its trail goes in a pane's bar) and Back, outside a pane. */
  const frame = (label: string, children: React.ReactNode) => (
    <PageShell>
      <PageBar crumbs={[...baseCrumbs, { label }]} icon={SHED_LOG_ICON} />
      {/* A readable column, not the whole width. */}
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        {!inPane && <BackButton onClick={() => goBackOr(router, "/shed-log")} />}
        {children}
      </div>
    </PageShell>
  );

  if (!log.ready || !mounted) return frame("Task", <LoadingSpinner />);
  if (!task || (routineId && !routine)) return frame("Task", <Quiet>That task isn&apos;t there anymore.</Quiet>);

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

  const planned = task.minutes;
  const loggedMin = spentMs / 60000;
  const dayLabel = day === today ? "today" : `on ${formatShortDate(day)}`;
  const dayAttachments = routineId ? (occ?.taskAttachments?.[taskId] ?? []) : (dayTask?.attachments ?? []);
  const setDayAttachments = (items: Attachment[]) =>
    routineId
      ? log.updateOccurrence(day, routineId, (o) => ({ ...o, taskAttachments: { ...(o.taskAttachments ?? {}), [taskId]: items } }))
      : dayTask && log.saveDayTask(day, { ...dayTask, attachments: items });
  const everyTime = routineId ? (task.attachments ?? []) : [];

  // The day: done or not, the time on it, the one way to start it (or the timer while it runs),
  // its checklist and what's attached. Everything for practicing it now, in one place.
  const dayPanel = (
    <section aria-label={day === today ? "Today" : formatLongDate(day)} className={`${FILL} flex flex-col gap-4 p-4`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`${title} done`}
          onClick={toggleDone}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${checked ? "border-transparent text-white" : "border-foreground/25 hover:border-muted"}`}
          style={checked ? { background: color } : undefined}
        >
          {checked && <CheckIcon className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{checked ? `Done ${dayLabel}` : `Not done ${dayLabel} yet`}</p>
          <p className="text-xs tabular-nums text-muted">
            {loggedMin > 0 ? `${formatMinutesShort(Math.max(1, Math.round(loggedMin)))} logged` : "No time logged"}
            {planned > 0 ? ` · ${formatMinutesShort(planned)} planned` : ""}
          </p>
        </div>
      </div>
      {planned > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (loggedMin / planned) * 100)}%`, background: color }} />
        </div>
      )}
      {engine && running ? (
        <RunningTimer engine={engine} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {!past && planned > 0 && (
            <button type="button" onClick={start} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
              <PlayIcon className="h-4 w-4" /> Start · {formatMinutesShort(planned)}
            </button>
          )}
          <button type="button" onClick={() => setLogging(true)} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.06] px-3.5 text-sm font-medium hover:bg-surface-hover">
            <StopwatchIcon className="h-4 w-4 text-muted" /> Log time
          </button>
        </div>
      )}
      {(task.subtasks?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-foreground/[0.06] pt-3">
          <span className="text-xs font-semibold text-muted">Checklist</span>
          <Subtasks items={task.subtasks ?? []} color={color} isDone={(id) => subDone.has(id)} onToggle={toggleSub} />
        </div>
      )}
      <div className="flex flex-col gap-1.5 border-t border-foreground/[0.06] pt-3">
        <span className="text-xs font-semibold text-muted">Attached</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {everyTime.length > 0 && <AttachmentList items={everyTime} />}
          <AttachmentList items={dayAttachments} onChange={setDayAttachments} addLabel={routineId ? `Attach for ${day === today ? "today" : formatShortDate(day)}` : "Attach"} />
        </div>
      </div>
    </section>
  );

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
          newBody={() => TASK_NOTE_START}
          onCreated={routine ? linkFromRoutine : undefined}
          onOpen={(id) => openNotePeek(id)}
          handleRef={notesRef}
        />
      ),
    },
    {
      id: "recordings",
      title: "Recordings",
      count: recordings?.length,
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
        <Quiet>Sign in to record clips. Recordings are saved to your account.</Quiet>
      ) : recordings === undefined ? (
        <div className={`${FILL} h-16`} aria-hidden />
      ) : (
        <RecordingList recordings={recordings} empty="No recordings yet. Record one here and it goes in the task's notes too." />
      ),
    },
    ...(routineId
      ? [
          {
            id: "history",
            title: "History",
            count: history.length,
            content:
              history.length === 0 ? (
                <Quiet>Not practiced yet.</Quiet>
              ) : (
                <ul className={ROWS}>
                  {history.slice(0, 30).map((h) => (
                    <li key={h.date}>
                      <Link href={`/shed-log?date=${h.date}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/[0.04]">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${h.done ? "text-white" : "border-[1.5px] border-foreground/25"}`}
                          style={h.done ? { background: color } : undefined}
                        >
                          {h.done && <CheckIcon className="h-2.5 w-2.5" />}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">{formatLongDate(h.date)}</span>
                        <span className="text-xs tabular-nums text-muted">{h.ms > 0 ? formatMinutesShort(Math.max(1, Math.round(h.ms / 60000))) : "Checked off"}</span>
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
      <PageTitle
        title={title}
        facts={[formatMinutesShort(task.minutes), routine ? describeRepeat(routine.repeat) : date ? formatLongDate(date) : null].filter(Boolean).join(" · ")}
        actions={
          routine &&
          !routine.assigned && (
            <Link href={`/shed-log/routine/edit?id=${encodeURIComponent(routine.id)}`} className={QUIET_BUTTON} title="Edit this routine and its tasks">
              <PencilIcon className="h-4 w-4" /> Edit
            </Link>
          )
        }
      />
      {task.notes && <p className="-mt-3 whitespace-pre-wrap text-sm">{task.notes}</p>}
      {dayPanel}
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
