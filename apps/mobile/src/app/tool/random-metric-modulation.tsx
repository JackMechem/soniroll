import { CLICK_SOUNDS, DEFAULT_CLICK_SOUND_ID, type BeatLevel } from '@jam-practice/core/clickSounds';
import {
  COMMON_METERS,
  NEXT_LEVEL,
  accentsFromGroups,
  clampBpm,
  defaultAccents,
  defaultSubAccents,
  nearestNoteValue,
  useTapTempo,
} from '@jam-practice/core/meterControls';
import { MAX_BEATS } from '@jam-practice/core/meters';
import { MODULATIONS } from '@jam-practice/core/metricModulation';
import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BeatIndicator } from '@/components/BeatIndicator';
import { HistoryIcon, MeterIcon, MetronomeIcon, ShuffleIcon, SpeakerIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SwitchRow } from '@/components/SwitchRow';
import {
  BigButton,
  MeterQuickPicks,
  SoundPicker,
  SubdivisionPicker,
  TempoHero,
  TimeSignatureControl,
  soundSummary,
} from '@/components/tool/meter';
import { OptionGroup } from '@/components/tool/reward';
import { AccentGroupingField, ClickSoundCards, CountField, OptionLabel, PlanText, PoolPills } from '@/components/tool/rhythm';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { ToolFrame } from '@/components/tool/ToolFrame';
import {
  clearMetricModLog,
  getMetricModSnapshot,
  startMetricMod,
  stopMetricMod,
  subscribeMetricMod,
  updateMetricModLiveSettings,
} from '@/lib/metricModulationEngine';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useToolActivity } from '@/lib/toolTime';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';

const MIN_BARS_PER_MODULATION = 1;
const MAX_BARS_PER_MODULATION = 32;

/** The "3:2 polyrhythm" part of a "3:2 polyrhythm — quarter = dotted quarter" label. */
function ratioPart(label: string) {
  return label.split(' — ')[0];
}

/** Just "3:2", for compact spots (toggle chips, log rows). */
function shortRatio(label: string) {
  return label.split(' ')[0];
}

const RATIO_OPTIONS = MODULATIONS.map((m) => ({ value: m.id, label: shortRatio(m.label) }));

// Same key and shape as web's `RandomMetricModulation.tsx`, so settings follow the account across both.
const SETTINGS_KEY = 'jam-practice-metric-modulation';
const DEFAULT_SETTINGS = {
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1] as BeatLevel[],
  subdivision: 1,
  subAccents: [] as BeatLevel[],
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  minBarsPerModulation: 4,
  matchToRealignment: false,
  enabledRatios: MODULATIONS.map((m) => m.id),
  avoidRepeat: true,
  returnToOriginal: false,
  playOriginalTempo: false,
  referenceMuted: false,
  referenceSoundId: 'wood',
};

/**
 * Polyrhythm Metric Modulation Metronome, laid out like the website's
 * (`apps/web/components/RandomMetricModulation.tsx`), on `ToolFrame`: a History chip above; the
 * tempo (locked to the live, modulated tempo while it runs, with the next change and the previous
 * tempo's click under it), the beat strip and a line saying what Start does (then where you are,
 * or the last change); then the footer — Start, and the Meter, Modulation, Previous tempo click
 * and Sound chips. The credit (Rob Moreno) is in the intro (`introNotes.ts`).
 */
