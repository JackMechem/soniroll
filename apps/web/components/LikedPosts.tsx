"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PostListItem } from "@/components/CommunityTunes";
import LoadingSpinner from "@/components/LoadingSpinner";

/** Community's "Liked" section — every post the signed-in account has liked
    (`communityTunes.likedPosts`, most-recently-liked first, already applying the same privacy
    filter every other post read in this app does). Reuses `PostListItem` from `CommunityTunes.tsx`
    wholesale (clicking a row opens the same `/post/[id]` full page every other post list uses),
    same as `MyPostsTab.tsx`. Every row here is liked by definition — `liked` is passed as a
    constant `true` rather than cross-referencing a separate `myLikes` query, since there's nothing
    to cross-reference (this list *is* the liked list). */
export default function LikedPosts() {
  const posts = useQuery(api.communityTunes.likedPosts);
  const removePost = useMutation(api.communityTunes.remove);
  const [deletingId, setDeletingId] = useState<Id<"communityTunes"> | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {posts === undefined ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : posts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">
          Nothing here yet — tap the heart on a post to save it here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <PostListItem
              key={post.id}
              post={post}
              liked
              onDelete={post.isMine ? () => setDeletingId(post.id) : undefined}
            />
          ))}
        </ul>
      )}

      {deletingId && (
        <ConfirmDialog
          title="Delete this post?"
          message="This removes it from Community for everyone. It doesn't touch anyone who already added it."
          confirmLabel="Delete"
          onConfirm={() => {
            void removePost({ id: deletingId });
            setDeletingId(null);
          }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
