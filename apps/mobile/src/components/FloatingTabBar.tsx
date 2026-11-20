import { usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeIcon, LibraryIcon, NAV_LINK_ICONS, ToolsIcon, UsersIcon, type IconProps } from '@/components/icons';
import { LIBRARY_TABS } from '@/components/TabHeader';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The bottom tab bar for the five main screens: Home, Tools, the Shed Log, Library and Community.
 * Your account is the button at the top right of each of them (`AccountButton`), not a tab.
 *
 * It shows only on those main screens (and the Library's other parts). Anything opened from them —
 * a tool, a tune, a chart, a post — covers the screen with a back button instead, so a tool gets
 * the whole screen (tool screens don't scroll).
 *
 * Edge to edge on the surface colour with a hairline on top, flush to the bottom of the screen (the
 * device's inset is padding inside it). Hand-built rather than `expo-router`'s `Tabs`: the app is
 * one flat `Stack`, and this is mounted once in `_layout.tsx` beside it so it stays put.
 */
const LIBRARY_HREFS: string[] = LIBRARY_TABS.map((t) => t.href);

const TABS = [
  { href: '/' as const, label: 'Home', Icon: HomeIcon, matches: ['/'] },
  { href: '/tools' as const, label: 'Tools', Icon: ToolsIcon, matches: ['/tools'] },
  { href: '/tool/shed-log' as const, label: 'Shed Log', Icon: NAV_LINK_ICONS['/shed-log'], matches: ['/tool/shed-log'] },
  { href: '/library' as const, label: 'Library', Icon: LibraryIcon, matches: LIBRARY_HREFS },
  { href: '/tool/community' as const, label: 'Community', Icon: UsersIcon, matches: ['/tool/community'] },
] satisfies { href: Href; label: string; Icon: React.ComponentType<IconProps>; matches: string[] }[];

const ROOTS = new Set(TABS.flatMap((t) => t.matches));

/** The bar's height above the device's bottom inset. */
export const TAB_BAR_CONTENT_HEIGHT = 56;

/** Whether the tab bar is on screen (only on the main screens). */
export function useTabBarVisible() {
  return ROOTS.has(usePathname());
}

/** Bottom padding for a scrolling page: the tab bar when it's showing, the device's bottom inset, and
    `extra` breathing room so the last item doesn't sit against the edge. */
export function useTabBarSpace(extra = 32) {
  const insets = useSafeAreaInsets();
  const visible = useTabBarVisible();
  return (visible ? TAB_BAR_CONTENT_HEIGHT : 0) + insets.bottom + extra;
}

export function FloatingTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors, derived } = useAppTheme();
  const insets = useSafeAreaInsets();

  if (!ROOTS.has(pathname)) return null;

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: derived.hairline,
      }}
    >
      {TABS.map(({ href, label, Icon, matches }) => {
        const active = matches.includes(pathname);
        return (
          <Pressable
            key={href}
            onPress={() => {
              if (!active) router.navigate(href);
            }}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            android_ripple={{ color: colors['surface-hover'], borderless: true }}
            className="flex-1 items-center justify-center gap-1"
          >
            <Icon color={active ? colors.accent : colors.muted} size={24} />
            <Text
              numberOfLines={1}
              className={`text-[11px] ${active ? 'font-ui-semibold font-semibold' : 'font-ui'}`}
              style={{ color: active ? colors.foreground : colors.muted }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
