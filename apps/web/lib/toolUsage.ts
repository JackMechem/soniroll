"use client";

import { useEffect, useMemo, useRef } from "react";
import { TOOL_USAGE_KEY, type ToolUsage, addUsage, todayKey, withLogged, withRetired } from "@jam-practice/core/toolUsage";
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
 * JSON-stringified, so the number of days doesn't run into Convex's field limit. The pure helpers
 * live in `packages/core/toolUsage.ts` (the phone app keeps the same log).
 */

export {
  type DayUsage,
  type ToolUsage,
  TOOL_USAGE_KEY,
  STREAK_MIN_MS,
  todayKey,
  usedMs,
  loggedMs,
  toolStreak,
  bestStreak,
  weekOf,
  totalMs,
  historyOf,
  withRetired,
} from "@jam-practice/core/toolUsage";

const DEFAULT_USAGE: { tools: ToolUsage } = { tools: {} };

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
  write((u) => addUsage(u, href, ms, day));
}

/** Marks a tool's day as logged into the Shed Log up to `ms` (and the same day of the tools it
    replaced, whose time it shows — see `withRetired`). */
export function markLogged(href: string, ms: number, day = todayKey()) {
  write((u) => withLogged(u, href, ms, day));
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
