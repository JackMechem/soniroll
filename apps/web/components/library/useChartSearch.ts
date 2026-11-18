"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { LIBRARY_DEFAULTS, LIBRARY_KEY } from "@/lib/chordChartsLibrary";
import { usePersistedSettings } from "@/lib/usePersistedSettings";

/** What a chart search needs to show a result. */
export type ChartHit = { id: string; title: string; composer: string; key: string };

export function chartHref(id: string) {
  return `/chord-charts/view?id=${encodeURIComponent(id)}`;
}

/**
 * Your chord charts' titles, for searches (the / palette). Lighter than `useChordChartsLibrary`:
 * just the library list (metadata only, no bars — the same query the Library uses, so it's shared
 * while both are open) and nothing that writes. Signed out it's this browser's library.
 */
export function useChartTitles(): ChartHit[] {
  const { isAuthenticated } = useConvexAuth();
  const [local] = usePersistedSettings(LIBRARY_KEY, LIBRARY_DEFAULTS);
  const remote = useQuery(api.chordCharts.library, isAuthenticated ? {} : "skip");
  return isAuthenticated ? (remote?.songs ?? []) : local.songs;
}

/**
 * Charts whose title has every typed word, best first: titles that start with the search, then
 * ones with a word starting with it, then the rest; shorter titles first within each. Capped, so a
 * big library (1,500+ charts) only ever adds a few rows. A plain scan — fast enough per keystroke.
 */
export function searchCharts<T extends ChartHit>(songs: readonly T[], query: string, limit = 5): T[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { song: T; rank: number }[] = [];
  for (const song of songs) {
    const title = song.title.toLowerCase();
    if (!words.every((w) => title.includes(w))) continue;
    const rank = title.startsWith(q) ? 0 : title.includes(` ${words[0]}`) ? 1 : 2;
    scored.push({ song, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.song.title.length - b.song.title.length || a.song.title.localeCompare(b.song.title));
  return scored.slice(0, limit).map((s) => s.song);
}
