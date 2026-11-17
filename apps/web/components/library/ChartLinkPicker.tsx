"use client";

import { useEffect, useMemo, useState } from "react";
import { ChordChartIcon, SearchIcon } from "@/components/tools";
import type { LibrarySongMeta } from "@/lib/useChordChartsLibrary";

/** Search your chord charts and pick one to link — starts searched for the tune's own name. */
export default function ChartLinkPicker({
  songs,
  initialQuery,
  onPick,
  onClose,
}: {
  /** Every chart in the library (`useChordChartsLibrary`'s `allSongs`). */
  songs: LibrarySongMeta[];
  initialQuery: string;
  onPick: (songId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const out: { song: LibrarySongMeta; playlist: string }[] = [];
    for (const s of songs) if (!q || `${s.title} ${s.composer}`.toLowerCase().includes(q)) out.push({ song: s, playlist: s.playlistNames });
    return out;
  }, [songs, q]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-label="Link a chord chart" className="flex max-h-[75vh] w-full max-w-lg flex-col gap-3 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40 sm:h-9">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your chord charts" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm" />
        </div>
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {rows.length === 0 ? (
            <li className="p-3 text-sm text-muted">No charts match.</li>
          ) : (
            rows.slice(0, 200).map((r) => (
              <li key={r.song.id}>
                <button type="button" onClick={() => onPick(r.song.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-background">
                  <ChordChartIcon className="h-4 w-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.song.title}</span>
                    <span className="block truncate text-xs text-muted">{[r.song.composer, r.playlist].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
