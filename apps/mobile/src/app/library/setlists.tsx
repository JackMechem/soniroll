import { sortByText } from '@jam-practice/core/sortText';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { SearchField } from '@/components/ChordChartList';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui';
import { LibraryHeader } from '@/components/TabHeader';
import { PlusIcon } from '@/components/icons';
import { SETLIST_ROW_H, SetlistRow } from '@/components/library/SetlistRow';
import { NameDialog } from '@/components/NameDialog';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useSetlists } from '@/lib/useSetlists';
import { useTuneLists } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

type Sort = 'recent' | 'name';

/**
 * Every setlist — the Tunes tab's "See all" for setlists. Searchable (by setlist name or any tune
 * in it), sorted by most recently changed or A–Z; + makes a new one.
 */
function SetlistsScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { setlists, ready, create } = useSetlists();
  const { lists, ready: tunesReady } = useTuneLists();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [naming, setNaming] = useState(false);

  const shown = useMemo(() => {
    const nameOf = new Map([...lists.tunes.tunes, ...lists.learn.tunes].map((t) => [t.id, t.name]));
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = words.length
      ? setlists.filter((s) => {
          const hay = [s.name, s.description, ...s.tuneIds.map((id) => nameOf.get(id) ?? '')].join(' ').toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : setlists;
    return sort === 'name' ? sortByText(filtered, (s) => s.name) : [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [setlists, lists.tunes.tunes, lists.learn.tunes, query, sort]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']}>
        <LibraryHeader right={<IconButton primary Icon={PlusIcon} label="New setlist" onPress={() => setNaming(true)} />} />
      </SafeAreaView>
      {!ready || !tunesReady ? (
        <ScreenSpinner />
      ) : (
        <>
          <View className="gap-2 px-4 pb-2 pt-3">
            <SearchField value={query} onChange={setQuery} placeholder={`Search ${setlists.length} setlists…`} />
            <View className="flex-row gap-2">
              {(['recent', 'name'] as Sort[]).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setSort(key)}
                  className="rounded-full px-3.5 py-1.5"
                  style={{ backgroundColor: sort === key ? colors.accent : colors.surface }}
                >
                  <Text className="font-ui-semibold text-xs font-semibold" style={{ color: sort === key ? colors['accent-foreground'] : colors.foreground }}>
                    {key === 'recent' ? 'Recent' : 'A–Z'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <FlatList
            data={shown}
            keyExtractor={(s) => s.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            getItemLayout={(_, i) => ({ length: SETLIST_ROW_H + 6, offset: (SETLIST_ROW_H + 6) * i, index: i })}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottomSpace }}
            renderItem={({ item }) => <SetlistRow setlist={item} />}
            ListEmptyComponent={
              <Text className="font-ui py-8 text-center text-sm" style={{ color: colors.muted }}>
                {query ? `No setlists match “${query}”.` : 'No setlists yet — tap + to make one.'}
              </Text>
            }
          />
        </>
      )}
      <NameDialog
        visible={naming}
        title="New setlist"
        placeholder="e.g. Friday gig"
        onSubmit={(name) => router.push({ pathname: '/library/setlist', params: { id: create(name).id } })}
        onClose={() => setNaming(false)}
      />
    </View>
  );
}

export default withScreenLoader(SetlistsScreen);
