import { useEffect } from "react";
import { linkedChartIds } from "@jam-practice/core/tuneLibrary";
import type { LibrarySongMeta } from "./useChordChartsLibrary";
import { useChartLinker } from "./useTuneLists";

/**
 * Every chord chart belongs to a tune. Charts from before that rule (and ones added by an older
 * app build) are linked once, when the Library opens: each chart the linker hasn't handled yet
 * and that no tune has goes to the tune with its name, or a new tune in the Library list, tagged
 * with the folders it's in. Every chart seen is remembered (`CHARTS_LINKED_KEY`), so a chart you
 * unlink later, or whose tune you delete, stays as it is. Nothing is deleted, and running it again
 * does nothing.
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
    if (fresh.length === 0) return;
    const onTunes = linkedChartIds({ tunes: known, learn, library });
    const orphans = fresh.filter((s) => !onTunes.has(s.id));
    link(
      orphans.map((s) => ({ id: s.id, title: s.title, timeSignature: s.timeSignature, playlistNames: s.playlistNameList })),
      { tagWithPlaylists: true, alsoHandled: fresh.map((s) => s.id) },
    );
  }, [ready, loading, allSongs, linkedIds, known, learn, library, link]);
}
