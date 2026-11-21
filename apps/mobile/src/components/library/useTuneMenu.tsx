import { useConvexAuth } from '@convex-dev/auth/react';
import { addChartsToTune, makeMainChart, removeChartFromTune, tuneChartIds } from '@jam-practice/core/tuneLibrary';
import type { Tune } from '@jam-practice/core/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CheckIcon, ChordChartIcon, FolderMoveIcon, LinkIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { forgetRecentTune } from '@/lib/chordChartRecents';
import { ChartPickerModal } from '@/components/library/ChartPickerModal';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { chartsOnlyOn, moveTune, TUNE_LIST_IDS, TUNE_LIST_LABEL, tuneSummary, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

type Target = { list: TuneListId; tune: Tune; chartId?: string };

/** "Write a chart" for a tune: the new-chart form, with the tune's name, key and time signature,
    and the tune to link the chart to when it's saved. */
export function newChartParams(list: TuneListId, tune: Tune) {
  return {
    title: tune.name,
    tune: `${list}:${tune.id}`,
    key: tune.keys[0]?.value ?? '',
    timeSignature: tune.timeSignature,
  };
}

/**
 * Deleting a tune, or one of its charts — the website's rule: every chord chart belongs to a tune,
 * so a chart is deleted for good with its tune (or on its own) unless another tune also has it.
 * Returns the two confirm dialogs and the functions that open them.
 */
export function useTuneDeletes(onTuneDeleted?: () => void) {
  const { lists } = useTuneLists();
  const { deleteSong } = useChordChartsLibrary(null);
  const [deletingTune, setDeletingTune] = useState<Target | null>(null);
  const [deletingChart, setDeletingChart] = useState<(Target & { chartId: string }) | null>(null);

  const tuneCharts = deletingTune ? tuneChartIds(deletingTune.tune) : [];
  const chartGoes = deletingChart ? chartsOnlyOn(lists, deletingChart.tune, [deletingChart.chartId]).length > 0 : false;
  const several = deletingChart ? tuneChartIds(deletingChart.tune).length > 1 : false;

  const element = (
    <>
      <ConfirmDialog
        visible={!!deletingTune}
        title={`Delete “${deletingTune?.tune.name ?? ''}”?`}
        message={
          deletingTune
            ? `This removes it from ${TUNE_LIST_LABEL[deletingTune.list]}${tuneCharts.length ? `, along with its chord chart${tuneCharts.length > 1 ? 's' : ''}` : ''}.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => {
          const t = deletingTune;
          setDeletingTune(null);
          if (!t) return;
          for (const id of chartsOnlyOn(lists, t.tune)) void deleteSong(id).catch(() => {});
          lists[t.list].setTunes((prev) => prev.filter((x) => x.id !== t.tune.id));
          forgetRecentTune(t.tune.id);
          onTuneDeleted?.();
        }}
        onCancel={() => setDeletingTune(null)}
      />
      <ConfirmDialog
        visible={!!deletingChart}
        title={several ? 'Delete this chart?' : 'Delete the chord chart?'}
        message={deletingChart ? `It's taken off ${deletingChart.tune.name}${chartGoes ? ' and deleted for good.' : ' (another tune still has it).'}` : ''}
        confirmLabel="Delete"
        onConfirm={() => {
          const t = deletingChart;
          setDeletingChart(null);
          if (!t) return;
          const goes = chartsOnlyOn(lists, t.tune, [t.chartId]).length > 0;
          lists[t.list].setTunes((prev) => prev.map((x) => (x.id === t.tune.id ? removeChartFromTune(x, t.chartId) : x)));
          if (goes) void deleteSong(t.chartId).catch(() => {});
        }}
        onCancel={() => setDeletingChart(null)}
      />
    </>
  );

  return {
    deleteTune: (list: TuneListId, tune: Tune) => setDeletingTune({ list, tune }),
    deleteChart: (list: TuneListId, tune: Tune, chartId: string) => setDeletingChart({ list, tune, chartId }),
    deleteDialogs: element,
  };
}

/**
 * The ⋮ menu for a tune, anywhere in the Library: edit it; open / edit its chord chart, link
 * another, make one the main chart, or delete it (or create / link a chart for a tune without
 * one); move it to another of the three lists; delete it (and its charts no other tune has).
 * Returns `openTuneMenu(list, tune, chartId?)` — `chartId` is the chart being shown, when a tune
 * page shows one of several — plus the element to render once in the screen.
 */
export function useTuneMenu(opts: { onTuneDeleted?: () => void; onChartLinked?: (chartId: string) => void } = {}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { lists } = useTuneLists();
  // Tunes to Learn only exists in your account — signed out it can't be written, so moving a tune
  // there would silently lose it.
  const { isAuthenticated } = useConvexAuth();
  const [target, setTarget] = useState<Target | null>(null);
  const [picking, setPicking] = useState<Target | null>(null);
  const { deleteTune, deleteChart, deleteDialogs } = useTuneDeletes(opts.onTuneDeleted);

  function replaceTune(list: TuneListId, id: string, fn: (t: Tune) => Tune) {
    lists[list].setTunes((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }

  const actions: SheetAction[] = [];
  if (target) {
    const { list, tune } = target;
    const charts = tuneChartIds(tune);
    const chartId = target.chartId && charts.includes(target.chartId) ? target.chartId : charts[0];
    const icon = (I: typeof PencilIcon, danger = false) => <I color={danger ? colors.danger : colors.foreground} size={22} />;
    actions.push({ key: 'edit', icon: icon(PencilIcon), label: 'Edit tune', onPress: () => router.push({ pathname: '/library/tune-edit', params: { list, id: tune.id } }) });
    if (chartId) {
      actions.push(
        { key: 'open', icon: icon(ChordChartIcon), label: 'Open chord chart', onPress: () => router.push({ pathname: '/tool/chord-charts-view', params: { id: chartId } }) },
        { key: 'editChart', icon: icon(PencilIcon), label: 'Edit chord chart', onPress: () => router.push({ pathname: '/tool/chord-charts-editor', params: { songId: chartId } }) },
      );
      if (charts[0] !== chartId) {
        actions.push({ key: 'main', icon: icon(CheckIcon), label: 'Make this the main chart', onPress: () => replaceTune(list, tune.id, (t) => makeMainChart(t, chartId)) });
      }
      actions.push(
        { key: 'link', icon: icon(LinkIcon), label: 'Link another chart', onPress: () => setPicking(target) },
        { key: 'create', icon: icon(PlusIcon), label: 'Write another chart', onPress: () => router.push({ pathname: '/tool/chord-charts-new', params: newChartParams(list, tune) }) },
        { key: 'deleteChart', icon: icon(TrashIcon, true), label: charts.length > 1 ? 'Delete this chart' : 'Delete the chord chart', danger: true, onPress: () => deleteChart(list, tune, chartId) },
      );
    } else {
      actions.push(
        { key: 'link', icon: icon(LinkIcon), label: 'Link a chord chart', onPress: () => setPicking(target) },
        { key: 'create', icon: icon(PlusIcon), label: 'Create a chord chart for it', onPress: () => router.push({ pathname: '/tool/chord-charts-new', params: newChartParams(list, tune) }) },
      );
    }
    for (const other of TUNE_LIST_IDS) {
      if (other === list || (other === 'learn' && !isAuthenticated)) continue;
      actions.push({ key: `move-${other}`, icon: icon(FolderMoveIcon), label: `Move to ${TUNE_LIST_LABEL[other]}`, onPress: () => moveTune(lists, list, other, tune) });
    }
    actions.push({ key: 'delete', icon: icon(TrashIcon, true), label: 'Delete tune', danger: true, onPress: () => deleteTune(list, tune) });
  }

  const element = (
    <>
      <ActionSheet
        visible={!!target}
        title={target?.tune.name}
        subtitle={target ? [TUNE_LIST_LABEL[target.list], tuneSummary(target.tune)].filter(Boolean).join(' · ') : undefined}
        actions={actions}
        onClose={() => setTarget(null)}
      />
      <ChartPickerModal
        visible={!!picking}
        initialQuery={picking?.tune.name ?? ''}
        exclude={picking ? tuneChartIds(picking.tune) : undefined}
        onClose={() => setPicking(null)}
        onPick={(song) => {
          if (picking) {
            replaceTune(picking.list, picking.tune.id, (t) => addChartsToTune(t, [song.id]));
            opts.onChartLinked?.(song.id);
          }
          setPicking(null);
        }}
      />
      {deleteDialogs}
    </>
  );

  return { openTuneMenu: (list: TuneListId, tune: Tune, chartId?: string) => setTarget({ list, tune, chartId }), tuneMenu: element };
}
