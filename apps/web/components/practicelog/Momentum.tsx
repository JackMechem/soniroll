"use client";

import { useMemo, useState } from "react";
import { FlameIcon } from "@/components/practicelog/Celebrations";
import { useDayTimerMs } from "@/components/practicelog/DayTimer";
import GoalDialog from "@/components/practicelog/GoalDialog";
import { TOUCH_TEXT } from "@/components/practicelog/touch";
import { ChevronLeftIcon, ChevronRightIcon, ShareIcon } from "@/components/tools";
import {
  type PracticeLogData,
  type PracticeLogPrefs,
  type ProgressCardKind,
  WEEKDAY_LETTER,
  addDays,
  bestStreak,
  dayProgress,
  formatMinutesShort,
  formatShortDate,
  fromDateKey,
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
  browseWeeks = false,
}: {
  data: PracticeLogData;
  today: string;
  onPrefs: (patch: Partial<PracticeLogPrefs>) => void;
  onShare: (kind: ProgressCardKind) => void;
  /** The week card gets ‹ › to look back at earlier weeks (as far back as there's practice). */
  browseWeeks?: boolean;
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

  // 0 = this week, -1 = last week, …
  const [weekOffset, setWeekOffset] = useState(0);
  const thisWeek = startOfWeek(today);
  const weekStart = addDays(thisWeek, weekOffset * 7);
  // The first day with practice: the week card doesn't go back past its week.
  const firstDay = useMemo(() => {
    if (!browseWeeks) return null;
    let first: string | null = null;
    for (const k of Object.keys(data.days)) if ((first === null || k < first) && minutesOn(data, k) > 0) first = k;
    return first;
  }, [browseWeeks, data]);
  const canGoBack = firstDay !== null && addDays(weekStart, -1) >= firstDay;
  const weekLabel =
    weekOffset === 0
      ? "This week"
      : weekOffset === -1
        ? "Last week"
        : `${formatShortDate(weekStart)} – ${fromDateKey(weekStart).getMonth() === fromDateKey(addDays(weekStart, 6)).getMonth() ? fromDateKey(addDays(weekStart, 6)).getDate() : formatShortDate(addDays(weekStart, 6))}`;
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
    // Phones: a compact 2 × 2 (four full-width cards pushed everything else off the screen).
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      <GoalCard minutes={minutes} goal={goal} progress={progress} onEdit={() => setEditingGoal(true)} />
      {editingGoal && <GoalDialog data={data} onSave={onPrefs} onClose={() => setEditingGoal(false)} />}

      <Card
        label="Streak"
        action={<ShareButton onClick={() => onShare("streak")} />}
        value={
          <span className="flex items-baseline gap-2">
            <Value value={s} unit={s === 1 ? "day" : "days"} />
            <FlameIcon className={`h-5 w-5 self-center ${practicedToday ? "log-flame text-orange-500" : s > 0 ? "text-orange-500/60" : "text-muted"}`} />
          </span>
        }
      >
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
        label={weekLabel}
        action={
          <span className="flex items-center gap-1">
            {weekChange !== null && (
              <span
                className={`whitespace-nowrap text-xs font-medium tabular-nums ${weekChange >= 0 ? "text-success" : "text-muted"}`}
                title="Compared with the week before"
              >
                {weekChange >= 0 ? "▲" : "▼"} {Math.abs(weekChange)}%
              </span>
            )}
            {browseWeeks && (canGoBack || weekOffset < 0) && (
              <span className="-my-1.5 -mr-1.5 flex">
                <StepButton label="The week before" disabled={!canGoBack} onClick={() => setWeekOffset((o) => o - 1)}>
                  <ChevronLeftIcon className="h-4 w-4" />
                </StepButton>
                <StepButton label="The week after" disabled={weekOffset >= 0} onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}>
                  <ChevronRightIcon className="h-4 w-4" />
                </StepButton>
              </span>
            )}
          </span>
        }
        value={<Value value={formatMinutesShort(Math.round(weekTotal))} />}
      >
        <WeekBars week={week} today={today} />
        <Note>{goalDays > 0 ? `Goal hit ${daysHit} of ${goalDays} days` : "Set a daily goal to track your week"}</Note>
      </Card>

      <Card wide label="In total" action={<ShareButton onClick={() => onShare("hours")} />} value={<Value value={hours < 10 ? hours.toFixed(1) : Math.floor(hours)} unit="h" />}>
        <Bar frac={Math.max(0.03, Math.min(1, (hours - ms.from) / (ms.to - ms.from)))} />
        <Note>
          {hours === 0 ? "Your first hour starts with one session" : `${formatMinutesShort(Math.max(1, Math.round((ms.to - hours) * 60)))} to ${ms.to} hour${ms.to === 1 ? "" : "s"}`}
        </Note>
      </Card>
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
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

