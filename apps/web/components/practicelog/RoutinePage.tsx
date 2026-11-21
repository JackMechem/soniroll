"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyCard, PageShell } from "@/components/library/shared";
import PageBar from "@/components/PageBar";
import { AttachmentList } from "@/components/practicelog/Attachments";
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
  scheduleTasks,
  tasksOf,
  todayKey,
  totalMinutes,
} from "@/lib/practiceLog";
import { type Recording, recordingsApi } from "@/lib/recordings";
import { usePracticeLog, useRoutineTimer } from "@/lib/usePracticeLog";

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

/** `/shed-log/routine?id=…` — one routine: when it happens, its tasks, what's attached, every
    day it was practiced, and every clip recorded for it. */
export default function RoutinePage({ id }: { id: string }) {
  const router = useRouter();
  const log = usePracticeLog();
  const { isAuthenticated } = useConvexAuth();
  const { startRoutine, runningTask } = useRoutineTimer();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const recordings = useQuery(recordingsApi.listForRoutine, isAuthenticated ? { routineId: id } : "skip");
  const routine = log.data.routines.find((r) => r.id === id);
  const [sharing, setSharing] = useState(false);

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

  if (!log.ready || !mounted) {
    return (
      <PageShell>
        <PageBar crumbs={[...ROUTINES_CRUMBS, { label: "Routine" }]} icon={SHED_LOG_ICON} />
        <LoadingSpinner />
      </PageShell>
    );
  }
  if (!routine) {
    return (
      <PageShell>
        <PageBar crumbs={[...ROUTINES_CRUMBS, { label: "Routine" }]} icon={SHED_LOG_ICON} />
        <EmptyCard>That routine doesn&apos;t exist anymore.</EmptyCard>
      </PageShell>
    );
  }

  const today = todayKey();
  const color = ROUTINE_COLORS[routine.color % ROUTINE_COLORS.length];
  const upcoming = nextOccurrences(routine.repeat, today, 6);
  const completed = history.filter(({ occ }) => {
    const p = progressOf(routine, occ);
    return p.total > 0 && p.done === p.total;
  }).length;
  const minutes = history.reduce((s, h) => s + minutesFor(routine, h.occ), 0);
  const start = parseTime(routine.startTime);
  const schedule = scheduleTasks(routine);
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

  return (
    <PageShell>
      <PageBar crumbs={[...ROUTINES_CRUMBS, { label: routine.name || "Untitled routine" }]} icon={SHED_LOG_ICON} />
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
            {!running && routine.tasks.some((t) => t.minutes > 0) && (
              <button type="button" onClick={startToday} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
                <PlayIcon className="h-4 w-4" /> {nextTask ? "Continue today" : "Start today"}
              </button>
            )}
          </div>
        </div>
      </div>
      {routine.description && <p className="whitespace-pre-wrap text-sm">{routine.description}</p>}

      <Section title="Tasks">
        {routine.tasks.length === 0 ? (
          <EmptyCard>No tasks yet — Edit to add some.</EmptyCard>
        ) : (
          <ol className={LIST}>
            {schedule.map(({ task, start }, i) => (
              <li key={task.id} className="flex gap-3 px-4 py-3">
                <span className="w-5 shrink-0 text-center text-sm font-medium tabular-nums text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{task.title || "Untitled task"}</div>
                  <div className="text-xs text-muted">
                    {start !== null ? `${formatTime(start)} · ` : ""}
                    {formatMinutesShort(task.minutes)}
                  </div>
                  {task.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{task.notes}</p>}
                  {task.attachments.length > 0 && (
                    <div className="mt-1.5">
                      <AttachmentList items={task.attachments} compact />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {routine.attachments.length > 0 && (
        <Section title="Attached">
          <AttachmentList items={routine.attachments} />
        </Section>
      )}

      <Section title="Coming up">
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
      </Section>

      <Section title="Recordings">
        {!isAuthenticated ? (
          <EmptyCard>Sign in to record clips — recordings are saved to your account.</EmptyCard>
        ) : recordings === undefined ? (
          <LoadingSpinner />
        ) : recordings.length === 0 ? (
          <EmptyCard>No recordings yet. Record a clip from the routine on any of its days.</EmptyCard>
        ) : (
          byDate.map(([date, list]) => (
            <div key={date || "none"} className="flex flex-col gap-2">
              <Link href={date ? `/shed-log?date=${date}` : "/shed-log"} className="self-start text-xs font-medium text-muted hover:text-foreground">
                {date ? formatLongDate(date) : "No day"}
              </Link>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((r) => (
                  <RecordingCard key={r._id} recording={r} />
                ))}
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="History">
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
      </Section>
      {sharing && <RoutineShareDialog routine={routine} onClose={() => setSharing(false)} />}
    </PageShell>
  );
}

const SECONDARY = "flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover";
const LIST = "flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}
