"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, PlusIcon, SearchIcon } from "@/components/tools";
import { STANDARDS, Standard, nameId, searchStandards, standardToTune } from "@/lib/standards";
import { Tune } from "@/lib/types";
import { useSyncedTunes } from "@/lib/useSyncedTunes";

const MAX_ROWS = 60;

export default function StandardsPicker({
  onClose,
  onCreateCustom,
  onAddCustom,
  tunes: tunesOverride,
  setTunes: setTunesOverride,
  listChoice,
}: {
  onClose: () => void;
  onCreateCustom: (name: string) => void;
  /** Adding your own tune by name in one tap (Jam Practice): the row adds it straight away, with
      a "More details" button that calls `onCreateCustom` for tempos, keys and notes. Without it,
      the row opens `onCreateCustom` (the full form) at once. */
  onAddCustom?: (name: string) => void;
  /** Which list a picked standard is added into. Omitted by Jam Practice's own `TunesPanel.tsx`
      (this component's original, still-unchanged caller), which falls back to `useSyncedTunes()`
      below — Jam Practice's own tune list, exactly as before this prop existed. Passed explicitly
      by `TuneListManager.tsx` so the same search-standards modal can add into whichever list *it*
      is currently managing on the account page (the Tunes tab, or the separate Tunes to Learn tab)
      instead of always Jam Practice's own list. */
  tunes?: Tune[];
  setTunes?: (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;
  /** Lets the footer say, and switch, which list picked tunes go into (the Library passes Tunes I
      Know / Tunes to Learn). Callers that fix the list leave it out. */
  listChoice?: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void };
}) {
  const [ownTunes, setOwnTunes] = useSyncedTunes();
  const tunes = tunesOverride ?? ownTunes;
  const setTunes = setTunesOverride ?? setOwnTunes;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const added = useMemo(() => new Set(tunes.map((t) => nameId(t.name))), [tunes]);
  const results = useMemo(() => searchStandards(query), [query]);
  const shown = results.slice(0, MAX_ROWS);
  const typed = query.trim();
  const canCreate = typed !== "" && !STANDARDS.some((s) => nameId(s.name) === nameId(typed));
  const customAdded = !!onAddCustom && canCreate && added.has(nameId(typed));
  const optionCount = shown.length + (canCreate ? 1 : 0);
  const activeIndex = Math.min(active, Math.max(0, optionCount - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function add(standards: Standard[]) {
    setTunes((prev) => {
      const have = new Set(prev.map((t) => nameId(t.name)));
      const fresh = standards.filter((s) => !have.has(nameId(s.name)));
      return fresh.length ? [...prev, ...fresh.map(standardToTune)] : prev;
    });
  }

  /** The "your own tune" row: add it by name (when that's offered), or open the full form. */
  function createCustom() {
    if (onAddCustom && !customAdded) onAddCustom(typed);
    else onCreateCustom(typed);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(optionCount - 1, activeIndex + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = shown[activeIndex];
      if (target) add([target]);
      else if (canCreate) createCustom();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay px-4 pt-[10vh] sm:pt-[14vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Add jazz standards"
        className="w-full max-w-3xl overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface text-left text-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-4 border-b border-surface-hover px-5 py-4 sm:px-6 sm:py-5">
          <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={`Search ${STANDARDS.length} jazz standards…`}
            aria-label="Search jazz standards"
            className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
          >
            Done
          </button>
        </div>

        <ul ref={listRef} role="listbox" className="max-h-[50dvh] overflow-y-auto p-2">
          {shown.length === 0 && (
            <li className="px-4 py-3 text-muted">No standards match “{typed}”</li>
          )}
          {shown.map((standard, i) => {
            const isAdded = added.has(nameId(standard.name));
            return (
              <li
                key={standard.name}
                role="option"
                aria-selected={i === activeIndex}
                data-index={i}
                onPointerMove={() => setActive(i)}
                onClick={() => add([standard])}
                className={`flex cursor-pointer items-center gap-4 rounded-md px-4 py-3 ${
                  i === activeIndex ? "bg-surface-hover" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{standard.name}</div>
                  <div className="truncate text-xs text-muted">
                    {standard.composer} · {standard.key} · {standard.bpm} BPM
                    {standard.timeSignature !== "4/4" ? ` · ${standard.timeSignature}` : ""}
                  </div>
                </div>
                {isAdded ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-sm text-accent">
                    <CheckIcon className="h-4 w-4" />
                    Added
                  </span>
                ) : (
                  <span
                    className={`flex shrink-0 items-center gap-2 text-sm text-muted ${
                      i === activeIndex ? "" : "opacity-0"
                    }`}
                  >
                    Add
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground/[0.05] text-foreground">
                      <PlusIcon className="h-4 w-4" />
                    </span>
                  </span>
                )}
              </li>
            );
          })}
          {canCreate && (
            <li
              role="option"
              aria-selected={activeIndex === shown.length}
              data-index={shown.length}
              onPointerMove={() => setActive(shown.length)}
              onClick={createCustom}
              className={`flex cursor-pointer items-center gap-4 rounded-md px-4 py-3 ${
                activeIndex === shown.length ? "bg-surface-hover" : ""
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent text-accent-foreground">
                {customAdded ? <CheckIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
              </span>
              {onAddCustom ? (
                <div className="min-w-0 flex-1">
                  <div className="truncate">{customAdded ? `“${typed}”` : `Add “${typed}”`}</div>
                  <div className={`truncate text-xs ${customAdded ? "text-accent" : "text-muted"}`}>{customAdded ? "Added as your own tune" : "Your own tune, name only"}</div>
                </div>
              ) : (
                <span className="min-w-0 flex-1 truncate">Create custom tune “{typed}”</span>
              )}
              {onAddCustom && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateCustom(typed);
                  }}
                  className="shrink-0 rounded-md bg-foreground/[0.05] px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  More details
                </button>
              )}
            </li>
          )}
          {results.length > shown.length && (
            <li className="px-4 py-3 text-center text-sm text-muted">
              {results.length - shown.length} more — keep typing to narrow it down
            </li>
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-surface-hover px-5 py-3 text-sm sm:px-6">
          {listChoice && listChoice.options.length === 1 && (
            <span className="text-muted">
              Adds to <span className="font-medium text-foreground">{listChoice.options[0].label}</span>
            </span>
          )}
          {listChoice && listChoice.options.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-muted">Add to</span>
              <div role="radiogroup" aria-label="Add to" className="flex rounded-full bg-foreground/[0.05] p-0.5">
                {listChoice.options.map((o) => {
                  const on = o.value === listChoice.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => listChoice.onChange(o.value)}
                      className={`h-8 rounded-full px-3 text-sm font-medium transition-colors ${on ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <span className="text-muted">
            {tunes.length} in {listChoice ? "that list" : "your list"} · <span className="[@media(pointer:coarse)]:hidden">Enter or click to add</span>
            <span className="hidden [@media(pointer:coarse)]:inline">Tap a tune to add it</span>
          </span>
        </div>
      </div>
    </div>
  );
}
