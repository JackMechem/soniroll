"use client";

import { useSyncExternalStore } from "react";

/**
 * A short notice at the bottom of the screen ("Closed 3 tabs · Undo"), shown by
 * `components/Notice.tsx` (mounted once by `AppShell`). One at a time: a new one replaces the
 * last. It goes away by itself after a few seconds, or when its action or × is pressed.
 *
 *     showNotice("Moved to Etudes");
 *     showNotice("Closed 3 tabs", { action: { label: "Undo", run: undo } });
 */

export type NoticeAction = { label: string; run: () => void };
export type Notice = { id: number; text: string; action?: NoticeAction };

let current: Notice | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function showNotice(text: string, { action, ms }: { action?: NoticeAction; ms?: number } = {}) {
  seq += 1;
  current = { id: seq, text, ...(action ? { action } : {}) };
  if (timer) clearTimeout(timer);
  const id = seq;
  timer = setTimeout(() => dismissNotice(id), ms ?? (action ? 7000 : 4000));
  emit();
}

/** Puts the notice away (only that one, if `id` is given). */
export function dismissNotice(id?: number) {
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  if (timer) clearTimeout(timer);
  timer = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotice(): Notice | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
