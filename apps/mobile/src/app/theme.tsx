import { MORE_PRESETS, PRESETS, getPreset, type ThemeColors } from '@jam-practice/core/themes';
import { Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckIcon } from '@/components/icons';
import { SectionHeader } from '@/components/ui';
import { SYSTEM_THEME_ID, useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';

/**
 * Theme: "Same as my phone" first (the default — Light or Dark from the phone's setting), then the
 * quick-pick presets and the rest (`@jam-practice/core/themes`, the website's list) as a two-column
 * grid of swatch cards: each card shows a small preview drawn in that theme's own colours (its
 * background, a surface bar, the accent and the text) with the name under it. The picked card has
 * an accent ring and a tick (the ring is always there, transparent, so nothing shifts). Every edge
 * is the foreground at 20% — a hairline was too faint to see a white swatch on a white card. The
 * custom-theme colour editor isn't ported (see `ThemeProvider.tsx`).
 */
function ThemeScreen() {
  const { presetId, setPreset, colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const phone = getPreset(scheme)!;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 20 }}
    >
      <ThemeCard
        wide
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
        <View key={title} className="gap-1.5">
          <SectionHeader title={title} />
          <View className="flex-row flex-wrap justify-between" style={{ rowGap: 10 }}>
            {presets.map((p) => (
              <ThemeCard key={p.id} label={p.label} swatches={p.colors} selected={p.id === presetId} onPress={() => setPreset(p.id)} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** A theme as a card: its preview, then its name (and a tick when picked). `wide` is the full-width
    "Same as my phone" card, with a line under the name. */
function ThemeCard({
  label,
  detail,
  swatches,
  selected,
  wide,
  onPress,
}: {
  label: string;
  detail?: string;
  swatches: ThemeColors;
  selected: boolean;
  wide?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="gap-2 overflow-hidden rounded-xl p-2.5"
      style={{ width: wide ? '100%' : '48.5%', backgroundColor: colors.surface, borderWidth: 2, borderColor: selected ? colors.accent : 'transparent' }}
    >
      <Preview colors={swatches} />
      <View className="min-h-[22px] flex-row items-center gap-1.5 px-0.5">
        <View className="flex-1">
          <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {label}
          </Text>
          {detail ? (
            <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
              {detail}
            </Text>
          ) : null}
        </View>
        {selected ? <CheckIcon color={colors.accent} size={18} /> : null}
      </View>
    </Pressable>
  );
}

/** The theme in miniature: its background, a surface bar with a line of text, and dots for the
    accent and the text colour. The frame's edge is this app's foreground at 20% (so a swatch the
    card's own colour still shows); inside, edges use the previewed theme's own foreground at 20%. */
function Preview({ colors: c }: { colors: ThemeColors }) {
  const { colors } = useAppTheme();
  const ring = withAlpha(c.foreground, 0.2);
  return (
    <View className="h-[64px] justify-between rounded-lg p-2" style={{ backgroundColor: c.background, borderWidth: 1, borderColor: withAlpha(colors.foreground, 0.2) }}>
      <View className="h-[22px] flex-row items-center gap-1.5 rounded-md px-2" style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: ring }}>
        <View className="h-1.5 w-10 rounded-full" style={{ backgroundColor: c.foreground }} />
        <View className="h-1.5 w-6 rounded-full" style={{ backgroundColor: c.muted }} />
      </View>
      <View className="flex-row items-center gap-1.5">
        {[c.accent, c.foreground, c.surface].map((color, i) => (
          <View key={i} className="h-[18px] w-[18px] rounded-full" style={{ backgroundColor: color, borderWidth: 1, borderColor: ring }} />
        ))}
      </View>
    </View>
  );
}

export default withScreenLoader(ThemeScreen);
