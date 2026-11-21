import { useConvexAuth } from '@convex-dev/auth/react';
import type { Tune } from '@jam-practice/core/types';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { LibraryHeader } from '@/components/TabHeader';
import { EmptyState, IconButton, SearchField, SectionHeader, SortControl } from '@/components/ui';
import { BookIcon, ChevronRightIcon, MusicNoteIcon, PlusIcon, StarOutlineIcon } from '@/components/icons';
import { TuneRow } from '@/components/library/TuneRow';
import { useTuneMenu } from '@/components/library/useTuneMenu';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { StandardsPicker } from '@/components/StandardsPicker';
import { useRecentItems } from '@/lib/chordChartRecents';
import { useTuneOrder, TUNE_ORDERS } from '@/components/library/tuneOrder';
import { TUNE_LIST_IDS, TUNE_LIST_SHORT, tuneSummary, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

const PREVIEW = 5;
const SEARCH_LIMIT = 25;

/**
 * The Tunes tab (route `/library`) — only about tunes: Tunes I Know, Tunes to Learn and the
 * Library list (tunes that came in with chord charts, shown once there are some), each with its
 * count in its heading and "See all", the tunes you opened most recently, and a few tunes from
 * each list (newest or A–Z); one search box covers all three (hidden while there are none).
 * Setlists have their own tab. The + adds a jazz standard, a new tune or a tune to learn; an empty
 * list says what it's for and offers the same. Every tune has the tune ⋮ menu (`useTuneMenu`: edit, link / open / edit
 * its chord chart, move between lists, delete). Chord charts have a tab of their own
 * (`app/charts/index.tsx`).
 */
function LibraryScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { lists, ready } = useTuneLists();
  const recent = useRecentItems();
  const { openTuneMenu, tuneMenu } = useTuneMenu();
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [addingStandard, setAddingStandard] = useState<TuneListId | null>(null);
  const [listAdd, setListAdd] = useState<TuneListId | null>(null);

  const [order, setOrder, ordered] = useTuneOrder();

  const tunes = lists.tunes.tunes;
  const learn = lists.learn.tunes;
  const library = lists.library.tunes;

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return null;
    const words = q.split(/\s+/);
    const matchTune = (t: Tune) => words.every((w) => `${t.name} ${tuneSummary(t)} ${t.keys.map((k) => k.value).join(' ')} ${(t.tags ?? []).join(' ')}`.toLowerCase().includes(w));
    return { tunes: ordered(tunes.filter(matchTune)), learn: ordered(learn.filter(matchTune)), library: ordered(library.filter(matchTune)) };
  }, [q, tunes, learn, library, ordered]);

  if (!ready) return <ScreenSpinner />;

  // Tunes in the order they were opened (charts have their own tab); anything since deleted is skipped.
  const recentCards: { key: string; title: string; detail: string; onPress: () => void }[] = [];
  for (const item of recent) {
    if (recentCards.length >= 10) break;
    if (item.kind === 'tune') {
      const list = TUNE_LIST_IDS.find((l) => lists[l].tunes.some((t) => t.id === item.id));
      const tune = list ? lists[list].tunes.find((t) => t.id === item.id) : undefined;
      if (list && tune) {
        recentCards.push({
          key: `t:${tune.id}`,
          title: tune.name,
          detail: `${TUNE_LIST_SHORT[list]} · ${tune.keys.length} of 12 keys`,
          onPress: () => router.push({ pathname: '/library/tune', params: { list, id: tune.id } }),
        });
      }
    }
  }
  function tuneRow(list: TuneListId, count: number) {
    return function renderTune(tune: Tune, i: number) {
      return (
        <TuneRow
          key={tune.id}
          tune={tune}
          first={i === 0}
          last={i === count - 1}
          onPress={() => router.push({ pathname: '/library/tune', params: { list, id: tune.id } })}
          onMenu={() => openTuneMenu(list, tune)}
        />
      );
    };
  }
  const preview = (list: TuneListId, items: Tune[]) => {
    const shown = ordered(items).slice(0, PREVIEW);
    return <View>{shown.map(tuneRow(list, shown.length))}</View>;
  };
  const found = (list: TuneListId, items: Tune[]) => {
    const shown = items.slice(0, SEARCH_LIMIT);
    return <View>{shown.map(tuneRow(list, shown.length))}</View>;
  };

  const empty = tunes.length === 0 && learn.length === 0 && library.length === 0;
  const addTune = (list: TuneListId) => router.push({ pathname: '/library/tune-edit', params: { list } });

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <LibraryHeader right={<IconButton primary Icon={PlusIcon} label="Add a tune" onPress={() => setCreateOpen(true)} />} />
        {/* Search only once there's something to search. */}
        {!empty ? (
          <View className="px-4 pb-2 pt-3">
            <SearchField value={query} onChangeText={setQuery} placeholder="Search your tunes" />
          </View>
        ) : null}

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: bottomSpace, gap: 22 }}>
          {results ? (
            <>
              <ResultSection title="Tunes I Know" count={results.tunes.length}>
                {found('tunes', results.tunes)}
              </ResultSection>
              <ResultSection title="Tunes to Learn" count={results.learn.length}>
                {found('learn', results.learn)}
              </ResultSection>
              <ResultSection title="Library" count={results.library.length}>
                {found('library', results.library)}
              </ResultSection>
              {results.tunes.length + results.learn.length + results.library.length === 0 ? (
                <Text className="font-ui py-6 text-center text-sm" style={{ color: colors.muted }}>
                  Nothing matches &ldquo;{query}&rdquo;.
                </Text>
              ) : null}
            </>
          ) : empty ? (
            <EmptyState
              Icon={MusicNoteIcon}
              title="No tunes yet"
              body="Add the tunes you know. Jam Practice and Tune of the day pick from them."
              action={{ label: 'Add a tune', Icon: PlusIcon, onPress: () => addTune('tunes') }}
              secondary={{ label: 'Pick from the standards', onPress: () => setAddingStandard('tunes') }}
            />
          ) : (
            <>
              {recentCards.length > 0 ? (
                <View className="gap-2">
                  <SectionHeader title="Recently opened" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {recentCards.map((card) => (
                      <Pressable
                        key={card.key}
                        onPress={card.onPress}
                        android_ripple={{ color: colors['surface-hover'] }}
                        className="justify-between overflow-hidden rounded-xl p-3"
                        style={{ width: 150, height: 92, backgroundColor: colors.surface }}
                      >
                        <MusicNoteIcon color={colors.accent} size={20} />
                        <View>
                          <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                            {card.title}
                          </Text>
                          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                            {card.detail}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <SortControl value={order} options={TUNE_ORDERS} onChange={setOrder} />

              <View className="gap-1">
                <SectionHeader
                  title="Tunes I Know"
                  count={tunes.length}
                  detail="Ready to play · Jam Practice picks from these"
                  right={<SectionLinks href={{ pathname: '/library/tunes', params: { list: 'tunes' } }} onAdd={() => setListAdd('tunes')} addLabel="Add to Tunes I Know" />}
                />
                {tunes.length === 0 ? (
                  <EmptyState
                    title="No tunes you know yet"
                    body="Jam Practice and Tune of the day pick from these."
                    action={{ label: 'Add a tune', Icon: PlusIcon, onPress: () => addTune('tunes') }}
                    secondary={{ label: 'Pick from the standards', onPress: () => setAddingStandard('tunes') }}
                  />
                ) : (
                  preview('tunes', tunes)
                )}
              </View>

              {isAuthenticated ? (
                <View className="gap-1">
                  <SectionHeader
                    title="Tunes to Learn"
                    count={learn.length}
                    detail="Still learning · kept apart from your practice"
                    right={<SectionLinks href={{ pathname: '/library/tunes', params: { list: 'learn' } }} onAdd={() => setListAdd('learn')} addLabel="Add to Tunes to Learn" />}
                  />
                  {learn.length === 0 ? (
                    <EmptyState
                      title="Nothing to learn yet"
                      body="Add a tune you're working on."
                      action={{ label: 'Add a tune to learn', Icon: PlusIcon, onPress: () => addTune('learn') }}
                      secondary={{ label: 'Pick from the standards', onPress: () => setAddingStandard('learn') }}
                    />
                  ) : (
                    preview('learn', learn)
                  )}
                </View>
              ) : null}

              {library.length > 0 ? (
                <View className="gap-1">
                  <SectionHeader
                    title="Library"
                    count={library.length}
                    detail="Came in with chord charts · not sorted yet"
                    right={<SeeAll href={{ pathname: '/library/tunes', params: { list: 'library' } }} />}
                  />
                  {preview('library', library)}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {tuneMenu}
      <ActionSheet
        visible={createOpen}
        title="Add a tune"
        onClose={() => setCreateOpen(false)}
        actions={[
          { key: 'standard', icon: <BookIcon color={colors.accent} size={22} />, label: 'Jazz standard', onPress: () => setAddingStandard('tunes') },
          { key: 'tune', icon: <MusicNoteIcon color={colors.accent} size={22} />, label: 'New tune', onPress: () => router.push({ pathname: '/library/tune-edit', params: { list: 'tunes' } }) },
          ...(isAuthenticated
            ? [{ key: 'learn', icon: <StarOutlineIcon color={colors.accent} size={22} />, label: 'Tune to learn', onPress: () => router.push({ pathname: '/library/tune-edit', params: { list: 'learn' } }) }]
            : []),
        ]}
      />
      <ActionSheet
        visible={listAdd !== null}
        title={listAdd === 'learn' ? 'Add to Tunes to Learn' : 'Add to Tunes I Know'}
        onClose={() => setListAdd(null)}
        actions={[
          { key: 'standard', icon: <BookIcon color={colors.accent} size={22} />, label: 'Jazz standard', onPress: () => setAddingStandard(listAdd) },
          {
            key: 'tune',
            icon: <MusicNoteIcon color={colors.accent} size={22} />,
            label: listAdd === 'learn' ? 'New tune to learn' : 'New tune',
            onPress: () => router.push({ pathname: '/library/tune-edit', params: { list: listAdd ?? 'tunes' } }),
          },
        ]}
      />
      {addingStandard ? (
        <StandardsPicker
          tunes={lists[addingStandard].tunes}
          setTunes={lists[addingStandard].setTunes}
          onClose={() => setAddingStandard(null)}
          onCreateCustom={(name) => {
            router.push({ pathname: '/library/tune-edit', params: { list: addingStandard, name } });
            setAddingStandard(null);
          }}
        />
      ) : null}
    </View>
  );
}

/** See all, on a list section's heading. */
function SeeAll({ href }: { href: Href }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(href)} hitSlop={8} accessibilityRole="link" className="h-11 flex-row items-center pl-2">
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        See all
      </Text>
      <ChevronRightIcon color={colors.muted} size={18} />
    </Pressable>
  );
}

/** A list section's links: + (add to it) and See all. */
function SectionLinks({ href, onAdd, addLabel }: { href: Href; onAdd: () => void; addLabel: string }) {
  const { colors, derived } = useAppTheme();
  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        onPress={onAdd}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={addLabel}
        android_ripple={{ color: colors['surface-hover'] }}
        className="h-8 w-8 items-center justify-center overflow-hidden rounded-full"
        style={{ backgroundColor: derived.fill }}
      >
        <PlusIcon color={colors.foreground} size={18} />
      </Pressable>
      <SeeAll href={href} />
    </View>
  );
}

function ResultSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const { colors } = useAppTheme();
  if (count === 0) return null;
  return (
    <View className="gap-1">
      <SectionHeader title={title} count={count} />
      {children}
      {count > SEARCH_LIMIT ? (
        <Text className="font-ui px-3 text-xs" style={{ color: colors.muted }}>
          Keep typing to narrow it down.
        </Text>
      ) : null}
    </View>
  );
}

export default withScreenLoader(LibraryScreen);
