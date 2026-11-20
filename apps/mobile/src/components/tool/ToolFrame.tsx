import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Every tool screen's layout, the same order on every tool, with what you press within reach of
 * your thumb (the style guide: tool screens don't scroll):
 *
 * - `mode` — the mode switch (One meter / Changing meters, Practice / Learn), first, under the
 *   header: it decides what the rest of the screen is.
 * - `side` — the History / Struggles chips (a `SettingsBar`).
 * - `children` — the main display. It takes the space between and sits in the middle of it; it
 *   only scrolls (as a last resort) when a very short screen can't fit it. A display that scrolls
 *   by itself (a score, a chart) passes `scroll={false}` and brings its own `ScrollView`, which
 *   then gets exactly that space.
 * - `below` — something pinned under the display, above the footer (an answer keyboard).
 * - The footer, fixed above the bottom inset: `action` (the big Start / Play button) and then
 *   `chips` (the setting chips, a `SettingsBar`).
 */
export function ToolFrame({
  title,
  mode,
  side,
  children,
  below,
  action,
  chips,
  scroll = true,
  gap = 16,
}: {
  /** Sets the header's title (leave out when the screen sets it itself). */
  title?: string;
  mode?: ReactNode;
  side?: ReactNode;
  children?: ReactNode;
  below?: ReactNode;
  action?: ReactNode;
  chips?: ReactNode;
  scroll?: boolean;
  /** The space between the display's own pieces. */
  gap?: number;
}) {
  const { colors } = useAppTheme();
  const top = mode || side;
  const footer = action || chips;
  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {title ? <Stack.Screen options={{ title }} /> : null}
      <SafeAreaView className="flex-1" edges={['bottom']}>
        {top ? (
          <View className="items-center gap-3 px-4 pt-4">
            {mode ? <View className="w-full items-center">{mode}</View> : null}
            {side}
          </View>
        ) : null}
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap }}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
        {below}
        {footer ? (
          <View className="gap-3 px-4 pb-3 pt-2">
            {action}
            {chips}
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
