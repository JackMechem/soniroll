import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ChevronRightIcon, LinkIcon, TrashIcon, UnlinkIcon } from '@/components/icons';
import { RecordingPlace } from '@/components/recordings/RecordingPlace';
import { PlayButton, SeekBar, TuneSelectModal, useRecordingPlayer, useTuneIndex } from '@/components/recordings/RecordingParts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { deleteOnDevice, useDeviceUrl } from '@/lib/deviceFiles';
import { formatDuration, formatRecordedDay, recordingsApi } from '@/lib/recordings';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { IconButton } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { TextInput } from '@/components/ThemedTextInput';

/** One saved recording: play it, rename it, keep notes on it, link it to a tune (or change or
    unlink it), or delete it. Edited name/notes show a Save button in the header; they also save
    when you leave the page, so nothing typed is lost. */
function RecordingScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recording = useDeviceUrl(useQuery(recordingsApi.get, id ? { id: id as Id<'recordings'> } : 'skip'));
  const update = useMutation(recordingsApi.update);
  const remove = useMutation(recordingsApi.remove);
  const { byId } = useTuneIndex();
  const player = useRecordingPlayer();
  const keyboard = useKeyboardHeight();

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const seeded = useRef(false);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Whatever's typed but not yet saved is saved on the way out.
  const pending = useRef<{ id: Id<'recordings'>; name: string; notes: string; savedName: string; savedNotes: string } | null>(null);
  useEffect(() => {
    if (recording && seeded.current) {
      pending.current = { id: recording._id, name, notes, savedName: recording.name, savedNotes: recording.notes };
    }
  });
  useEffect(
    () => () => {
      const p = pending.current;
      if (!p) return;
      const trimmed = p.name.trim();
      const patch = {
        ...(trimmed && trimmed !== p.savedName ? { name: trimmed } : {}),
        ...(p.notes !== p.savedNotes ? { notes: p.notes } : {}),
      };
      if (Object.keys(patch).length) void update({ id: p.id, ...patch });
    },
    [update],
  );

  // Seed the fields once from the server; after that the fields own the text.
  useEffect(() => {
    if (recording && !seeded.current) {
      seeded.current = true;
      setName(recording.name);
      setNotes(recording.notes);
    }
  }, [recording]);

  if (recording === undefined) return <ScreenSpinner />;
  if (recording === null) {
    return (
      <View className="flex-1 items-center justify-center px-10" style={{ backgroundColor: colors.background }}>
        <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
          This recording doesn&apos;t exist anymore.
        </Text>
      </View>
    );
  }

  const rec = recording;
  const linked = rec.tuneId ? byId.get(rec.tuneId) : undefined;
  const active = player.activeKey === rec._id;
  const label = 'font-ui-bold text-sm font-bold';

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed) setName(rec.name);
    else if (trimmed !== rec.name) void update({ id: rec._id, name: trimmed });
  }

  function saveNotes() {
    if (notes !== rec.notes) void update({ id: rec._id, notes });
  }

  const dirty = (name.trim() !== '' && name.trim() !== rec.name) || notes !== rec.notes;
  function saveAll() {
    saveName();
    saveNotes();
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: rec.name,
          headerRight: () =>
            dirty ? (
              <Pressable onPress={saveAll} className="min-h-10 justify-center rounded-lg px-4 py-2" style={{ backgroundColor: colors.accent }}>
                <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                  Save
                </Text>
              </Pressable>
            ) : (
              <IconButton Icon={TrashIcon} color={colors.danger} label="Delete recording" onPress={() => setConfirmDelete(true)} />
            ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: keyboard ? keyboard + 40 : bottomSpace }}>
        <View className="gap-3 rounded-3xl p-4" style={{ backgroundColor: colors.surface }}>
          <View className="flex-row items-center gap-3">
            <PlayButton playing={active && player.playing} onPress={() => player.toggle(rec._id, rec.url)} size={52} />
            <View className="flex-1">
              <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                {formatDuration(rec.durationSec)} · {formatRecordedDay(rec.createdAt)}
              </Text>
              {/* The routine or task it was made for, which opens it. */}
              <RecordingPlace routineId={rec.routineId} taskId={rec.taskId} logDate={rec.logDate} />
              {!rec.url && rec.device ? (
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  Kept on {rec.device.label}, so it plays there. A storage plan keeps recordings on all your devices.
                </Text>
              ) : rec.device ? (
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  Kept on this phone.
                </Text>
              ) : null}
            </View>
          </View>
          <SeekBar
            currentTime={active ? player.currentTime : 0}
            duration={(active && player.duration) || rec.durationSec}
            onSeek={(s) => (active ? player.seek(s) : undefined)}
          />
        </View>

        <View className="gap-1.5">
          <Text className={label} style={{ color: colors.muted }}>
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onBlur={saveName}
            onSubmitEditing={saveName}
            className="font-ui rounded-2xl px-4 py-3 text-base"
            style={{ backgroundColor: colors.surface, color: colors.foreground }}
          />
        </View>

        <View className="gap-1.5">
          <Text className={label} style={{ color: colors.muted }}>
            Tune
          </Text>
          {linked ? (
            <View className="flex-row items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: colors.surface }}>
              <LinkIcon color={colors.accent} size={18} />
              <Pressable
                className="flex-1 flex-row items-center gap-1"
                onPress={() => router.push({ pathname: '/library/tune', params: { id: linked.tune.id, list: linked.list } })}
              >
                <Text numberOfLines={1} className="font-ui-semibold flex-shrink text-base font-semibold" style={{ color: colors.foreground }}>
                  {linked.tune.name}
                </Text>
                <ChevronRightIcon color={colors.muted} size={18} />
              </Pressable>
              <Pressable onPress={() => setPicking(true)} hitSlop={8}>
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.accent }}>
                  Change
                </Text>
              </Pressable>
              <Pressable onPress={() => void update({ id: rec._id, tuneId: null })} hitSlop={8} accessibilityLabel="Unlink tune">
                <UnlinkIcon color={colors.muted} size={18} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setPicking(true)}
              className="flex-row items-center gap-3 rounded-2xl px-4 py-3"
              style={{ backgroundColor: colors.surface }}
            >
              <LinkIcon color={colors.muted} size={18} />
              <Text className="font-ui flex-1 text-base" style={{ color: colors.muted }}>
                {rec.tuneId ? 'Its tune was deleted — tap to link another' : 'Not linked — tap to link a tune'}
              </Text>
            </Pressable>
          )}
        </View>

        <View className="gap-1.5">
          <Text className={label} style={{ color: colors.muted }}>
            Notes
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onBlur={saveNotes}
            multiline
            placeholder="How did it go? What to work on…"
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
            className="font-ui rounded-2xl px-4 py-3 text-base"
            style={{ backgroundColor: colors.surface, color: colors.foreground, minHeight: 160 }}
          />
        </View>
      </ScrollView>

      <TuneSelectModal
        visible={picking}
        selectedId={rec.tuneId}
        onClose={() => setPicking(false)}
        onPick={(tuneId) => {
          setPicking(false);
          void update({ id: rec._id, tuneId });
        }}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this recording?"
        message="The audio is deleted from your account for good."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          void remove({ id: rec._id }).then(() => {
            if (rec.device) deleteOnDevice(rec.device.key);
          });
          router.back();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

export default withScreenLoader(RecordingScreen);
