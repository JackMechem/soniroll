import { useConvexAuth } from '@convex-dev/auth/react';
import { DEFAULT_CLICK_SOUND_ID, type BeatLevel } from '@jam-practice/core/clickSounds';
import {
  NEXT_LEVEL,
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
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeatIndicator } from '@/components/BeatIndicator';
import { MetronomeIcon, MicrophoneIcon, NoteIcon, RecordIcon, SpeakerIcon, StopIcon } from '@/components/icons';
import { RecordingRow, useRecordingPlayer, useTuneIndex } from '@/components/recordings/RecordingParts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { StructureEditor } from '@/components/StructureEditor';
import { SwitchRow } from '@/components/SwitchRow';
import {
  BigButton,
  SoundPicker,
  SubdivisionPicker,
  TempoHero,
  TempoNoteConversionHint,
  TempoNoteValuePicker,
  TimeSignatureControl,
  soundSummary,
} from '@/components/tool/meter';
import { GradientFill, OptionGroup, Segmented } from '@/components/tool/reward';
import { CountField, EmptyPanel } from '@/components/tool/rhythm';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
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
import { useDeviceUrls } from '@/lib/deviceFiles';
import { formatDuration, recordingsApi, type Recording } from '@/lib/recordings';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { useToolActivity } from '@/lib/toolTime';

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
 * The Recorder, laid out like the website's (`apps/web/components/Recorder.tsx`): what's
 * happening and the take's length, the input level, the beat strip while the metronome is on, the
 * big round record button, then the chips — Microphone, Metronome (its on/off switch is the first
 * thing in its sheet, then the Metronome tool's own tempo and meter controls), Count-in and Click
 * sound while it's on, and Recent takes once there are some. Stopping goes straight to the save
 * page; saved takes live on the account (`convex/recordings.ts`). Opened from a tune's page
 * (`?tuneId=`), the take is for that tune and the metronome starts at its tempo.
 */
function RecorderScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { tuneId } = useLocalSearchParams<{ tuneId?: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const { byId } = useTuneIndex();
  const tune = tuneId ? byId.get(tuneId)?.tune : undefined;
  const recordings = useDeviceUrls(useQuery(recordingsApi.list, isAuthenticated ? {} : 'skip'));
  const [takesOpen, setTakesOpen] = useState(false);

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
  useToolActivity('/recorder', busy);
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

  const muted = { color: colors.muted };

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Recorder' }} />
        <EmptyPanel>
          <MicrophoneIcon color={colors.muted} size={32} />
          <Text className="font-ui text-center text-sm leading-5" style={muted}>
            Sign in to record: your takes are saved with your account, so you can name them, keep notes and link them to your tunes.
          </Text>
          <BigButton label="Sign in" onPress={() => router.push('/profile')} />
        </EmptyPanel>
      </View>
    );
  }

  const recordingNow = rec.phase === 'recording';
  const statusLabel =
    rec.phase === 'countin'
      ? 'Count-in…'
      : recordingNow
        ? 'Recording'
        : rec.phase === 'finishing'
          ? 'Saving the take…'
          : tune
            ? `For “${tune.name}”`
            : 'Ready';

  const meterValue = useStructure ? (structure.sections.length ? 'Changing meters' : 'No sections yet') : `${beatsPerBar}/${beatUnit}`;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Recorder' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 24 }}
        >
          <View className="items-center gap-5">
            <View className="items-center gap-1">
              <View className="flex-row items-center gap-1.5">
                {recordingNow ? <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.danger }} /> : null}
                <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: recordingNow ? colors.danger : colors.muted }}>
                  {statusLabel}
                </Text>
              </View>
              <Text className="font-ui-semibold text-6xl font-semibold tracking-tight" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
                {formatDuration(elapsed)}
              </Text>
            </View>

            <LevelMeter level={recordingNow ? rec.level : 0} />

            {settings.metronome ? (
              useStructure && !activeSection ? (
                <Text className="font-ui text-center text-sm" style={muted}>
                  Add sections under Metronome to arrange the form.
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
                  cycleHint
                />
              )
            ) : null}

            <View className="items-center gap-2">
              <RecordButton busy={busy} onPress={() => void onRecordPress()} />
              <Text className="font-ui text-xs" style={[muted, { height: 16 }]}>
                {settings.metronome && !busy && settings.countInBars > 0 ? `${settings.countInBars}-bar count-in` : ''}
              </Text>
            </View>

            {rec.error ? (
              <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
                {rec.error}
              </Text>
            ) : null}
          </View>

          <SettingsBar>
            <SettingChip Icon={MicrophoneIcon} label="Microphone" value={settings.autoGain ? 'Auto gain' : 'No processing'}>
              <SwitchRow
                label="Auto gain"
                checked={settings.autoGain}
                onChange={(value) => updateSettings({ autoGain: value })}
                disabled={busy}
                hint="On: the phone sets the recording level automatically, so quiet playing still comes out at a good volume. Off: the raw microphone with no processing — truer dynamics, but much quieter."
              />
            </SettingChip>

            <SettingChip Icon={MetronomeIcon} label="Metronome" value={settings.metronome ? `${bpm} BPM · ${meterValue}` : 'Off'}>
              {/* Like every other chip, this one opens its settings; the on/off switch is the first. */}
              <SwitchRow
                label="Click while recording"
                checked={settings.metronome}
                onChange={(value) => updateSettings({ metronome: value })}
                disabled={busy}
                hint="Plays a metronome click (with a count-in) while you record. It isn't recorded unless your microphone picks it up."
              />
              {settings.metronome ? (
                <>
                  <View className="items-center gap-3">
                    <TempoHero
                      bpm={bpm}
                      setBpm={setBpm}
                      beatsPerBar={activeSection?.beatsPerBar ?? beatsPerBar}
                      beatUnit={activeSection?.beatUnit ?? beatUnit}
                      onTap={tap}
                      tempoNote={<TempoNoteValuePicker value={tempoNoteValue} onChange={(next) => updateSettings({ tempoNoteValue: next })} />}
                    />
                    <TempoNoteConversionHint bpm={bpm} tempoNoteValue={tempoNoteValue} effectiveBeatUnit={activeSection?.beatUnit ?? beatUnit} />
                  </View>
                  <Segmented
                    label="Meter"
                    value={useStructure ? 'structure' : 'single'}
                    onChange={(v) => updateSettings({ useStructure: v === 'structure' })}
                    disabled={busy}
                    options={[
                      { value: 'single', label: 'One meter' },
                      { value: 'structure', label: 'Changing meters' },
                    ]}
                  />
                  {useStructure ? (
                    <StructureEditor
                      structure={structure}
                      onChange={(next) => updateSettings({ structure: next })}
                      activeFormIndex={clicking ? click.formIndex : null}
                    />
                  ) : (
                    <>
                      <TimeSignatureControl
                        beatsPerBar={beatsPerBar}
                        beatUnit={beatUnit}
                        onChangeBeats={(n) => changeBeats(Math.min(MAX_BEATS, Math.max(1, n)))}
                        onSetBeatUnit={(unit) => updateSettings({ beatUnit: unit })}
                      />
                      <OptionGroup title="Subdivision">
                        <SubdivisionPicker value={subdivision} onChange={(next) => updateSettings({ subdivision: next })} />
                      </OptionGroup>
                    </>
                  )}
                  <Text className="font-ui text-xs leading-4" style={muted}>
                    The click plays through the speaker, so the microphone picks it up unless you wear headphones.
                  </Text>
                </>
              ) : null}
            </SettingChip>

            {settings.metronome ? (
              <>
                <SettingChip
                  Icon={NoteIcon}
                  label="Count-in"
                  value={settings.countInBars ? `${settings.countInBars} bar${settings.countInBars === 1 ? '' : 's'}` : 'Off'}
                >
                  <CountField
                    title="Count-in bars"
                    hint="This many bars click before the recording starts, so you come in on the downbeat."
                    value={settings.countInBars}
                    min={0}
                    max={4}
                    unit={['bar', 'bars']}
                    disabled={busy}
                    onChange={(n) => updateSettings({ countInBars: n })}
                  />
                </SettingChip>
                <SettingChip Icon={SpeakerIcon} label="Click sound" value={soundSummary(soundId, volume)}>
                  <SoundPicker
                    soundId={soundId}
                    setSoundId={(id) => updateSettings({ soundId: id })}
                    volume={volume}
                    setVolume={(next) => updateSettings({ volume: next })}
                  />
                </SettingChip>
              </>
            ) : null}

            {/* Recent takes: hidden until there's a take, so a fresh page doesn't lead with "0". */}
            {recordings && recordings.length > 0 ? (
              <SettingChip Icon={RecordIcon} label="Recent takes" value={String(recordings.length)} open={takesOpen} onOpenChange={setTakesOpen}>
                {/* The sheet is a Modal, which would stay on top of the next screen: close it first. */}
                <RecentTakes
                  recordings={recordings}
                  tuneName={(id) => (id ? byId.get(id)?.tune.name : undefined)}
                  onOpen={(id) => {
                    setTakesOpen(false);
                    router.push({ pathname: '/recordings/[id]', params: { id } });
                  }}
                  onAll={() => {
                    setTakesOpen(false);
                    router.push('/recordings');
                  }}
                  disabled={busy}
                />
              </SettingChip>
            ) : null}
          </SettingsBar>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** The last few takes, playable, in the Recent takes sheet (its player only exists while the
    sheet is open). */
