"use client";

import { UNDER_TUNES } from "@/components/library/hrefs";
import PageBar from "@/components/PageBar";
import { ChartPaper } from "@/components/library/chartView";
import { gridKeyName, Hero, KeyBadge, LibraryPage, Pill, prettyKey } from "@/components/library/ui";
import { useConvexAuth } from "@convex-dev/auth/react";
import AttachedNotes from "@/components/shednotes/AttachedNotes";
import { usePersistedSettings } from "@/lib/usePersistedSettings";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ChordChart from "@/components/ChordChart";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { menuPosition } from "@/components/library/shared";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import TuneEditorModal from "@/components/TuneEditorModal";
import ChartLinkPicker from "@/components/library/ChartLinkPicker";
import { playAlongHref } from "@/components/library/usePlayAlong";
import { TuneRecordings } from "@/components/recordings/RecordingParts";
import { TuneFiles } from "@/components/files/FileParts";
import TuneShareDialog from "@/components/files/TuneShareDialog";
import { BassIcon, CheckIcon, ChordChartIcon, DotsVerticalIcon, DownloadIcon, LibraryIcon, LinkIcon, PencilIcon, RepeatIcon, ShareIcon, TrashIcon } from "@/components/tools";
import { KEY_NAMES, keyPitchClass, transposeSong } from "@/lib/iRealPro";
import { goBackOr } from "@/lib/goBack";
import { makeId, type Tune } from "@/lib/types";
import { STANDARDS, nameId } from "@/lib/standards";
import { useChordChartsLibrary, type LibrarySongMeta } from "@/lib/useChordChartsLibrary";
import { useRecentTunes } from "@/lib/recents";
import { findTune, moveTune, TUNE_LIST_IDS, TUNE_LIST_LABEL as LIST_LABEL, useTuneLists, type TuneListId as ListId } from "@/lib/useTuneLists";
import { TagEditor } from "@/components/library/TagEditor";
import {
  addChartsToTune,
  allTags,
  linkedChartIds,
  makeMainChart,
  removeChartFromTune,
  tuneChartIds,
  tuneMatchKey as titleKey,
  tuneTags,
  withTags,
} from "@jam-practice/core/tuneLibrary";

const NOTES_SAVE_MS = 600;

