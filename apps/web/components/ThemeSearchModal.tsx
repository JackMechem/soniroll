"use client";

import { useEffect, useRef, useState } from "react";
import { Swatch } from "@/components/ThemeModal";
import { SearchIcon } from "@/components/tools";
import { setPreset } from "@/lib/theme";
import { ALL_PRESETS } from "@/lib/themes";

/**
 * "See all" — the same `/`-search shape `CommandPalette.tsx` uses for tools, just searching
 * `ALL_PRESETS` (every theme, including the longer terminal-scheme-modeled tail that doesn't fit
 * `ThemeModal`'s own small quick-pick grid) instead of `NAV_LINKS`. Portals nowhere itself — it's
 * rendered directly by `ThemeModal`, nested inside that modal's own click-stopping panel div so a
 * click here doesn't bubble up and close the theme modal underneath it (see that file's own
 * comment at the call site). Picking a theme applies it immediately and closes just this search
 * overlay, leaving the theme modal open underneath to show the result — the same "preview without
 * fully committing to leaving" feel `Select.tsx`'s own dropdown has, just for a whole theme
 * instead of one field.
 */
export default function ThemeSearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const q = query.trim().toLowerCase();
  const results = q ? ALL_PRESETS.filter((p) => p.label.toLowerCase().includes(q)) : ALL_PRESETS;
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function pick(index: number) {
    const target = results[index];
    if (!target) return;
    setPreset(target.id);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(results.length - 1, activeIndex + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(activeIndex);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-overlay px-4 pt-[14vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Search themes"
        className="w-full max-w-2xl overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface text-foreground shadow-2xl shadow-black/30"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-foreground/10 px-4 py-3.5">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search themes..."
            aria-label="Search themes"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
        </div>

        <ul ref={listRef} role="listbox" className="max-h-96 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-3 text-sm text-muted">No themes found</li>}
          {results.map((preset, i) => (
            <li
              key={preset.id}
              role="option"
              aria-selected={i === activeIndex}
              data-index={i}
              onPointerMove={() => setActive(i)}
              onClick={() => pick(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${
                i === activeIndex ? "bg-surface-hover" : ""
              }`}
            >
              <div className="w-24 shrink-0">
                <Swatch colors={preset.colors} />
              </div>
              <span className="flex-1 truncate text-sm font-medium">{preset.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
