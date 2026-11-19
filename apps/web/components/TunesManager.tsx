"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CheckIcon, PencilIcon, SearchIcon, TrashIcon } from "@/components/tools";
import { downloadTunesCsv } from "@/lib/csv";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { Tune } from "@/lib/types";

function summary(tune: Tune) {
  const keys = tune.keys.filter((k) => k.enabled).map((k) => k.value);
  const tempos = tune.tempos.filter((t) => t.enabled).map((t) => t.value);
  return [
    keys.length ? keys.join(", ") : "no keys",
    tempos.length ? `${tempos.join(", ")} BPM` : "no tempos",
    tune.timeSignature,
  ].join(" · ");
}

export default function TunesManager({
  onClose,
  onEdit,
  onDeleteTune,
}: {
  onClose: () => void;
  onEdit: (tune: Tune) => void;
  onDeleteTune: (id: string) => void;
}) {
  const [tunes] = useSyncedTunes();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return tunes;
    return tunes.filter((t) => {
      const haystack = `${t.name} ${summary(t)}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [tunes, query]);

  const existing = new Set(tunes.map((t) => t.id));
  const chosen = tunes.filter((t) => selected.has(t.id) && existing.has(t.id));
  const allShownSelected = shown.length > 0 && shown.every((t) => selected.has(t.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of shown) {
        if (allShownSelected) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-overlay px-4 pt-[10vh] sm:pt-[14vh]"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-label="Manage tunes"
          className="w-full max-w-3xl overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface text-left text-foreground shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-4 border-b border-surface-hover px-5 py-4 sm:px-6 sm:py-5">
            <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tunes.length > 1 ? `Search your ${tunes.length} tunes…` : "Search your tunes…"}
              aria-label="Search your tunes"
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

          <ul className="flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto p-2">
            {shown.length === 0 && (
              <li className="px-4 py-3 text-muted">
                {tunes.length === 0 ? "Your list is empty" : `No tunes match “${query.trim()}”`}
              </li>
            )}
            {shown.map((tune) => {
              const isSelected = selected.has(tune.id);
              return (
                <li
                  key={tune.id}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${
                    isSelected ? "bg-surface-hover" : "hover:bg-surface-hover/60"
                  }`}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Select ${tune.name}`}
                    onClick={() => toggle(tune.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      isSelected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-muted/50 text-transparent hover:border-muted"
                    }`}
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(tune.id)}
                    className="min-w-0 flex-1 text-left"
                    tabIndex={-1}
                  >
                    <div className="truncate">{tune.name}</div>
                    <div className="truncate text-xs text-muted">{summary(tune)}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(tune)}
                    aria-label={`Edit ${tune.name}`}
                    title="Edit"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTune(tune.id)}
                    aria-label={`Delete ${tune.name}`}
                    title="Delete"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2 border-t border-surface-hover px-5 py-3 text-sm sm:px-6">
            <button
              type="button"
              onClick={toggleAllShown}
              disabled={shown.length === 0}
              className="rounded-md px-2 py-1.5 font-medium text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
            >
              {allShownSelected ? "Deselect all" : "Select all"}
            </button>
            <span className="text-muted">{chosen.length} selected</span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => downloadTunesCsv(chosen, "jam-practice-selected-tunes.csv")}
                disabled={chosen.length === 0}
                className="rounded-md bg-foreground/[0.05] px-3 py-1.5 font-medium hover:bg-surface-hover disabled:opacity-50"
              >
                Export
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={chosen.length === 0}
                className="rounded-md bg-foreground/[0.05] px-3 py-1.5 font-medium text-danger hover:bg-surface-hover disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Delete ${chosen.length} tune${chosen.length === 1 ? "" : "s"}?`}
          message="The selected tunes will be removed from your list. This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            for (const tune of chosen) onDeleteTune(tune.id);
            setSelected(new Set());
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
