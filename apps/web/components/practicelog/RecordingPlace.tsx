"use client";

import { RepeatIcon } from "@/components/tools";
import { formatShortDate } from "@/lib/practiceLog";
import { openSide } from "@/lib/notePeek";
import { usePracticeLog } from "@/lib/usePracticeLog";

/**
 * Where in the Shed Log a recording was made, under its name: "Bass / Scales" (a routine's task),
 * "Bass" (the routine), "Nov 22 / Transcribe a chorus" (a day's own task). A task opens in the
 * side view. Nothing for a recording that isn't on a routine or task.
 */
export default function RecordingPlace({ routineId, taskId, logDate }: { routineId: string | null; taskId?: string | null; logDate: string | null }) {
  const log = usePracticeLog();
  if (!routineId && !taskId) return null;
  const routine = routineId ? log.data.routines.find((r) => r.id === routineId) : undefined;
  const task = taskId
    ? routineId
      ? (routine?.tasks.find((t) => t.id === taskId) ??
        (logDate ? log.data.days[logDate]?.routines?.[routineId]?.extraTasks?.find((t) => t.id === taskId) : undefined))
      : logDate
        ? log.data.days[logDate]?.tasks?.find((t) => t.id === taskId)
        : undefined
    : undefined;
  const first = routineId ? routine?.name || "A routine" : logDate ? formatShortDate(logDate) : "A day";
  const label = [first, taskId ? task?.title || "a task" : null].filter(Boolean).join(" / ");
  const open = () =>
    taskId
      ? openSide(routineId ? { kind: "task", routineId, taskId, ...(logDate ? { date: logDate } : {}) } : { kind: "task", date: logDate ?? "", taskId })
      : routineId && openSide({ kind: "routine", id: routineId, ...(logDate ? { date: logDate } : {}) });
  const canOpen = (taskId ? (routineId ? !!routine : !!logDate) : !!routine) && !!task === !!taskId;
  return canOpen ? (
    <button type="button" onClick={open} title="Open it" className="flex max-w-full items-center gap-1 truncate text-xs font-medium text-muted hover:text-foreground hover:underline">
      <RepeatIcon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  ) : (
    <span className="flex max-w-full items-center gap-1 truncate text-xs text-muted">
      <RepeatIcon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
