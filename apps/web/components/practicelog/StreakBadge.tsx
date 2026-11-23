"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { FlameIcon } from "@/components/practicelog/Celebrations";
import { GoalRing } from "@/components/practicelog/PracticeLogNavCard";
import { practicedOfGoal } from "@/components/practicelog/minutes";
import { formatStopwatch, useDayTimerMs } from "@/components/practicelog/DayTimer";
import { minutesOn, streak, todayKey, goalOn } from "@/lib/practiceLog";
import { useSiteSettings } from "@/lib/siteSettings";
import { usePracticeLog } from "@/lib/usePracticeLog";

const noop = () => () => {};

/**
 * Your streak, by your name in the sidebar: a flame and the number of days, lit once you've
 * practiced today, grey with a nudge while today's still open — plus a tiny ring filling toward
 * today's goal. Opens the Shed Log.
 */
export default function StreakBadge({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { data, ready } = usePracticeLog();
  const { isAuthenticated } = useConvexAuth();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const today = mounted ? todayKey() : "";
  const watch = useDayTimerMs(data, today);
  const [site] = useSiteSettings();
  if (!ready || !mounted || !isAuthenticated || !site.sidebarStreak || !site.shedLog) return null;
  const s = streak(data, today);
  const minutes = minutesOn(data, today, watch.liveMs);
  const lit = minutes > 0;
  const goal = goalOn(data, today);
  const frac = goal > 0 ? Math.min(1, minutes / goal) : 0;
  const title = lit
    ? `${s}-day streak · ${practicedOfGoal(minutes, goal)} today`
    : s > 0
      ? `${s}-day streak — practice today to keep it`
      : "Practice today to start a streak";

  if (compact) {
    return (
      <Link
        href="/shed-log"
        onClick={onNavigate}
        title={title}
        className={`flex items-center justify-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-2 ring-surface ${lit ? "text-white" : "text-orange-500"}`}
        // Opaque (mixed into the surface, not see-through), since it sits on top of the picture.
        style={{ background: lit ? "#f97316" : "color-mix(in srgb, #f97316 18%, var(--surface))" }}
      >
        <FlameIcon className="h-3 w-3" />
        {s}
      </Link>
    );
  }

  return (
    <Link href="/shed-log" onClick={onNavigate} title={title} aria-label={title} className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 hover:bg-surface-hover">
      <span
        className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums ${lit ? "text-orange-500" : s > 0 ? "animate-pulse text-orange-500" : "text-muted"}`}
      >
        <FlameIcon className={`h-3.5 w-3.5 ${lit ? "log-flame" : ""}`} />
        {s}
      </span>
      {watch.running && <span className="text-[11px] font-medium tabular-nums text-accent">{formatStopwatch(watch.ms)}</span>}
      {goal > 0 && <GoalRing frac={frac} met={frac >= 1} />}
    </Link>
  );
}
