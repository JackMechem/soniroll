import { useConvexAuth } from '@convex-dev/auth/react';
import { removeChartFromTune, replaceMainChart } from '@jam-practice/core/tuneLibrary';
import type { Tune } from '@jam-practice/core/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  ChordChartIcon,
  CloseIcon,
  FolderMoveIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import { forgetRecentTune } from '@/lib/chordChartRecents';
import { ChartPickerModal } from '@/components/library/ChartPickerModal';
import { TUNE_LIST_LABEL, tuneSummary, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The ⋮ menu for a tune, anywhere in the Library: edit it; open / edit / link / change / unlink
 * its chord chart (or create a chart for it); move it between Tunes and Tunes to Learn; delete it.
 * Returns `openTuneMenu(list, tune)` plus the element (sheet + chart picker + delete confirm) to
 * render once in the screen.
 */
export function useTuneMenu() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { lists } = useTuneLists();
  // Tunes to Learn only exists in your account — signed out it can't be written, so moving a tune
  // there would silently lose it.
  const { isAuthenticated } = useConvexAuth();
  const [target, setTarget] = useState<{ list: TuneListId; tune: Tune } | null>(null);
  const [picking, setPicking] = useState<{ list: TuneListId; tune: Tune } | null>(null);
  const [deleting, setDeleting] = useState<{ list: TuneListId; tune: Tune } | null>(null);

  function replaceTune(list: TuneListId, id: string, fn: (t: Tune) => Tune) {
    lists[list].setTunes((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }

  const actions: SheetAction[] = [];
  if (target) {
    const { list, tune } = target;
    const other: TuneListId = list === 'tunes' ? 'learn' : 'tunes';
    const icon = (I: typeof PencilIcon, danger = false) => <I color={danger ? colors.danger : colors.foreground} size={22} />;
    actions.push({ key: 'edit', icon: icon(PencilIcon), label: 'Edit tune', onPress: () => router.push({ pathname: '/library/tune-edit', params: { list, id: tune.id } }) });
    if (tune.chordChartId) {
      const chartId = tune.chordChartId;
      actions.push(
        { key: 'open', icon: icon(ChordChartIcon), label: 'Open chord chart', onPress: () => router.push({ pathname: '/tool/chord-charts-view', params: { id: chartId } }) },
        { key: 'editChart', icon: icon(PencilIcon), label: 'Edit chord chart', onPress: () => router.push({ pathname: '/tool/chord-charts-editor', params: { songId: chartId } }) },
        { key: 'relink', icon: icon(LinkIcon), label: 'Change linked chart', onPress: () => setPicking(target) },
        // Unlinks the main chart only; any other charts the tune has (linked on the website) stay.
        { key: 'unlink', icon: icon(CloseIcon), label: 'Unlink chord chart', onPress: () => replaceTune(list, tune.id, (t) => removeChartFromTune(t, chartId)) },
      );
    } else {
      actions.push(
        { key: 'link', icon: icon(LinkIcon), label: 'Link a chord chart', onPress: () => setPicking(target) },
        { key: 'create', icon: icon(PlusIcon), label: 'Create a chord chart for it', onPress: () => router.push({ pathname: '/tool/chord-charts-new', params: { title: tune.name } }) },
      );
    }
    if (other === 'tunes' || isAuthenticated) actions.push(
      {
        key: 'move',
        icon: icon(FolderMoveIcon),
        label: `Move to ${TUNE_LIST_LABEL[other]}`,
        onPress: () => {
          lists[list].setTunes((prev) => prev.filter((t) => t.id !== tune.id));
          lists[other].setTunes((prev) => [...prev, tune]);
        },
      });
    actions.push(
      { key: 'delete', icon: icon(TrashIcon, true), label: 'Delete tune', danger: true, onPress: () => setDeleting(target) },
    );
  }

  const element = (
    <>
      <ActionSheet
        visible={!!target}
        title={target?.tune.name}
        subtitle={target ? `${TUNE_LIST_LABEL[target.list]} · ${tuneSummary(target.tune)}` : undefined}
        actions={actions}
        onClose={() => setTarget(null)}
      />
      <ChartPickerModal
        visible={!!picking}
        initialQuery={picking?.tune.name ?? ''}
        onClose={() => setPicking(null)}
        onPick={(song) => {
          if (picking) replaceTune(picking.list, picking.tune.id, (t) => replaceMainChart(t, song.id));
          setPicking(null);
        }}
      />
      <ConfirmDialog
        visible={!!deleting}
        title={`Delete "${deleting?.tune.name ?? ''}"?`}
        message={deleting ? `This removes it from ${TUNE_LIST_LABEL[deleting.list]}. Its chord chart (if any) is kept.` : ''}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) {
            lists[deleting.list].setTunes((prev) => prev.filter((t) => t.id !== deleting.tune.id));
            forgetRecentTune(deleting.tune.id);
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );

  return { openTuneMenu: (list: TuneListId, tune: Tune) => setTarget({ list, tune }), tuneMenu: element };
}
