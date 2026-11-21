import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetSlide } from '@/components/tool/SettingChip';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * The frame of a bottom sheet, the same look as a tool's options sheet (`ToolSheet`): a card that
 * floats a little in from the screen's edges and slides up over a dimmed page. Tapping the dimmed
 * part closes it. The ⋮ menus (`ActionSheet`) and the other small pick-one sheets use it, so the
 * app has one sheet look.
 */
export function BottomSheet({
  visible,
  onClose,
  maxHeight = '80%',
  children,
}: {
  visible: boolean;
  onClose: () => void;
  maxHeight?: DimensionValue;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    // The Modal fades the backdrop in and `SheetSlide` slides the card up (see `ToolSheet` for why
    // the card sits in the normal layout rather than absolutely positioned).
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.overlay, 0.6) }]} onPress={onClose} accessibilityLabel="Close" />
        <SheetSlide
          style={{
            marginHorizontal: 12,
            marginBottom: insets.bottom + 12,
            maxHeight,
            borderRadius: 24,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            elevation: 16,
          }}
        >
          {children}
        </SheetSlide>
      </View>
    </Modal>
  );
}
