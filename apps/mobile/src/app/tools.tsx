import { NAV_LINKS_DATA, filterNavLinks, groupByCategory, hrefToSlug, type NavLinkInfo } from '@jam-practice/core/navLinks';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { TabHeader } from '@/components/TabHeader';
import { TAB_HREFS, ToolRow, ToolTile, chunk } from '@/components/ToolGrid';
import { Card, EmptyText, SearchField } from '@/components/ui';
import { useFavorites } from '@/lib/useFavorites';
import { useAppTheme } from '@/theme/ThemeProvider';

const TOOLS = NAV_LINKS_DATA.filter((l) => !TAB_HREFS.includes(l.href));

/**
 * Tools — every practice tool in one place: a search, your favorites as cards, then each group in
 * its own card (the same groups and order as the website's sidebar), each tool in its category's
 * colour with a star to pin it.
 */
export default function ToolsScreen() {
  const router = useRouter();
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const { favorites, toggleFavorite } = useFavorites();

  const q = query.trim();
  const open = (item: NavLinkInfo) => router.push(`/tool/${hrefToSlug(item.href)}`);
  const row = (item: NavLinkInfo) => (
    <ToolRow key={item.href} item={item} favorited={favorites.includes(item.href)} onPress={() => open(item)} onToggleFavorite={() => toggleFavorite(item.href)} />
  );
  const favoriteTools = TOOLS.filter((t) => favorites.includes(t.href));
  const matches = q ? filterNavLinks(TOOLS, q) : [];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <TabHeader title="Tools" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomSpace, gap: 16 }}
        >
          <SearchField value={query} onChangeText={setQuery} placeholder="Search tools" />
          {q ? (
            <Card title="Tools">{matches.length ? matches.map(row) : <EmptyText>No tools match “{q}”.</EmptyText>}</Card>
          ) : (
            <>
              {favoriteTools.length ? (
                <Card plain title="Favorites">
                  <View className="gap-3">
                    {chunk(favoriteTools, 2).map((pair, i) => (
                      <View key={i} className="flex-row gap-3">
                        {pair.map((item) => (
                          <ToolTile key={item.href} item={item} favorited onPress={() => open(item)} onToggleFavorite={() => toggleFavorite(item.href)} />
                        ))}
                        {pair.length === 1 ? <View className="flex-1" /> : null}
                      </View>
                    ))}
                  </View>
                </Card>
              ) : null}
              {groupByCategory(TOOLS).map(({ category, items }) => (
                <Card key={category} title={category}>
                  <View className="gap-2">{items.map(row)}</View>
                </Card>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
