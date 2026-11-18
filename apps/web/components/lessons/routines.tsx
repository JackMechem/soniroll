"use client";

import Link from "next/link";
import { useState } from "react";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import { ChevronRightIcon, PencilIcon, TrashIcon } from "@/components/tools";
import { RecentStrip, RoutineReportView, btnSmallPrimary, type LessonItem } from "@/components/lessons/parts";
import { describeRepeat, formatMinutesShort, lessonRoutineId, totalMinutes } from "@/lib/practiceLog";

type Summary = { recent: { date: string; status: string | null }[]; totals: { done: number } | null } | undefined;

/**
 * An assigned Shed Log routine as one compact row: its icon, name, how often and how long, and
 * (teacher) the last two weeks at a glance. Expanding shows the tasks — and, for the teacher, the
 * day-by-day practice report.
 */
export function RoutineRow({
  item,
  teacher,
  summary,
  onEdit,
  onRemove,
}: {
  item: LessonItem;
  teacher: boolean;
  summary?: Summary;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const r = item.routine;
  if (!r) return null;
  return (
    <div className="overflow-hidden rounded-lg bg-surface">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <RoutineIcon icon={r.icon} color={r.color} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{r.name}</span>
            <span className="block truncate text-xs text-muted">
              {describeRepeat(r.repeat)} · {r.tasks.length} task{r.tasks.length === 1 ? "" : "s"} · {formatMinutesShort(totalMinutes(r))}
            </span>
          </span>
          {teacher && (
            <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
              <RecentStrip recent={summary?.recent ?? []} />
              <span className="text-[11px] text-muted">{summary?.totals ? `${summary.totals.done} day${summary.totals.done === 1 ? "" : "s"} done` : "Not started"}</span>
            </span>
          )}
          <ChevronRightIcon className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {teacher && (onEdit || onRemove) && (
          <div className="flex shrink-0 gap-0.5">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Replace ${r.name}`}
                title="Replace with another routine"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${r.name}`}
                title="Remove"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t border-foreground/10 p-3">
          <ol className="flex flex-col gap-1">
            {r.tasks.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{formatMinutesShort(t.minutes)}</span>
              </li>
            ))}
          </ol>
          {teacher ? (
            <RoutineReportView itemId={item.id} />
          ) : (
            <Link
              href={`/shed-log/routine?id=${encodeURIComponent(lessonRoutineId(item.id))}`}
              className={`self-start ${btnSmallPrimary}`}
            >
              Open in your Shed Log
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
