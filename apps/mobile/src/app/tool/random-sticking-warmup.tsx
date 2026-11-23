import { DEFAULT_CLICK_SOUND_ID, type BeatLevel } from '@jam-practice/core/clickSounds';
import { MAX_BPM, MIN_BPM, NEXT_LEVEL, clampBpm, useTapTempo } from '@jam-practice/core/meterControls';
import {
  CONCRETE_ROLL_TYPES,
  ROLL_TYPES,
  TRIPLET_STICKING_OPTIONS,
  type ConcreteRollType,
  type RollType,
  type TripletSticking,
} from '@jam-practice/core/stickControl';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';

import { BeatIndicator } from '@/components/BeatIndicator';
import { MetronomeIcon, RepeatIcon, ShuffleIcon, SpeakerIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { NOTATION_ROW_GAP, StickNotation } from '@/components/StickNotation';
import { SwitchRow } from '@/components/SwitchRow';
import { BigButton, SoundPicker, StepButton, soundSummary } from '@/components/tool/meter';
import { ChoiceCards, CountField, ListIcon, OptionLabel, PoolPills } from '@/components/tool/rhythm';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { ToolFrame } from '@/components/tool/ToolFrame';
import { Slider } from '@/components/tool/Slider';
import { MAX_ROW_BARS, STICKING_FONT_PT, measureLayout, renderPatternRows, type NotationRow } from '@/lib/notation/stickNotation';
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
import { useToolActivity } from '@/lib/toolTime';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';

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

/** The smallest the notation is drawn: the sticking letters at 14 px or more. */
const MIN_SCALE = 14 / ((STICKING_FONT_PT * 4) / 3);

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
 * Random Sticking Warmup, laid out like every tool (`ToolFrame`): the pattern (and the next one)
 * as big as the space allows, the phase line, a compact tempo row (− / BPM / + / Tap) and the beat
 * strip, then the footer: New and Start, and the Pattern, Playback and Sound chips. The notation is
 * engraved by the same VexFlow code as the website (see `components/StickNotation.tsx`), one bar
 * to a row at full width on a phone so the sticking letters stay readable.
 */
function RandomStickingWarmupScreen() {
  const { colors, derived } = useAppTheme();
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
  useToolActivity('/random-sticking-warmup', running);
  useKeepAwakeWhile(running);

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

  // The pattern is the tool: it fills the card's width, with as many bars to a row as still keep
  // the sticking letters readable (at least MIN_SCALE — one bar to a row on a phone). It only
  // shrinks (never below MIN_SCALE) to fit the height; past that the area scrolls. "Next" gets
  // what height is left — the same size, smaller, or hidden when there's no room for it.
  const layout = useMemo(() => {
    if (!area || !pattern) return null;
    const innerWidth = area.width - CARD_PAD * 2;
    const maxBars = Math.min(MAX_ROW_BARS, pattern.bars.length);
    let perRow = 1;
    for (let candidate = maxBars; candidate > 1; candidate--) {
      if (innerWidth / measureLayout(pattern, candidate).maxRowWidth >= MIN_SCALE) {
        perRow = candidate;
        break;
      }
    }
    /** The rows' height drawn `width` wide (each row is scaled to that width). */
    const heightAt = (rows: NotationRow[], width: number) =>
      rows.reduce((sum, row) => sum + (row.height * width) / row.width, 0) + (rows.length - 1) * NOTATION_ROW_GAP;

    const current = renderPatternRows(pattern, perRow);
    const fullHeight = heightAt(current, innerWidth);
    const room = area.height - CARD_PAD * 2;
    const minWidth = MIN_SCALE * current[0].width;
    const width = fullHeight <= room ? innerWidth : Math.min(innerWidth, Math.max(minWidth, (innerWidth * room) / fullHeight));

    let next: NotationRow[] | null = null;
    let nextWidth = width;
    if (nextPattern) {
      const rows = renderPatternRows(nextPattern, perRow);
      const left = area.height - (heightAt(current, width) + CARD_PAD * 2) - NEXT_LABEL - CARD_PAD * 2;
      const needed = heightAt(rows, width);
      if (left >= needed) next = rows;
      else if (left >= needed * 0.45) {
        next = rows;
        nextWidth = (width * left) / needed;
      }
    }
    return { current, next, width, nextWidth };
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
      ? 'Count-in…'
      : phase === 'playing' && repeats > 1
        ? `Repeat ${currentRepeat} of ${repeats}`
        : phase === 'playing'
          ? 'Playing'
          : null;

  const showTripletPicker =
    rollType === 'triplet' ||
    (rollType === 'random' && (enabledRollTypes.length === 0 || enabledRollTypes.includes('triplet')));

  return (
    <ToolFrame
      title="Random Sticking Warmup"
      scroll={false}
      action={
        <View className="flex-row gap-2">
          <View style={{ flex: 1 }}>
            <BigButton label="New" secondary icon={<ShuffleIcon color={colors.muted} size={18} />} onPress={advanceStickControlPattern} />
          </View>
          <View style={{ flex: 2 }}>
            <BigButton label={running ? 'Stop' : 'Start'} secondary={running} onPress={running ? stopStickControl : startStickControl} />
          </View>
        </View>
      }
      chips={
        <SettingsBar>
          <SettingChip Icon={ListIcon} label="Pattern" value={(ROLL_TYPES.find((r) => r.value === rollType)?.label ?? '').replace(/ roll$/, '')}>
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
              title="Count-in bars"
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
        </SettingsBar>
      }
    >
      <View className="flex-1 gap-2 px-4 pt-3">
        {/* The pattern and the next one get all the height the tempo row leaves. */}
        <View className="flex-1" onLayout={onArea}>
          {pattern && layout ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: CARD_GAP }}>
              <View className="items-center rounded-xl" style={{ padding: CARD_PAD, backgroundColor: colors.surface }}>
                <StickNotation rows={layout.current} width={layout.width} activeBarIndex={currentBarIndex} ink={ink} accent={colors.accent} />
              </View>
              {layout.next ? (
                <>
                  <Text className="font-ui-semibold text-center text-xs font-semibold" style={[muted, { height: NEXT_LABEL - CARD_GAP, lineHeight: NEXT_LABEL - CARD_GAP }]}>
                    Next
                  </Text>
                  <View className="items-center rounded-xl" style={{ padding: CARD_PAD, backgroundColor: colors.surface, opacity: 0.75 }}>
                    <StickNotation rows={layout.next} width={layout.nextWidth} activeBarIndex={null} ink={ink} accent={colors.accent} />
                  </View>
                </>
              ) : null}
            </ScrollView>
          ) : null}
        </View>

        {/* The phase ("Repeat 1 of 20"), holding its line so Start doesn't move anything. */}
        <Text className="font-ui-semibold text-center text-sm font-semibold" style={{ color: colors.accent, height: 20, lineHeight: 20 }}>
          {phaseLabel ?? ''}
        </Text>

        {/* The tempo, compact (the notation is the biggest thing): − / the number / + and Tap,
            with the beat strip (tap a beat to change its accent) beside it. */}
        <View className="flex-row items-center justify-center gap-2">
          <StepButton label="Decrease tempo" onPress={() => updateSettings({ bpm: clampBpm(bpm - 1) })} disabled={bpm <= MIN_BPM}>
            −
          </StepButton>
          <View className="w-[72px] items-center">
            <Text className="font-ui-bold text-3xl font-bold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'], lineHeight: 34 }}>
              {bpm}
            </Text>
            <Text className="font-ui text-[11px]" style={muted}>
              BPM
            </Text>
          </View>
          <StepButton label="Increase tempo" onPress={() => updateSettings({ bpm: clampBpm(bpm + 1) })} disabled={bpm >= MAX_BPM}>
            +
          </StepButton>
          <Pressable
            onPress={tap}
            accessibilityLabel="Tap tempo"
            accessibilityRole="button"
            android_ripple={{ color: colors['surface-hover'] }}
            className="ml-1 h-12 flex-row items-center gap-1.5 overflow-hidden rounded-full px-4"
            style={{ backgroundColor: derived.fill }}
          >
            <MetronomeIcon color={colors.muted} size={16} />
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              Tap
            </Text>
          </Pressable>
        </View>
        <View className="items-center pb-1">
          <BeatIndicator accents={accents} currentBeat={running ? currentBeat : null} onCycle={cycleBeat} size="sm" />
        </View>
      </View>
    </ToolFrame>
  );
}

export default withScreenLoader(RandomStickingWarmupScreen);
