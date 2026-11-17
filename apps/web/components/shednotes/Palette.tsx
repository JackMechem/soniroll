"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "@/components/tools";

export type PaletteItem = { id: string; label: string; detail?: string; hint?: string };

/**
 * The command palette and the quick switcher: a search box over a list, ↑/↓ to move, Enter to
 * pick, Escape to close. `onCreate` adds a last row ("Make “…”") when what's typed matches
 * nothing exactly — the quick switcher uses it to make a note by that name.
 */
export default function Palette({
  placeholder,
  items,
  onPick,
  onCreate,
  onClose,
}: {
  placeholder: string;
  items: PaletteItem[];
  onPick: (item: PaletteItem) => void;
  onCreate?: (text: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const hits = query ? items.map((it) => ({ it, score: score(it, query) })).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).map((h) => h.it) : items;
    const exact = items.some((it) => it.label.toLowerCase() === query);
    return { hits: hits.slice(0, 80), create: onCreate && query && !exact ? q.trim() : null };
  }, [q, items, onCreate]);
  const count = rows.hits.length + (rows.create ? 1 : 0);
  const at = Math.min(active, Math.max(0, count - 1));

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  function pick(i: number) {
    if (i < rows.hits.length) onPick(rows.hits[i]);
    else if (rows.create) onCreate?.(rows.create);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[12vh]" onMouseDown={onClose}>
      <div role="dialog" aria-label={placeholder} className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface text-foreground shadow-2xl shadow-black/25" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-foreground/10 px-4">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
                e.preventDefault();
                setActive((a) => Math.min(count - 1, Math.min(a, count - 1) + 1));
              } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
                e.preventDefault();
                setActive((a) => Math.max(0, Math.min(a, count - 1) - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (count) pick(at);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent py-3.5 text-base outline-none"
          />
        </div>
        <ul ref={list} className="min-h-0 overflow-y-auto p-1.5" role="listbox">
          {rows.hits.map((it, i) => (
            <li key={it.id} data-row={i} role="option" aria-selected={i === at}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${i === at ? "bg-surface-hover" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{it.label}</span>
                  {it.detail && <span className="block truncate text-xs text-muted">{it.detail}</span>}
                </span>
                {it.hint && <kbd className="shrink-0 rounded-sm bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-muted">{it.hint}</kbd>}
              </button>
            </li>
          ))}
          {rows.create && (
            <li data-row={rows.hits.length} role="option" aria-selected={at === rows.hits.length}>
              <button
                type="button"
                onMouseEnter={() => setActive(rows.hits.length)}
                onClick={() => pick(rows.hits.length)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${at === rows.hits.length ? "bg-surface-hover" : ""}`}
              >
                <span className="text-muted">New note</span>
                <span className="truncate font-medium">{rows.create}</span>
              </button>
            </li>
          )}
          {count === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}

/** Fuzzy-ish match: whole words and prefixes score higher than scattered letters. */
function score(it: PaletteItem, q: string): number {
  const text = `${it.label} ${it.detail ?? ""}`.toLowerCase();
  if (it.label.toLowerCase().startsWith(q)) return 100;
  const idx = text.indexOf(q);
  if (idx >= 0) return 80 - Math.min(40, idx);
  const words = q.split(/\s+/).filter(Boolean);
  if (words.every((w) => text.includes(w))) return 40;
  let i = 0;
  for (const ch of text) if (ch === q[i]) i++;
  return i === q.length ? 10 : 0;
}
