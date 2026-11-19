import { Pressable, Text, View } from 'react-native';

import { Hint } from '@/components/Hint';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The native sibling of `apps/web/components/AdvancedSlider.tsx` — a labeled numeric control with
 * a live readout, for a value like "Tolerance" or "Hold time (ms)". Rendered as ±1-step buttons
 * instead of a drag slider, matching this app's own established mobile-specific precedent
 * (Metronome's BPM/volume steppers — see `PROJECT.md`'s own note on why: genuinely easier to hit
 * precisely with a finger than a continuous slider, and how most native mobile apps handle this
 * kind of control in the first place) rather than pulling in a slider dependency this app has
 * otherwise avoided.
 */
export function NumberStepper({
  label,
  value,
  unit,
  min,
  max,
  step,
  hint,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const { colors } = useAppTheme();

  function clamp(n: number) {
    return Math.min(max, Math.max(min, n));
  }

  // Avoids floating-point drift from repeated +/- step additions (e.g. 0.1 steps).
  const decimals = step.toString().split('.')[1]?.length ?? 0;
  const round = (n: number) => Number(n.toFixed(decimals));

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
          {label}
        </Text>
        <Text className="text-sm font-ui tabular-nums" style={{ color: colors.foreground }}>
          {value}
          {unit}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <StepperButton
          symbol="−"
          disabled={disabled || value <= min}
          onPress={() => onChange(round(clamp(value - step)))}
        />
        <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: colors['surface-hover'] }}>
          <View
            className="h-full rounded-full"
            style={{
              width: `${((value - min) / (max - min)) * 100}%`,
              backgroundColor: disabled ? colors.muted : colors.accent,
            }}
          />
        </View>
        <StepperButton
          symbol="+"
          disabled={disabled || value >= max}
          onPress={() => onChange(round(clamp(value + step)))}
        />
      </View>
      {hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}

function StepperButton({
  symbol,
  onPress,
  disabled,
}: {
  symbol: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="h-9 w-9 items-center justify-center rounded-full"
      style={{ backgroundColor: colors.surface, opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="text-lg font-bold font-ui-bold" style={{ color: colors.foreground }}>
        {symbol}
      </Text>
    </Pressable>
  );
}
