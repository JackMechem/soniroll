import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PostListItem } from '@/components/community/CommunityTunes';
import { FollowButton } from '@/components/community/FollowButton';
import { PublicTuneList } from '@/components/community/PublicTuneList';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { UserAvatar } from '@/components/UserAvatar';
import { EarTrainingProgress } from '@/components/learning/EarTrainingProgress';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';

/**
 * Native port of `apps/web/components/PublicProfilePage.tsx` — a public profile page, reachable
 * by anyone, signed in or not; this is the shareable link (`sheddex://u/<username>` deep-links
 * here too, via Expo Router's own file-based `u/[username].tsx` route matching web's `/u/
 * [username]` URL exactly). `getPublicByUsername` returns `null` for both "no such username" and
 * "exists but isn't public," deliberately indistinguishable here — a visitor can't tell the
 * difference by probing usernames.
 *
 * "Posts" reuses the *exact* `PostListItem` component Community's own Feed renders with — tapping
 * a row navigates to the same `/post/[id]` full page either way. Gated on the *viewer* being
 * signed in, same as Community's own Feed.
 * Used to be two sections ("Chord Chart Posts"/"Tune Posts") — collapsed into one once Community
 * itself dropped its separate chord-chart-only post type (see `app/tool/community.tsx`'s own doc
 * comment); a post's own `chartCount` still shows as a small badge on each row.
 */
function PublicProfileScreen() {
  const { colors } = useAppTheme();
  const { username } = useLocalSearchParams<{ username: string }>();

  const profile = useQuery(api.profiles.getPublicByUsername, username ? { username } : 'skip');
  const viewer = useQuery(api.users.current);
  const posts = useQuery(
    api.communityTunes.listByUser,
    profile ? { userId: profile.userId as Id<'users'> } : 'skip',
  );
  const likedIds = useQuery(api.communityTunes.myLikes);

  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);

  if (profile === undefined || viewer === undefined) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Profile' }} />
        <LoadingSpinner />
      </View>
    );
  }

  if (profile === null) {
    return (
      <View className="flex-1 items-center justify-center gap-2 px-8" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Profile' }} />
        <Text className="text-center text-xl font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
          This profile isn&apos;t available
        </Text>
        <Text className="text-center text-sm font-ui" style={{ color: colors.muted }}>
          It might not exist, or its owner hasn&apos;t made it public.
        </Text>
      </View>
    );
  }

  const isOwnProfile = viewer?._id === profile.userId;
  // Ear-training levels passed (shown once there's at least one to show off).
  const earTraining = profile.earTraining;
  const levelsPassed = earTraining ? earTraining.interval.passed + earTraining.chord.passed + earTraining.progression.passed : 0;
  const canAdd = !isOwnProfile && !!viewer;
  const postsSettled = !viewer || posts !== undefined;
  const hasPosts = (posts?.length ?? 0) > 0;
  const hasNothing =
    postsSettled &&
    !hasPosts &&
    profile.instruments.length === 0 &&
    profile.tunes.length === 0 &&
    profile.tunesToLearn.length === 0 &&
    levelsPassed === 0;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: profile.username }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}>
          <View className="items-center gap-3">
            <UserAvatar url={profile.avatarUrl} size="xl" />
            <Text className="text-2xl font-bold font-ui-bold" style={{ color: colors.accent }}>
              {profile.username}
            </Text>
            {!isOwnProfile && viewer ? <FollowButton targetUserId={profile.userId as Id<'users'>} /> : null}
            {!isOwnProfile && !viewer ? (
              <Text className="text-xs font-ui" style={{ color: colors.muted }}>
                Sign in to follow {profile.username}.
              </Text>
            ) : null}
          </View>

          {profile.instruments.length > 0 ? (
            <View className="gap-2 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                Instruments
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {profile.instruments.map((name) => (
                  <View key={name} className="rounded-full px-3 py-1" style={{ backgroundColor: colors.background }}>
                    <Text className="text-xs font-ui-semibold" style={{ color: colors.foreground }}>
                      {name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {earTraining && levelsPassed > 0 ? (
            <View className="gap-3 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
              <View className="flex-row items-baseline justify-between">
                <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                  Ear training
                </Text>
                <Text className="text-xs font-ui" style={{ color: colors.muted }}>
                  {levelsPassed} level{levelsPassed === 1 ? '' : 's'} passed
                </Text>
              </View>
              <EarTrainingProgress summaries={earTraining} links={isOwnProfile} card="background" />
            </View>
          ) : null}

          {profile.tunes.length > 0 ? (
            <View className="gap-2 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                Tunes I Know
              </Text>
              <PublicTuneList tunes={profile.tunes} canAdd={canAdd} />
            </View>
          ) : null}

          {profile.tunesToLearn.length > 0 ? (
            <View className="gap-2 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                Tunes to Learn
              </Text>
              <PublicTuneList tunes={profile.tunesToLearn} canAdd={canAdd} />
            </View>
          ) : null}

          {viewer ? (
            posts && posts.length > 0 ? (
              <View className="gap-2 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
                <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                  Posts
                </Text>
                <View className="gap-2">
                  {posts.map((post) => (
                    <PostListItem key={post.id} post={post} liked={likedSet.has(post.id)} />
                  ))}
                </View>
              </View>
            ) : null
          ) : (
            <Text className="text-center text-xs font-ui" style={{ color: colors.muted }}>
              Sign in to see {profile.username}&apos;s Community posts.
            </Text>
          )}

          {hasNothing ? (
            <Text className="text-center text-sm font-ui" style={{ color: colors.muted }}>
              {profile.username} hasn&apos;t added any instruments, tunes, or posts yet.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export default withScreenLoader(PublicProfileScreen);
