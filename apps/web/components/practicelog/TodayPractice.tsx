"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { SHARE_PROGRESS_EVENT, burstAt } from "@/components/practicelog/Celebrations";
import Momentum from "@/components/practicelog/Momentum";
import DayTimer from "@/components/practicelog/DayTimer";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { CalendarIcon, CheckIcon, PlayIcon, PlusIcon } from "@/components/tools";
import {
  ROUTINE_COLORS,
  addDays,
  dayLevel,
  formatMinutesShort,
  formatTime,
  fromDateKey,
  minutesOn,
  newDayTask,
  progressOf,
  routineSpan,
  routinesOn,
  startOfWeek,
  tasksOf,
  todayKey, goalOn
} from "@/lib/practiceLog";
import { usePracticeLog, useRoutineTimer } from "@/lib/usePracticeLog";

const noop = () => () => {};
const LEVEL_BG = ["var(--surface-hover)", "#0e4429", "#006d32", "#26a641", "#39d353"];

/** The dashboard's "Goal and streak" card: the Shed Log's goal ring, streak, week and hours. Shows
    nothing signed out (the "Today's practice" card asks you to start a Shed Log). */
export function TodayMomentum() {
  const log = usePracticeLog();
  const { isAuthenticated } = useConvexAuth();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!isAuthenticated) return null;
  if (!log.ready || !mounted) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;
  return (
    <Momentum
      data={log.data}
      today={todayKey()}
      onPrefs={log.setPrefs}
      onShare={(kind) => window.dispatchEvent(new CustomEvent(SHARE_PROGRESS_EVENT, { detail: kind }))}
    />
  );
}

/**
 * The dashboard's "Today's practice" card body: what's on today (routines with Start / Continue,
 * the day's own tasks to tick off, a quick-add) under the day timer. Signed out, it invites you to
 * start a Shed Log.
 */
export default function TodayPractice() {
  const log = usePracticeLog();
  const { data, ready } = log;
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { startRoutine, runningTask } = useRoutineTimer();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [title, setTitle] = useState("");
  if (!isLoading && !isAuthenticated) {
    return (
      <div className="flex flex-1 flex-col items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <CalendarIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold">Start your Shed Log</h3>
          <p className="text-sm text-muted">Routines, a day timer, a daily goal and a streak — and every minute in soniroll&apos;s tools counts. Free with an account.</p>
        </div>
        <SignInButtons />
      </div>
    );
  }
  if (!ready || !mounted) return <div className="h-40 animate-pulse rounded-2xl bg-background" />;

  const today = todayKey();
  const items = routinesOn(data, today).filter((i) => !i.occurrence.skipped);
  const tasks = data.days[today]?.tasks ?? [];
  const nothing = items.length === 0 && tasks.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <DayTimer data={data} date={today} compact />
      <h3 className="mt-1 text-sm font-semibold text-muted">On today</h3>
      {nothing && (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-background p-4">
          <p className="text-sm">Nothing planned yet. A routine repeats on the days you pick — or just add a task for today.</p>
          <Link href={`/shed-log/routine/edit?date=${today}`} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
            <PlusIcon className="h-4 w-4" /> Make a routine
          </Link>
        </div>
      )}
      {items.map(({ routine, occurrence }) => {
        const p = progressOf(routine, occurrence);
        const complete = p.total > 0 && p.done === p.total;
        const span = routineSpan(routine, occurrence);
        const doneSet = new Set(occurrence.done ?? []);
        const next = tasksOf(routine, occurrence).find((t) => !doneSet.has(t.id) && t.minutes > 0);
        const color = ROUTINE_COLORS[routine.color % ROUTINE_COLORS.length];
        const running = runningTask(routine.id, today);
        return (
          <div key={routine.id} className="flex items-center gap-3 rounded-2xl bg-background p-3">
            <RoutineIcon icon={routine.icon} color={routine.color} size="md" />
            <Link href={`/shed-log?date=${today}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-bold">{routine.name || "Routine"}</span>
                {complete && <CheckIcon className="h-4 w-4 shrink-0 text-emerald-500" />}
              </div>
              <div className="text-xs text-muted">
                {span ? `${formatTime(span.start)} · ` : ""}
                {p.done}/{p.total} tasks{running ? " · on the timer now" : ""}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%`, background: complete ? "#22c55e" : color }} />
              </div>
            </Link>
            {!complete && next && !running && (
              <button
                type="button"
                onClick={() => startRoutine(routine, today, p.done > 0 ? next.id : undefined, false, occurrence)}
                className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                <PlayIcon className="h-3.5 w-3.5" /> {p.done > 0 ? "Continue" : "Start"}
              </button>
            )}
          </div>
        );
      })}
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-background px-3 py-2.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={t.done}
            aria-label={`${t.title} done`}
            onClick={(e) => {
              if (!t.done) burstAt(e.currentTarget, "var(--accent)");
              log.toggleDayTask(today, t.id);
            }}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${t.done ? "log-check border-transparent bg-accent text-accent-foreground" : "border-surface-hover hover:border-muted"}`}
          >
            {t.done && <CheckIcon className="h-4 w-4" />}
          </button>
          <span className={`min-w-0 flex-1 truncate font-medium ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
          <span className="shrink-0 text-xs text-muted">{formatMinutesShort(t.minutes)}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 rounded-2xl bg-background px-3 py-1.5">
        <PlusIcon className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) {
              log.saveDayTask(today, newDayTask(title.trim()));
              setTitle("");
            }
          }}
          placeholder="Add a task for today — press Enter"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
        />
      </div>
    </div>
  );
}

