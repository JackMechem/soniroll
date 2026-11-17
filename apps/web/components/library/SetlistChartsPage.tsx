"use client";

import { ChartMeta, ChartPaper, ReaderBar, RoundButton } from "@/components/library/chartView";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ChordChart from "@/components/ChordChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ChevronLeftIcon, ChevronRightIcon, ChordChartIcon, ListIcon } from "@/components/tools";
import { transposeSong, type IRealSong } from "@/lib/iRealPro";
import type { PublicTune } from "@/lib/profileTunes";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSetlists } from "@/lib/useSetlists";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";
import { displayKey, semitonesTo } from "@jam-practice/core/setlistKeys";

/** One page: a tune, with either its chart's library id (your own charts, loaded on demand), the
    chart itself (someone else's setlist), or neither. */
type ChartPage = { key: string; name: string; chartId?: string | null; song?: IRealSong | null; toKey?: string | null; tempo?: number | null };

const ID_RE = /^[a-z0-9]+$/i;

function publicPages(tunes: PublicTune[]): ChartPage[] {
  return tunes.map((t, i) => ({
    key: `${t.id}-${i}`,
    name: t.name,
    song: (t.linkedChart as unknown as IRealSong) ?? null,
    toKey: t.setKey ?? null,
    tempo: t.setTempo ?? t.tempos.find((x) => x.enabled)?.value ?? null,
  }));
}

/**
 * A setlist's charts, one per page — swipe (touch), the arrow keys, or the ‹ › buttons for the
 * next tune; built for reading on a gig, so each chart is scaled to fill the screen. Works for one
 * of your own setlists (`mine`), a Community setlist post (`post`) or a shared link (`shared`);
 * `start` opens on a given tune. Each tune is shown in the setlist's key for it (transposed).
 */
export default function SetlistChartsPage({ mine, post, shared, start }: { mine?: string; post?: string; shared?: string; start: number }) {
  const router = useRouter();
  const { setlists } = useSetlists();
  const [tunes] = useSyncedTunes();
  const [learn] = useTunesToLearn();
  const postData = useQuery(api.communityTunes.get, post && ID_RE.test(post) ? { id: post as Id<"communityTunes"> } : "skip");
  const sharedData = useQuery(api.setlists.getShared, shared ? { id: shared } : "skip");

  let title = "";
  let pages: ChartPage[] | null = null;
  if (mine) {
    const setlist = setlists.find((s) => s.id === mine);
    const all = [...tunes, ...learn];
    title = setlist?.name ?? "Setlist";
    pages = (setlist?.tuneIds ?? [])
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is Tune => !!t)
      .map((t) => {
        const o = setlist?.overrides?.[t.id];
        return { key: t.id, name: t.name, chartId: t.chordChartId ?? null, toKey: o?.key ?? null, tempo: o?.tempo ?? t.tempos.find((x) => x.enabled)?.value ?? null };
      });
  } else if (post) {
    if (postData !== undefined) {
      title = postData?.title ?? "Setlist";
      pages = postData ? publicPages(postData.tunes) : [];
    }
  } else if (shared) {
    if (sharedData !== undefined) {
      title = sharedData?.title ?? "Setlist";
      pages = sharedData ? publicPages(sharedData.tunes) : [];
    }
  } else {
    pages = [];
  }

  return (
    <main className="flex h-dvh w-full flex-col pt-[calc(env(safe-area-inset-top)+3.5rem)] lg:pt-0">
      {pages === null ? (
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner label="Loading setlist…" showLabel />
        </div>
      ) : (
        <Pager pages={pages} title={title} start={Math.min(start, Math.max(0, pages.length - 1))} onBack={() => router.back()} />
      )}
    </main>
  );
}

/** The setlist in order — numbered, with each tune's key and tempo for the set; the one on screen
    highlighted, the ones already played dimmed. */
