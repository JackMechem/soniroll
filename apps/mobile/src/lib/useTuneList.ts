import { useConvexAuth } from '@convex-dev/auth/react';
import { linkChartsToTunes, linkedChartIds, removeChartFromTune, tuneChartIds, TUNE_LIST_IDS, type ChartToLink, type LinkResult, type TuneListId } from '@jam-practice/core/tuneLibrary';
import { makeId, type Tune } from '@jam-practice/core/types';

import { useLibraryTunes, useSyncedTunes, useTunesToLearn } from '@/lib/useSyncedTunes';
import { prettyKeyName } from './keyNames';

/** The three tune lists (`@jam-practice/core/tuneLibrary`, the same as the website): Tunes I Know
    ("tunes" — the one Jam Practice picks from), Tunes to Learn, and the Library list (tunes that
    came in with chord charts, not sorted into either yet). */
export { TUNE_LIST_IDS, TUNE_LIST_LABEL, TUNE_LIST_SHORT, type TuneListId } from '@jam-practice/core/tuneLibrary';

type Setter = (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;

/** All three tune lists at once (every hook always runs, per rules-of-hooks), so screens that work
    with any of them — or move a tune between them — have one place to get them. `canLearn` is false
    signed out (Tunes to Learn is account-only, so nothing can be moved there). */
export function useTuneLists() {
  const { isAuthenticated } = useConvexAuth();
  const [tunes, setTunes, tunesReady] = useSyncedTunes();
  const [learn, setLearn, learnReady] = useTunesToLearn();
  const [library, setLibrary, libraryReady] = useLibraryTunes();
  const lists: Record<TuneListId, { tunes: Tune[]; setTunes: Setter }> = {
    tunes: { tunes, setTunes },
    learn: { tunes: learn, setTunes: setLearn },
    library: { tunes: library, setTunes: setLibrary },
  };
  return { lists, ready: tunesReady && learnReady && libraryReady, canLearn: isAuthenticated };
}

export type TuneListsValue = ReturnType<typeof useTuneLists>['lists'];

export function asTuneListId(value: string | undefined): TuneListId {
  return value === 'learn' || value === 'library' ? value : 'tunes';
}

/** Finds a tune in any list (`prefer` first). */
export function findTune(lists: TuneListsValue, id: string | undefined, prefer?: string): { list: TuneListId; tune: Tune } | null {
  if (!id) return null;
  const order = [...TUNE_LIST_IDS].sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : 0));
  for (const list of order) {
    const tune = lists[list].tunes.find((t) => t.id === id);
    if (tune) return { list, tune };
  }
  return null;
}

/** Every tune in every list, with the list it's in. */
export function allTunes(lists: TuneListsValue): { list: TuneListId; tune: Tune }[] {
  return TUNE_LIST_IDS.flatMap((list) => lists[list].tunes.map((tune) => ({ list, tune })));
}

/** Moves a tune to the end of another list. */
export function moveTune(lists: TuneListsValue, from: TuneListId, to: TuneListId, tune: Tune) {
  if (from === to) return;
  lists[from].setTunes((prev) => prev.filter((t) => t.id !== tune.id));
  lists[to].setTunes((prev) => [...prev.filter((t) => t.id !== tune.id), tune]);
}

/** Of a tune's charts, the ones no other tune (in any list) has — what goes when it does. */
export function chartsOnlyOn(lists: TuneListsValue, tune: Tune, ids: string[] = tuneChartIds(tune)): string[] {
  const others = (list: TuneListId) => lists[list].tunes.filter((t) => t.id !== tune.id);
  const elsewhere = linkedChartIds({ tunes: others('tunes'), learn: others('learn'), library: others('library') });
  return ids.filter((id) => !elsewhere.has(id));
}

/** Takes a deleted chart off every tune that has it (a chart deleted from its own menu). */
export function useForgetChart() {
  const { lists } = useTuneLists();
  return (chartId: string) => {
    for (const list of TUNE_LIST_IDS) {
      if (!lists[list].tunes.some((t) => tuneChartIds(t).includes(chartId))) continue;
      lists[list].setTunes((prev) => prev.map((t) => (tuneChartIds(t).includes(chartId) ? removeChartFromTune(t, chartId) : t)));
    }
  };
}

/**
 * Links charts to tunes the way the website does (`linkChartsToTunes`): the tune that already has
 * it, else the first tune with the same name, else a new tune in the Library list. Reads the lists
 * as they are when called (safe right after an import's await). Returns null — and changes
 * nothing — until every list is the account's own copy, so it can't write over the account's
 * lists from a stale phone copy.
 */
export function useChartLinker() {
  const { isAuthenticated } = useConvexAuth();
  const { lists } = useTuneLists();
  const setters = { tunes: lists.tunes.setTunes, learn: lists.learn.setTunes, library: lists.library.setTunes };
  function link(charts: ChartToLink[], opts: { tags?: string[] } = {}): LinkResult | null {
    const now = { tunes: useSyncedTunes.read(isAuthenticated), learn: useTunesToLearn.read(isAuthenticated), library: useLibraryTunes.read(isAuthenticated) };
    if (!now.tunes.synced || !now.learn.synced || !now.library.synced) return null;
    const result = linkChartsToTunes({ tunes: now.tunes.tunes, learn: now.learn.tunes, library: now.library.tunes }, charts, { tags: opts.tags, makeId });
    for (const list of TUNE_LIST_IDS) {
      const next = result.lists[list];
      if (next) setters[list](next);
    }
    return result;
  }
  return link;
}

/** "D♭, F · 160 BPM · 4/4": a tune's keys (with the music symbols), tempos and meter. */
export function tuneSummary(tune: Tune): string {
  const keys = tune.keys.filter((k) => k.enabled).map((k) => prettyKeyName(k.value));
  const tempos = tune.tempos.filter((t) => t.enabled).map((t) => t.value);
  return [keys.join(', ') || null, tempos.length ? `${tempos.join(', ')} BPM` : null, tune.timeSignature]
    .filter(Boolean)
    .join(' · ');
}
