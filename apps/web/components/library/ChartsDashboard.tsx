"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import PromptDialog from "@/components/PromptDialog";
import { menuPosition } from "@/components/library/shared";
import { ChartItem, EmptyState, Hero, HeroSearch, LibraryPage, LibraryTabs, Panel, Pill, PlaylistItem, RecentStrip, Rows, Toolbar } from "@/components/library/ui";
import { ALL_CHARTS_ID, useChartActions } from "@/components/library/useChartActions";
import { LibraryIcon, DownloadIcon, PlusIcon } from "@/components/tools";
import { formatComposer } from "@/lib/iRealPro";
import { useRecentCharts } from "@/lib/recents";
import { sortByText } from "@jam-practice/core/sortText";
import { useChordChartsLibrary, type LibrarySongMeta } from "@/lib/useChordChartsLibrary";
import StoragePill from "@/components/files/StoragePill";

/** Up to this many charts are listed on the tab itself (all of them when there are no folders). */
const LIST_ON_TAB_MAX = 40;

export const chartHref = (id: string) => `/chord-charts/view?id=${encodeURIComponent(id)}`;
export const playlistHref = (id: string) => `/chord-charts/playlist?id=${encodeURIComponent(id)}`;

/**
 * Library's Chord Charts tab — search across every chart, a slim row of the charts you opened
 * lately, then the folders as the main view: All charts first, then each folder (a row each,
 * ⋮ to delete) and a quiet "New folder" row — shown once a folder exists. With no folders or
 * only a few charts, the charts themselves are listed below too. (Folders are `playlists` in the data and
 * in Convex — only the name people see changed.) The "+ New" menu makes a chart or a folder,
 * or imports. A chart opens on its own page (`ChartViewPage`); every chart row has the chart ⋮
 * menu (`useChartActions`).
 */
