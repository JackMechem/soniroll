import { api } from '@jam-practice/convex/_generated/api';
import { useQuery } from 'convex/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { PublicSetlist } from '@/components/community/PublicSetlist';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { SetlistIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A setlist someone shared by link (`/setlist/<id>`, also the web link's path) — open to anyone,
 * signed in or not. Shows its tunes in order (each with its chord chart, if it came with one) with
 * per-tune Add/Learn, and **Save as my setlist**: copies any tunes you don't have yet into Tunes I
 * Know (matched by name) and makes a setlist of them, in the same order.
 */
function SharedSetlistScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const shared = useQuery(api.setlists.getShared, id ? { id } : 'skip');

  if (shared === undefined) return <ScreenSpinner />;
  if (shared === null) {
    return (
      <View className="flex-1 items-center justify-center px-10" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Setlist' }} />
        <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
          This setlist isn&apos;t shared anymore, or the link is wrong.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: shared.title }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: bottomSpace }}>
        <View className="gap-1">
          <View className="flex-row items-center gap-2">
            <SetlistIcon color={colors.accent} size={22} />
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
              {`Setlist · ${shared.tunes.length} tunes${shared.ownerUsername ? ` · shared by @${shared.ownerUsername}` : ''}`}
            </Text>
          </View>
          {shared.description ? (
            <Text className="font-ui text-base" style={{ color: colors.foreground }}>
              {shared.description}
            </Text>
          ) : null}
        </View>
        <PublicSetlist
          title={shared.title}
          tunes={shared.tunes}
          isMine={shared.isMine}
          ownSetlistId={shared.setlistId}
          chartsParams={{ shared: shared.id }}
        />
      </ScrollView>
    </View>
  );
}

export default withScreenLoader(SharedSetlistScreen);
