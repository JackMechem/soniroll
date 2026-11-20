import { groupByCategory, type NavLinkInfo } from '@jam-practice/core/navLinks';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { TabHeader } from '@/components/TabHeader';
import { EVERYDAY_HREFS, TOOL_LINKS, ToolSection, ToolTiles, searchTools, toolRoute } from '@/components/ToolGrid';
import { EmptyText, SearchField, SectionHeader, useScrolled } from '@/components/ui';
import { useFavorites } from '@/lib/useFavorites';
import { useAppTheme } from '@/theme/ThemeProvider';

const EVERYDAY = EVERYDAY_HREFS.map((h) => TOOL_LINKS.find((l) => l.href === h)).filter((l): l is NavLinkInfo => !!l);
/** The groups without the Everyday tools, so each tool is listed once. The Library, Chord Charts
    and Community are tabs, which leaves Lessons alone in the Community group, so it's "Teaching". */
const GROUPS = groupByCategory(TOOL_LINKS.filter((l) => !EVERYDAY_HREFS.includes(l.href))).map(({ category, items }) => ({
  title: category === 'Community' && items.every((i) => i.href === '/lessons') ? 'Teaching' : category,
  items,
}));

/**
 * Tools — every practice tool in one place: a search (which also finds the Library, Chord Charts,
 * Community and the Shed Log, as shortcuts to their tabs), your favorites as compact tiles, the
 * Everyday tools, then the other groups in the website's order. Each group's name is a plain label
 * over one surface section of rows (hairlines between them); each row says what the tool does in
 * one line; a lock marks the ones that need an account while you're signed out.
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomSpace, gap: 20 }}
        >
          <SearchField value={query} onChangeText={setQuery} placeholder="Search tools" />
          {results ? (
            <>
              {results.tools.length ? (
                <ToolSection title="Tools" items={results.tools} favorites={favorites} onOpen={open} onToggleFavorite={toggleFavorite} />
              ) : (
                <EmptyText>No tools match “{q}”.</EmptyText>
              )}
              {results.shortcuts.length ? (
                // Tabs: tapping one switches to it (no star; they're always in the tab bar).
                <ToolSection title="Go to" items={results.shortcuts} onOpen={(item) => router.navigate(toolRoute(item.href))} />
              ) : null}
            </>
          ) : (
            <>
              {favoriteTools.length ? (
                <View className="gap-1.5">
                  <SectionHeader title="Favorites" />
                  <ToolTiles items={favoriteTools} favorites={favorites} onOpen={open} onToggleFavorite={toggleFavorite} />
                </View>
              ) : null}
              <ToolSection title="Everyday" items={EVERYDAY} favorites={favorites} onOpen={open} onToggleFavorite={toggleFavorite} />
              {GROUPS.map(({ title, items }) => (
                <ToolSection key={title} title={title} items={items} favorites={favorites} onOpen={open} onToggleFavorite={toggleFavorite} />
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
