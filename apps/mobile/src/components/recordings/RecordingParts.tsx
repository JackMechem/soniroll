import { sortByText } from '@jam-practice/core/sortText';
import type { Tune } from '@jam-practice/core/types';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo, useState } from 'react';
import { FlatList, type LayoutChangeEvent, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchField } from '@/components/ChordChartList';
import { CheckIcon, CloseIcon, LinkIcon, PauseIcon, PlayIcon } from '@/components/icons';
import { formatDuration, formatRecordedAt, type Recording } from '@/lib/recordings';
import { TUNE_LIST_LABEL, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { GradientFill } from '@/components/tool/reward';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * One audio player for a whole screen: rows hand it their recording (`toggle`), so a list of
 * recordings doesn't create a native player per row. Streams the stored file from its Convex URL
 * (or a local `file://` take, before it's saved).
 */
export function useRecordingPlayer() {
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  function toggle(key: string, uri: string | null) {
    if (!uri) return;
    if (activeKey === key) {
      if (status.playing) player.pause();
      else {
        if (status.duration > 0 && status.currentTime >= status.duration - 0.05) void player.seekTo(0);
        player.play();
      }
      return;
    }
    player.replace({ uri });
    setActiveKey(key);
    player.play();
  }

  return {
    activeKey,
    playing: status.playing,
    currentTime: status.currentTime,
    /** Player-reported length once loaded; callers fall back to the stored duration before that. */
    duration: status.duration,
    toggle,
    seek: (seconds: number) => void player.seekTo(seconds),
  };
}

export type RecordingPlayer = ReturnType<typeof useRecordingPlayer>;

export function PlayButton({ playing, onPress, size = 40 }: { playing: boolean; onPress: () => void; size?: number }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      accessibilityRole="button"
      hitSlop={6}
      android_ripple={{ color: colors['accent-hover'] }}
      className="items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, backgroundColor: colors.accent }}
    >
      {playing ? (
        <PauseIcon color={colors['accent-foreground']} size={size * 0.5} />
      ) : (
        <PlayIcon color={colors['accent-foreground']} size={size * 0.5} />
      )}
    </Pressable>
  );
}

/** Progress bar with times; tap anywhere on it to seek there. */
export function SeekBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);
  const fraction = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  return (
    <View className="gap-1">
      <Pressable
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => width > 0 && duration > 0 && onSeek((e.nativeEvent.locationX / width) * duration)}
        hitSlop={{ top: 12, bottom: 12 }}
        className="justify-center"
        style={{ height: 20 }}
      >
        <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: withAlpha(colors.foreground, 0.1) }}>
          <View className="h-full overflow-hidden rounded-full" style={{ width: `${fraction * 100}%` }}>
            <GradientFill />
          </View>
        </View>
      </Pressable>
      <View className="flex-row justify-between">
        <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {formatDuration(currentTime)}
        </Text>
        <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {formatDuration(duration)}
        </Text>
      </View>
    </View>
  );
}

/** What a row needs — your own `Recording`, or one shared with you in a setlist (`PublicRecording`
    mapped to `_id`). */
type PlayableRecording = Pick<Recording, 'name' | 'durationSec' | 'createdAt' | 'url'> & { _id: string };

/** A recording in a list: play/pause, name, date · length (· tune), and a seek bar while it's
    the one playing. Tapping the row itself opens it (when `onOpen` is given — your own only). */
export function RecordingRow({
  recording,
  tuneName,
  player,
  onOpen,
  background,
}: {
  recording: PlayableRecording;
  tuneName?: string | null;
  player: RecordingPlayer;
  onOpen?: () => void;
  background?: string;
}) {
  const { colors } = useAppTheme();
  const active = player.activeKey === recording._id;
  const detail = [formatRecordedAt(recording.createdAt), formatDuration(recording.durationSec), tuneName].filter(Boolean).join(' · ');
  return (
    <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: background ?? colors.surface }}>
      <View className="flex-row items-center gap-3">
        <PlayButton playing={active && player.playing} onPress={() => player.toggle(recording._id, recording.url)} />
        <Pressable onPress={onOpen} disabled={!onOpen} className="min-w-0 flex-1" accessibilityLabel={recording.name}>
          <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
            {recording.name}
          </Text>
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            {detail}
          </Text>
        </Pressable>
      </View>
      {active ? (
        <SeekBar
          currentTime={player.currentTime}
          duration={player.duration || recording.durationSec}
          onSeek={player.seek}
        />
      ) : null}
    </View>
  );
}

