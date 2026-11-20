import { api } from '@jam-practice/convex/_generated/api';
import { NAV_LINKS_DATA, currentToolHref } from '@jam-practice/core/navLinks';
import { loggedMs, todayKey, usedMs, type ToolUsage } from '@jam-practice/core/toolUsage';
import { useMutation } from 'convex/react';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { queueLogEntry } from '@/lib/practiceLogQueue';
import { markLogged, recordUsage } from '@/lib/toolUsage';

/**
 * Time in tools on the phone — the native sibling of the website's `lib/toolTime.ts`. It counts
 * the time a tool is actually **running** (the Metronome playing, a trainer's round going, the
 * Tuner listening, a take recording…), not just its screen being open. Each tool screen says when
 * it's running with one line, `useToolActivity('/metronome', playing)`; `useToolTimeTracker`
 * (mounted once, `components/shedLog/ShedLogGlobal.tsx`) adds the time up.
 *
 * Where the time goes, as on the website:
 * - Into the tool's own usage log (`lib/toolUsage.ts`, synced): its streak, today, this week.
 * - Into the Shed Log only when you log it (`logToolToday` — the website's per-tool Log button; on
 *   the phone it's the Shed Log's "Time in tools" card). Every tool is "log by button" on the
 *   website now, so nothing is added to the Shed Log by itself. The Practice Timer logs itself.
 * - The anonymous usage counts (`packages/convex/usage.ts`: a tool started, and for how long; no
 *   account or device id; the server skips admins).
 */

const TICK_MS = 5000;
const USAGE_FLUSH_MS = 30000;

const active = new Set<string>();
const pendingUsage = new Map<string, number>();
let lastTick = Date.now();

/** A tool's name (a retired tool's replacement's), for its Shed Log entry. */
export function toolLabel(href: string) {
  const current = currentToolHref(href);
  return NAV_LINKS_DATA.find((l) => l.href === current)?.label ?? href;
}

function accumulate() {
  const now = Date.now();
  // A long gap (the app asleep in the background) isn't counted in one go, as on the website.
  const dt = Math.min(now - lastTick, TICK_MS * 2);
  lastTick = now;
  for (const href of active) pendingUsage.set(href, (pendingUsage.get(href) ?? 0) + dt);
}

function flushUsage(href?: string) {
  for (const [h, ms] of pendingUsage) {
    if (href && h !== href) continue;
    recordUsage(h, ms);
    pendingUsage.delete(h);
  }
}

// ---------------------------------------------------------------- anonymous usage counts

type UsageEvent = { kind: 'play' | 'time'; key: string; n: number; ms: number };
const usageQueue = new Map<string, UsageEvent>();

function count(kind: UsageEvent['kind'], key: string, n: number, ms: number) {
  const id = `${kind}|${key}`;
  const e = usageQueue.get(id) ?? { kind, key, n: 0, ms: 0 };
  e.n += n;
  e.ms += ms;
  usageQueue.set(id, e);
}

function drainUsage(): UsageEvent[] {
  const events = [...usageQueue.values()].slice(0, 40);
  for (const e of events) usageQueue.delete(`${e.kind}|${e.key}`);
  return events;
}

// ---------------------------------------------------------------- the hooks

/** Marks a tool as running (or not). Call from the tool's screen with its running state. */
export function useToolActivity(href: string, running: boolean) {
  useEffect(() => {
    if (!running) return;
    accumulate();
    const started = Date.now();
    count('play', href, 1, 0);
    active.add(href);
    emit();
    return () => {
      const ms = Date.now() - started;
      if (ms >= 1000) count('time', href, 0, Math.min(ms, 4 * 3_600_000));
      accumulate();
      active.delete(href);
      flushUsage(href);
      emit();
    };
  }, [href, running]);
}

/** Adds up running tools' time and hands it on; sends the anonymous counts. Mounted once. */
export function useToolTimeTracker() {
  const track = useMutation(api.usage.track);
  useEffect(() => {
    const send = () => {
      const events = drainUsage();
      if (events.length) void track({ events }).catch(() => {});
    };
    lastTick = Date.now();
    const id = setInterval(() => {
      accumulate();
      for (const [h, ms] of pendingUsage) if (ms >= USAGE_FLUSH_MS) flushUsage(h);
    }, TICK_MS);
    const sendId = setInterval(send, 30000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        lastTick = Date.now();
        return;
      }
      accumulate();
      flushUsage();
      send();
    });
    return () => {
      clearInterval(id);
      clearInterval(sendId);
      sub.remove();
      accumulate();
      flushUsage();
      send();
    };
  }, [track]);
}

// ---------------------------------------------------------------- live time

const listeners = new Set<() => void>();
const activeListeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
  for (const l of activeListeners) l();
}

/** Tells `listener` when the set of running tools may have changed (`lib/nowPlaying.ts`). */
export function subscribeActiveTools(listener: () => void) {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

/** The tools running right now whose screens are open (`useToolActivity`). */
export function activeToolHrefs(): string[] {
  return [...active];
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

/** A tool's not-yet-stored time (counted, plus the running stretch since the last tick). */
function unstoredMs(href: string): number {
  return (pendingUsage.get(href) ?? 0) + (active.has(href) ? Math.max(0, Date.now() - lastTick) : 0);
}

/** Every tool's not-yet-stored time, to the second (ticking while one runs). */
export function useLiveToolTimes(): Record<string, number> {
  const key = useSyncExternalStore(subscribeLive, () =>
    [...new Set([...pendingUsage.keys(), ...active])].map((h) => `${h}=${Math.floor(unstoredMs(h) / 1000) * 1000}`).join('|'),
  );
  return Object.fromEntries(
    key
      .split('|')
      .filter(Boolean)
      .map((p) => {
        const i = p.lastIndexOf('=');
        return [p.slice(0, i), Number(p.slice(i + 1))];
      }),
  );
}

/** Today's time in a tool that isn't in the Shed Log yet. */
export function unloggedToday(usage: ToolUsage, href: string, liveMs: number): number {
  const day = todayKey();
  return Math.max(0, usedMs(usage, href, day) + liveMs - loggedMs(usage, href, day));
}

/** Puts today's not-yet-logged time in a tool into the Shed Log (as that tool's entry, adding to
    the day's practice time) and returns how much that was. */
export function logToolToday(usage: ToolUsage, href: string): number {
  accumulate();
  const live = pendingUsage.get(href) ?? 0;
  const ms = unloggedToday(usage, href, live);
  flushUsage(href);
  if (ms < 1000) return 0;
  queueLogEntry({ at: Date.now(), ms, done: true, session: toolLabel(href), title: toolLabel(href), segmentId: `tool:${href}` });
  markLogged(href, Number.POSITIVE_INFINITY);
  emit();
  return ms;
}
