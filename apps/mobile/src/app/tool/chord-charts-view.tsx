import { formatComposer, KEY_NAMES, keyPitchClass, transposeSong } from '@jam-practice/core/iRealPro';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ChordChartView from '@/components/ChordChartView';
import { ChordChartSongMenu, type MenuTarget } from '@/components/ChordChartSongMenu';
import { Dropdown } from '@/components/Dropdown';
import { DotsVerticalIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { forgetRecentChart, recordRecentChart } from '@/lib/chordChartRecents';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { isMinorKey, prettyKeyName } from '@/lib/keyNames';
import { IconButton } from '@/components/ui';
import { useForgetChart } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';
import { withAccidentals } from '@/components/Accidentals';

const BARS_PER_ROW = 4;

/**
 * The full-page chart viewer — what tapping a chart in the library pushes to. Built to give the
 * chart itself as much of the screen as possible: the title and info (composer · style · key ·
 * time signature) live *in the navigation header*, next to the back button, rather than in a block
 * above the chart; the header's right side holds a compact key button (transpose, display-only —
 * accent-filled while transposed) and the same ⋮ menu the library rows use (Edit / Playlists / Delete).
 * Below the header there's nothing but the chart, at the usual 16 dp side gutter (it scales to the
 * width, so four bars a line still fit on a 360 dp phone).
 */
function ChordChartsViewScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { selectedSong: selected, selectedSongLoading, deleteSong, addToPlaylist, removeFromPlaylist, playlists, allSongs } = useChordChartsLibrary(id ?? null);
  const forgetChart = useForgetChart();
  const [transposeKey, setTransposeKey] = useState('');
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);

  useEffect(() => {
    if (id) recordRecentChart(id);
  }, [id]);

  const transposeSemitones =
    selected && transposeKey ? (KEY_NAMES.indexOf(transposeKey) - keyPitchClass(selected.key) + 12) % 12 : 0;
  const displayed = useMemo(
    () => (selected && transposeSemitones !== 0 ? transposeSong(selected, transposeSemitones) : selected),
    [selected, transposeSemitones],
  );

  const meta = allSongs.find((s) => s.id === id);
  const minor = !!selected && isMinorKey(selected.key);

  const subtitle = displayed
    ? [
        displayed.composer ? formatComposer(displayed.composer) : null,
        displayed.style || null,
        displayed.key ? prettyKeyName(displayed.key) : null,
        `${displayed.timeSignature.top}/${displayed.timeSignature.bottom}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: selected?.title ?? 'Chart',
          headerTitle: () => (
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} className="font-ui-bold text-lg font-bold tracking-tight" style={{ color: colors.foreground }}>
                {selected?.title || 'Chart'}
              </Text>
              {subtitle ? (
                <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                  {withAccidentals(subtitle)}
                </Text>
              ) : null}
            </View>
          ),
          headerRight: () =>
            selected ? (
              <View className="flex-row items-center gap-1">
                <Dropdown
                  value={transposeKey}
                  onChange={setTransposeKey}
                  triggerLabel={transposeKey ? `${prettyKeyName(transposeKey)}${minor ? 'm' : ''}` : selected.key ? prettyKeyName(selected.key) : 'Key'}
                  highlighted={!!transposeKey}
                  options={[
                    { value: '', label: selected.key ? `Original (${prettyKeyName(selected.key)})` : 'As written' },
                    // In the chart's own quality: a minor chart offers C♯m, Dm, … (not major keys).
                    ...KEY_NAMES.map((k) => ({ value: k, label: `${prettyKeyName(k)}${minor ? 'm' : ''}` })),
                  ]}
                />
                {meta ? <IconButton Icon={DotsVerticalIcon} label="Chart options" onPress={() => setMenuTarget({ song: meta, playlistId: null })} /> : null}
              </View>
            ) : null,
        }}
      />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, flexGrow: 1 }}>
          {selectedSongLoading ? (
            <View className="flex-1 items-center justify-center py-12">
              <LoadingSpinner showLabel label="Loading chart…" />
            </View>
          ) : selected && displayed ? (
            <ChordChartView song={displayed} barsPerRow={BARS_PER_ROW} hideHeader />
          ) : (
            <View className="flex-1 items-center justify-center py-16">
              <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
                Couldn&apos;t find that chart.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <ChordChartSongMenu
        target={menuTarget}
        playlists={playlists.map((p) => ({ id: p.id, name: p.name, count: p.songs.length }))}
        onClose={() => setMenuTarget(null)}
        onEdit={(songId) => router.push({ pathname: '/tool/chord-charts-editor', params: { songId } })}
        onAddToPlaylist={(songId, name) => void addToPlaylist(songId, name)}
        onRemoveFromPlaylist={(songId, playlistId) => void removeFromPlaylist(songId, playlistId)}
        onDelete={(songId) => {
          void deleteSong(songId);
          forgetChart(songId);
          forgetRecentChart(songId);
          router.back();
        }}
      />
    </View>
  );
}

export default withScreenLoader(ChordChartsViewScreen);
