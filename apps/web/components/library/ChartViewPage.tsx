"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ChordChart from "@/components/ChordChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import Link from "next/link";
import { ChartMeta, ChartPaper, ReaderBar, RoundButton } from "@/components/library/chartView";
import PageBar from "@/components/PageBar";
import { chartCrumbs } from "@/components/library/chartCrumbs";
import { UNDER_TUNES } from "@/components/library/hrefs";
import { EmptyState, gridKeyName, Hero, KeyBadge, LibraryPage, Pill, prettyKey } from "@/components/library/ui";
import { TUNE_LIST_LABEL, tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { moveTune } from "@/lib/useTuneLists";
import { addChartsToTune, tuneChartIds, tuneMatchKey, tuneTags } from "@jam-practice/core/tuneLibrary";
import { tidyName } from "@jam-practice/core/standards";
import { displayKey, isMinorKey } from "@jam-practice/core/setlistKeys";
import { useChartActions } from "@/components/library/useChartActions";
import { playAlongHref } from "@/components/library/usePlayAlong";
import Select from "@/components/Select";
import { BassIcon, DotsVerticalIcon, LibraryIcon, MaximizeIcon, MinimizeIcon, PencilIcon, PlusIcon } from "@/components/tools";
import { goBackOr } from "@/lib/goBack";
import { formatComposer, KEY_NAMES, keyPitchClass, transposeSong } from "@/lib/iRealPro";
import { useRecentCharts } from "@/lib/recents";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { DEFAULT_TIME_SIGNATURE, makeId, type Tune } from "@/lib/types";

/** One chord chart on its own page: title and details up top, a key selector (display-only
    transpose), full-screen, and the chart ⋮ menu (edit / playlists / delete). Opening it puts it in
    "Recently opened". */
export default function ChartViewPage({ id }: { id: string }) {
  const router = useRouter();
  const { selectedSong: chart, selectedSongLoading, loading, allSongs } = useChordChartsLibrary(id || null);
  const { openSongMenu, element } = useChartActions({ onSongDeleted: () => goBackOr(router, "/tunes") });
  const [transposeKey, setTransposeKey] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const lists = useTuneLists();
  const { isAuthenticated } = useConvexAuth();

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

  const linkedTunes = (["tunes", "learn", "library"] as TuneListId[]).flatMap((list) =>
    lists[list].tunes.filter((t) => tuneChartIds(t).includes(id)).map((t) => ({ tune: t, list })),
  );
  /** Puts this chart's tune in one of your lists: its tune moves there if it has one (from the
      Library list, say), else the tune of the same name in that list gets the chart, else a new
      tune with the chart's title, key and time. */
  function addToList(list: TuneListId) {
    if (!chart) return;
    const own = linkedTunes.find((l) => l.list !== list);
    if (own) {
      moveTune(lists, own.list, list, own.tune);
      return;
    }
    const name = tuneMatchKey(chart.title);
    lists[list].setTunes((prev) => {
      if (prev.some((t) => tuneMatchKey(t.name) === name)) {
        return prev.map((t) => (tuneMatchKey(t.name) === name ? addChartsToTune(t, [id]) : t));
      }
      const tune: Tune = {
        id: makeId(),
        name: tidyName(chart.title),
        tempos: [],
        keys: chart.key ? [{ id: makeId(), value: displayKey(chart.key), enabled: true }] : [],
        timeSignature: chart.timeSignature ? `${chart.timeSignature.top}/${chart.timeSignature.bottom}` : DEFAULT_TIME_SIGNATURE,
        notes: "",
        chordChartId: id,
      };
      return [...prev, tune];
    });
  }
  const inList = (list: TuneListId) => linkedTunes.some((l) => l.list === list);

  const keyOptions = chart ? [{ value: "", label: `${chart.key ? prettyKey(chart.key) : "—"} (original)` }, ...KEY_NAMES.map((k) => ({ value: k, label: prettyKey(k) }))] : [];

  if (loading || selectedSongLoading) {
    return (
      <LibraryPage>
        <PageBar crumbs={[...UNDER_TUNES, { label: "Chart" }]} icon={LibraryIcon} />
        <div className="flex justify-center py-24">
          <LoadingSpinner label="Loading chart…" showLabel />
        </div>
      </LibraryPage>
    );
  }
  if (!chart || !shown) {
    return (
      <LibraryPage>
        <PageBar crumbs={[...UNDER_TUNES, { label: "Chart" }]} icon={LibraryIcon} />
        <EmptyState boxed title="Chart not found" body="That chart isn't in your library." action={<Pill label="Tunes" href="/tunes" />} />
      </LibraryPage>
    );
  }

  const originalPc = chart.key ? keyPitchClass(chart.key) : -1;
  const minor = chart.key ? isMinorKey(chart.key) : false;
  const shownPc = shown.key ? keyPitchClass(shown.key) : -1;

  const trail = chartCrumbs(linkedTunes[0], chart.title);
  return (
    <LibraryPage>
      <Hero
        title={trail.title}
        crumbs={trail.parents}
        icon={LibraryIcon}
        subtitle={chart.composer ? formatComposer(chart.composer) : undefined}
        leading={<KeyBadge label={shown.key} size="lg" />}
        actions={
          // On phones the key select gets its own full-width row under the buttons, so
          // "Gm (original)" is never cut; wider, everything sits in one row.
          <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap">
            <Pill icon={PencilIcon} label="Edit" iconOnlyOnPhone href={`/chord-charts/edit?id=${encodeURIComponent(id)}`} />
            {/* The band (Rhythm Section) plays this chart, in the key shown. */}
            <Pill primary icon={BassIcon} label="Play along" onClick={() => router.push(playAlongHref(id, transposeKey))} />
            <span className="order-last min-w-0 basis-full sm:order-none sm:basis-auto xl:hidden">
              <Select value={transposeKey} onChange={setTransposeKey} options={keyOptions} className="w-full sm:min-w-32" />
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
        }
      />

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
                  Back to {chart.key ? prettyKey(chart.key) : "original"}
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
                    title={pc === originalPc ? "The key it's written in" : `Transpose to ${gridKeyName(name, minor)}`}
                    className={`relative rounded-md py-2 text-sm font-medium transition-colors ${on ? "" : "bg-foreground/[0.05] hover:bg-surface-hover hover:text-foreground"}`}
                    style={on ? { background: color, color: "var(--accent-foreground)" } : { color: "var(--muted)" }}
                  >
                    {gridKeyName(name, minor)}
                    {pc === originalPc && !on && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">Only changes how it&apos;s shown — the chart itself stays in {chart.key ? prettyKey(chart.key) : "its key"}.</p>
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
                      <span className="block truncate text-[11px] text-muted">{[TUNE_LIST_LABEL[list], ...tuneTags(tune)].join(" · ")}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">None of your tunes uses this chart yet.</p>
            )}
            {/* Tunes to Learn only exists in an account. */}
            {(!inList("tunes") || (isAuthenticated && !inList("learn"))) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {!inList("tunes") && (
                  <button type="button" onClick={() => addToList("tunes")} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
                    <PlusIcon className="h-4 w-4" /> {linkedTunes.length ? "Move to" : "Add to"} {TUNE_LIST_LABEL.tunes}
                  </button>
                )}
                {isAuthenticated && !inList("learn") && (
                  <button type="button" onClick={() => addToList("learn")} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
                    <PlusIcon className="h-4 w-4" /> {linkedTunes.length ? "Move to" : "Add to"} {TUNE_LIST_LABEL.learn}
                  </button>
                )}
              </div>
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
