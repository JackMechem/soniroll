import { Modal, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/** The native sibling of `apps/web/components/ConfirmDialog.tsx` — a real `Modal` instead of a
    `fixed inset-0` overlay div, same shape otherwise (title, message, Cancel/destructive-confirm
    pair). Reused by the account page's own delete-account flow and tune deletion. `safe`: the
    confirm button is the accent, not red, for something that loses nothing (signing out). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  safe,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  safe?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={{ flex: 1, backgroundColor: `${colors.overlay}99`, justifyContent: 'center', padding: 24 }}
        onPress={onCancel}
      >
        <Pressable onPress={() => {}} className="gap-4 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
          <View className="gap-1.5">
            <Text className="text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
              {title}
            </Text>
            <Text className="text-sm font-ui" style={{ color: colors.muted }}>
              {message}
            </Text>
          </View>
          <View className="flex-row justify-end gap-2">
            <Pressable
              onPress={onCancel}
              className="rounded-xl px-4 py-2"
              style={{ backgroundColor: colors.background }}
            >
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="rounded-xl px-4 py-2"
              style={{ backgroundColor: safe ? colors.accent : colors.danger }}
            >
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: safe ? colors['accent-foreground'] : colors.background }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
