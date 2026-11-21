import { Switch, Text, View } from 'react-native';

import { InfoButton } from '@/components/InfoButton';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** The native sibling of `apps/web/components/SwitchRow.tsx` — a labeled row around RN's own
    native `Switch` (the same component `app/tool/metronome.tsx`'s "Use a structure" toggle
    already uses inline) rather than a hand-built track/thumb pair, since RN already ships a real
    native switch control. `hint` shows as an ⓘ next to the label that opens it in a popup
    (`InfoButton`), never as text printed under the row. */
export function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 flex-row items-center gap-1.5">
          <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
            {label}
          </Text>
          {hint ? <InfoButton title={label} text={hint} size={16} /> : null}
        </View>
        <Switch
          value={checked}
          onValueChange={onChange}
          disabled={disabled}
          // Android's switch in the theme's colours: an accent knob on a lighter accent track when on,
          // a muted knob on a faint track when off. (Without thumbColor Android paints the knob in
          // its default teal; its knob is bigger than the track, so it has to stand out by itself.)
          trackColor={{ false: withAlpha(colors.foreground, 0.15), true: withAlpha(colors.accent, 0.45) }}
          thumbColor={checked ? colors.accent : colors.muted}
        />
      </View>
    </View>
  );
}
