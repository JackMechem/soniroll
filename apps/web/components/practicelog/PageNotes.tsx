"use client";

import { useMutation } from "convex/react";
import type { EditorView } from "@codemirror/view";
import { useEffect, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import type { NoteTarget } from "@jam-practice/core/shedNotes";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAttachedNotes } from "@/components/shednotes/AttachedNotes";
import NoteSurface from "@/components/shednotes/NoteSurface";
import { insertOnOwnLine } from "@/components/shednotes/fileEmbedSetup";
import { DocumentIcon, MaximizeIcon, PlusIcon } from "@/components/tools";
import { openNotePeek } from "@/lib/notePeek";
import { errorText } from "@/lib/useShedNotes";

/** What a page can do with its notes: add a line (a recording's player, a link), into the open
    editor when it's on the page, else straight to the saved note, or a new note if there's none. */
export type PageNotesHandle = { addLine: (line: string) => Promise<void> };

/**
 * A routine's or task's notes on its page: the note attached to it (a Shed Note, so it's in Shed
 * Notes too, with links and backlinks), written right here, with ⤢ to open it in the side view.
 * With none yet, "Start notes" makes one (`newTitle`, `newBody`). Any other notes attached to it are
 * listed under it and open in the side view.
 */
export default function PageNotes({
  target,
  targetKey,
  label,
  newTitle,
  newBody,
  onCreated,
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
  /** Filled with this page's `PageNotesHandle`. */
  handleRef?: React.MutableRefObject<PageNotesHandle | null>;
}) {
  const { notes } = useAttachedNotes(target);
  const create = useMutation(api.shedNotes.create);
  const appendLine = useMutation(api.shedNotes.appendLine);
  const [view, setView] = useState<EditorView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const main = notes?.[0];

  async function start(body = newBody?.() ?? "") {
    setBusy(true);
    setError(null);
    try {
      const made = await create({ title: newTitle, body, attach: { target: targetKey, label } });
      onCreated?.(made);
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
        if (view && main) {
          const end = view.state.doc.length;
          insertOnOwnLine(view, end, line);
        } else if (main) {
          await appendLine({ id: main.noteId as Id<"shedNotes">, line });
        } else {
          const base = newBody?.() ?? "";
          await start(`${base}${base && !base.endsWith("\n") ? "\n" : ""}${line}\n`);
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

  const others = notes.slice(1);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col overflow-hidden rounded-lg bg-surface">
        <NoteSurface
          key={main.noteId}
          noteId={main.noteId}
          fill={false}
          onOpenNote={(id) => openNotePeek(id)}
          onView={setView}
          headerEnd={
            <button
              type="button"
              onClick={() => openNotePeek(main.noteId)}
              aria-label="Open in the side view"
              title="Open in the side view"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <MaximizeIcon className="h-4 w-4" />
            </button>
          }
          footer={(saveState) => <p className="px-5 pb-3 text-xs text-muted">{saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : "Saving…"}</p>}
        />
      </div>
      {others.map((n) => (
        <button
          key={n.noteId}
          type="button"
          onClick={() => openNotePeek(n.noteId)}
          className="flex w-full items-start gap-2.5 rounded-md bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-hover"
        >
          <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{n.title}</span>
            <span className="line-clamp-2 text-xs text-muted">{n.snippet || "Empty note"}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
