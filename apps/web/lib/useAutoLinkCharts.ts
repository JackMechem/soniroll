import { useEffect } from "react";
import { linkedChartIds } from "@jam-practice/core/tuneLibrary";
import type { LibrarySongMeta } from "./useChordChartsLibrary";
import { useChartLinker } from "./useTuneLists";

/**
 * Every chord chart belongs to a tune. Whenever the Library opens, any chart no tune has (charts
 * from before that rule, ones added by the phone app or an older build) goes to the tune with its
 * name, or a new tune in the Library list. Charts it hasn't seen before (`CHARTS_LINKED_KEY`) are
 * also tagged with the folders they're in, once. Nothing is deleted, and when every chart is on a
 * tune it does nothing.
 */
export function useAutoLinkCharts(allSongs: LibrarySongMeta[], loading: boolean) {
  const { link, ready, linkedIds, lists } = useChartLinker();
  const known = lists.tunes.tunes;
  const learn = lists.learn.tunes;
  const library = lists.library.tunes;
  useEffect(() => {
    if (!ready || loading || allSongs.length === 0) return;
    const seen = new Set(linkedIds);
    const fresh = allSongs.filter((s) => !seen.has(s.id));
    const onTunes = linkedChartIds({ tunes: known, learn, library });
    const orphans = allSongs.filter((s) => !onTunes.has(s.id));
    if (fresh.length === 0 && orphans.length === 0) return;
    const run = () =>
      link(
        orphans.map((s) => ({ id: s.id, title: s.title, timeSignature: s.timeSignature, playlistNames: seen.has(s.id) ? [] : s.playlistNameList })),
        { tagWithPlaylists: true, alsoHandled: fresh.map((s) => s.id) },
      );
    // Only one tab links at a time (two tabs doing the first pass together would each make the
    // same Library tunes). The lock is held a few seconds so the other tab sees the result first.
    if (typeof navigator !== "undefined" && navigator.locks) {
      void navigator.locks.request("jam-practice-auto-link-charts", { ifAvailable: true }, async (lock) => {
        if (!lock) return;
        run();
        await new Promise((r) => setTimeout(r, 4000));
      });
    } else run();
  }, [ready, loading, allSongs, linkedIds, known, learn, library, link]);
}
