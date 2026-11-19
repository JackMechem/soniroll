import type { BeatLevel } from '@jam-practice/core/clickSounds';
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
  onPress,
}: {
  level: BeatLevel;
  active: boolean;
  label: string;
  number?: number;
  small: boolean;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const rank = LEVEL_RANK[level] ?? 2;
  const lit = level === 2 ? colors.accent : withAlpha(colors.foreground, 0.4);
  const width = small ? 28 : 40;
  const seg = small ? 9 : 17;

  const bar = (
    <View
      style={{
        width,
        padding: 3,
        gap: 3,
        borderRadius: 6,
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

  return (
    <View className="items-center gap-3">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'center', gap: small ? 8 : 12 }}>
        {accents.map((level, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
            <Bar
              level={level}
              active={currentBeat === i && currentSub === 0}
              label={`Beat ${i + 1}: ${LEVEL_LABEL[level]}`}
              number={i + 1}
              small={small}
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
                  onPress={onCycleSub ? () => onCycleSub(i, d) : undefined}
                />
              );
            })}
          </View>
        ))}
      </View>
      {cycleHint && onCycle ? (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          Tap a beat to change its accent
        </Text>
      ) : null}
    </View>
  );
}
