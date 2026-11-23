"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useContext, useSyncExternalStore } from "react";
import { RemainingLabel } from "@/components/RemainingLabel";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import { StopwatchIcon } from "@/components/tools";
import { DAY_TASKS_ID, isRoutineNow, parseTime, routinesOn, tasksOf, todayKey } from "@/lib/practiceLog";
import { type EngineState, getServerSnapshot, getSnapshot, subscribe } from "@/lib/practiceTimerEngine";
import { PaneNavContext, usePaneId } from "@/lib/paneContext";
import { taskHref } from "@/lib/shedLogPages";
import { usePracticeLog } from "@/lib/usePracticeLog";
import { openBeside } from "@/lib/useTilingLayout";

/**
 * "Now practicing", from anywhere: the routine task the Practice Timer is running (with its time
 * left), or — when nothing runs — today's next task not done yet. Clicking opens that task's page in
 * the side view (its notes, files and recordings beside whatever tool you're in). Nothing at all
 * when nothing is planned for today, everything's done, or you're signed out.
 *
 * Shown in every page's header bar (`PageBar`), in the main split-screen pane's bar, and on phones
 * through the timer chip in the top bar (`PracticeTimerWidget`'s `bar`, which uses `useNowPracticing`).
 */

export type NowPracticing = {
  running: boolean;
  /** The task (or the timer step) and the routine it's in. */
  title: string;
  routine: string | null;
  icon: string | undefined;
  color: number | null;
  /** Its page (a task page, or the Practice Timer for a plain timer session). */
  href: string;
  engine: EngineState | null;
};

const noopSubscribe = () => () => {};

export function useNowPracticing(): NowPracticing | null {
  const { isAuthenticated } = useConvexAuth();
  const log = usePracticeLog();
  const engine = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // "Today" isn't known on the server: nothing until it's mounted.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted || !isAuthenticated) return null;

  if (engine) {
    const link = engine.session.type === "custom" ? engine.session.link : undefined;
    const taskId = engine.session.type === "custom" ? (engine.session.segments[engine.index]?.id ?? "") : "";
    if (link && link.routineId !== DAY_TASKS_ID) {
      const routine = log.data.routines.find((r) => r.id === link.routineId);
      return {
        running: true,
        title: engine.current.title,
        routine: routine?.name || engine.session.name || null,
        icon: routine?.icon,
        color: routine?.color ?? null,
        href: taskHref({ routineId: link.routineId, taskId, date: link.date }),
        engine,
      };
    }
    if (link) return { running: true, title: engine.current.title, routine: null, icon: undefined, color: null, href: taskHref({ date: link.date, taskId }), engine };
    return { running: true, title: engine.current.title, routine: engine.session.name || null, icon: undefined, color: null, href: "/practice-timer", engine };
  }

  if (!log.ready) return null;
  const today = todayKey();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const routines = routinesOn(log.data, today).filter((r) => !r.occurrence.skipped);
  // The routine whose time it is now, else the first one with something left.
  const ordered = [...routines.filter((r) => isRoutineNow(r, nowMin)), ...routines.filter((r) => !isRoutineNow(r, nowMin))];
  for (const { routine, occurrence } of ordered) {
    const done = new Set(occurrence.done ?? []);
    const next = tasksOf(routine, occurrence).find((t) => !done.has(t.id));
    if (next) {
      return { running: false, title: next.title || "Task", routine: routine.name || "Routine", icon: routine.icon, color: routine.color, href: taskHref({ routineId: routine.id, taskId: next.id, date: today }), engine: null };
    }
  }
  const dayTasks = [...(log.data.days[today]?.tasks ?? [])].filter((t) => !t.done).sort((a, b) => (parseTime(a.time) ?? 1e9) - (parseTime(b.time) ?? 1e9));
  if (dayTasks[0]) return { running: false, title: dayTasks[0].title || "Task", routine: null, icon: undefined, color: null, href: taskHref({ date: today, taskId: dayTasks[0].id }), engine: null };
  return null;
}

/** Opens what's being practiced in the side view (or as a page when it can't). */
export function useOpenNowPracticing() {
  const router = useRouter();
  const paneId = usePaneId();
  return (href: string) => {
    if (!openBeside(href, { from: paneId })) router.push(href);
  };
}

/**
 * The header's pill. `compact` (a pane's bar): the icon and the time only.
 */
export default function NowPracticingPill({ compact = false }: { compact?: boolean }) {
  const now = useNowPracticing();
  const open = useOpenNowPracticing();
  const pathname = usePathname();
  // The page's query: a pane's own, else the window's (no `useSearchParams` here: this is in every
  // page's header, and that would need a Suspense boundary on each statically built page).
  const paneNav = useContext(PaneNavContext);
  if (!now) return null;
  // Not on the very page it opens (the task's own page, the Practice Timer).
  const target = new URL(now.href, "http://x");
  const query = new URLSearchParams(paneNav ? paneNav.search : window.location.search);
  if (pathname === target.pathname && (target.pathname !== "/shed-log/task" || query.get("task") === target.searchParams.get("task"))) return null;

  const e = now.engine;
  const label = now.running ? now.title : `Next: ${now.title}`;
  const where = now.routine ? `${now.routine} · ${now.title}` : now.title;
  return (
    <button
      type="button"
      onClick={() => open(now.href)}
      title={`${now.running ? (e?.alarming ? "Time's up" : e?.paused ? "Paused" : "Practicing") : "Next up today"}: ${where} — open it beside the page`}
      aria-label={`${now.running ? "Now practicing" : "Next up today"}: ${where}. Open it beside the page.`}
      className={`flex h-8 min-w-0 shrink items-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-colors ${
        now.running ? "bg-accent/10 text-foreground hover:bg-accent/15" : "bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"
      } ${e?.alarming ? "animate-pulse text-danger" : ""}`}
    >
      {now.color !== null ? <RoutineIcon icon={now.icon} color={now.color} size="xs" /> : <StopwatchIcon className="h-4 w-4 shrink-0 text-accent" />}
      {!compact && <span className="min-w-0 max-w-[14rem] truncate">{label}</span>}
      {e && (
        <span className={`shrink-0 tabular-nums ${e.alarming ? "font-semibold" : "text-muted"}`}>
          {e.alarming ? "Time's up" : <RemainingLabel startedAt={e.startedAt} durationMs={e.durationMs} paused={e.paused} remainingMsAtPause={e.remainingMsAtPause} alarming={e.alarming} />}
        </span>
      )}
      {compact && !e && <span className="sr-only">{label}</span>}
    </button>
  );
}