function RandomMetricModulationScreen() {
  const { colors } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);

  const bpm = clampBpm(settings.bpm);
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const {
    subdivision,
    volume,
    soundId,
    avoidRepeat,
    returnToOriginal,
    playOriginalTempo,
    referenceMuted,
    referenceSoundId,
    matchToRealignment,
  } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);
  const minBarsPerModulation = Math.min(
    MAX_BARS_PER_MODULATION,
    Math.max(MIN_BARS_PER_MODULATION, Math.round(settings.minBarsPerModulation)),
  );
  const enabledRatios = settings.enabledRatios.filter((id) => MODULATIONS.some((m) => m.id === id));

  const engineState = useSyncExternalStore(subscribeMetricMod, getMetricModSnapshot);
  const { running, currentBeat, currentSub, referenceBeat, log, lastModulation, nextPreview, playingReference } = engineState;
  useToolActivity('/random-metric-modulation', running);
  useKeepAwakeWhile(running);

  useEffect(() => {
    updateMetricModLiveSettings({
      beatsPerBar,
      accents,
      subdivision,
      subAccents,
      volume,
      soundId,
      referenceMuted,
      referenceSoundId,
    });
  }, [beatsPerBar, accents, subdivision, subAccents, volume, soundId, referenceMuted, referenceSoundId]);

  function start() {
    startMetricMod({
      bpm,
      returnToOriginal,
      enabledRatios,
      avoidRepeat,
      matchToRealignment,
      minBarsPerModulation,
      playOriginalTempo,
    });
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

  // Turning the previous-tempo click on also locks "Play until tempos realign" on — that's what
  // keeps the two clicks landing on a shared downbeat (same rule as web).
  function setPlayOriginalTempo(value: boolean) {
    updateSettings(value ? { playOriginalTempo: value, matchToRealignment: true } : { playOriginalTempo: value });
  }

  function toggleRatio(id: string) {
    updateSettings({
      enabledRatios: enabledRatios.includes(id)
        ? enabledRatios.filter((r) => r !== id)
        : [...enabledRatios, id],
    });
  }

  if (!settingsReady) return <ScreenSpinner />;

  const muted = { color: colors.muted };
  const fg = { color: colors.foreground };

  // What Start will do, under the beats ("Tempo changes every 4 bars · 3:2, 2:3, 4:3 and 7 more").
  const pool = enabledRatios.length ? MODULATIONS.filter((m) => enabledRatios.includes(m.id)) : MODULATIONS;
  const plan = `${
    matchToRealignment
      ? 'Tempo changes once the tempos realign'
      : `Tempo changes every ${minBarsPerModulation === 1 ? 'bar' : `${minBarsPerModulation} bars`}`
  } · ${pool
    .slice(0, pool.length > 4 ? 3 : 4)
    .map((m) => shortRatio(m.label))
    .join(', ')}${pool.length > 4 ? ` and ${pool.length - 3} more` : ''}${returnToOriginal ? ' · back to your tempo in between' : ''}`;

  const modulationSummary = `${
    // Short, for the chip: "4 bars" (the label says Modulation; the sheet spells it out).
    matchToRealignment ? 'When tempos realign' : `${minBarsPerModulation} bar${minBarsPerModulation === 1 ? '' : 's'}`
  } · ${
    enabledRatios.length === 0 || enabledRatios.length === MODULATIONS.length
      ? 'all ratios'
      : enabledRatios.length === 1
        ? shortRatio(MODULATIONS.find((m) => m.id === enabledRatios[0])?.label ?? '')
        : `${enabledRatios.length} ratios`
  }`;

  const referenceSummary = playOriginalTempo
    ? referenceMuted
      ? 'On · muted'
      : `On · ${CLICK_SOUNDS.find((c) => c.id === referenceSoundId)?.label ?? 'click'}`
    : 'Off';

  return (
    <ToolFrame
      title="Polyrhythm Metric Modulation Metronome"
      side={
        // History sits above the display, like the website's side-panel chips.
        <SettingsBar>
          <SettingChip
            Icon={HistoryIcon}
            label="History"
            value={log.length > 0 ? `${log.length} tempo change${log.length === 1 ? '' : 's'}` : 'None yet'}
          >
            {log.length === 0 ? (
              <Text className="font-ui text-sm" style={muted}>
                Each tempo change shows up here while it plays.
              </Text>
            ) : (
              <>
                <View className="gap-1">
                  {[...log].reverse().map((entry) => (
                    <View key={entry.id} className="flex-row items-center justify-between rounded-lg px-3 py-2.5" style={{ backgroundColor: colors.background }}>
                      <Text className="font-ui-semibold text-sm font-semibold" style={muted}>
                        {shortRatio(entry.label)}
                      </Text>
                      <Text className="font-ui-semibold text-sm font-semibold" style={[fg, { fontVariant: ['tabular-nums'] }]}>
                        {Math.round(entry.from)} → {Math.round(entry.to)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Pressable onPress={clearMetricModLog} hitSlop={8} accessibilityRole="button" className="self-start">
                  <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.danger }}>
                    Clear log
                  </Text>
                </Pressable>
              </>
            )}
          </SettingChip>
        </SettingsBar>
      }
      action={<BigButton label={running ? 'Stop' : 'Start'} secondary={running} onPress={running ? stopMetricMod : start} />}
      chips={
        <SettingsBar>
          <SettingChip Icon={MeterIcon} label="Meter" title="Meter & subdivision" value={`${beatsPerBar}/${beatUnit}`}>
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
            <AccentGroupingField
              accents={accents}
              onApply={(groups) =>
                updateSettings({
                  beatsPerBar: groups.reduce((a, b) => a + b, 0),
                  accents: accentsFromGroups(groups),
                })
              }
            />
            <OptionGroup title="Subdivision">
              <SubdivisionPicker value={subdivision} onChange={(next) => updateSettings({ subdivision: next })} />
            </OptionGroup>
          </SettingChip>

          <SettingChip Icon={ShuffleIcon} label="Modulation" value={modulationSummary}>
            {running ? (
              <Text className="font-ui text-xs" style={muted}>
                Stop to change these — they&apos;re fixed for the run.
              </Text>
            ) : null}
            <CountField
              title={matchToRealignment ? 'Minimum bars between modulations' : 'Bars between modulations'}
              hint={
                matchToRealignment
                  ? 'The interval is stretched to at least this many bars if realigning takes longer.'
                  : 'How many bars play at a tempo before it jumps to the next.'
              }
              value={minBarsPerModulation}
              min={MIN_BARS_PER_MODULATION}
              max={MAX_BARS_PER_MODULATION}
              unit={['bar', 'bars']}
              disabled={running}
              onChange={(next) => updateSettings({ minBarsPerModulation: next })}
            />
            <View className="gap-1">
              <SwitchRow
                label="Play until tempos realign"
                checked={matchToRealignment}
                onChange={(value) => updateSettings({ matchToRealignment: value })}
                disabled={running || playOriginalTempo}
                hint={
                  playOriginalTempo
                    ? 'Extends each interval to however many bars it takes the new tempo to land back on a downbeat with the reference tempo. Locked on while the previous tempo click is on, so the two stay in sync.'
                    : 'Extends each interval to however many bars it takes the new tempo to land back on a downbeat with the reference tempo.'
                }
              />
              {playOriginalTempo ? (
                <Text className="font-ui text-xs" style={muted}>
                  On while Previous tempo click is on.
                </Text>
              ) : null}
            </View>
            <SwitchRow
              label="Return to original tempo"
              checked={returnToOriginal}
              onChange={(value) => updateSettings({ returnToOriginal: value })}
              disabled={running}
              hint="Alternates modulating away from and back to the tempo you started at, instead of drifting freely to a new one each time."
            />
            <SwitchRow
              label="Avoid repeating the same polyrhythm"
              checked={avoidRepeat}
              onChange={(value) => updateSettings({ avoidRepeat: value })}
              disabled={running}
              hint="Won't pick the same ratio twice in a row."
            />
            <View className="gap-2.5">
              <OptionLabel
                title="Polyrhythms in the mix"
                hint={`Which ratios can be picked for a modulation.\n\n${MODULATIONS.map((m) => m.label).join('\n')}`}
              />
              <PoolPills label="Polyrhythms in the mix" options={RATIO_OPTIONS} selected={enabledRatios} onToggle={toggleRatio} disabled={running} />
              {enabledRatios.length === 0 ? (
                <Text className="font-ui text-xs" style={muted}>
                  None selected — picking from all of them instead.
                </Text>
              ) : null}
            </View>
          </SettingChip>

          <SettingChip Icon={MetronomeIcon} label="Previous tempo" title="Previous tempo click" value={referenceSummary}>
            <SwitchRow
              label="Play the previous tempo too"
              checked={playOriginalTempo}
              onChange={setPlayOriginalTempo}
              disabled={running}
              hint="After a tempo change, a second click keeps playing the tempo you came from (or the original tempo, with Return to original tempo on), so you can hear the two against each other. Turns on Play until tempos realign, so they stay in sync."
            />
            <View className="gap-2.5">
              <OptionLabel title="Click" hint="A different click sound than the main one, so the two are easy to tell apart." />
              <ClickSoundCards
                label="Previous tempo click sound"
                soundId={referenceSoundId}
                onChange={(id) => updateSettings({ referenceSoundId: id })}
                volume={volume}
              />
            </View>
            <SwitchRow
              label="Mute"
              checked={referenceMuted}
              onChange={(value) => updateSettings({ referenceMuted: value })}
              disabled={!playOriginalTempo}
              hint="Keeps this second click running silently, still shown and counted, just not heard."
            />
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
      <View className="w-full items-center gap-4">
        <TempoHero
          bpm={bpm}
          setBpm={(next) => updateSettings({ bpm: clampBpm(next) })}
          beatsPerBar={beatsPerBar}
          beatUnit={beatUnit}
          onTap={tap}
          locked={running}
          precise={running ? engineState.bpm : undefined}
        />

        {running ? (
          <View className="w-full flex-row flex-wrap items-center justify-center gap-3">
            {nextPreview ? (
              <View className="flex-row items-baseline gap-3 rounded-xl px-5 py-2" style={{ backgroundColor: colors.surface }}>
                <Text className="font-ui text-xs" style={muted}>
                  Next
                </Text>
                <Text className="font-ui-semibold text-2xl font-semibold" style={{ color: colors.accent, fontVariant: ['tabular-nums'] }}>
                  {shortRatio(nextPreview.label)}
                </Text>
                <Text className="font-ui-semibold text-sm font-semibold" style={[fg, { fontVariant: ['tabular-nums'] }]}>
                  {Math.round(nextPreview.toBpm)} BPM
                </Text>
              </View>
            ) : null}
            {/* The previous (or original) tempo's click. Its slot is kept for the whole run
                (hidden until it plays), so nothing moves when it comes and goes. */}
            {playOriginalTempo ? (
              <View
                className="flex-row items-center gap-3 rounded-xl px-4 py-2"
                style={{ backgroundColor: colors.surface, opacity: playingReference ? 1 : 0 }}
                accessibilityElementsHidden={!playingReference}
                importantForAccessibility={playingReference ? 'auto' : 'no-hide-descendants'}
              >
                <View className="items-center">
                  <Text className="font-ui-semibold text-2xl font-semibold" style={[muted, { fontVariant: ['tabular-nums'] }]}>
                    {Math.round(engineState.referenceBpm)}
                  </Text>
                  <Text className="font-ui text-xs" style={muted}>
                    {engineState.returnToOriginal ? 'Original' : 'Previous'}
                    {referenceMuted ? ' · muted' : ''}
                  </Text>
                </View>
                <BeatIndicator accents={accents} currentBeat={playingReference ? referenceBeat : null} size="sm" />
              </View>
            ) : null}
          </View>
        ) : null}

        <BeatIndicator
          accents={accents}
          currentBeat={running ? currentBeat : null}
          onCycle={cycleBeat}
          subdivision={subdivision}
          subAccents={subAccents}
          currentSub={currentSub}
          onCycleSub={cycleSub}
          cycleHint
        />

        {/* Always two lines: the plan, then where you are (running) or the last tempo change
            (stopped), so nothing moves when either appears. */}
        <View className="items-center gap-0.5">
          <PlanText>{plan}</PlanText>
          {running ? (
            <PlanText>
              Bar {engineState.barsIntoInterval + 1} of {engineState.effectiveBars}
            </PlanText>
          ) : lastModulation ? (
            <Text className="font-ui-semibold text-center text-sm font-semibold" style={fg}>
              Modulated {ratioPart(lastModulation.label)}: {Math.round(lastModulation.from)} → {Math.round(lastModulation.to)} BPM
            </Text>
          ) : (
            <PlanText> </PlanText>
          )}
        </View>
      </View>
    </ToolFrame>
  );
}

export default withScreenLoader(RandomMetricModulationScreen);
