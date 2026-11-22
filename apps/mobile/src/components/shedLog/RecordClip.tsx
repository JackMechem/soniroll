import { DEFAULT_CLICK_SOUND_ID } from '@jam-practice/core/clickSounds';
import { EMPTY_STRUCTURE } from '@jam-practice/core/structure';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';

import { RecordIcon, StopIcon } from '@/components/icons';
import { SmallButton } from '@/components/shedLog/parts';
import { clearRecorderError, getRecorderSnapshot, startRecording, stopRecording, subscribeRecorder, type RecorderMetronome } from '@/lib/recorderEngine';
import { formatDuration } from '@/lib/recordings';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** The Recorder's own setting this uses (its key; the rest of its settings aren't needed here). */
const RECORDER_KEY = 'jam-practice-recorder-take';
const RECORDER_DEFAULTS = { autoGain: true };

/** No metronome: a clip on a routine or task is just the mic. */
const NO_CLICK: RecorderMetronome = {
  enabled: false,
  settings: { bpm: 100, beatsPerBar: 4, beatUnit: 4, accents: [], subdivision: 1, subAccents: [], volume: 0.8, soundId: DEFAULT_CLICK_SOUND_ID, tempoNoteValue: 4 },
  structure: { useStructure: false, structure: EMPTY_STRUCTURE },
  countInBars: 0,
};

/** Which RecordClip started the take that's going (so another one, or the Recorder's, isn't
    taken for this one's). A tiny store: it outlives the screen (a take keeps going if you leave). */
let owner: string | null = null;
const ownerListeners = new Set<() => void>();
function setOwner(next: string | null) {
  owner = next;
  for (const l of ownerListeners) l();
}
function subscribeOwner(l: () => void) {
  ownerListeners.add(l);
  return () => ownerListeners.delete(l);
}
const getOwner = () => owner;

/**
 * Record a clip right here (the website's `RecordClip`, compact): Record, then the take's time and
 * Stop in its place; stopping opens the save screen for it, named after the task or routine and
 * saved with them (`?logDate=&routineId=&taskId=`). The Recorder's own engine, without its
 * metronome, with its Auto gain setting.
 */
export function RecordClip({ date, routineId, taskId }: { date: string; routineId: string | null; taskId?: string }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const rec = useSyncExternalStore(subscribeRecorder, getRecorderSnapshot);
  const [settings] = useSyncedSettings(RECORDER_KEY, RECORDER_DEFAULTS);
  const current = useSyncExternalStore(subscribeOwner, getOwner);
  const me = `${date}/${routineId ?? 'day'}/${taskId ?? ''}`;
  const busy = rec.phase !== 'idle';
  const mine = busy && current === me;
  useKeepAwakeWhile(mine);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!mine || rec.phase !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [mine, rec.phase]);
  const elapsed = rec.phase === 'recording' && rec.startedAt ? Math.max(0, (now - rec.startedAt) / 1000) : 0;

  async function begin() {
    clearRecorderError();
    setOwner(me);
    await startRecording(NO_CLICK, { autoGain: settings.autoGain });
  }

  async function finish() {
    if (rec.phase === 'finishing') return;
    const take = await stopRecording();
    setOwner(null);
    if (!take) return;
    router.push({
      pathname: '/recordings/save',
      params: { uri: take.uri, duration: String(take.durationSec), logDate: date, ...(routineId ? { routineId } : {}), ...(taskId ? { taskId } : {}) },
    });
  }

  if (!mine) {
    return (
      <View className="items-end gap-1">
        {/* Another take is going (the Recorder, or another task): one at a time. */}
        <SmallButton label="Record" Icon={RecordIcon} onPress={() => void begin()} disabled={busy} />
        {rec.error && current === me ? (
          <Text className="font-ui text-xs" style={{ color: colors.danger }}>
            {rec.error}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => void finish()}
      accessibilityRole="button"
      accessibilityLabel="Stop recording"
      android_ripple={{ color: withAlpha(colors.danger, 0.2) }}
      className="h-9 flex-row items-center gap-2 overflow-hidden rounded-lg px-3"
      style={{ backgroundColor: withAlpha(colors.danger, 0.12) }}
    >
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.danger }} />
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.danger, fontVariant: ['tabular-nums'] }}>
        {rec.phase === 'recording' ? formatDuration(elapsed) : rec.phase === 'finishing' ? 'Saving…' : 'Starting…'}
      </Text>
      <StopIcon color={colors.danger} size={16} />
    </Pressable>
  );
}
