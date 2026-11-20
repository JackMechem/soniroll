import { groupByCategory, type NavLinkInfo } from '@jam-practice/core/navLinks';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { TabHeader } from '@/components/TabHeader';
import { EVERYDAY_HREFS, TOOL_LINKS, ToolRow, ToolTile, chunk, searchTools, toolRoute } from '@/components/ToolGrid';
import { Card, EmptyText, SearchField, useScrolled } from '@/components/ui';
import { useFavorites } from '@/lib/useFavorites';
import { useAppTheme } from '@/theme/ThemeProvider';

const EVERYDAY = EVERYDAY_HREFS.map((h) => TOOL_LINKS.find((l) => l.href === h)).filter((l): l is NavLinkInfo => !!l);
/** The groups without the Everyday tools, so each tool is listed once. */
const GROUPS = groupByCategory(TOOL_LINKS.filter((l) => !EVERYDAY_HREFS.includes(l.href)));

/**
 * Tools — every practice tool in one place: a search (which also finds the Library, Chord Charts,
 * Community and the Shed Log, as shortcuts to their tabs), your favorites as cards, the Everyday
 * tools, then the other groups in the website's order. Each row says what the tool does; a lock
 * marks the ones that need an account while you're signed out.
 */
export default function ToolsScreen() {
  const router = useRouter();
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const { favorites, toggleFavorite } = useFavorites();
  const { scrolled, onScroll, scrollEventThrottle } = useScrolled();

  const q = query.trim();
  const open = (item: NavLinkInfo) => router.push(toolRoute(item.href));
  const row = (item: NavLinkInfo) => (
    <ToolRow key={item.href} item={item} favorited={favorites.includes(item.href)} onPress={() => open(item)} onToggleFavorite={() => toggleFavorite(item.href)} />
  );
  const favoriteTools = TOOL_LINKS.filter((t) => favorites.includes(t.href));
  const results = q ? searchTools(q) : null;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <TabHeader title="Tools" scrolled={scrolled} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomSpace, gap: 16 }}
        >
          <SearchField value={query} onChangeText={setQuery} placeholder="Search tools" />
          {results ? (
            <>
              <Card title="Tools">{results.tools.length ? results.tools.map(row) : <EmptyText>No tools match “{q}”.</EmptyText>}</Card>
              {results.shortcuts.length ? (
                <Card title="Go to">
                  {/* Tabs: tapping one switches to it (no star; they're always in the tab bar). */}
                  {results.shortcuts.map((item) => (
                    <ToolRow key={item.href} item={item} onPress={() => router.navigate(toolRoute(item.href))} />
                  ))}
                </Card>
              ) : null}
            </>
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
              <Card title="Everyday">
                <View className="gap-2">{EVERYDAY.map(row)}</View>
              </Card>
              {GROUPS.map(({ category, items }) => (
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