/** Every tune of yours by id, from both lists — for showing a recording's linked tune. */
export function useTuneIndex() {
  const { lists, ready } = useTuneLists();
  const byId = useMemo(() => {
    const map = new Map<string, { tune: Tune; list: TuneListId }>();
    for (const list of ['tunes', 'learn'] as TuneListId[]) for (const tune of lists[list].tunes) map.set(tune.id, { tune, list });
    return map;
  }, [lists]);
  return { byId, ready };
}

/** Pick one tune (from both lists) to link a recording to. */
export function TuneSelectModal({
  visible,
  selectedId,
  onPick,
  onClose,
}: {
  visible: boolean;
  selectedId?: string | null;
  onPick: (tuneId: string) => void;
  onClose: () => void;
}) {
  const { colors, derived } = useAppTheme();
  const { lists } = useTuneLists();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const all = (['tunes', 'learn'] as TuneListId[]).flatMap((list) => lists[list].tunes.map((tune) => ({ tune, list })));
    const q = query.trim().toLowerCase();
    return sortByText(
      q ? all.filter((r) => r.tune.name.toLowerCase().includes(q)) : all,
      (r) => r.tune.name,
    );
  }, [lists, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
          <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
            Link to a tune
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: derived.fill }}
          >
            <CloseIcon color={colors.foreground} size={18} />
          </Pressable>
        </View>
        <View className="px-4 pb-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search your tunes" />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.tune.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <Text className="font-ui py-10 text-center text-sm" style={{ color: colors.muted }}>
              {query ? 'No tunes match.' : 'No tunes in your library yet.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item.tune.id)}
              android_ripple={{ color: colors['surface-hover'] }}
              className="mb-1.5 min-h-[52px] flex-row items-center gap-3 overflow-hidden rounded-lg px-3 py-2"
              style={{ backgroundColor: derived.fill }}
            >
              <LinkIcon color={colors.muted} size={18} />
              <View className="flex-1">
                <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                  {item.tune.name}
                </Text>
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  {TUNE_LIST_LABEL[item.list]}
                </Text>
              </View>
              {selectedId === item.tune.id ? <CheckIcon color={colors.accent} size={20} /> : null}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

/** Pick one of your existing recordings — linking it to a tune. Recordings already linked to
    that tune aren't offered; ones linked to another tune say so (linking moves them). */
export function RecordingSelectModal({
  visible,
  recordings,
  excludeTuneId,
  onPick,
  onClose,
}: {
  visible: boolean;
  recordings: Recording[] | undefined;
  excludeTuneId: string;
  onPick: (recording: Recording) => void;
  onClose: () => void;
}) {
  const { colors, derived } = useAppTheme();
  const { byId } = useTuneIndex();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recordings ?? []).filter((r) => r.tuneId !== excludeTuneId && (!q || r.name.toLowerCase().includes(q)));
  }, [recordings, excludeTuneId, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
          <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
            Link a recording
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: derived.fill }}
          >
            <CloseIcon color={colors.foreground} size={18} />
          </Pressable>
        </View>
        <View className="px-4 pb-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search recordings" />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r._id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <Text className="font-ui py-10 text-center text-sm" style={{ color: colors.muted }}>
              {query ? 'No recordings match.' : 'No other recordings to link.'}
            </Text>
          }
          renderItem={({ item }) => {
            const other = item.tuneId ? byId.get(item.tuneId)?.tune.name : null;
            return (
              <Pressable
                onPress={() => onPick(item)}
                android_ripple={{ color: colors['surface-hover'] }}
                className="mb-1.5 min-h-[52px] justify-center overflow-hidden rounded-lg px-3 py-2"
                style={{ backgroundColor: derived.fill }}
              >
                <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                  {[formatRecordedAt(item.createdAt), formatDuration(item.durationSec), other ? `linked to ${other}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}
