"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { chartHref } from "@/components/library/hrefs";
import { ChartItem, EmptyState, FolderIcon, Hero, HeroSearch, LibraryPage, Pill, Rows, Toolbar } from "@/components/library/ui";
import { ALL_CHARTS_ID, useChartActions } from "@/components/library/useChartActions";
import { ChordChartIcon, DotsVerticalIcon, PlusIcon } from "@/components/tools";
import { sortByText } from "@jam-practice/core/sortText";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

/** One playlist's charts — or, for `ALL_CHARTS_ID`, every chart in the library — alphabetical and
    searchable, each opening its own page; + adds a chart here, ⋮ deletes the playlist. */
export default function PlaylistPage({ id }: { id: string }) {
  const router = useRouter();
  const { playlists, allSongs, loading } = useChordChartsLibrary(null);
  const { openSongMenu, openPlaylistMenu, element } = useChartActions({ onPlaylistDeleted: () => router.push("/tunes") });
  const [query, setQuery] = useState("");
  const isAll = id === ALL_CHARTS_ID;
  const playlist = useMemo(
    () => (isAll ? { id: ALL_CHARTS_ID, name: "All charts", songs: allSongs } : playlists.find((p) => p.id === id)),
    [isAll, allSongs, playlists, id],
  );

  const q = query.trim().toLowerCase();
  const songs = useMemo(() => {
    const all = sortByText(playlist?.songs ?? [], (s) => s.title);
    return q ? all.filter((s) => `${s.title} ${s.composer}`.toLowerCase().includes(q)) : all;
  }, [playlist, q]);

  // Alphabetical sections ("A", "B", … "#" for anything that doesn't start with a letter).
  const sections = useMemo(() => {
    const out: { letter: string; songs: typeof songs }[] = [];
    for (const song of songs) {
      const first = song.title.trim().charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(first) ? first : "#";
      const last = out[out.length - 1];
      if (last && last.letter === letter) last.songs.push(song);
      else out.push({ letter, songs: [song] });
    }
    return out;
  }, [songs]);

  return (
    <LibraryPage>
      <Hero
        title={playlist?.name ?? "Folder"}
        icon={isAll ? ChordChartIcon : FolderIcon}
        backHref="/tunes"
        backLabel="Tunes"
        subtitle={playlist ? `${isAll ? "Every chart in your library" : "Folder"} · ${playlist.songs.length} chart${playlist.songs.length === 1 ? "" : "s"}` : undefined}
        rule={false}
      >
        {/* Search, then a labelled New chart and the folder's ⋮ on the same row (phones too). */}
        {playlist && !loading && (
          <Toolbar>
            <HeroSearch value={query} onChange={setQuery} placeholder={playlist.songs.length > 1 ? `Search ${playlist.songs.length} in ${playlist.name}…` : `Search ${playlist.name}…`} />
            <Pill primary icon={PlusIcon} label="New chart" href={isAll ? "/chord-charts/new" : `/chord-charts/new?playlist=${encodeURIComponent(playlist.name)}`} />
            {!isAll && (
              <button
                type="button"
                onClick={(e) => openPlaylistMenu(e, { id: playlist.id, name: playlist.name, count: playlist.songs.length })}
                aria-label={`Options for ${playlist.name}`}
                title="More"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground sm:h-9 sm:w-9"
              >
                <DotsVerticalIcon className="h-4 w-4" />
              </button>
            )}
          </Toolbar>
        )}
      </Hero>
      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : !playlist ? (
        <EmptyState boxed title="Folder not found" body="This folder isn't in your library anymore." action={<Pill label="Back to Tunes" href="/tunes" />} />
      ) : songs.length === 0 ? (
        <EmptyState
          boxed
          title={q ? `No charts match “${query}”` : "No charts here yet"}
          body={q ? undefined : isAll ? "Create a chart or import some." : "Create a chart here, or add charts from a chart's ⋮ menu."}
        />
      ) : (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg bg-surface">
            {sections.map((sec) => (
              <section key={sec.letter} id={`letter-${sec.letter}`} className="scroll-mt-24 border-t border-foreground/10 first:border-t-0">
                <h2 className="sticky top-0 z-[1] border-b border-foreground/10 bg-surface/95 px-3 py-1.5 text-xs font-medium text-muted backdrop-blur">{sec.letter}</h2>
                <Rows>
                  {sec.songs.map((s) => (
                    <ChartItem key={s.id} song={s} href={chartHref(s.id)} onMenu={(e) => openSongMenu(e, s, isAll ? null : playlist.id)} />
                  ))}
                </Rows>
              </section>
            ))}
          </div>
          {sections.length > 6 && (
            <nav aria-label="Jump to letter" className="sticky top-6 hidden h-fit flex-col items-center gap-0.5 rounded-md bg-foreground/[0.05] px-0.5 py-1.5 sm:flex">
              {sections.map((sec) => (
                <a key={sec.letter} href={`#letter-${sec.letter}`} className="flex h-5 w-6 items-center justify-center rounded-sm text-[10px] font-medium text-muted hover:bg-surface-hover hover:text-foreground">
                  {sec.letter}
                </a>
              ))}
            </nav>
          )}
        </div>
      )}
      {element}
    </LibraryPage>
  );
}
