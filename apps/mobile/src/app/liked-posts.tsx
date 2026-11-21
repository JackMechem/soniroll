import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PostListItem } from '@/components/community/CommunityTunes';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';

/**
 * Every post the signed-in account has liked — reached via the heart button in Community's own
 * header (top-left, next to the back button; `app/tool/community.tsx`'s own `headerLeft`
 * override). `communityTunes.likedPosts` is already most-recently-liked first and already applies
 * the same privacy filter every other post read in this app does, so this screen is just the
 * rendering: `PostListItem` reused wholesale from `CommunityTunes.tsx` (tapping a row opens the
 * same `/post/[id]` full page every other "list of posts" surface uses). Every row here is liked
 * by definition — `liked` is passed as a constant `true` rather than cross-referencing a separate
 * `myLikes` query, since there's nothing to cross-reference (this list *is* the liked list). */
function LikedPostsScreen() {
  const { colors } = useAppTheme();
  const posts = useQuery(api.communityTunes.likedPosts);
  const removePost = useMutation(api.communityTunes.remove);
  const [deletingId, setDeletingId] = useState<Id<'communityTunes'> | null>(null);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Liked posts' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}>
          {posts === undefined ? (
            <View className="items-center py-8">
              <LoadingSpinner />
            </View>
          ) : posts.length === 0 ? (
            <Text
              className="rounded-2xl p-5 text-center text-sm font-ui"
              style={{ backgroundColor: colors.surface, color: colors.muted }}
            >
              Nothing here yet — tap the heart on a post in Community to save it here.
            </Text>
          ) : (
            <View className="gap-2">
              {posts.map((post) => (
                <PostListItem
                  key={post.id}
                  post={post}
                  liked
                  onDelete={post.isMine ? () => setDeletingId(post.id) : undefined}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={deletingId !== null}
        title="Delete this post?"
        message="This removes it from Community for everyone. It doesn't touch anyone who already added it."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deletingId) void removePost({ id: deletingId });
          setDeletingId(null);
        }}
        onCancel={() => setDeletingId(null)}
      />
    </View>
  );
}

export default withScreenLoader(LikedPostsScreen);
