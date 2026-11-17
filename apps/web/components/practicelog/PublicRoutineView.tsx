"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import Link from "next/link";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon, ChordChartIcon, NoteIcon, PlusIcon, RepeatIcon, SetlistIcon, findToolLink } from "@/components/tools";
import {
  type PublicAttachment,
  type PublicRoutine,
  ROUTINE_COLORS,
  describePublicRepeat,
  formatMinutesShort,
  formatTime,
  parseTime,
  routineFromPublic,
  todayKey,
} from "@/lib/practiceLog";
import { usePracticeLog } from "@/lib/usePracticeLog";
import RoutineIcon from "@/components/practicelog/RoutineIcon";

function Chip({ a }: { a: PublicAttachment }) {
  const tool = a.kind === "tool" ? findToolLink(a.href) : undefined;
  const Icon = tool?.icon ?? (a.kind === "setlist" ? SetlistIcon : a.kind === "chart" ? ChordChartIcon : NoteIcon);
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5 text-accent" />
      <span className="truncate">{a.label}</span>
    </>
  );
  const cls = "flex max-w-[16rem] items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium";
  return tool ? (
    <Link href={tool.href} className={`${cls} hover:underline`}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

/** Each task with when it starts: its own time, or straight after the one before. */
function scheduleOf(routine: PublicRoutine): { t: PublicRoutine["tasks"][number]; start: number | null }[] {
  const out: { t: PublicRoutine["tasks"][number]; start: number | null }[] = [];
  let cursor = parseTime(routine.startTime);
  for (const t of routine.tasks) {
    const start = parseTime(t.time) ?? cursor;
    cursor = start === null ? null : start + t.minutes;
    out.push({ t, start });
  }
  return out;
}

/** A shared routine, read-only: when it runs, its tasks with times and minutes, what's attached. */
export function RoutinePreview({ routine, compact = false, meta = true }: { routine: PublicRoutine; compact?: boolean; /** The icon / schedule / length line. */ meta?: boolean }) {
  const color = ROUTINE_COLORS[routine.color % ROUTINE_COLORS.length];
  const total = routine.tasks.reduce((s, t) => s + t.minutes, 0);
  const tasks = scheduleOf(routine).slice(0, compact ? 4 : undefined);
  return (
    <div className="flex flex-col gap-3">
      {meta && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <RoutineIcon icon={routine.icon} color={routine.color} size="sm" />
        <span className="flex items-center gap-1">
          <RepeatIcon className="h-3.5 w-3.5" /> {describePublicRepeat(routine.repeat)}
        </span>
        {parseTime(routine.startTime) !== null && <span>at {formatTime(parseTime(routine.startTime)!)}</span>}
        <span>
          · {routine.tasks.length} task{routine.tasks.length === 1 ? "" : "s"}, {formatMinutesShort(total)}
        </span>
      </div>}
      {!compact && routine.description && <p className="whitespace-pre-wrap text-sm">{routine.description}</p>}
      <ol className="flex flex-col divide-y divide-surface-hover rounded-xl bg-background">
        {tasks.map(({ t, start }, i) => (
          <li key={i} className="flex gap-3 px-3 py-2">
            <span className="w-5 shrink-0 pt-0.5 text-center text-sm font-bold tabular-nums" style={{ color }}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{t.title || "Task"}</div>
              <div className="text-xs text-muted">
                {start !== null ? `${formatTime(start)} · ` : ""}
                {formatMinutesShort(t.minutes)}
              </div>
              {!compact && t.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{t.notes}</p>}
              {!compact && t.attachments.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {t.attachments.map((a, j) => (
                    <Chip key={j} a={a} />
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
        {compact && routine.tasks.length > 4 && <li className="px-3 py-1.5 pl-11 text-xs text-muted">+{routine.tasks.length - 4} more</li>}
      </ol>
      {!compact && routine.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {routine.attachments.map((a, j) => (
            <Chip key={j} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Adds a shared routine to your own Shed Log (starting today) and opens it there. Signed out,
    it asks you to sign in or sign up — the Shed Log is for account holders. */
export function AddRoutineButton({ routine }: { routine: PublicRoutine }) {
  const router = useRouter();
  const { saveRoutine, ready } = usePracticeLog();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [added, setAdded] = useState(false);
  if (!isLoading && !isAuthenticated) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
        <p className="text-sm">Sign in to add this routine to your Shed Log.</p>
        <SignInButtons size="sm" />
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={!ready || added}
      onClick={() => {
        const mine = routineFromPublic(routine, todayKey());
        saveRoutine(mine);
        setAdded(true);
        router.push(`/shed-log/routine/edit?id=${encodeURIComponent(mine.id)}`);
      }}
      className="flex items-center gap-1.5 self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
    >
      {added ? <CheckIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />} {added ? "Added" : "Add to my Shed Log"}
    </button>
  );
}
