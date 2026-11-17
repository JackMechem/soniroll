"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_COLORS, NoteIcon, SearchIcon, filterLinks, groupByCategory, svgProps } from "@/components/tools";
import { tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import {
  applyPendingSplit,
  clearPendingSplit,
  syncAddressBar,
  useTilingState,
} from "@/lib/useTilingLayout";

export const OPEN_PALETTE_EVENT = "open-command-palette";

function EnterIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { pendingSplit } = useTilingState();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = filterLinks(query);
  // Your tunes too (both lists), after the tools, so one search finds everything.
  const lists = useTuneLists();
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tuneItems = words.length
    ? (["tunes", "learn"] as TuneListId[])
        .flatMap((list) => lists[list].tunes.filter((t) => words.every((w) => t.name.toLowerCase().includes(w))).map((t) => ({ href: tuneHref(list, t.id), label: t.name, icon: NoteIcon })))
        .slice(0, 6)
    : [];
  const groups: { category: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
    ...groupByCategory(results),
    ...(tuneItems.length ? [{ category: "Your tunes", items: tuneItems }] : []),
  ];
  // The order results actually render in — grouped by category, not `results`' own flat order
  // (`filterLinks` returns matches in `NAV_LINKS`' declaration order, which isn't the same as
  // `CATEGORIES`' display order `groupByCategory` reorders them into). `go`/`activeIndex`/arrow-key
  // navigation all need to index into *this*, not `results` directly — indexing into `results`
  // while assigning each row's index during the `groups` render loop (the bug this replaces,
  // reported directly: "the search menu doesn't always open the tool I click on") meant `go(i)`
  // almost always resolved to a different tool than the one actually at position `i` on screen.
  const ordered = groups.flatMap((g) => g.items);
  const activeIndex = Math.min(active, Math.max(0, ordered.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function go(index: number) {
    const target = ordered[index];
    if (!target) return;
    // An edge button in `components/TilingLayout.tsx` opened this palette on a pane's behalf
    // (`requestSplit`) — picking a result here splits that pane instead of navigating the whole
    // page. `applyPendingSplit` already updates the pane tree itself; this only still owns moving
    // the URL, same as an ordinary pick. Uses `syncAddressBar` (raw History API), not
    // `router.replace` — routing a tiling-internal address-bar update through Next's own router
    // was traced to a real bug (see `TilingLayout.tsx`'s own doc comment): navigating to a URL
    // matching a `TOOL_COMPONENTS` entry remounts that tool wherever else it's already showing,
    // which would lose a sibling pane's running state the instant a split picked a tool that
    // happened to already be open elsewhere.
    if (applyPendingSplit(target.href)) {
      syncAddressBar(target.href);
    } else {
      router.push(target.href);
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(ordered.length - 1, activeIndex + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay px-4 pt-[18vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Search tools"
        className="w-full max-w-2xl overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface text-foreground shadow-2xl shadow-black/30"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-foreground/10 px-4 py-3.5">
          <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={pendingSplit ? "Pick a tool to tile…" : "Search tools and your tunes…"}
            aria-label="Search tools"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
        </div>

        <ul ref={listRef} role="listbox" className="max-h-96 overflow-y-auto p-1.5">
          {ordered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches that. Try another word, like “chords”, “tempo” or a tune’s name.</li>}
          {(() => {
            let index = -1;
            return groups.map(({ category, items }) => (
              <li key={category} role="presentation">
                <p className="px-3 pb-1 pt-3 text-xs font-medium text-muted first:pt-1">
                  {category === "Community" ? "Library and people" : category}
                </p>
                <ul role="presentation">
                  {items.map(({ href, label, icon: Icon }) => {
                    index++;
                    const i = index;
                    return (
                      <li
                        key={href}
                        role="option"
                        aria-selected={i === activeIndex}
                        data-index={i}
                        onPointerMove={() => setActive(i)}
                        onClick={() => go(i)}
                        className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${
                          i === activeIndex ? "bg-surface-hover" : ""
                        }`}
                      >
                        <span className="flex shrink-0" style={{ color: CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? "var(--accent)" }}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="flex-1 truncate">{label}</span>
                        {i === activeIndex && (
                          <span className="flex items-center gap-2 text-sm text-muted">
                            Open
                            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-foreground/[0.05] text-foreground">
                              <EnterIcon className="h-3.5 w-3.5" />
                            </span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ));
          })()}
        </ul>
        {/* The keys, so they're discoverable. */}
        <div className="flex items-center gap-4 border-t border-foreground/10 px-4 py-2 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Key>↑</Key><Key>↓</Key> to move</span>
          <span className="flex items-center gap-1.5"><Key>Enter</Key> to open</span>
          <span className="flex items-center gap-1.5"><Key>Esc</Key> to close</span>
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-sm bg-foreground/[0.08] px-1.5 py-0.5 font-sans text-[11px] text-foreground">{children}</kbd>;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      setOpen(true);
    }
    // The sidebar's search box opens the same menu.
    const onOpenRequest = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  function close() {
    setOpen(false);
    // Covers every way the palette can close without a pick (Escape, clicking the backdrop) — a
    // pick already clears this itself (`applyPendingSplit`), so this is a no-op then; it only
    // matters for the "opened a pane's split picker, then backed out" case, so a *later*, ordinary
    // "/" search doesn't inherit a stale pane/direction from one that was abandoned.
    clearPendingSplit();
  }

  return open ? <Palette onClose={close} /> : null;
}
