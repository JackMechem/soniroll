import { useConvexAuth } from '@convex-dev/auth/react';
import type { Tune } from '@jam-practice/core/types';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { SearchField } from '@/components/ChordChartList';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { LibraryHeader } from '@/components/TabHeader';
import { IconButton } from '@/components/ui';
import {
  BookIcon,
  ChevronRightIcon,
  SetlistIcon,
  MusicNoteIcon,
  PlusIcon,
  StarOutlineIcon,
  type IconProps,
} from '@/components/icons';
import { SetlistRow } from '@/components/library/SetlistRow';
import { TuneRow } from '@/components/library/TuneRow';
import { useTuneMenu } from '@/components/library/useTuneMenu';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { StandardsPicker } from '@/components/StandardsPicker';
import { useRecentItems } from '@/lib/chordChartRecents';
import { useSetlists } from '@/lib/useSetlists';
import { tuneSummary, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { NameDialog } from '@/components/NameDialog';
import { useAppTheme } from '@/theme/ThemeProvider';

const PREVIEW = 5;
const SEARCH_LIMIT = 25;

/**
 * The Tunes tab (route `/library`) — a dashboard for your tune lists: Tunes I Know and Tunes to
 * Learn. Counts (each opens the full list), the tunes you opened most recently, and the tunes you
 * added most recently in each list; one search box covers both. The + adds a jazz standard, a new
 * tune or a tune to learn. Every tune has the tune ⋮ menu (`useTuneMenu`: edit, link / open / edit
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
  const [namingSetlist, setNamingSetlist] = useState(false);
  const { setlists, ready: setlistsReady, create: createSetlist } = useSetlists();

  const tunes = lists.tunes.tunes;
  const learn = lists.learn.tunes;
  const unlinked = tunes.filter((t) => !t.chordChartId).length;

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return null;
    const words = q.split(/\s+/);
    const matchTune = (t: Tune) => words.every((w) => `${t.name} ${tuneSummary(t)}`.toLowerCase().includes(w));
    return { tunes: tunes.filter(matchTune), learn: learn.filter(matchTune) };
  }, [q, tunes, learn]);

  if (!ready || !setlistsReady) return <ScreenSpinner />;

  // Tunes in the order they were opened (charts have their own tab); anything since deleted is skipped.
  const recentCards: { key: string; title: string; detail: string; onPress: () => void }[] = [];
  for (const item of recent) {
    if (recentCards.length >= 10) break;
    if (item.kind === 'tune') {
      const list = (['tunes', 'learn'] as TuneListId[]).find((l) => lists[l].tunes.some((t) => t.id === item.id));
      const tune = list ? lists[list].tunes.find((t) => t.id === item.id) : undefined;
      if (list && tune) {
        recentCards.push({
          key: `t:${tune.id}`,
          title: tune.name,
          detail: `${list === 'learn' ? 'To learn' : 'I know'} · ${tune.keys.length} of 12 keys`,
          onPress: () => router.push({ pathname: '/library/tune', params: { list, id: tune.id } }),
        });
      }
    }
  }
  function tuneRow(list: TuneListId) {
    return function renderTune(tune: Tune) {
      return (
    <TuneRow
      key={tune.id}
      tune={tune}
      onPress={() => router.push({ pathname: '/library/tune', params: { list, id: tune.id } })}
      onMenu={() => openTuneMenu(list, tune)}
    />
      );
    };
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <LibraryHeader right={<IconButton primary Icon={PlusIcon} label="Add a tune" onPress={() => setCreateOpen(true)} />} />
        <View className="px-4 pb-2 pt-3">
          <SearchField value={query} onChange={setQuery} placeholder="Search your tunes…" />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: bottomSpace, gap: 22 }}>
          {results ? (
            <>
              <ResultSection title="Tunes I Know" count={results.tunes.length}>
                {results.tunes.slice(0, SEARCH_LIMIT).map(tuneRow('tunes'))}
              </ResultSection>
              <ResultSection title="Tunes to Learn" count={results.learn.length}>
                {results.learn.slice(0, SEARCH_LIMIT).map(tuneRow('learn'))}
              </ResultSection>
              {results.tunes.length + results.learn.length === 0 ? (
                <Text className="font-ui py-6 text-center text-sm" style={{ color: colors.muted }}>
                  Nothing matches &ldquo;{query}&rdquo;.
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <View className="flex-row gap-3">
                <StatCard Icon={MusicNoteIcon} count={tunes.length} label="I Know" onPress={() => router.push({ pathname: '/library/tunes', params: { list: 'tunes' } })} />
                <StatCard Icon={StarOutlineIcon} count={learn.length} label="To Learn" onPress={() => router.push({ pathname: '/library/tunes', params: { list: 'learn' } })} />
                <StatCard Icon={SetlistIcon} count={setlists.length} label="Setlists" onPress={() => (setlists.length ? router.push('/library/setlists') : setNamingSetlist(true))} />
              </View>

              {recentCards.length > 0 ? (
                <View className="gap-2">
                  <SectionHeader title="Recently opened" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {recentCards.map((card) => (
                      <Pressable
                        key={card.key}
                        onPress={card.onPress}
                        className="justify-between rounded-2xl p-3"
                        style={{ width: 150, height: 92, backgroundColor: colors.surface }}
                      >
                        <MusicNoteIcon color={colors.accent} size={20} />
                        <View>
                          <Text numberOfLines={1} className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
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

              <View className="gap-1">
                <SectionHeader title="Setlists" detail={setlists.length > PREVIEW ? String(setlists.length) : undefined} href={setlists.length ? '/library/setlists' : undefined}
                  onAdd={() => setNamingSetlist(true)}
                  addLabel="New setlist"
                />
                {setlists.length === 0 ? (
                  <Pressable onPress={() => setNamingSetlist(true)} className="flex-row items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
                    <SetlistIcon color={colors.accent} size={22} />
                    <Text className="font-ui flex-1 text-sm" style={{ color: colors.muted }}>
                      Make a setlist for a gig or a session — share it by link or post it to Community.
                    </Text>
                  </Pressable>
                ) : (
                  [...setlists]
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .slice(0, PREVIEW)
                    .map((sl) => <SetlistRow key={sl.id} setlist={sl} />)
                )}
              </View>

              <View className="gap-1">
                <SectionHeader
                  title="Tunes I Know"
                  detail={tunes.length && unlinked ? `${unlinked} without a chart` : undefined}
                  href={{ pathname: '/library/tunes', params: { list: 'tunes' } }}
                  onAdd={() => setListAdd('tunes')}
                />
                {tunes.length === 0 ? (
                  <EmptyCard text="No tunes yet — tap + to add a jazz standard or your own." />
                ) : (
                  [...tunes].reverse().slice(0, PREVIEW).map(tuneRow('tunes'))
                )}
              </View>

              {isAuthenticated ? (
                <View className="gap-1">
                  <SectionHeader title="Tunes to Learn" href={{ pathname: '/library/tunes', params: { list: 'learn' } }} onAdd={() => setListAdd('learn')} />
                  {learn.length === 0 ? (
                    <EmptyCard text="Tunes you want to learn, kept apart from your practice list." />
                  ) : (
                    [...learn].reverse().slice(0, PREVIEW).map(tuneRow('learn'))
                  )}
                </View>
              ) : null}

            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {tuneMenu}
      <ActionSheet
        visible={createOpen}
        title="Add to Tunes"
        onClose={() => setCreateOpen(false)}
        actions={[
          { key: 'setlist', icon: <SetlistIcon color={colors.accent} size={22} />, label: 'New setlist', onPress: () => setNamingSetlist(true) },
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
      <NameDialog
        visible={namingSetlist}
        title="New setlist"
        placeholder="e.g. Friday gig"
        confirmLabel="Create"
        onSubmit={(name) => {
          const sl = createSetlist(name);
          router.push({ pathname: '/library/setlist', params: { id: sl.id } });
        }}
        onClose={() => setNamingSetlist(false)}
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

function StatCard({ Icon, count, label, onPress }: { Icon: ComponentType<IconProps>; count: number; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors['surface-hover'] }} className="flex-1 gap-2 rounded-2xl p-3" style={{ backgroundColor: colors.surface }}>
      <Icon color={colors.accent} size={22} />
      <View>
        <Text className="font-ui-extrabold text-2xl font-extrabold tabular-nums" style={{ color: colors.foreground }}>
          {count}
        </Text>
        <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function SectionHeader({ title, detail, href, onAdd, addLabel }: { title: string; detail?: string; href?: Href; onAdd?: () => void; addLabel?: string }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <View className="flex-row items-end justify-between px-1 pb-1">
      <View className="flex-row items-center gap-2">
        <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {onAdd ? (
          <Pressable
            onPress={onAdd}
            hitSlop={8}
            accessibilityLabel={addLabel ?? `Add to ${title}`}
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surface }}
          >
            <PlusIcon color={colors.accent} size={16} />
          </Pressable>
        ) : null}
        {detail ? (
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {href ? (
        <Pressable onPress={() => router.push(href)} hitSlop={8} className="flex-row items-center">
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.accent }}>
            See all
          </Text>
          <ChevronRightIcon color={colors.accent} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ResultSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const { colors } = useAppTheme();
  if (count === 0) return null;
  return (
    <View className="gap-1">
      <SectionHeader title={title} detail={count > SEARCH_LIMIT ? `showing ${SEARCH_LIMIT} of ${count}` : String(count)} />
      {children}
      {count > SEARCH_LIMIT ? (
        <Text className="font-ui px-3 text-xs" style={{ color: colors.muted }}>
          Keep typing to narrow it down.
        </Text>
      ) : null}
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        {text}
      </Text>
    </View>
  );
}

export default withScreenLoader(LibraryScreen);
