import { nameId, tidyName } from "./standards";
import { DEFAULT_TIME_SIGNATURE, type Tune } from "./types";

/**
 * Tunes and their chord charts, as one library (FB-30, 2026-11-20).
 *
 * - A tune lives in one of three lists: Tunes I Know (`"tunes"`), Tunes to Learn (`"learn"`), or
 *   the neutral Library list (`"library"`) — tunes that came in with charts and that you haven't
 *   sorted into either. Each list is one JSON array in `syncedSettings` (signed out, localStorage).
 * - Every chord chart is linked to a tune; a tune can have no chart or several. A tune keeps its
 *   charts as `chordChartId` (the main one — what older app builds, shared tunes and profiles read)
 *   plus `chordChartIds` (all of them, main first) only when there's more than one, so a library
 *   of 1,000+ tunes stays small. Always read them with `tuneChartIds` and write with
 *   `withChartIds`.
 * - Tags: `tags` on a tune, any number, filtered on in the Library.
 */

/** The `syncedSettings` key (and, signed out, the localStorage key) of the Library list. */
export const LIBRARY_TUNES_KEY = "jam-practice-library-tunes";
/** Every chart id the automatic linking has already looked at (`{ ids: string[] }`), so a chart
    you later unlink, or whose tune you delete, isn't linked again. */
export const CHARTS_LINKED_KEY = "jam-practice-charts-linked";

export type TuneListId = "tunes" | "learn" | "library";
export const TUNE_LIST_IDS: readonly TuneListId[] = ["tunes", "learn", "library"];
export const TUNE_LIST_LABEL: Record<TuneListId, string> = { tunes: "Tunes I Know", learn: "Tunes to Learn", library: "Library" };
/** Short labels for chips on a tune's row. */
export const TUNE_LIST_SHORT: Record<TuneListId, string> = { tunes: "I know", learn: "To learn", library: "Library" };

/** A tune's charts, main first. Old data has only `chordChartId`. If an older app build changed
    or removed `chordChartId` without knowing about `chordChartIds`, `chordChartId` wins: a new
    main chart replaces the old main one, and no `chordChartId` means no charts. */
export function tuneChartIds(tune: Pick<Tune, "chordChartId" | "chordChartIds">): string[] {
  const main = tune.chordChartId;
  if (!main) return [];
  const all = tune.chordChartIds;
  if (!all || all.length === 0) return [main];
  if (all[0] === main) return [...new Set(all)];
  return [main, ...all.slice(1).filter((id) => id !== main)];
}

/** The tune with exactly these charts (main first). Keeps `chordChartId` = the first, and
    `chordChartIds` only when there are two or more. */
export function withChartIds<T extends Tune>(tune: T, ids: string[]): T {
  const unique = [...new Set(ids.filter(Boolean))];
  const next = { ...tune };
  delete next.chordChartId;
  delete next.chordChartIds;
  if (unique.length > 0) next.chordChartId = unique[0];
  if (unique.length > 1) next.chordChartIds = unique;
  return next;
}

/** Adds charts to a tune (after the ones it has). */
export function addChartsToTune<T extends Tune>(tune: T, ids: string[]): T {
  return withChartIds(tune, [...tuneChartIds(tune), ...ids]);
}

/** Takes one chart off a tune (the next one becomes main if it was main). */
export function removeChartFromTune<T extends Tune>(tune: T, id: string): T {
  return withChartIds(
    tune,
    tuneChartIds(tune).filter((x) => x !== id),
  );
}

/** Makes one of a tune's charts the main one (or links it as main if it wasn't linked). */
export function makeMainChart<T extends Tune>(tune: T, id: string): T {
  return withChartIds(tune, [id, ...tuneChartIds(tune).filter((x) => x !== id)]);
}

/** Replaces the main chart (older "change linked chart" menus): the old main one is unlinked. */
export function replaceMainChart<T extends Tune>(tune: T, id: string): T {
  return withChartIds(tune, [id, ...tuneChartIds(tune).slice(1).filter((x) => x !== id)]);
}

