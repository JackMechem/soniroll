import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * The website's "reward" look for tool options (`apps/web/components/reward/Reward.tsx`): chunky
 * pills, the picked thing lit with a gradient of the accent, and values that pop when they change.
 * Every tool's options on mobile use it, in the theme's accent.
 */

/** `hex` mixed with white: `amount` 0 is the colour, 1 is white (the web's `color-mix`). */
export function mixWithWhite(hex: string, amount: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** `a` mixed with `b`: `amount` of `a` (the web's `color-mix(in srgb, a N%, b)`). */
export function mix(a: string, b: string, amount: number) {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * amount + ((pb >> shift) & 255) * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Fills its parent with the reward gradient (the accent, lighter at the top left), like the web's
    `rewardGradient`. The parent sets the size and shape: give it `overflow-hidden` and its corner
    radius, and the gradient is clipped to it. Uses React Native's own gradient backgrounds, with the
    plain accent underneath where those aren't drawn. */
export function GradientFill({ color }: { color?: string }) {
  const { colors } = useAppTheme();
  const c = color ?? colors.accent;
  return (
    <View
      pointerEvents="none"
      style={{
        ...StyleSheet.absoluteFill,
        backgroundColor: c,
        experimental_backgroundImage: `linear-gradient(150deg, ${mixWithWhite(c, 0.25)} 0%, ${c} 100%)`,
      }}
    />
  );
}

/** A little pop (scale down, overshoot, settle) each time `key` changes — not on first render.
    Nothing under reduced motion. */
export function usePop(key: string | number | boolean | null | undefined) {
  const scale = useSharedValue(1);
  const reduce = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    scale.value = withSequence(
      withTiming(0.85, { duration: 60 }),
      withTiming(1.14, { duration: 150, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 170, easing: Easing.inOut(Easing.quad) }),
    );
  }, [key, reduce, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/** Two or more choices as one pill (the web's `Segmented`): a chunky track with the picked side
    in the flat accent. `onPage` puts it on the page (a surface track); inside a sheet it's the
    background colour. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  onPage,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  onPage?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row gap-1 rounded-full p-1.5"
      style={{ backgroundColor: onPage ? colors.surface : colors.background, opacity: disabled ? 0.6 : 1 }}
    >
      {options.map((o) => (
        <Segment key={String(o.value)} label={o.label} on={o.value === value} disabled={disabled} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

function Segment({ label, on, disabled, onPress }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const pop = usePop(on);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}
      className="min-h-10 flex-1 items-center justify-center overflow-hidden rounded-full px-5 py-2.5"
      style={on ? { backgroundColor: colors.accent } : undefined}
    >
      <Animated.View style={on ? pop : undefined}>
        <Text numberOfLines={1} className="font-ui-bold text-sm font-bold" style={{ color: on ? colors['accent-foreground'] : colors.muted }}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** A choice card in a picker (subdivision, click sound, a quick-pick meter): outlined, and lit in
    the accent with a pop when picked. Lives in a sheet, so it sits on the background colour. */
export function RewardCard({
  on,
  onPick,
  label,
  style,
  row,
  children,
}: {
  on: boolean;
  onPick: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  /** Lay the content out in a row (icon then text), left-aligned. */
  row?: boolean;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  const pop = usePop(on);
  return (
    <Pressable
      onPress={onPick}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      className={`rounded-md border ${row ? 'flex-row items-center justify-start px-3' : 'items-center justify-center'}`}
      style={[
        on
          ? { borderColor: colors.accent, backgroundColor: mix(colors.accent, colors.background, 0.12) }
          : { borderColor: withAlpha(colors.foreground, 0.15), backgroundColor: colors.background },
        style,
      ]}
    >
      <Animated.View className={row ? 'flex-row items-center gap-2.5' : 'items-center gap-1'} style={on ? pop : undefined}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** A titled group inside an options sheet ("Quick picks", "Volume"), with something on the right. */
export function OptionGroup({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
          {title}
        </Text>
        {aside}
      </View>
      {children}
    </View>
  );
}
