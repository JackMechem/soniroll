"use client";

import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { DotsVerticalIcon, PauseIcon, PlayIcon, StopwatchIcon } from "@/components/tools";
import { discardDayTimer, pauseDayTimer, startDayTimer, unflushedMs, useDayTimer } from "@/lib/dayStopwatch";
import { getSnapshot as engineState, pause as pauseEngine } from "@/lib/practiceTimerEngine";
import { type PracticeLogData, minutesOn, todayKey } from "@/lib/practiceLog";

/** Pausing the day's practice pauses a routine or task the Practice Timer is running for the Shed
    Log too (otherwise its "Timing" kept going). Resuming that run restarts the day timer
    (`PracticeLogGlobal`). */
export function pauseDayPractice() {
  pauseDayTimer();
  const run = engineState();
  if (run && !run.paused && run.session.type === "custom" && run.session.link) pauseEngine();
}

/** "1:05:09", "23:10". */
export function formatStopwatch(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** The day timer's total for a day, ticking while it runs. */
export function useDayTimerMs(data: PracticeLogData, date: string): { ms: number; running: boolean; liveMs: number } {
  const { running, date: runningDate } = useDayTimer();
  const live = running && runningDate === date;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [live]);
  const liveMs = live ? unflushedMs() : 0;
  // The day's whole practice time: the day timer plus everything added onto it.
  return { ms: Math.round(minutesOn(data, date, liveMs) * 60000), running: live, liveMs };
}

/**
 * The day timer card: a stopwatch for the day's practice — start it whenever you sit down to
 * play; starting a routine starts it too, and it keeps going through routines and breaks between
 * them until you pause it. Today's can be started; another day's just shows its time.
 */
export default function DayTimer({ data, date, compact = false, onClear }: { data: PracticeLogData; date: string; compact?: boolean; onClear?: () => void }) {
  const { ms, running } = useDayTimerMs(data, date);
  const [confirming, setConfirming] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const isToday = date === todayKey();
  if (!isToday && ms === 0) return null;
  return (
    // Filled, no outline: the faint row fill inside a card (the dashboard's compact one), the card
    // fill on the page (the Shed Log's day panel); an accent tint while it runs.
    <div className={`flex items-center gap-3 ${running ? "bg-accent/10" : compact ? "bg-foreground/[0.05]" : "bg-surface"} ${compact ? "rounded-md px-3 py-2" : "rounded-lg px-4 py-3"}`}>
      <StopwatchIcon className={`h-5 w-5 shrink-0 ${running ? "animate-pulse text-accent" : "text-muted"}`} />
      <div className="min-w-0 flex-1">
        <div className={`font-semibold tabular-nums ${compact ? "text-lg" : "text-xl"}`}>{formatStopwatch(ms)}</div>
        <div className="text-xs text-muted">
          {running ? "Practiced today · timer running" : isToday ? (ms ? "Practiced today · timer paused" : "Day timer — start it when you sit down to play") : "Practiced this day"}
        </div>
      </div>
      {confirming && onClear && (
        <ConfirmDialog
          title="Clear this day's time?"
          message="All the time logged for this day goes: the day timer, time logged by hand, time on tasks and in tools. Tasks you checked off stay checked."
          confirmLabel="Clear time"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            if (running) discardDayTimer();
            onClear();
          }}
        />
      )}
      {isToday &&
        (running ? (
          <button type="button" onClick={pauseDayPractice} className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
            <PauseIcon className="h-4 w-4" /> Pause
          </button>
        ) : (
          <button type="button" onClick={startDayTimer} className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            <PlayIcon className="h-4 w-4" /> {ms ? "Resume" : "Start timer"}
          </button>
        ))}
      {/* Clearing the day's time is in ⋮, away from the main button (it still asks first). */}
      {onClear && ms > 0 && (
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu({
              x: rect.right - 208,
              y: rect.bottom + 4,
              items: [{ label: "Clear this day's time", danger: true, onSelect: () => setConfirming(true) }],
            });
          }}
          aria-label="Day timer options"
          title="More"
          className="-mr-2 shrink-0 rounded-md p-1.5 text-muted pointer-coarse:p-3 hover:bg-surface-hover hover:text-foreground"
        >
          <DotsVerticalIcon className="h-4 w-4" />
        </button>
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
