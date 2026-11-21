import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { MusicNoteIcon, PlusIcon } from '@/components/icons';
import { EmptyState, IconButton, SearchField, SortControl } from '@/components/ui';
import { TUNE_ROW_H, TuneRow } from '@/components/library/TuneRow';
import { TUNE_ORDERS, useTuneOrder } from '@/components/library/tuneOrder';
import { useTuneMenu } from '@/components/library/useTuneMenu';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { StandardsPicker } from '@/components/StandardsPicker';
import { asTuneListId, TUNE_LIST_LABEL, tuneSummary, useTuneLists } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Every tune in one list (Tunes I Know, Tunes to Learn or Library — `list` param), newest first or
 * A–Z (the same order as the Tunes tab), and searchable.
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
  const [order, setOrder, ordered] = useTuneOrder();

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = words.length
      ? tunes.filter((t) => words.every((w) => `${t.name} ${tuneSummary(t)} ${t.keys.map((k) => k.value).join(' ')} ${t.notes} ${(t.tags ?? []).join(' ')}`.toLowerCase().includes(w)))
      : tunes;
    return ordered(filtered);
  }, [tunes, query, ordered]);

  const title = TUNE_LIST_LABEL[list];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => <IconButton primary Icon={PlusIcon} label={`Add to ${title}`} onPress={() => setAdding(true)} />,
        }}
      />
      {!ready ? (
        <ScreenSpinner />
      ) : (
        <>
          {tunes.length ? (
            <View className="gap-2 px-4 pb-3 pt-2">
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder={list === 'learn' ? 'Search tunes to learn' : list === 'library' ? 'Search the Library list' : 'Search tunes you know'}
              />
              <SortControl value={order} options={TUNE_ORDERS} onChange={setOrder} />
            </View>
          ) : null}
          <FlatList
            data={shown}
            keyExtractor={(t) => t.id}
            getItemLayout={(_, index) => ({ length: TUNE_ROW_H, offset: TUNE_ROW_H * index, index })}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomSpace }}
            renderItem={({ item, index }) => (
              <TuneRow
                tune={item}
                first={index === 0}
                last={index === shown.length - 1}
                onPress={() => router.push({ pathname: '/library/tune', params: { list, id: item.id } })}
                onMenu={() => openTuneMenu(list, item)}
              />
            )}
            ListEmptyComponent={
              query.trim() ? (
                <Text className="font-ui py-8 text-center text-sm" style={{ color: colors.muted }}>
                  No tunes match “{query}”.
                </Text>
              ) : (
                <View className="pt-2">
                  <EmptyState
                    Icon={MusicNoteIcon}
                    title={list === 'learn' ? 'Nothing to learn yet' : list === 'library' ? 'Nothing in the Library list' : 'No tunes yet'}
                    body={
                      list === 'learn'
                        ? "Add a tune you're working on."
                        : list === 'library'
                          ? 'Tunes that come in with chord charts land here until you move them.'
                          : 'Jam Practice and Tune of the day pick from these.'
                    }
                    action={{ label: 'Add a tune', Icon: PlusIcon, onPress: () => router.push({ pathname: '/library/tune-edit', params: { list } }) }}
                    secondary={{ label: 'Pick from the standards', onPress: () => setAdding(true) }}
                  />
                </View>
              )
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
