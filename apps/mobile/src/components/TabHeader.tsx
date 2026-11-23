import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ProfileIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Your account, from the top-right of every main screen. Signed in: your picture, or your
    first letter. Signed out: a "Sign in" pill, so whether you're signed in shows at a glance. Either way it
    opens Account (profile, settings, theme, signing in). */
export function AccountButton() {
  const router = useRouter();
  const { colors, derived } = useAppTheme();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : 'skip');
  const user = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const avatarUrl = isAuthenticated ? profile?.avatarUrl : null;
  const initial = isAuthenticated
    ? (profile?.username ?? user?.name ?? user?.email ?? '').replace(/^@/, '').charAt(0).toUpperCase()
    : '';
  if (!isAuthenticated && !isLoading) {
    return (
      <Pressable
        onPress={() => router.push('/profile')}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
        hitSlop={6}
        android_ripple={{ color: colors['surface-hover'] }}
        className="h-10 justify-center overflow-hidden rounded-full px-4"
        style={{ backgroundColor: derived.fill }}
      >
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          Sign in
        </Text>
      </Pressable>
    );
  }
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
      ) : initial ? (
        // Your first letter, as on the Account card and in Community.
        <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
          {initial}
        </Text>
      ) : (
        <ProfileIcon color={colors.foreground} size={24} />
      )}
    </Pressable>
  );
}

/** The top of a main (tab) screen: its name, any actions, and the account button. `scrolled` draws
    a hairline under it once the page has scrolled, so content doesn't slide under it unseen. */
export function TabHeader({ title, right, scrolled }: { title: string; right?: ReactNode; scrolled?: boolean }) {
  const { colors, derived } = useAppTheme();
  return (
    <View
      className="h-14 flex-row items-center gap-2 px-4"
      // Always 1px (transparent at the top), so the line appearing doesn't move anything.
      style={{ borderBottomWidth: 1, borderBottomColor: scrolled ? derived.hairline : 'transparent' }}
    >
      <Text numberOfLines={1} className="font-ui-extrabold flex-1 text-[28px] font-extrabold tracking-tight" style={{ color: colors.foreground }}>
        {title}
      </Text>
      {right}
      <AccountButton />
    </View>
  );
}

/** The Library's parts, each its own screen, switched with the tabs under the Library header.
    Recordings are in Files (its Recordings filter), as on the website. */
export const LIBRARY_TABS = [
  { href: '/library', label: 'Tunes' },
  { href: '/library/setlists', label: 'Setlists' },
  { href: '/charts', label: 'Charts' },
  { href: '/files', label: 'Files' },
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
        {/* Lined up with the page's 16dp gutter, the underline only as wide as the name (the Shed
            Log's tabs). */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 24 }}>
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
                className="h-11 justify-center"
                style={{ borderBottomWidth: 3, borderBottomColor: active ? colors.accent : 'transparent', marginBottom: -1 }}
              >
                {/* The bold label always sets the width (hidden when not picked), so switching tabs
                    doesn't nudge the row sideways. */}
                <View>
                  <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground, opacity: active ? 1 : 0 }}>
                    {tab.label}
                  </Text>
                  {active ? null : (
                    <Text className="font-ui absolute left-0 right-0 text-center text-[15px]" style={{ color: colors.muted }}>
                      {tab.label}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
