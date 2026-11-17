"use client";

import { ChartPaper } from "@/components/library/chartView";
import { Hero, KeyBadge, keyColor, LibraryPage, Pill } from "@/components/library/ui";
import { displayKey } from "@jam-practice/core/setlistKeys";
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
import { BassIcon, ChordChartIcon, DotsVerticalIcon, DownloadIcon, LinkIcon, PencilIcon, RepeatIcon, ShareIcon, TrashIcon } from "@/components/tools";
import { KEY_NAMES, keyPitchClass, transposeSong } from "@/lib/iRealPro";
import { makeId, type Tune } from "@/lib/types";
import { STANDARDS, nameId } from "@/lib/standards";
import { useChordChartsLibrary, type LibrarySongMeta } from "@/lib/useChordChartsLibrary";
import { useRecentTunes } from "@/lib/recents";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";

type ListId = "tunes" | "learn";
const LIST_LABEL: Record<ListId, string> = { tunes: "Tunes I Know", learn: "Tunes to Learn" };
const NOTES_SAVE_MS = 600;

/** Loose title match for "is there already a chart for this tune": case, punctuation and a
    leading or trailing article are ignored (iReal titles are often "Man I Love, The"). */
function titleKey(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "")
    .replace(/ (the|a|an)$/, "");
}

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
    default, so nothing's cut off on the right; "Full size" is remembered once picked. */
const CHART_VIEW_KEY = "jam-practice-tune-chart-view";
const CHART_VIEW_DEFAULTS = { fit: true };

export default function TuneHub({ id, list: listParam }: { id: string; list?: string }) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [tunes, setTunes] = useSyncedTunes();
  const [learn, setLearn] = useTunesToLearn();
  const lists = { tunes: { tunes, setTunes }, learn: { tunes: learn, setTunes: setLearn } };

  // Look in both lists (editing or moving can change which one it's in); prefer the one linked to.
  const order: ListId[] = listParam === "learn" ? ["learn", "tunes"] : ["tunes", "learn"];
  let found: { list: ListId; tune: Tune } | null = null;
  for (const l of order) {
    const tune = lists[l].tunes.find((t) => t.id === id);
    if (tune) {
      found = { list: l, tune };
      break;
    }
  }

  if (!found) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-24 text-center">
        <p className="text-sm text-muted">That tune isn&apos;t in your lists.</p>
        <Link href="/tunes" className="text-sm font-semibold text-accent">
          Go to your tunes
        </Link>
      </div>
    );
  }
  return (
    <Hub
      key={found.tune.id}
      list={found.list}
      tune={found.tune}
      setTunes={lists[found.list].setTunes}
      moveTo={(target) => {
        const t = found.tune;
        lists[found.list].setTunes((prev) => prev.filter((x) => x.id !== t.id));
        lists[target].setTunes((prev) => [...prev, t]);
      }}
      canUseLearn={isAuthenticated}
      onDeleted={() => router.back()}
    />
  );
}