function RecentTakes({
  recordings,
  tuneName,
  onOpen,
  onAll,
  disabled,
}: {
  recordings: Recording[];
  tuneName: (tuneId: string | null) => string | undefined;
  onOpen: (id: string) => void;
  onAll: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  const player = useRecordingPlayer();
  return (
    <View className="gap-2" style={{ opacity: disabled ? 0.5 : 1 }} pointerEvents={disabled ? 'none' : 'auto'}>
      {recordings.slice(0, 5).map((r) => (
        <RecordingRow
          key={r._id}
          recording={r}
          tuneName={tuneName(r.tuneId)}
          player={player}
          onOpen={() => onOpen(r._id)}
          background={colors.background}
        />
      ))}
      <Pressable onPress={onAll} accessibilityRole="link" hitSlop={8} className="self-end py-1">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.accent }}>
          All recordings
        </Text>
      </Pressable>
    </View>
  );
}

/** The round record button (a red dot; a red square to stop) with its caption under it. */
function RecordButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={busy ? 'Stop recording' : 'Start recording'}
      className="items-center gap-2"
    >
      <View className="items-center justify-center rounded-full" style={{ width: 96, height: 96, borderWidth: 3, borderColor: withAlpha(colors.foreground, 0.15) }}>
        {busy ? (
          <View className="items-center justify-center rounded-md" style={{ width: 40, height: 40, backgroundColor: colors.danger }}>
            <StopIcon color="#ffffff" size={24} />
          </View>
        ) : (
          <View className="rounded-full" style={{ width: 74, height: 74, backgroundColor: colors.danger }} />
        )}
      </View>
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {busy ? 'Stop' : 'Record'}
      </Text>
    </Pressable>
  );
}

function LevelMeter({ level }: { level: number }) {
  const { colors } = useAppTheme();
  const hot = level > 0.85;
  return (
    <View className="h-2 w-full max-w-xs overflow-hidden rounded-full" style={{ backgroundColor: withAlpha(colors.foreground, 0.1) }}>
      <View className="h-full overflow-hidden rounded-full" style={{ width: `${Math.round(level * 100)}%` }}>
        {hot ? <View className="flex-1" style={{ backgroundColor: colors.danger }} /> : <GradientFill />}
      </View>
    </View>
  );
}

export default withScreenLoader(RecorderScreen);
