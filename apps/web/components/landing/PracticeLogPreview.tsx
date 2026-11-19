"use client";

import { useMemo, useState } from "react";
import Celebrations, { FlameIcon, burstAt, celebrateNow, playTaskNote } from "@/components/practicelog/Celebrations";
import { ProgressCardView } from "@/components/practicelog/ProgressCard";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import { CheckIcon } from "@/components/tools";
import { type ProgressCard, CARD_WEEKS, cardStart } from "@/lib/practiceLog";

/**
 * The landing page's Shed Log demo: a real-feeling routine to tick off (the same burst, rising
 * notes and confetti as the app), the goal ring filling as you go, and a progress card drawn from
 * a made-up year of practice.
 */

const TASKS = [
  { title: "Long tones", minutes: 10 },
  { title: "Scales in all 12 keys", minutes: 15 },
  { title: "Autumn Leaves — learn the bridge", minutes: 20 },
];
const GOAL = 45;
const R = 30;
const C = 2 * Math.PI * R;

/** `celebrations`: render its own celebration layer (the landing page has no app-wide one). */
export function RoutineDemo({ celebrations = true }: { celebrations?: boolean }) {
  const [done, setDone] = useState<boolean[]>([false, false, false]);
  const minutes = TASKS.reduce((s, t, i) => s + (done[i] ? t.minutes : 0), 0);
  const count = done.filter(Boolean).length;
  const frac = Math.min(1, minutes / GOAL);
  // The same made-up user as the rest of the landing page (17 days once today's done).
  const streak = 16 + (count === TASKS.length ? 1 : 0);

  function toggle(i: number, el: Element) {
    const next = done.map((d, j) => (j === i ? !d : d));
    setDone(next);
    if (next[i]) {
      burstAt(el, "#10b981");
      playTaskNote(next.filter(Boolean).length);
      if (next.every(Boolean)) setTimeout(() => celebrateNow("Morning warm-up complete!", "All 3 tasks done — and that's 17 days in a row."), 250);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-foreground/[0.06] bg-surface p-4 shadow-[0_24px_60px_-28px_color-mix(in_srgb,var(--foreground)_40%,transparent)] sm:p-5">
      <div className="flex items-center gap-4">
        <div className="relative h-[72px] w-[72px] shrink-0">
          <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
            <circle cx="36" cy="36" r={R} fill="none" strokeWidth="8" className="stroke-background" />
            <circle
              cx="36"
              cy="36"
              r={R}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              stroke={frac >= 1 ? "#22c55e" : "var(--accent)"}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold tabular-nums">{Math.round(frac * 100)}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-extrabold tabular-nums">
            {minutes}
            <span className="text-base font-bold text-muted"> / {GOAL} min</span>
          </div>
          <div className={`text-xs font-semibold ${frac >= 1 ? "text-emerald-500" : "text-muted"}`}>{frac >= 1 ? "Goal smashed!" : "Today's goal — tick a task off"}</div>
        </div>
        <span
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-extrabold tabular-nums ${count ? "text-white" : "text-orange-500"}`}
          style={{ background: count ? "linear-gradient(160deg, #fb923c, #ef4444)" : "color-mix(in srgb, #f97316 14%, transparent)" }}
        >
          <FlameIcon className={`h-4 w-4 ${count ? "log-flame" : ""}`} /> {streak}
        </span>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl bg-background p-3">
        <div className="flex items-center gap-2.5">
          <RoutineIcon icon="sun" color={1} size="md" />
          <div className="min-w-0">
            <div className="font-bold">Morning warm-up</div>
            <div className="text-xs text-muted">Every weekday · 7:00 AM</div>
          </div>
          <span className="ml-auto text-xs font-semibold tabular-nums text-muted">
            {count}/{TASKS.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${(count / TASKS.length) * 100}%` }} />
        </div>
        {TASKS.map((t, i) => (
          <button key={t.title} type="button" onClick={(e) => toggle(i, e.currentTarget.firstElementChild!)} className="flex items-center gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-surface">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${done[i] ? "log-check border-transparent bg-emerald-500 text-white" : "border-surface-hover"}`}>
              {done[i] && <CheckIcon className="h-4 w-4" />}
            </span>
            <span className={`min-w-0 flex-1 font-medium ${done[i] ? "text-muted line-through" : ""}`}>{t.title}</span>
            <span className="text-xs text-muted">{t.minutes} min</span>
          </button>
        ))}
      </div>
      {celebrations && <Celebrations />}
    </div>
  );
}

/** A made-up year of fairly steady practice, getting steadier lately (a level per day). */
function demoLevels(n: number): string {
  let seed = 11;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let levels = "";
  for (let i = 0; i < n; i++) {
    const r = rnd();
    // The last 17 days all practised, after a day off: the 17-day streak shown across the page.
    levels += i >= n - 17 ? String(2 + Math.floor(r * 3)) : i === n - 18 || r < 0.22 ? "0" : String(1 + (Math.floor(r * 4) % 4));
  }
  return levels;
}

/** A progress card from a made-up year of fairly steady practice. */
export function DemoProgressCard() {
  const card = useMemo<ProgressCard>(() => {
    const now = new Date();
    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const n = (CARD_WEEKS - 1) * 7 + now.getDay() + 1;
    const levels = demoLevels(n);
    // Best: the longest run of practised days in the made-up year (at least today's 17).
    const best = Math.max(17, ...levels.split("0").map((run) => run.length));
    return { kind: "streak", range: "year", streak: 17, best, hours: 186, days: 281, rangeHours: 186, rangeDays: 281, start: cardStart("year", end), end, levels };
  }, []);
  return <ProgressCardView card={card} username="you" className="shadow-[0_24px_60px_-28px_rgba(0,0,0,0.6)]" />;
}
