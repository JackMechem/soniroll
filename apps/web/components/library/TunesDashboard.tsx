"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import StoragePill from "@/components/files/StoragePill";
import { menuPosition, tuneSummary } from "@/components/library/shared";
import { setlistHref } from "@/components/library/setlistParts";
import { ManageTagsDialog } from "@/components/library/TagEditor";
import { EmptyState, Hero, HeroSearch, LibraryPage, LibraryTabs, Panel, Pill, RecentStrip, Rows, Toolbar, TuneItem, useEdgeFade } from "@/components/library/ui";
import { useTuneActions } from "@/components/library/useTuneActions";
import PromptDialog from "@/components/PromptDialog";
import Select from "@/components/Select";
import StandardsPicker from "@/components/StandardsPicker";
import { ChevronRightIcon, ChordChartIcon, DownloadIcon, LibraryIcon, PlusIcon, SetlistIcon, TagIcon } from "@/components/tools";
import TuneEditorModal from "@/components/TuneEditorModal";
import { useRecentTunes } from "@/lib/recents";
import { DEFAULT_TIME_SIGNATURE, makeId, type Tune } from "@/lib/types";
import { useAutoLinkCharts } from "@/lib/useAutoLinkCharts";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { usePersistedSettings } from "@/lib/usePersistedSettings";
import { useSetlists } from "@/lib/useSetlists";
import { TUNE_LIST_IDS, TUNE_LIST_LABEL, TUNE_LIST_SHORT, tuneHref, useTuneLists, type TuneListId } from "@/lib/useTuneLists";
import { allTags, hasTag, mainChartId, removeTag, renameTag, tuneChartIds, tuneTags } from "@jam-practice/core/tuneLibrary";
import { sortByText } from "@jam-practice/core/sortText";

/** Rows shown at first, and added by "Show more" (a library of 1,000+ tunes renders in steps). */
const PAGE = 100;

type ListFilter = TuneListId | "all";
type Sort = "name" | "added";

/** This device remembers the filter and order (a per-viewer convenience). */
const VIEW_KEY = "jam-practice-library-tunes-view";
const VIEW_DEFAULTS: { list: ListFilter; tags: string[]; sort: Sort } = { list: "all", tags: [], sort: "name" };

function blankTune(name = ""): Tune {
  return { id: makeId(), name, tempos: [], keys: [], timeSignature: DEFAULT_TIME_SIGNATURE, notes: "" };
}

/** When a tune was added, from its id (`makeId` ends with the time in base 36), or 0. */
function addedAt(tune: Tune): number {
  const t = parseInt(tune.id.slice(-8), 36);
  return t > 1.5e12 && t < 4e12 ? t : 0;
}

/**
 * Library's Tunes tab: every tune in one list, filtered by which list it's in (Tunes I Know,
 * Tunes to Learn, the Library list of tunes that came in with charts) and by tags, A–Z or newest
 * first. A tune with charts has a chart mark (and a count when it has several); its page shows
 * them. Setlists and Chord Charts are a tap away, as their own pages. Charts not yet linked to a
 * tune are linked here, once (`useAutoLinkCharts`).
 */
