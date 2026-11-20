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
 * scaled up and ringed in the accent.
 */
function Bar({
  level,
  active,
  label,
  number,
  small,
  fit,
  onPress,
}: {
  level: BeatLevel;
  active: boolean;
  label: string;
  number?: number;
  small: boolean;
  /** Fitted width (dp), when the strip had to shrink to stay on one row. */
  fit?: number;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const rank = LEVEL_RANK[level] ?? 2;
  const lit = level === 2 ? colors.accent : withAlpha(colors.foreground, 0.4);
  const base = small ? 28 : 40;
  const width = fit ?? base;
  // Narrow bars (sextuplets in 4/4) keep most of their height: there's room for it, and they still
  // read as bars rather than dots.
  const seg = fit === undefined ? (small ? 9 : 17) : small ? 8 : 13;
  const pad = width < 20 ? 2 : 3;

  const bar = (
    <View
      style={{
        width,
        padding: pad,
        gap: pad,
        borderRadius: width < 20 ? 4 : 6,
        backgroundColor: active ? withAlpha(colors.accent, 0.15) : colors.surface,
        borderWidth: active ? 2 : 1,
        borderColor: active ? colors.accent : withAlpha(colors.foreground, 0.1),
        opacity: level === 0 && !active ? 0.5 : 1,
        ...(active ? { transform: [{ scale: 1.05 }] } : null),
      }}
    >
      {[2, 1, 0].map((i) => (
        <View key={i} style={{ height: seg, borderRadius: 3, backgroundColor: i < rank ? lit : withAlpha(colors.foreground, 0.1) }} />
      ))}
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
  // Fit every beat and tick on one row: the bars share the width (less the gaps) and only shrink
  // (down to 10 dp; past that, e.g. 12 beats of nonuplets, it wraps).
  const groupGap = small ? 8 : 12;
  const beats = accents.length;
  const bars = beats * (1 + dotCount);
  const room = width - groupGap * Math.max(0, beats - 1) - 2 * dotCount * beats;
  const fitted = width && bars ? Math.max(10, Math.floor(room / bars)) : undefined;
  const fit = fitted !== undefined && fitted < (small ? 28 : 40) ? fitted : undefined;

  return (
    <View className="items-center gap-3 self-stretch" onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'center', gap: groupGap }}>
        {accents.map((level, i) => (
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
                  onPress={onCycleSub ? () => onCycleSub(i, d) : undefined}
                />
              );
            })}
          </View>
        ))}
      </View>
      {cycleHint && onCycle ? (
        <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
          Tap a beat to change its accent
        </Text>
      ) : null}
    </View>
  );
}
