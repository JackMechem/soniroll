"use client";

import PageBar, { type Crumb } from "@/components/PageBar";
import { chartCrumbs } from "@/components/library/chartCrumbs";
import { UNDER_TUNES } from "@/components/library/hrefs";
import { LibraryIcon } from "@/components/tools";
import { addChartsToTune, tuneChartIds } from "@jam-practice/core/tuneLibrary";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import ChordChartEditor from "@/components/ChordChartEditor";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PageShell } from "@/components/library/shared";
import { chartHref } from "@/components/library/hrefs";
import { tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { goBackOr } from "@/lib/goBack";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useRecentCharts } from "@/lib/recents";

/** `?tune=<list>:<id>` — the tune a new chart is being written for (from its page). */
function parseTune(value: string | null): { list: TuneListId; id: string } | null {
  const m = value?.match(/^(tunes|learn|library):(.+)$/);
  return m ? { list: m[1] as TuneListId, id: m[2] } : null;
}

/** "3/4" → { top: 3, bottom: 4 }. */
function parseTime(value: string | null | undefined) {
  const m = value?.match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/);
  return m ? { top: Number(m[1]), bottom: Number(m[2]) } : undefined;
}

/** The chart builder as a page: a new chart (`/chord-charts/new`, optionally `?playlist=` to
    preselect a folder), or editing an existing one in place (`/chord-charts/edit?id=`). From a
    tune's page, `?tune=<list>:<id>&title=&key=&time=` starts the chart from the tune's name, key
    and time, links the saved chart to that tune, and goes back to it. */
export default function ChartEditorPage({ editId, playlist }: { editId?: string; playlist?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { playlists, loading, selectedSong, selectedSongLoading, importSongs, updateSong } = useChordChartsLibrary(editId ?? null);
  const lists = useTuneLists();
  const names = playlists.map((p) => p.name);
  // A chart you just wrote or edited goes into "Recently opened", like one you opened.
  const { record: recordRecent } = useRecentCharts();
  // The chart just saved, for when there's no page to go back to (opened from a bookmark or a
  // new tab): then Save opens the chart itself.
  const savedId = useRef<string | null>(null);

  const forTune = editId ? null : parseTune(params?.get("tune") ?? null);
  const tune = forTune ? lists[forTune.list].tunes.find((t) => t.id === forTune.id) : undefined;
  const prefill = forTune
    ? {
        title: params?.get("title") || tune?.name || "",
        key: params?.get("key") || tune?.keys.find((k) => k.enabled)?.value || "",
        timeSignature: parseTime(params?.get("time") || tune?.timeSignature),
      }
    : undefined;

  // The trail above the editor: the chart (and its tune) when editing, the tune when writing one
  // for a tune, else just Library / Tunes.
  const editedLinked = editId
    ? (["tunes", "learn", "library"] as const).flatMap((l) => lists[l].tunes.filter((t) => tuneChartIds(t).includes(editId)).map((t) => ({ tune: t, list: l })))[0]
    : undefined;
  const editedTrail = editId && selectedSong ? chartCrumbs(editedLinked, selectedSong.title) : null;
  const crumbs: Crumb[] = editedTrail
    ? [...editedTrail.parents, { label: editedTrail.title, href: chartHref(editId!) }]
    : forTune && tune
      ? [...UNDER_TUNES, { label: tune.name, href: tuneHref(forTune.list, forTune.id) }]
      : UNDER_TUNES;

  if (loading || (editId && (selectedSongLoading || !selectedSong))) {
    return (
      <PageShell>
        <PageBar crumbs={[...UNDER_TUNES, { label: editId ? "Edit" : "New chart" }]} icon={LibraryIcon} />
        <div className="flex justify-center py-24">
          {editId && !loading && !selectedSongLoading ? (
            <p className="text-sm text-muted">That chart isn&apos;t in your library.</p>
          ) : (
            <LoadingSpinner label="Loading…" showLabel />
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      {editId && selectedSong ? (
        <ChordChartEditor key={editId} initial={selectedSong} crumbs={crumbs} onSave={async (song) => {
            await updateSong(editId, song);
            recordRecent(editId);
          }} onClose={() => goBackOr(router, chartHref(editId))} />
      ) : (
        <ChordChartEditor
          crumbs={crumbs}
          playlists={names}
          prefill={prefill}
          defaultPlaylist={playlist && names.includes(playlist) ? playlist : undefined}
          onSave={async (song, playlistName) => {
            const { added, ids } = await importSongs([song], playlistName, { link: !forTune });
            if (added === 0) throw new Error("A chart with this title, composer and key is already in your library.");
            if (ids[0]) {
              recordRecent(ids[0]);
              savedId.current = ids[0];
            }
            // Written for a tune: link it, so the tune's page shows it straight away.
            if (forTune && ids[0]) {
              lists[forTune.list].setTunes((prev) => prev.map((t) => (t.id === forTune.id ? addChartsToTune(t, [ids[0]]) : t)));
            }
          }}
          onClose={() =>
            goBackOr(router, forTune ? tuneHref(forTune.list, forTune.id) : savedId.current ? chartHref(savedId.current) : "/tunes")
          }
        />
      )}
    </PageShell>
  );
}
