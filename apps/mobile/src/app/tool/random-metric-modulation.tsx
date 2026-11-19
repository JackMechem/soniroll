import { CLICK_SOUNDS, DEFAULT_CLICK_SOUND_ID, type BeatLevel } from '@jam-practice/core/clickSounds';
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
import { MODULATIONS } from '@jam-practice/core/metricModulation';
import { Stack } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeatIndicator } from '@/components/BeatIndicator';
import { SlidersIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import {
  AccentAndSubdivisionControls,
  Pill,
  SoundOptions,
  TempoControls,
  TimeSignatureControls,
} from '@/components/MetronomeControls';
import { NumberStepper } from '@/components/NumberStepper';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SwitchRow } from '@/components/SwitchRow';
import { ToolOptionsSheet } from '@/components/ToolOptionsSheet';
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

/** A modulated tempo is usually fractional (100 × 4/3) — show one decimal only when there is one. */
function formatBpm(bpm: number) {
  const tenths = Math.round(bpm * 10) / 10;
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
}

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
 * Native port of `apps/web/components/RandomMetricModulation.tsx`, in the app's usual tool shape:
 * the main screen holds tempo, time signature, the beat strip and Start/Stop while idle; once
 * running, the tempo controls (locked for the run, same as web) give way to the live tempo, the
 * bar count, the upcoming modulation and — if on — the previous-tempo click's own strip. Every
 * other setting, plus the modulation log, lives in the options sheet.
 */
