import type { Tune } from '@jam-practice/core/types';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChordChartIcon, DotsVerticalIcon } from '@/components/icons';
import { tuneSummary } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

export const TUNE_ROW_H = 64;

/** One tune in the Library: name, keys · tempos · time signature, a chart icon when it has a
    linked chord chart, and ⋮ (or long-press) for everything you can do with it. */
export const TuneRow = memo(function TuneRow({
  tune,
  onPress,
  onMenu,
}: {
  tune: Tune;
  onPress: () => void;
  onMenu: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center" style={{ height: TUNE_ROW_H }}>
      <Pressable
        onPress={onPress}
        onLongPress={onMenu}
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-1 justify-center rounded-xl px-3"
        style={{ height: TUNE_ROW_H - 4 }}
      >
        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="font-ui-semibold flex-shrink text-base font-semibold" style={{ color: colors.foreground }}>
            {tune.name}
          </Text>
          {tune.chordChartId ? <ChordChartIcon color={colors.accent} size={15} /> : null}
        </View>
        <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
          {tuneSummary(tune)}
        </Text>
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
