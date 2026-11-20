import { useConvexAuth } from '@convex-dev/auth/react';
import { NAV_LINKS_DATA, filterNavLinks, hrefToSlug, type NavLinkInfo } from '@jam-practice/core/navLinks';
import type { Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { LockIcon, StarIcon } from '@/components/icons';
import { ToolIcon } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

/** The Library (tunes), its Charts, the Shed Log and Community are main screens with their own tabs
    in `FloatingTabBar`, so the tool lists leave them out (search still finds them, as shortcuts). */
export const TAB_HREFS = ['/community', '/chord-charts', '/tunes', '/shed-log'];

/** Where each tab tool lives in the app, for search shortcuts. */
const TAB_ROUTES: Record<string, Href> = {
  '/tunes': '/library',
  '/chord-charts': '/charts',
  '/community': '/tool/community',
  '/shed-log': '/tool/shed-log',
};

/** Every tool that isn't a tab, in the website's order. */
export const TOOL_LINKS = NAV_LINKS_DATA.filter((l) => !TAB_HREFS.includes(l.href));

/** The tab tools, found by search as shortcuts. */
export const SHORTCUT_LINKS = NAV_LINKS_DATA.filter((l) => TAB_HREFS.includes(l.href));

/** The tools most people reach for every day, first on the Tools tab. */
export const EVERYDAY_HREFS = ['/metronome', '/tuner', '/recorder', '/practice-timer', '/jam-practice'];

/** Tools that only work signed in (each shows what it is and Sign in otherwise): a lock shows on
    them while signed out. */
export const ACCOUNT_ONLY_HREFS = new Set(['/shed-log', '/shed-notes', '/lessons', '/recorder', '/community']);

/** The app route that opens a tool, or a tab for a tab tool. */
export function toolRoute(href: string): Href {
  return TAB_ROUTES[href] ?? (`/tool/${hrefToSlug(href)}` as Href);
}

/** Search: matching tools, and the tabs (Library, Chord Charts, Community, Shed Log) as shortcuts. */
export function searchTools(query: string) {
  return { tools: filterNavLinks(TOOL_LINKS, query), shortcuts: filterNavLinks(SHORTCUT_LINKS, query) };
}

/** The name to show in a list: the short name when the full one is long ("Metric Modulation" for
    "Polyrhythm Metric Modulation Metronome"). Titles elsewhere keep the full name. */
export function toolName(item: NavLinkInfo): string {
  return item.short && item.label.length > 21 ? item.short : item.label;
}

/** Splits a list into fixed-size rows for the Favorites grid. */
export function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** Signed out and the tool needs an account. */
function useLocked(href: string) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  return ACCOUNT_ONLY_HREFS.has(href) && !isAuthenticated && !isLoading;
}

/** The star that pins a tool to Favorites (the account's signed in, this phone's signed out). */
function FavoriteStar({ item, favorited, onToggle }: { item: NavLinkInfo; favorited: boolean; onToggle: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={favorited ? `Unfavorite ${item.label}` : `Favorite ${item.label}`}
      className="h-11 w-11 items-center justify-center"
    >
      <StarIcon color={favorited ? colors.accent : colors.muted} size={18} filled={favorited} />
    </Pressable>
  );
}

/** A tool's name with a small lock after it when it needs an account and you're signed out. */
function ToolName({ item, lines, className }: { item: NavLinkInfo; lines: number; className: string }) {
  const { colors } = useAppTheme();
  const locked = useLocked(item.href);
  return (
    <View className="flex-row items-center gap-1.5">
      <Text numberOfLines={lines} className={className} style={{ color: colors.foreground, flexShrink: 1 }}>
        {toolName(item)}
      </Text>
      {locked ? (
        <View accessibilityLabel="Needs an account">
          <LockIcon color={colors.muted} size={14} />
        </View>
      ) : null}
    </View>
  );
}

/** A tool in a list: its icon in its category colour, its name, what it does in a muted line or
    two, and the favorite star. Without `onToggleFavorite` (a shortcut to a tab) there's no star. */
export function ToolRow({
  item,
  favorited = false,
  onPress,
  onToggleFavorite,
}: {
  item: NavLinkInfo;
  favorited?: boolean;
  onPress: () => void;
  onToggleFavorite?: () => void;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[60px] flex-row items-center gap-3 overflow-hidden rounded-lg py-2.5 pl-3"
      style={{ backgroundColor: derived.fill, paddingRight: onToggleFavorite ? 0 : 12 }}
    >
      <ToolIcon tool={item} size={34} />
      <View className="flex-1 gap-0.5">
        <ToolName item={item} lines={1} className="font-ui-semibold text-[15px] font-semibold" />
        <Text numberOfLines={2} className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
          {item.description}
        </Text>
      </View>
      {onToggleFavorite ? <FavoriteStar item={item} favorited={favorited} onToggle={onToggleFavorite} /> : null}
    </Pressable>
  );
}

/** A tool as a card in the Favorites grid. */
export function ToolTile({
  item,
  favorited,
  onPress,
  onToggleFavorite,
}: {
  item: NavLinkInfo;
  favorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[108px] flex-1 justify-between overflow-hidden rounded-xl p-3.5"
      style={{ backgroundColor: colors.surface }}
    >
      <View className="flex-row items-start justify-between">
        <ToolIcon tool={item} size={40} />
        <View style={{ marginTop: -6, marginRight: -8 }}>
          <FavoriteStar item={item} favorited={favorited} onToggle={onToggleFavorite} />
        </View>
      </View>
      <View className="mt-3">
        <ToolName item={item} lines={2} className="font-ui-semibold text-[15px] font-semibold leading-5" />
      </View>
    </Pressable>
  );
}
