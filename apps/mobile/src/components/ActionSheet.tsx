import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { useAppTheme } from '@/theme/ThemeProvider';

export type SheetAction = { key: string; icon: ReactNode; label: string; onPress: () => void; danger?: boolean };

/** A bottom sheet of big, thumb-reachable action rows under a title — the shape every ⋮ menu in
    the app uses, in the same floating card over a dimmed page as the options sheets
    (`BottomSheet`). Tapping an action closes the sheet first, then runs the action. */
export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { height } = useWindowDimensions();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingBottom: 8 }}>
        {title ? (
          <View className="gap-0.5 px-5 pb-3 pt-4">
            <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        {title ? <View style={{ height: 1, backgroundColor: colors['surface-hover'] }} /> : null}
        <ScrollView style={{ maxHeight: height * 0.6 }} contentContainerStyle={{ paddingVertical: 4 }}>
          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              android_ripple={{ color: colors['surface-hover'] }}
              className="flex-row items-center gap-3 px-5"
              style={{ minHeight: 54 }}
            >
              {a.icon}
              <Text className="font-ui-semibold flex-1 text-base font-semibold" style={{ color: a.danger ? colors.danger : colors.foreground }}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
