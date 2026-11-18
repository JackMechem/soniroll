"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { BackButton, EmptyCard, PageShell } from "@/components/library/shared";
import { PlusIcon } from "@/components/tools";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import {
  describeRepeat,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  nextOccurrences,
  parseTime,
  todayKey,
  totalMinutes,
} from "@/lib/practiceLog";
import { usePracticeLog } from "@/lib/usePracticeLog";

const noopSubscribe = () => () => {};

/** `/shed-log/routines` — every routine, with when it's next on. */
export default function RoutinesPage() {
  const { data, ready } = usePracticeLog();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!ready || !mounted) {
    return (
      <PageShell>
        <LoadingSpinner />
      </PageShell>
    );
  }
  const today = todayKey();
  const rows = data.routines
    .map((r) => ({ r, next: nextOccurrences(r.repeat, today, 1)[0] ?? null }))
    .sort((a, b) => (a.next && b.next ? (a.next < b.next ? -1 : a.next > b.next ? 1 : 0) : a.next ? -1 : b.next ? 1 : 0));

  return (
    <PageShell>
      <div className="flex flex-col gap-3 border-b border-foreground/10 pb-6">
        <BackButton href="/shed-log" label="Shed Log" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Routines</h1>
          <Link href="/shed-log/routine/edit" className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            <PlusIcon className="h-4 w-4" /> New routine
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyCard>No routines yet. A routine is a list of tasks — with minutes for each, and times if you like — that repeats on the days you pick.</EmptyCard>
      ) : (
        <ul className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
          {rows.map(({ r, next }) => {
            const start = parseTime(r.startTime);
            return (
              <li key={r.id}>
                <Link href={`/shed-log/routine?id=${encodeURIComponent(r.id)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover">
                  <RoutineIcon icon={r.icon} color={r.color} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.name || "Untitled routine"}</div>
                    <div className="truncate text-xs text-muted">
                      {describeRepeat(r.repeat)}
                      {start !== null ? ` · ${formatTime(start)}` : ""} · {r.tasks.length} task{r.tasks.length === 1 ? "" : "s"}, {formatMinutesShort(totalMinutes(r))}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{next ? (next === today ? "Today" : `Next ${formatShortDate(next)}`) : "Ended"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
