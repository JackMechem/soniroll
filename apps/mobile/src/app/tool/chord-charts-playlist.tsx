import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  LETTERS,
  LetterScrubber,
  ROW_H,
  SearchField,
  SongRow,
  letterOf,
  songSubtitle,
  useChordChartBrowser,
  ALL_CHARTS_ID,
} from '@/components/ChordChartList';
import { DotsVerticalIcon, PlusIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { LibrarySongMeta } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';

/**
 * One playlist, opened file-manager style from the Chord Charts library: it's pushed as its own
 * screen (native slide-in, back button / back gesture returns to the playlist list), so only this
 * playlist's charts are on screen. Built for a 1,000+ chart playlist on a gig: big rows, a search
 * box scoped to this playlist, an A–Z scrubber down the right edge, and ⋮ (or long-press) per
 * chart for Move / Delete.
 *
 * Every row is the same height (`getItemLayout`), so the scrubber's `scrollToIndex` lands exactly,
 * instantly, however deep. Deliberately no sticky headers: changing `stickyHeaderIndices` on a
 * live list crashed the app on Android (`IndexOutOfBoundsException` in
 * `ReactClippingViewManager.addView`) in the previous, single-screen collapsible design.
 */
function ChordChartsPlaylistScreen() {
  const { colors } = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // Deleting this playlist (from its own ⋮) leaves nothing to show — go back.
  const { playlists, allCharts, songIndex, loading, openSong, openMenu, openPlaylistMenu, menu } = useChordChartBrowser({ onPlaylistDeleted: () => router.back() });
  const isAll = id === ALL_CHARTS_ID;
  const playlist = isAll ? allCharts : playlists.find((p) => p.id === id);
  const [query, setQuery] = useState('');
  const listRef = useRef<FlatList<LibrarySongMeta>>(null);

  const q = query.trim().toLowerCase();
  const songs = useMemo(() => {
    const all = playlist?.songs ?? [];
    if (!q) return all;
    return all.filter((s) => s.title.toLowerCase().includes(q) || s.composer.toLowerCase().includes(q));
  }, [playlist, q]);

  const letterIndex = useMemo(() => {
    const map = new Map<string, number>();
    songs.forEach((s, i) => {
      const l = letterOf(s.title);
      if (!map.has(l)) map.set(l, i);
    });
    return map;
  }, [songs]);

  const jumpToLetter = useCallback(
    (letter: string) => {
      for (let i = LETTERS.indexOf(letter); i < LETTERS.length; i++) {
        const idx = letterIndex.get(LETTERS[i]);
        if (idx !== undefined) {
          listRef.current?.scrollToIndex({ index: idx, animated: false });
          return;
        }
      }
    },
    [letterIndex],
  );

  const renderSong = useCallback(
    ({ item }: { item: LibrarySongMeta }) => (
      <SongRow
        song={item}
        subtitle={songSubtitle(item, isAll ? songIndex.get(item.id)?.playlistName : undefined)}
        onSelect={() => openSong(item.id)}
        onMenu={() => openMenu({ song: item, playlistId: isAll ? null : (playlist?.id ?? null) })}
      />
    ),
    [openSong, openMenu, playlist, isAll, songIndex],
  );

  const showScrubber = !q && songs.length > 30 && letterIndex.size > 1;
  const title = playlist?.name ?? 'Playlist';

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            playlist ? (
              <View className="flex-row items-center gap-1">
                <Pressable
                  onPress={() => router.push({ pathname: '/tool/chord-charts-new', params: isAll ? {} : { playlist: playlist.name } })}
                  accessibilityLabel={`New chord chart in ${title}`}
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.accent }}
                >
                  <PlusIcon color={colors['accent-foreground']} size={22} />
                </Pressable>
                {isAll ? null : (
                  <Pressable
                    onPress={() => openPlaylistMenu({ id: playlist.id, name: playlist.name, count: playlist.songs.length })}
                    accessibilityLabel={`Options for ${title}`}
                    className="h-10 w-9 items-center justify-center"
                  >
                    <DotsVerticalIcon color={colors.foreground} size={22} />
                  </Pressable>
                )}
              </View>
            ) : null,
        }}
      />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <View className="px-4 pb-2 pt-2">
          <SearchField value={query} onChange={setQuery} placeholder={`Search ${playlist?.songs.length ?? 0} in ${title}…`} />
        </View>
        {loading ? (
          <View className="flex-1 items-center justify-center py-16">
            <LoadingSpinner showLabel label="Loading your library…" />
          </View>
        ) : !playlist ? (
          <View className="flex-1 items-center justify-center px-16">
            <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
              This playlist is empty now.
            </Text>
          </View>
        ) : (
          <View className="flex-1 flex-row">
            <FlatList
              ref={listRef}
              style={{ flex: 1 }}
              data={songs}
              keyExtractor={(s) => s.id}
              renderItem={renderSong}
              getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
              initialNumToRender={16}
              windowSize={11}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingLeft: 16, paddingRight: showScrubber ? 0 : 16, paddingBottom: 32 }}
              ListEmptyComponent={
                <Text className="font-ui py-4 text-sm" style={{ color: colors.muted }}>
                  {q ? <>No charts match &ldquo;{query}&rdquo;.</> : isAll ? 'No charts yet — tap + to create one.' : 'No charts here yet — tap + to create one, or add charts with a chart’s ⋮ → Playlists.'}
                </Text>
              }
            />
            {showScrubber ? <LetterScrubber available={letterIndex} onLetter={jumpToLetter} /> : null}
          </View>
        )}
      </SafeAreaView>
      {menu}
    </View>
  );
}

export default withScreenLoader(ChordChartsPlaylistScreen);
