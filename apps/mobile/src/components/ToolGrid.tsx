import type { NavLinkInfo } from '@jam-practice/core/navLinks';
import { Pressable, Text, View } from 'react-native';

import { StarIcon } from '@/components/icons';
import { ListRow, ToolIcon } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Community, Chord Charts and the tune library have their own tabs in `FloatingTabBar`, so Home's
    tool list leaves them out. */
export const TAB_HREFS = ['/community', '/chord-charts', '/tunes'];

/** Splits a list into fixed-size rows for the Favorites grid. */
export function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** The star that pins a tool to Favorites (account-only; signed out it still shows, so it's
    discoverable, but has nowhere to save). */
function FavoriteStar({ item, favorited, onToggle }: { item: NavLinkInfo; favorited: boolean; onToggle: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={10}
      accessibilityLabel={favorited ? `Unfavorite ${item.label}` : `Favorite ${item.label}`}
      className="h-8 w-8 items-center justify-center"
    >
      <StarIcon color={favorited ? colors.accent : colors.muted} size={18} filled={favorited} />
    </Pressable>
  );
}

/** A tool in a list: its icon in its category colour, its name, and the favorite star. */
export function ToolRow({
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
  return (
    <ListRow
      icon={<ToolIcon tool={item} size={34} />}
      title={item.label}
      onPress={onPress}
      right={<FavoriteStar item={item} favorited={favorited} onToggle={onToggleFavorite} />}
    />
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
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[108px] flex-1 justify-between overflow-hidden rounded-xl p-3.5"
      style={{ backgroundColor: colors.surface }}
    >
      <View className="flex-row items-start justify-between">
        <ToolIcon tool={item} size={40} />
        <FavoriteStar item={item} favorited={favorited} onToggle={onToggleFavorite} />
      </View>
      <Text className="font-ui-semibold mt-3 text-[15px] font-semibold leading-5" numberOfLines={2} style={{ color: colors.foreground }}>
        {item.label}
      </Text>
    </Pressable>
  );
}
