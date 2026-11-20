import { toOwnTune } from "@/components/PublicTuneList";
import { addChartsToTune, tuneChartIds } from "@jam-practice/core/tuneLibrary";
import type { IRealSong } from "@/lib/iRealPro";
import type { PublicTune } from "@/lib/profileTunes";
import { nameId } from "@/lib/standards";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSetlists, type SetlistOverride } from "@/lib/useSetlists";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";

/**
 * Saves someone else's setlist (a shared link or a setlist post) as your own — a copy, yours to
 * change from then on. Tunes you already have (in either list, matched by name) are reused; the
 * rest are added to Tunes I Know. Their chord charts come along too: imported into a playlist named
 * after the setlist and linked to the tunes (a tune that already has a chart keeps it). The set's
 * own key/tempo choices come along as well. Returns the new setlist's id.
 */
export function useSaveSetlist() {
  const [myTunes, setMyTunes] = useSyncedTunes();
  const [learn] = useTunesToLearn();
  const { create } = useSetlists();
  const { importSongs } = useChordChartsLibrary(null);

  return async function save(title: string, tunes: PublicTune[]): Promise<string> {
    const byName = new Map<string, Tune>();
    for (const t of [...learn, ...myTunes]) byName.set(nameId(t.name), t);
    const myIds = new Set(myTunes.map((t) => t.id));

    const ids: string[] = [];
    const overrides: Record<string, SetlistOverride> = {};
    const added: Tune[] = [];
    const wantChart: { tuneId: string; chart: IRealSong }[] = [];
    for (const pt of tunes) {
      let tune = byName.get(nameId(pt.name));
      if (!tune) {
        tune = toOwnTune(pt);
        added.push(tune);
        byName.set(nameId(tune.name), tune);
      }
      ids.push(tune.id);
      if (pt.setKey || pt.setTempo != null) {
        overrides[tune.id] = {
          ...(pt.setKey ? { key: pt.setKey } : {}),
          ...(pt.setTempo != null ? { tempo: pt.setTempo } : {}),
        };
      }
      const canLink = tuneChartIds(tune).length === 0 && (myIds.has(tune.id) || added.includes(tune));
      if (pt.linkedChart && canLink) wantChart.push({ tuneId: tune.id, chart: pt.linkedChart as unknown as IRealSong });
    }

    const chartFor = new Map<string, string>();
    if (wantChart.length) {
      try {
        const result = await importSongs(
          wantChart.map((w) => w.chart),
          title,
          { link: false },
        );
        result.ids.forEach((chartId, i) => {
          if (chartId) chartFor.set(wantChart[i].tuneId, chartId);
        });
      } catch {
        // Charts couldn't be imported — the tunes and setlist still save.
      }
    }
    const link = (t: Tune) => (chartFor.has(t.id) ? addChartsToTune(t, [chartFor.get(t.id)!]) : t);
    if (added.length || chartFor.size) setMyTunes((prev) => [...prev.map(link), ...added.map(link)]);
    return create(title, ids, overrides).id;
  };
}
