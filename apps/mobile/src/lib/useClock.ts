import { toDateKey } from '@jam-practice/core/practiceLog';
import { useSyncExternalStore } from 'react';

/**
 * The time, for screens that show a running clock or need to know what day it is — read from a
 * shared ticker rather than `Date.now()` while rendering (React wants renders pure). `useNow` ticks
 * every second while `active`, `useNowCoarse` every 30 seconds; `useToday` is today's `YYYY-MM-DD`
 * and changes at midnight.
 */

function createTicker(ms: number) {
  let now = Date.now();
  let id: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(l: () => void) {
      listeners.add(l);
      if (id === null) {
        // Fresh as soon as someone's watching (the shared value may be from a while ago).
        now = Date.now();
        id = setInterval(() => {
          now = Date.now();
          for (const x of listeners) x();
        }, ms);
        queueMicrotask(() => {
          for (const x of listeners) x();
        });
      }
      return () => {
        listeners.delete(l);
        if (!listeners.size && id !== null) {
          clearInterval(id);
          id = null;
        }
      };
    },
    get: () => now,
  };
}

const seconds = createTicker(1000);
const minutes = createTicker(30000);
const still = () => () => {};

/** The time now (ms), ticking each second while `active`. */
export function useNow(active = true): number {
  return useSyncExternalStore(active ? seconds.subscribe : still, seconds.get);
}

/** The time now (ms), updated every 30 seconds — for "is it on now?" checks. */
export function useNowCoarse(): number {
  return useSyncExternalStore(minutes.subscribe, minutes.get);
}

/** Today's date key, which moves on at midnight. */
export function useToday(): string {
  return useSyncExternalStore(minutes.subscribe, () => toDateKey(new Date(minutes.get())));
}
