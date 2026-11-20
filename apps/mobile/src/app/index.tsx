import { useConvexAuth } from '@convex-dev/auth/react';
import type { NavLinkInfo } from '@jam-practice/core/navLinks';
import type { Tune } from '@jam-practice/core/types';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { ChordChartIcon, MusicNoteIcon, NAV_LINK_ICONS, SetlistIcon } from '@/components/icons';
import { TOOL_LINKS, ToolRow, ToolTile, chunk, searchTools, toolRoute } from '@/components/ToolGrid';
import { AccountButton } from '@/components/TabHeader';
import { Button, Card, Chip, EmptyText, IconTile, ListRow, PageTitle, SearchField, ToolIcon, useScrolled } from '@/components/ui';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { TodayPracticeCard } from '@/components/shedLog/TodayPracticeCard';
import { Logo } from '@/components/Logo';
import { useRecentItems } from '@/lib/chordChartRecents';
import { useRecentTools } from '@/lib/toolRecents';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useFavorites } from '@/lib/useFavorites';
import { useSetlists } from '@/lib/useSetlists';
import { tuneSummary, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';
import { EarTrainingProgress } from '@/components/learning/EarTrainingProgress';
import { summarizeLearning } from '@jam-practice/core/learningPath';
import { useLearningProgress } from '@/lib/useLearnSession';

/** Shown in place of Favorites until you've starred some tools. */
const STARTER_HREFS = ['/metronome', '/jam-practice', '/tuner', '/practice-timer'];
const TOOL_BY_HREF = new Map(TOOL_LINKS.map((l) => [l.href, l]));

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Thursday, November 19", like the website's dashboard. */
function todayLabel(d: Date) {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Every word of the search is somewhere in the name. */
function matchesWords(name: string, words: string[]) {
  const n = name.toLowerCase();
  return words.every((w) => n.includes(w));
}

type RecentKind = 'Tool' | 'Tune' | 'Chart';
type Recent = { key: string; kind: RecentKind; icon: ReactNode; title: string; extra?: string; onPress: () => void };

/**
 * Home — the website's dashboard, made for a phone: the logo and the account button, the page title
 * and date, a search (tools, tunes, charts and setlists), then: a Sign in card (signed out) or
 * Today's practice (signed in), Favorites / Get started, Pick up where you left off (only once
 * there's something), Tune of the day, and the ear training path as one slim row per trainer.
 * Every tool is on the Tools tab and everything you've saved is in the Library tab, so Home
 * doesn't repeat them.
 */
function Home() {
  const bottomSpace = useTabBarSpace();
  const router = useRouter();
  const { colors, derived } = useAppTheme();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [query, setQuery] = useState('');
  const [today] = useState(() => new Date());
  const { favorites, toggleFavorite, ready } = useFavorites();
  const recentTools = useRecentTools();
  const recentItems = useRecentItems();
  const { lists, ready: tunesReady } = useTuneLists();
  const { setlists } = useSetlists();
  const { allSongs } = useChordChartsLibrary(null);
  const [learningProgress] = useLearningProgress();
  const learningSummaries = summarizeLearning(learningProgress);
  const { scrolled, onScroll, scrollEventThrottle } = useScrolled();

  const q = query.trim();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const openTool = (item: NavLinkInfo) => router.push(toolRoute(item.href));
  const openTune = (list: TuneListId, id: string) => router.push({ pathname: '/library/tune', params: { list, id } });
  const openChart = (id: string) => router.push({ pathname: '/tool/chord-charts-view', params: { id } });

  const chartMeta = useMemo(() => {
    const m = new Map<string, { title: string; key: string }>();
    for (const s of allSongs) m.set(s.id, { title: s.title, key: s.key });
    return m;
  }, [allSongs]);

  const tuneMatches: { tune: Tune; list: TuneListId }[] = [];
  if (words.length) {
    for (const list of ['tunes', 'learn'] as TuneListId[]) {
      for (const tune of lists[list].tunes) if (tuneMatches.length < 8 && matchesWords(tune.name, words)) tuneMatches.push({ tune, list });
    }
  }
  const chartMatches = words.length ? allSongs.filter((s) => matchesWords(s.title, words)).slice(0, 8) : [];
  const setlistMatches = words.length ? setlists.filter((s) => matchesWords(s.name, words)).slice(0, 5) : [];

  // Tune of the day: the same one all day, from Tunes I Know (the website's rule, so both agree).
  const known = lists.tunes.tunes;
  const tuneOfDay = useMemo(() => {
    if (!known.length) return null;
    const day = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
    const tune = known[day % known.length];
    const keys = tune.keys.filter((k) => k.enabled);
    const tempos = tune.tempos.filter((t) => t.enabled);
    return { tune, key: keys.length ? keys[day % keys.length].value : null, tempo: tempos.length ? tempos[day % tempos.length].value : null };
  }, [today, known]);

  if (!ready || !tunesReady) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenSpinner />
      </View>
    );
  }

  const favoriteTools = TOOL_LINKS.filter((t) => favorites.includes(t.href));
  const pinned = favoriteTools.length ? favoriteTools : TOOL_LINKS.filter((t) => STARTER_HREFS.includes(t.href));

  // Pick up where you left off: recent tools first, then recent tunes and charts.
  const recents: Recent[] = [];
  for (const href of recentTools) {
    const tool = TOOL_BY_HREF.get(href);
    if (tool && NAV_LINK_ICONS[href]) recents.push({ key: href, kind: 'Tool', icon: <ToolIcon tool={tool} size={34} />, title: tool.label, onPress: () => openTool(tool) });
    if (recents.length >= 3) break;
  }
  for (const item of recentItems) {
    if (recents.length >= 5) break;
    if (item.kind === 'tune') {
      const list = (['tunes', 'learn'] as TuneListId[]).find((l) => lists[l].tunes.some((t) => t.id === item.id));
      const tune = list ? lists[list].tunes.find((t) => t.id === item.id) : undefined;
      if (list && tune) {
        recents.push({ key: `t:${tune.id}`, kind: 'Tune', icon: <IconTile Icon={MusicNoteIcon} size={34} />, title: tune.name, onPress: () => openTune(list, tune.id) });
      }
    } else {
      const meta = chartMeta.get(item.id);
      if (meta) {
        recents.push({ key: `c:${item.id}`, kind: 'Chart', icon: <IconTile Icon={ChordChartIcon} size={34} />, title: meta.title, extra: meta.key || undefined, onPress: () => openChart(item.id) });
      }
    }
  }
  // Say what each one is only when the list mixes kinds.
  const mixed = new Set(recents.map((r) => r.kind)).size > 1;
  const recentDetail = (r: Recent) => (mixed ? [r.kind, r.extra].filter(Boolean).join(' · ') : r.extra);

  const results = q ? searchTools(q) : null;
  const nothingFound =
    !!results && !results.tools.length && !results.shortcuts.length && !tuneMatches.length && !chartMatches.length && !setlistMatches.length;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <View
          className="h-14 flex-row items-center justify-between px-4"
          style={{ borderBottomWidth: 1, borderBottomColor: scrolled ? derived.hairline : 'transparent' }}
        >
          <Logo height={26} />
          <AccountButton />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomSpace, gap: 16 }}
        >
          <PageTitle title="Your practice space" detail={todayLabel(today)} />
          <SearchField value={query} onChangeText={setQuery} placeholder="Search tools, tunes and charts" />

          {results ? (
            nothingFound ? (
              <EmptyText>Nothing matches “{q}”.</EmptyText>
            ) : (
              <>
                {results.tools.length || results.shortcuts.length ? (
                  <Card title="Tools">
                    {results.tools.map((item) => (
                      <ToolRow key={item.href} item={item} favorited={favorites.includes(item.href)} onPress={() => openTool(item)} onToggleFavorite={() => toggleFavorite(item.href)} />
                    ))}
                    {results.shortcuts.map((item) => (
                      <ToolRow key={item.href} item={item} onPress={() => router.navigate(toolRoute(item.href))} />
                    ))}
                  </Card>
                ) : null}
                {tuneMatches.length ? (
                  <Card title="Tunes">
                    {tuneMatches.map(({ tune, list }) => (
                      <ListRow
                        key={tune.id}
                        icon={<IconTile Icon={MusicNoteIcon} size={34} />}
                        title={tune.name}
                        detail={[list === 'learn' ? 'To learn' : 'I know', tuneSummary(tune)].filter(Boolean).join(' · ')}
                        onPress={() => openTune(list, tune.id)}
                      />
                    ))}
                  </Card>
                ) : null}
                {chartMatches.length ? (
                  <Card title="Chord charts">
                    {chartMatches.map((s) => (
                      <ListRow key={s.id} icon={<IconTile Icon={ChordChartIcon} size={34} />} title={s.title} detail={s.key || undefined} onPress={() => openChart(s.id)} />
                    ))}
                  </Card>
                ) : null}
                {setlistMatches.length ? (
                  <Card title="Setlists">
                    {setlistMatches.map((s) => (
                      <ListRow
                        key={s.id}
                        icon={<IconTile Icon={SetlistIcon} size={34} />}
                        title={s.name || 'Untitled setlist'}
                        detail={`${s.tuneIds.length} ${s.tuneIds.length === 1 ? 'tune' : 'tunes'}`}
                        onPress={() => router.push({ pathname: '/library/setlist', params: { id: s.id } })}
                      />
                    ))}
                  </Card>
                ) : null}
              </>
            )
          ) : (
            <>
              {!authLoading && !isAuthenticated ? <SignInCard /> : <TodayPracticeCard />}

              <Card
                plain
                title={favoriteTools.length ? 'Favorites' : 'Get started'}
                detail={favoriteTools.length ? undefined : 'Tap ☆ on a tool to pin it here'}
                action={{ label: 'All tools', onPress: () => router.navigate('/tools') }}
              >
                <View className="gap-3">
                  {chunk(pinned, 2).map((row, i) => (
                    <View key={i} className="flex-row gap-3">
                      {row.map((item) => (
                        <ToolTile key={item.href} item={item} favorited={favorites.includes(item.href)} onPress={() => openTool(item)} onToggleFavorite={() => toggleFavorite(item.href)} />
                      ))}
                      {row.length === 1 ? <View className="flex-1" /> : null}
                    </View>
                  ))}
                </View>
              </Card>

              {recents.length ? (
                <Card title="Pick up where you left off">
                  {recents.map((r) => (
                    <ListRow key={r.key} icon={r.icon} title={r.title} detail={recentDetail(r)} onPress={r.onPress} />
                  ))}
                </Card>
              ) : null}

              {tuneOfDay ? (
                <Card title="Tune of the day" action={{ label: 'Jam Practice', onPress: () => router.push('/tool/jam-practice') }}>
                  <View className="gap-2.5">
                    <Text className="font-ui-semibold text-xl font-semibold leading-tight tracking-tight" style={{ color: colors.foreground }}>
                      {tuneOfDay.tune.name}
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {tuneOfDay.key ? <Chip>in {tuneOfDay.key}</Chip> : null}
                      {tuneOfDay.tempo ? <Chip>{tuneOfDay.tempo} BPM</Chip> : null}
                      <Chip muted>{tuneOfDay.tune.timeSignature}</Chip>
                    </View>
                  </View>
                  <Button label="Open the tune" onPress={() => openTune('tunes', tuneOfDay.tune.id)} style={{ alignSelf: 'flex-start' }} />
                </Card>
              ) : (
                // No tunes yet: one slim row rather than a big empty card.
                <ListRow
                  icon={<IconTile Icon={MusicNoteIcon} size={34} />}
                  title="Tune of the day"
                  detail="Add the tunes you know to get one each day"
                  onPress={() => router.navigate('/library')}
                  style={{ backgroundColor: colors.surface }}
                />
              )}

              <Card title="Ear training path" detail="Learn mode in each tool">
                <EarTrainingProgress summaries={learningSummaries} links compact />
              </Card>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** Signed out: what an account adds, in one line, with Sign in and Create an account. */
function SignInCard() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <View className="gap-3 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
      <Text className="font-ui text-[15px] leading-5" style={{ color: colors.foreground }}>
        Sign in to keep a Shed Log, record takes and sync with soniroll.com.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button label="Sign in" onPress={() => router.push('/profile')} />
        <Button label="Create an account" kind="secondary" onPress={() => router.push({ pathname: '/profile', params: { flow: 'signUp' } })} />
      </View>
    </View>
  );
}

export default withScreenLoader(Home);
