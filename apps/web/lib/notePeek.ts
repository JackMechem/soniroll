"use client";

import { type TaskRef, routineHref, taskHref } from "@/lib/shedLogPages";
import { type PaneDetach, openBeside } from "@/lib/useTilingLayout";

/**
 * Opening Shed Log pages and notes in the side view, like Notion's side peek. The side view is a
 * pane of split screen (`lib/useTilingLayout.ts`'s `openBeside`): over the page or beside it, full
 * screen, Back inside it, and on a phone a page of its own with Back. These turn a Shed Log thing
 * into its address and open it there.
 */

/** A routine's `date`: the day it's looked at from (its card for that day is on its page). */
export type SideItem = { kind: "note"; id: string } | ({ kind: "task" } & TaskRef) | { kind: "routine"; id: string; date?: string };

export type PeekDetach = PaneDetach;

/** Just the note, for the side view (`components/shednotes/NoteSidePane.tsx`). */
export function noteSideHref(noteId: string): string {
  return `/shed-notes?id=${encodeURIComponent(noteId)}&view=note`;
}

export function sideItemHref(item: SideItem): string {
  if (item.kind === "note") return noteSideHref(item.id);
  if (item.kind === "routine") return `${routineHref(item.id)}${item.date ? `&date=${encodeURIComponent(item.date)}` : ""}`;
  return taskHref(item);
}

/** Opens something in the side view. `from`: the pane it's opened from (`usePaneId()`) — from
    inside the side view it opens there, with Back. */
export function openSide(item: SideItem, detach: PeekDetach | null = null, from: string | null = null) {
  openBeside(sideItemHref(item), { from, detach });
}

/** Opens a note in the side view. `detach`: how to take it off what it's attached to. */
export function openNotePeek(noteId: string, detach: PeekDetach | null = null, from: string | null = null) {
  openSide({ kind: "note", id: noteId }, detach, from);
}
