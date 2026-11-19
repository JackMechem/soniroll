import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ProfileIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Your account, from the top-right of every main screen: your picture once you're signed in and
    have one, otherwise a person icon. Opens Account (profile, settings, theme, signing in). */
export function AccountButton() {
  const router = useRouter();
  const { colors, derived } = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : 'skip');
  const avatarUrl = isAuthenticated ? profile?.avatarUrl : null;
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      accessibilityRole="button"
      accessibilityLabel="Account"
      hitSlop={6}
      className="h-10 w-10 items-center justify-center overflow-hidden rounded-full"
      style={{ backgroundColor: derived.fill }}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} contentFit="cover" style={{ width: 40, height: 40 }} />
      ) : (
        <ProfileIcon color={colors.foreground} size={24} />
      )}
    </Pressable>
  );
}

/** The top of a main (tab) screen: its name, any actions, and the account button. */
export function TabHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="h-14 flex-row items-center gap-2 px-4">
      <Text numberOfLines={1} className="font-ui-extrabold flex-1 text-[28px] font-extrabold tracking-tight" style={{ color: colors.foreground }}>
        {title}
      </Text>
      {right}
      <AccountButton />
    </View>
  );
}

/** The Library's parts, each its own screen, switched with the tabs under the Library header (as on
    the website's Library page). */
export const LIBRARY_TABS = [
  { href: '/library', label: 'Tunes' },
  { href: '/library/setlists', label: 'Setlists' },
  { href: '/charts', label: 'Charts' },
  { href: '/recordings', label: 'Recordings' },
] as const satisfies readonly { href: Href; label: string }[];

/** The Library header: the title, actions for this part, and the tabs. */
export function LibraryHeader({ right }: { right?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { colors, derived } = useAppTheme();
  return (
    <View>
      <TabHeader title="Library" right={right} />
      <View style={{ borderBottomWidth: 1, borderBottomColor: derived.hairline }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {LIBRARY_TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Pressable
                key={tab.href}
                onPress={() => {
                  if (!active) router.replace(tab.href);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className="h-11 justify-center px-3"
                style={{ borderBottomWidth: 2, borderBottomColor: active ? colors.foreground : 'transparent', marginBottom: -1 }}
              >
                <Text
                  className={`text-[15px] ${active ? 'font-ui-semibold font-semibold' : 'font-ui'}`}
                  style={{ color: active ? colors.foreground : colors.muted }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