/** The last few months as a grid of days (a column per week), greener for more practice. `bare`
    leaves out its own card and title (the dashboard's card has them). */
export function HeatGrid({ className = "", weeks: weekCount = 18, bare = false }: { className?: string; weeks?: number; bare?: boolean }) {
  const { data } = usePracticeLog();
  const today = todayKey();
  const first = addDays(startOfWeek(today), -(weekCount - 1) * 7);
  let practiced = 0;
  const weeks = Array.from({ length: weekCount }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const key = addDays(first, w * 7 + d);
      const m = key > today ? -1 : minutesOn(data, key);
      if (m > 0) practiced++;
      return { key, m };
    }),
  );
  const months: { col: number; label: string }[] = [];
  weeks.forEach((wk, i) => {
    const m = fromDateKey(wk[0].key).getMonth();
    if (i === 0 || m !== fromDateKey(weeks[i - 1][0].key).getMonth()) months.push({ col: i, label: fromDateKey(wk[0].key).toLocaleString(undefined, { month: "short" }) });
  });
  return (
    <div className={`flex flex-col gap-3 ${bare ? "" : "rounded-3xl bg-surface p-4"} ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        {!bare && <h3 className="text-sm font-semibold text-muted">Your practice</h3>}
        <span className="text-xs font-semibold text-muted">{practiced} day{practiced === 1 ? "" : "s"} in {weekCount} weeks</span>
      </div>
      <div className="relative grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))` }}>
        {months.map((mo) => (
          <span key={mo.col} className="text-[10px] font-semibold text-muted" style={{ gridColumn: `${mo.col + 1} / span 3`, gridRow: 1 }}>
            {mo.label}
          </span>
        ))}
        {weeks.map((wk, w) =>
          wk.map(({ key, m }, d) => (
            <Link
              key={key}
              href={`/shed-log?date=${key}`}
              title={m < 0 ? undefined : `${fromDateKey(key).toDateString()} · ${m > 0 ? formatMinutesShort(Math.round(m)) : "no practice"}`}
              className={`aspect-square rounded-[3px] transition-transform hover:scale-125 ${key === today ? "ring-2 ring-accent" : ""}`}
              style={{ gridColumn: w + 1, gridRow: d + 2, background: m < 0 ? "transparent" : LEVEL_BG[dayLevel(m, goalOn(data, key))], pointerEvents: m < 0 ? "none" : undefined }}
            />
          )),
        )}
      </div>
      <div className="flex items-center justify-end gap-1 text-[10px] font-semibold text-muted">
        Less
        {LEVEL_BG.map((c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
        ))}
        More
      </div>
    </div>
  );
}
