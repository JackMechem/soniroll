import { sortByText } from '@jam-practice/core/sortText';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, IconButton, SearchField, SortControl } from '@/components/ui';
import { LibraryHeader } from '@/components/TabHeader';
import { PlusIcon, SetlistIcon } from '@/components/icons';
import { SETLIST_ROW_H, SetlistRow } from '@/components/library/SetlistRow';
import { NameDialog } from '@/components/NameDialog';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useSetlists } from '@/lib/useSetlists';
import { useTuneLists } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

type Sort = 'recent' | 'name';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'name', label: 'A–Z' },
];

/**
 * The Library's Setlists tab. Searchable (by setlist name or any tune in it), sorted by most
 * recently changed or A–Z; + (or the empty state's New setlist) makes a new one.
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
    const nameOf = new Map([...lists.tunes.tunes, ...lists.learn.tunes, ...lists.library.tunes].map((t) => [t.id, t.name]));
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = words.length
      ? setlists.filter((s) => {
          const hay = [s.name, s.description, ...s.tuneIds.map((id) => nameOf.get(id) ?? '')].join(' ').toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : setlists;
    return sort === 'name' ? sortByText(filtered, (s) => s.name) : [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [setlists, lists.tunes.tunes, lists.learn.tunes, lists.library.tunes, query, sort]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']}>
        <LibraryHeader right={<IconButton primary Icon={PlusIcon} label="New setlist" onPress={() => setNaming(true)} />} />
      </SafeAreaView>
      {!ready || !tunesReady ? (
        <ScreenSpinner />
      ) : setlists.length === 0 ? (
        <View className="px-4 pt-4">
          <EmptyState
            Icon={SetlistIcon}
            title="No setlists yet"
            body="Make one for a gig or a session, then share it by link or post it to Community."
            action={{ label: 'New setlist', Icon: PlusIcon, onPress: () => setNaming(true) }}
          />
        </View>
      ) : (
        <>
          <View className="gap-2 px-4 pb-2 pt-3">
            <SearchField value={query} onChangeText={setQuery} placeholder="Search setlists" />
            <SortControl value={sort} options={SORTS} onChange={setSort} />
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
                No setlists match “{query}”.
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
