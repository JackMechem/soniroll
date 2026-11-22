"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { type NoteTarget, addRecordingToNote } from "@jam-practice/core/shedNotes";
import { NotePreview, ROWS } from "@/components/practicelog/pageParts";
import { useAttachedNotes } from "@/components/shednotes/AttachedNotes";
import { ChevronRightIcon, DocumentIcon } from "@/components/tools";
import { errorText } from "@/lib/useShedNotes";

/** What a page can do with its notes: put a recording's player in its note, under "## Recordings"
    (`addRecordingToNote`), or make the note with it when there's none yet. An open editor takes it
    in (`NoteSurface` syncs the saved text). */
export type PageNotesHandle = { addRecording: (line: string) => Promise<void> };

/**
 * A routine's or task's notes on its page: the notes attached to it (Shed Notes, so they're in
 * Shed Notes too, with links and backlinks): the main one as a preview of what's written in it
 * (`NotePreview`), any others as rows. They're written in the side view (`onOpen`), never on the
 * page. With none yet, "Start notes" makes one (`newTitle`, `newBody`) and opens it.
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
  const addRecording = useMutation(api.shedNotes.addRecording);
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
      addRecording: async (line) => {
        if (main) await addRecording({ id: main.noteId as Id<"shedNotes">, line });
        else await start(addRecordingToNote(newBody?.() ?? "", line), false);
      },
    };
  });

  if (notes === undefined) return <div className="h-20 rounded-xl bg-foreground/[0.04]" aria-hidden />;
  const others = notes.slice(1);
  return (
    <div className="flex flex-col gap-2">
      <NotePreview noteId={main?.noteId ?? null} onOpen={() => main && onOpen(main.noteId)} onStart={() => void start()} starting={busy} />
      {error && <p className="text-sm text-danger">{error}</p>}
      {/* Other notes attached to it (from Shed Notes). */}
      {others.length > 0 && (
        <ul className={ROWS}>
          {others.map((n) => (
            <li key={n.noteId}>
              <button type="button" onClick={() => onOpen(n.noteId)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]">
                <DocumentIcon className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm">{n.title}</span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
