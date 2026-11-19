import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/ThemeProvider';

/** A small "type a name" dialog pinned near the top of the screen, so the keyboard opens below it
    instead of over it — creating or renaming a setlist, a playlist, etc. */
export function NameDialog({
  visible,
  title,
  initialValue = '',
  placeholder,
  confirmLabel = 'Save',
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setValue(initialValue);
  }
  const ok = value.trim().length > 0;
  function submit() {
    if (!ok) return;
    onSubmit(value.trim());
    onClose();
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: `${colors.overlay}99`, paddingTop: insets.top + 72, paddingHorizontal: 20 }} onPress={onClose}>
        <Pressable onPress={() => {}} className="gap-3 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
          <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
            {title}
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            className="font-ui text-base"
            style={{ backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: colors.foreground }}
          />
          <View className="flex-row justify-end gap-2">
            <Pressable onPress={onClose} className="rounded-xl px-4 py-2.5" style={{ backgroundColor: colors.background }}>
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable onPress={submit} disabled={!ok} className="rounded-xl px-4 py-2.5" style={{ backgroundColor: colors.accent, opacity: ok ? 1 : 0.4 }}>
              <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
