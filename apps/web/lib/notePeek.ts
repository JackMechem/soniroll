"use client";

import { useSyncExternalStore } from "react";

/**
 * The note side view (`components/shednotes/NotePeek.tsx`): a Shed Note opened beside the page,
 * like Notion's side peek. Which note is open (and the notes opened before it from its links, for
 * Back) lives here so anything can open one (`openNotePeek`); how it sits — over the page or
 * pushing it over — and its width are this device's preference, kept in localStorage.
 */

export type PeekMode = "overlay" | "push";

/** Taking the note off what it was opened from (an attached note), shown in the view's menu. */
export type PeekDetach = { label: string; run: () => void };

type PeekState = { noteId: string | null; back: string[]; detach: PeekDetach | null };
type PeekPrefs = { mode: PeekMode; width: number };

const PREFS_KEY = "jam-practice-note-peek";
export const PEEK_MIN_WIDTH = 360;
export const PEEK_MAX_WIDTH = 900;
const DEFAULT_PREFS: PeekPrefs = { mode: "overlay", width: 520 };

let state: PeekState = { noteId: null, back: [], detach: null };
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

/** Opens a note in the side view. `detach`: how to take it off what it's attached to, when it was
    opened from there. */
export function openNotePeek(noteId: string, detach: PeekDetach | null = null) {
  state = { noteId, back: [], detach };
  notify();
}

/** Opens another note in the same view (a link in it); Back returns to this one. */
export function followNotePeek(noteId: string) {
  if (!state.noteId || state.noteId === noteId) return openNotePeek(noteId);
  state = { noteId, back: [...state.back, state.noteId].slice(-20), detach: null };
  notify();
}

export function peekBack() {
  const prev = state.back[state.back.length - 1];
  if (!prev) return;
  state = { noteId: prev, back: state.back.slice(0, -1), detach: null };
  notify();
}

export function closeNotePeek() {
  if (!state.noteId) return;
  state = { noteId: null, back: [], detach: null };
  notify();
}

const SERVER_STATE: PeekState = { noteId: null, back: [], detach: null };

export function useNotePeek(): PeekState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

export function useNotePeekPrefs(): PeekPrefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
}
