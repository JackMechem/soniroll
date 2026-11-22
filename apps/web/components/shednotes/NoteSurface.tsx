"use client";

import { useMutation } from "convex/react";
import type { EditorView } from "@codemirror/view";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { titleKey } from "@jam-practice/core/shedNotes";
import LoadingSpinner from "@/components/LoadingSpinner";
import { FileIcon, NoteIcon } from "@/components/tools";
import { type SaveState, errorText, useNote, useNoteList, useNotesConfig } from "@/lib/useShedNotes";
import { type NoteActions, runCommand } from "./commands";
import ScoreDialog from "@/components/notation/ScoreDialog";
import NoteEditor from "./NoteEditor";
import { VimSwitch } from "./NotePane";

/**
 * A Shed Note outside Shed Notes: its title, a short toolbar and the full editor, saving as you
 * type. The side view (`NotePeek`) and the notes on routine and task pages (`InlineNote`) are
 * this. Links to other notes go to `onOpenNote` (the side view opens them in place); one that
 * doesn't exist yet is made first.
 *
 * `flush` is handed back through `onFlush` so the frame can save before it closes or navigates.
 */
export default function NoteSurface({
  noteId,
  onOpenNote,
  headerStart,
  headerEnd,
  footer,
  onFlush,
  onView,
  autoFocus = false,
  editorClassName = "absolute inset-0 px-3 pt-1",
  fill = true,
}: {
  noteId: string;
  onOpenNote: (id: string) => void;
  /** Before the title (the side view's Back). */
  headerStart?: React.ReactNode;
  /** After the title (the side view's buttons). */
  headerEnd?: React.ReactNode;
  /** Under the editor; gets the save state. */
  footer?: (saveState: SaveState) => React.ReactNode;
  onFlush?: (flush: () => void) => void;
  /** The editor, for a page that adds to the note (a recording it just saved). */
  onView?: (view: EditorView | null) => void;
  autoFocus?: boolean;
  editorClassName?: string;
  /** Fill the frame's height (the side view) rather than grow with the text (a page). */
  fill?: boolean;
}) {
  const router = useRouter();
  const { note, setBody, flush, saveState } = useNote(noteId);
  const folder = note?.folder ?? "";
  const notes = useNoteList();
  const cfg = useNotesConfig();
  const rename = useMutation(api.shedNotes.rename);
  const create = useMutation(api.shedNotes.create);
  const [draft, setDraft] = useState<string | null>(null);
  const [notation, setNotation] = useState<{ scoreId: string | null; onDone: (scoreId: string) => void } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    onFlush?.(flush);
  }, [onFlush, flush]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const actions: NoteActions = useMemo(
    () => ({
      openNoteByTitle: (title, o) => {
        const hit = notes?.find((n) => titleKey(n.title) === titleKey(title));
        flush();
        if (hit) onOpenNote(hit.id);
        else if (o?.create)
          void create({ title, folder })
            .then((m) => onOpenNote(m.id))
            .catch((e) => setNotice(errorText(e)));
      },
      openScore: (scoreId, onDone) => setNotation({ scoreId, onDone }),
      createLinkedNote: async (title) => {
        try {
          await create({ title, folder });
        } catch (e) {
          setNotice(errorText(e));
        }
      },
      openPath: (path) => {
        flush();
        router.push(path);
      },
      setConfig: (key, value) => {
        if (!cfg.setValue(key, value)) setNotice("Fix the settings file first — it isn't valid JSON right now.");
      },
      config: () => cfg.config,
      save: flush,
    }),
    [notes, flush, router, create, cfg, folder, onOpenNote],
  );
  const titles = useMemo(() => (notes ?? []).map((n) => ({ title: n.title, folder: n.folder })), [notes]);

  async function commitTitle() {
    if (draft === null || !note) return;
    const next = draft.trim();
    setDraft(null);
    if (!next || next === note.title) return;
    try {
      await rename({ id: note.id as Id<"shedNotes">, title: next });
    } catch (e) {
      setNotice(errorText(e));
    }
  }

  if (note === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <LoadingSpinner />
      </div>
    );
  }
  if (note === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted">This note isn&apos;t there any more.</p>
      </div>
    );
  }

  const tool = "h-7 shrink-0 rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground";
  return (
    <>
      <header className="flex items-center gap-1.5 px-4 pb-1 pt-3">
        {headerStart}
        <input
          value={draft ?? note.title}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitTitle();
              viewRef.current?.focus();
            }
          }}
          aria-label="Note title"
          className="min-w-0 flex-1 bg-transparent px-1 text-lg font-semibold tracking-tight outline-none"
        />
        {headerEnd}
      </header>
      <div className="flex items-center gap-0.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {[
          ["B", "editor:toggle-bold", "font-bold"],
          ["I", "editor:toggle-italic", "italic font-serif"],
          ["H2", "editor:set-heading-2", "font-medium"],
          ["☐ Task", "editor:toggle-checklist", "font-medium"],
          ["[[ ]]", "editor:insert-wikilink", "font-medium"],
        ].map(([label, command, cls]) => (
          <button key={command} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand(command, { view: viewRef.current, actions })} className={`${tool} ${cls}`}>
            {label}
          </button>
        ))}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand("editor:insert-notation", { view: viewRef.current, actions })} className={`flex items-center gap-1 font-medium ${tool}`}>
          <NoteIcon className="h-3.5 w-3.5" /> Notation
        </button>
        <button
          type="button"
          title="Put a recording, picture or other file in the note"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand("editor:insert-file", { view: viewRef.current, actions })}
          className={`flex items-center gap-1 font-medium ${tool}`}
        >
          <FileIcon className="h-3.5 w-3.5" /> File
        </button>
        <span className="flex-1" />
        <VimSwitch on={cfg.config.vimMode} onChange={(on) => actions.setConfig?.("vimMode", on)} />
      </div>
      <div className={fill ? "min-h-0 flex-1 px-4 pb-3" : "px-4 pb-3"}>
        <div className={`relative overflow-hidden rounded-lg bg-background ${fill ? "h-full" : "min-h-[16rem]"}`}>
          <NoteEditor
            key={noteId}
            initialText={note.body}
            config={{ ...cfg.config, readableLineLength: false }}
            notes={titles}
            actions={actions}
            onChange={setBody}
            onView={(v) => {
              viewRef.current = v;
              onView?.(v);
            }}
            // Lines added elsewhere (a recording saved for this task) show up here.
            syncText={saveState === "saved" ? note.body : undefined}
            bottomSpace={fill ? undefined : "1rem"}
            autoFocus={autoFocus}
            placeholder="Write here. [[ links another note."
            className={fill ? editorClassName : "px-3 pt-1 pb-3"}
          />
        </div>
      </div>
      {footer?.(saveState)}
      {notation && (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <ScoreDialog
            scoreId={notation.scoreId}
            onClose={() => {
              setNotation(null);
              viewRef.current?.focus();
            }}
            onDone={(id) => notation.onDone(id)}
          />
        </div>
      )}
      {notice && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg">
          {notice}
        </div>
      )}
    </>
  );
}