export default function TunesDashboard() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const lists = useTuneLists();
  const { setlists, create: createSetlist } = useSetlists();
  const { allSongs, totalSongs, loading: chartsLoading } = useChordChartsLibrary(null);
  useAutoLinkCharts(allSongs, chartsLoading);
  const recent = useRecentTunes();
  const { openTuneMenu, element } = useTuneActions();
  const [view, setView] = usePersistedSettings(VIEW_KEY, VIEW_DEFAULTS);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [addMenu, setAddMenu] = useState<MenuState | null>(null);
  const [namingSetlist, setNamingSetlist] = useState(false);
  const [addingStandard, setAddingStandard] = useState<"tunes" | "learn" | null>(null);
  const [creating, setCreating] = useState<{ list: TuneListId; tune: Tune } | null>(null);
  const [managingTags, setManagingTags] = useState(false);
  const { attach: listFadeRef, style: listFadeStyle } = useEdgeFade<HTMLDivElement>();
  const { attach: tagFadeRef, style: tagFadeStyle } = useEdgeFade<HTMLDivElement>();

  const known = lists.tunes.tunes;
  const learn = lists.learn.tunes;
  const library = lists.library.tunes;
  const visibleLists = TUNE_LIST_IDS.filter((l) => l !== "learn" || isAuthenticated);
  const listFilter: ListFilter = view.list === "learn" && !isAuthenticated ? "all" : view.list;

  // Every tune once, with its list (a tune is only ever in one).
  const everything = useMemo(() => {
    const out: { tune: Tune; list: TuneListId; index: number }[] = [];
    for (const [list, tunes] of [["tunes", known], ["learn", learn], ["library", library]] as const) tunes.forEach((tune, index) => out.push({ tune, list, index }));
    return out;
  }, [known, learn, library]);
  const tags = useMemo(() => allTags(everything.map((e) => e.tune)), [everything]);
  // Tags picked on another device (or since deleted) don't filter anything.
  const pickedTags = view.tags.filter((t) => tags.some((x) => x.tag.toLowerCase() === t.toLowerCase()));
  const chartKey = useMemo(() => new Map(allSongs.map((s) => [s.id, s.key])), [allSongs]);
  const chartTitles = useMemo(() => new Map(allSongs.map((s) => [s.id, s.title])), [allSongs]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const words = q ? q.split(/\s+/) : [];
    const picked = everything.filter(({ tune, list }) => {
      if (listFilter !== "all" && list !== listFilter) return false;
      if (pickedTags.some((t) => !hasTag(tune, t))) return false;
      if (!words.length) return true;
      // Its charts' titles too (an iReal title can differ from the tune's name).
      const charts = tuneChartIds(tune).map((id) => chartTitles.get(id) ?? "");
      const text = `${tune.name} ${tuneSummary(tune)} ${tuneTags(tune).join(" ")} ${charts.join(" ")} ${tune.notes}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
    if (view.sort === "added") return [...picked].sort((a, b) => addedAt(b.tune) - addedAt(a.tune) || b.index - a.index);
    return sortByText(picked, (r) => r.tune.name);
  }, [everything, listFilter, pickedTags, q, view.sort, chartTitles]);

  const counts: Record<TuneListId, number> = { tunes: known.length, learn: learn.length, library: library.length };
  const total = known.length + (isAuthenticated ? learn.length : 0) + library.length;

  const recentCards = recent.ids
    .map((id) => everything.find((e) => e.tune.id === id))
    .filter((e) => e !== undefined)
    .slice(0, 8)
    .map(({ tune, list }) => ({
      key: tune.id,
      title: tune.name,
      href: tuneHref(list, tune.id),
      keyLabel: tune.keys.find((k) => k.enabled)?.value ?? chartKey.get(mainChartId(tune) ?? "") ?? null,
    }));

  function setFilter(patch: Partial<typeof VIEW_DEFAULTS>) {
    setView(patch);
    setShown(PAGE);
  }
  function toggleTag(tag: string) {
    const on = pickedTags.some((t) => t.toLowerCase() === tag.toLowerCase());
    setFilter({ tags: on ? pickedTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...pickedTags, tag] });
  }
  function everyList(fn: (tunes: Tune[]) => Tune[]) {
    for (const l of TUNE_LIST_IDS) lists[l].setTunes((prev) => fn(prev));
  }

  const openAddMenu = (e: React.MouseEvent) =>
    setAddMenu({
      ...menuPosition(e),
      items: [
        { label: "Add a jazz standard", onSelect: () => setAddingStandard(listFilter === "learn" ? "learn" : "tunes") },
        { label: "Add your own tune", onSelect: () => setCreating({ list: listFilter === "all" ? "tunes" : listFilter, tune: blankTune() }) },
        { label: "New chord chart", onSelect: () => router.push("/chord-charts/new") },
        { label: "Import chord charts", onSelect: () => router.push("/chord-charts/import") },
        { label: "New setlist", onSelect: () => setNamingSetlist(true) },
      ],
    });

  const filtering = listFilter !== "all" || pickedTags.length > 0 || !!q;
  const pill = (active: boolean) =>
    `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
      active ? "bg-accent/15 text-accent" : "bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"
    }`;

  return (
    <LibraryPage>
      <Hero title="Library" icon={LibraryIcon} titleExtra={<StoragePill />} helpTopic="tunes" tabs={<LibraryTabs active="tunes" />}>
        <Toolbar>
          <HeroSearch value={query} onChange={(v) => { setQuery(v); setShown(PAGE); }} placeholder={total > 1 ? `Search ${total} tunes…` : "Search your tunes…"} />
          <Pill icon={DownloadIcon} label="Import" href="/chord-charts/import" iconOnlyOnPhone />
          <Pill primary icon={PlusIcon} label="Add" onClick={openAddMenu} />
        </Toolbar>
      </Hero>

      {/* Setlists and chord charts have pages of their own, a tap away. */}
      <div className="grid grid-cols-2 gap-3">
        <ShelfLink href="/tunes?tab=setlists" icon={SetlistIcon} title="Setlists" detail={setlists.length ? `${setlists.length}` : "None yet"} />
        <ShelfLink href="/tunes?tab=charts" icon={ChordChartIcon} title="Chord charts" detail={chartsLoading ? "" : totalSongs ? `${totalSongs}` : "None yet"} />
      </div>

      {total === 0 && lists.ready ? (
        <EmptyState
          boxed
          title="No tunes yet"
          body="Add a jazz standard or your own tune, or import chord charts: each chart comes in with its tune."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Pill primary icon={PlusIcon} label="Add a tune" onClick={openAddMenu} />
              <Pill icon={DownloadIcon} label="Import charts" href="/chord-charts/import" />
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Which list: scrolls sideways on a phone. */}
          <div className="flex min-w-0 items-center gap-2">
            <div ref={listFadeRef} style={listFadeStyle} className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-1.5" role="group" aria-label="Which tunes">
                <button type="button" aria-pressed={listFilter === "all"} onClick={() => setFilter({ list: "all" })} className={pill(listFilter === "all")}>
                  All <span className="text-xs tabular-nums opacity-80">{total}</span>
                </button>
                {visibleLists.map((l) => (
                  <button key={l} type="button" aria-pressed={listFilter === l} onClick={() => setFilter({ list: l })} className={pill(listFilter === l)}>
                    {TUNE_LIST_LABEL[l]} <span className="text-xs tabular-nums opacity-80">{counts[l]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tags: tap one or more to see the tunes that have them all. */}
          {tags.length > 0 && (
            <div className="flex min-w-0 items-center gap-2">
              <TagIcon className="h-4 w-4 shrink-0 text-muted" />
              <div ref={tagFadeRef} style={tagFadeStyle} className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max gap-1.5" role="group" aria-label="Tags">
                  {tags.map(({ tag, count }) => {
                    const on = pickedTags.some((t) => t.toLowerCase() === tag.toLowerCase());
                    return (
                      <button key={tag} type="button" aria-pressed={on} onClick={() => toggleTag(tag)} className={pill(on)}>
                        <span className="max-w-[12rem] truncate">{tag}</span> <span className="text-xs tabular-nums opacity-80">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button type="button" onClick={() => setManagingTags(true)} className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground">
                Edit
              </button>
            </div>
          )}

          {!filtering && recentCards.length > 1 && <RecentStrip items={recentCards} />}

          <Panel
            title={pickedTags.length ? `${listFilter === "all" ? "Tunes" : TUNE_LIST_LABEL[listFilter]} · ${pickedTags.join(", ")}` : listFilter === "all" ? "All tunes" : TUNE_LIST_LABEL[listFilter]}
            detail={rows.length}
            flush
            actions={
              <Select
                value={view.sort}
                onChange={(v) => setFilter({ sort: v as Sort })}
                options={[
                  { value: "name", label: "A–Z" },
                  { value: "added", label: "Newest" },
                ]}
                className="w-28"
              />
            }
          >
            {rows.length === 0 ? (
              q ? (
                <EmptyState title={`Nothing matches “${query}”`} body="Try a different name, key or tag." />
              ) : listFilter === "library" ? (
                <EmptyState title="Nothing in the Library list" body="Tunes that come in with imported chord charts land here until you move them to Tunes I Know or Tunes to Learn." />
              ) : (
                <EmptyState
                  title="No tunes here yet"
                  body={pickedTags.length ? "No tune has all of those tags." : "Add a jazz standard or your own tune."}
                  action={!pickedTags.length ? <Pill primary icon={PlusIcon} label="Add a tune" onClick={openAddMenu} /> : undefined}
                />
              )
            ) : (
              <Rows>
                {rows.slice(0, shown).map(({ tune, list }) => (
                  <TuneItem
                    key={tune.id}
                    tune={tune}
                    href={tuneHref(list, tune.id)}
                    listLabel={listFilter === "all" ? TUNE_LIST_SHORT[list] : undefined}
                    chartKey={chartKey.get(mainChartId(tune) ?? "") ?? null}
                    onMenu={(e) => openTuneMenu(e, list, tune)}
                  />
                ))}
              </Rows>
            )}
            {rows.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE * 2)}
                className="flex h-11 w-full items-center justify-center border-t border-foreground/10 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
              >
                Show more ({rows.length - shown} left)
              </button>
            )}
          </Panel>
        </div>
      )}

      {element}
      {addMenu && <ContextMenu menu={addMenu} onClose={() => setAddMenu(null)} />}
      {managingTags && (
        <ManageTagsDialog
          tags={tags}
          onRename={(from, to) => {
            everyList((tunes) => renameTag(tunes, from, to));
            if (pickedTags.some((t) => t.toLowerCase() === from.toLowerCase())) setFilter({ tags: pickedTags.map((t) => (t.toLowerCase() === from.toLowerCase() ? to : t)) });
          }}
          onDelete={(tag) => {
            everyList((tunes) => removeTag(tunes, tag));
            setFilter({ tags: pickedTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) });
          }}
          onClose={() => setManagingTags(false)}
        />
      )}
      {namingSetlist && (
        <PromptDialog
          title="New setlist"
          initialValue=""
          placeholder="e.g. Friday gig"
          confirmLabel="Create"
          onSubmit={(name) => {
            setNamingSetlist(false);
            router.push(setlistHref(createSetlist(name).id));
          }}
          onCancel={() => setNamingSetlist(false)}
        />
      )}
      {addingStandard && (
        <StandardsPicker
          tunes={lists[addingStandard].tunes}
          setTunes={lists[addingStandard].setTunes}
          // Say (and let you switch) which list the standards go into. Tunes to Learn needs an account.
          listChoice={{
            value: addingStandard,
            options: (isAuthenticated ? (["tunes", "learn"] as const) : (["tunes"] as const)).map((l) => ({ value: l, label: TUNE_LIST_LABEL[l] })),
            onChange: (l) => setAddingStandard(l as "tunes" | "learn"),
          }}
          onClose={() => setAddingStandard(null)}
          onCreateCustom={(name) => {
            setCreating({ list: addingStandard, tune: blankTune(name) });
            setAddingStandard(null);
          }}
        />
      )}
      {creating && (
        <TuneEditorModal
          initial={creating.tune}
          isNew
          onSave={(t) => {
            lists[creating.list].setTunes((prev) => [...prev, t]);
            setCreating(null);
          }}
          onClose={() => setCreating(null)}
        />
      )}
    </LibraryPage>
  );
}

/** A link to one of Library's own pages (Setlists, Chord charts): icon, name, how many, chevron. */
function ShelfLink({ href, icon: Icon, title, detail }: { href: string; icon: React.ComponentType<{ className?: string }>; title: string; detail: string }) {
  return (
    <Link href={href} className="flex min-h-12 min-w-0 items-center gap-3 rounded-lg bg-surface px-3 py-2 transition-colors hover:bg-surface-hover">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent max-[359px]:hidden">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs tabular-nums text-muted">{detail}</span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted max-sm:hidden" />
    </Link>
  );
}
