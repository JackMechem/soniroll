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
import { useEffect, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';

import { BeatIndicator } from '@/components/BeatIndicator';
import { EyeOffIcon, MeterIcon, SectionsIcon, SpeakerIcon, SubdivisionChipIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { StructureEditor, StructureEmptyHint } from '@/components/StructureEditor';
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
import { CountField, PlanText } from '@/components/tool/rhythm';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { ToolFrame } from '@/components/tool/ToolFrame';
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
import { useToolActivity } from '@/lib/toolTime';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';

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

const bars = (n: number) => (n === 1 ? '1 bar' : `${n} bars`);

/**
 * The Tempo Trainer, laid out like the website's (`apps/web/components/TempoTrainer.tsx`): the
 * Metronome's tempo and beat strip with a line saying what Start does ("Click plays 4 bars, then
 * goes silent for 4 bars"), the big Start button, then One meter / Changing meters and the chips —
 * Time and Subdivision (or Sections), Mute cycle and Sound. During a silent stretch nothing about
 * time shows: a card covers the beats (keeping their space, so nothing jumps) until the click
 * comes back.
 */
function TempoTrainerScreen() {
  const { colors } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);

  const bpm = clampBpm(settings.bpm);
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, useStructure, structure, tempoNoteValue, onBars, offBars } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);

  const engineState = useSyncExternalStore(subscribeTempoTrainer, getTempoTrainerSnapshot);
  const { running, phase, currentBeat, currentSub } = engineState;
  useToolActivity('/tempo-trainer', running);
  useKeepAwakeWhile(running);

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

  // Nothing about time shows during a silent stretch — not the beat strip (would still reveal
  // where in the bar playback is, even without the click), not the section readout — the whole
  // point of this tool is finding out whether the tempo holds with no cue at all.
  const silentNow = running && phase === 'off';

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady) return <ScreenSpinner />;

  return (
    <ToolFrame
      title="Tempo Trainer"
      // The meter mode first: it decides what the display and the chips are.
      mode={
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
      }
      action={<BigButton label={running ? 'Stop' : 'Start'} secondary={running} disabled={!running && !canStart} onPress={running ? stopTempoTrainer : start} />}
      chips={
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
                activeFormIndex={running && !silentNow ? engineState.formIndex : null}
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
          <SettingChip Icon={EyeOffIcon} label="Mute cycle" value={`${onBars} on · ${offBars} off`}>
            <CountField
              title="Bars audible"
              hint="How many bars the click plays before it cuts out."
              value={onBars}
              min={1}
              max={MAX_CYCLE_BARS}
              unit={['bar', 'bars']}
              disabled={running}
              onChange={(next) => updateSettings({ onBars: next })}
            />
            <CountField
              title="Bars muted"
              hint="How many bars stay silent — with no beat shown either — before the click comes back. Keep the tempo going on your own until it does."
              value={offBars}
              min={1}
              max={MAX_CYCLE_BARS}
              unit={['bar', 'bars']}
              disabled={running}
              onChange={(next) => updateSettings({ offBars: next })}
            />
            {running ? (
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                Stop to change these.
              </Text>
            ) : null}
          </SettingChip>
          <SettingChip Icon={SpeakerIcon} label="Sound" value={soundSummary(soundId, volume)}>
            <SoundPicker
              soundId={soundId}
              setSoundId={(id) => updateSettings({ soundId: id })}
              volume={volume}
              setVolume={(next) => updateSettings({ volume: next })}
            />
          </SettingChip>
        </SettingsBar>
      }
    >
      <TempoHero
        bpm={bpm}
        setBpm={(next) => updateSettings({ bpm: clampBpm(next) })}
        beatsPerBar={activeSection?.beatsPerBar ?? beatsPerBar}
        beatUnit={activeSection?.beatUnit ?? beatUnit}
        onTap={tap}
        tempoNote={<TempoNoteValuePicker value={tempoNoteValue} onChange={(next) => updateSettings({ tempoNoteValue: next })} />}
      />
      <TempoNoteConversionHint bpm={bpm} tempoNoteValue={tempoNoteValue} effectiveBeatUnit={effectiveBeatUnit} />

      {/* The silent stretch hides the beats and plan but keeps their space (the card sits on
          top of them), so the page doesn't jump when the click drops out and comes back. */}
      <View className="w-full">
        <View
          className="w-full items-center gap-4"
          style={{ opacity: silentNow ? 0 : 1 }}
          pointerEvents={silentNow ? 'none' : 'auto'}
          accessibilityElementsHidden={silentNow}
          importantForAccessibility={silentNow ? 'no-hide-descendants' : 'auto'}
        >
          {useStructure && activeSection ? (
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
              Section <Text style={{ color: colors.foreground }}>{activeSection.name}</Text> · bar {engineState.barInSection + 1} of{' '}
              {activeSection.bars}
            </Text>
          ) : null}
          {useStructure && !activeSection ? (
            <StructureEmptyHint structure={structure} />
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
          <PlanText>
            Click plays {bars(onBars)}, then goes silent for {bars(offBars)}
          </PlanText>
        </View>
        {silentNow ? (
          <View className="absolute inset-0 items-center justify-center">
            <View className="w-full max-w-xs items-center gap-1.5 rounded-xl px-4 py-3" style={{ backgroundColor: colors.surface }}>
              <EyeOffIcon color={colors.muted} size={20} />
              {/* How long the silence lasts, but no live countdown: a number changing every bar
                  would show where the barlines fall, which is what you're meant to keep. */}
              <Text className="font-ui-semibold text-center text-sm font-semibold" style={{ color: colors.foreground }}>
                Silent for {bars(offBars)}
              </Text>
              <Text numberOfLines={1} className="font-ui text-center text-sm" style={{ color: colors.muted }}>
                Keep the tempo going until it comes back
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </ToolFrame>
  );
}

export default withScreenLoader(TempoTrainerScreen);
