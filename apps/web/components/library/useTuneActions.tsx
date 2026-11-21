"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import ChartLinkPicker from "@/components/library/ChartLinkPicker";
import { menuPosition } from "@/components/library/shared";
import { TagsDialog } from "@/components/library/TagEditor";
import { ChevronRightIcon, ChordChartIcon, LinkIcon, PencilIcon, RepeatIcon, TagIcon, TrashIcon } from "@/components/tools";
import TuneEditorModal from "@/components/TuneEditorModal";
import { useRecentTunes } from "@/lib/recents";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { moveTune, TUNE_LIST_IDS, TUNE_LIST_LABEL, tuneHref, useTuneLists, type TuneListId } from "@/lib/useTuneLists";
import { addChartsToTune, allTags, mainChartId, tuneChartIds, tuneTags, withTags } from "@jam-practice/core/tuneLibrary";

export { TUNE_LIST_LABEL, tuneHref, useTuneLists, type TuneListId } from "@/lib/useTuneLists";

/**
 * The ⋮ menu for a tune, shared by the Library pages: Open / Edit tune / open or link a chord
 * chart / tags / move to another list (Tunes I Know, Tunes to Learn, Library) / Delete. Returns
 * the opener plus `element` (menu, editor, chart picker, tags, delete confirmation) to render once.
 */
export function useTuneActions() {
  const router = useRouter();
  const lists = useTuneLists();
  const { allSongs } = useChordChartsLibrary(null);
  const recents = useRecentTunes();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<{ list: TuneListId; tune: Tune } | null>(null);
  const [picking, setPicking] = useState<{ list: TuneListId; tune: Tune } | null>(null);
  const [tagging, setTagging] = useState<{ list: TuneListId; tune: Tune } | null>(null);
  const [deleting, setDeleting] = useState<{ list: TuneListId; tune: Tune } | null>(null);
  const known = lists.tunes.tunes;
  const learn = lists.learn.tunes;
  const library = lists.library.tunes;
  const tagNames = useMemo(() => allTags([...known, ...learn, ...library]).map((t) => t.tag), [known, learn, library]);

  function replace(list: TuneListId, id: string, fn: (t: Tune) => Tune) {
    lists[list].setTunes((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }

  function openTuneMenu(e: React.MouseEvent, list: TuneListId, tune: Tune) {
    const chartId = mainChartId(tune);
    const items: MenuItem[] = [
      { label: "Open", icon: <ChevronRightIcon className="h-4 w-4 text-muted" />, onSelect: () => router.push(tuneHref(list, tune.id)) },
      { label: "Edit tune", icon: <PencilIcon className="h-4 w-4 text-muted" />, onSelect: () => setEditing({ list, tune }) },
    ];
    if (chartId) items.push({ label: "Open chord chart", icon: <ChordChartIcon className="h-4 w-4 text-muted" />, onSelect: () => router.push(`/chord-charts/view?id=${encodeURIComponent(chartId)}`) });
    items.push({ label: chartId ? "Link another chart" : "Link a chart", icon: <LinkIcon className="h-4 w-4 text-muted" />, onSelect: () => setPicking({ list, tune }) });
    items.push({ label: tuneTags(tune).length ? "Tags…" : "Add tags…", icon: <TagIcon className="h-4 w-4 text-muted" />, onSelect: () => setTagging({ list, tune }) });
    // Tunes to Learn only exists in your account — signed out, moving a tune there would lose it.
    for (const other of TUNE_LIST_IDS) {
      if (other === list || (other === "learn" && !lists.canLearn)) continue;
      items.push({ label: `Move to ${TUNE_LIST_LABEL[other]}`, icon: <RepeatIcon className="h-4 w-4 text-muted" />, onSelect: () => moveTune(lists, list, other, tune) });
    }
    items.push({ label: "Delete tune", icon: <TrashIcon className="h-4 w-4" />, danger: true, onSelect: () => setDeleting({ list, tune }) });
    setMenu({ ...menuPosition(e), items });
  }

  const element = (
    <>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {editing && (
        <TuneEditorModal
          initial={editing.tune}
          isNew={false}
          onSave={(t) => {
            replace(editing.list, editing.tune.id, (prev) => ({ ...prev, ...t }));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {picking && (
        <ChartLinkPicker
          songs={allSongs}
          exclude={tuneChartIds(picking.tune)}
          initialQuery={tuneChartIds(picking.tune).length ? "" : picking.tune.name}
          onPick={(songId) => {
            replace(picking.list, picking.tune.id, (t) => addChartsToTune(t, [songId]));
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {tagging && (
        <TagsDialog
          title={`Tags for “${tagging.tune.name}”`}
          tags={tuneTags(tagging.tune)}
          known={tagNames}
          onSave={(tags) => {
            replace(tagging.list, tagging.tune.id, (t) => withTags(t, tags));
            setTagging(null);
          }}
          onClose={() => setTagging(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.tune.name}"?`}
          message={`This removes it from ${TUNE_LIST_LABEL[deleting.list]}. Its chord charts are kept.`}
          confirmLabel="Delete"
          onConfirm={() => {
            lists[deleting.list].setTunes((prev) => prev.filter((t) => t.id !== deleting.tune.id));
            recents.forget(deleting.tune.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );

  return { openTuneMenu, element };
}
