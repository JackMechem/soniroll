import { useConvexAuth } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, IconButton, SearchField, SignInGate } from '@/components/ui';
import { LibraryHeader } from '@/components/TabHeader';
import { MicrophoneIcon } from '@/components/icons';
import { RecordingRow, useRecordingPlayer, useTuneIndex } from '@/components/recordings/RecordingParts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useDeviceUrls } from '@/lib/deviceFiles';
import { recordingsApi } from '@/lib/recordings';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Every saved recording, newest first: search by name, notes or tune (once there are some); play
    inline; tap one to open it. Empty, or signed out, it says so with the button that fixes it. */
function RecordingsScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const recordings = useDeviceUrls(useQuery(recordingsApi.list, isAuthenticated ? {} : 'skip'));
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
        {/* Recording needs an account, so no Record button until you're signed in. */}
        <LibraryHeader right={isAuthenticated ? <IconButton primary Icon={MicrophoneIcon} label="Record" onPress={() => router.push('/tool/recorder')} /> : undefined} />
      </SafeAreaView>
      {recordings?.length ? (
        <View className="px-4 pb-2 pt-3">
          <SearchField value={query} onChangeText={setQuery} placeholder="Search recordings" />
        </View>
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(r) => r._id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: recordings?.length ? 0 : 16, paddingBottom: bottomSpace, gap: 10 }}
        ListEmptyComponent={
          isLoading ? null : !isAuthenticated ? (
            <SignInGate Icon={MicrophoneIcon} title="Your recordings" body="Record takes, name them, keep notes and link them to your tunes. Free with an account." />
          ) : query ? (
            <Text className="font-ui py-12 text-center text-sm" style={{ color: colors.muted }}>
              No recordings match “{query}”.
            </Text>
          ) : (
            <EmptyState
              Icon={MicrophoneIcon}
              title="No recordings yet"
              body="Record a take, with a click if you like, and it shows up here."
              action={{ label: 'Record', Icon: MicrophoneIcon, onPress: () => router.push('/tool/recorder') }}
            />
          )
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
