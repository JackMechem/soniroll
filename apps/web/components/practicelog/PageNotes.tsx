"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import type { NoteTarget } from "@jam-practice/core/shedNotes";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAttachedNotes } from "@/components/shednotes/AttachedNotes";
import { ChevronRightIcon, DocumentIcon, PlusIcon } from "@/components/tools";
import { errorText } from "@/lib/useShedNotes";

/** What a page can do with its notes: add a line (a recording's player, a link) to the end of its
    note, or make the note with it when there's none yet. An open editor takes the line in
    (`NoteSurface` syncs the saved text). */
export type PageNotesHandle = { addLine: (line: string) => Promise<void> };

/**
 * A routine's or task's notes on its page: the notes attached to it (Shed Notes, so they're in
 * Shed Notes too, with links and backlinks), each a card with the start of its text. They're
 * written in the side view: a card opens it there (`onOpen`), never an editor on the page. With
 * none yet, "Start notes" makes one (`newTitle`, `newBody`) and opens it.
 */
export default function PageNotes({
  target,
  targetKey,
  label,
  newTitle,
  newBody,
  onCreated,
  onOpen,
  handleRef,
}: {
  target: NoteTarget;
  targetKey: string;
  /** Names the thing, for the note's "Attached to". */
  label: string;
  newTitle: string;
  newBody?: () => string;
  /** After a note is made (its id and title): a task's note gets linked from its routine's notes. */
  onCreated?: (note: { id: string; title: string }) => void;
  /** Opens a note (in the side view). */
  onOpen: (noteId: string) => void;
  /** Filled with this page's `PageNotesHandle`. */
  handleRef?: React.MutableRefObject<PageNotesHandle | null>;
}) {
  const { notes } = useAttachedNotes(target);
  const create = useMutation(api.shedNotes.create);
  const appendLine = useMutation(api.shedNotes.appendLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const main = notes?.[0];

  async function start(body = newBody?.() ?? "", open = true) {
    setBusy(true);
    setError(null);
    try {
      const made = await create({ title: newTitle, body, attach: { target: targetKey, label } });
      onCreated?.(made);
      if (open) onOpen(made.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      addLine: async (line) => {
        if (main) {
          await appendLine({ id: main.noteId as Id<"shedNotes">, line });
        } else {
          const base = newBody?.() ?? "";
          await start(`${base}${base && !base.endsWith("\n") ? "\n" : ""}${line}\n`, false);
        }
      },
    };
  });

  if (notes === undefined) return <LoadingSpinner />;
  if (!main) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg bg-surface p-4">
        <p className="text-sm text-muted">No notes yet. Write what you&apos;re working on, what went well, what to try next. Recordings you make here go in too.</p>
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          <PlusIcon className="h-4 w-4" /> Start notes
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {notes.map((n) => (
        <li key={n.noteId}>
          <button
            type="button"
            onClick={() => onOpen(n.noteId)}
            className="flex w-full items-start gap-3 rounded-lg bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-hover"
          >
            <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{n.title}</span>
              <span className="line-clamp-3 text-sm text-muted">{n.snippet || "Empty note — open it to write."}</span>
            </span>
            <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}
