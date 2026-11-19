import { NAV_LINKS_DATA, filterNavLinks, hrefToSlug, type NavLinkInfo } from '@jam-practice/core/navLinks';
import type { Tune } from '@jam-practice/core/types';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState, type ComponentType } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import {
  ChevronRightIcon,
  ChordChartIcon,
  MusicNoteIcon,
  NAV_LINK_ICONS,
  SetlistIcon,
  type IconProps,
} from '@/components/icons';
import { TAB_HREFS, ToolRow, ToolTile, chunk } from '@/components/ToolGrid';
import { AccountButton } from '@/components/TabHeader';
import { Button, Card, Chip, EmptyText, IconTile, ListRow, PageTitle, SearchField, ToolIcon } from '@/components/ui';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
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
const TOOLS = NAV_LINKS_DATA.filter((l) => !TAB_HREFS.includes(l.href));
const TOOL_BY_HREF = new Map(TOOLS.map((l) => [l.href, l]));

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Thursday, November 19", like the website's dashboard. */
function todayLabel(d: Date) {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

type Recent = { key: string; icon: React.ReactNode; title: string; detail: string; onPress: () => void };

/**
 * Home — the website's dashboard, made for a phone: the page title and date, a search for tools and
 * tunes, then cards: Pick up where you left off, Tune of the day, Favorites (a starter set until you
 * star some), Your library and the ear training path. Every tool is on the Tools tab.
 */
function Home() {
  const bottomSpace = useTabBarSpace();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [today] = useState(() => new Date());
  const { favorites, toggleFavorite, ready } = useFavorites();
  const recentTools = useRecentTools();
  const recentItems = useRecentItems();
  const { lists, ready: tunesReady } = useTuneLists();
  const { setlists } = useSetlists();
  const { allSongs, totalSongs } = useChordChartsLibrary(null);
  const [learningProgress] = useLearningProgress();
  const learningSummaries = summarizeLearning(learningProgress);

  const q = query.trim();
  const openTool = (item: NavLinkInfo) => router.push(`/tool/${hrefToSlug(item.href)}`);
  const openTune = (list: TuneListId, id: string) => router.push({ pathname: '/library/tune', params: { list, id } });

  const chartMeta = useMemo(() => {
    const m = new Map<string, { title: string; key: string }>();
    for (const s of allSongs) m.set(s.id, { title: s.title, key: s.key });
    return m;
  }, [allSongs]);

  const tuneMatches = useMemo(() => {
    if (!q) return [];
    const words = q.toLowerCase().split(/\s+/);
    const out: { tune: Tune; list: TuneListId }[] = [];
    for (const list of ['tunes', 'learn'] as TuneListId[]) {
      for (const tune of lists[list].tunes) if (words.every((w) => tune.name.toLowerCase().includes(w))) out.push({ tune, list });
    }
    return out.slice(0, 8);
  }, [q, lists]);

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

  const favoriteTools = TOOLS.filter((t) => favorites.includes(t.href));
  const pinned = favoriteTools.length ? favoriteTools : TOOLS.filter((t) => STARTER_HREFS.includes(t.href));

  // Pick up where you left off: recent tools first, then recent tunes and charts.
  const recents: Recent[] = [];
  for (const href of recentTools) {
    const tool = TOOL_BY_HREF.get(href);
    if (tool && NAV_LINK_ICONS[href]) recents.push({ key: href, icon: <ToolIcon tool={tool} size={34} />, title: tool.label, detail: 'Tool', onPress: () => openTool(tool) });
    if (recents.length >= 3) break;
  }
  for (const item of recentItems) {
    if (recents.length >= 5) break;
    if (item.kind === 'tune') {
      const list = (['tunes', 'learn'] as TuneListId[]).find((l) => lists[l].tunes.some((t) => t.id === item.id));
      const tune = list ? lists[list].tunes.find((t) => t.id === item.id) : undefined;
      if (list && tune) {
        recents.push({ key: `t:${tune.id}`, icon: <IconTile Icon={MusicNoteIcon} size={34} />, title: tune.name, detail: 'Tune', onPress: () => openTune(list, tune.id) });
      }
    } else {
      const meta = chartMeta.get(item.id);
      if (meta) {
        recents.push({
          key: `c:${item.id}`,
          icon: <IconTile Icon={ChordChartIcon} size={34} />,
          title: meta.title,
          detail: meta.key ? `Chart · ${meta.key}` : 'Chart',
          onPress: () => router.push({ pathname: '/tool/chord-charts-view', params: { id: item.id } }),
        });
      }
    }
  }

  const toolMatches = q ? filterNavLinks(TOOLS, q) : [];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <View className="h-14 flex-row items-center justify-between px-4">
          <Logo height={26} />
          <AccountButton />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomSpace, gap: 16 }}
        >
          <PageTitle title="Your practice space" detail={todayLabel(today)} />
          <SearchField value={query} onChangeText={setQuery} placeholder="Search tools and tunes" />

          {q ? (
            <>
              <Card title="Tools">
                {toolMatches.length ? (
                  toolMatches.map((item) => (
                    <ToolRow key={item.href} item={item} favorited={favorites.includes(item.href)} onPress={() => openTool(item)} onToggleFavorite={() => toggleFavorite(item.href)} />
                  ))
                ) : (
                  <EmptyText>No tools match “{q}”.</EmptyText>
                )}
              </Card>
              <Card title="Your tunes">
                {tuneMatches.length ? (
                  tuneMatches.map(({ tune, list }) => (
                    <ListRow
                      key={tune.id}
                      icon={<IconTile Icon={MusicNoteIcon} size={34} />}
                      title={tune.name}
                      detail={[list === 'learn' ? 'To learn' : 'I know', tuneSummary(tune)].filter(Boolean).join(' · ')}
                      onPress={() => openTune(list, tune.id)}
                    />
                  ))
                ) : (
                  <EmptyText>No tunes match.</EmptyText>
                )}
              </Card>
            </>
          ) : (
            <>
              <Card title="Pick up where you left off">
                {recents.length ? (
                  recents.map((r) => <ListRow key={r.key} icon={r.icon} title={r.title} detail={r.detail} onPress={r.onPress} />)
                ) : (
                  <EmptyText>The tools, tunes and charts you open will show up here.</EmptyText>
                )}
              </Card>

              <Card title="Tune of the day" action={tuneOfDay ? { label: 'Jam Practice', onPress: () => router.push('/tool/jam-practice') } : undefined}>
                {tuneOfDay ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <EmptyText>Add the tunes you know and one comes up here each day.</EmptyText>
                    <Button label="Add tunes" kind="secondary" onPress={() => router.push('/library')} style={{ alignSelf: 'flex-start' }} />
                  </>
                )}
              </Card>

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

              <Card title="Your library" action={{ label: 'Library', onPress: () => router.push('/library') }}>
                <StatRow Icon={MusicNoteIcon} label="Tunes" value={lists.tunes.tunes.length + lists.learn.tunes.length} onPress={() => router.push('/library')} />
                <StatRow Icon={SetlistIcon} label="Setlists" value={setlists.length} onPress={() => router.push(setlists.length ? '/library/setlists' : '/library')} />
                <StatRow Icon={ChordChartIcon} label="Chord charts" value={totalSongs} onPress={() => router.push('/charts')} />
              </Card>

              <Card title="Ear training path" detail="Learn mode in each tool">
                <EarTrainingProgress summaries={learningSummaries} links />
              </Card>

            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** A library count: icon, name, the number, and a chevron. */
function StatRow({ Icon, label, value, onPress }: { Icon: ComponentType<IconProps>; label: string; value: number; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <ListRow
      icon={<IconTile Icon={Icon} size={34} />}
      title={label}
      onPress={onPress}
      right={
        <View className="flex-row items-center gap-1">
          <Text className="font-ui-semibold text-[15px] font-semibold tabular-nums" style={{ color: colors.muted }}>
            {value}
          </Text>
          <ChevronRightIcon color={colors.muted} size={18} />
        </View>
      }
    />
  );
}

export default withScreenLoader(Home);
