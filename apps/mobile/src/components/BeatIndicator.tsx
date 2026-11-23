import type { BeatLevel } from '@jam-practice/core/clickSounds';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

const LEVEL_LABEL: Record<BeatLevel, string> = { 2: 'accent', 1: 'normal', 3: 'soft', 0: 'muted' };
/** How many of a bar's three segments light up for each level: all three for an accent, two for
    normal, one for soft, none when muted (the web's `LEVEL_RANK`). */
const LEVEL_RANK: Record<BeatLevel, number> = { 0: 0, 3: 1, 1: 2, 2: 3 };

/**
 * One beat (or subdivision tick) as a tall bar of three segments that light from the bottom with
 * its level — in the accent for an accent — like the website's beat strip
 * (`apps/web/components/BeatIndicator.tsx`). The beat's number sits above it. The one playing is
 * scaled up and ringed in the accent; the ring is drawn over the bar, so it never moves anything.
 */
function Bar({
  level,
  active,
  label,
  number,
  small,
  fit,
  tick,
  onPress,
}: {
  level: BeatLevel;
  active: boolean;
  label: string;
  number?: number;
  small: boolean;
  /** Fitted width (dp), when the strip had to shrink to stay on one row. */
  fit?: number;
  /** A subdivision tick: shorter than its beat, so each beat's group reads at a glance. */
  tick?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const rank = LEVEL_RANK[level] ?? 2;
  const lit = level === 2 ? colors.accent : withAlpha(colors.foreground, 0.4);
  const base = small ? 28 : 40;
  const width = fit ?? base;
  // Bars keep their height; only a really narrow one (many beats of many ticks) gets shorter.
  const full = width >= (small ? 18 : 24) ? (small ? 9 : 17) : small ? 8 : 13;
  const seg = tick ? Math.round(full * 0.6) : full;
  const pad = width < 20 ? 2 : 3;

  const bar = (
    <View
      style={{
        width,
        padding: pad,
        gap: pad,
        borderRadius: width < 20 ? 4 : 6,
        backgroundColor: active ? withAlpha(colors.accent, 0.15) : colors.surface,
        // Always 1dp: the playing beat's thicker ring is the overlay below, so lighting a beat never
        // changes its size (a 2dp border made the bar taller and lifted its number — FB-33).
        borderWidth: 1,
        borderColor: active ? colors.accent : withAlpha(colors.foreground, 0.1),
        opacity: level === 0 && !active ? 0.5 : 1,
        ...(active ? { transform: [{ scale: 1.05 }] } : null),
      }}
    >
      {[2, 1, 0].map((i) => (
        <View key={i} style={{ height: seg, borderRadius: 3, backgroundColor: i < rank ? lit : withAlpha(colors.foreground, 0.1) }} />
      ))}
      {active ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: width < 20 ? 4 : 6, borderWidth: 2, borderColor: colors.accent }}
        />
      ) : null}
    </View>
  );

  const content =
    number === undefined ? (
      bar
    ) : (
      <View className="items-center gap-2.5">
        <Text
          className="font-ui-semibold text-xs font-semibold"
          style={{ color: active ? colors.foreground : colors.muted, textDecorationLine: level === 0 ? 'line-through' : 'none' }}
        >
          {number}
        </Text>
        {bar}
      </View>
    );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${label}. Tap to change.`}>
      {content}
    </Pressable>
  );
}

/** The beats in a bar, each followed by its subdivision ticks. With `onCycle`, tapping a beat
    cycles accent / normal / muted (`onCycleSub` does the same for ticks); `cycleHint` says so
    under the strip. */
export function BeatIndicator({
  accents,
  currentBeat,
  onCycle,
  size = 'md',
  subdivision = 1,
  subAccents = [],
  currentSub = 0,
  onCycleSub,
  cycleHint,
}: {
  accents: BeatLevel[];
  currentBeat: number | null;
  onCycle?: (index: number) => void;
  size?: 'md' | 'sm';
  subdivision?: number;
  subAccents?: BeatLevel[];
  currentSub?: number;
  onCycleSub?: (beatIndex: number, subIndex: number) => void;
  cycleHint?: boolean;
}) {
  const { colors } = useAppTheme();
  const small = size === 'sm';
  const dotCount = Math.max(0, Math.round(subdivision) - 1);
  const [width, setWidth] = useState(0);
  // As many beats to a row as fit with every bar at least `minW` wide, rows kept even (Sextuplets
  // in 4/4 is two rows of two beats); the bars only narrow a little to fit. Squeezing all the beats
  // onto one row made them thin slivers (Jack: "that does not look good with the beats squished").
  const groupGap = small ? 8 : 12;
  const beats = accents.length;
  const base = small ? 28 : 40;
  const minW = small ? 18 : 24;
  const widthFor = (k: number) => Math.floor((width - groupGap * (k - 1) - 2 * dotCount * k) / (k * (1 + dotCount)));
  let perRow = Math.max(1, beats);
  if (width) {
    perRow = 1;
    for (let k = beats; k >= 1; k--)
      if (widthFor(k) >= minW) {
        perRow = k;
        break;
      }
    perRow = Math.ceil(beats / Math.ceil(beats / perRow));
  }
  const barW = width ? Math.min(base, widthFor(perRow)) : base;
  const fit = barW < base ? Math.max(10, barW) : undefined;
  const rows = Array.from({ length: Math.ceil(beats / perRow) }, (_, r) => accents.map((_, i) => i).slice(r * perRow, r * perRow + perRow));

  return (
    <View className="items-center gap-3 self-stretch" onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: groupGap }}>
          {row.map((i) => {
            const level = accents[i];
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                <Bar
                  level={level}
                  active={currentBeat === i && currentSub === 0}
                  label={`Beat ${i + 1}: ${LEVEL_LABEL[level]}`}
                  number={i + 1}
                  small={small}
                  fit={fit}
                  onPress={onCycle ? () => onCycle(i) : undefined}
                />
                {Array.from({ length: dotCount }, (_, d) => {
                  const dotLevel = subAccents[i * dotCount + d] ?? 1;
                  return (
                    <Bar
                      key={d}
                      level={dotLevel}
                      active={currentBeat === i && currentSub === d + 1}
                      label={`Subdivision after beat ${i + 1}${dotCount > 1 ? ` (${d + 1}/${dotCount})` : ''}: ${LEVEL_LABEL[dotLevel]}`}
                      small={small}
                      fit={fit}
                      tick
                      onPress={onCycleSub ? () => onCycleSub(i, d) : undefined}
                    />
                  );
                })}
              </View>
            );
          })}
        </View>
      ))}
      {cycleHint && onCycle ? (
        <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
          Tap a beat to change its accent
        </Text>
      ) : null}
    </View>
  );
}
