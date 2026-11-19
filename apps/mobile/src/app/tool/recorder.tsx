import { useConvexAuth } from '@convex-dev/auth/react';
import { DEFAULT_CLICK_SOUND_ID, type BeatLevel } from '@jam-practice/core/clickSounds';
import {
  NEXT_LEVEL,
  accentsFromGroups,
  clampBpm,
  defaultAccents,
  defaultSubAccents,
  nearestNoteValue,
  useTapTempo,
} from '@jam-practice/core/meterControls';
import { MAX_BEATS } from '@jam-practice/core/meters';
import {
  EMPTY_STRUCTURE,
  type Structure,
  cycleSectionAccent,
  cycleSectionSubAccent,
  sectionAt,
} from '@jam-practice/core/structure';
import { useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeatIndicator } from '@/components/BeatIndicator';
import { InfoButton } from '@/components/InfoButton';
import { FileMusicIcon, MetronomeIcon, MicrophoneIcon, SlidersIcon, StopIcon } from '@/components/icons';
import {
  AccentAndSubdivisionControls,
  SoundOptions,
  TempoControls,
  TempoNoteValueControls,
  TimeSignatureControls,
} from '@/components/MetronomeControls';
import { NumberStepper } from '@/components/NumberStepper';
import { useTuneIndex } from '@/components/recordings/RecordingParts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { StructureEditor } from '@/components/StructureEditor';
import { ToolOptionsSheet } from '@/components/ToolOptionsSheet';
import { getMetronomeSnapshot, subscribeMetronome } from '@/lib/metronomeEngine';
import {
  clearRecorderError,
  getRecorderSnapshot,
  startRecording,
  stopRecording,
  subscribeRecorder,
  updateRecorderMetronome,
  type RecorderMetronome,
} from '@/lib/recorderEngine';
import { formatDuration, recordingsApi } from '@/lib/recordings';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';

// A new key — the web Recorder's own settings ("jam-practice-recorder") are its multitrack ones.
// Everything from `bpm` through `tempoNoteValue` is the Metronome tool's own settings shape.
const SETTINGS_KEY = 'jam-practice-recorder-take';
const DEFAULT_SETTINGS = {
  autoGain: true,
  metronome: false,
  countInBars: 1,
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1] as BeatLevel[],
  subdivision: 1,
  subAccents: [] as BeatLevel[],
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  useStructure: false,
  structure: EMPTY_STRUCTURE as Structure,
  tempoNoteValue: 4 as number | null,
};

/**
 * The Recorder: one take at a time, with the metronome optionally clicking along (and counting
 * you in). The metronome is the full Metronome tool — same controls on the page (tempo, time
 * signature, the tappable beat strip) and the same options behind its own Options button (accent
 * grouping, subdivision, tempo note value, structures, sound), plus a count-in. Stopping goes
 * straight to the save page; saved takes live on the account (`convex/recordings.ts`). Opened from
 * a tune's page (`?tuneId=`), the take is for that tune and the metronome starts at its tempo.
 */
function RecorderScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { tuneId } = useLocalSearchParams<{ tuneId?: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { byId } = useTuneIndex();
  const tune = tuneId ? byId.get(tuneId)?.tune : undefined;
  const recordings = useQuery(recordingsApi.list, isAuthenticated ? {} : 'skip');

  // From a tune's page, the metronome starts at the tune's own tempo (not saved as the default).
  const tuneTempo = tune?.tempos.find((t) => t.enabled)?.value ?? tune?.tempos[0]?.value;
  const [bpmOverride, setBpmOverride] = useState<number | null>(null);
  const bpm = clampBpm(bpmOverride ?? tuneTempo ?? settings.bpm);
  function setBpm(next: number) {
    if (tuneTempo !== undefined) setBpmOverride(clampBpm(next));
    else updateSettings({ bpm: clampBpm(next) });
  }
  const tap = useTapTempo(setBpm);

  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, useStructure, structure, tempoNoteValue } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);

  const metronome: RecorderMetronome = {
    enabled: settings.metronome && (!useStructure || structure.form.length > 0),
    settings: { bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue },
    structure: { useStructure, structure },
    countInBars: settings.countInBars,
  };

  const rec = useSyncExternalStore(subscribeRecorder, getRecorderSnapshot);
  const busy = rec.phase !== 'idle';
  const click = useSyncExternalStore(subscribeMetronome, getMetronomeSnapshot);
  const clicking = busy && settings.metronome && click.running;

  // Tempo, accents, sound… changed mid-take apply live, like in the Metronome tool.
  useEffect(() => {
    updateRecorderMetronome({
      enabled: true,
      settings: { bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue },
      structure: { useStructure, structure },
      countInBars: 0,
    });
  }, [bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue, useStructure, structure]);

  // Ticking clock while recording.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (rec.phase !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rec.phase]);
  const elapsed = rec.phase === 'recording' && rec.startedAt ? (now - rec.startedAt) / 1000 : 0;

  async function onRecordPress() {
    if (rec.phase === 'idle') {
      clearRecorderError();
      await startRecording(metronome, { autoGain: settings.autoGain });
      return;
    }
    if (rec.phase === 'finishing') return;
    const take = await stopRecording();
    if (take) {
      router.push({
        pathname: '/recordings/save',
        params: { uri: take.uri, duration: String(take.durationSec), ...(tuneId ? { tuneId } : {}) },
      });
    }
  }

  // --- Metronome-tool accent/structure editing, verbatim from `tool/metronome.tsx` ---
  function changeBeats(n: number) {
    updateSettings({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  }
  const activeSection = useStructure && structure.form.length > 0 ? sectionAt(structure, clicking ? click.formIndex : 0) : null;
  const displayAccents = activeSection ? defaultAccents(activeSection.beatsPerBar, activeSection.accents) : accents;
  const displaySubdivision = activeSection ? activeSection.subdivision : subdivision;
  const displaySubAccents = activeSection
    ? defaultSubAccents(activeSection.beatsPerBar, activeSection.subdivision, activeSection.subAccents)
    : subAccents;
  function handleCycleBeat(index: number) {
    if (activeSection) {
      updateSettings({ structure: cycleSectionAccent(structure, activeSection.id, index) });
      return;
    }
    updateSettings({ accents: accents.map((level, i) => (i === index ? NEXT_LEVEL[level] : level)) });
  }
  function handleCycleSub(beatIndex: number, subIndex: number) {
    if (activeSection) {
      updateSettings({ structure: cycleSectionSubAccent(structure, activeSection.id, beatIndex, subIndex) });
      return;
    }
    const dotCount = Math.max(0, Math.round(subdivision) - 1);
    const flatIndex = beatIndex * dotCount + subIndex;
    updateSettings({ subAccents: subAccents.map((level, i) => (i === flatIndex ? NEXT_LEVEL[level] : level)) });
  }

  if (isLoading || !settingsReady) return <ScreenSpinner />;

  const fg = { color: colors.foreground };
  const muted = { color: colors.muted };

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-10" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Recorder' }} />
        <MicrophoneIcon color={colors.muted} size={40} />
        <Text className="font-ui text-center text-base" style={muted}>
          Recordings are saved to your account, so you can play them back on any device. Sign in to start recording.
        </Text>
        <Pressable onPress={() => router.push('/profile')} className="rounded-full px-6 py-3" style={{ backgroundColor: colors.accent }}>
          <Text className="font-ui-bold text-base font-bold" style={{ color: colors['accent-foreground'] }}>
            Sign in
          </Text>
        </Pressable>
      </View>
    );
  }

  const statusLabel =
    rec.phase === 'countin'
      ? 'Count-in…'
      : rec.phase === 'recording'
        ? 'Recording'
        : rec.phase === 'finishing'
          ? 'Saving the take…'
          : tune
            ? `For “${tune.name}”`
            : 'Ready';

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Recorder' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <View className="flex-1 gap-4 px-5 py-4" style={{ paddingBottom: 16 }}>
          <View className="flex-row">
            <Pressable
              onPress={() => router.push('/recordings')}
              disabled={busy}
              className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
              style={{ backgroundColor: colors.surface, opacity: busy ? 0.5 : 1 }}
            >
              <FileMusicIcon color={colors.foreground} size={18} />
              <Text className="font-ui-bold text-sm font-bold" style={fg}>
                My recordings{recordings ? ` (${recordings.length})` : ''}
              </Text>
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center gap-5">
            <View className="items-center gap-2">
              <Text
                numberOfLines={1}
                className="font-ui-semibold text-base font-semibold"
                style={{ color: rec.phase === 'recording' ? colors.danger : colors.muted }}
              >
                {statusLabel}
              </Text>
              <Text className="font-ui-extrabold text-5xl font-extrabold tabular-nums" style={fg}>
                {formatDuration(elapsed)}
              </Text>
              <LevelMeter level={rec.phase === 'recording' ? rec.level : 0} />
            </View>

            <Pressable
              onPress={() => void onRecordPress()}
              accessibilityLabel={busy ? 'Stop recording' : 'Start recording'}
              className="items-center justify-center rounded-full"
              style={{ width: 96, height: 96, borderWidth: 4, borderColor: colors['surface-hover'] }}
            >
              {busy ? (
                <View className="items-center justify-center rounded-2xl" style={{ width: 42, height: 42, backgroundColor: colors.danger }}>
                  <StopIcon color="#fff" size={24} />
                </View>
              ) : (
                <View className="rounded-full" style={{ width: 74, height: 74, backgroundColor: colors.danger }} />
              )}
            </Pressable>

            <View className="flex-row items-center gap-2" style={{ opacity: busy ? 0.5 : 1 }}>
              <Text className="font-ui-semibold text-sm font-semibold" style={muted}>
                Auto gain
              </Text>
              <InfoButton
                title="Auto gain"
                size={16}
                text="On: the phone sets the recording level automatically, so quiet playing still comes out at a good volume. Off: the raw microphone with no processing — truer dynamics, but much quieter."
              />
              <Switch
                value={settings.autoGain}
                onValueChange={(value) => updateSettings({ autoGain: value })}
                disabled={busy}
                trackColor={{ false: colors['surface-hover'], true: colors.accent }}
              />
            </View>

            {rec.error ? (
              <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
                {rec.error}
              </Text>
            ) : null}
          </View>

          {/* The metronome — the Metronome tool's own main controls, with its options one tap away. */}
          <View className="gap-4 rounded-3xl p-4" style={{ borderWidth: 1, borderColor: colors['surface-hover'] }}>
            <View className="flex-row items-center gap-2">
              <MetronomeIcon color={colors.foreground} size={20} />
              <Text className="font-ui-bold flex-1 text-base font-bold" style={fg}>
                Metronome
              </Text>
              {settings.metronome ? (
                <Pressable
                  onPress={() => setOptionsOpen(true)}
                  hitSlop={8}
                  accessibilityLabel="Metronome options"
                  className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
                  style={{ backgroundColor: colors.surface }}
                >
                  <SlidersIcon color={colors.foreground} size={16} />
                  <Text className="font-ui-bold text-sm font-bold" style={fg}>
                    Options
                  </Text>
                </Pressable>
              ) : null}
              <Switch
                value={settings.metronome}
                onValueChange={(value) => updateSettings({ metronome: value })}
                disabled={busy}
                trackColor={{ false: colors['surface-hover'], true: colors.accent }}
              />
            </View>
            {settings.metronome ? (
              <View className="items-center gap-3">
                <TempoControls bpm={bpm} setBpm={setBpm} onTap={tap} />
                <TimeSignatureControls
                  beatsPerBar={activeSection?.beatsPerBar ?? beatsPerBar}
                  beatUnit={activeSection?.beatUnit ?? beatUnit}
                  onChangeBeats={changeBeats}
                  onSetBeatUnit={(unit) => updateSettings({ beatUnit: unit })}
                />
                {useStructure && !activeSection ? (
                  <Text className="font-ui text-center text-sm" style={muted}>
                    Open Options to add sections and build a form.
                  </Text>
                ) : (
                  <BeatIndicator
                    accents={displayAccents}
                    currentBeat={clicking ? click.currentBeat : null}
                    onCycle={handleCycleBeat}
                    subdivision={displaySubdivision}
                    subAccents={displaySubAccents}
                    currentSub={clicking ? click.currentSub : 0}
                    onCycleSub={handleCycleSub}
                    size="sm"
                  />
                )}
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      <ToolOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title="Metronome options"
        tabs={[
          {
            key: 'meter',
            label: 'Meter',
            content: () => (
              <>
                <View className="items-start gap-1.5">
                  <Text className="font-ui-semibold text-xs font-semibold" style={muted}>
                    Tempo note value
                  </Text>
                  <TempoNoteValueControls
                    tempoNoteValue={tempoNoteValue}
                    setTempoNoteValue={(next) => updateSettings({ tempoNoteValue: next })}
                    effectiveBeatUnit={activeSection?.beatUnit ?? beatUnit}
                  />
                </View>
                <AccentAndSubdivisionControls
                  accents={accents}
                  subdivision={subdivision}
                  onSetSubdivision={(next) => updateSettings({ subdivision: next })}
                  onApplyGroups={(groups) =>
                    updateSettings({
                      beatsPerBar: groups.reduce((a, b) => a + b, 0),
                      accents: accentsFromGroups(groups),
                    })
                  }
                />
                <View className="gap-3 rounded-3xl p-4" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row items-center justify-between">
                    <Text className="font-ui-bold text-sm font-bold" style={fg}>
                      Use a structure
                    </Text>
                    <Switch
                      value={useStructure}
                      onValueChange={(value) => updateSettings({ useStructure: value })}
                      disabled={busy}
                      trackColor={{ false: colors['surface-hover'], true: colors.accent }}
                    />
                  </View>
                  <Text className="font-ui text-xs leading-4" style={muted}>
                    Chain bars of different time signatures in a fixed, looping sequence — e.g. 2 bars of 11/8, then a
                    bar of 12/8 — instead of one meter for the whole take.
                  </Text>
                  {useStructure ? (
                    <StructureEditor
                      structure={structure}
                      onChange={(next) => updateSettings({ structure: next })}
                      activeFormIndex={clicking ? click.formIndex : null}
                    />
                  ) : null}
                </View>
              </>
            ),
          },
          {
            key: 'countin',
            label: 'Count-in',
            content: () => (
              <>
                <NumberStepper
                  label="Count-in bars"
                  value={settings.countInBars}
                  unit=""
                  min={0}
                  max={4}
                  step={1}
                  disabled={busy}
                  onChange={(n) => updateSettings({ countInBars: Math.round(n) })}
                  hint="This many bars click before the recording starts, so you come in on the downbeat."
                />
                <Text className="font-ui text-xs leading-4" style={muted}>
                  The click plays through the speaker, so the microphone picks it up unless you wear headphones.
                </Text>
              </>
            ),
          },
          {
            key: 'sound',
            label: 'Sound',
            content: () => (
              <SoundOptions
                soundId={soundId}
                setSoundId={(id) => updateSettings({ soundId: id })}
                volume={volume}
                setVolume={(next) => updateSettings({ volume: next })}
              />
            ),
          },
        ]}
      />
    </View>
  );
}

function LevelMeter({ level }: { level: number }) {
  const { colors } = useAppTheme();
  return (
    <View className="h-2 w-48 overflow-hidden rounded-full" style={{ backgroundColor: colors['surface-hover'] }}>
      <View
        className="h-full rounded-full"
        style={{ width: `${Math.round(level * 100)}%`, backgroundColor: level > 0.85 ? colors.danger : colors.accent }}
      />
    </View>
  );
}

export default withScreenLoader(RecorderScreen);
