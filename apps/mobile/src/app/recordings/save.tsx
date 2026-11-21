import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { getInfoAsync } from 'expo-file-system/legacy';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LinkIcon, UnlinkIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PlayButton, SeekBar, TuneSelectModal, useRecordingPlayer, useTuneIndex } from '@/components/recordings/RecordingParts';
import { withScreenLoader } from '@/components/ScreenLoader';
import { errorText, placeFile, unplace, useSaveTarget } from '@/lib/files';
import { RECORDING_MIME, deleteLocalTake, formatRecordedAt, recordingsApi } from '@/lib/recordings';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * Where a finished take lands: listen back, name it, add notes, link it to a tune (pre-filled when
 * recorded from a tune's page), then Save keeps it with the account: online with a storage plan, on
 * this phone without one (`placeFile`). Leaving any other way asks first — until it's saved, the
 * take is only a temporary file.
 */
function SaveRecordingScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ uri: string; duration?: string; tuneId?: string }>();
  const durationSec = Number(params.duration) || 0;
  const { byId } = useTuneIndex();
  const generateUploadUrl = useMutation(recordingsApi.generateUploadUrl);
  const create = useMutation(recordingsApi.create);
  const target = useSaveTarget();
  const forTune = useQuery(recordingsApi.listForTune, params.tuneId ? { tuneId: params.tuneId } : 'skip');
  const player = useRecordingPlayer();
  const keyboard = useKeyboardHeight();

  const [recordedAt] = useState(() => Date.now());
  const [tuneId, setTuneId] = useState<string | null>(params.tuneId ?? null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Default name: "Take N" for a tune's recording, else the date and time.
  const defaultName = params.tuneId && forTune ? `Take ${forTune.length + 1}` : formatRecordedAt(recordedAt);
  const shownName = nameTouched ? name : defaultName;
  const tune = tuneId ? byId.get(tuneId)?.tune : undefined;

  // Android back asks before throwing the take away.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!saving) setConfirmDiscard(true);
      return true;
    });
    return () => sub.remove();
  }, [saving]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Online with a storage plan; kept on this phone without one (the website does the same).
      const info = await getInfoAsync(params.uri);
      if (!info.exists || !info.size) throw new Error('The recording file is empty.');
      const placed = await placeFile({ uri: params.uri, name: `${shownName}.m4a`, type: RECORDING_MIME, size: info.size }, target.storage, () => generateUploadUrl(), target.online);
      let id: Id<'recordings'>;
      try {
        id = await create({
          ...placed,
          name: shownName,
          notes,
          durationSec,
          mimeType: RECORDING_MIME,
          ...(tuneId ? { tuneId } : {}),
        });
      } catch (e) {
        unplace(placed);
        throw e;
      }
      deleteLocalTake(params.uri);
      if (params.tuneId) router.dismiss(2); // back to the tune's page, past the recorder
      else router.replace({ pathname: '/recordings/[id]', params: { id } });
    } catch (e) {
      setSaving(false);
      setError(errorText(e, "Couldn't save the recording."));
    }
  }

  function discard() {
    setConfirmDiscard(false);
    deleteLocalTake(params.uri);
    router.back();
  }

  const label = 'font-ui-bold text-sm font-bold';
  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: 'Save recording',
          gestureEnabled: false,
          headerLeft: () => (
            <Pressable onPress={() => !saving && setConfirmDiscard(true)} hitSlop={8} className="pr-3">
              <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.danger }}>
                Discard
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              className="min-h-10 justify-center rounded-lg px-4 py-2"
              style={{ backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}
            >
              <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                Save
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: keyboard ? keyboard + 40 : bottomSpace }}>
        <View className="gap-3 rounded-3xl p-4" style={{ backgroundColor: colors.surface }}>
          <View className="flex-row items-center gap-3">
            <PlayButton playing={player.activeKey === 'take' && player.playing} onPress={() => player.toggle('take', params.uri)} size={48} />
            <Text className="font-ui flex-1 text-sm" style={{ color: colors.muted }}>
              Listen back before saving.
            </Text>
          </View>
          <SeekBar
            currentTime={player.activeKey === 'take' ? player.currentTime : 0}
            duration={player.duration || durationSec}
            onSeek={(s) => (player.activeKey === 'take' ? player.seek(s) : undefined)}
          />
        </View>

        <View className="gap-1.5">
          <Text className={label} style={{ color: colors.muted }}>
            Name
          </Text>
          <TextInput
            value={shownName}
            onChangeText={(text) => {
              setNameTouched(true);
              setName(text);
            }}
            selectTextOnFocus={!nameTouched}
            className="font-ui rounded-2xl px-4 py-3 text-base"
            style={{ backgroundColor: colors.surface, color: colors.foreground }}
          />
        </View>

        <View className="gap-1.5">
          <Text className={label} style={{ color: colors.muted }}>
            Tune
          </Text>
          <View className="flex-row items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: colors.surface }}>
            <LinkIcon color={tune ? colors.accent : colors.muted} size={18} />
            <Pressable className="flex-1" onPress={() => setPicking(true)}>
              <Text numberOfLines={1} className="font-ui text-base" style={{ color: tune ? colors.foreground : colors.muted }}>
                {tune ? tune.name : 'Not linked — tap to link a tune'}
              </Text>
            </Pressable>
            {tune ? (
              <Pressable onPress={() => setTuneId(null)} hitSlop={8} accessibilityLabel="Unlink tune">
                <UnlinkIcon color={colors.muted} size={18} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View className="gap-1.5">
          <Text className={label} style={{ color: colors.muted }}>
            Notes
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="How did it go? What to work on…"
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
            className="font-ui rounded-2xl px-4 py-3 text-base"
            style={{ backgroundColor: colors.surface, color: colors.foreground, minHeight: 120 }}
          />
        </View>

        {saving ? (
          <View className="flex-row items-center justify-center gap-3">
            <LoadingSpinner size="sm" />
            <Text className="font-ui text-sm" style={{ color: colors.muted }}>
              Uploading…
            </Text>
          </View>
        ) : null}
        {error ? (
          <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
            {error} Your take is still here — try Save again.
          </Text>
        ) : null}
      </ScrollView>

      <TuneSelectModal
        visible={picking}
        selectedId={tuneId}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          setTuneId(id);
          setPicking(false);
        }}
      />
      <ConfirmDialog
        visible={confirmDiscard}
        title="Discard this take?"
        message="It hasn't been saved, so it'll be gone for good."
        confirmLabel="Discard"
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      />
    </View>
  );
}

export default withScreenLoader(SaveRecordingScreen);
