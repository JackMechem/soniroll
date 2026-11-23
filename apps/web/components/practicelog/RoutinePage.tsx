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
import PageNotes from "@/components/practicelog/PageNotes";
import RoutineCard from "@/components/practicelog/RoutineCard";
import { AttachmentPicker } from "@/components/practicelog/Attachments";
import { type FileGroup, LinkedFiles, splitFiles, useLinkedCount } from "@/components/practicelog/FileAttachments";
import PageSections, { type PageSection } from "@/components/practicelog/PageSections";
import { FILL, PageTitle, QUIET_BUTTON, Quiet, ROWS, RecordingList } from "@/components/practicelog/pageParts";
import { RoutineShareDialog } from "@/components/practicelog/Sharing";
import { CheckIcon, PencilIcon, PlusIcon, ShareIcon, findToolLink } from "@/components/tools";
import {
  type FileAttachment,
  type Occurrence,
  type Routine,
  ROUTINE_COLORS,
  describeRepeat,
  formatLongDate,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  nextOccurrences,
  parseTime,
  progressOf,
  routinesOn,
  todayKey,
  totalMinutes,
} from "@/lib/practiceLog";
import { useDeviceUrls } from "@/lib/deviceFiles";
import { type Recording, recordingsApi } from "@/lib/recordings";
import { usePracticeLog } from "@/lib/usePracticeLog";
import { openNotePeek, openSide } from "@/lib/notePeek";
import { usePaneId } from "@/lib/paneContext";
import { goBackOr } from "@/lib/goBack";
import { taskHref } from "@/lib/shedLogPages";

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
/** Its tasks and notes open in the side view (from inside the side view, in it, with Back). As a
    page of its own it has Back (to the page you came from); in a pane (the side view, split
    screen) the pane's bar has Back and the trail instead. */