/** Minor if the tune's own keys are written as minor ("Dm", "D-", "Dmin"). */
function isMinorKey(value: string) {
  return /^[A-Ga-g][#b]?(m(?!aj)|-|min)/.test(value.trim());
}

/**
 * A tune's own page — a hub for *learning* it, mirroring the mobile app's tune page: its chord
 * chart right on the page (transposable), the 12 keys as a grid you mark as you learn them (that's
 * the tune's own key list — the keys Jam Practice picks from), and notes you write straight in,
 * saved as you type. Edit opens the usual tune form; the tune can be moved between Tunes I Know
 * and Tunes to Learn, or deleted. Linked from every tune in the account's tune lists.
 */
/** Phones: whether a tune's chart fits the screen (else full size, scrolling sideways). Fits by
    default, so nothing's cut off on the right; "Zoom in" is remembered once picked. */
const CHART_VIEW_KEY = "jam-practice-tune-chart-view";
const CHART_VIEW_DEFAULTS = { fit: true };

export default function TuneHub({ id, list: listParam }: { id: string; list?: string }) {
  const router = useRouter();
  const lists = useTuneLists();

  // Look in every list (editing or moving can change which one it's in); prefer the one linked to.
  const found = findTune(lists, id, listParam);

  if (!found) {
    return (
      <LibraryPage>
        <PageBar crumbs={[...UNDER_TUNES, { label: "Tune" }]} icon={LibraryIcon} />
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-muted">That tune isn&apos;t in your lists.</p>
          <Link href="/tunes" className="text-sm font-semibold text-accent">
            Go to your tunes
          </Link>
        </div>
      </LibraryPage>
    );
  }
  return (
    <Hub
      key={found.tune.id}
      list={found.list}
      tune={found.tune}
      setTunes={lists[found.list].setTunes}
      moveTo={(target) => moveTune(lists, found.list, target, found.tune)}
      canUseLearn={lists.canLearn}
      knownTags={allTags([...lists.tunes.tunes, ...lists.learn.tunes, ...lists.library.tunes]).map((t) => t.tag)}
      onDeleted={() => goBackOr(router, "/tunes")}
    />
  );
}

function Hub({
  list,
  tune,
  setTunes,
  moveTo,
  canUseLearn,
  knownTags,
  onDeleted,
}: {
  list: ListId;
  tune: Tune;
  setTunes: (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;
  moveTo: (target: ListId) => void;
  canUseLearn: boolean;
  knownTags: string[];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [sharing, setSharing] = useState(false);
  const all = useTuneLists();
  const tuneName = (tuneId: string) => findTune(all, tuneId)?.tune.name;
  // The tune's charts (main first); one is shown at a time. Charts deleted since are left out once
  // the library has loaded.
  const [pickedChart, setPickedChart] = useState<string | null>(null);
  const linkedIds = tuneChartIds(tune);
  const { allSongs: librarySongs, loading: libraryLoading } = useChordChartsLibrary(null);
  const chartIds = libraryLoading ? linkedIds : linkedIds.filter((cid) => librarySongs.some((s) => s.id === cid));
  const shownChartId = pickedChart && chartIds.includes(pickedChart) ? pickedChart : (chartIds[0] ?? null);
  const { selectedSong: chart, selectedSongLoading, allSongs, deleteSong } = useChordChartsLibrary(shownChartId);
  // Every chart belongs to a tune, so a chart goes when its tune does (unless another tune has it).
  const onlyOnThisTune = (ids: string[]) => {
    const others = (list: Tune[]) => list.filter((t) => t.id !== tune.id);
    const elsewhere = linkedChartIds({ tunes: others(all.tunes.tunes), learn: others(all.learn.tunes), library: others(all.library.tunes) });
    return ids.filter((cid) => !elsewhere.has(cid));
  };
  const [confirmDeleteChart, setConfirmDeleteChart] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [{ fit: chartFit }, setChartView] = usePersistedSettings(CHART_VIEW_KEY, CHART_VIEW_DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);

  function patch(update: Partial<Tune>) {
    setTunes((prev) =>
      prev.map((t) => {
        if (t.id !== tune.id) return t;
        const next = { ...t, ...update };
        if (next.chordChartId === undefined) delete next.chordChartId;
        return next;
      }),
    );
  }
  function change(fn: (t: Tune) => Tune) {
    setTunes((prev) => prev.map((t) => (t.id === tune.id ? fn(t) : t)));
  }
  /** Drops links to charts that are gone from the library (before linking a new one). */
  function removeMissing(t: Tune): Tune {
    if (libraryLoading) return t;
    return tuneChartIds(t).reduce((acc, cid) => (librarySongs.some((s) => s.id === cid) ? acc : removeChartFromTune(acc, cid)), t);
  }

  // --- notes: saved shortly after you stop typing, and when leaving the page ---
  const [notes, setNotes] = useState(tune.notes);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    saveRef.current = (text) => setTunes((prev) => prev.map((t) => (t.id === tune.id ? { ...t, notes: text } : t)));
  });
  function flushNotes() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      saveRef.current(pending.current);
      pending.current = null;
    }
  }
  useEffect(() => () => flushNotes(), []);

  // --- keys you know it in ---
  const minor = tune.keys.length > 0 ? tune.keys.every((k) => isMinorKey(k.value)) : !!chart && isMinorKey(chart.key);
  const suffix = minor ? "m" : "";
  const knownPcs = new Set(tune.keys.map((k) => keyPitchClass(k.value)));
  function toggleKey(pc: number) {
    if (knownPcs.has(pc)) patch({ keys: tune.keys.filter((k) => keyPitchClass(k.value) !== pc) });
    else patch({ keys: [...tune.keys, { id: makeId(), value: `${KEY_NAMES[pc]}${suffix}`, enabled: true }] });
  }

  // Charts whose title matches the tune's name — a one-tap link when none is linked, or when the
  // linked one is gone from the library.
  const matches = useMemo(() => {
    if (chart || libraryLoading) return [];
    const want = titleKey(tune.name);
    const out: { song: LibrarySongMeta; playlist: string }[] = [];
    for (const s of allSongs) if (titleKey(s.title) === want) out.push({ song: s, playlist: s.playlistNames });
    return out.slice(0, 3);
  }, [chart, libraryLoading, tune.name, allSongs]);

  const isStandard = useMemo(() => STANDARDS.some((st) => nameId(st.name) === nameId(tune.name)), [tune.name]);

  const shownChart = useMemo(() => {
    if (!chart || !previewKey) return chart;
    const semis = (KEY_NAMES.indexOf(previewKey) - keyPitchClass(chart.key) + 12) % 12;
    return semis ? transposeSong(chart, semis) : chart;
  }, [chart, previewKey]);

  const chartLoading = !!shownChartId && (selectedSongLoading || libraryLoading);
  const chartShowing = chartLoading || !!shownChart;

  const tempos = tune.tempos.map((t) => t.value);
  const otherLists = TUNE_LIST_IDS.filter((l) => l !== list && (l !== "learn" || canUseLearn));

  function openInChordCharts() {
    if (!shownChartId) return;
    router.push(`/chord-charts/view?id=${encodeURIComponent(shownChartId)}`);
  }
  const songById = new Map(allSongs.map((s) => [s.id, s]));
  const chartLabel = (cid: string) => {
    const s = songById.get(cid);
    return s ? [s.title, s.key ? prettyKey(s.key) : null, s.playlistNames || null].filter(Boolean).join(" · ") : "Chart";
  };

  // Opening a tune's page puts it in the Tunes page's "Recently opened".
  const { record: recordRecent } = useRecentTunes();
  const recordRef = useRef(recordRecent);
  useEffect(() => {
    recordRef.current = recordRecent;
  });
  useEffect(() => {
    recordRef.current(tune.id);
  }, [tune.id]);

  const firstKey = tune.keys.find((k) => k.enabled)?.value ?? (chart?.key || null);
  // "Write the chart" starts the builder from this tune and links the result back to it.
  const writeChartHref = `/chord-charts/new?${new URLSearchParams({
    tune: `${list}:${tune.id}`,
    title: tune.name,
    ...(firstKey ? { key: firstKey } : {}),
    ...(tune.timeSignature ? { time: tune.timeSignature } : {}),
  }).toString()}`;
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover";
  const iconBtn = "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground sm:h-9 sm:w-9";

  return (
    <LibraryPage>
      <Hero
        title={tune.name}
        icon={LibraryIcon}
        crumbs={UNDER_TUNES}
        leading={<KeyBadge label={firstKey} size="lg" />}
        subtitle={[
          LIST_LABEL[list],
          tune.timeSignature || null,
          ...tempos.map((t) => `${t} BPM`),
          chart ? `Chart in ${chart.key ? prettyKey(chart.key) : "—"}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {/* With a chart: the band (Rhythm Section) plays it, in the key shown. */}
            {chart && shownChartId && (
              <Pill primary icon={BassIcon} label="Play along" onClick={() => router.push(playAlongHref(shownChartId, previewKey))} />
            )}
            <Pill icon={PencilIcon} label="Edit" onClick={() => setEditing(true)} />
            {isAuthenticated && <Pill icon={ShareIcon} label="Share" onClick={() => setSharing(true)} />}
            {/* The rarer actions in a ⋮, so the header stays one row on phones. */}
            <button
              type="button"
              onClick={(e) =>
                setMenu({
                  ...menuPosition(e),
                  items: [
                    ...otherLists.map((other) => ({ label: `Move to ${LIST_LABEL[other]}`, icon: <RepeatIcon className="h-4 w-4 text-muted" />, onSelect: () => moveTo(other) })),
                    { label: "Delete tune", icon: <TrashIcon className="h-4 w-4" />, danger: true, onSelect: () => setConfirmDelete(true) },
                  ],
                })
              }
              aria-label="More for this tune"
              title="More"
              className={iconBtn}
            >
              <DotsVerticalIcon className="h-4 w-4" />
            </button>
          </>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Chord chart: edge to edge on phones only while a chart (or its spinner) is showing;
              otherwise an ordinary card, like Files and Recordings below. */}
          {chartShowing ? (
            <ChartPaper
              className="max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0"
              top={
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  {chartIds.length > 1 ? (
                    // Several charts: pick which one to show (the main one first).
                    <div className="flex min-w-0 max-w-full items-center gap-2">
                      <ChordChartIcon className="h-4 w-4 shrink-0 text-muted" />
                      <Select
                        value={shownChartId ?? ""}
                        onChange={(v) => {
                          setPickedChart(v);
                          setPreviewKey("");
                        }}
                        options={chartIds.map((cid, i) => ({ value: cid, label: `${chartLabel(cid)}${i === 0 ? " (main)" : ""}` }))}
                        className="min-w-0 max-w-[16rem] sm:max-w-xs"
                      />
                      <span className="shrink-0 text-xs tabular-nums text-muted">{chartIds.length} charts</span>
                    </div>
                  ) : (
                    <h2 className="flex items-center gap-2 text-sm font-medium">
                      <ChordChartIcon className="h-4 w-4 text-muted" />
                      Chord chart
                      {chart && <span className="text-sm font-normal text-muted">{chart.title !== tune.name ? `· ${chart.title}` : ""}</span>}
                    </h2>
                  )}
                  {chart && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Only changes how the chart is shown (the keys you know are on the right). */}
                      <span className="text-xs text-muted">Show in</span>
                      <Select
                        value={previewKey}
                        onChange={setPreviewKey}
                        options={[{ value: "", label: `${chart.key ? prettyKey(chart.key) : "—"} (original)` }, ...KEY_NAMES.map((k) => ({ value: k, label: prettyKey(k) }))]}
                        className="min-w-32"
                      />
                      {/* Phones: the chart fits the screen, or is zoomed in and scrolls sideways.
                          (Opening the chart's own page is in the ⋮ there, so the two don't read
                          alike.) */}
                      <button type="button" onClick={() => setChartView({ fit: !chartFit })} aria-pressed={!chartFit} className={`${btn} sm:hidden`}>
                        {chartFit ? "Zoom in" : "Fit to screen"}
                      </button>
                      <button type="button" onClick={openInChordCharts} className={`${btn} max-sm:hidden`}>
                        Open chart page
                      </button>
                      <button
                        type="button"
                        onClick={(e) =>
                          setMenu({
                            ...menuPosition(e),
                            items: [
                              { label: "Open chart page", icon: <ChordChartIcon className="h-4 w-4 text-muted" />, onSelect: openInChordCharts },
                              ...(shownChartId && chartIds[0] !== shownChartId
                                ? [{ label: "Make this the main chart", icon: <CheckIcon className="h-4 w-4 text-muted" />, onSelect: () => change((t) => makeMainChart(t, shownChartId)) }]
                                : []),
                              { label: "Link another chart", icon: <LinkIcon className="h-4 w-4 text-muted" />, onSelect: () => setPicking(true) },
                              { label: "Write another chart", icon: <PencilIcon className="h-4 w-4 text-muted" />, onSelect: () => router.push(writeChartHref) },
                              {
                                label: chartIds.length > 1 ? "Delete this chart" : "Delete the chart",
                                icon: <TrashIcon className="h-4 w-4" />,
                                danger: true,
                                divider: true,
                                onSelect: () => shownChartId && setConfirmDeleteChart(shownChartId),
                              },
                            ],
                          })
                        }
                        aria-label="More for the chart"
                        title="More"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"
                      >
                        <DotsVerticalIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              }
            >
              {chartLoading ? (
                <div className="flex justify-center py-10">
                  <LoadingSpinner />
                </div>
              ) : shownChart ? (
                <ChordChart song={shownChart} hideHeader scroll={!chartFit} />
              ) : null}
            </ChartPaper>
          ) : (
            <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <ChordChartIcon className="h-4 w-4 text-muted" />
                Chord chart
              </h2>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">
                  {linkedIds.length > 0
                    ? "The linked chart isn't in your chord charts anymore."
                    : matches.length > 0
                      ? "No chord chart linked yet."
                      : // Tunes added from the jazz standards list are a name, key and tempo — no
                        // chords come with them (none are bundled), so say how to get a chart.
                        `No chord chart yet.${isStandard ? " Standards come with a name, key and tempo, not chords." : ""} Write one, or import a chart called “${tune.name}” and you can link it here.`}
                  {matches.length > 0 && ` ${matches.length === 1 ? "This one has" : "These have"} the same name:`}
                </p>
                {matches.map((m) => (
                  <div key={m.song.id} className="flex items-center gap-3 rounded-md bg-foreground/[0.05] p-3">
                    <KeyBadge label={m.song.key} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.song.title}</div>
                      <div className="truncate text-xs text-muted">{[m.song.composer, m.playlist].filter(Boolean).join(" · ") || "In your chord charts"}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => change((t) => addChartsToTune(removeMissing(t), [m.song.id]))}
                      className="inline-flex h-9 shrink-0 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
                    >
                      Link it
                    </button>
                  </div>
                ))}
                {/* Ways forward: pick another chart, write one, or bring some in. */}
                <div className="flex flex-wrap gap-2">
                  {allSongs.length > 0 && (
                    <button type="button" onClick={() => setPicking(true)} className={btn}>
                      <LinkIcon className="h-4 w-4" /> {matches.length ? "Link a different chart" : "Link a chart"}
                    </button>
                  )}
                  <Link
                    href={writeChartHref}
                    className={
                      matches.length || allSongs.length
                        ? btn
                        : "inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
                    }
                  >
                    <PencilIcon className="h-4 w-4" /> Write the chart
                  </Link>
                  <Link href="/chord-charts/import" className={btn}>
                    <DownloadIcon className="h-4 w-4" /> Import charts
                  </Link>
                </div>
              </div>
            </section>
          )}

          <TuneFiles tuneId={tune.id} tuneName={tuneName} />

          <div className="rounded-lg bg-surface p-4 sm:p-5">
            <TuneRecordings tuneId={tune.id} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1">
          {/* Which list it's in (one tap moves it) and its tags. */}
          <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 sm:col-span-2 xl:col-span-1">
            <h2 className="text-sm font-medium">List</h2>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which list it's in">
              {TUNE_LIST_IDS.filter((l) => l !== "learn" || canUseLearn || list === "learn").map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => l !== list && moveTo(l)}
                  aria-pressed={l === list}
                  className={`inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors ${
                    l === list ? "bg-accent text-accent-foreground" : "bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {l === list && <CheckIcon className="h-3.5 w-3.5" />}
                  {LIST_LABEL[l]}
                </button>
              ))}
            </div>
            <h2 className="pt-1 text-sm font-medium">Tags</h2>
            <TagEditor tags={tuneTags(tune)} known={knownTags} onChange={(tags) => change((t) => withTags(t, tags))} />
          </section>

          {/* Keys you know it in: toggles that save to the tune (unlike the chart's "Show in",
              which only changes how the chart is shown). Several can be on, so they're filled
              toggle pills with a check, not radio-style circles. */}
          <section className="flex flex-col gap-3 rounded-lg bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">Keys I know it in</h2>
                <p className="text-xs text-muted">Tap the keys you know.</p>
              </div>
              <span className="text-xs tabular-nums text-muted">{knownPcs.size} / 12</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Keys I know it in">
              {KEY_NAMES.map((name, pc) => {
                const known = knownPcs.has(pc);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleKey(pc)}
                    aria-pressed={known}
                    title={known ? "You know it in this key — tap to unmark" : "Tap to mark as a key you know"}
                    className={`flex items-center justify-center gap-1 rounded-md py-2.5 text-sm font-medium transition-colors ${
                      known ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    {known && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                    {gridKeyName(name, minor)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">Jam Practice picks from the keys you mark here.</p>
          </section>

          {/* A quick note kept on the tune itself (stored as the tune's `notes`); Shed Notes below
              are full notes, with links and search, in the Shed Notes tool. */}
          <section className="flex flex-col gap-2 rounded-lg bg-surface p-4">
            <div>
              <h2 className="text-sm font-medium">Quick note</h2>
              <p className="text-xs text-muted">A few lines kept on this tune&apos;s page, saved as you type.</p>
            </div>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                pending.current = e.target.value;
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(flushNotes, NOTES_SAVE_MS);
              }}
              onBlur={flushNotes}
              placeholder="Form, tricky changes, voicings, recordings to check out…"
              rows={7}
              className="w-full resize-y rounded-md bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
          </section>

          {isAuthenticated && (
            <section className="flex flex-col gap-2 rounded-lg bg-surface p-4">
              <div>
                <h2 className="text-sm font-medium">Shed Notes</h2>
                <p className="text-xs text-muted">Longer notes on this tune (links, notation, search), kept in Shed Notes.</p>
              </div>
              <AttachedNotes target={{ kind: "tune", tuneId: tune.id }} label={tune.name || "Untitled tune"} newTitle={tune.name || "Untitled tune"} />
            </section>
          )}
        </div>
      </div>

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {sharing && <TuneShareDialog tuneId={tune.id} tuneName={tune.name} hasChart={!!chart} onClose={() => setSharing(false)} />}
      {editing && <TuneEditorModal initial={tune} isNew={false} onSave={(t) => { patch(t); setEditing(false); }} onClose={() => setEditing(false)} />}
      {picking && (
        <ChartLinkPicker
          songs={allSongs}
          initialQuery={tune.name}
          exclude={chartIds}
          onPick={(songId) => {
            change((t) => addChartsToTune(removeMissing(t), [songId]));
            setPickedChart(songId);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {confirmDeleteChart && (
        <ConfirmDialog
          title={`Delete ${chartIds.length > 1 ? `"${chartLabel(confirmDeleteChart)}"` : "this chart"}?`}
          message={`It's taken off ${tune.name}${onlyOnThisTune([confirmDeleteChart]).length ? " and deleted for good" : " (another tune still has it)"}.`}
          confirmLabel="Delete"
          onConfirm={() => {
            const cid = confirmDeleteChart;
            setConfirmDeleteChart(null);
            const gone = onlyOnThisTune([cid]).length > 0;
            change((t) => removeChartFromTune(t, cid));
            if (gone) void deleteSong(cid);
            setPickedChart(null);
          }}
          onCancel={() => setConfirmDeleteChart(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${tune.name}"?`}
          message={`This removes it from ${LIST_LABEL[list]}${chartIds.length ? `, along with its chord chart${chartIds.length > 1 ? "s" : ""}` : ""}.`}
          confirmLabel="Delete"
          onConfirm={() => {
            for (const cid of onlyOnThisTune(chartIds)) void deleteSong(cid);
            setTunes((prev) => prev.filter((t) => t.id !== tune.id));
            setConfirmDelete(false);
            onDeleted();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </LibraryPage>
  );
}
