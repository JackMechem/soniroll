"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useDayTimerMs } from "@/components/practicelog/DayTimer";
import { navIconButtonClass, navIconClass, navRowClass } from "@/components/navRow";
import { CalendarIcon } from "@/components/tools";
import { goalOn, minutesOn, todayKey } from "@/lib/practiceLog";
import { usePracticeLog } from "@/lib/usePracticeLog";

const noop = () => () => {};

/** A small ring that fills toward today's goal (green once it's met). */
function GoalRing({ frac, met }: { frac: number; met: boolean }) {
  const R = 6;
  const C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r={R} fill="none" strokeWidth="2" className="stroke-foreground/10" />
      {frac > 0 && <circle cx="8" cy="8" r={R} fill="none" strokeWidth="2" strokeLinecap="round" stroke={met ? "var(--success)" : "var(--accent)"} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />}
    </svg>
  );
}

/**
 * The Shed Log's row in the sidebar, under Dashboard: today's minutes against the goal on the
 * right (a small ring and "12/30m"), and a red dot while the day timer runs. Collapsed, the icon.
 */
export default function PracticeLogNavCard({ active, collapsed, large, onNavigate }: { active: boolean; collapsed?: boolean; large?: boolean; onNavigate?: () => void }) {
  const { data, ready } = usePracticeLog();
  const { isAuthenticated } = useConvexAuth();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const today = mounted ? todayKey() : "";
  const watch = useDayTimerMs(data, today);
  const show = ready && mounted && isAuthenticated;
  const minutes = show ? minutesOn(data, today, watch.liveMs) : 0;
  const goal = goalOn(data, today);
  const frac = goal > 0 ? Math.min(1, minutes / goal) : 0;
  const met = goal > 0 && minutes >= goal;
  const timerDot = watch.running && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-danger" title="Day timer running" />;

  if (collapsed) {
    return (
      <Link href="/shed-log" onClick={onNavigate} title={show ? `Shed Log — ${Math.round(minutes)} of ${goal} min today` : "Shed Log"} aria-label="Shed Log" className={`relative ${navIconButtonClass(active)}`}>
        <CalendarIcon className="h-4 w-4 text-accent" />
        {watch.running && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />}
      </Link>
    );
  }

  return (
    <Link href="/shed-log" onClick={onNavigate} className={navRowClass(active, large)}>
      <span data-nav-icon className="flex shrink-0 text-accent">
        <CalendarIcon className={navIconClass(large)} />
      </span>
      <span className="min-w-0 flex-1 truncate">Shed Log</span>
      {timerDot}
      {show && goal > 0 && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted" title={`${Math.round(minutes)} of ${goal} minutes today`}>
          {Math.round(minutes)}/{goal}m
          <GoalRing frac={frac} met={met} />
        </span>
      )}
    </Link>
  );
}
