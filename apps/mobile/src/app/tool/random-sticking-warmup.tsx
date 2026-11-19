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
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeatIndicator } from '@/components/BeatIndicator';
import { SlidersIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import { Pill, SoundOptions, TempoControls } from '@/components/MetronomeControls';
import { NumberStepper } from '@/components/NumberStepper';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { NOTATION_ROW_GAP, StickNotation } from '@/components/StickNotation';
import { SwitchRow } from '@/components/SwitchRow';
import { ToolOptionsSheet } from '@/components/ToolOptionsSheet';
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
 * Native port of `apps/web/components/StickControl.tsx`. The notation is engraved by the same
 * VexFlow code as the website (see `components/StickNotation.tsx`); what's mobile-specific is only
 * how it's fitted to the screen: the current pattern and the "Next" preview share whatever height
 * is left under the controls, with the bars-per-row and scale picked to make the notes as large as
 * possible without the page ever scrolling (web instead fits bars-per-row to width and lets the
 * page scroll).
 */
function RandomStickingWarmupScreen() {
  const { colors } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [optionsOpen, setOptionsOpen] = useState(false);
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
  const fg = { color: colors.foreground };

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
        <View className="flex-1 gap-3 px-4 pt-3" style={{ paddingBottom: 12 }}>
          {running ? (
            // While playing, tempo and the beat strip shrink to one row beside Options so both
            // staves get the room; stop to change the tempo.
            <View className="flex-row items-center gap-3">
              <View className="items-center">
                <Text className="text-2xl font-extrabold font-ui-extrabold" style={fg}>
                  {bpm}
                </Text>
                <Text className="text-[10px] font-bold font-ui-bold" style={muted}>
                  BPM
                </Text>
              </View>
              <View className="flex-1 items-center">
                <BeatIndicator accents={accents} currentBeat={currentBeat} onCycle={cycleBeat} size="sm" />
              </View>
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
          ) : (
            <>
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
              <View className="items-center gap-3">
                <TempoControls bpm={bpm} setBpm={(next) => updateSettings({ bpm: next })} onTap={tap} />
                <BeatIndicator accents={accents} currentBeat={null} onCycle={cycleBeat} />
              </View>
            </>
          )}

          <View className="flex-1" onLayout={onArea}>
            {pattern && layout ? (
              <View style={{ gap: CARD_GAP, flex: 1, justifyContent: 'center' }}>
                <View className="rounded-xl" style={{ padding: CARD_PAD, backgroundColor: colors.surface }}>
                  <StickNotation
                    rows={layout.current}
                    width={layout.width}
                    activeBarIndex={currentBarIndex}
                    ink={ink}
                    accent={colors.accent}
                  />
                </View>
                {layout.next ? (
                  <>
                    <Text
                      className="text-center text-sm font-semibold font-ui-semibold"
                      style={[muted, { height: NEXT_LABEL - CARD_GAP, lineHeight: NEXT_LABEL - CARD_GAP }]}
                    >
                      Next
                    </Text>
                    <View
                      className="rounded-xl"
                      style={{
                        padding: CARD_PAD,
                        borderWidth: 1,
                        borderColor: colors['surface-hover'],
                      }}
                    >
                      <StickNotation
                        rows={layout.next}
                        width={layout.width}
                        activeBarIndex={null}
                        ink={ink}
                        accent={colors.accent}
                      />
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>

          <Text className="text-center text-sm font-semibold font-ui-semibold" style={{ color: colors.accent, minHeight: 20 }}>
            {phaseLabel ?? ''}
          </Text>

          <View className="flex-row items-center justify-center gap-3">
            <Pressable
              onPress={advanceStickControlPattern}
              className="items-center rounded-full px-6 py-4"
              style={{ backgroundColor: colors.surface }}
            >
              <Text className="text-base font-bold font-ui-bold" style={fg}>
                New pattern
              </Text>
            </Pressable>
            <Pressable
              onPress={running ? stopStickControl : startStickControl}
              className="min-w-[140px] items-center rounded-full px-8 py-4"
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
            key: 'pattern',
            label: 'Pattern',
            content: () => (
              <>
                <View className="gap-2">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-sm font-semibold font-ui-semibold" style={muted}>
                      Roll type
                    </Text>
                    <InfoButton
                      title="Roll type"
                      size={16}
                      text={
                        '"Single stroke roll" is the same length/speed as the double-stroke roll, just plain alternating R/L instead of the RRLLRRLLR rudiment. "Triplets" writes the roll as 8th-note triplets instead, with a random sticking each time — straight alternation, or a broken-double shape (RRL or LLR). "Random" picks a fresh roll type for every pattern.'
                      }
                    />
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {ROLL_TYPES.map((o) => (
                      <Pill
                        key={o.value}
                        label={o.label}
                        selected={rollType === o.value}
                        onPress={() => updateSettings({ rollType: o.value })}
                      />
                    ))}
                  </View>
                </View>

                {rollType === 'random' ? (
                  <View className="gap-2">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-sm font-semibold font-ui-semibold" style={muted}>
                        Roll types
                      </Text>
                      <InfoButton
                        title="Roll types"
                        size={16}
                        text='Which roll types "Random" can pick from. Falls back to all three if none are selected.'
                      />
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {ROLL_TYPE_PICKER_OPTIONS.map((o) => (
                        <Pill
                          key={o.value}
                          label={o.label}
                          selected={enabledRollTypes.includes(o.value)}
                          onPress={() => toggleRollType(o.value)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {showTripletPicker ? (
                  <View className="gap-2">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-sm font-semibold font-ui-semibold" style={muted}>
                        Triplet stickings
                      </Text>
                      <InfoButton
                        title="Triplet stickings"
                        size={16}
                        text='Which of the two triplet stickings can be randomly picked. "Broken double" always plays whichever of RRL/LLR fits the hand it needs to start on. Falls back to both if neither is selected.'
                      />
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {TRIPLET_STICKING_OPTIONS.map((o) => (
                        <Pill
                          key={o.value}
                          label={o.label}
                          selected={enabledTripletStickings.includes(o.value)}
                          onPress={() => toggleTripletSticking(o.value)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            ),
          },
          {
            key: 'playback',
            label: 'Playback',
            content: () => (
              <>
                <NumberStepper
                  label="Count-off bars"
                  value={countOffBars}
                  unit=""
                  min={0}
                  max={4}
                  step={1}
                  onChange={(n) => updateSettings({ countOffBars: Math.round(n) })}
                  hint="Plain metronome bars played before the pattern starts, so you come in on time."
                />
                <NumberStepper
                  label="Repeat count"
                  value={repeats}
                  unit="x"
                  min={1}
                  max={100}
                  step={1}
                  onChange={(n) => updateSettings({ repeats: Math.round(n) })}
                  hint="How many times the pattern repeats before stopping (or moving to a new one, with “New pattern when done”)."
                />
                <SwitchRow
                  label="New pattern when done"
                  checked={autoAdvance}
                  onChange={(v) => updateSettings({ autoAdvance: v })}
                  hint="After the repeat count finishes, move straight on to the next pattern and keep going instead of stopping."
                />
                <View className="gap-2">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-sm font-semibold font-ui-semibold" style={muted}>
                      Click
                    </Text>
                    <InfoButton
                      title="Click"
                      size={16}
                      text={
                        '"Steady pulse" clicks once per beat. "Every stroke" clicks every note of the pattern. "Pitch per hand" clicks a different pitch for every R vs. L stroke, so you can hear the sticking without watching the notation.'
                      }
                    />
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {CLICK_MODE_OPTIONS.map((o) => (
                      <Pill
                        key={o.value}
                        label={o.label}
                        selected={clickMode === o.value}
                        onPress={() => updateSettings({ clickMode: o.value })}
                      />
                    ))}
                  </View>
                </View>
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

export default withScreenLoader(RandomStickingWarmupScreen);
