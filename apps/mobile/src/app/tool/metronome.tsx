import { DEFAULT_CLICK_SOUND_ID, type BeatLevel } from '@jam-practice/core/clickSounds';
import {
  COMMON_METERS,
  NEXT_LEVEL,
  SUB_LABELS,
  clampBpm,
  defaultAccents,
  defaultSubAccents,
  nearestNoteValue,
  useTapTempo,
} from '@jam-practice/core/meterControls';
import { MAX_BEATS } from '@jam-practice/core/meters';
import { EMPTY_STRUCTURE, type Structure, cycleSectionAccent, cycleSectionSubAccent, sectionAt } from '@jam-practice/core/structure';
import { Stack } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeatIndicator } from '@/components/BeatIndicator';
import { MeterIcon, SectionsIcon, SpeakerIcon, SubdivisionChipIcon } from '@/components/icons';
import { StructureEditor } from '@/components/StructureEditor';
import {
  BigButton,
  MeterQuickPicks,
  SoundPicker,
  SubdivisionPicker,
  TempoHero,
  TempoNoteConversionHint,
  TempoNoteValuePicker,
  TimeSignatureControl,
  soundSummary,
} from '@/components/tool/meter';
import { Segmented } from '@/components/tool/reward';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import {
  getMetronomeSnapshot,
  startMetronome,
  stopMetronome,
  subscribeMetronome,
  updateMetronomeSettings,
  updateMetronomeStructure,
} from '@/lib/metronomeEngine';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useToolActivity } from '@/lib/toolTime';

