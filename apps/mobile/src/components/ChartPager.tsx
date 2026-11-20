import { formatComposer, transposeSong, type IRealSong } from '@jam-practice/core/iRealPro';
import { semitonesTo } from '@jam-practice/core/setlistKeys';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, View, useWindowDimensions, type ViewToken } from 'react-native';

import ChordChartView from '@/components/ChordChartView';
import { ChordChartIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';

/** One page: a tune, with either its chart's library id (your own charts, loaded on demand) or the
    chart itself (someone else's setlist), or neither. */
export type ChartPage = {
  key: string;
  name: string;
  chartId?: string | null;
  song?: IRealSong | null;
  /** Play it in this key (a root, e.g. "Eb") — the chart is transposed to it. */
  toKey?: string | null;
  /** The tempo to show with it. */
  tempo?: number | null;
};

/**
 * Charts one per page, swiped left/right — the setlist "view all charts" reader, shared by your
 * own setlists and shared/posted ones. A tune with no chart still gets its page so the count
 * matches the setlist. Only the current page and its neighbours render their chart.
 */
export function ChartPager({ pages, initialIndex = 0, onIndexChange }: { pages: ChartPage[]; initialIndex?: number; onIndexChange?: (i: number) => void }) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);

  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) {
        setIndex(first.index);
        onIndexChange?.(first.index);
      }
    },
    [onIndexChange],
  );

  if (pages.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
          No tunes yet.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={pages}
        keyExtractor={(p) => p.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        renderItem={({ item, index: i }) => (
          <View style={{ width }}>{Math.abs(i - index) <= 1 ? <Page page={item} /> : null}</View>
        )}
      />
      {pages.length > 1 ? (
        <View className="flex-row flex-wrap items-center justify-center gap-1.5 px-4 py-2">
          {pages.map((p, i) => (
            <View
              key={p.key}
              style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.accent : colors['surface-hover'] }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const Page = memo(function Page({ page }: { page: ChartPage }) {
  if (page.song) return <ChartBody song={page.song} toKey={page.toKey} tempo={page.tempo} />;
  if (page.chartId) return <LibraryChart name={page.name} chartId={page.chartId} toKey={page.toKey} tempo={page.tempo} />;
  return <NoChart name={page.name} />;
});

function LibraryChart({ name, chartId, toKey, tempo }: { name: string; chartId: string; toKey?: string | null; tempo?: number | null }) {
  const { selectedSong, selectedSongLoading } = useChordChartsLibrary(chartId);
  if (selectedSong) return <ChartBody song={selectedSong} toKey={toKey} tempo={tempo} />;
  if (selectedSongLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <LoadingSpinner showLabel label="Loading chart…" />
      </View>
    );
  }
  return <NoChart name={name} missing />;
}

function NoChart({ name, missing }: { name: string; missing?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center gap-3 px-10">
      <ChordChartIcon color={colors.muted} size={32} />
      <Text className="font-ui-bold text-center text-xl font-bold" style={{ color: colors.foreground }}>
        {name}
      </Text>
      <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
        {missing ? "Couldn't find this tune's chart." : 'No chord chart for this tune.'}
      </Text>
    </View>
  );
}

function ChartBody({ song: original, toKey, tempo }: { song: IRealSong; toKey?: string | null; tempo?: number | null }) {
  const { colors } = useAppTheme();
  const song = useMemo(() => (toKey ? transposeSong(original, semitonesTo(original.key, toKey)) : original), [original, toKey]);
  const info = [
    song.composer ? formatComposer(song.composer) : null,
    song.style || null,
    song.key || null,
    `${song.timeSignature.top}/${song.timeSignature.bottom}`,
    tempo ? `${tempo} BPM` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 6, paddingTop: 2, paddingBottom: 16 }}>
      {info ? (
        <Text numberOfLines={1} className="font-ui px-2 pb-1 text-xs" style={{ color: colors.muted }}>
          {info}
        </Text>
      ) : null}
      <ChordChartView song={song} barsPerRow={4} hideHeader />
    </ScrollView>
  );
}
