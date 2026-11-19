import { DEFAULT_CLICK_SOUND_ID, type BeatLevel } from '@jam-practice/core/clickSounds';
import { NEXT_LEVEL, clampBpm, useTapTempo } from '@jam-practice/core/meterControls';
import {
  CONCRETE_ROLL_TYPES,
  ROLL_TYPES,
  TRIPLET_STICKING_OPTIONS,
  type ConcreteRollType,
  type RollType,
  type TripletSticking,
} from '@jam-practice/core/stickControl';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeatIndicator } from '@/components/BeatIndicator';
import { RepeatIcon, ShuffleIcon, SpeakerIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { NOTATION_ROW_GAP, StickNotation } from '@/components/StickNotation';
import { SwitchRow } from '@/components/SwitchRow';
import { BigButton, SoundPicker, TempoHero, soundSummary } from '@/components/tool/meter';
import { ChipRow, ChoiceCards, CountField, ListIcon, OptionLabel, PillButton, PoolPills } from '@/components/tool/rhythm';
import { SettingChip } from '@/components/tool/SettingChip';
import { Slider } from '@/components/tool/Slider';
import { MAX_ROW_BARS, ROW_HEIGHT_ESTIMATE, measureLayout, renderPatternRows } from '@/lib/notation/stickNotation';
import {
  type ClickMode,
  advanceStickControlPattern,
  ensureStickControlPattern,
  getStickControlSnapshot,
  regenerateStickControlPattern,
  startStickControl,
  stopStickControl,
  subscribeStickControl,
  updateStickControlOptions,
  updateStickControlSettings,
} from '@/lib/stickControlEngine';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';

// Same key and shape as web's `StickControl.tsx`, so settings follow the account across both.
const SETTINGS_KEY = 'jam-practice-stick-control';
const DEFAULT_SETTINGS = {
  bpm: 100,
  rollType: 'double' as RollType,
  enabledRollTypes: CONCRETE_ROLL_TYPES,
  enabledTripletStickings: TRIPLET_STICKING_OPTIONS.map((o) => o.value),
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  clickMode: 'pulse' as ClickMode,
  countOffBars: 1,
  repeats: 20,
  autoAdvance: true,
  accents: [2, 1, 1, 1] as BeatLevel[],
};

const CLICK_MODE_OPTIONS: { value: ClickMode; label: string }[] = [
  { value: 'pulse', label: 'Steady pulse' },
  { value: 'everyNote', label: 'Every stroke' },
  { value: 'byHand', label: 'Pitch per hand' },
];

const ROLL_TYPE_PICKER_OPTIONS = ROLL_TYPES.filter(
  (o): o is { value: ConcreteRollType; label: string } => o.value !== 'random',
);

const MIN_REPEATS = 1;
const MAX_REPEATS = 100;

/** Card padding (p-2) and the "Next" label + gap — the non-scaling parts of the notation area. */
const CARD_PAD = 8;
const NEXT_LABEL = 30;
const CARD_GAP = 10;

/** `#rrggbb` mixed `amount` of the way toward black — web's `color-mix(foreground 80%, black)`. */
function towardBlack(hex: string, amount: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) =>
    Math.round(((n >> shift) & 255) * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/**
 * Random Sticking Warmup, laid out like the website's phone layout (`apps/web/components/
 * StickControl.tsx`): the pattern and the next one first, then New pattern / Start, then the tempo
 * and beat strip, then the Pattern, Playback and Sound chips. The notation is engraved by the same
 * VexFlow code as the website (see `components/StickNotation.tsx`) and fitted to whatever height is
 * left, so the screen never scrolls; while it plays, the tempo shrinks to one row so the staves
 * get more room.
 */
function RandomStickingWarmupScreen() {
  const { colors } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);

  const bpm = clampBpm(settings.bpm);
  const {
    rollType,
    enabledRollTypes,
    enabledTripletStickings,
    volume,
    soundId,
    clickMode,
    countOffBars,
    repeats,
    autoAdvance,
    accents,
  } = settings;

  const snapshot = useSyncExternalStore(subscribeStickControl, getStickControlSnapshot);
  const { running, pattern, nextPattern, phase, currentBarIndex, currentRepeat, currentBeat } = snapshot;

  useEffect(() => {
    if (!settingsReady) return;
    const changed = updateStickControlOptions({ rollType, enabledRollTypes, enabledTripletStickings });
    if (changed) regenerateStickControlPattern();
    else ensureStickControlPattern();
  }, [settingsReady, rollType, enabledRollTypes, enabledTripletStickings]);

  useEffect(() => {
    updateStickControlSettings({ bpm, volume, soundId, clickMode, countOffBars, repeats, autoAdvance, accents });
  }, [bpm, volume, soundId, clickMode, countOffBars, repeats, autoAdvance, accents]);

  const tap = useTapTempo((next) => updateSettings({ bpm: clampBpm(next) }));

  function cycleBeat(index: number) {
    updateSettings({ accents: accents.map((level, i) => (i === index ? NEXT_LEVEL[level] : level)) });
  }

  function toggleRollType(id: ConcreteRollType) {
    updateSettings({
      enabledRollTypes: enabledRollTypes.includes(id)
        ? enabledRollTypes.filter((x) => x !== id)
        : [...enabledRollTypes, id],
    });
  }

  function toggleTripletSticking(id: TripletSticking) {
    updateSettings({
      enabledTripletStickings: enabledTripletStickings.includes(id)
        ? enabledTripletStickings.filter((x) => x !== id)
        : [...enabledTripletStickings, id],
    });
  }

  // Both staves fill the card width; only if that would be too tall for the area are they shrunk
  // (uniformly) until both fit. Bars-per-row is picked first from an estimate, so only the chosen
  // layout is ever drawn.
  const layout = useMemo(() => {
    if (!area || !pattern) return null;
    const innerWidth = area.width - CARD_PAD * 2;
    const staves = nextPattern ? 2 : 1;
    const fixed = CARD_PAD * 2 * staves + (nextPattern ? NEXT_LABEL + CARD_GAP : 0);
    const maxBars = Math.max(pattern.bars.length, nextPattern?.bars.length ?? 0);

    let perRow = 1;
    let bestSize = -1;
    for (let candidate = 1; candidate <= Math.min(MAX_ROW_BARS, maxBars); candidate++) {
      const a = measureLayout(pattern, candidate);
      const b = nextPattern ? measureLayout(nextPattern, candidate) : null;
      const sa = innerWidth / a.maxRowWidth;
      const sb = b ? innerWidth / b.maxRowWidth : sa;
      const gaps = (a.rows - 1 + (b ? b.rows - 1 : 0)) * NOTATION_ROW_GAP;
      const estHeight = (a.rows * sa + (b ? b.rows * sb : 0)) * ROW_HEIGHT_ESTIMATE;
      const fit = Math.min(1, (area.height - fixed - gaps) / estHeight);
      const size = Math.min(sa, sb) * fit;
      if (size > bestSize + 1e-6) {
        bestSize = size;
        perRow = candidate;
      }
    }

    const current = renderPatternRows(pattern, perRow);
    const next = nextPattern ? renderPatternRows(nextPattern, perRow) : null;
    const all = next ? [...current, ...next] : current;
    const gaps = (current.length - 1 + (next ? next.length - 1 : 0)) * NOTATION_ROW_GAP;
    const rowsHeight = all.reduce((sum, row) => sum + (row.height * innerWidth) / row.width, 0);
    const room = area.height - fixed - gaps;
    const width = rowsHeight <= room ? innerWidth : (innerWidth * room) / rowsHeight;
    return { current, next, width };
  }, [area, pattern, nextPattern]);

  function onArea(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setArea((prev) =>
      prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height },
    );
  }

  if (!settingsReady) return <ScreenSpinner />;

  const ink = towardBlack(colors.foreground, 0.2);
  const muted = { color: colors.muted };

  const phaseLabel =
    phase === 'countoff'
      ? 'Count-off…'
      : phase === 'playing' && repeats > 1
        ? `Repeat ${currentRepeat} of ${repeats}`
        : phase === 'playing'
          ? 'Playing'
          : null;

  const showTripletPicker =
    rollType === 'triplet' ||
    (rollType === 'random' && (enabledRollTypes.length === 0 || enabledRollTypes.includes('triplet')));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Random Sticking Warmup' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <View className="flex-1 gap-3 px-4 pb-4 pt-3">
          {/* The pattern and the next one, as big as the space left over allows. */}
          <View className="flex-1" onLayout={onArea}>
            {pattern && layout ? (
              <View style={{ gap: CARD_GAP, flex: 1, justifyContent: 'center' }}>
                <View className="rounded-xl" style={{ padding: CARD_PAD, backgroundColor: colors.surface }}>
                  <StickNotation rows={layout.current} width={layout.width} activeBarIndex={currentBarIndex} ink={ink} accent={colors.accent} />
                </View>
                {layout.next ? (
                  <>
                    <Text
                      className="font-ui-semibold text-center text-xs font-semibold"
                      style={[muted, { height: NEXT_LABEL - CARD_GAP, lineHeight: NEXT_LABEL - CARD_GAP }]}
                    >
                      Next
                    </Text>
                    <View className="rounded-xl" style={{ padding: CARD_PAD, backgroundColor: colors.surface, opacity: 0.75 }}>
                      <StickNotation rows={layout.next} width={layout.width} activeBarIndex={null} ink={ink} accent={colors.accent} />
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* The phase ("Repeat 1 of 20") just above the buttons, holding its line so Start
              doesn't move anything. */}
          <Text className="font-ui-semibold text-center text-sm font-semibold" style={{ color: colors.accent, height: 20, lineHeight: 20 }}>
            {phaseLabel ?? ''}
          </Text>

          {/* Start centred like every tool's; New pattern a smaller button beside it. */}
          <View className="flex-row items-center">
            <View className="flex-1 items-end pr-3">
              <PillButton label="New" Icon={ShuffleIcon} onPress={advanceStickControlPattern} />
            </View>
            <BigButton label={running ? 'Stop' : 'Start'} secondary={running} onPress={running ? stopStickControl : startStickControl} />
            <View className="flex-1" />
          </View>

          {running ? (
            // While playing, the tempo and beats shrink to one row so the staves get the room.
            <View className="flex-row items-center justify-center gap-4">
              <View className="flex-row items-baseline gap-1">
                <Text className="font-ui-bold text-3xl font-bold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
                  {bpm}
                </Text>
                <Text className="font-ui text-sm" style={muted}>
                  BPM
                </Text>
              </View>
              <BeatIndicator accents={accents} currentBeat={currentBeat} onCycle={cycleBeat} size="sm" />
            </View>
          ) : (
            <View className="items-center gap-3">
              <TempoHero bpm={bpm} setBpm={(next) => updateSettings({ bpm: clampBpm(next) })} beatsPerBar={4} beatUnit={4} onTap={tap} />
              <BeatIndicator accents={accents} currentBeat={null} onCycle={cycleBeat} size="sm" />
            </View>
          )}

          {/* One sideways row, so the notation keeps the height. */}
          <ChipRow>
            <SettingChip Icon={ListIcon} label="Pattern" value={ROLL_TYPES.find((r) => r.value === rollType)?.label ?? ''}>
              <View className="gap-2.5">
                <OptionLabel
                  title="Roll type"
                  hint={
                    '"Single stroke roll" is the same length/speed as the double-stroke roll, just plain alternating R/L instead of the RRLLRRLLR rudiment. "Triplets" writes the roll as 8th-note triplets instead, with a random sticking each time — straight alternation, or a broken-double shape (RRL or LLR). "Random" picks a fresh roll type for every pattern.'
                  }
                />
                <ChoiceCards label="Roll type" options={ROLL_TYPES} value={rollType} onChange={(v) => updateSettings({ rollType: v })} />
              </View>

              {rollType === 'random' ? (
                <View className="gap-2.5">
                  <OptionLabel title="Roll types" hint='Which roll types "Random" can pick from. Falls back to all three if none are selected.' />
                  <PoolPills label="Roll types" options={ROLL_TYPE_PICKER_OPTIONS} selected={enabledRollTypes} onToggle={toggleRollType} />
                </View>
              ) : null}

              {showTripletPicker ? (
                <View className="gap-2.5">
                  <OptionLabel
                    title="Triplet stickings"
                    hint='Which of the two triplet stickings can be randomly picked. "Broken double" always plays whichever of RRL/LLR fits the hand it needs to start on. Falls back to both if neither is selected.'
                  />
                  <PoolPills
                    label="Triplet stickings"
                    options={TRIPLET_STICKING_OPTIONS}
                    selected={enabledTripletStickings}
                    onToggle={toggleTripletSticking}
                  />
                </View>
              ) : null}
            </SettingChip>

            <SettingChip Icon={RepeatIcon} label="Playback" value={`${repeats}×`}>
              <CountField
                title="Count-off bars"
                hint="Plain metronome bars played before the pattern starts, so you come in on time."
                value={countOffBars}
                min={0}
                max={4}
                unit={['bar', 'bars']}
                onChange={(n) => updateSettings({ countOffBars: n })}
              />
              <View className="gap-1">
                <OptionLabel
                  title="Repeat count"
                  hint="How many times the pattern repeats before stopping (or moving to a new one, with “New pattern when done”)."
                  aside={
                    <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                      {repeats}×
                    </Text>
                  }
                />
                <Slider
                  label="Repeat count"
                  value={(repeats - MIN_REPEATS) / (MAX_REPEATS - MIN_REPEATS)}
                  onChange={(v) => updateSettings({ repeats: Math.round(MIN_REPEATS + v * (MAX_REPEATS - MIN_REPEATS)) })}
                />
              </View>
              <SwitchRow
                label="New pattern when done"
                checked={autoAdvance}
                onChange={(v) => updateSettings({ autoAdvance: v })}
                hint="After the repeat count finishes, move straight on to the next pattern and keep going instead of stopping."
              />
              <View className="gap-2.5">
                <OptionLabel
                  title="Click"
                  hint={
                    '"Steady pulse" clicks once per beat. "Every stroke" clicks every note of the pattern. "Pitch per hand" clicks a different pitch for every R vs. L stroke, so you can hear the sticking without watching the notation.'
                  }
                />
                <ChoiceCards label="Click" options={CLICK_MODE_OPTIONS} value={clickMode} onChange={(v) => updateSettings({ clickMode: v })} />
              </View>
            </SettingChip>

            <SettingChip Icon={SpeakerIcon} label="Sound" value={soundSummary(soundId, volume)}>
              <SoundPicker
                soundId={soundId}
                setSoundId={(id) => updateSettings({ soundId: id })}
                volume={volume}
                setVolume={(next) => updateSettings({ volume: next })}
              />
            </SettingChip>
          </ChipRow>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default withScreenLoader(RandomStickingWarmupScreen);
