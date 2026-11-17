"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ChordChart from "@/components/ChordChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import Link from "next/link";
import { ChartMeta, ChartPaper, ReaderBar, RoundButton } from "@/components/library/chartView";
import { playlistHref } from "@/components/library/ChartsDashboard";
import { BackButton } from "@/components/library/shared";
import { EmptyState, FolderIcon, KeyBadge, LibraryPage, Pill } from "@/components/library/ui";
import { TUNE_LIST_LABEL, tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { displayKey, isMinorKey } from "@jam-practice/core/setlistKeys";
import { useChartActions } from "@/components/library/useChartActions";
import Select from "@/components/Select";
import { ChevronLeftIcon, DotsVerticalIcon, MaximizeIcon, MinimizeIcon } from "@/components/tools";
import { formatComposer, KEY_NAMES, keyPitchClass, transposeSong } from "@/lib/iRealPro";
import { useRecentCharts } from "@/lib/recents";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

/** One chord chart on its own page: title and details up top, a key selector (display-only
    transpose), full-screen, and the chart ⋮ menu (edit / playlists / delete). Opening it puts it in
    "Recently opened". */
export default function ChartViewPage({ id }: { id: string }) {
  const router = useRouter();
  const { selectedSong: chart, selectedSongLoading, loading, allSongs, playlists } = useChordChartsLibrary(id || null);
  const { openSongMenu, element } = useChartActions({ onSongDeleted: () => router.back() });
  const [transposeKey, setTransposeKey] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const lists = useTuneLists();

  const { record } = useRecentCharts();
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  });
  useEffect(() => {
    if (id) recordRef.current(id);
  }, [id]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const meta = allSongs.find((s) => s.id === id);
  const shown = useMemo(() => {
    if (!chart || !transposeKey) return chart;
    const semis = (KEY_NAMES.indexOf(transposeKey) - keyPitchClass(chart.key) + 12) % 12;
    return semis ? transposeSong(chart, semis) : chart;
  }, [chart, transposeKey]);

  const linkedTunes = [
    ...lists.tunes.tunes.filter((t) => t.chordChartId === id).map((t) => ({ tune: t, list: "tunes" as TuneListId })),
    ...lists.learn.tunes.filter((t) => t.chordChartId === id).map((t) => ({ tune: t, list: "learn" as TuneListId })),
  ];
  const keyOptions = chart ? [{ value: "", label: `Original (${chart.key ? displayKey(chart.key) : "—"})` }, ...KEY_NAMES.map((k) => ({ value: k, label: k }))] : [];

  if (loading || selectedSongLoading) {
    return (
      <LibraryPage>
        <div className="flex justify-center py-24">
          <LoadingSpinner label="Loading chart…" showLabel />
        </div>
      </LibraryPage>
    );
  }
  if (!chart || !shown) {
    return (
      <LibraryPage>
        <BackButton onClick={() => router.back()} />
        <EmptyState boxed title="Chart not found" body="That chart isn't in your library." action={<Pill label="Chord Charts" href="/tunes?tab=charts" />} />
      </LibraryPage>
    );
  }

  const originalPc = chart.key ? keyPitchClass(chart.key) : -1;
  const minor = chart.key ? isMinorKey(chart.key) : false;
  const shownPc = shown.key ? keyPitchClass(shown.key) : -1;

  return (
    <LibraryPage>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          title="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground sm:h-9 sm:w-9"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <KeyBadge label={shown.key} />
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="line-clamp-2 text-2xl font-semibold leading-tight tracking-tight">{chart.title}</h1>
          {chart.composer && <p className="truncate text-sm text-muted">{formatComposer(chart.composer)}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="xl:hidden">
            <Select value={transposeKey} onChange={setTransposeKey} options={keyOptions} className="min-w-32" />
          </span>
          <RoundButton label="Full screen" onClick={() => setFullscreen(true)}>
            <MaximizeIcon className="h-4 w-4" />
          </RoundButton>
          {meta && (
            <RoundButton label="Chart options" onClick={(e) => openSongMenu(e, meta, null)}>
              <DotsVerticalIcon className="h-4 w-4" />
            </RoundButton>
          )}
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <ChartPaper top={<ChartMeta song={shown} originalKey={chart.key} composer={false} />}>
          <ChordChart song={shown} hideHeader />
        </ChartPaper>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
          <section className="hidden flex-col gap-3 rounded-lg bg-surface p-4 xl:flex">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Key</h2>
              {transposeKey && (
                <button type="button" onClick={() => setTransposeKey("")} className="text-xs text-muted hover:text-foreground">
                  Back to {chart.key ? displayKey(chart.key) : "original"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {KEY_NAMES.map((name, pc) => {
                const on = pc === shownPc;
                const color = `var(--key-${pc}, var(--accent))`;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setTransposeKey(pc === originalPc ? "" : name)}
                    aria-pressed={on}
                    title={pc === originalPc ? "The key it's written in" : `Transpose to ${name}${minor ? "m" : ""}`}
                    className={`relative rounded-md py-2 text-sm font-medium transition-colors ${on ? "" : "bg-foreground/[0.05] hover:bg-surface-hover hover:text-foreground"}`}
                    style={on ? { background: color, color: "var(--accent-foreground)" } : { color: "var(--muted)" }}
                  >
                    {name}
                    {minor ? "m" : ""}
                    {pc === originalPc && !on && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">Only changes how it&apos;s shown — the chart itself stays in {chart.key ? displayKey(chart.key) : "its key"}.</p>
          </section>

          <section className="flex flex-col gap-2 rounded-lg bg-surface p-4">
            <h2 className="text-sm font-medium">Playlists</h2>
            {meta && meta.playlistIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {meta.playlistIds.map((pid) => (
                  <Link key={pid} href={playlistHref(pid)} className="inline-flex items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium hover:bg-surface-hover">
                    <FolderIcon className="h-3.5 w-3.5 text-muted" />
                    {playlists.find((p) => p.id === pid)?.name ?? "Playlist"}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Only in All charts.</p>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-lg bg-surface p-4">
            <h2 className="text-sm font-medium">Your tunes</h2>
            {linkedTunes.length ? (
              <div className="flex flex-col gap-1">
                {linkedTunes.map(({ tune, list }) => (
                  <Link key={tune.id} href={tuneHref(list, tune.id)} className="-mx-1.5 flex items-center gap-2.5 rounded-md p-1.5 hover:bg-surface-hover">
                    <KeyBadge label={tune.keys.find((k) => k.enabled)?.value} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{tune.name}</span>
                      <span className="block text-[11px] text-muted">{TUNE_LIST_LABEL[list]}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No tune uses this chart yet — link it from a tune&apos;s page.</p>
            )}
          </section>
        </aside>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-background pb-3">
          <ReaderBar
            onBack={() => setFullscreen(false)}
            backLabel="Exit full screen"
            backIcon={<MinimizeIcon className="h-4 w-4" />}
            keyLabel={shown.key}
            title={chart.title}
            subtitle={chart.composer ? formatComposer(chart.composer) : undefined}
          >
            <Select value={transposeKey} onChange={setTransposeKey} options={keyOptions} className="min-w-32" />
          </ReaderBar>
          <div className="flex min-h-0 flex-1 flex-col px-2 sm:px-5">
            <ChartPaper fill top={<ChartMeta song={shown} originalKey={chart.key} composer={false} />}>
              <ChordChart song={shown} fullscreen hideHeader />
            </ChartPaper>
          </div>
        </div>
      )}
      {element}
    </LibraryPage>
  );
}
