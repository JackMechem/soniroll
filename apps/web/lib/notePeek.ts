"use client";

import { useSyncExternalStore } from "react";
import type { TaskRef } from "@/lib/shedLogPages";

/**
 * The side view (`components/shednotes/NotePeek.tsx`), like Notion's side peek: a Shed Note, a
 * task's page or a routine's page open beside whatever page you're on, so the Shed Log stays in
 * sight. What's open (and what was open before it, for Back) lives here so anything can open one
 * (`openSide`, `openNotePeek`); `full` makes it cover the page (Back or ✕ returns to it). How it
 * sits — over the page or pushing it over — and its width are this device's preference, kept in
 * localStorage.
 */

export type PeekMode = "overlay" | "push";

export type SideItem = { kind: "note"; id: string } | ({ kind: "task" } & TaskRef) | { kind: "routine"; id: string };

/** Taking a note off what it was opened from (an attached note), shown in the view's menu. */
export type PeekDetach = { label: string; run: () => void };

type SideState = { item: SideItem | null; back: SideItem[]; detach: PeekDetach | null; full: boolean };
type PeekPrefs = { mode: PeekMode; width: number };

const PREFS_KEY = "jam-practice-note-peek";
export const PEEK_MIN_WIDTH = 360;
export const PEEK_MAX_WIDTH = 900;
const DEFAULT_PREFS: PeekPrefs = { mode: "overlay", width: 560 };
const CLOSED: SideState = { item: null, back: [], detach: null, full: false };

let state: SideState = CLOSED;
let prefs: PeekPrefs | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const clampPeekWidth = (w: number) => Math.round(Math.min(PEEK_MAX_WIDTH, Math.max(PEEK_MIN_WIDTH, w)));

function getPrefs(): PeekPrefs {
  if (prefs) return prefs;
  prefs = DEFAULT_PREFS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null");
    if (stored) {
      prefs = {
        mode: stored.mode === "push" ? "push" : "overlay",
        width: typeof stored.width === "number" ? clampPeekWidth(stored.width) : DEFAULT_PREFS.width,
      };
    }
  } catch {
    // ignore unreadable storage
  }
  return prefs;
}

export function setPeekPrefs(patch: Partial<PeekPrefs>) {
  prefs = { ...getPrefs(), ...patch };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable
  }
  notify();
}

const same = (a: SideItem, b: SideItem) => JSON.stringify(a) === JSON.stringify(b);

/** Opens something in the side view, in place of whatever was there. */
export function openSide(item: SideItem, detach: PeekDetach | null = null) {
  state = { item, back: [], detach, full: state.item ? state.full : false };
  notify();
}

/** Opens a note in the side view. `detach`: how to take it off what it's attached to. */
export function openNotePeek(noteId: string, detach: PeekDetach | null = null) {
  openSide({ kind: "note", id: noteId }, detach);
}

/** Opens something from inside the side view (a link, a task on a routine's page); Back returns. */
export function followSide(item: SideItem) {
  if (!state.item) return openSide(item);
  if (same(state.item, item)) return;
  state = { ...state, item, back: [...state.back, state.item].slice(-20), detach: null };
  notify();
}

/** Back: the thing open before this one, or (with nothing before it) closes the view. */
export function sideBack() {
  const prev = state.back[state.back.length - 1];
  if (!prev) return closeSide();
  state = { ...state, item: prev, back: state.back.slice(0, -1), detach: null };
  notify();
}

export function setSideFull(full: boolean) {
  if (!state.item || state.full === full) return;
  state = { ...state, full };
  notify();
}

export function closeSide() {
  if (!state.item) return;
  state = CLOSED;
  notify();
}

export function useSideView(): SideState {
  return useSyncExternalStore(subscribe, () => state, () => CLOSED);
}

export function useNotePeekPrefs(): PeekPrefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
}
