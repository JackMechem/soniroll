import { useConvexAuth } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { SearchField } from '@/components/ChordChartList';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui';
import { LibraryHeader } from '@/components/TabHeader';
import { MicrophoneIcon } from '@/components/icons';
import { RecordingRow, useRecordingPlayer, useTuneIndex } from '@/components/recordings/RecordingParts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { recordingsApi } from '@/lib/recordings';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Every saved recording, newest first: search by name, notes or tune; play inline; tap one to
    open it. */
function RecordingsScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const recordings = useQuery(recordingsApi.list, isAuthenticated ? {} : 'skip');
  const { byId } = useTuneIndex();
  const player = useRecordingPlayer();
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!recordings || !q) return recordings ?? [];
    return recordings.filter((r) => {
      const tuneName = r.tuneId ? (byId.get(r.tuneId)?.tune.name ?? '') : '';
      return [r.name, r.notes, tuneName].some((text) => text.toLowerCase().includes(q));
    });
  }, [recordings, byId, query]);

  if (isAuthenticated && recordings === undefined) return <ScreenSpinner />;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']}>
        <LibraryHeader right={<IconButton primary Icon={MicrophoneIcon} label="Record" onPress={() => router.push('/tool/recorder')} />} />
      </SafeAreaView>
      <View className="px-4 pb-2 pt-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search recordings" />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(r) => r._id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomSpace, gap: 10 }}
        ListEmptyComponent={
          <Text className="font-ui py-12 text-center text-sm" style={{ color: colors.muted }}>
            {!isAuthenticated
              ? 'Sign in to see your recordings.'
              : query
                ? 'No recordings match.'
                : 'No recordings yet — tap Record to make one.'}
          </Text>
        }
        renderItem={({ item }) => (
          <RecordingRow
            recording={item}
            tuneName={item.tuneId ? byId.get(item.tuneId)?.tune.name : null}
            player={player}
            onOpen={() => router.push({ pathname: '/recordings/[id]', params: { id: item._id } })}
          />
        )}
      />
    </View>
  );
}

export default withScreenLoader(RecordingsScreen);
