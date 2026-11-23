"use client";

import type { StoredKind } from "@/lib/files";
import { fileKind } from "@/lib/files";
import { type BesideMode, openBeside } from "@/lib/useTilingLayout";

/**
 * One of your own files as a page of its own (`/files/view?kind=…&id=…`,
 * `components/files/FileViewPage.tsx`), which a split-screen pane or the side view can show — so a
 * PDF can stay open beside the Metronome, a task, or anything else.
 */

export function fileViewHref(kind: StoredKind, id: string): string {
  return `/files/view?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;
}

/** The Files page, open on a folder or a tag. */
export function filesHref({ folder, tag }: { folder?: string; tag?: string } = {}): string {
  if (folder) return `/tunes?tab=files&folder=${encodeURIComponent(folder)}`;
  if (tag) return `/tunes?tab=files&tag=${encodeURIComponent(tag)}`;
  return "/tunes?tab=files";
}

/** Whether a file opens beside the page by default (PDFs: read them while a tool runs). */
export function opensBeside(file: { mimeType: string; name: string }): boolean {
  return fileKind(file.mimeType, file.name) === "pdf";
}

/** Opens a file in the side view (`mode` "side", the default) or as a split. `from`: the pane it's
    opened from (`usePaneId()`). False when it couldn't (then open it some other way). */
export function openFileBeside(kind: StoredKind, id: string, { mode = "side", from = null }: { mode?: BesideMode; from?: string | null } = {}): boolean {
  return openBeside(fileViewHref(kind, id), { mode, from });
}
