"use client";

import { useMutation } from "convex/react";
import type { EditorView } from "@codemirror/view";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { titleKey } from "@jam-practice/core/shedNotes";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CloseIcon, NoteIcon } from "@/components/tools";
import { errorText, useNote, useNoteList, useNotesConfig } from "@/lib/useShedNotes";
import { type NoteActions, runCommand } from "./commands";
import ScoreDialog from "@/components/notation/ScoreDialog";
import NoteEditor from "./NoteEditor";
import { VimSwitch } from "./NotePane";

/**
 * A Shed Note opened from somewhere else (a routine, a day, a tune): its title and the full
 * editor in a dialog, so you can write without leaving. Links to other notes open them in Shed
 * Notes. "Take it off" detaches it from what it was opened from (the note stays).
 */
export default function NoteDialog({ noteId, onClose, onDetach, detachLabel }: { noteId: string; onClose: () => void; onDetach?: () => void; detachLabel?: string }) {
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
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const close = () => {
    flush();
    onClose();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || notation) return;
      // Vim uses Escape to leave insert mode — only close from outside the editor.
      if (cfg.config.vimMode && (e.target as HTMLElement | null)?.closest(".cm-editor")) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [notation, cfg.config.vimMode]);

  const actions: NoteActions = useMemo(
    () => ({
      openNoteByTitle: (title, o) => {
        const hit = notes?.find((n) => titleKey(n.title) === titleKey(title));
        flush();
        if (hit) router.push(`/shed-notes?id=${encodeURIComponent(hit.id)}`);
        else if (o?.create)
          void create({ title, folder })
            .then((m) => router.push(`/shed-notes?id=${encodeURIComponent(m.id)}`))
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
      closeNote: () => closeRef.current(),
    }),
    [notes, flush, router, create, cfg, folder],
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

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-overlay sm:items-center sm:p-4" onMouseDown={close}>
      <div role="dialog" aria-label={note?.title ?? "Note"} className="flex h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface text-foreground shadow-2xl shadow-black/20 sm:h-[80vh] sm:rounded-xl" onMouseDown={(e) => e.stopPropagation()}>
        {note === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : note === null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted">This note isn&apos;t there any more.</p>
            <button type="button" onClick={onClose} className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
              Close
            </button>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 px-5 pb-1 pt-4">
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
                className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-tight outline-none"
              />
              <VimSwitch on={cfg.config.vimMode} onChange={(on) => actions.setConfig?.("vimMode", on)} />
              <button type="button" onClick={close} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                <CloseIcon className="h-4 w-4" />
              </button>
            </header>
            <div className="flex items-center gap-0.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
              {[
                ["B", "editor:toggle-bold", "font-bold"],
                ["I", "editor:toggle-italic", "italic font-serif"],
                ["H2", "editor:set-heading-2", "font-medium"],
                ["☐ Task", "editor:toggle-checklist", "font-medium"],
                ["[[ ]]", "editor:insert-wikilink", "font-medium"],
              ].map(([label, command, cls]) => (
                <button key={command} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand(command, { view: viewRef.current, actions })} className={`h-7 shrink-0 rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${cls}`}>
                  {label}
                </button>
              ))}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand("editor:insert-notation", { view: viewRef.current, actions })} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                <NoteIcon className="h-3.5 w-3.5" /> Notation
              </button>
            </div>
            <div className="min-h-0 flex-1 px-5 pb-4">
              <div className="relative h-full overflow-hidden rounded-lg bg-background">
              <NoteEditor
                key={noteId}
                initialText={note.body}
                config={{ ...cfg.config, readableLineLength: false }}
                notes={titles}
                actions={actions}
                onChange={setBody}
                onView={(v) => {
                  viewRef.current = v;
                }}
                autoFocus
                placeholder="Write here. [[ links another note."
                className="absolute inset-0 px-3 pt-1"
              />
              </div>
            </div>
            <footer className="flex flex-wrap items-center gap-2 border-t border-foreground/10 px-5 py-3">
              <span className="text-xs text-muted">{saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : "Saving…"}</span>
              <span className="flex-1" />
              {onDetach && (
                <button type="button" onClick={onDetach} className="h-9 rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                  {detachLabel ?? "Take it off"}
                </button>
              )}
              <Link href={`/shed-notes?id=${encodeURIComponent(noteId)}`} onClick={() => flush()} className="flex h-9 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
                Open in Shed Notes
              </Link>
              <button type="button" onClick={close} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
                Done
              </button>
            </footer>
          </>
        )}
      </div>
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
    </div>
  );
}