// ---------------------------------------------------------------- tags

const tagKey = (tag: string) => tag.trim().replace(/\s+/g, " ").toLowerCase();

/** Tidies a tag as typed: trimmed, single spaces. */
export function cleanTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ").slice(0, 60);
}

export function tuneTags(tune: Pick<Tune, "tags">): string[] {
  return tune.tags ?? [];
}

/** The tune with these tags (cleaned, no duplicates ignoring case; the field is dropped when empty). */
export function withTags<T extends Tune>(tune: T, tags: string[]): T {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = cleanTag(raw);
    if (!tag || seen.has(tagKey(tag))) continue;
    seen.add(tagKey(tag));
    out.push(tag);
  }
  const next = { ...tune };
  delete next.tags;
  if (out.length) next.tags = out;
  return next;
}

export function addTags<T extends Tune>(tune: T, tags: string[]): T {
  return withTags(tune, [...tuneTags(tune), ...tags]);
}

export function hasTag(tune: Pick<Tune, "tags">, tag: string): boolean {
  const k = tagKey(tag);
  return tuneTags(tune).some((t) => tagKey(t) === k);
}

/** Renames a tag on every tune that has it (to an existing tag's name merges them). Returns the
    same array when nothing changed. */
export function renameTag(tunes: Tune[], from: string, to: string): Tune[] {
  const k = tagKey(from);
  let changed = false;
  const out = tunes.map((t) => {
    if (!tuneTags(t).some((x) => tagKey(x) === k)) return t;
    changed = true;
    return withTags(t, tuneTags(t).map((x) => (tagKey(x) === k ? to : x)));
  });
  return changed ? out : tunes;
}

/** Takes a tag off every tune. Returns the same array when nothing changed. */
export function removeTag(tunes: Tune[], tag: string): Tune[] {
  const k = tagKey(tag);
  let changed = false;
  const out = tunes.map((t) => {
    if (!tuneTags(t).some((x) => tagKey(x) === k)) return t;
    changed = true;
    return withTags(t, tuneTags(t).filter((x) => tagKey(x) !== k));
  });
  return changed ? out : tunes;
}

/** Every tag in use with how many tunes have it, A–Z (first spelling seen wins). */
export function allTags(tunes: Tune[]): { tag: string; count: number }[] {
  const byKey = new Map<string, { tag: string; count: number }>();
  for (const t of tunes)
    for (const tag of tuneTags(t)) {
      const k = tagKey(tag);
      const hit = byKey.get(k);
      if (hit) hit.count++;
      else byKey.set(k, { tag, count: 1 });
    }
  return [...byKey.values()].sort((a, b) => (a.tag.toLowerCase() < b.tag.toLowerCase() ? -1 : a.tag.toLowerCase() > b.tag.toLowerCase() ? 1 : 0));
}

// ---------------------------------------------------------------- linking charts to tunes

/** How a chart's title and a tune's name are matched: case, accents, punctuation and a leading
    (or iReal-style trailing ", The") article don't matter, and "&" is "and". */
export function tuneMatchKey(name: string): string {
  return nameId(name.replace(/&/g, " and "));
}

export type ChartToLink = {
  id: string;
  title: string;
  timeSignature?: { top: number; bottom: number };
  /** Names of the folders (playlists) it's in — used as tags with `tagWithPlaylists`. */
  playlistNames?: string[];
};

export type TuneLists = Record<TuneListId, Tune[]>;

export type LinkResult = {
  /** Only the lists that changed. */
  lists: Partial<TuneLists>;
  /** Charts added to a tune that already existed. */
  linked: number;
  /** New tunes made in the Library list. */
  created: number;
  /** Tunes given a tag (new or existing). */
  tagged: number;
};

