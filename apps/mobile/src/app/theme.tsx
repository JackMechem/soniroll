import { MORE_PRESETS, PRESETS, getPreset, type ThemeColors } from '@jam-practice/core/themes';
import { Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckIcon } from '@/components/icons';
import { SYSTEM_THEME_ID, useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';

/**
 * Theme: "Same as my phone" first (the default — Light or Dark from the phone's setting), then the
 * quick-pick presets and the rest (`@jam-practice/core/themes`, the website's list). Every row is
 * drawn in the app's current colours; only its four swatches (background, surface, accent, text)
 * preview the theme. The selected row has an accent ring and a tick, the same size as the others
 * so nothing shifts. The custom-theme colour editor isn't ported (see `ThemeProvider.tsx`).
 */
function ThemeScreen() {
  const { presetId, setPreset, colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const phone = getPreset(scheme)!;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 8 }}
    >
      <ThemeRow
        label="Same as my phone"
        detail={`Light or Dark, as your phone is set (${phone.label} now)`}
        swatches={phone.colors}
        selected={presetId === SYSTEM_THEME_ID}
        onPress={() => setPreset(SYSTEM_THEME_ID)}
      />
      {(
        [
          ['Themes', PRESETS],
          ['More themes', MORE_PRESETS],
        ] as const
      ).map(([title, presets]) => (
        <View key={title} className="gap-2">
          <Text className="font-ui-semibold mt-4 px-1 text-[15px] font-semibold" style={{ color: colors.foreground }}>
            {title}
          </Text>
          {presets.map((p) => (
            <ThemeRow key={p.id} label={p.label} swatches={p.colors} selected={p.id === presetId} onPress={() => setPreset(p.id)} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function ThemeRow({
  label,
  detail,
  swatches,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  swatches: ThemeColors;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[56px] flex-row items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5"
      // The ring is always 2px (transparent when not selected), so picking a row doesn't move it.
      style={{ backgroundColor: colors.surface, borderWidth: 2, borderColor: selected ? colors.accent : 'transparent' }}
    >
      <Swatches colors={swatches} />
      <View className="flex-1">
        <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
          {label}
        </Text>
        {detail ? (
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View className="w-5 items-center">{selected ? <CheckIcon color={colors.accent} size={18} /> : null}</View>
    </Pressable>
  );
}

/** Four overlapping dots in fixed slots: background, surface, accent, text. Each has a 1px hairline
    ring so a dot the same colour as the row still shows. */
function Swatches({ colors: c }: { colors: ThemeColors }) {
  const { derived } = useAppTheme();
  const dots = [c.background, c.surface, c.accent, c.foreground];
  return (
    <View className="flex-row" style={{ width: 22 * 4 - 6 * 3 }}>
      {dots.map((color, i) => (
        <View
          key={i}
          className="h-[22px] w-[22px] rounded-full"
          style={{ backgroundColor: color, borderWidth: 1, borderColor: derived.hairline, marginLeft: i ? -6 : 0 }}
        />
      ))}
    </View>
  );
}

export default withScreenLoader(ThemeScreen);
