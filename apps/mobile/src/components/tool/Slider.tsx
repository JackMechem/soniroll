import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { GradientFill } from '@/components/tool/reward';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

const THUMB = 24;

/**
 * A slider like the website's (`.slider` with the reward gradient): a thin track, the filled part
 * in the accent gradient, and a round thumb. Drag along it (a sideways drag; an up-and-down one
 * still scrolls the page) or tap a spot. `value` and `onChange` are 0–1; `onEnd` fires when the
 * finger lifts (e.g. to play a preview). Inside a `Modal` it needs a `GestureHandlerRootView`
 * (`ToolSheet` has one).
 */
export function Slider({
  value,
  onChange,
  onEnd,
  label,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  onEnd?: () => void;
  label: string;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(1);
  const at = (x: number) => onChange(Math.min(1, Math.max(0, x / width)));

  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(!disabled)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onStart((e) => at(e.x))
    .onUpdate((e) => at(e.x))
    .onEnd(() => onEnd?.());
  const tap = Gesture.Tap()
    .runOnJS(true)
    .enabled(!disabled)
    .onEnd((e, success) => {
      if (!success) return;
      at(e.x);
      onEnd?.();
    });

  const v = Math.min(1, Math.max(0, value));
  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChange(Math.min(1, v + 0.05));
          if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(0, v - 0.05));
        }}
        onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        className="h-10 justify-center"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: withAlpha(colors.foreground, 0.1) }}>
          <View className="h-full overflow-hidden rounded-full" style={{ width: `${v * 100}%` }}>
            <GradientFill />
          </View>
        </View>
        <View
          className="absolute rounded-full"
          style={{
            width: THUMB,
            height: THUMB,
            left: v * width - THUMB / 2,
            backgroundColor: colors.accent,
            borderWidth: 3,
            borderColor: colors.background,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </View>
    </GestureDetector>
  );
}
