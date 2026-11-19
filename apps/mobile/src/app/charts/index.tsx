import { useRouter } from 'expo-router';
import { useMemo, useState, type ComponentType } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ALL_CHARTS_ID, FolderRow, SearchField, SongRow, songSubtitle, useChordChartBrowser } from '@/components/ChordChartList';
import { ChordChartNewSheet } from '@/components/ChordChartNewSheet';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { LibraryHeader } from '@/components/TabHeader';
import { IconButton } from '@/components/ui';
import { ChordChartIcon, DownloadIcon, FolderIcon, LinkIcon, PlusIcon, type IconProps } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useRecentCharts } from '@/lib/chordChartRecents';
import type { LibrarySongMeta } from '@/lib/useChordChartsLibrary';
import { useTuneLists } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

type Hit = { song: LibrarySongMeta; playlistName: string };

/**
 * The Charts tab — everything about chord charts in one place, the way the Tunes tab is for tune
 * lists. At a glance: counts (charts, playlists, charts linked to one of your tunes), the charts
 * you opened most recently, and your playlists (open one to see its charts; ⋮ to delete it). The
 * search covers every chart in every playlist. The + makes a new chart or playlist, or imports a
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
  const { lists } = useTuneLists();

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

  // How many of your charts are linked to one of your tunes.
  const linkedCount = useMemo(() => {
    const ids = new Set<string>();
    for (const t of [...lists.tunes.tunes, ...lists.learn.tunes]) if (t.chordChartId && songIndex.has(t.chordChartId)) ids.add(t.chordChartId);
    return ids.size;
  }, [lists.tunes.tunes, lists.learn.tunes, songIndex]);

  const recentCharts = recent.map((id) => songIndex.get(id)).filter((x) => x !== undefined);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <LibraryHeader right={<IconButton primary Icon={PlusIcon} label="New chord chart or playlist" onPress={() => setNewOpen(true)} />} />
        <View className="px-4 pb-2 pt-3">
          <SearchField value={query} onChange={setQuery} placeholder={`Search ${totalSongs} charts…`} />
        </View>

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
            <View className="flex-row gap-3">
              <StatCard Icon={ChordChartIcon} count={totalSongs} label="Charts" />
              <StatCard Icon={FolderIcon} count={playlists.length} label="Playlists" />
              <StatCard Icon={LinkIcon} count={linkedCount} label="Linked to tunes" />
            </View>

            {totalSongs === 0 ? (
              <View className="gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
                <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                  No chord charts yet. Build one with +, or import a chart link or playlist.
                </Text>
                <Pressable onPress={() => router.push('/charts/import')} className="flex-row items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: colors.background }}>
                  <DownloadIcon color={colors.foreground} size={18} />
                  <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                    Import charts
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {recentCharts.length > 0 ? (
              <View className="gap-2">
                <Text className="font-ui-bold px-1 text-lg font-bold" style={{ color: colors.foreground }}>
                  Recently opened
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {recentCharts.map((r) => (
                    <Pressable
                      key={r.song.id}
                      onPress={() => openSong(r.song.id)}
                      onLongPress={() => openMenu({ song: r.song, playlistId: null })}
                      className="justify-between rounded-2xl p-3"
                      style={{ width: 150, height: 92, backgroundColor: colors.surface }}
                    >
                      <ChordChartIcon color={colors.accent} size={20} />
                      <View>
                        <Text numberOfLines={1} className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
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
                <Text className="font-ui-bold px-1 pb-1 text-lg font-bold" style={{ color: colors.foreground }}>
                  Playlists
                </Text>
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

function StatCard({ Icon, count, label }: { Icon: ComponentType<IconProps>; count: number; label: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-1 gap-2 rounded-2xl p-3" style={{ backgroundColor: colors.surface }}>
      <Icon color={colors.accent} size={22} />
      <View>
        <Text className="font-ui-extrabold text-2xl font-extrabold tabular-nums" style={{ color: colors.foreground }}>
          {count}
        </Text>
        <Text numberOfLines={1} className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

export default withScreenLoader(ChartsScreen);