/**
 * Links each chart to a tune: one that already has it, else the first tune (Tunes I Know, then
 * Tunes to Learn, then Library) with the same name — the chart is added to its charts — else a
 * new tune in the Library list, named after the chart. `tags` go on every tune touched;
 * `tagWithPlaylists` also tags each with the folders its charts are in. Pure: returns new arrays
 * for the lists that changed, and is safe to run twice (a chart already on a tune isn't added
 * again, and tags aren't duplicated).
 */
export function linkChartsToTunes(
  lists: TuneLists,
  charts: ChartToLink[],
  opts: { tags?: string[]; tagWithPlaylists?: boolean; makeId: () => string },
): LinkResult {
  const out: TuneLists = { tunes: lists.tunes, learn: lists.learn, library: lists.library };
  const changed = new Set<TuneListId>();
  // Where each tune is, by chart id and by name.
  const byChart = new Map<string, { list: TuneListId; index: number }>();
  const byName = new Map<string, { list: TuneListId; index: number }>();
  for (const list of TUNE_LIST_IDS) {
    out[list].forEach((tune, index) => {
      for (const id of tuneChartIds(tune)) if (!byChart.has(id)) byChart.set(id, { list, index });
      const k = tuneMatchKey(tune.name);
      if (k && !byName.has(k)) byName.set(k, { list, index });
    });
  }
  const edit = (list: TuneListId, index: number, fn: (t: Tune) => Tune) => {
    const before = out[list][index];
    const after = fn(before);
    if (after === before) return;
    if (!changed.has(list)) {
      out[list] = [...out[list]];
      changed.add(list);
    }
    out[list][index] = after;
  };
  const baseTags = opts.tags?.map(cleanTag).filter(Boolean) ?? [];
  let linked = 0;
  let created = 0;
  const taggedIds = new Set<string>();

  for (const chart of charts) {
    const tags = [...baseTags, ...(opts.tagWithPlaylists ? (chart.playlistNames ?? []) : [])];
    const tagIt = (t: Tune) => {
      if (!tags.length) return t;
      const next = addTags(t, tags);
      if ((next.tags?.length ?? 0) === (t.tags?.length ?? 0)) return t;
      taggedIds.add(t.id);
      return next;
    };
    const has = byChart.get(chart.id);
    if (has) {
      if (tags.length) edit(has.list, has.index, tagIt);
      continue;
    }
    const k = tuneMatchKey(chart.title);
    const same = k ? byName.get(k) : undefined;
    if (same) {
      edit(same.list, same.index, (t) => tagIt(addChartsToTune(t, [chart.id])));
      byChart.set(chart.id, same);
      linked++;
      continue;
    }
    const ts = chart.timeSignature;
    let tune: Tune = {
      id: opts.makeId(),
      name: tidyName(chart.title.trim()) || "Untitled",
      tempos: [],
      keys: [],
      timeSignature: ts && ts.top > 0 && ts.bottom > 0 ? `${ts.top}/${ts.bottom}` : DEFAULT_TIME_SIGNATURE,
      notes: "",
      chordChartId: chart.id,
    };
    if (tags.length) {
      tune = withTags(tune, tags);
      taggedIds.add(tune.id);
    }
    if (!changed.has("library")) {
      out.library = [...out.library];
      changed.add("library");
    }
    out.library.push(tune);
    const at = { list: "library" as const, index: out.library.length - 1 };
    byChart.set(chart.id, at);
    if (k) byName.set(k, at);
    created++;
  }

  const result: Partial<TuneLists> = {};
  for (const list of changed) result[list] = out[list];
  return { lists: result, linked, created, tagged: taggedIds.size };
}

/** Every chart id linked to any tune in these lists. */
export function linkedChartIds(lists: Partial<TuneLists>): Set<string> {
  const ids = new Set<string>();
  for (const list of TUNE_LIST_IDS) for (const t of lists[list] ?? []) for (const id of tuneChartIds(t)) ids.add(id);
  return ids;
}

/** A tune's main chart (the one shown first), if it has any. */
export function mainChartId(tune: Pick<Tune, "chordChartId" | "chordChartIds">): string | undefined {
  return tuneChartIds(tune)[0];
}
