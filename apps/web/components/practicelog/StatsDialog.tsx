"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Momentum from "@/components/practicelog/Momentum";
import { formatPracticed } from "@/components/practicelog/minutes";
import { HeatGrid } from "@/components/practicelog/TodayPractice";
import { CloseIcon } from "@/components/tools";
import { type PracticeLogData, type PracticeLogPrefs, type ProgressCardKind, addDays, bestStreak, lifetimeMinutes, minutesOn } from "@/lib/practiceLog";

/** All the stats in one place: the goal / streak / week / hours panels, the last months as a
    grid of days, and a few more numbers in a list. */
export default function StatsDialog({
  data,
  today,
  onPrefs,
  onShare,
  onClose,
}: {
  data: PracticeLogData;
  today: string;
  onPrefs: (patch: Partial<PracticeLogPrefs>) => void;
  onShare: (kind: ProgressCardKind) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const monthStart = `${today.slice(0, 8)}01`;
  let month = 0;
  for (let k = monthStart; k <= today; k = addDays(k, 1)) month += minutesOn(data, k);
  const practicedDays = Object.keys(data.days).filter((k) => minutesOn(data, k) > 0);
  const total = lifetimeMinutes(data);
  const numbers: [string, string][] = [
    ["This month", formatPracticed(month)],
    ["Best streak", `${bestStreak(data)} day${bestStreak(data) === 1 ? "" : "s"}`],
    ["Days practiced", String(practicedDays.length)],
    ["Average practice day", practicedDays.length ? formatPracticed(total / practicedDays.length) : "—"],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-overlay p-2 pt-[4vh] sm:p-4 sm:pt-[6vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Your stats"
        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-background text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-foreground/10 bg-surface px-4 sm:px-5">
          <h2 className="text-base font-semibold">Your stats</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-5">
          <Momentum data={data} today={today} onPrefs={onPrefs} onShare={onShare} browseWeeks />
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
            <HeatGrid className="lg:col-span-7" />
            <section className="flex min-w-0 flex-col rounded-lg bg-surface lg:col-span-5">
              <h3 className="flex h-11 shrink-0 items-center px-4 text-sm font-medium">Summary</h3>
              <dl className="flex-1 divide-y divide-foreground/10">
                {numbers.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <dt className="text-sm text-muted">{label}</dt>
                    <dd className="text-sm font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