function Hub({
  list,
  tune,
  setTunes,
  moveTo,
  canUseLearn,
  onDeleted,
}: {
  list: ListId;
  tune: Tune;
  setTunes: (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;
  moveTo: (target: ListId) => void;
  canUseLearn: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [sharing, setSharing] = useState(false);
  const [allTunes] = useSyncedTunes();
  const [allLearn] = useTunesToLearn();
  const tuneName = (tuneId: string) => [...allTunes, ...allLearn].find((t) => t.id === tuneId)?.name;
  const { selectedSong: chart, selectedSongLoading, loading: libraryLoading, allSongs } = useChordChartsLibrary(tune.chordChartId ?? null);
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

  const tempos = tune.tempos.map((t) => t.value);
  const other: ListId = list === "tunes" ? "learn" : "tunes";

  function openInChordCharts() {
    if (!tune.chordChartId) return;
    router.push(`/chord-charts/view?id=${encodeURIComponent(tune.chordChartId)}`);
  }

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
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover";
  const iconBtn = "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground sm:h-9 sm:w-9";

  return (
    <LibraryPage>
      <Hero
        title={tune.name}
        color={keyColor(firstKey)}
        back={() => router.back()}
        leading={<KeyBadge label={firstKey} size="lg" />}
        subtitle={[
          LIST_LABEL[list],
          tune.timeSignature || null,
          ...tempos.map((t) => `${t} BPM`),
          chart ? `Chart in ${chart.key ? displayKey(chart.key) : "—"}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {/* With a chart: the band (Rhythm Section) plays it, in the key shown. */}
            {chart && tune.chordChartId && (
              <Pill primary icon={BassIcon} label="Play along" onClick={() => router.push(playAlongHref(tune.chordChartId!, previewKey))} />
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
                    ...(other === "tunes" || canUseLearn ? [{ label: `Move to ${LIST_LABEL[other]}`, icon: <RepeatIcon className="h-4 w-4 text-muted" />, onSelect: () => moveTo(other) }] : []),
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
          {/* Chord chart */}
          <ChartPaper
            className="max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0"
            top={
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  <ChordChartIcon className="h-4 w-4 text-muted" />
                  Chord chart
                  {chart && <span className="text-sm font-normal text-muted">{chart.title !== tune.name ? `· ${chart.title}` : ""}</span>}
                </h2>
                {chart && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={previewKey}
                      onChange={setPreviewKey}
                      options={[{ value: "", label: `Original (${chart.key || "—"})` }, ...KEY_NAMES.map((k) => ({ value: k, label: k }))]}
                      className="min-w-32"
                    />
                    {/* Phones: the chart is full size and scrolls sideways, or fits the screen. */}
                    <button type="button" onClick={() => setChartView({ fit: !chartFit })} aria-pressed={chartFit} className={`${btn} sm:hidden`}>
                      {chartFit ? "Full size" : "Fit to screen"}
                    </button>
                    <button type="button" onClick={openInChordCharts} className={btn}>
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={(e) =>
                        setMenu({
                          ...menuPosition(e),
                          items: [
                            { label: "Link a different chart", icon: <LinkIcon className="h-4 w-4 text-muted" />, onSelect: () => setPicking(true) },
                            { label: "Unlink the chart", icon: <ChordChartIcon className="h-4 w-4 text-muted" />, onSelect: () => patch({ chordChartId: undefined }) },
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
            {tune.chordChartId && (selectedSongLoading || libraryLoading) ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : shownChart ? (
              <ChordChart song={shownChart} hideHeader scroll={!chartFit} />
            ) : (
              <div className="flex flex-col gap-3">
                <p className="px-1 text-sm text-muted">
                  {tune.chordChartId
                    ? "The linked chart isn't in your chord charts anymore."
                    : matches.length > 0
                      ? "No chord chart linked yet."
                      : // Tunes added from the jazz standards list are a name, key and tempo — no
                        // chords come with them (none are bundled), so say how to get a chart.
                        `No chord chart yet${isStandard ? " — the standards list adds a tune's name, key and tempo, not its chords" : ""}. Write the chart, or import yours: one called “${tune.name}” shows up here to link.`}
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
                      onClick={() => patch({ chordChartId: m.song.id })}
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
                    href="/chord-charts/new"
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
            )}
          </ChartPaper>

          <TuneFiles tuneId={tune.id} tuneName={tuneName} />

          <div className="rounded-lg bg-surface p-4 sm:p-5">
            <TuneRecordings tuneId={tune.id} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1">
          {/* Keys */}
          <section className="flex flex-col gap-3 rounded-lg bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Keys I know it in</h2>
              <span className="text-xs tabular-nums text-muted">{knownPcs.size} / 12</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(knownPcs.size / 12) * 100}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-4">
              {KEY_NAMES.map((name, pc) => {
                const known = knownPcs.has(pc);
                const color = `var(--key-${pc}, var(--accent))`;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleKey(pc)}
                    aria-pressed={known}
                    title={known ? "Known — click to unmark" : "Click to mark as known"}
                    className={`rounded-md py-2.5 text-sm font-medium transition-colors ${known ? "" : "bg-foreground/[0.05] hover:bg-surface-hover hover:text-foreground"}`}
                    style={known ? { background: color, color: "var(--accent-foreground)" } : { color: "var(--muted)" }}
                  >
                    {name}
                    {suffix}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">Jam Practice picks from the keys you mark here.</p>
          </section>

          {/* A quick note kept on the tune itself (stored as the tune's `notes`); Shed Notes below
              are full notes, with links and search, in the Shed Notes tool. */}
          <section className="flex flex-col gap-2 rounded-lg bg-surface p-4">
            <h2 className="text-sm font-medium">Quick note</h2>
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
            <p className="text-xs text-muted">
              {isAuthenticated ? "A few lines kept with the tune, saved as you type. For longer notes, use Shed Notes." : "A few lines kept with the tune, saved as you type."}
            </p>
          </section>

          {isAuthenticated && (
            <section className="flex flex-col gap-2 rounded-lg bg-surface p-4">
              <div>
                <h2 className="text-sm font-medium">Shed Notes</h2>
                <p className="text-xs text-muted">Full notes on this tune, in your Shed Notes.</p>
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
          onPick={(songId) => {
            patch({ chordChartId: songId });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${tune.name}"?`}
          message={`This removes it from ${LIST_LABEL[list]}. Its chord chart (if any) is kept.`}
          confirmLabel="Delete"
          onConfirm={() => {
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
