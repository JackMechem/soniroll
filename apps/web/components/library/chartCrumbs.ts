import type { Crumb } from "@/lib/pageCrumbs";
import { UNDER_TUNES } from "@/components/library/hrefs";
import { tuneHref, type TuneListId } from "@/lib/useTuneLists";
import type { Tune } from "@/lib/types";
import { tuneMatchKey } from "@jam-practice/core/tuneLibrary";

/** A chart's place in the header bar's trail: "Library / Tunes / <its tune> / <the chart>" — the
    chart's own title, or just "Chart" when it's the tune's name again; "Library / Tunes / <the
    chart>" when no tune has it. `linked` is the first tune that has the chart. */
export function chartCrumbs(linked: { tune: Tune; list: TuneListId } | undefined, chartTitle: string): { parents: Crumb[]; title: string } {
  if (!linked) return { parents: UNDER_TUNES, title: chartTitle };
  const same = tuneMatchKey(linked.tune.name) === tuneMatchKey(chartTitle);
  return {
    parents: [...UNDER_TUNES, { label: linked.tune.name, href: tuneHref(linked.list, linked.tune.id) }],
    title: same ? "Chart" : chartTitle,
  };
}