function RandomMetricModulationScreen() {
  const { colors } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [optionsOpen, setOptionsOpen] = useState(false);

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
  const { running, currentBeat, currentSub, referenceBeat, log, lastModulation, nextPreview } = engineState;

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

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Polyrhythm Metric Modulation Metronome' }} />
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
              <Text className="text-sm font-bold font-ui-bold" style={fg}>
                Options
              </Text>
            </Pressable>
          </View>

          <View
            className="flex-1 items-center justify-center gap-7"
          >
            {running && engineState.playingReference ? (
              <View className="items-center gap-2" style={{ opacity: 0.8 }}>
                <View className="items-center">
                  <Text className="text-3xl font-extrabold font-ui-extrabold" style={fg}>
                    {formatBpm(engineState.referenceBpm)}
                  </Text>
                  <Text className="text-xs font-semibold font-ui-semibold" style={muted}>
                    {engineState.returnToOriginal ? 'Original' : 'Previous'} · {beatsPerBar}/{beatUnit}
                    {referenceMuted ? ' · muted' : ''}
                  </Text>
                </View>
                <BeatIndicator accents={accents} currentBeat={referenceBeat} size="sm" />
              </View>
            ) : null}

            {running ? (
              <View className="items-center">
                <Text className="text-6xl font-extrabold font-ui-extrabold" style={fg}>
                  {formatBpm(engineState.bpm)}
                </Text>
                <Text className="text-xs font-bold font-ui-bold" style={muted}>
                  BPM · {beatsPerBar}/{beatUnit}
                </Text>
              </View>
            ) : (
              <View className="items-center gap-4">
                <TempoControls bpm={bpm} setBpm={(next) => updateSettings({ bpm: next })} onTap={tap} />
                <TimeSignatureControls
                  beatsPerBar={beatsPerBar}
                  beatUnit={beatUnit}
                  onChangeBeats={changeBeats}
                  onSetBeatUnit={(unit) => updateSettings({ beatUnit: unit })}
                />
              </View>
            )}

            <View className="items-center gap-3">
              <BeatIndicator
                accents={accents}
                currentBeat={running ? currentBeat : null}
                onCycle={cycleBeat}
                subdivision={subdivision}
                subAccents={subAccents}
                currentSub={currentSub}
                onCycleSub={cycleSub}
              />
              {running ? (
                <Text className="text-sm font-semibold font-ui-semibold" style={muted}>
                  Bar {engineState.barsIntoInterval + 1} of {engineState.effectiveBars}
                </Text>
              ) : null}
            </View>

            {running && nextPreview ? (
              <View className="items-center gap-0.5 rounded-3xl px-7 py-3" style={{ backgroundColor: colors.surface }}>
                <Text className="text-xs font-semibold font-ui-semibold" style={muted}>
                  Next modulation
                </Text>
                <Text className="text-3xl font-extrabold font-ui-extrabold" style={{ color: colors.accent }}>
                  {shortRatio(nextPreview.label)}
                </Text>
                <Text className="text-sm font-semibold font-ui-semibold" style={fg}>
                  {Math.round(nextPreview.toBpm)} BPM
                </Text>
              </View>
            ) : null}

            {lastModulation ? (
              <Text className="text-center text-sm font-semibold font-ui-semibold" style={fg}>
                Modulated {ratioPart(lastModulation.label)}: {Math.round(lastModulation.from)} →{' '}
                {Math.round(lastModulation.to)} BPM
              </Text>
            ) : null}

            <Pressable
              onPress={running ? stopMetricMod : start}
              className="min-w-[220px] items-center rounded-full py-4"
              style={{ backgroundColor: running ? colors.surface : colors.accent }}
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
        title="Options"
        tabs={[
          {
            key: 'modulation',
            label: 'Modulation',
            content: () => (
              <>
                {running ? (
                  <Text className="text-xs font-semibold font-ui-semibold" style={muted}>
                    Stop to change these — they&apos;re fixed for the run.
                  </Text>
                ) : null}
                <NumberStepper
                  label={matchToRealignment ? 'Minimum bars between modulations' : 'Bars between modulations'}
                  value={minBarsPerModulation}
                  unit=""
                  min={MIN_BARS_PER_MODULATION}
                  max={MAX_BARS_PER_MODULATION}
                  step={1}
                  disabled={running}
                  onChange={(next) => updateSettings({ minBarsPerModulation: Math.round(next) })}
                  hint={
                    matchToRealignment
                      ? 'The interval is stretched to at least this many bars if realigning takes longer.'
                      : 'How many bars play at a tempo before it jumps to the next.'
                  }
                />
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
                <View className="gap-2">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-sm font-semibold font-ui-semibold" style={muted}>
                      Polyrhythms in the mix
                    </Text>
                    <InfoButton
                      title="Polyrhythms in the mix"
                      text={`Which ratios can be picked for a modulation.\n\n${MODULATIONS.map((m) => m.label).join('\n')}`}
                      size={16}
                    />
                  </View>
                  <View className="flex-row flex-wrap gap-2" style={{ opacity: running ? 0.5 : 1 }}>
                    {MODULATIONS.map((m) => (
                      <Pill
                        key={m.id}
                        label={shortRatio(m.label)}
                        selected={enabledRatios.includes(m.id)}
                        onPress={() => {
                          if (!running) toggleRatio(m.id);
                        }}
                      />
                    ))}
                  </View>
                  {enabledRatios.length === 0 ? (
                    <Text className="text-xs font-ui" style={muted}>
                      None selected — picking from all of them instead.
                    </Text>
                  ) : null}
                </View>
                <Text className="text-xs font-ui" style={muted}>
                  Idea by Rob Moreno
                </Text>
              </>
            ),
          },
          {
            key: 'meter',
            label: 'Meter',
            content: () => (
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
            ),
          },
          {
            key: 'reference',
            label: 'Previous tempo',
            content: () => (
              <>
                <SwitchRow
                  label="Play previous tempo click"
                  checked={playOriginalTempo}
                  onChange={setPlayOriginalTempo}
                  disabled={running}
                  hint="A second click that keeps playing the tempo the main click just left (or the original tempo, with “Return to original tempo” on), so you can hear the new tempo against it."
                />
                <View className="gap-1.5" style={{ opacity: playOriginalTempo ? 1 : 0.5 }}>
                  <Text className="text-xs font-semibold font-ui-semibold" style={muted}>
                    Tone
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {CLICK_SOUNDS.map((sound) => (
                      <Pill
                        key={sound.id}
                        label={sound.label}
                        selected={referenceSoundId === sound.id}
                        onPress={() => {
                          if (playOriginalTempo) updateSettings({ referenceSoundId: sound.id });
                        }}
                      />
                    ))}
                  </View>
                </View>
                <SwitchRow
                  label="Mute"
                  checked={referenceMuted}
                  onChange={(value) => updateSettings({ referenceMuted: value })}
                  disabled={!playOriginalTempo}
                  hint="Keeps this second click running silently, still shown and counted, just not heard."
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
          {
            key: 'log',
            label: 'Log',
            content: () =>
              log.length === 0 ? (
                <Text className="text-sm font-ui" style={muted}>
                  Modulations from the current run show up here.
                </Text>
              ) : (
                <>
                  <View className="rounded-3xl px-4" style={{ backgroundColor: colors.surface }}>
                    {[...log].reverse().map((entry, i) => (
                      <View
                        key={entry.id}
                        className="flex-row items-center justify-between py-3"
                        style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors['surface-hover'] } : null}
                      >
                        <Text className="text-sm font-semibold font-ui-semibold" style={muted}>
                          {shortRatio(entry.label)}
                        </Text>
                        <Text className="text-sm font-bold font-ui-bold" style={fg}>
                          {Math.round(entry.from)} → {Math.round(entry.to)}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Pressable onPress={clearMetricModLog} hitSlop={8} className="self-start">
                    <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.danger }}>
                      Clear log
                    </Text>
                  </Pressable>
                </>
              ),
          },
        ]}
      />
    </View>
  );
}

export default withScreenLoader(RandomMetricModulationScreen);
