import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { FullScreenModal } from '@/components/FullScreenModal';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ROW_H, SearchField, useChordChartBrowser } from '@/components/ChordChartList';
import { ChordChartIcon, CloseIcon } from '@/components/icons';
import type { LibrarySongMeta } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Full-screen "pick one of your chord charts" — for linking a chart to a tune. A virtualized list
 * (fixed row heights) so it stays instant with thousands of charts, searchable by title or
 * composer, each row labelled with its playlist. `initialQuery` (usually the tune's own name)
 * pre-fills the search, so the matching chart is usually right at the top.
 */
export function ChartPickerModal({
  visible,
  initialQuery = '',
  title = 'Link a chord chart',
  exclude,
  onPick,
  onClose,
}: {
  visible: boolean;
  initialQuery?: string;
  /** Charts not to offer (the ones the tune already has). */
  exclude?: string[];
  /** The heading (picking a chart to link, by default). */
  title?: string;
  onPick: (song: LibrarySongMeta) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { allCharts, totalSongs } = useChordChartBrowser();
  const [query, setQuery] = useState(initialQuery);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setQuery(initialQuery);
  }

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const out: { song: LibrarySongMeta; playlist: string }[] = [];
    const skip = new Set(exclude ?? []);
    for (const song of allCharts.songs) {
      if (skip.has(song.id)) continue;
      if (!q || song.title.toLowerCase().includes(q) || song.composer.toLowerCase().includes(q)) out.push({ song, playlist: song.playlistNames });
    }
    return out;
  }, [allCharts, q, exclude]);

  return (
    <FullScreenModal visible={visible} onRequestClose={onClose}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
          <Text className="font-ui-bold text-xl font-bold" style={{ color: colors.foreground }}>
            {title}
          </Text>
          <Pressable onPress={onClose} accessibilityLabel="Close" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
            <CloseIcon color={colors.foreground} size={20} />
          </Pressable>
        </View>
        <View className="px-4 pb-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search charts" />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.song.id}
          getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListEmptyComponent={
            <Text className="font-ui py-6 text-center text-sm" style={{ color: colors.muted }}>
              {totalSongs === 0 ? 'No chord charts yet — create or import some first.' : `No charts match “${query}”.`}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item.song)}
              android_ripple={{ color: colors['surface-hover'] }}
              className="flex-row items-center gap-3 rounded-xl px-3"
              style={{ height: ROW_H }}
            >
              <ChordChartIcon color={colors.accent} size={20} />
              <View className="flex-1">
                <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                  {item.song.title}
                </Text>
                <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
                  {[item.song.composer, item.playlist].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </FullScreenModal>
  );
}
