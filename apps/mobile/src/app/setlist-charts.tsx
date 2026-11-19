import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import type { IRealSong } from '@jam-practice/core/iRealPro';
import type { PublicTune } from '@jam-practice/core/profileTunes';
import type { Tune } from '@jam-practice/core/types';
import { useQuery } from 'convex/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChartPager, type ChartPage } from '@/components/ChartPager';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useSetlists } from '@/lib/useSetlists';
import { useTuneLists } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

const ID_RE = /^[a-z0-9]+$/i;

function publicPages(tunes: PublicTune[]): ChartPage[] {
  return tunes.map((t, i) => ({
    key: `${t.id}-${i}`,
    name: t.name,
    song: (t.linkedChart as unknown as IRealSong) ?? null,
    toKey: t.setKey ?? null,
    tempo: t.setTempo ?? t.tempos.find((x) => x.enabled)?.value ?? null,
  }));
}

/**
 * A setlist's charts, one per page — swipe for the next tune (built for reading on a gig). Works
 * for one of your own setlists (`?mine=<setlist id>`), a Community setlist post (`?post=<id>`) or a
 * shared link (`?shared=<id>`); `?start=` opens on a given tune. The bottom tab bar is hidden here.
 */
function SetlistChartsScreen() {
  const { colors } = useAppTheme();
  const { mine, post, shared, start } = useLocalSearchParams<{ mine?: string; post?: string; shared?: string; start?: string }>();
  const { setlists, ready } = useSetlists();
  const { lists, ready: tunesReady } = useTuneLists();
  const postData = useQuery(api.communityTunes.get, post && ID_RE.test(post) ? { id: post as Id<'communityTunes'> } : 'skip');
  const sharedData = useQuery(api.setlists.getShared, shared ? { id: shared } : 'skip');
  const initial = Math.max(0, Number(start) || 0);
  const [index, setIndex] = useState(initial);

  let title = '';
  let pages: ChartPage[] | null = null;
  if (mine) {
    if (ready && tunesReady) {
      const setlist = setlists.find((s) => s.id === mine);
      const all = [...lists.tunes.tunes, ...lists.learn.tunes];
      title = setlist?.name ?? 'Setlist';
      pages = (setlist?.tuneIds ?? [])
        .map((id) => all.find((t) => t.id === id))
        .filter((t): t is Tune => !!t)
        .map((t) => {
          const o = setlist?.overrides?.[t.id];
          return {
            key: t.id,
            name: t.name,
            chartId: t.chordChartId ?? null,
            toKey: o?.key ?? null,
            tempo: o?.tempo ?? t.tempos.find((x) => x.enabled)?.value ?? null,
          };
        });
    }
  } else if (post) {
    if (postData !== undefined) {
      title = postData?.title ?? 'Setlist';
      pages = postData ? publicPages(postData.tunes) : [];
    }
  } else if (shared) {
    if (sharedData !== undefined) {
      title = sharedData?.title ?? 'Setlist';
      pages = sharedData ? publicPages(sharedData.tunes) : [];
    }
  }

  if (!pages) return <ScreenSpinner />;
  const current = pages[Math.min(index, pages.length - 1)];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title,
          headerTitle: () => (
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} className="font-ui-bold text-lg font-bold tracking-tight" style={{ color: colors.accent }}>
                {current?.name ?? title}
              </Text>
              <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                {pages.length ? `${Math.min(index, pages.length - 1) + 1} of ${pages.length} · ${title}` : title}
              </Text>
            </View>
          ),
        }}
      />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ChartPager pages={pages} initialIndex={Math.min(initial, Math.max(0, pages.length - 1))} onIndexChange={setIndex} />
      </SafeAreaView>
    </View>
  );
}

export default withScreenLoader(SetlistChartsScreen);
