import { useConvexAuth } from '@convex-dev/auth/react';
import { NAV_LINKS_DATA, filterNavLinks, hrefToSlug, type NavLinkInfo } from '@jam-practice/core/navLinks';
import type { Href } from 'expo-router';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { LockIcon, StarIcon } from '@/components/icons';
import { SectionHeader, ToolIcon } from '@/components/ui';
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
export function useLocked(href: string) {
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
  const name = toolName(item);
  // A one-word name shrinks to fit its line rather than breaking mid-word ("Metronom / e") when the
  // phone's text is large; longer names wrap at their spaces. Only then: Android shrinks a fitted
  // line even when it fits, so at the normal size "Metronome" came out smaller than "Practice Timer".
  const { fontScale } = useWindowDimensions();
  const shrink = !name.includes(' ') && fontScale > 1.1;
  return (
    <View className="flex-row items-center gap-1.5">
      <Text
        numberOfLines={shrink ? 1 : lines}
        adjustsFontSizeToFit={shrink}
        minimumFontScale={0.7}
        className={className}
        style={{ color: colors.foreground, flexShrink: 1 }}
      >
        {name}
      </Text>
      {locked ? (
        <View accessibilityLabel="Needs an account">
          <LockIcon color={colors.muted} size={14} />
        </View>
      ) : null}
    </View>
  );
}

/** What a tool does in one short line (its `blurb`; the description when there isn't one). */
export function toolBlurb(item: NavLinkInfo): string {
  return item.blurb ?? item.description;
}

/** A tool in a list: its icon in its category colour, its name, what it does in one short muted
    line, and the favorite star. Without `onToggleFavorite` (a shortcut to a tab) there's no star.
    Rows sit directly on a surface section (`ToolSection`), a hairline between them — `divider`
    draws the one above this row. */
export function ToolRow({
  item,
  favorited = false,
  onPress,
  onToggleFavorite,
  divider,
}: {
  item: NavLinkInfo;
  favorited?: boolean;
  onPress: () => void;
  onToggleFavorite?: () => void;
  divider?: boolean;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={toolBlurb(item)}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[60px] flex-row items-center gap-3 py-2.5 pl-3"
      style={{ paddingRight: onToggleFavorite ? 0 : 12, borderTopWidth: divider ? 1 : 0, borderTopColor: derived.hairline }}
    >
      <ToolIcon tool={item} size={34} />
      <View className="flex-1 gap-0.5">
        <ToolName item={item} lines={1} className="font-ui-semibold text-[15px] font-semibold" />
        <Text numberOfLines={1} className="font-ui text-[13px] leading-4" style={{ color: colors.muted }}>
          {toolBlurb(item)}
        </Text>
      </View>
      {onToggleFavorite ? <FavoriteStar item={item} favorited={favorited} onToggle={onToggleFavorite} /> : null}
    </Pressable>
  );
}

/** A group of tools: its name as a plain label, then the rows on one surface section with
    hairlines between them (no filled rows inside a filled card). */
export function ToolSection({
  title,
  items,
  favorites,
  onOpen,
  onToggleFavorite,
}: {
  title: string;
  items: NavLinkInfo[];
  /** Starred hrefs; leave out for rows without a star (shortcuts to the tabs). */
  favorites?: string[];
  onOpen: (item: NavLinkInfo) => void;
  onToggleFavorite?: (href: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1.5">
      <SectionHeader title={title} />
      <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
        {items.map((item, i) => (
          <ToolRow
            key={item.href}
            item={item}
            divider={i > 0}
            favorited={favorites?.includes(item.href)}
            onPress={() => onOpen(item)}
            onToggleFavorite={favorites && onToggleFavorite ? () => onToggleFavorite(item.href) : undefined}
          />
        ))}
      </View>
    </View>
  );
}

/** Exactly half a row each (less the gap), whatever the names: `flex-1` alone let a lone last
    tile beside an empty spacer come out wider than the ones above it. */
const HALF = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 } as const;

/** A tool as a compact tile in the Favorites grid (two to a row): its icon, its name and the star
    on one line, about half the height of the old cards. */
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
      className="min-h-[56px] flex-row items-center gap-2.5 overflow-hidden rounded-xl py-2 pl-3"
      style={[HALF, { backgroundColor: colors.surface }]}
    >
      <ToolIcon tool={item} size={32} />
      <View className="flex-1">
        <ToolName item={item} lines={2} className="font-ui-semibold text-[14px] font-semibold leading-[18px]" />
      </View>
      <View style={{ marginLeft: -6 }}>
        <FavoriteStar item={item} favorited={favorited} onToggle={onToggleFavorite} />
      </View>
    </Pressable>
  );
}

/** Tools as a grid of compact tiles, two to a row. */
export function ToolTiles({
  items,
  favorites,
  onOpen,
  onToggleFavorite,
}: {
  items: NavLinkInfo[];
  favorites: string[];
  onOpen: (item: NavLinkInfo) => void;
  onToggleFavorite: (href: string) => void;
}) {
  return (
    <View className="gap-2.5">
      {chunk(items, 2).map((row, i) => (
        <View key={i} className="flex-row gap-2.5">
          {row.map((item) => (
            <ToolTile key={item.href} item={item} favorited={favorites.includes(item.href)} onPress={() => onOpen(item)} onToggleFavorite={() => onToggleFavorite(item.href)} />
          ))}
          {row.length === 1 ? <View style={HALF} /> : null}
        </View>
      ))}
    </View>
  );
}
