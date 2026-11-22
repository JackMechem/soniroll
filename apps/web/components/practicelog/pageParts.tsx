"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import { ChevronRightIcon, DocumentIcon, PlusIcon } from "@/components/tools";
import type { Recording } from "@/lib/recordings";

/**
 * The pieces the routine and task pages are built from, so both read as one thing: a title with
 * its line of facts, a row of figures, sections with one kind of header, content on one kind of
 * fill (a soft tint that shows on the page and in the side view alike), and quiet empty states.
 */

/** A group of content: a soft fill, rounded, no border. */
export const FILL = "rounded-xl bg-foreground/[0.04]";
/** Rows inside a fill, split by hairlines. */
export const ROWS = `${FILL} flex flex-col divide-y divide-foreground/[0.06] overflow-hidden`;

export function PageTitle({ title, facts, actions }: { title: string; facts: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">{facts}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

/** A small button beside a title or a section's name (Edit, Share, Record). */
export const QUIET_BUTTON =
  "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50";

/** Figures for the whole time: days, minutes, takes. */
export function Stats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((s) => (
        <div key={s.label} className={`${FILL} flex flex-col gap-0.5 px-3.5 py-3`}>
          <dt className="order-2 text-xs text-muted">{s.label}</dt>
          <dd className="order-1 text-lg font-semibold tabular-nums leading-tight">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Nothing here yet: one quiet line, on the same fill as content. */
export function Quiet({ children }: { children: React.ReactNode }) {
  return <p className={`${FILL} px-4 py-3.5 text-sm text-muted`}>{children}</p>;
}

/** A page's recordings, newest first, one under the other (the player needs the width). */
export function RecordingList({ recordings, empty }: { recordings: Recording[]; empty: React.ReactNode }) {
  if (recordings.length === 0) return <Quiet>{empty}</Quiet>;
  return (
    <div className="flex flex-col gap-2">
      {[...recordings]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => (
          <RecordingCard key={r._id} recording={r} hidePlace className="bg-foreground/[0.04] rounded-xl px-4" />
        ))}
    </div>
  );
}

/** The text a note starts with, for its preview: headings, players and blank lines skipped. */
function previewOf(body: string): string {
  return body
    .split("\n")
    .filter((l) => l.trim() && !/^#{1,6}\s/.test(l) && !/^!\[[^\]\n]*\]\([^)]*\)\s*$/.test(l.trim()))
    .map((l) => l.replace(/^\s*([-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)/, "").replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, t, __, a) => a ?? t).replace(/[*_`~]/g, ""))
    .join(" ")
    .slice(0, 320);
}

/**
 * A page's note as a preview to open: the start of what's written in it (the first lines, not
 * its headings or players), how many recordings are in it and when it was last changed. Opens it
 * (in the side view). With no note yet, an inviting empty state that makes one.
 */
export function NotePreview({ noteId, onOpen, onStart, starting }: { noteId: string | null; onOpen: () => void; onStart: () => void; starting: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  const note = useQuery(api.shedNotes.get, isAuthenticated && noteId ? { id: noteId } : "skip");
  if (!noteId) {
    return (
      <button type="button" onClick={onStart} disabled={starting} className={`${FILL} group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-foreground/[0.07] disabled:opacity-60`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <PlusIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Start notes</span>
          <span className="block text-xs text-muted">What you&apos;re working on, what went well, what to try next. Recordings go in too.</span>
        </span>
      </button>
    );
  }
  const text = note ? previewOf(note.body) : "";
  const takes = note ? (note.body.match(/\(file:recording\//g) ?? []).length : 0;
  return (
    <button type="button" onClick={onOpen} className={`${FILL} group flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-foreground/[0.07]`}>
      <span className={`line-clamp-4 text-sm leading-relaxed ${text ? "" : "text-muted"}`}>{note === undefined ? " " : text || "Nothing written yet. Open the note to write."}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <DocumentIcon className="h-3.5 w-3.5" />
        <span className="truncate">{note?.title ?? "Note"}</span>
        {takes > 0 && <span className="shrink-0">· {takes} recording{takes === 1 ? "" : "s"}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-0.5 font-medium group-hover:text-foreground">
          Open <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      </span>
    </button>
  );
}
