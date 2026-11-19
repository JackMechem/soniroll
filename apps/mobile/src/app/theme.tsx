import { MORE_PRESETS, PRESETS, type ThemePreset } from '@jam-practice/core/themes';
import { Pressable, SectionList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';

/**
 * A native port of `ThemeModal.tsx`'s own two-tier structure (`PRESETS`, the small quick-pick
 * set, then "more themes" — `MORE_PRESETS` — below it) rather than its exact grid/modal
 * presentation: a full screen (reached from Home's own palette button) instead of a popover,
 * since this app doesn't have a modal-sheet primitive wired up yet and a full screen is the more
 * natural native shape for "pick one of 30 things" anyway. The custom-theme color editor isn't
 * ported — see `ThemeProvider.tsx`'s own doc comment for the full list of what's deferred.
 *
 * **Redesigned** per a direct report ("this looks really ugly") — the original version filled
 * each entire row with *that preset's own* colors, which read as visually chaotic (a white row
 * next to a near-black row next to a tan row, with no consistent list language tying them
 * together), and had a loud, fully-accent-filled selected row. Every row now uses the *app's own
 * current* surface/foreground colors uniformly — only the four small swatch dots preview each
 * preset's own palette, which is the actual point of a theme picker, rather than recoloring the
 * whole row and fighting for attention with its neighbors. The selected row gets a quiet accent
 * border and a plain checkmark (the app's own `CheckIcon`) instead of a solid accent fill. Section
 * headers also dropped the all-caps/tracking-wide treatment to match the rest of the app's own
 * "Capitalized words, not shouting caps" convention adopted elsewhere.
 */
function ThemeScreen() {
  const { presetId, setPreset, colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const active = [...PRESETS, ...MORE_PRESETS].find((p) => p.id === presetId);

  const sections = [
    { title: 'Themes', data: PRESETS },
    { title: 'More themes', data: MORE_PRESETS },
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderSectionHeader={({ section }) => (
          <Text className="mb-2 mt-4 text-lg font-bold font-ui-bold" style={{ color: colors.foreground }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <PresetRow preset={item} selected={item.id === presetId} onPress={() => setPreset(item.id)} />
        )}
      />
      {/* A card of the *currently active* theme's own colors, pinned to the bottom — confirms at a
          glance that picking a preset above actually re-themed the app live, not just this list. */}
      {active ? (
        <View
          className="mx-4 flex-row items-center gap-3 rounded-xl p-4"
          style={{
            backgroundColor: colors.surface,
            marginBottom: insets.bottom + 16,
          }}
        >
          <View className="flex-row -space-x-1.5">
            <Swatch color={active.colors.background} />
            <Swatch color={active.colors.surface} />
            <Swatch color={active.colors.accent} />
            <Swatch color={active.colors.foreground} />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-ui" style={{ color: colors.muted }}>
              Active theme
            </Text>
            <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
              {active.label}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PresetRow({
  preset,
  selected,
  onPress,
}: {
  preset: ThemePreset;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between rounded-2xl border p-3"
      style={{
        backgroundColor: colors.surface,
        borderColor: selected ? colors.accent : colors['surface-hover'],
        borderWidth: selected ? 2 : 1,
      }}
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-row -space-x-1.5">
          <Swatch color={preset.colors.background} />
          <Swatch color={preset.colors.surface} />
          <Swatch color={preset.colors.accent} />
          <Swatch color={preset.colors.foreground} />
        </View>
        <Text className="text-[15px] font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
          {preset.label}
        </Text>
      </View>
      {selected ? <CheckIcon color={colors.accent} size={18} /> : null}
    </Pressable>
  );
}

function Swatch({ color }: { color: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      className="h-6 w-6 rounded-full border-2"
      style={{ backgroundColor: color, borderColor: colors.surface }}
    />
  );
}

export default withScreenLoader(ThemeScreen);
