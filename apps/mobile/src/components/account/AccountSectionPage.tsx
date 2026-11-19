import { useConvexAuth } from '@convex-dev/auth/react';
import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { InfoButton } from '@/components/InfoButton';
import { ScreenSpinner } from '@/components/ScreenLoader';
import { useAppTheme } from '@/theme/ThemeProvider';

/** The shared shell for one account section opened from the Profile list (`app/profile.tsx`) as
    its own page: the section's title in the header (plus an optional ⓘ with its description), and
    the section's content in a scrolling page. Guards against being reached signed out (e.g. via
    back-navigation right after signing out). */
export function AccountSectionPage({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const { isLoading, isAuthenticated } = useConvexAuth();
  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title,
          headerRight: info ? () => <InfoButton title={title} text={info} size={22} /> : undefined,
        }}
      />
      {isLoading ? (
        <ScreenSpinner />
      ) : !isAuthenticated ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
            You&apos;re signed out.
          </Text>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: bottomSpace, gap: 16 }}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}
