import { Modal, StatusBar, type ModalProps } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A full-screen `Modal` (pickers, viewers) whose status bar matches the theme. On Android a Modal
 * is its own window, so the app's root `<StatusBar>` doesn't reach it: without this, the clock
 * and icons were white on light themes. The style is set again once the window is showing, since
 * the modal's window only takes status bar changes after it exists.
 */
export function FullScreenModal({ onShow, children, ...props }: ModalProps) {
  const { derived } = useAppTheme();
  const barStyle = derived.isDark ? 'light-content' : 'dark-content';
  return (
    <Modal
      animationType="slide"
      {...props}
      onShow={(e) => {
        StatusBar.setBarStyle(barStyle);
        onShow?.(e);
      }}
    >
      <StatusBar barStyle={barStyle} />
      {children}
    </Modal>
  );
}