export default function RoutinePage({ id, date }: { id: string; date?: string }) {
  const router = useRouter();
  const inPane = usePaneId() !== null;
  const log = usePracticeLog();
  const { isAuthenticated } = useConvexAuth();

  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const recordings = useDeviceUrls(useQuery(recordingsApi.listForRoutine, isAuthenticated ? { routineId: id } : "skip"));
  const routine = log.data.routines.find((r) => r.id === id);
  const [sharing, setSharing] = useState(false);
  const [addingFiles, setAddingFiles] = useState(false);
  // Its Files: the routine's own, then each task's (added on the task's page or in the editor).
  const ownFiles = splitFiles(routine?.attachments);
  const fileGroups: FileGroup[] = routine
    ? [
        { key: "own", attachments: ownFiles.files, onChange: routine.assigned ? undefined : (files) => log.saveRoutine({ ...routine, attachments: [...ownFiles.other, ...files] }) },
        ...routine.tasks.map((t) => ({
          key: `task:${t.id}`,
          title: t.title || "Untitled task",
          href: taskHref({ routineId: routine.id, taskId: t.id, date }),
          attachments: splitFiles(t.attachments).files,
        })),
      ]
    : [];
  const fileCount = useLinkedCount(fileGroups);
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

  /** The page around it: the page bar (its trail goes in a pane's bar) and Back, outside a pane. */
  const frame = (label: string, children: React.ReactNode) => (
    <PageShell>
      <PageBar crumbs={[...ROUTINES_CRUMBS, { label }]} icon={SHED_LOG_ICON} />
      {/* A readable column, not the whole width. */}
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        {!inPane && <BackButton onClick={() => goBackOr(router, "/shed-log/routines")} />}
        {children}
      </div>
    </PageShell>
  );
  const show = openSide;

  if (!log.ready || !mounted) return frame("Routine", <LoadingSpinner />);
  if (!routine) return frame("Routine", <EmptyCard>That routine doesn&apos;t exist anymore.</EmptyCard>);

  const today = todayKey();
  const color = ROUTINE_COLORS[routine.color % ROUTINE_COLORS.length];
  const upcoming = nextOccurrences(routine.repeat, today, 6);
  const start = parseTime(routine.startTime);

  // Which tasks have notes, and a new routine note's start: a link to each task's notes.
  const taskNotes = (notesUnder ?? []).filter((n) => n.target.startsWith(`${routineKey}/task:`));
  const routineNoteBody = () => {
    const ordered = routine.tasks.flatMap((t) => taskNotes.filter((n) => n.target === `${routineKey}/task:${t.id}`));
    return ordered.length ? `## Tasks\n${ordered.map((n) => `- [[${n.title}]]`).join("\n")}\n\n` : "";
  };

  // The day it's looked at for (the Shed Log's day it was opened from; else today): its card, the
  // same as on the Shed Log — progress, Start, the timer, the tasks to tick, time, clips, notes.
  const day = date ?? today;
  const dayName = day === today ? "today" : formatShortDate(day);
  const onDay = routinesOn(log.data, day);
  const dayItem = onDay.find((r) => r.routine.id === routine.id);
  const otherDays = byDate.filter(([d]) => d !== day);

  const dayCard = dayItem ? (
    <RoutineCard
      date={day}
      item={dayItem}
      log={log}
      embedded
      recordings={recordings?.filter((r) => r.logDate === day)}
      dayRoutines={onDay.map((r) => ({ id: r.routine.id, name: r.routine.name || "Routine" }))}
      onOpenTask={(taskId) => show({ kind: "task", routineId: routine.id, taskId, date: day })}
    />
  ) : (
    <div className={`${FILL} flex flex-wrap items-center justify-between gap-3 px-4 py-3.5`}>
      <p className="text-sm text-muted">It isn&apos;t on {dayName}.</p>
      <button type="button" onClick={() => log.addToDay(day, routine.id)} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
        Add it to {dayName}
      </button>
    </div>
  );

  const sections: PageSection[] = [
    {
      id: "files",
      title: "Files",
      count: fileCount || undefined,
      action:
        isAuthenticated && !routine.assigned ? (
          <button type="button" onClick={() => setAddingFiles(true)} className={QUIET_BUTTON}>
            <PlusIcon className="h-4 w-4" /> Add
          </button>
        ) : undefined,
      content: (
        <LinkedFiles
          groups={fileGroups}
          empty="No files yet. Add PDFs, recordings or any file from your Files, or link a folder or a tag: what's in it shows here, even files added later. Files on its tasks show here too."
        />
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
          onOpen={(noteId) => openNotePeek(noteId)}
        />
      ) : (
        <Quiet>Sign in to keep notes.</Quiet>
      ),
    },
    {
      id: "upcoming",
      title: "Coming up",
      content:
        upcoming.length === 0 ? (
          <Quiet>Nothing coming up{routine.repeat.end ? `. It ended ${formatShortDate(routine.repeat.end)}` : ""}.</Quiet>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {upcoming.map((d) => (
              <Link key={d} href={`/shed-log?date=${d}`} className="flex h-8 items-center rounded-lg bg-foreground/[0.04] px-3 text-sm font-medium tabular-nums transition-colors hover:bg-foreground/[0.08]">
                {d === today ? "Today" : formatShortDate(d)}
              </Link>
            ))}
          </div>
        ),
    },
    // That day's clips are on its card; here, the other days', newest day first.
    ...(isAuthenticated && otherDays.length > 0
      ? [
          {
            id: "recordings",
            title: "Recordings on other days",
            count: otherDays.reduce((n, [, list]) => n + list.length, 0),
            content: (
              <div className="flex flex-col gap-4">
                {otherDays.map(([d, list]) => (
                  <div key={d || "none"} className="flex flex-col gap-2">
                    <Link href={d ? `/shed-log?date=${d}` : "/shed-log"} className="self-start text-xs font-semibold text-muted hover:text-foreground">
                      {d ? formatLongDate(d) : "No day"}
                    </Link>
                    <RecordingList recordings={list} empty="" />
                  </div>
                ))}
              </div>
            ),
          },
        ]
      : []),
    {
      id: "history",
      title: "History",
      count: history.length,
      content:
        history.length === 0 ? (
          <Quiet>Nothing logged yet.</Quiet>
        ) : (
          <ul className={ROWS}>
            {history.slice(0, 30).map(({ date: d, occ }) => {
              const p = progressOf(routine, occ);
              const complete = p.total > 0 && p.done === p.total;
              const m = minutesFor(routine, occ);
              return (
                <li key={d}>
                  <Link href={`/shed-log?date=${d}`} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/[0.04]">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${complete ? "text-white" : "border-[1.5px] border-foreground/25"}`}
                      style={complete ? { background: color } : undefined}
                    >
                      {complete && <CheckIcon className="h-2.5 w-2.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">{formatLongDate(d)}</div>
                      {occ.notes && <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted">{occ.notes}</p>}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {occ.skipped ? "Skipped" : `${p.done}/${p.total}${m > 0 ? ` · ${formatMinutesShort(Math.round(m))}` : ""}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ),
    },
  ];

  return frame(
    routine.name || "Untitled routine",
    <>
      <PageTitle
        title={routine.name || "Untitled routine"}
        facts={[describeRepeat(routine.repeat), start !== null ? formatTime(start) : null, formatMinutesShort(totalMinutes(routine)), `${routine.tasks.length} task${routine.tasks.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
        actions={
          <>
            <button type="button" onClick={() => setSharing(true)} className={QUIET_BUTTON}>
              <ShareIcon className="h-4 w-4" /> Share
            </button>
            {/* A teacher's routine is theirs to change (edits here would be overwritten by theirs). */}
            {!routine.assigned && (
              <Link href={`/shed-log/routine/edit?id=${encodeURIComponent(routine.id)}`} className={QUIET_BUTTON}>
                <PencilIcon className="h-4 w-4" /> Edit
              </Link>
            )}
          </>
        }
      />
      {routine.assigned && <p className="-mt-3 text-xs text-muted">From {routine.assigned.teacher} · they see how it goes</p>}
      {routine.description && <p className="-mt-3 whitespace-pre-wrap text-sm">{routine.description}</p>}
      <section aria-label={day === today ? "Today" : formatLongDate(day)} className="flex flex-col gap-2.5">
        <h2 className="text-sm font-semibold">{day === today ? "Today" : formatLongDate(day)}</h2>
        {dayCard}
      </section>
      <PageSections pageKey={routineKey} sections={sections} />
      {sharing && <RoutineShareDialog routine={routine} onClose={() => setSharing(false)} />}
      {addingFiles && (
        <AttachmentPicker
          only="files"
          selected={ownFiles.files}
          onChange={(next) => log.saveRoutine({ ...routine, attachments: [...ownFiles.other, ...(next as FileAttachment[])] })}
          onClose={() => setAddingFiles(false)}
        />
      )}
    </>,
  );
}
