"use client";

import { useEffect, useMemo, useRef } from "react";
import { RETIRED_TOOL_HREFS } from "@jam-practice/core/navLinks";
import { addDays, startOfWeek, toDateKey } from "@jam-practice/core/practiceLog";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/**
 * Each tool's own usage log: how long the tool actually ran on each day, and how much of that has
 * been logged into the Shed Log with the tool's "Log" button. It drives the stats pills on a tool
 * page (`components/toolstats/ToolStats.tsx`): the tool's streak, today, this week, in total.
 *
 * The time comes from `lib/toolTime.ts` (the same "the tool is running" signal the Shed Log used
 * to take automatically); this file only stores it. Works signed out (this device) and signed in
 * (the account), like every synced setting. Stored as `{ tools: { [href]: { [day]: [ms, loggedMs] } } }`
 * (one `tools` field, because synced settings keep only the fields their defaults name),
 * JSON-stringified, so the number of days doesn't run into Convex's field limit.
 */

export type DayUsage = [ms: number, loggedMs: number];
export type ToolUsage = Record<string, Record<string, DayUsage>>;

export const TOOL_USAGE_KEY = "jam-practice-tool-usage";
const DEFAULT_USAGE: { tools: ToolUsage } = { tools: {} };

/** A day counts toward a tool's streak with at least this much real use. */
export const STREAK_MIN_MS = 60_000;

export const todayKey = () => toDateKey(new Date());

export function usedMs(u: ToolUsage, href: string, day: string): number {
  return u[href]?.[day]?.[0] ?? 0;
}

export function loggedMs(u: ToolUsage, href: string, day: string): number {
  return u[href]?.[day]?.[1] ?? 0;
}

/** Days in a row with real use, ending today (or yesterday, if today has nothing yet). */
export function toolStreak(u: ToolUsage, href: string, today: string, liveMs = 0): number {
  const used = (k: string) => usedMs(u, href, k) + (k === today ? liveMs : 0) >= STREAK_MIN_MS;
  let key = used(today) ? today : addDays(today, -1);
  let n = 0;
  while (used(key) && n < 3650) {
    n++;
    key = addDays(key, -1);
  }
  return n;
}

export function bestStreak(u: ToolUsage, href: string): number {
  const days = Object.keys(u[href] ?? {})
    .filter((k) => usedMs(u, href, k) >= STREAK_MIN_MS)
    .sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const k of days) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

/** The seven days of the week containing `today`, with each day's use. */
export function weekOf(u: ToolUsage, href: string, today: string, liveMs = 0): { key: string; ms: number }[] {
  const start = startOfWeek(today);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(start, i);
    return { key, ms: usedMs(u, href, key) + (key === today ? liveMs : 0) };
  });
}

export function totalMs(u: ToolUsage, href: string): number {
  return Object.values(u[href] ?? {}).reduce((a, d) => a + d[0], 0);
}

/** The days with use, newest first. */
export function historyOf(u: ToolUsage, href: string): { key: string; ms: number; logged: number }[] {
  return Object.entries(u[href] ?? {})
    .filter(([, d]) => d[0] >= 1000)
    .map(([key, d]) => ({ key, ms: d[0], logged: d[1] }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

// ---------------------------------------------------------------- writing

type Change = (u: ToolUsage) => ToolUsage;
let writer: ((change: Change) => void) | null = null;
const waiting: Change[] = [];

/** Applies a change to the stored usage (queued until `useToolUsageWriter` is mounted). */
function write(change: Change) {
  if (writer) writer(change);
  else waiting.push(change);
}

/** Adds running time to a tool's day (called by `lib/toolTime.ts`). */
export function recordUsage(href: string, ms: number, day = todayKey()) {
  if (ms <= 0) return;
  write((u) => {
    const days = u[href] ?? {};
    const [prev, logged] = days[day] ?? [0, 0];
    return { ...u, [href]: { ...days, [day]: [prev + ms, logged] } };
  });
}

/** Marks a tool's day as logged into the Shed Log up to `ms` (and the same day of the tools it
    replaced, whose time it shows — see `withRetired`). */
export function markLogged(href: string, ms: number, day = todayKey()) {
  write((u) => {
    let out = u;
    for (const h of [href, ...Object.keys(RETIRED_TOOL_HREFS).filter((old) => RETIRED_TOOL_HREFS[old] === href)]) {
      const days = out[h] ?? {};
      if (h !== href && !days[day]) continue;
      const [used] = days[day] ?? [0, 0];
      out = { ...out, [h]: { ...days, [day]: [used, Math.min(used, ms)] } };
    }
    return out;
  });
}

/** Retired tools' days counted under the tool that replaced them (Bass Genius and the Drum
    Generator under Rhythm Section), so its streak and totals carry on. Read-only: nothing is moved
    in storage. */
export function withRetired(u: ToolUsage): ToolUsage {
  const retired = Object.entries(RETIRED_TOOL_HREFS).filter(([old]) => u[old]);
  if (!retired.length) return u;
  const out = { ...u };
  for (const [old, now] of retired) {
    const days = { ...(out[now] ?? {}) };
    for (const [day, [ms, logged]] of Object.entries(u[old])) {
      const [m, l] = days[day] ?? [0, 0];
      days[day] = [m + ms, l + logged];
    }
    out[now] = days;
  }
  return out;
}

/** The stored usage (signed out: this device; signed in: the account), and whether it's loaded. */
export function useToolUsage(): [ToolUsage, boolean] {
  const [stored, , ready] = useSyncedSettings(TOOL_USAGE_KEY, DEFAULT_USAGE);
  const tools = useMemo(() => withRetired(stored.tools), [stored.tools]);
  return [tools, ready];
}

/** Mounted once (`PracticeLogGlobal`): the one place usage is written from. */
export function useToolUsageWriter() {
  const [stored, update, ready] = useSyncedSettings(TOOL_USAGE_KEY, DEFAULT_USAGE);
  const latest = useRef(stored.tools);
  useEffect(() => {
    latest.current = stored.tools;
  }, [stored.tools]);
  useEffect(() => {
    if (!ready) return;
    writer = (change) => {
      latest.current = change(latest.current);
      update({ tools: latest.current });
    };
    for (const c of waiting.splice(0)) writer(c);
    return () => {
      writer = null;
    };
  }, [ready, update]);
}
