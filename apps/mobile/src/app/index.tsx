import { useConvexAuth } from '@convex-dev/auth/react';
import { fromDateKey } from '@jam-practice/core/practiceLog';
import type { NavLinkInfo } from '@jam-practice/core/navLinks';
import type { Tune } from '@jam-practice/core/types';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { ChordChartIcon, MusicNoteIcon, NAV_LINK_ICONS, SetlistIcon } from '@/components/icons';
import { ACCOUNT_ONLY_HREFS, TOOL_LINKS, ToolSection, ToolTiles, searchTools, toolRoute } from '@/components/ToolGrid';
import { AccountButton } from '@/components/TabHeader';
import { Button, Card, Chip, EmptyText, IconTile, ListRow, PageTitle, SearchField, ToolIcon, useScrolled } from '@/components/ui';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { TodayPracticeCard } from '@/components/shedLog/TodayPracticeCard';
import { Logo } from '@/components/Logo';
import { useToday } from '@/lib/useClock';
import { useRecentItems } from '@/lib/chordChartRecents';
import { useRecentTools } from '@/lib/toolRecents';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useFavorites } from '@/lib/useFavorites';
import { useSetlists } from '@/lib/useSetlists';
import { TUNE_LIST_IDS, tuneSummary, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';
import { EarTrainingProgress } from '@/components/learning/EarTrainingProgress';
import { summarizeLearning } from '@jam-practice/core/learningPath';
import { useLearningProgress } from '@/lib/useLearnSession';
import { prettyKeyName } from '@/lib/keyNames';

/** Shown in place of Favorites until you've starred some tools, in this order. */
const STARTER_HREFS = ['/metronome', '/tuner', '/practice-timer', '/jam-practice'];
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
 * and date, a search (tools, tunes, charts and setlists), then: Today's practice (signed in),
 * Favorites / Get started as compact tiles, a slim sign-in banner (signed out, under the tools so
 * they come first), Pick up where you left off (only once there's something, and only what works
 * signed out when you are), Tune of the day (once you have tunes), and the ear training path as one
 * slim row per trainer. Rows inside Home's cards have no fill of their own (no card-in-card).
 * Every tool is on the Tools tab and everything you've saved is in the Library tab, so Home
 * doesn't repeat them.
 */
function Home() {
  const bottomSpace = useTabBarSpace();
  const router = useRouter();
  const { colors, derived } = useAppTheme();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [query, setQuery] = useState('');
  // Today, from the shared clock: it moves on at midnight (a date kept from when Home mounted
  // stayed on yesterday until something re-rendered it).
  const todayKey = useToday();
  const today = useMemo(() => fromDateKey(todayKey), [todayKey]);
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
    for (const list of TUNE_LIST_IDS) {
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

  const signedOut = !authLoading && !isAuthenticated;
  const favoriteTools = TOOL_LINKS.filter((t) => favorites.includes(t.href));
  const pinned = favoriteTools.length ? favoriteTools : STARTER_HREFS.flatMap((h) => TOOL_BY_HREF.get(h) ?? []);

  // Pick up where you left off: recent tools first, then recent tunes and charts.
  const recents: Recent[] = [];
  for (const href of recentTools) {
    const tool = TOOL_BY_HREF.get(href);
    // Signed out, leave out tools that need an account (they'd only show the sign-in gate).
    if (signedOut && ACCOUNT_ONLY_HREFS.has(href)) continue;
    if (tool && NAV_LINK_ICONS[href]) recents.push({ key: href, kind: 'Tool', icon: <ToolIcon tool={tool} size={34} />, title: tool.label, onPress: () => openTool(tool) });
    if (recents.length >= 3) break;
  }
  for (const item of recentItems) {
    if (recents.length >= 5) break;
    if (item.kind === 'tune') {
      const list = TUNE_LIST_IDS.find((l) => lists[l].tunes.some((t) => t.id === item.id));
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
                {results.tools.length ? (
                  <ToolSection title="Tools" items={results.tools} favorites={favorites} onOpen={openTool} onToggleFavorite={toggleFavorite} />
                ) : null}
                {results.shortcuts.length ? (
                  <ToolSection title="Go to" items={results.shortcuts} onOpen={(item) => router.navigate(toolRoute(item.href))} />
                ) : null}
                {tuneMatches.length ? (
                  <Card title="Tunes">
                    {tuneMatches.map(({ tune, list }) => (
                      <ListRow
                        plain
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
                      <ListRow plain key={s.id} icon={<IconTile Icon={ChordChartIcon} size={34} />} title={s.title} detail={s.key || undefined} onPress={() => openChart(s.id)} />
                    ))}
                  </Card>
                ) : null}
                {setlistMatches.length ? (
                  <Card title="Setlists">
                    {setlistMatches.map((s) => (
                      <ListRow
                        plain
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
              {isAuthenticated ? <TodayPracticeCard /> : null}

              <Card plain title={favoriteTools.length ? 'Favorites' : 'Get started'} action={{ label: 'All tools', onPress: () => router.navigate('/tools') }}>
                <ToolTiles items={pinned} favorites={favorites} onOpen={openTool} onToggleFavorite={toggleFavorite} />
              </Card>

              {signedOut ? <SignInBanner /> : null}

              {recents.length ? (
                <Card title="Pick up where you left off">
                  {recents.map((r) => (
                    <ListRow plain key={r.key} icon={r.icon} title={r.title} detail={recentDetail(r)} onPress={r.onPress} />
                  ))}
                </Card>
              ) : null}

              {/* Only once there are tunes to pick from (the Library's empty state says how). */}
              {tuneOfDay ? (
                <Card title="Tune of the day" action={{ label: 'Jam Practice', onPress: () => router.push('/tool/jam-practice') }}>
                  <View className="gap-2.5">
                    <Text className="font-ui-semibold text-xl font-semibold leading-tight tracking-tight" style={{ color: colors.foreground }}>
                      {tuneOfDay.tune.name}
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {tuneOfDay.key ? <Chip>in {prettyKeyName(tuneOfDay.key)}</Chip> : null}
                      {tuneOfDay.tempo ? <Chip>{tuneOfDay.tempo} BPM</Chip> : null}
                      <Chip muted>{tuneOfDay.tune.timeSignature}</Chip>
                    </View>
                  </View>
                  <Button label="Open the tune" onPress={() => openTune('tunes', tuneOfDay.tune.id)} style={{ alignSelf: 'flex-start' }} />
                </Card>
              ) : null}

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

/** Signed out: a slim banner under the tools — what an account adds, in a line, and Sign in (the
    Account screen also has Create an account). The header's Sign in pill stays too. */
function SignInBanner() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-3 rounded-xl py-2.5 pl-4 pr-2.5" style={{ backgroundColor: colors.surface }}>
      <Text className="font-ui flex-1 text-sm leading-5" style={{ color: colors.muted }}>
        Sign in for a Shed Log, recordings and your tunes on soniroll.com.
      </Text>
      <Button label="Sign in" kind="secondary" onPress={() => router.push('/profile')} />
    </View>
  );
}

export default withScreenLoader(Home);
