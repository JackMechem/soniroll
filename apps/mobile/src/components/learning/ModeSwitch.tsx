import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/** A small pill switch between two (or more) modes, e.g. Practice / Learn. */
export function ModeSwitch<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row rounded-full p-1" style={{ backgroundColor: colors.surface }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            className="rounded-full px-3.5 py-1.5"
            style={{ backgroundColor: on ? colors.background : 'transparent' }}
          >
            <Text className="font-ui-bold text-[13px] font-bold" style={{ color: on ? colors.foreground : colors.muted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
