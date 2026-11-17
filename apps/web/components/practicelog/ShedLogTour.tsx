"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FlameIcon } from "@/components/practicelog/Celebrations";
import RoutineIcon, { ChartIcon } from "@/components/practicelog/RoutineIcon";
import { CheckIcon, CloseIcon, EarIcon, HelpIcon, MetronomeIcon, PlayIcon, ShareIcon, StopwatchIcon, TunerIcon } from "@/components/tools";

/**
 * "How the Shed Log works" — five slides, each mostly a little picture of the thing with one line
 * under it. Shown once, the first time you open the Shed Log (remembered on this device), and any
 * time from the ? next to its title.
 */

const SEEN_KEY = "jam-practice-shed-log-tour-seen";

export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // storage unavailable
  }
}

const GREEN = ["#0e4429", "#006d32", "#26a641", "#39d353"];

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="flex h-56 w-full items-center justify-center overflow-hidden rounded-lg bg-background p-4 sm:h-64">{children}</div>;
}

function Tick({ done, color = "#10b981" }: { done?: boolean; color?: string }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${done ? "log-check border-transparent text-white" : "border-foreground/25"}`} style={done ? { background: color } : undefined}>
      {done && <CheckIcon className="h-3.5 w-3.5" />}
    </span>
  );
}

const SLIDES: { title: string; line: string; art: React.ReactNode }[] = [
  {
    title: "Plan routines",
    line: "Tasks with minutes, on the days you pick. Add one-off tasks to any day.",
    art: (
      <div className="w-full max-w-xs rounded-lg bg-surface p-3">
        <div className="mb-2 flex items-center gap-2">
          <RoutineIcon icon="sun" color={1} size="md" />
          <div>
            <div className="text-sm font-medium">Morning warm-up</div>
            <div className="text-[11px] text-muted">Mon · Wed · Fri · 7:00 AM</div>
          </div>
        </div>
        {["Long tones", "Scales", "Learn a tune"].map((t, i) => (
          <div key={t} className="flex items-center gap-2 py-1 text-sm">
            <Tick />
            <span className="flex-1">{t}</span>
            <span className="text-[11px] text-muted">{[10, 15, 20][i]} min</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Check off or time it",
    line: "Tick a task to log its minutes — or press play and let the timer check it off.",
    art: (
      <div className="flex w-full max-w-xs flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface p-2.5 text-sm">
          <Tick done />
          <span className="flex-1 text-muted line-through">Long tones</span>
          <span className="text-xs font-medium tabular-nums text-muted">+10 min</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-surface p-2.5">
          <span className="relative flex h-12 w-12 items-center justify-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" className="stroke-foreground/10" />
              <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" stroke="var(--accent)" strokeLinecap="round" strokeDasharray="94" strokeDashoffset="38" />
            </svg>
            <span className="text-[11px] font-semibold tabular-nums">9:12</span>
          </span>
          <span className="flex-1 text-sm font-medium">Scales</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <PlayIcon className="h-4 w-4" />
          </span>
        </div>
      </div>
    ),
  },
  {
    title: "One timer for the day",
    line: "The day timer adds up everything — routines, tasks, and any tool you play with.",
    art: (
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-2">
          {[MetronomeIcon, EarIcon, TunerIcon].map((I, i) => (
            <span key={i} className="flex h-10 w-10 items-center justify-center rounded-md bg-surface text-muted">
              <I className="h-5 w-5" />
            </span>
          ))}
        </div>
        <span className="text-lg text-muted">↓</span>
        <div className="flex items-center gap-2.5 rounded-lg bg-surface px-4 py-2.5">
          <StopwatchIcon className="h-5 w-5 animate-pulse text-accent" />
          <span className="text-2xl font-semibold tabular-nums">42:18</span>
        </div>
      </div>
    ),
  },
  {
    title: "Hit your goal, keep the streak",
    line: "Reach your goal every day. Green days are done, red ones were missed.",
    art: (
      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        <div className="flex w-full max-w-[16.5rem] flex-col gap-2 rounded-lg bg-surface p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium tabular-nums">
              30 <span className="font-normal text-muted">/ 30 min</span>
            </span>
            <span className="flex items-center gap-1 font-medium tabular-nums">
              <FlameIcon className="log-flame h-4 w-4 text-orange-500" /> 12
            </span>
          </div>
          <span className="h-1.5 w-full rounded-full bg-emerald-500" />
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {["g", "g", "r", "g", "g", "g", "t"].map((k, i) => (
            <span
              key={i}
              className={`flex h-8 w-8 items-center justify-center rounded-md text-white ${k === "t" ? "ring-2 ring-accent" : ""}`}
              style={{ background: k === "g" ? "#22c55e" : k === "r" ? "#ef4444" : "var(--surface)" }}
            >
              {k === "g" ? <CheckIcon className="h-4 w-4" /> : k === "r" ? <CloseIcon className="h-4 w-4" /> : null}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Look back and share",
    line: "See every day on the calendar, your stats, and share a progress card.",
    art: (
      <div className="flex w-full max-w-xs flex-col gap-2 rounded-lg p-3" style={{ background: "linear-gradient(135deg, #0b1120, #1e1b4b)" }}>
        <div className="flex items-center justify-between text-white">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <ChartIcon className="h-4 w-4" /> 186 hours
          </span>
          <ShareIcon className="h-4 w-4 opacity-70" />
        </div>
        <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
          {Array.from({ length: 7 * 16 }, (_, i) => {
            const r = (Math.sin(i * 12.9898) * 43758.5453) % 1;
            const lv = Math.abs(r) < 0.2 ? -1 : Math.floor(Math.abs(r) * 4);
            return <span key={i} className="h-3 w-3 rounded-[2px]" style={{ background: lv < 0 ? "rgba(255,255,255,0.08)" : GREEN[lv] }} />;
          })}
        </div>
      </div>
    ),
  },
];

/** The tour itself. */
export default function ShedLogTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const close = () => {
    markSeen();
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setI((n) => Math.min(SLIDES.length - 1, n + 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const slide = SLIDES[i];
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-4" onClick={close}>
      <div role="dialog" aria-label="How the Shed Log works" className="log-toast flex w-full max-w-md flex-col gap-4 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 text-foreground shadow-2xl shadow-black/20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-medium tabular-nums text-muted">
            {i + 1} / {SLIDES.length}
          </span>
          <Link href="/help?topic=shed-log" onClick={close} className="ml-auto flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground">
            <HelpIcon className="h-4 w-4" /> Full guide
          </Link>
          <button type="button" onClick={close} aria-label="Close" className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div key={i} className="settings-pop">
          <Frame>{slide.art}</Frame>
        </div>
        <div className="text-center">
          <h2 className="text-base font-semibold">{slide.title}</h2>
          <p className="mt-1 text-sm text-muted">{slide.line}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover disabled:invisible">
            Back
          </button>
          <div className="flex gap-1.5">
            {SLIDES.map((_, j) => (
              <button key={j} type="button" onClick={() => setI(j)} aria-label={`Slide ${j + 1}`} className={`h-1.5 rounded-full transition-all ${j === i ? "w-5 bg-foreground" : "w-1.5 bg-foreground/20"}`} />
            ))}
          </div>
          <button type="button" onClick={() => (last ? close() : setI(i + 1))} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            {last ? "Let's go" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
