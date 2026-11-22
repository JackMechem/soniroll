"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { targetKey } from "@jam-practice/core/shedNotes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { BackButton, EmptyCard, PageShell } from "@/components/library/shared";
import PageBar from "@/components/PageBar";
import { AttachmentList } from "@/components/practicelog/Attachments";
import PageNotes from "@/components/practicelog/PageNotes";
import RoutineCard from "@/components/practicelog/RoutineCard";
import PageSections, { type PageSection } from "@/components/practicelog/PageSections";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import { RoutineShareDialog } from "@/components/practicelog/Sharing";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import { CheckIcon, PencilIcon, PlayIcon, ShareIcon, findToolLink } from "@/components/tools";
import {
  type Occurrence,
  type Routine,
  ROUTINE_COLORS,
  describeRepeat,
  formatLongDate,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  nextOccurrences,
  occursOn,
  parseTime,
  progressOf,
  routinesOn,
  tasksOf,
  todayKey,
  totalMinutes,
} from "@/lib/practiceLog";
import { useDeviceUrls } from "@/lib/deviceFiles";
import { type Recording, recordingsApi } from "@/lib/recordings";
import { usePracticeLog, useRoutineTimer } from "@/lib/usePracticeLog";
import { followSide, openNotePeek, openSide } from "@/lib/notePeek";

const noopSubscribe = () => () => {};

/** The pages above a routine in the header bar's trail. */
const SHED_LOG_ICON = findToolLink("/shed-log")?.icon;
const ROUTINES_CRUMBS = [
  { label: "Shed Log", href: "/shed-log" },
  { label: "Routines", href: "/shed-log/routines" },
];

/** Minutes logged for a routine on a day: timer time, or a checked task's planned minutes. */
function minutesFor(routine: Routine, occ: Occurrence): number {
  let ms = 0;
  const spent = occ.spentMs ?? {};
  for (const v of Object.values(spent)) ms += v;
  for (const id of occ.done ?? []) {
    if (spent[id] !== undefined) continue;
    const t = routine.tasks.find((x) => x.id === id);
    if (t) ms += t.minutes * 60000;
  }
  return ms / 60000;
}

/** `/shed-log/routine?id=…` — one routine's page, a dashboard you arrange (`PageSections`): its
    notes (a Shed Note linking each task's notes), its tasks (each with its own page), what's
    attached, when it's coming up, every clip recorded for it and every day it was practiced. */
/** `inPanel`: drawn in the side view (`NotePeek`) — no page bar; its tasks and notes open in the
    view too. As a page of its own it has Back (to the page you came from), and its tasks open in
    the side view. */
