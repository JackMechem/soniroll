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
import { EMPTY_STRUCTURE, type Structure, cycleSectionAccent, cycleSectionSubAccent, sectionAt } from '@jam-practice/core/structure';
import { Stack } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeatIndicator } from '@/components/BeatIndicator';
import { EyeOffIcon, SlidersIcon } from '@/components/icons';
import {
  AccentAndSubdivisionControls,
  SoundOptions,
  TempoControls,
  TempoNoteValueControls,
  TimeSignatureControls,
} from '@/components/MetronomeControls';
import { NumberStepper } from '@/components/NumberStepper';
import { StructureEditor } from '@/components/StructureEditor';
import { ToolOptionsSheet } from '@/components/ToolOptionsSheet';
import {
  getTempoTrainerSnapshot,
  startTempoTrainer,
  stopTempoTrainer,
  subscribeTempoTrainer,
  updateTempoTrainerSettings,
  updateTempoTrainerStructure,
} from '@/lib/tempoTrainerEngine';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';

// A silent stretch this long would make the tool pointless at one end, impractical to configure
// at the other — matches web's own `MAX_CYCLE_BARS`.
const MAX_CYCLE_BARS = 32;

const SETTINGS_KEY = 'jam-practice-tempo-trainer';
// Every field through `tempoNoteValue` mirrors Metronome's own `DEFAULT_SETTINGS` exactly — this
// tool's metronome is meant to be identical to the plain one, not a simplified copy; `onBars`/
// `offBars` are the one thing added on top.
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
  onBars: 4,
  offBars: 4,
};

/**
 * Native port of `apps/web/components/TempoTrainer.tsx` — same no-scroll-main-screen +
 * `ToolOptionsSheet` shape every tool here follows, built directly on top of `metronome.tsx`'s
 * own structure (same meter/tempo/structure controls, reusing `MetronomeControls.tsx`'s pieces
 * wholesale) with one addition: a "Mute cycle" options tab (`onBars`/`offBars`) and, while a
 * silent stretch is playing, the main screen hides every timing cue — no beat strip, no section
 * readout — the same as web's own "nothing about time shows at all during a silent stretch" rule.
 */
