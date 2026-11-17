"use client";

import { useState } from "react";
import { FlameIcon } from "@/components/practicelog/Celebrations";
import { useDayTimerMs } from "@/components/practicelog/DayTimer";
import GoalDialog from "@/components/practicelog/GoalDialog";
import { ShareIcon } from "@/components/tools";
import {
  type PracticeLogData,
  type PracticeLogPrefs,
  type ProgressCardKind,
  WEEKDAY_LETTER,
  addDays,
  bestStreak,
  dayProgress,
  formatMinutesShort,
  goalOn,
  hourMilestone,
  lifetimeMinutes,
  minutesOn,
  startOfWeek,
  streak,
  weekdayOf,
} from "@/lib/practiceLog";

/**
 * Four stats (in the Shed Log's Stats dialog and the dashboard's "Goal and streak" card) —
 * built to make you want to practice: today's goal filling up, the streak (and a nudge when it's
 * about to break), the week as bars against your goal, and lifetime hours creeping toward the
 * next milestone.
 */
export default function Momentum({
  data,
  today,
  onPrefs,
  onShare,
}: {
  data: PracticeLogData;
  today: string;
  onPrefs: (patch: Partial<PracticeLogPrefs>) => void;
  onShare: (kind: ProgressCardKind) => void;
}) {
  const goal = goalOn(data, today);
  const [editingGoal, setEditingGoal] = useState(false);
  const watch = useDayTimerMs(data, today);
  // Live while the day timer runs (the stored part is handed over every 30 seconds).
  const minutes = minutesOn(data, today, watch.liveMs);
  const progress = dayProgress(data, today);
  const s = streak(data, today);
  const best = Math.max(s, bestStreak(data));
  const practicedToday = minutes > 0;

  const weekStart = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(weekStart, i);
    return { key, minutes: minutesOn(data, key), goal: goalOn(data, key) };
  });
  const weekTotal = week.reduce((a, d) => a + d.minutes, 0);
  const lastWeek = Array.from({ length: 7 }, (_, i) => minutesOn(data, addDays(weekStart, i - 7))).reduce((a, b) => a + b, 0);
  const daysHit = week.filter((d) => d.goal > 0 && d.minutes >= d.goal).length;
  const goalDays = week.filter((d) => d.goal > 0).length;

  const hours = lifetimeMinutes(data) / 60;
  const ms = hourMilestone(hours);

  const weekChange = lastWeek > 0 ? Math.round(((weekTotal - lastWeek) / lastWeek) * 100) : null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <GoalCard minutes={minutes} goal={goal} progress={progress} onEdit={() => setEditingGoal(true)} />
      {editingGoal && <GoalDialog data={data} onSave={onPrefs} onClose={() => setEditingGoal(false)} />}

      <Card label="Streak" action={<ShareButton onClick={() => onShare("streak")} />}>
        <div className="flex items-center gap-2">
          <Value value={s} unit={s === 1 ? "day" : "days"} />
          <FlameIcon className={`h-5 w-5 ${practicedToday ? "log-flame text-orange-500" : s > 0 ? "text-orange-500/60" : "text-muted"}`} />
        </div>
        <Note warn={!practicedToday && s > 0}>
          {practicedToday
            ? s >= best && s > 1
              ? "Your best streak ever. Keep it rolling."
              : `Best: ${best} day${best === 1 ? "" : "s"}`
            : s > 0
              ? `Practice today to keep your ${s}-day streak alive.`
              : "Practice today to start a streak."}
        </Note>
      </Card>

      <Card
        label="This week"
        action={
          weekChange !== null && (
            <span
              className={`whitespace-nowrap text-xs font-medium tabular-nums ${weekChange >= 0 ? "text-emerald-500" : "text-muted"}`}
              title="Compared with last week"
            >
              {weekChange >= 0 ? "▲" : "▼"} {Math.abs(weekChange)}%
            </span>
          )
        }
      >
        <Value value={formatMinutesShort(Math.round(weekTotal))} />
        <WeekBars week={week} today={today} />
        <Note>{goalDays > 0 ? `Goal hit ${daysHit} of ${goalDays} days` : "Set a daily goal to track your week"}</Note>
      </Card>

      <Card wide label="In total" action={<ShareButton onClick={() => onShare("hours")} />}>
        <Value value={hours < 10 ? hours.toFixed(1) : Math.floor(hours)} unit="h" />
        <Bar frac={Math.max(0.03, Math.min(1, (hours - ms.from) / (ms.to - ms.from)))} />
        <Note>
          {hours === 0 ? "Your first hour starts with one session" : `${formatMinutesShort(Math.max(1, Math.round((ms.to - hours) * 60)))} to ${ms.to} hour${ms.to === 1 ? "" : "s"}`}
        </Note>
      </Card>
    </div>
  );
}

