import { forwardRef } from 'react';
import { TextInput as RNTextInput, type TextInputProps } from 'react-native';

import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * React Native's `TextInput` with the theme's accent for the cursor, the selection and Android's
 * selection handles (the native app theme has no accent, so Android drew them in its default
 * teal on every theme). Import this as `TextInput` instead of the one from 'react-native'; a
 * caller's own colours still win.
 */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function ThemedTextInput(props, ref) {
  const { colors } = useAppTheme();
  return (
    <RNTextInput
      ref={ref}
      cursorColor={colors.accent}
      selectionColor={withAlpha(colors.accent, 0.35)}
      selectionHandleColor={colors.accent}
      {...props}
    />
  );
});

/** The native input's instance type, for refs (`useRef<TextInput>(null)`) — the same name as the
    component on purpose, as React Native's own `TextInput` is both. */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type TextInput = RNTextInput;
