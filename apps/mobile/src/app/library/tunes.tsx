import { sortByText } from '@jam-practice/core/sortText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { SearchField } from '@/components/ChordChartList';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { PlusIcon } from '@/components/icons';
import { TUNE_ROW_H, TuneRow } from '@/components/library/TuneRow';
import { useTuneMenu } from '@/components/library/useTuneMenu';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { StandardsPicker } from '@/components/StandardsPicker';
import { asTuneListId, TUNE_LIST_LABEL, tuneSummary, useTuneLists } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Every tune in one list (Tunes, or Tunes to Learn — `list` param), alphabetical and searchable.
 * Tap a tune to edit it (full page, `library/tune.tsx`); ⋮ / long-press for the rest (chart
 * linking, moving between lists, deleting). The header's + opens the jazz-standards picker, which
 * also offers "create your own" for anything not in it.
 */
function TunesListScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const list = asTuneListId(useLocalSearchParams<{ list?: string }>().list);
  const { lists, ready } = useTuneLists();
  const { tunes, setTunes } = lists[list];
  const { openTuneMenu, tuneMenu } = useTuneMenu();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = words.length
      ? tunes.filter((t) => words.every((w) => `${t.name} ${tuneSummary(t)} ${t.notes}`.toLowerCase().includes(w)))
      : tunes;
    return sortByText(filtered, (t) => t.name);
  }, [tunes, query]);

  const title = TUNE_LIST_LABEL[list];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable
              onPress={() => setAdding(true)}
              accessibilityLabel={`Add to ${title}`}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.accent }}
            >
              <PlusIcon color={colors['accent-foreground']} size={22} />
            </Pressable>
          ),
        }}
      />
      {!ready ? (
        <ScreenSpinner />
      ) : (
        <>
          <View className="px-4 pb-2 pt-2">
            <SearchField value={query} onChange={setQuery} placeholder={`Search ${tunes.length} ${list === 'learn' ? 'tunes to learn' : 'tunes you know'}…`} />
          </View>
          <FlatList
            data={shown}
            keyExtractor={(t) => t.id}
            getItemLayout={(_, index) => ({ length: TUNE_ROW_H, offset: TUNE_ROW_H * index, index })}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomSpace }}
            renderItem={({ item }) => (
              <TuneRow
                tune={item}
                onPress={() => router.push({ pathname: '/library/tune', params: { list, id: item.id } })}
                onMenu={() => openTuneMenu(list, item)}
              />
            )}
            ListEmptyComponent={
              <Text className="font-ui py-8 text-center text-sm" style={{ color: colors.muted }}>
                {query.trim() ? `No tunes match “${query}”.` : 'Nothing here yet — tap + to add a jazz standard or your own tune.'}
              </Text>
            }
          />
        </>
      )}
      {tuneMenu}
      {adding ? (
        <StandardsPicker
          tunes={tunes}
          setTunes={setTunes}
          onClose={() => setAdding(false)}
          onCreateCustom={(name) => {
            setAdding(false);
            router.push({ pathname: '/library/tune-edit', params: { list, name } });
          }}
        />
      ) : null}
    </View>
  );
}

export default withScreenLoader(TunesListScreen);
