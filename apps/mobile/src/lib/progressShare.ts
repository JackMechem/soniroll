import type { ProgressCardKind } from '@jam-practice/core/practiceLog';
import { useSyncExternalStore } from 'react';

/**
 * "Share your progress" can be asked for from anywhere — the Shed Log's header, the stat cards, a
 * day's report, a celebration toast — and opens one sheet mounted app-wide in `ShedLogGlobal`
 * (the phone's version of the website's `SHARE_PROGRESS_EVENT`).
 */

export type ProgressShareRequest = {
  /** A new one for every opening. */
  id: number;
  kind: ProgressCardKind;
  /** The day a day report is for (default today). */
  date?: string;
  /** Opened from the "everything done" toast: the sheet says so at the top. */
  celebrate?: boolean;
};

let current: ProgressShareRequest | null = null;
const listeners = new Set<() => void>();

function set(next: ProgressShareRequest | null) {
  current = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

let nextId = 1;

export function openProgressShare(request: Omit<ProgressShareRequest, 'id'>) {
  set({ ...request, id: nextId++ });
}

export function closeProgressShare() {
  set(null);
}

/** What's being shared right now, or null. */
export function useProgressShareRequest(): ProgressShareRequest | null {
  return useSyncExternalStore(subscribe, () => current);
}