export default function RoutinePage({ id, date, inPanel = false }: { id: string; date?: string; inPanel?: boolean }) {
  const router = useRouter();
  const log = usePracticeLog();
  const { isAuthenticated } = useConvexAuth();
  const { startRoutine, runningTask } = useRoutineTimer();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const recordings = useDeviceUrls(useQuery(recordingsApi.listForRoutine, isAuthenticated ? { routineId: id } : "skip"));
  const routine = log.data.routines.find((r) => r.id === id);
  const [sharing, setSharing] = useState(false);
  // The routine's notes and its tasks' notes (`routine:<id>` and `routine:<id>/task:<task>`).
  const routineKey = targetKey({ kind: "routineNotes", routineId: id });
  const notesUnder = useQuery(api.shedNotes.attachedTo, isAuthenticated && id ? { prefix: routineKey } : "skip");

  const history = useMemo(() => {
    if (!routine) return [];
    return Object.entries(log.data.days)
      .filter(([, day]) => day.routines?.[id])
      .map(([date, day]) => ({ date, occ: day.routines![id] }))
      .filter(({ occ }) => (occ.done?.length ?? 0) > 0 || Object.keys(occ.spentMs ?? {}).length > 0 || occ.notes || occ.skipped)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [log.data.days, id, routine]);

  const byDate = useMemo(() => {
    const m = new Map<string, Recording[]>();
    for (const r of recordings ?? []) {
      const key = r.logDate ?? "";
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [recordings]);

  /** The page around it: nothing extra in the side view; a page bar and Back as a page. */
  const frame = (label: string, children: React.ReactNode) =>
    inPanel ? (
      <>{children}</>
    ) : (
      <PageShell>
        <PageBar crumbs={[...ROUTINES_CRUMBS, { label }]} icon={SHED_LOG_ICON} />
        <BackButton onClick={() => (window.history.length > 1 ? router.back() : router.push("/shed-log/routines"))} />
        {children}
      </PageShell>
    );
  // From the side view, things open in it (with Back); from the page, in a fresh side view.
  const show = inPanel ? followSide : openSide;

  if (!log.ready || !mounted) return frame("Routine", <LoadingSpinner />);
  if (!routine) return frame("Routine", <EmptyCard>That routine doesn&apos;t exist anymore.</EmptyCard>);

  const today = todayKey();
  const color = ROUTINE_COLORS[routine.color % ROUTINE_COLORS.length];
  const upcoming = nextOccurrences(routine.repeat, today, 6);
  const completed = history.filter(({ occ }) => {
    const p = progressOf(routine, occ);
    return p.total > 0 && p.done === p.total;
  }).length;
  const minutes = history.reduce((s, h) => s + minutesFor(routine, h.occ), 0);
  const start = parseTime(routine.startTime);
  const running = runningTask(routine.id, today);
  // Part done today: carry on from the first open task, like the routine's card on the Shed Log.
  const todayOcc = log.data.days[today]?.routines?.[routine.id];
  const todayDone = new Set(todayOcc?.done ?? []);
  const nextTask = todayOcc && todayDone.size > 0 ? tasksOf(routine, todayOcc).find((t) => !todayDone.has(t.id) && t.minutes > 0) : undefined;

  function startToday() {
    if (!routine) return;
    if (!occursOn(routine.repeat, today) && !(log.data.days[today]?.added ?? []).includes(routine.id)) log.addToDay(today, routine.id);
    startRoutine(routine, today, nextTask?.id, false, todayOcc);
    router.push(`/shed-log?date=${today}`);
  }

  const recCount = recordings?.length ?? 0;
  // Which tasks have notes, and a new routine note's start: a link to each task's notes.
  const taskNotes = (notesUnder ?? []).filter((n) => n.target.startsWith(`${routineKey}/task:`));
  const routineNoteBody = () => {
    const ordered = routine.tasks.flatMap((t) => taskNotes.filter((n) => n.target === `${routineKey}/task:${t.id}`));
    return ordered.length ? `## Tasks\n${ordered.map((n) => `- [[${n.title}]]`).join("\n")}\n\n` : "";
  };

  // The day it's looked at for (the Shed Log's day it was opened from; else today): its card, the
  // same as on the Shed Log — progress, Start, the timer, the tasks to tick, time, clips, notes.
  const day = date ?? today;
  const onDay = routinesOn(log.data, day);
  const dayItem = onDay.find((r) => r.routine.id === routine.id);
  const otherDays = byDate.filter(([d]) => d !== day);
  const sections: PageSection[] = [
    {
      id: "day",
      title: day === today ? "Today" : formatLongDate(day),
      content: dayItem ? (
        <RoutineCard
          date={day}
          item={dayItem}
          log={log}
          recordings={recordings?.filter((r) => r.logDate === day)}
          dayRoutines={onDay.map((r) => ({ id: r.routine.id, name: r.routine.name || "Routine" }))}
          onOpenTask={(taskId) => show({ kind: "task", routineId: routine.id, taskId, date: day })}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-4">
          <p className="text-sm text-muted">Not on {day === today ? "today" : formatShortDate(day)}.</p>
          <button type="button" onClick={() => log.addToDay(day, routine.id)} className="flex h-8 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
            Add it to {day === today ? "today" : formatShortDate(day)}
          </button>
        </div>
      ),
    },
    {
      id: "notes",
      title: "Notes",
      content: isAuthenticated ? (
        <PageNotes
          target={{ kind: "routineNotes", routineId: routine.id }}
          targetKey={routineKey}
          label={routine.name || "Routine"}
          newTitle={routine.name || "Routine"}
          newBody={routineNoteBody}
          onOpen={(noteId) => (inPanel ? followSide({ kind: "note", id: noteId }) : openNotePeek(noteId))}
        />
      ) : (
        <EmptyCard>Sign in to keep notes.</EmptyCard>
      ),
    },
    ...(routine.attachments.length > 0
      ? [{ id: "attached", title: "Attached", content: <AttachmentList items={routine.attachments} /> }]
      : []),
    {
      id: "upcoming",
      title: "Coming up",
      content: (
        <>
        {upcoming.length === 0 ? (
          <EmptyCard>Nothing coming up{routine.repeat.end ? ` — it ended ${formatShortDate(routine.repeat.end)}` : ""}.</EmptyCard>
        ) : (
          <div className="flex flex-wrap gap-2">
            {upcoming.map((date) => (
              <Link key={date} href={`/shed-log?date=${date}`} className="flex h-8 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
                {date === today ? "Today" : formatShortDate(date)}
              </Link>
            ))}
          </div>
        )}
        </>
      ),
    },
    // That day's clips are on its card above; here, the other days'.
    ...(isAuthenticated && otherDays.length > 0
      ? [
          {
            id: "recordings",
            title: "Recordings on other days",
            content: (
              <>
                {otherDays.map(([d, list]) => (
                  <div key={d || "none"} className="flex flex-col gap-2">
                    <Link href={d ? `/shed-log?date=${d}` : "/shed-log"} className="self-start text-xs font-medium text-muted hover:text-foreground">
                      {d ? formatLongDate(d) : "No day"}
                    </Link>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((r) => (
                        <RecordingCard key={r._id} recording={r} />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ),
          },
        ]
      : []),
    {
      id: "history",
      title: "History",
      content: (
        <>
        {history.length === 0 ? (
          <EmptyCard>Nothing logged yet.</EmptyCard>
        ) : (
          <ul className={LIST}>
            {history.map(({ date, occ }) => {
              const p = progressOf(routine, occ);
              const complete = p.total > 0 && p.done === p.total;
              const m = minutesFor(routine, occ);
              return (
                <li key={date}>
                  <Link href={`/shed-log?date=${date}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-hover">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${complete ? "text-white" : "border-[1.5px] border-foreground/25"}`}
                      style={complete ? { background: color } : undefined}
                    >
                      {complete && <CheckIcon className="h-2.5 w-2.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{formatLongDate(date)}</div>
                      <div className="text-xs text-muted">
                        {occ.skipped ? "Skipped" : `${p.done}/${p.total} tasks${m > 0 ? ` · ${formatMinutesShort(Math.round(m))}` : ""}`}
                      </div>
                      {occ.notes && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{occ.notes}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        </>
      ),
    },
  ];

  return frame(
    routine.name || "Untitled routine",
    <>
      {inPanel && <h1 className="-mb-3 text-xl font-extrabold">{routine.name || "Untitled routine"}</h1>}
      <div className="flex flex-col gap-3 border-b border-foreground/10 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <RoutineIcon icon={routine.icon} color={routine.color} size="md" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm text-muted">
                {describeRepeat(routine.repeat)}
                {start !== null ? ` · ${formatTime(start)}` : ""} · {formatMinutesShort(totalMinutes(routine))}
              </p>
              {/* What's been done with it, as one quiet line. */}
              <p className="text-xs tabular-nums text-muted">
                {completed} day{completed === 1 ? "" : "s"} completed · {formatMinutesShort(Math.round(minutes))} practiced
                {isAuthenticated && recordings !== undefined ? ` · ${recCount} recording${recCount === 1 ? "" : "s"}` : ""}
              </p>
              {routine.assigned && <p className="text-xs text-muted">From {routine.assigned.teacher} · they see how it goes</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSharing(true)} className={SECONDARY}>
              <ShareIcon className="h-4 w-4 text-muted" /> Share
            </button>
            {/* A teacher's routine is theirs to change (edits here would be overwritten by theirs). */}
            {!routine.assigned && (
              <Link href={`/shed-log/routine/edit?id=${encodeURIComponent(routine.id)}`} className={SECONDARY}>
                <PencilIcon className="h-4 w-4 text-muted" /> Edit
              </Link>
            )}
            {/* Not while the day's card is on the page: its Start is right there. */}
            {!running && !dayItem && routine.tasks.some((t) => t.minutes > 0) && (
              <button type="button" onClick={startToday} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
                <PlayIcon className="h-4 w-4" /> {nextTask ? "Continue today" : "Start today"}
              </button>
            )}
          </div>
        </div>
      </div>
      {routine.description && <p className="whitespace-pre-wrap text-sm">{routine.description}</p>}

      <PageSections pageKey={routineKey} sections={sections} />
      {sharing && <RoutineShareDialog routine={routine} onClose={() => setSharing(false)} />}
    </>,
  );
}

const SECONDARY = "flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover";
const LIST = "flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface";
