import { useConvexAuth } from "@convex-dev/auth/react";
import { useCallback } from "react";
import {
  CHARTS_LINKED_KEY,
  LIBRARY_TUNES_KEY,
  linkChartsToTunes,
  type ChartToLink,
  type LinkResult,
  type TuneListId,
} from "@jam-practice/core/tuneLibrary";
import { makeId, type Tune } from "./types";
import { readSyncedList, useSyncedList } from "./useSyncedList";
import { readTunes, useSyncedTunes } from "./useSyncedTunes";
import { readTunesToLearn, useTunesToLearn } from "./useTunesToLearn";

export { TUNE_LIST_IDS, TUNE_LIST_LABEL, TUNE_LIST_SHORT, type TuneListId } from "@jam-practice/core/tuneLibrary";

type SetTunes = (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;

/** A tune's page. */
export function tuneHref(list: TuneListId, id: string) {
  return `/tunes/tune?list=${list}&id=${encodeURIComponent(id)}`;
}

/** The Library list (tunes that came in with charts, in neither Tunes I Know nor Tunes to Learn). */
export function useLibraryTunes() {
  return useSyncedList<Tune>(LIBRARY_TUNES_KEY);
}

/** All three tune lists (every hook always runs), for pages that show or move tunes between
    them. `ready` once all three have loaded; `canLearn` is false signed out (Tunes to Learn is
    account-only, so nothing can be moved there). */
export function useTuneLists() {
  const { isAuthenticated } = useConvexAuth();
  const [tunes, setTunes, tunesReady] = useSyncedTunes();
  const [learn, setLearn, learnReady] = useTunesToLearn();
  const [library, setLibrary, libraryReady] = useLibraryTunes();
  return {
    tunes: { tunes, setTunes: setTunes as SetTunes },
    learn: { tunes: learn, setTunes: setLearn as SetTunes },
    library: { tunes: library, setTunes: setLibrary as SetTunes },
    ready: tunesReady && learnReady && libraryReady,
    canLearn: isAuthenticated,
  } as const;
}

export type TuneLists = ReturnType<typeof useTuneLists>;

/** Finds a tune in any list (`prefer` first). */
export function findTune(lists: TuneLists, id: string, prefer?: string | null): { list: TuneListId; tune: Tune } | null {
  const all: TuneListId[] = ["tunes", "learn", "library"];
  const first = all.find((l) => l === prefer);
  const order = first ? [first, ...all.filter((l) => l !== first)] : all;
  for (const list of order) {
    const tune = lists[list].tunes.find((t) => t.id === id);
    if (tune) return { list, tune };
  }
  return null;
}

/** Moves a tune to another list (to the end of it). */
export function moveTune(lists: TuneLists, from: TuneListId, to: TuneListId, tune: Tune) {
  if (from === to) return;
  lists[from].setTunes((prev) => prev.filter((t) => t.id !== tune.id));
  lists[to].setTunes((prev) => [...prev.filter((t) => t.id !== tune.id), tune]);
}

/**
 * Links charts to tunes (`linkChartsToTunes`: the tune that has it, else one with the same name,
 * else a new tune in the Library list) and remembers each chart as handled, so the automatic pass
 * (`useAutoLinkCharts`) leaves it alone afterwards. Reads the lists as they are at call time, so
 * it's safe right after an import's await. Does nothing until the lists have loaded.
 */
export function useChartLinker() {
  const { isAuthenticated } = useConvexAuth();
  const lists = useTuneLists();
  const [linkedIds, setLinked, linkedReady] = useSyncedList<string>(CHARTS_LINKED_KEY);
  const ready = lists.ready && linkedReady;
  const { setTunes: setKnown } = lists.tunes;
  const { setTunes: setLearn } = lists.learn;
  const { setTunes: setLibrary } = lists.library;

  const link = useCallback(
    (charts: ChartToLink[], opts: { tags?: string[]; tagWithPlaylists?: boolean; alsoHandled?: string[] } = {}): LinkResult | null => {
      if (!ready) return null;
      const now = {
        tunes: readTunes(isAuthenticated),
        learn: readTunesToLearn(isAuthenticated),
        library: readSyncedList<Tune>(LIBRARY_TUNES_KEY, isAuthenticated),
      };
      const result = linkChartsToTunes(now, charts, { tags: opts.tags, tagWithPlaylists: opts.tagWithPlaylists, makeId });
      if (result.lists.tunes) setKnown(result.lists.tunes);
      if (result.lists.learn) setLearn(result.lists.learn);
      if (result.lists.library) setLibrary(result.lists.library);
      const ids = [...charts.map((c) => c.id), ...(opts.alsoHandled ?? [])];
      setLinked((prev) => {
        const seen = new Set(prev);
        const fresh = ids.filter((id) => id && !seen.has(id));
        return fresh.length ? [...prev, ...new Set(fresh)] : prev;
      });
      return result;
    },
    [ready, isAuthenticated, setKnown, setLearn, setLibrary, setLinked],
  );

  return { link, ready, linkedIds, lists };
}