/** One stat, laid out the same in every card so they line up side by side: a small label (with an
    action on the right), the big number on one baseline (with an `aside` on the right), and the
    details (a bar, the week, a note) pinned to the bottom. */
function Card({
  label,
  action,
  value,
  aside,
  children,
  wide = false,
}: {
  label: string;
  action?: React.ReactNode;
  value: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`flex min-w-0 flex-col gap-2 rounded-lg bg-surface p-3 sm:gap-3 sm:p-4 ${wide ? "sm:col-span-2 xl:col-span-1" : ""}`}>
      <div className="flex h-5 items-center justify-between gap-2">
        <h3 className="truncate text-xs font-medium text-muted">{label}</h3>
        {action}
      </div>
      <div className="flex h-8 items-baseline justify-between gap-2">
        {value}
        {aside}
      </div>
      <div className="mt-auto flex flex-col gap-2 sm:gap-3">{children}</div>
    </section>
  );
}

/** The big number. Words inside it ("1 h 24 min") and the `unit` are small and muted, so every
    card's number reads at the same size. */
function Value({ value, unit }: { value: string | number; unit?: React.ReactNode }) {
  const parts = String(value).split(/([\d.:]+)/).filter(Boolean);
  return (
    <div className="whitespace-nowrap text-2xl font-semibold leading-8 tracking-tight tabular-nums">
      {parts.map((p, i) => (/^[\d.:]+$/.test(p) ? <span key={i}>{p}</span> : <span key={i} className="text-sm font-normal text-muted">{p}</span>))}
      {unit && <span className="text-sm font-normal text-muted"> {unit}</span>}
    </div>
  );
}

function Note({ children, warn = false, good = false }: { children: React.ReactNode; warn?: boolean; good?: boolean }) {
  return <p className={`text-xs ${warn ? "text-warning" : good ? "text-success" : "text-muted"}`}>{children}</p>;
}

/** A thin progress bar; green once it's full (`done`). */
function Bar({ frac, done = false }: { frac: number; done?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${frac * 100}%`, background: done ? "var(--success)" : "var(--accent)" }}
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
        <button type="button" onClick={onEdit} className={`-my-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground ${TOUCH_TEXT}`}>
          {goal > 0 ? "Change" : "Set a goal"}
        </button>
      }
      value={<Value value={Math.round(minutes)} unit={goal > 0 ? `/ ${goal} min` : "min"} />}
      aside={goal > 0 && <span className="text-xs font-medium tabular-nums text-muted">{Math.round(frac * 100)}%</span>}
    >
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

/** The week as seven bars, each on its own faint track so empty days still read as days; filled
    with the accent (green once the day's goal is hit), with the goal as a dashed line. */
function WeekBars({ week, today }: { week: { key: string; minutes: number; goal: number }[]; today: string }) {
  const max = Math.max(...week.map((d) => d.goal), ...week.map((d) => d.minutes), 1);
  const same = week.every((d) => d.goal === week[0].goal);
  const TRACK = 44;
  return (
    <div className="relative flex items-end gap-1.5">
      {same && week[0].goal > 0 && (
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-foreground/40" style={{ bottom: 18 + (week[0].goal / max) * TRACK }} />
      )}
      {week.map((d) => {
        const hit = d.goal > 0 && d.minutes >= d.goal;
        const future = d.key > today;
        const isToday = d.key === today;
        return (
          <div key={d.key} className="flex flex-1 flex-col items-center gap-1" title={`${WEEKDAY_LETTER[weekdayOf(d.key)]} · ${formatMinutesShort(Math.round(d.minutes))}`}>
            <div className={`relative w-full overflow-hidden rounded-sm ${future ? "bg-foreground/[0.04]" : "bg-foreground/[0.08]"}`} style={{ height: TRACK }}>
              {!same && d.goal > 0 && <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-foreground/40" style={{ bottom: `${(d.goal / max) * 100}%` }} />}
              {d.minutes > 0 && (
                <div
                  className={`absolute inset-x-0 bottom-0 rounded-sm transition-[height] duration-700 ${hit ? "bg-success" : "bg-accent"}`}
                  style={{ height: `${Math.max(10, (d.minutes / max) * 100)}%` }}
                />
              )}
            </div>
            <span className={`h-3.5 text-[11px] leading-[14px] ${isToday ? "font-semibold text-foreground" : "font-medium text-muted"}`}>{WEEKDAY_LETTER[weekdayOf(d.key)]}</span>
          </div>
        );
      })}
    </div>
  );
}
