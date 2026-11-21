import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PostListItem } from '@/components/community/CommunityTunes';
import { PlusIcon, PostIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/ui';

/**
 * Profile's own "Posts" tab — every Community post the signed-in account has made
 * (`communityTunes.mine`, uncapped, unlike `CommunityTunes.tsx`'s own Feed which is capped at the
 * 60 most recent *across everyone*). Added per a direct, pointed correction: an earlier version of
 * Community's Feed had its own "Browse/My Posts" toggle baked in, which Jack called out directly
 * from a screenshot as confusing — "my posts should be in the profile section of the app." Reuses
 * `PostListItem` from `CommunityTunes.tsx` wholesale (same row, and tapping it opens the exact
 * same `/post/[id]` full page Community itself uses), so a post looks and opens identically
 * regardless of where you found it — only *where this list lives* changed, not how a post is
 * rendered. Every row here is already the caller's own by construction (`mine` is scoped
 * server-side), so delete is always offered, no `isMine` check needed the way Community's own
 * shared Feed has to do. */
export function MyPostsTab() {
  const router = useRouter();
  const posts = useQuery(api.communityTunes.mine);
  const likedIds = useQuery(api.communityTunes.myLikes);
  const removePost = useMutation(api.communityTunes.remove);
  const [deletingId, setDeletingId] = useState<Id<'communityTunes'> | null>(null);

  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);

  return (
    // The posts are cards of their own, straight on the page (not inside another card).
    <View className="gap-3">
      {posts === undefined ? (
        <View className="items-center py-6">
          <LoadingSpinner />
        </View>
      ) : posts.length === 0 ? (
        <EmptyState
          Icon={PostIcon}
          title="You haven't posted anything yet"
          body="Share the tunes you play, a setlist or a routine."
          action={{ label: 'New post', Icon: PlusIcon, onPress: () => router.push('/community/new') }}
        />
      ) : (
        <View className="gap-2">
          {posts.map((post) => (
            <PostListItem
              key={post.id}
              post={post}
              liked={likedSet.has(post.id)}
              onDelete={() => setDeletingId(post.id)}
            />
          ))}
        </View>
      )}

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
