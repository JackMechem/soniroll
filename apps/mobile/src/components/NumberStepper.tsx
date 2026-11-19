import { Pressable, Text, View } from 'react-native';

import { InfoButton } from '@/components/InfoButton';
import { GradientFill } from '@/components/tool/reward';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * A labelled number with a readout, − / + buttons and a bar showing where it sits in its range
 * (the chord chart editor's time signature). The description, if any, is behind an ⓘ. For a
 * continuous value prefer `components/tool/Slider.tsx`.
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
        <View className="flex-row items-center gap-1.5">
          <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
            {label}
          </Text>
          {hint ? <InfoButton title={label} text={hint} size={16} /> : null}
        </View>
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
        <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: withAlpha(colors.foreground, 0.1) }}>
          <View className="h-full overflow-hidden rounded-full" style={{ width: `${((value - min) / (max - min)) * 100}%`, opacity: disabled ? 0.5 : 1 }}>
            <GradientFill />
          </View>
        </View>
        <StepperButton
          symbol="+"
          disabled={disabled || value >= max}
          onPress={() => onChange(round(clamp(value + step)))}
        />
      </View>
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
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 w-9 items-center justify-center overflow-hidden rounded-full"
      style={{ backgroundColor: derived.fill, opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="text-lg font-bold font-ui-bold" style={{ color: colors.foreground }}>
        {symbol}
      </Text>
    </Pressable>
  );
}