export default function ChartsDashboard() {
  const router = useRouter();
  const { playlists: raw, allSongs, totalSongs, loading, createPlaylist } = useChordChartsLibrary(null);
  const { openSongMenu, openPlaylistMenu, element } = useChartActions();
  const recent = useRecentCharts();
  const [query, setQuery] = useState("");
  const [addMenu, setAddMenu] = useState<MenuState | null>(null);
  const [naming, setNaming] = useState(false);

  const playlists = useMemo(() => sortByText(raw, (p) => p.name), [raw]);
  // Every chart once ("All charts"), with its playlists' names for subtitles.
  const index = useMemo(() => {
    const m = new Map<string, { song: LibrarySongMeta; playlistName: string }>();
    for (const s of allSongs) m.set(s.id, { song: s, playlistName: s.playlistNames });
    return m;
  }, [allSongs]);

  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!q) return null;
    const words = q.split(/\s+/);
    return sortByText(
      [...index.values()].filter(({ song }) => words.every((w) => `${song.title} ${song.composer} ${song.style}`.toLowerCase().includes(w))),
      (h) => h.song.title,
    );
  }, [q, index]);

  // With no folders (a new library) or only a few charts, the charts are listed right here under
  // the folder rows, so they aren't hidden one tap away in "All charts".
  const listed = useMemo(
    () => (playlists.length === 0 || totalSongs <= LIST_ON_TAB_MAX ? sortByText([...index.values()], (h) => h.song.title).slice(0, LIST_ON_TAB_MAX) : []),
    [playlists.length, totalSongs, index],
  );

  const recentCards = recent.ids
    .map((id) => index.get(id))
    .filter((x) => x !== undefined)
    .map((r) => ({ key: r.song.id, title: r.song.title, detail: r.playlistName || (r.song.composer ? formatComposer(r.song.composer) : ""), href: chartHref(r.song.id), keyLabel: r.song.key }));

  const openNewMenu = (e: React.MouseEvent) =>
    setAddMenu({
      ...menuPosition(e),
      items: [
        { label: "New chord chart", onSelect: () => router.push("/chord-charts/new") },
        { label: "New folder", onSelect: () => setNaming(true) },
      ],
    });

  return (
    <LibraryPage>
      <Hero
        title="Library"
        icon={LibraryIcon}
        titleExtra={<StoragePill />}
        helpTopic="chord-charts"
        tabs={<LibraryTabs active="charts" />}
      >
        <Toolbar>
          <HeroSearch value={query} onChange={setQuery} placeholder={totalSongs > 1 ? `Search ${totalSongs} charts…` : "Search charts…"} />
          {/* Phones: Import shrinks to its icon, so the search keeps most of the row. */}
          <Pill icon={DownloadIcon} label="Import" href="/chord-charts/import" iconOnlyOnPhone />
          <Pill primary icon={PlusIcon} label="New" onClick={openNewMenu} />
        </Toolbar>
      </Hero>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading your charts…" showLabel />
        </div>
      ) : hits ? (
        <Panel title="Results" detail={hits.length} flush>
          {hits.length === 0 ? (
            <EmptyState title={`No charts match “${query}”`} body="Try part of a title, a composer or a style." />
          ) : (
            <Rows>
              {hits.slice(0, 200).map((h) => (
                <ChartItem
                  key={h.song.id}
                  song={h.song}
                  subtitle={[h.song.composer ? formatComposer(h.song.composer) : null, h.playlistName].filter(Boolean).join(" · ")}
                  href={chartHref(h.song.id)}
                  onMenu={(e) => openSongMenu(e, h.song, null)}
                />
              ))}
            </Rows>
          )}
        </Panel>
      ) : totalSongs === 0 && playlists.length === 0 ? (
        <EmptyState
          boxed
          title="No chord charts yet"
          body="Build a chart bar by bar, or import a chart link or a whole iReal Pro playlist."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Pill primary icon={PlusIcon} label="New chord chart" href="/chord-charts/new" />
              <Pill icon={DownloadIcon} label="Import" href="/chord-charts/import" />
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <RecentStrip items={recentCards.slice(0, 8)} />

          {/* The folder card only once there's a folder: before that, "All charts" would just
              repeat the Charts list below (New folder is in the New menu). */}
          {playlists.length > 0 && (
            <div className="overflow-hidden rounded-lg bg-surface">
              <Rows>
                <PlaylistItem all name="All charts" count={totalSongs} href={playlistHref(ALL_CHARTS_ID)} />
                {playlists.map((p) => (
                  <PlaylistItem
                    key={p.id}
                    name={p.name}
                    count={p.songs.length}
                    href={playlistHref(p.id)}
                    onMenu={(e) => openPlaylistMenu(e, { id: p.id, name: p.name, count: p.songs.length })}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setNaming(true)}
                  className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <PlusIcon className="h-4 w-4 shrink-0" />
                  New folder
                </button>
              </Rows>
            </div>
          )}

          {listed.length > 0 && (
            <Panel
              title="Charts"
              detail={totalSongs}
              flush
              href={totalSongs > listed.length ? playlistHref(ALL_CHARTS_ID) : undefined}
            >
              <Rows>
                {listed.map((h) => (
                  <ChartItem
                    key={h.song.id}
                    song={h.song}
                    subtitle={[h.song.composer ? formatComposer(h.song.composer) : null, h.playlistName].filter(Boolean).join(" · ")}
                    href={chartHref(h.song.id)}
                    onMenu={(e) => openSongMenu(e, h.song, null)}
                  />
                ))}
              </Rows>
            </Panel>
          )}
        </div>
      )}

      {element}
      {addMenu && <ContextMenu menu={addMenu} onClose={() => setAddMenu(null)} />}
      {naming && (
        <PromptDialog
          title="New folder"
          initialValue=""
          onSubmit={(name) => {
            if (name.trim()) void createPlaylist(name.trim());
            setNaming(false);
          }}
          onCancel={() => setNaming(false)}
        />
      )}
    </LibraryPage>
  );
}