function RunningOrder({ pages, index, onPick }: { pages: ChartPage[]; index: number; onPick: (i: number) => void }) {
  return (
    <ol className="flex flex-col gap-0.5">
      {pages.map((p, i) => (
        <li key={p.key}>
          <button
            type="button"
            onClick={() => onPick(i)}
            aria-current={i === index ? "true" : undefined}
            className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${i === index ? "bg-surface-hover" : "hover:bg-surface-hover"}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-medium tabular-nums ${
                i === index ? "bg-accent text-accent-foreground" : i < index ? "text-muted/60" : "text-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm ${i === index ? "font-medium text-foreground" : i < index ? "text-muted" : ""}`}>{p.name}</span>
              {(p.toKey || p.tempo) && (
                <span className="block truncate text-[11px] text-muted">{[p.toKey ? displayKey(p.toKey) : null, p.tempo ? `${p.tempo} BPM` : null].filter(Boolean).join(" · ")}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function Pager({ pages, title, start, onBack }: { pages: ChartPage[]; title: string; start: number; onBack: () => void }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  // The running order beside the chart (desktop), or as a sheet (phones).
  const [railOpen, setRailOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const goTo = useCallback((i: number, smooth = true) => {
    const strip = stripRef.current;
    if (!strip) return;
    const clamped = Math.max(0, Math.min(pages.length - 1, i));
    strip.scrollTo({ left: clamped * strip.clientWidth, behavior: smooth ? "smooth" : "instant" });
  }, [pages.length]);

  // Open on `start`, without animating there.
  useEffect(() => {
    goTo(start, false);
  }, [goTo, start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") goTo(index + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(index - 1);
      else if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const current = pages[index];
  const next = pages[index + 1];
  const many = pages.length > 1;

  return (
    <>
      <ReaderBar
        onBack={onBack}
        title={current?.name ?? title}
        subtitle={pages.length ? (
          <>
            <span className="font-medium text-foreground/70">{title}</span> · Tune {index + 1} of {pages.length}
          </>
        ) : title}
      >
        {many && (
          <>
            <span className="hidden lg:block">
              <RoundButton label={railOpen ? "Hide the running order" : "Show the running order"} onClick={() => setRailOpen((o) => !o)} active={railOpen}>
                <ListIcon className="h-4 w-4" />
              </RoundButton>
            </span>
            <span className="lg:hidden">
              <RoundButton label="Running order" onClick={() => setSheetOpen(true)}>
                <ListIcon className="h-4 w-4" />
              </RoundButton>
            </span>
            <RoundButton label="Previous tune" onClick={() => goTo(index - 1)} disabled={index === 0}>
              <ChevronLeftIcon className="h-4 w-4" />
            </RoundButton>
            <RoundButton label="Next tune" onClick={() => goTo(index + 1)} disabled={index === pages.length - 1}>
              <ChevronRightIcon className="h-4 w-4" />
            </RoundButton>
          </>
        )}
      </ReaderBar>

      {pages.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted">No tunes yet.</p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 px-2 pb-2 sm:px-5 sm:pb-3">
          {many && railOpen && (
            <aside className="hidden w-60 shrink-0 flex-col gap-2 overflow-y-auto rounded-lg bg-surface p-2 lg:flex">
              <p className="px-2 pt-1 text-xs font-medium text-muted">Running order</p>
              <RunningOrder pages={pages} index={index} onPick={goTo} />
            </aside>
          )}
          <div
            ref={stripRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
              if (i !== index) setIndex(i);
            }}
            className="flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
          >
            {pages.map((p, i) => (
              <div key={p.key} className="flex h-full w-full shrink-0 snap-center flex-col">
                {Math.abs(i - index) <= 1 ? <Page page={p} /> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {many && (
        <footer className="flex items-center gap-3 px-3 pb-3 sm:px-5">
          <div className="flex min-w-0 flex-1 gap-1">
            {pages.map((p, i) => (
              <button
                key={p.key}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to ${p.name}`}
                title={p.name}
                className={`h-1.5 min-w-0 flex-1 rounded-full transition-colors ${i === index ? "bg-accent" : i < index ? "bg-accent/35" : "bg-surface-hover"}`}
              />
            ))}
          </div>
          <span className="hidden shrink-0 text-xs text-muted sm:block">
            {next ? (
              <>
                Up next: <span className="font-medium text-foreground/80">{next.name}</span>
              </>
            ) : (
              "Last tune"
            )}
          </span>
        </footer>
      )}

      {sheetOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-overlay lg:hidden" onClick={() => setSheetOpen(false)}>
          <div role="dialog" aria-label="Running order" className="max-h-[75dvh] overflow-y-auto rounded-t-xl border-t border-foreground/10 bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]" onClick={(e) => e.stopPropagation()}>
            <p className="px-2 pb-2 pt-1 text-sm font-medium">Running order · {title}</p>
            <RunningOrder
              pages={pages}
              index={index}
              onPick={(i) => {
                setSheetOpen(false);
                goTo(i);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

const Page = memo(function Page({ page }: { page: ChartPage }) {
  if (page.song) return <ChartBody song={page.song} toKey={page.toKey} tempo={page.tempo} />;
  if (page.chartId) return <LibraryChart name={page.name} chartId={page.chartId} toKey={page.toKey} tempo={page.tempo} />;
  return <NoChart name={page.name} />;
});

function LibraryChart({ name, chartId, toKey, tempo }: { name: string; chartId: string; toKey?: string | null; tempo?: number | null }) {
  const { selectedSong, selectedSongLoading, loading } = useChordChartsLibrary(chartId);
  if (selectedSong) return <ChartBody song={selectedSong} toKey={toKey} tempo={tempo} />;
  if (selectedSongLoading || loading) {
    return (
      <ChartPaper fill>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner label="Loading chart…" showLabel />
        </div>
      </ChartPaper>
    );
  }
  return <NoChart name={name} missing />;
}

function NoChart({ name, missing }: { name: string; missing?: boolean }) {
  return (
    <ChartPaper fill>
      <div className="flex h-full flex-col items-center justify-center gap-3 px-10 text-center">
        <ChordChartIcon className="h-6 w-6 text-muted" />
        <p className="text-xl font-semibold">{name}</p>
        <p className="text-sm text-muted">{missing ? "Couldn't find this tune's chart." : "No chord chart for this tune — play it from memory."}</p>
      </div>
    </ChartPaper>
  );
}

function ChartBody({ song: original, toKey, tempo }: { song: IRealSong; toKey?: string | null; tempo?: number | null }) {
  const song = useMemo(() => (toKey ? transposeSong(original, semitonesTo(original.key, toKey)) : original), [original, toKey]);
  return (
    <ChartPaper fill top={<ChartMeta song={song} originalKey={original.key} tempo={tempo} />}>
      <ChordChart song={song} fullscreen hideHeader />
    </ChartPaper>
  );
}
