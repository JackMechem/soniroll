import { useState } from 'react';
import { Modal, Pressable, Text } from 'react-native';

import { InfoIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A small ⓘ next to a label that opens a popup with that thing's description — the app's way of
 * explaining a setting without printing a paragraph under everything (a direct request: "dont put
 * description under everything, if something needs a description then put a little info icon
 * that gives a popup with the description").
 */
export function InfoButton({ title, text, size = 18 }: { title?: string; text: string; size?: number }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityLabel={title ? `About ${title}` : 'More info'}
        className="items-center justify-center"
      >
        <InfoIcon color={colors.muted} size={size} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: `${colors.overlay}99`, justifyContent: 'center', padding: 28 }}
          onPress={() => setOpen(false)}
        >
          <Pressable onPress={() => {}} className="gap-3 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
            {title ? (
              <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
                {title}
              </Text>
            ) : null}
            <Text className="font-ui text-base leading-6" style={{ color: colors.foreground }}>
              {text}
            </Text>
            <Pressable onPress={() => setOpen(false)} className="items-center self-end rounded-xl px-5 py-2.5" style={{ backgroundColor: colors.accent }}>
              <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                Got it
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
