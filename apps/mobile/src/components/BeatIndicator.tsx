import type { BeatLevel } from '@jam-practice/core/clickSounds';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

const LEVEL_LABEL: Record<BeatLevel, string> = { 2: 'accent', 1: 'normal', 3: 'soft', 0: 'muted' };

/**
 * Native port of `apps/web/components/BeatIndicator.tsx`'s own "sequencer strip" look — each beat
 * is a tall vertical bar (numbered top-left), each subdivision tick after it an unnumbered bar of
 * the same size. Colors come from the live theme via inline `style`, not `className` color
 * tokens — the same NativeWind/`Pressable` constraints documented in `ToolGrid.tsx`'s own doc
 * comment apply here too, so every bar's `style` is a plain object and press feedback (when a bar
 * is clickable at all) is just the scale/border bump on `active` — this app deliberately has no
 * press ripple anywhere (`android_ripple` was tried and removed; see git history for why).
 *
 * Two deliberate simplifications versus the web version, both because true CSS `filter: brightness`
 * has no React Native equivalent: the "currently sounding" highlight is a scale bump + accent-
 * colored border rather than scale + brightness + ring-offset, and a muted bar's "ring" is a plain
 * border instead of an inset ring. Reads as the same idea (bigger, bordered, obviously active) at
 * a glance — not pixel-identical, not yet seen rendered on a real device to confirm it reads well.
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
  const width = small ? 28 : 40;
  const height = small ? 40 : 64;

  const backgroundColor = level === 2 ? colors.accent : level === 1 || level === 3 ? colors.foreground : colors.surface;
  const textColor = level === 2 ? colors['accent-foreground'] : level === 1 || level === 3 ? colors.background : colors.muted;

  const content = (
    <View
      style={{
        width,
        height,
        borderRadius: 8,
        backgroundColor,
        opacity: level === 0 ? 0.5 : 1,
        borderWidth: level === 0 || active ? 2 : 0,
        borderColor: active ? colors.accent : colors['surface-hover'],
        // `transform: undefined` (vs. simply omitting the key) crashes RN's native style
        // validator on a real device — "Cannot read property 'forEach' of null" inside
        // `processTransform.js`, confirmed directly on Jack's own Pixel 10 Pro. Spreading the key
        // in only when there's an actual value keeps it genuinely absent otherwise.
        ...(active ? { transform: [{ scale: 1.08 }] } : null),
        justifyContent: 'flex-start',
      }}
    >
      {number !== undefined ? (
        <Text
          style={{
            position: 'absolute',
            left: 4,
            top: 3,
            fontSize: 11,
            fontWeight: '700',
            fontFamily: 'Inter_700Bold',
            color: textColor,
            textDecorationLine: level === 0 ? 'line-through' : 'none',
          }}
        >
          {number}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to change.`}
    >
      {content}
    </Pressable>
  );
}

export function BeatIndicator({
  accents,
  currentBeat,
  onCycle,
  size = 'md',
  subdivision = 1,
  subAccents = [],
  currentSub = 0,
  onCycleSub,
}: {
  accents: BeatLevel[];
  currentBeat: number | null;
  onCycle?: (index: number) => void;
  size?: 'md' | 'sm';
  subdivision?: number;
  subAccents?: BeatLevel[];
  currentSub?: number;
  onCycleSub?: (beatIndex: number, subIndex: number) => void;
}) {
  const small = size === 'sm';
  const dotCount = Math.max(0, Math.round(subdivision) - 1);

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: small ? 8 : 12,
      }}
      accessibilityRole="none"
    >
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
            const flatIndex = i * dotCount + d;
            const dotLevel = subAccents[flatIndex] ?? 1;
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
  );
}
