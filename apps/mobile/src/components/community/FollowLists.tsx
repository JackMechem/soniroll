import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { LoadingSpinner } from '@/components/LoadingSpinner';
import { UserAvatar } from '@/components/UserAvatar';
import { useAppTheme } from '@/theme/ThemeProvider';

type PersonRow = { userId: Id<'users'>; username: string | null; avatarUrl: string | null };

function PersonList({ people, emptyText }: { people: PersonRow[] | undefined; emptyText: string }) {
  const { colors } = useAppTheme();
  const router = useRouter();

  if (people === undefined) {
    return (
      <View className="items-center py-3">
        <LoadingSpinner size="sm" />
      </View>
    );
  }
  if (people.length === 0) {
    return (
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        {emptyText}
      </Text>
    );
  }
  return (
    <View>
      {people.map((person) =>
        person.username ? (
          <Pressable
            key={person.userId}
            onPress={() => router.push({ pathname: '/u/[username]', params: { username: person.username! } })}
            className="flex-row items-center gap-3 border-b py-2.5"
            style={{ borderColor: `${colors.background}B3` }}
          >
            <UserAvatar url={person.avatarUrl} size="sm" />
            <Text numberOfLines={1} className="font-ui-semibold text-sm" style={{ color: colors.foreground }}>
              {person.username}
            </Text>
          </Pressable>
        ) : (
          <View
            key={person.userId}
            className="flex-row items-center gap-3 border-b py-2.5"
            style={{ borderColor: `${colors.background}B3` }}
          >
            <UserAvatar url={person.avatarUrl} size="sm" />
            <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
              No profile yet
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

/**
 * Native sibling of `apps/web/components/FollowLists.tsx` — who the signed-in user follows, and
 * who follows them. Always allowed for your own `userId` regardless of whether your own profile
 * is public — `convex/follows.ts`'s `listFollowing`/`listFollowers` only gate on `isPublic` for
 * *other* people's lists.
 */
export function FollowLists() {
  const { colors } = useAppTheme();
  const user = useQuery(api.users.current);
  const userId = user?._id;
  const following = useQuery(api.follows.listFollowing, userId ? { userId } : 'skip');
  const followers = useQuery(api.follows.listFollowers, userId ? { userId } : 'skip');

  if (user === undefined) {
    return (
      <View className="items-center justify-center rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="gap-3 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
        <Text className="text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
          Following{following !== undefined ? ` (${following.length})` : ''}
        </Text>
        <PersonList people={following} emptyText="You're not following anyone yet." />
      </View>
      <View className="gap-3 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
        <Text className="text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
          Followers{followers !== undefined ? ` (${followers.length})` : ''}
        </Text>
        <PersonList people={followers} emptyText="No one follows you yet." />
      </View>
    </View>
  );
}
