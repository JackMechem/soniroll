import { sortByText } from '@jam-practice/core/sortText';
import { formatComposer } from '@jam-practice/core/iRealPro';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { ChordChartSongMenu, type MenuTarget } from '@/components/ChordChartSongMenu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { ChevronRightIcon, DotsVerticalIcon, FolderIcon, TrashIcon } from '@/components/icons';
import { forgetRecentChart } from '@/lib/chordChartRecents';
import { useChordChartsLibrary, type LibrarySongMeta } from '@/lib/useChordChartsLibrary';
import { SearchField as UiSearchField } from '@/components/ui';
import { useForgetChart } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Shared building blocks for the Chord Charts library screens — the top level
    (`app/tool/chord-charts.tsx`: Recent + playlist folders) and one playlist opened
    file-manager style (`app/tool/chord-charts-playlist.tsx`). Every row has a fixed height so
    lists can use `getItemLayout`, which is what makes the A–Z scrubber's jumps exact and instant
    thousands of rows down. */
export const ROW_H = 64;
export const FOLDER_H = 64;
export const LABEL_H = 40;
export const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export function letterOf(title: string) {
  const c = title.trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

export function songSubtitle(song: LibrarySongMeta, playlistName?: string) {
  return [song.composer ? formatComposer(song.composer) : null, playlistName].filter(Boolean).join(' · ');
}

export type SortedPlaylist = { id: string; name: string; songs: LibrarySongMeta[] };

/** The playlist-screen id for "All charts" — every chart in the library, once. */
export const ALL_CHARTS_ID = 'all';

/** The library hook plus everything the screens derive from it: playlists sorted by name with
    their charts sorted by title, "All charts" (`allCharts`, the whole library), an id → {song,
    names of its playlists} index, and the ⋮ menus (state + the rendered sheets, ready to drop into
    a screen). A chart can be in several playlists, or none. */
export function useChordChartBrowser(options: { onPlaylistDeleted?: (id: string) => void } = {}) {
  const router = useRouter();
  const library = useChordChartsLibrary(null);
  const { playlists: raw, allSongs, addToPlaylist, removeFromPlaylist, deleteSong, deletePlaylist } = library;
  const forgetChart = useForgetChart();
  const { colors } = useAppTheme();

  const playlists: SortedPlaylist[] = useMemo(
    () => sortByText(raw, (p) => p.name).map((p) => ({ id: p.id, name: p.name, songs: sortByText(p.songs, (s) => s.title) })),
    [raw],
  );
  const allCharts: SortedPlaylist = useMemo(() => ({ id: ALL_CHARTS_ID, name: 'All charts', songs: sortByText(allSongs, (s) => s.title) }), [allSongs]);

  const songIndex = useMemo(() => {
    const names = new Map(raw.map((p) => [p.id, p.name]));
    const map = new Map<string, { song: LibrarySongMeta; playlistName: string }>();
    for (const s of allSongs) map.set(s.id, { song: s, playlistName: s.playlistIds.map((id) => names.get(id)).filter(Boolean).join(', ') });
    return map;
  }, [raw, allSongs]);

  const summaries = useMemo(() => playlists.map((p) => ({ id: p.id, name: p.name, count: p.songs.length })), [playlists]);

  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  // The playlist ⋮ menu, and the delete confirmation it leads to.
  type PlaylistSummary = { id: string; name: string; count: number };
  const [playlistTarget, setPlaylistTarget] = useState<PlaylistSummary | null>(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState<(PlaylistSummary & { deleteCharts: boolean }) | null>(null);

  const openSong = useCallback(
    (id: string) => router.push({ pathname: '/tool/chord-charts-view', params: { id } }),
    [router],
  );

  const plural = (n: number) => `${n} chart${n === 1 ? '' : 's'}`;
  const menu = (
    <>
    <ActionSheet
      visible={!!playlistTarget}
      title={playlistTarget?.name}
      subtitle={playlistTarget ? plural(playlistTarget.count) : undefined}
      onClose={() => setPlaylistTarget(null)}
      actions={[
        {
          key: 'delete',
          icon: <TrashIcon color={colors.danger} size={22} />,
          label: 'Delete playlist',
          danger: true,
          onPress: () => playlistTarget && setDeletingPlaylist({ ...playlistTarget, deleteCharts: false }),
        },
        {
          key: 'delete-charts',
          icon: <TrashIcon color={colors.danger} size={22} />,
          label: 'Delete playlist and its charts',
          danger: true,
          onPress: () => playlistTarget && setDeletingPlaylist({ ...playlistTarget, deleteCharts: true }),
        },
      ]}
    />
    <ConfirmDialog
      visible={!!deletingPlaylist}
      title={`Delete “${deletingPlaylist?.name ?? ''}”?`}
      message={
        !deletingPlaylist
          ? ''
          : deletingPlaylist.deleteCharts
            ? `This deletes the playlist and its ${plural(deletingPlaylist.count)} — except any that are also in another playlist, which stay. Tunes linked to deleted charts keep their notes and keys. This can't be undone.`
            : `Only the playlist goes — its ${plural(deletingPlaylist.count)} stay in All charts and any other playlists.`
      }
      confirmLabel={deletingPlaylist?.deleteCharts ? 'Delete both' : 'Delete playlist'}
      onConfirm={() => {
        if (deletingPlaylist) {
          void deletePlaylist(deletingPlaylist.id, { deleteCharts: deletingPlaylist.deleteCharts });
          options.onPlaylistDeleted?.(deletingPlaylist.id);
        }
        setDeletingPlaylist(null);
      }}
      onCancel={() => setDeletingPlaylist(null)}
    />
    <ChordChartSongMenu
      target={menuTarget}
      playlists={summaries}
      onClose={() => setMenuTarget(null)}
      onEdit={(songId) => router.push({ pathname: '/tool/chord-charts-editor', params: { songId } })}
      onAddToPlaylist={(songId, name) => void addToPlaylist(songId, name)}
      onRemoveFromPlaylist={(songId, playlistId) => void removeFromPlaylist(songId, playlistId)}
      onDelete={(songId) => {
        void deleteSong(songId);
        forgetChart(songId);
        forgetRecentChart(songId);
      }}
    />
    </>
  );

  /** Opens the ⋮ menu for a playlist ("All charts" has none). */
  const openPlaylistMenu = (p: PlaylistSummary) => {
    if (p.id !== ALL_CHARTS_ID) setPlaylistTarget(p);
  };

  return { ...library, playlists, allCharts, songIndex, openSong, openMenu: setMenuTarget, openPlaylistMenu, menu };
}

export const SongRow = memo(function SongRow({
  song,
  subtitle,
  onSelect,
  onMenu,
}: {
  song: LibrarySongMeta;
  subtitle: string;
  onSelect: () => void;
  onMenu: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center" style={{ height: ROW_H }}>
      <Pressable
        onPress={onSelect}
        onLongPress={onMenu}
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-1 justify-center rounded-xl px-3"
        style={{ height: ROW_H - 4 }}
      >
        <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
          {song.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onMenu}
        accessibilityLabel={`Options for ${song.title}`}
        android_ripple={{ color: colors['surface-hover'], borderless: true, radius: 22 }}
        className="items-center justify-center"
        style={{ width: 44, height: 44 }}
      >
        <DotsVerticalIcon color={colors.muted} size={22} />
      </Pressable>
    </View>
  );
});

export const FolderRow = memo(function FolderRow({
  name,
  count,
  onPress,
  onMenu,
}: {
  name: string;
  count: number;
  onPress: () => void;
  /** Shows a ⋮ button (and long-press) for the playlist's menu. */
  onMenu?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ height: FOLDER_H, justifyContent: 'center' }}>
      <Pressable
        onPress={onPress}
        onLongPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${count} charts`}
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-row items-center gap-3 rounded-xl px-4"
        style={{ height: FOLDER_H - 8, backgroundColor: colors.surface }}
      >
        <FolderIcon color={colors.accent} size={24} />
        <Text numberOfLines={1} className="font-ui-bold flex-1 text-base font-bold" style={{ color: colors.foreground }}>
          {name}
        </Text>
        <Text className="font-ui text-sm tabular-nums" style={{ color: colors.muted }}>
          {count}
        </Text>
        {onMenu ? (
          <Pressable
            onPress={onMenu}
            accessibilityLabel={`Options for ${name}`}
            hitSlop={8}
            android_ripple={{ color: colors['surface-hover'], borderless: true, radius: 20 }}
            className="items-center justify-center"
            style={{ width: 32, height: 40 }}
          >
            <DotsVerticalIcon color={colors.muted} size={22} />
          </Pressable>
        ) : (
          <ChevronRightIcon color={colors.muted} size={22} />
        )}
      </Pressable>
    </View>
  );
});

export function SectionLabel({ title }: { title: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ height: LABEL_H, justifyContent: 'flex-end', paddingBottom: 6, paddingHorizontal: 4 }}>
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
        {title}
      </Text>
    </View>
  );
}

/** The A–Z strip down the right edge. One responder over the whole strip (not a button per
    letter) so a finger can drag along it; letters with no chart are dimmed and jump to the next
    letter that has one. While touching, the letter shows big mid-screen, where a thumb on the
    strip isn't covering it. */
export function LetterScrubber({ available, onLetter }: { available: Map<string, number>; onLetter: (l: string) => void }) {
  const { colors } = useAppTheme();
  const stripRef = useRef<View>(null);
  const geom = useRef({ top: 0, height: 1 });
  const tabBarHeight = useTabBarHeight();
  const lastRef = useRef<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  function measure() {
    stripRef.current?.measureInWindow((_x, y, _w, h) => {
      geom.current = { top: y, height: h || 1 };
    });
  }

  function handle(pageY: number) {
    const { top, height } = geom.current;
    const i = Math.min(LETTERS.length - 1, Math.max(0, Math.floor(((pageY - top) / height) * LETTERS.length)));
    const letter = LETTERS[i];
    if (letter !== lastRef.current) {
      lastRef.current = letter;
      setActive(letter);
      onLetter(letter);
    }
  }

  function end() {
    lastRef.current = null;
    setActive(null);
  }

  return (
    <>
      <View
        style={{ width: 28, paddingTop: 4, paddingBottom: 8 + tabBarHeight }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          measure();
          handle(e.nativeEvent.pageY);
        }}
        onResponderMove={(e) => handle(e.nativeEvent.pageY)}
        onResponderRelease={end}
        onResponderTerminate={end}
      >
        {/* Measured separately from the padded responder so letter math maps onto the letters. */}
        <View ref={stripRef} onLayout={measure} style={{ flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
          {LETTERS.map((l) => (
            <Text
              key={l}
              className="font-ui-bold text-[11px] font-bold"
              style={{
                color: l === active ? colors.accent : colors.foreground,
                opacity: available.has(l) ? 1 : 0.3,
              }}
            >
              {l}
            </Text>
          ))}
        </View>
      </View>
      {active ? (
        <View style={{ pointerEvents: 'none', position: 'absolute', top: '35%', left: 0, right: 0, alignItems: 'center' }}>
          <View className="items-center justify-center rounded-3xl" style={{ width: 96, height: 96, backgroundColor: colors.accent }}>
            <Text className="font-ui-extrabold text-5xl font-extrabold" style={{ color: colors['accent-foreground'] }}>
              {active}
            </Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

/** The search box the library screens use — the app's one search field (`ui.tsx`), under its older
    `onChange` name. */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <UiSearchField value={value} onChangeText={onChange} placeholder={placeholder} />;
}
