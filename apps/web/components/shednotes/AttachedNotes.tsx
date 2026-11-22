"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { type NoteTarget, targetKey } from "@jam-practice/core/shedNotes";
import { DocumentIcon, PlusIcon, SearchIcon } from "@/components/tools";
import { errorText, useNoteList } from "@/lib/useShedNotes";
import { openNotePeek } from "@/lib/notePeek";

/** The notes attached to one thing (exactly that target, not ones under it). `enabled` false
    skips the query (nothing to look up). */
export function useAttachedNotes(target: NoteTarget, enabled = true) {
  const key = targetKey(target);
  const rows = useQuery(api.shedNotes.attachedTo, enabled ? { prefix: key } : "skip");
  return { key, notes: rows?.filter((r) => r.target === key) };
}

/**
 * Shed Notes attached to a routine on a day, a day, or a tune: each as a card (title and the start
 * of its text) that opens it in a dialog, and an "Add notes" button with a menu — a new note
 * (opened right away) or one you already have. `label` names the thing, for the note's "Attached
 * to" list and a new note's title.
 */
export default function AttachedNotes({
  target,
  label,
  newTitle,
  buttonClassName = "h-8 rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover",
  cardClassName = "bg-background",
  children,
}: {
  target: NoteTarget;
  label: string;
  /** The title a new note gets (made unique if taken). */
  newTitle: string;
  buttonClassName?: string;
  cardClassName?: string;
  /** Shown beside the Add notes button (e.g. the Record button). */
  children?: React.ReactNode;
}) {
  const { key, notes } = useAttachedNotes(target);
  const detach = useMutation(api.shedNotes.detachNote);
  // Notes open in the side view, with a way to take them off this thing.
  const setOpenId = (noteId: string) =>
    openNotePeek(noteId, { label: `Take off ${label}`, run: () => void detach({ noteId: noteId as Id<"shedNotes">, target: key }) });

  return (
    <>
      {notes && notes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {notes.map((n) => (
            <li key={n.noteId}>
              <button type="button" onClick={() => setOpenId(n.noteId)} className={`flex w-full items-start gap-2.5 rounded-md bg-foreground/[0.05] px-3 py-2 text-left transition-colors hover:bg-surface-hover ${cardClassName}`}>
                <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{n.title}</span>
                  <span className="line-clamp-2 text-xs text-muted">{n.snippet || "Empty note"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <AddNotesButton targetKey={key} label={label} newTitle={newTitle} attachedIds={new Set(notes?.map((n) => n.noteId) ?? [])} onOpen={setOpenId} className={buttonClassName} />
      </div>
    </>
  );
}

function AddNotesButton({
  targetKey: key,
  label,
  newTitle,
  attachedIds,
  onOpen,
  className,
}: {
  targetKey: string;
  label: string;
  newTitle: string;
  attachedIds: Set<string>;
  onOpen: (id: string) => void;
  className: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button type="button" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} aria-expanded={!!anchor} className={`flex items-center gap-1 ${className}`}>
        <PlusIcon className="h-3.5 w-3.5" /> Add notes
      </button>
      {anchor && <AddNotesMenu anchor={anchor} targetKey={key} label={label} newTitle={newTitle} attachedIds={attachedIds} onOpen={onOpen} onClose={() => setAnchor(null)} />}
    </>
  );
}

function AddNotesMenu({
  anchor,
  targetKey: key,
  label,
  newTitle,
  attachedIds,
  onOpen,
  onClose,
}: {
  anchor: HTMLElement | null;
  targetKey: string;
  label: string;
  newTitle: string;
  attachedIds: Set<string>;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const all = useNoteList();
  const create = useMutation(api.shedNotes.create);
  const attach = useMutation(api.shedNotes.attachNote);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Below the button (above it if there's no room), kept on screen; a bottom sheet on phones.
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el || !anchor || window.innerWidth < 640) return;
    const r = anchor.getBoundingClientRect();
    const h = el.offsetHeight;
    const below = r.bottom + 6 + h <= window.innerHeight - 8;
    el.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`;
    el.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - el.offsetWidth - 8)}px`;
  });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const query = q.trim().toLowerCase();
  const choices = (all ?? [])
    .filter((n) => !attachedIds.has(n.id) && (!query || n.title.toLowerCase().includes(query) || n.folder.toLowerCase().includes(query)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40);

  async function makeNew() {
    try {
      const made = await create({ title: q.trim() || newTitle, attach: { target: key, label } });
      onClose();
      onOpen(made.id);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function pick(id: string) {
    try {
      await attach({ noteId: id as Id<"shedNotes">, target: key, label });
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-overlay sm:hidden" aria-hidden />
      <div
        ref={menu}
        role="dialog"
        aria-label="Add notes"
        className="log-pop fixed inset-x-0 bottom-0 z-[61] flex max-h-[75dvh] flex-col overflow-hidden rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface text-foreground shadow-2xl shadow-black/25 sm:inset-x-auto sm:bottom-auto sm:w-80 sm:rounded-xl"
      >
        <button type="button" onClick={() => void makeNew()} className="flex items-center gap-2 border-b border-foreground/10 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-surface-hover">
          <PlusIcon className="h-4 w-4 text-muted" />
          <span className="min-w-0 flex-1 truncate">New note{q.trim() ? `: ${q.trim()}` : ""}</span>
        </button>
        <label className="flex items-center gap-2 px-4 pt-3">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (choices[0] ? void pick(choices[0].id) : void makeNew())} placeholder="Find a note you have" className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none sm:text-sm" />
        </label>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {all === undefined && <li className="px-2 py-3 text-sm text-muted">Loading…</li>}
          {all && choices.length === 0 && <li className="px-2 py-3 text-sm text-muted">{all.length ? "No other notes match." : "You don't have any notes yet."}</li>}
          {choices.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => void pick(n.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                <DocumentIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{n.title}</span>
                  {n.folder && <span className="block truncate text-xs text-muted">{n.folder}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="px-4 pb-3 text-xs text-danger">{error}</p>}
      </div>
    </>,
    document.body,
  );
}

/** A plain-text note from before Shed Notes (a routine's or a day's): still editable, with a
    button that turns it into a Shed Note attached to the same thing and clears the old text. */
export function LegacyNotes({
  text,
  onChange,
  onClear,
  target,
  label,
  newTitle,
  placeholder,
  className = "bg-background",
}: {
  text: string;
  onChange: (text: string) => void;
  onClear: () => void;
  target: NoteTarget;
  label: string;
  newTitle: string;
  placeholder?: string;
  className?: string;
}) {
  const create = useMutation(api.shedNotes.create);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function convert() {
    setBusy(true);
    try {
      await create({ title: newTitle, body: text, attach: { target: targetKey(target), label } });
      onClear();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        aria-label="Notes"
        className={`resize-y rounded-md px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:text-sm ${className}`}
      />
      <div className="flex items-center gap-2 text-xs">
        <button type="button" disabled={busy || !text.trim()} onClick={() => void convert()} className="font-medium text-accent hover:underline disabled:opacity-50">
          Make it a Shed Note
        </button>
        {error && <span className="text-danger">{error}</span>}
      </div>
    </div>
  );
}