const SETTINGS_KEY = 'jam-practice-metronome';
const DEFAULT_SETTINGS = {
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
 * The Metronome, laid out like the website's: the tempo (− / number / +, the note value it counts,
 * a slider, −10 −5 Tap tempo +5 +10), the beat strip (tap a beat to change its accent), the big
 * Start button, then One meter / Changing meters and the setting chips — Time, Subdivision (or
 * Sections) and Sound — each opening a sheet. It's centred and only scrolls on a short screen.
 *
 * Settings sync to the signed-in account via `useSyncedSettings` (falling back to this device's
 * own `AsyncStorage` cache when the account isn't reachable).
 */
function MetronomeScreen() {
  const { colors } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);

  const bpm = clampBpm(settings.bpm);
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, useStructure, structure, tempoNoteValue } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);

  const engineState = useSyncExternalStore(subscribeMetronome, getMetronomeSnapshot);
  const { running, currentBeat, currentSub } = engineState;
  useToolActivity('/metronome', running);

  useEffect(() => {
    updateMetronomeSettings({ bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue });
  }, [bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue]);

  useEffect(() => {
    updateMetronomeStructure({ useStructure, structure });
  }, [useStructure, structure]);

  const canStart = !useStructure || structure.form.length > 0;

  function start() {
    if (!canStart) return;
    startMetronome();
  }

  const tap = useTapTempo((next) => updateSettings({ bpm: clampBpm(next) }));

  function changeBeats(n: number) {
    updateSettings({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  }

  function cycleBeat(index: number) {
    updateSettings({ accents: accents.map((level, i) => (i === index ? NEXT_LEVEL[level] : level)) });
  }

  function cycleSub(beatIndex: number, subIndex: number) {
    const dotCount = Math.max(0, Math.round(subdivision) - 1);
    const flatIndex = beatIndex * dotCount + subIndex;
    updateSettings({
      subAccents: subAccents.map((level, i) => (i === flatIndex ? NEXT_LEVEL[level] : level)),
    });
  }

  const activeSection =
    useStructure && structure.form.length > 0 ? sectionAt(structure, engineState.formIndex) : null;
  const displayAccents = activeSection
    ? defaultAccents(activeSection.beatsPerBar, activeSection.accents)
    : accents;
  const displaySubdivision = activeSection ? activeSection.subdivision : subdivision;
  const displaySubAccents = activeSection
    ? defaultSubAccents(activeSection.beatsPerBar, activeSection.subdivision, activeSection.subAccents)
    : subAccents;
  const effectiveBeatUnit = activeSection?.beatUnit ?? beatUnit;

  function handleCycleBeat(index: number) {
    if (activeSection) {
      updateSettings({ structure: cycleSectionAccent(structure, activeSection.id, index) });
      return;
    }
    cycleBeat(index);
  }

  function handleCycleSub(beatIndex: number, subIndex: number) {
    if (activeSection) {
      updateSettings({ structure: cycleSectionSubAccent(structure, activeSection.id, beatIndex, subIndex) });
      return;
    }
    cycleSub(beatIndex, subIndex);
  }

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady) return <ScreenSpinner />;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Metronome' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 24 }}
        >
          <View className="items-center gap-4">
            <TempoHero
              bpm={bpm}
              setBpm={(next) => updateSettings({ bpm: clampBpm(next) })}
              beatsPerBar={activeSection?.beatsPerBar ?? beatsPerBar}
              beatUnit={activeSection?.beatUnit ?? beatUnit}
              onTap={tap}
              tempoNote={<TempoNoteValuePicker value={tempoNoteValue} onChange={(next) => updateSettings({ tempoNoteValue: next })} />}
            />
            <TempoNoteConversionHint bpm={bpm} tempoNoteValue={tempoNoteValue} effectiveBeatUnit={effectiveBeatUnit} />
            {useStructure && activeSection ? (
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
                Section <Text style={{ color: colors.foreground }}>{activeSection.name}</Text> · bar {engineState.barInSection + 1} of{' '}
                {activeSection.bars}
              </Text>
            ) : null}
            {useStructure && !activeSection ? (
              <Text className="font-ui px-6 text-center text-sm" style={{ color: colors.muted }}>
                Add sections and put them in the form to start.
              </Text>
            ) : (
              <BeatIndicator
                accents={displayAccents}
                currentBeat={running ? currentBeat : null}
                onCycle={handleCycleBeat}
                subdivision={displaySubdivision}
                subAccents={displaySubAccents}
                currentSub={currentSub}
                onCycleSub={handleCycleSub}
                cycleHint
              />
            )}
          </View>

          <BigButton label={running ? 'Stop' : 'Start'} secondary={running} disabled={!running && !canStart} onPress={running ? stopMetronome : start} />

          {/* Below Start: the meter mode (it decides which chips there are), then the chips. */}
          <View className="items-center gap-3">
            <Segmented
              onPage
              label="Meter"
              value={useStructure ? 'structure' : 'single'}
              onChange={(v) => updateSettings({ useStructure: v === 'structure' })}
              options={[
                { value: 'single', label: 'One meter' },
                { value: 'structure', label: 'Changing meters' },
              ]}
            />
            <SettingsBar>
              {useStructure ? (
                <SettingChip
                  Icon={SectionsIcon}
                  label="Sections"
                  value={structure.sections.length ? `${structure.sections.length} section${structure.sections.length === 1 ? '' : 's'}` : 'Add sections'}
                >
                  <StructureEditor
                    structure={structure}
                    onChange={(next) => updateSettings({ structure: next })}
                    activeFormIndex={running ? engineState.formIndex : null}
                  />
                </SettingChip>
              ) : (
                <>
                  <SettingChip Icon={MeterIcon} label="Time" title="Time signature" value={`${beatsPerBar}/${beatUnit}`}>
                    <TimeSignatureControl
                      beatsPerBar={beatsPerBar}
                      beatUnit={beatUnit}
                      onChangeBeats={(n) => changeBeats(Math.min(MAX_BEATS, Math.max(1, n)))}
                      onSetBeatUnit={(unit) => updateSettings({ beatUnit: unit })}
                    />
                    <MeterQuickPicks
                      meters={COMMON_METERS}
                      beatsPerBar={beatsPerBar}
                      beatUnit={beatUnit}
                      onPick={(b, u) => updateSettings({ beatUnit: u, beatsPerBar: b, accents: defaultAccents(b, accents) })}
                    />
                  </SettingChip>
                  <SettingChip Icon={SubdivisionChipIcon} label="Subdivision" value={SUB_LABELS[subdivision] ?? String(subdivision)}>
                    <SubdivisionPicker value={subdivision} onChange={(next) => updateSettings({ subdivision: next })} />
                  </SettingChip>
                </>
              )}
              <SettingChip Icon={SpeakerIcon} label="Sound" value={soundSummary(soundId, volume)}>
                <SoundPicker
                  soundId={soundId}
                  setSoundId={(id) => updateSettings({ soundId: id })}
                  volume={volume}
                  setVolume={(next) => updateSettings({ volume: next })}
                />
              </SettingChip>
            </SettingsBar>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export default withScreenLoader(MetronomeScreen);
