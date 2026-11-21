import { tuneChartIds, tuneTags } from '@jam-practice/core/tuneLibrary';
import type { Tune } from '@jam-practice/core/types';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChordChartIcon, DotsVerticalIcon } from '@/components/icons';
import { tuneSummary } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

export const TUNE_ROW_H = 64;

/** One tune in the Library, as a row of a grouped card (the setlist page's look: surface fill,
    a line between rows, round corners on the first and last): name, a chart mark (with a count when
    it has several), up to two tags, keys · tempos · time signature, and ⋮ (or long-press) for
    everything you can do with it. */
export const TuneRow = memo(function TuneRow({
  tune,
  first = true,
  last = true,
  onPress,
  onMenu,
}: {
  tune: Tune;
  /** Where it sits in its card (both true for a row on its own). */
  first?: boolean;
  last?: boolean;
  onPress: () => void;
  onMenu: () => void;
}) {
  const { colors, derived } = useAppTheme();
  const charts = tuneChartIds(tune).length;
  const tags = tuneTags(tune);
  const summary = tuneSummary(tune);
  return (
    <View
      className="flex-row items-center overflow-hidden"
      style={{
        height: TUNE_ROW_H,
        backgroundColor: colors.surface,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.background,
        borderTopLeftRadius: first ? 16 : 0,
        borderTopRightRadius: first ? 16 : 0,
        borderBottomLeftRadius: last ? 16 : 0,
        borderBottomRightRadius: last ? 16 : 0,
      }}
    >
      <Pressable onPress={onPress} onLongPress={onMenu} android_ripple={{ color: colors['surface-hover'] }} className="h-full flex-1 justify-center pl-4 pr-1">
        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="font-ui-semibold flex-shrink text-base font-semibold" style={{ color: colors.foreground }}>
            {tune.name}
          </Text>
          {charts ? (
            <View className="flex-row items-center">
              <ChordChartIcon color={colors.accent} size={15} />
              {charts > 1 ? (
                <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
                  {charts}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1.5">
          {tags.slice(0, 2).map((tag) => (
            <View key={tag} className="rounded-md px-1.5 py-px" style={{ backgroundColor: derived.fill, maxWidth: 120 }}>
              <Text numberOfLines={1} className="font-ui-semibold text-[11px] font-semibold" style={{ color: colors.muted }}>
                {tag}
              </Text>
            </View>
          ))}
          {summary ? (
            <Text numberOfLines={1} className="font-ui flex-shrink text-sm" style={{ color: colors.muted }}>
              {summary}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        onPress={onMenu}
        accessibilityLabel={`Options for ${tune.name}`}
        android_ripple={{ color: colors['surface-hover'], borderless: true, radius: 22 }}
        className="items-center justify-center"
        style={{ width: 44, height: 44 }}
      >
        <DotsVerticalIcon color={colors.muted} size={22} />
      </Pressable>
    </View>
  );
});
