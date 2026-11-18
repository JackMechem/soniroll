"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PostListItem } from "@/components/CommunityTunes";
import LoadingSpinner from "@/components/LoadingSpinner";

/** Account page's own "Posts" tab — every Community post the signed-in account has made
    (`communityTunes.mine`, uncapped, unlike `CommunityTunes.tsx`'s own browse list which is
    capped at the 60 most recent *across everyone*). Added per a direct, pointed correction: an
    earlier version of Community's own browse view had a Browse/My Posts toggle baked into it,
    which Jack called out directly (from the mobile app's identical screenshot — this page mirrors
    that same fix) as confusing — "my posts should be in the profile section of the app." Reuses
    `PostListItem` from `CommunityTunes.tsx` wholesale (clicking it opens the exact same `/post/
    [id]` full page Community itself uses), so a post looks and opens identically regardless of
    where you found it — only *where this list lives* changed, not how a post is rendered. Every
    row here is already the caller's own by construction (`mine` is scoped server-side), so delete
    is always offered, no `isMine` check needed the way the shared browse list has to do. */
export default function MyPostsTab() {
  const posts = useQuery(api.communityTunes.mine);
  const likedIds = useQuery(api.communityTunes.myLikes);
  const removePost = useMutation(api.communityTunes.remove);
  const [deletingId, setDeletingId] = useState<Id<"communityTunes"> | null>(null);

  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);

  return (
    <section className="flex flex-col gap-4 text-left">
      <p className="text-sm text-muted">
        Everything you&apos;ve posted to Community{posts && posts.length > 0 ? ` (${posts.length})` : ""}. Post something new from the Community page
        itself.
      </p>

      {posts === undefined ? (
        <div className="flex justify-center py-6">
          <LoadingSpinner />
        </div>
      ) : posts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">You haven&apos;t posted anything yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <PostListItem
              key={post.id}
              post={post}
              liked={likedSet.has(post.id)}
              onDelete={() => setDeletingId(post.id)}
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
    </section>
  );
}