function TempoTrainerScreen() {
  const { colors } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const bpm = clampBpm(settings.bpm);
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, useStructure, structure, tempoNoteValue, onBars, offBars } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);

  const engineState = useSyncExternalStore(subscribeTempoTrainer, getTempoTrainerSnapshot);
  const { running, phase, currentBeat, currentSub } = engineState;

  useEffect(() => {
    updateTempoTrainerSettings({
      bpm,
      beatsPerBar,
      beatUnit,
      accents,
      subdivision,
      subAccents,
      volume,
      soundId,
      tempoNoteValue,
      onBars,
      offBars,
    });
  }, [bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue, onBars, offBars]);

  useEffect(() => {
    updateTempoTrainerStructure({ useStructure, structure });
  }, [useStructure, structure]);

  const canStart = !useStructure || structure.form.length > 0;

  function start() {
    if (!canStart) return;
    startTempoTrainer();
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

  // Nothing about time shows during a silent stretch — not the beat strip (would still reveal
  // where in the bar playback is, even without the click), not the section readout — the whole
  // point of this tool is finding out whether the tempo holds with no cue at all.
  const silentNow = running && phase === 'off';

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady) return <ScreenSpinner />;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Tempo Trainer' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <View className="flex-1 px-6 py-4">
          <View className="flex-row justify-end">
            <Pressable
              onPress={() => setOptionsOpen(true)}
              hitSlop={8}
              accessibilityLabel="Options"
              className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
              style={{ backgroundColor: colors.surface }}
            >
              <SlidersIcon color={colors.foreground} size={18} />
              <Text className="text-sm font-bold font-ui-bold" style={{ color: colors.foreground }}>
                Options
              </Text>
            </Pressable>
          </View>

          <View
            className="flex-1 items-center justify-center gap-10"
          >
            <View className="items-center gap-4">
              <TempoNoteValueControls
                tempoNoteValue={tempoNoteValue}
                setTempoNoteValue={(next) => updateSettings({ tempoNoteValue: next })}
                effectiveBeatUnit={activeSection?.beatUnit ?? beatUnit}
              />
              <TempoControls bpm={bpm} setBpm={(next) => updateSettings({ bpm: next })} onTap={tap} />
              <TimeSignatureControls
                beatsPerBar={activeSection?.beatsPerBar ?? beatsPerBar}
                beatUnit={activeSection?.beatUnit ?? beatUnit}
                onChangeBeats={changeBeats}
                onSetBeatUnit={(unit) => updateSettings({ beatUnit: unit })}
              />
            </View>

            {silentNow ? (
              <View
                className="items-center gap-1.5 rounded-2xl px-5 py-4"
                style={{ backgroundColor: colors.surface, maxWidth: 280 }}
              >
                <EyeOffIcon color={colors.muted} size={20} />
                <Text className="text-center text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                  Keep the tempo going — the click will come back
                </Text>
              </View>
            ) : (
              <View className="items-center gap-3">
                {useStructure && activeSection ? (
                  <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                    Section <Text style={{ color: colors.foreground }}>{activeSection.name}</Text> ·
                    bar {engineState.barInSection + 1} of {activeSection.bars}
                  </Text>
                ) : null}

                {useStructure && !activeSection ? (
                  <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: colors.surface }}>
                    <Text className="text-center text-sm font-ui" style={{ color: colors.muted }}>
                      Open Options to add sections and build a form.
                    </Text>
                  </View>
                ) : (
                  <BeatIndicator
                    accents={displayAccents}
                    currentBeat={running ? currentBeat : null}
                    onCycle={handleCycleBeat}
                    subdivision={displaySubdivision}
                    subAccents={displaySubAccents}
                    currentSub={currentSub}
                    onCycleSub={handleCycleSub}
                  />
                )}
              </View>
            )}

            <Pressable
              onPress={running ? stopTempoTrainer : start}
              disabled={!running && !canStart}
              className="min-w-[220px] items-center rounded-full py-4"
              style={{
                backgroundColor: running ? colors.surface : colors.accent,
                opacity: !running && !canStart ? 0.5 : 1,
              }}
            >
              <Text
                className="text-base font-bold font-ui-bold"
                style={{ color: running ? colors.foreground : colors['accent-foreground'] }}
              >
                {running ? 'Stop' : 'Start'}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ToolOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title="Tempo Trainer options"
        tabs={[
          {
            key: 'meter',
            label: 'Meter',
            content: () => (
              <>
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
                    <Text className="text-sm font-bold font-ui-bold" style={{ color: colors.foreground }}>
                      Use a structure
                    </Text>
                    <Switch
                      value={useStructure}
                      onValueChange={(value) => updateSettings({ useStructure: value })}
                      trackColor={{ false: colors['surface-hover'], true: colors.accent }}
                    />
                  </View>
                  <Text className="text-xs leading-4 font-ui" style={{ color: colors.muted }}>
                    Chain bars of different time signatures in a fixed, looping sequence instead
                    of one meter for the whole run.
                  </Text>
                  {useStructure ? (
                    <StructureEditor
                      structure={structure}
                      onChange={(next) => updateSettings({ structure: next })}
                      activeFormIndex={running ? engineState.formIndex : null}
                    />
                  ) : null}
                </View>
              </>
            ),
          },
          {
            key: 'cycle',
            label: 'Mute cycle',
            content: () => (
              <>
                <NumberStepper
                  label="Bars audible"
                  value={onBars}
                  unit=""
                  min={1}
                  max={MAX_CYCLE_BARS}
                  step={1}
                  disabled={running}
                  onChange={(next) => updateSettings({ onBars: Math.round(next) })}
                  hint="How many bars the click plays before it cuts out."
                />
                <NumberStepper
                  label="Bars muted"
                  value={offBars}
                  unit=""
                  min={1}
                  max={MAX_CYCLE_BARS}
                  step={1}
                  disabled={running}
                  onChange={(next) => updateSettings({ offBars: Math.round(next) })}
                  hint="How many bars stay silent — with no beat shown either — before the click comes back. Keep the tempo going on your own until it does."
                />
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

export default withScreenLoader(TempoTrainerScreen);
