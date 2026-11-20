import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sheetEdge } from '@/components/sheetStyle';
import { useAppTheme } from '@/theme/ThemeProvider';

export type SheetAction = { key: string; icon: ReactNode; label: string; onPress: () => void; danger?: boolean };

/** A bottom sheet of big, thumb-reachable action rows under a title — the shape every ⋮ menu in
    the app uses. Tapping an action closes the sheet first, then runs the action. */
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
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={{ ...sheetEdge(colors), backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 12 }}>
        <View className="items-center pt-2.5">
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors['surface-hover'] }} />
        </View>
        {title ? (
          <View className="gap-0.5 px-5 pb-3 pt-3">
            <Text numberOfLines={1} className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={{ height: 1, backgroundColor: colors['surface-hover'] }} />
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
    </Modal>
  );
}
