import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ALL_CHARTS_ID, FolderRow, SearchField, SongRow, songSubtitle, useChordChartBrowser } from '@/components/ChordChartList';
import { ChordChartNewSheet } from '@/components/ChordChartNewSheet';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { LibraryHeader } from '@/components/TabHeader';
import { EmptyState, IconButton, SectionHeader } from '@/components/ui';
import { ChordChartIcon, DownloadIcon, PlusIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useRecentCharts } from '@/lib/chordChartRecents';
import type { LibrarySongMeta } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';

type Hit = { song: LibrarySongMeta; playlistName: string };

/**
 * The Charts tab — everything about chord charts in one place, the way the Tunes tab is for tune
 * lists: the charts you opened most recently, and your playlists with their counts (open one to
 * see its charts; ⋮ to delete it). The search covers every chart in every playlist (hidden while
 * there are none; the empty state offers Import charts and New chart instead). The + makes a new chart or playlist, or imports a
 * chart link or playlist (`charts/import.tsx`). Opening a chart pushes the full-page viewer; every chart row has the
 * chart ⋮ menu (edit, move to a playlist, delete).
 */
function ChartsScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const charts = useChordChartBrowser();
  const { playlists, allCharts, songIndex, totalSongs, loading, createPlaylist, openSong, openMenu, openPlaylistMenu, menu } = charts;
  const recent = useRecentCharts();

  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const hits: Hit[] | null = useMemo(() => {
    if (!q) return null;
    const words = q.split(/\s+/);
    const out: Hit[] = [];
    for (const s of allCharts.songs) {
      if (words.every((w) => `${s.title} ${s.composer} ${s.style}`.toLowerCase().includes(w))) out.push(songIndex.get(s.id) ?? { song: s, playlistName: '' });
    }
    return out;
  }, [q, allCharts, songIndex]);

  const recentCharts = recent.map((id) => songIndex.get(id)).filter((x) => x !== undefined);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <LibraryHeader right={<IconButton primary Icon={PlusIcon} label="New chord chart or playlist" onPress={() => setNewOpen(true)} />} />
        {!loading && totalSongs > 0 ? (
          <View className="px-4 pb-2 pt-3">
            <SearchField value={query} onChange={setQuery} placeholder="Search charts" />
          </View>
        ) : null}

        {loading ? (
          <ScreenSpinner />
        ) : hits ? (
          <FlatList
            data={hits}
            keyExtractor={(h) => h.song.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomSpace }}
            renderItem={({ item }) => (
              <SongRow
                song={item.song}
                subtitle={songSubtitle(item.song, item.playlistName)}
                onSelect={() => openSong(item.song.id)}
                onMenu={() => openMenu({ song: item.song, playlistId: null })}
              />
            )}
            ListEmptyComponent={
              <Text className="font-ui py-8 text-center text-sm" style={{ color: colors.muted }}>
                No charts match &ldquo;{query}&rdquo;.
              </Text>
            }
          />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: bottomSpace, gap: 22 }}>
            {totalSongs === 0 ? (
              <EmptyState
                Icon={ChordChartIcon}
                title="No chord charts yet"
                body="Import an iReal Pro link or playlist, or build a chart yourself."
                action={{ label: 'Import charts', Icon: DownloadIcon, onPress: () => router.push('/charts/import') }}
                secondary={{ label: 'New chart', onPress: () => router.push('/tool/chord-charts-new') }}
              />
            ) : null}

            {recentCharts.length > 0 ? (
              <View className="gap-2">
                <SectionHeader title="Recently opened" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {recentCharts.map((r) => (
                    <Pressable
                      key={r.song.id}
                      onPress={() => openSong(r.song.id)}
                      onLongPress={() => openMenu({ song: r.song, playlistId: null })}
                      android_ripple={{ color: colors['surface-hover'] }}
                      className="justify-between overflow-hidden rounded-xl p-3"
                      style={{ width: 150, height: 92, backgroundColor: colors.surface }}
                    >
                      <ChordChartIcon color={colors.accent} size={20} />
                      <View>
                        <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                          {r.song.title}
                        </Text>
                        <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                          {[r.song.key, r.playlistName].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {totalSongs > 0 || playlists.length > 0 ? (
              <View className="gap-1">
                {/* With no playlists, the All charts row (with its count) is the whole section. */}
                {playlists.length > 0 ? <SectionHeader title="Playlists" count={playlists.length} /> : null}
                <FolderRow
                  name="All charts"
                  count={totalSongs}
                  onPress={() => router.push({ pathname: '/tool/chord-charts-playlist', params: { id: ALL_CHARTS_ID } })}
                />
                {playlists.map((p) => (
                  <FolderRow
                    key={p.id}
                    name={p.name}
                    count={p.songs.length}
                    onPress={() => router.push({ pathname: '/tool/chord-charts-playlist', params: { id: p.id } })}
                    onMenu={() => openPlaylistMenu({ id: p.id, name: p.name, count: p.songs.length })}
                  />
                ))}
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>

      {menu}
      <ChordChartNewSheet
        visible={newOpen}
        onClose={() => setNewOpen(false)}
        onChooseChart={() => router.push('/tool/chord-charts-new')}
        onChooseImport={() => router.push('/charts/import')}
        onCreatePlaylist={(name) => void createPlaylist(name)}
      />
    </View>
  );
}

export default withScreenLoader(ChartsScreen);
