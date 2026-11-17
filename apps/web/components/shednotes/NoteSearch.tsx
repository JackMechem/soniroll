"use client";

import { useQuery } from "convex/react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { DocumentIcon, SearchIcon } from "@/components/tools";
import type { NoteMeta } from "@/lib/useShedNotes";

type Hit = { id: string; title: string; folder: string; snippet: string; where: "title" | "text" };

/** `text` with every word of `q` highlighted. */
function Marked({ text, q }: { text: string; q: string }) {
  const words = q.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 0 && !w.startsWith("#"));
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-accent/25 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Shed Notes' search menu (/ outside a note, or Alt/⌥+F): note titles, folders and #tags
 * match right away, and the notes' text is searched on the server, each hit showing the line it
 * was found in. ↑/↓ to move, Enter to open, Escape to close.
 */
export default function NoteSearch({ notes, onOpen, onClose }: { notes: NoteMeta[]; onOpen: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const query = q.trim();
  const deferred = useDeferredValue(query);
  const textHits = useQuery(api.shedNotes.search, deferred.length >= 2 && !deferred.startsWith("#") ? { q: deferred } : "skip");

  const hits = useMemo<Hit[]>(() => {
    const t = query.toLowerCase();
    if (!t) return [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12).map((n) => ({ id: n.id, title: n.title, folder: n.folder, snippet: n.snippet, where: "title" }));
    const byTitle = t.startsWith("#")
      ? notes.filter((n) => n.tags.some((g) => g === t.slice(1) || g.startsWith(`${t.slice(1)}/`)))
      : notes.filter((n) => `${n.title} ${n.folder}`.toLowerCase().includes(t));
    const seen = new Set(byTitle.map((n) => n.id));
    return [
      ...byTitle.map((n) => ({ id: n.id, title: n.title, folder: n.folder, snippet: n.snippet, where: "title" as const })),
      ...(textHits ?? []).filter((h) => !seen.has(h.id)).map((h) => ({ ...h, where: "text" as const })),
    ];
  }, [notes, query, textHits]);
  const at = Math.min(active, Math.max(0, hits.length - 1));

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const firstText = hits.findIndex((h) => h.where === "text");

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[10vh]" onMouseDown={onClose}>
      <div role="dialog" aria-label="Search notes" className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface text-foreground shadow-2xl shadow-black/25" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-foreground/10 px-4">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(Math.min(hits.length - 1, at + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(Math.max(0, at - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (hits[at]) onOpen(hits[at].id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
            placeholder="Search your notes (or #tag)"
            className="min-w-0 flex-1 bg-transparent py-3.5 text-base outline-none"
          />
          <kbd className="hidden shrink-0 rounded-sm bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">Esc</kbd>
        </div>
        <ul ref={list} className="min-h-0 overflow-y-auto p-2" role="listbox">
          {!query && <li className="px-3 pb-1 pt-1 text-xs font-medium text-muted">Recent</li>}
          {hits.map((h, i) => (
            <li key={`${h.where}:${h.id}`} data-row={i} role="option" aria-selected={i === at}>
              {i === firstText && <p className="px-3 pb-1 pt-3 text-xs font-medium text-muted">In the text</p>}
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => onOpen(h.id)} className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left ${i === at ? "bg-surface-hover" : ""}`}>
                <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">
                      <Marked text={h.title} q={query} />
                    </span>
                    {h.folder && <span className="shrink-0 truncate text-xs text-muted">{h.folder}</span>}
                  </span>
                  {h.snippet && (
                    <span className="line-clamp-2 text-xs text-muted">
                      <Marked text={h.snippet} q={query} />
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {query && hits.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted">{textHits === undefined && deferred.length >= 2 && !deferred.startsWith("#") ? "Searching…" : "No notes match."}</li>
          )}
          {!query && notes.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No notes yet.</li>}
        </ul>
      </div>
    </div>
  );
}
