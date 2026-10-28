"use client";

import { useEffect, useSyncExternalStore } from "react";
import { NAV_LINKS } from "@/components/tools";
import { queueLogEntry } from "@/lib/practiceTimerEngine";
import { loggedMs, markLogged, recordUsage, todayKey, usedMs, type ToolUsage } from "@/lib/toolUsage";
import { trackToolStart, trackToolTime } from "@/lib/usage";

/**
 * Counts the time a tool is actually running — the Metronome playing, an ear-training round
 * going, the Tuner listening, Bass Genius or the Drum Generator playing, a take recording… — not
 * just its page being open. Each tool says when it's running (`useToolActivity`);
 * `useToolTimeTracker` (mounted once, app-wide) adds up the time.
 *
 * Where the time goes:
 * - Always into the tool's own usage log (`lib/toolUsage.ts`), which drives the stats pills on
 *   the tool's page (its streak, today, this week, in total).
 * - Into the Shed Log: for tools with the stats pills (`LOG_BY_BUTTON`), only when you press the
 *   tool's "Log" button (`logToolToday`); for the others, still automatically, a minute at a time
 *   and when the tool stops (merged into one entry per tool per sitting, `applyTimerEntries`),
 *   while the Shed Log's "Count time in tools" is on.
 *
 * Time counts while the tool is running even in a background tab, unless it asked for
 * `visibleOnly`.
 */

/** Tools whose time reaches the Shed Log only through their "Log" button (and that show the
    stats pills): every tool that reports running time. (The Practice Timer logs itself.) */
export const LOG_BY_BUTTON = new Set<string>([
  "/jam-practice",
  "/bass-genius",
  "/note-trainer",
  "/scale-trainer",
  "/interval-trainer",
  "/guess-the-interval",
  "/guess-the-chord",
  "/guess-the-progression",
  "/metronome",
  "/random-metric-modulation",
  "/tempo-trainer",
  "/tuner",
  "/slow-downer",
  "/recorder",
  "/random-sticking-warmup",
  "/drum-generator",
  "/syncopation",
  "/time-test",
]);

/** Tools that keep their own options look (stats and Log button, but not the reward look). */
export const PLAIN_OPTIONS = new Set<string>(["/bass-genius", "/drum-generator", "/syncopation", "/random-sticking-warmup"]);

type Active = { since: number; visibleOnly: boolean };

const active = new Map<string, Active>();
const TICK_MS = 5000;
const USAGE_FLUSH_MS = 30000;
const LOG_FLUSH_MS = 60000;
const pendingUsage = new Map<string, number>();
const pendingLog = new Map<string, number>();
let lastTick = Date.now();

function labelOf(href: string) {
  return NAV_LINKS.find((l) => l.href === href)?.label ?? href;
}

function accumulate() {
  const now = Date.now();
  const dt = Math.min(now - lastTick, TICK_MS * 2);
  lastTick = now;
  const visible = typeof document === "undefined" || document.visibilityState === "visible";
  for (const [href, a] of active) {
    if (a.visibleOnly && !visible) continue;
    pendingUsage.set(href, (pendingUsage.get(href) ?? 0) + dt);
    if (!LOG_BY_BUTTON.has(href)) pendingLog.set(href, (pendingLog.get(href) ?? 0) + dt);
  }
}

function flushUsage(href?: string) {
  for (const [h, ms] of pendingUsage) {
    if (href && h !== href) continue;
    recordUsage(h, ms);
    pendingUsage.delete(h);
  }
}

function flushLog(href?: string) {
  for (const [h, ms] of pendingLog) {
    if (href && h !== href) continue;
    if (autoLog && ms >= 1000) queueLogEntry({ at: Date.now(), ms, done: true, session: labelOf(h), title: labelOf(h), segmentId: `tool:${h}` });
    pendingLog.delete(h);
  }
}

/** Whether running time goes into the Shed Log automatically (signed in, "Count time in tools"
    on) — only for a tool not in `LOG_BY_BUTTON` (none today; kept for new tools). */
let autoLog = false;

/** Marks a tool as running (or not). Call from the tool's component with its running state. */
export function useToolActivity(href: string, running: boolean, { visibleOnly = false }: { visibleOnly?: boolean } = {}) {
  useEffect(() => {
    if (!running) return;
    accumulate();
    const started = Date.now();
    trackToolStart(href);
    active.set(href, { since: started, visibleOnly });
    emit();
    return () => {
      trackToolTime(href, Date.now() - started);
      accumulate();
      active.delete(href);
      flushUsage(href);
      flushLog(href);
      emit();
    };
  }, [href, running, visibleOnly]);
}

/** Adds up running tools' time and hands it on. Mounted once (`PracticeLogGlobal`); `autoLogOn`
    is whether the Shed Log takes the button-less tools' time automatically. */
export function useToolTimeTracker(autoLogOn: boolean) {
  useEffect(() => {
    autoLog = autoLogOn;
    if (!autoLogOn) pendingLog.clear();
  }, [autoLogOn]);
  useEffect(() => {
    lastTick = Date.now();
    const id = setInterval(() => {
      accumulate();
      for (const [h, ms] of pendingUsage) if (ms >= USAGE_FLUSH_MS) flushUsage(h);
      for (const [h, ms] of pendingLog) if (ms >= LOG_FLUSH_MS) flushLog(h);
    }, TICK_MS);
    const onHide = () => {
      accumulate();
      flushUsage();
      flushLog();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", onHide);
      accumulate();
      flushUsage();
      flushLog();
    };
  }, []);
}

// ---------------------------------------------------------------- live time, for the stats pills

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

/** Time a tool has run that isn't stored yet (counted, plus the running stretch since the last tick). */
function unstoredMs(href: string): number {
  const a = active.get(href);
  const running = a && !(a.visibleOnly && typeof document !== "undefined" && document.visibilityState !== "visible");
  return (pendingUsage.get(href) ?? 0) + (running ? Math.max(0, Date.now() - lastTick) : 0);
}

let ticker: ReturnType<typeof setInterval> | null = null;
function subscribeLive(listener: () => void) {
  listeners.add(listener);
  ticker ??= setInterval(() => active.size && emit(), 1000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

/** A tool's not-yet-stored time, to the second, ticking while it runs; and whether it's running. */
export function useLiveToolTime(href: string): { liveMs: number; running: boolean } {
  const liveMs = useSyncExternalStore(
    subscribeLive,
    () => Math.floor(unstoredMs(href) / 1000) * 1000,
    () => 0,
  );
  const running = useSyncExternalStore(
    subscribeLive,
    () => active.has(href),
    () => false,
  );
  return { liveMs, running };
}

/** Today's time in a tool that isn't in the Shed Log yet. */
export function unloggedToday(usage: ToolUsage, href: string, liveMs: number): number {
  const day = todayKey();
  return Math.max(0, usedMs(usage, href, day) + liveMs - loggedMs(usage, href, day));
}

/** The "Log" button: puts today's not-yet-logged time in the tool into the Shed Log (as that
    tool's entry, adding to the day's practice time) and returns how much that was. */
export function logToolToday(usage: ToolUsage, href: string): number {
  accumulate();
  const live = pendingUsage.get(href) ?? 0;
  const ms = unloggedToday(usage, href, live);
  flushUsage(href);
  if (ms < 1000) return 0;
  queueLogEntry({ at: Date.now(), ms, done: true, session: labelOf(href), title: labelOf(href), segmentId: `tool:${href}` });
  markLogged(href, Number.POSITIVE_INFINITY);
  emit();
  return ms;
}