function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Share as an image"
      title="Share as an image"
      className="-my-1.5 -mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
    >
      <ShareIcon className="h-4 w-4" />
    </button>
  );
}

/** One stat: a small label (with an action on the right), then its number and details. */
function Card({ label, action, children, wide = false }: { label: string; action?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`flex min-w-0 flex-col justify-between gap-3 rounded-lg bg-surface p-4 ${wide ? "sm:col-span-2 xl:col-span-1" : ""}`}>
      <div className="flex h-5 items-center justify-between gap-2">
        <h3 className="truncate text-xs font-medium text-muted">{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Value({ value, unit }: { value: React.ReactNode; unit?: React.ReactNode }) {
  return (
    <div className="text-2xl font-semibold tracking-tight tabular-nums">
      {value}
      {unit && <span className="text-sm font-normal text-muted"> {unit}</span>}
    </div>
  );
}

function Note({ children, warn = false, good = false }: { children: React.ReactNode; warn?: boolean; good?: boolean }) {
  return <p className={`text-xs ${warn ? "text-orange-500" : good ? "text-emerald-500" : "text-muted"}`}>{children}</p>;
}

/** A thin progress bar; green once it's full (`done`). */
function Bar({ frac, done = false }: { frac: number; done?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${frac * 100}%`, background: done ? "#22c55e" : "var(--accent)" }}
      />
    </div>
  );
}

function GoalCard({ minutes, goal, progress, onEdit }: { minutes: number; goal: number; progress: { done: number; total: number }; onEdit: () => void }) {
  const frac = goal > 0 ? Math.min(1, minutes / goal) : 0;
  const met = goal > 0 && minutes >= goal;
  const left = Math.max(0, Math.ceil(goal - minutes));
  const message = goal <= 0
    ? minutes > 0 ? "Practicing on a rest day — nice" : "A rest day, no goal today"
    : met
      ? minutes - goal >= 1
        ? `Goal smashed! +${formatMinutesShort(Math.round(minutes - goal))} bonus`
        : "Goal reached!"
      : minutes > 0
        ? `${formatMinutesShort(left)} to go — you've got this`
        : "Let's get some practice in";
  return (
    <Card
      wide
      label={goal > 0 ? "Today's goal" : "Today · rest day"}
      action={
        <button type="button" onClick={onEdit} className="-my-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground">
          {goal > 0 ? "Change" : "Set a goal"}
        </button>
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <Value value={Math.round(minutes)} unit={goal > 0 ? `/ ${goal} min` : "min"} />
        {goal > 0 && <span className="text-xs font-medium tabular-nums text-muted">{Math.round(frac * 100)}%</span>}
      </div>
      {goal > 0 && <Bar frac={frac} done={met} />}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Note good={met}>{message}</Note>
        {progress.total > 0 && (
          <span className="text-xs tabular-nums text-muted">
            {progress.done}/{progress.total} tasks
          </span>
        )}
      </div>
    </Card>
  );
}

function WeekBars({ week, today }: { week: { key: string; minutes: number; goal: number }[]; today: string }) {
  const max = Math.max(...week.map((d) => d.goal), ...week.map((d) => d.minutes), 1);
  const same = week.every((d) => d.goal === week[0].goal);
  return (
    <div className="relative flex h-14 items-end gap-1.5">
      {same && week[0].goal > 0 && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/25" style={{ bottom: 14 + (week[0].goal / max) * 42 }} />}
      {week.map((d) => {
        const hit = d.goal > 0 && d.minutes >= d.goal;
        const future = d.key > today;
        return (
          <div key={d.key} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="relative flex h-[42px] w-full items-end">
              {!same && d.goal > 0 && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/30" style={{ bottom: `${(d.goal / max) * 100}%` }} />}
              <div
                className={`w-full rounded-sm transition-[height] duration-700 ${hit ? "bg-emerald-500" : d.minutes > 0 ? "bg-accent/60" : "bg-foreground/10"}`}
                style={{ height: `${Math.max(d.minutes > 0 ? 12 : 6, (d.minutes / max) * 100)}%`, opacity: future ? 0.4 : 1 }}
                title={`${formatMinutesShort(Math.round(d.minutes))}`}
              />
            </div>
            <span className={`h-[12px] text-[10px] font-medium leading-[12px] ${d.key === today ? "text-foreground" : "text-muted"}`}>{WEEKDAY_LETTER[weekdayOf(d.key)]}</span>
          </div>
        );
      })}
    </div>
  );
}
