import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { Component, type ReactNode, useState } from 'react';
import type { ProgressCard } from '@jam-practice/core/practiceLog';
import { Pressable, ScrollView, Text, View, Share, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PublicSetlist } from '@/components/community/PublicSetlist';
import { PublicTuneList } from '@/components/community/PublicTuneList';
import { EyeOffIcon, HeartIcon, ShareIcon, TrashIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ProgressCardView } from '@/components/shedLog/ProgressCard';
import { UserAvatar } from '@/components/UserAvatar';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';
import { postDate } from '@/components/community/CommunityTunes';

function NotAvailable() {
  const { colors } = useAppTheme();
  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Post' }} />
      <SafeAreaView className="flex-1 items-center justify-center gap-2 px-8" edges={['bottom']}>
        <Text className="text-center text-sm font-ui" style={{ color: colors.muted }}>
          This post isn&apos;t available anymore — it may have been removed, or its author&apos;s
          profile is no longer public.
        </Text>
      </SafeAreaView>
    </View>
  );
}

// A Convex document id is always a plain alphanumeric string (no dashes, no slashes) — the same
// shape check `PROJECT.md`'s own `useChordChartsLibrary` note already establishes for exactly
// this reason: an arbitrary/malformed string reaching this route (a stale deep link, a typo) sent
// straight through as `v.id(...)` throws an uncaught `ArgumentValidationError` deep in Convex's
// own argument validation, before the query handler ever runs. This is a cheap, fast pre-filter
// for the common case (a typo, a stale non-Convex link) — it does NOT fully replicate Convex's
// own server-side id validation (there's no client-exposed check for that), so an alphanumeric
// string that merely *looks* plausible and isn't a real document still reaches the server and
// throws — confirmed directly against the real dev deployment, not assumed. `PostErrorBoundary`
// below is the actual safety net for that case.
const VALID_ID_RE = /^[a-z0-9]+$/i;

/** Catches the render error a malformed-but-plausible id throws (see `VALID_ID_RE`'s own comment)
    and falls back to the same "not available" screen any other bad id already shows — there's no
    way to turn a thrown server error into an ordinary query result otherwise. */
class PostErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return <NotAvailable />;
    return this.props.children;
  }
}

/** A Community post's own full page — what `PostListItem.tsx`'s tappable row (and every other
    "open a post" affordance in this app) navigates to, replacing an earlier bottom-sheet
    `PostDetailModal` per a direct request ("improve the post screen, ideally make it a full page
    that it goes to"). Reached as `/post/[id]`, the same path a copied share link points at
    (`https://www.soniroll.com/post/<id>` — see `PostListItem.tsx`'s own `SHARE_BASE_URL`), so opening a
    shared link and tapping a post from inside the app land on the exact same screen. */
function PostScreen() {
  return (
    <PostErrorBoundary>
      <PostScreenContent />
    </PostErrorBoundary>
  );
}

function PostScreenContent() {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const idLooksValid = !!id && VALID_ID_RE.test(id);
  const post = useQuery(api.communityTunes.get, idLooksValid ? { id: id as Id<'communityTunes'> } : 'skip');
  const likedIds = useQuery(api.communityTunes.myLikes);
  const toggleLike = useMutation(api.communityTunes.toggleLike);
  const removePost = useMutation(api.communityTunes.remove);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const liked = post ? (likedIds ?? []).includes(post.id) : false;

  async function handleShare() {
    if (!post) return;
    const url = `https://www.soniroll.com/post/${post.id}`;
    try {
      await Share.share({ message: `${post.title} — ${url}`, url, title: post.title });
    } catch {
      // share sheet dismissed/unavailable — nothing to do.
    }
  }


  async function handleDelete() {
    if (!post) return;
    await removePost({ id: post.id });
    setConfirmDelete(false);
    router.back();
  }

  if (!idLooksValid || post === null) {
    return <NotAvailable />;
  }

  if (post === undefined) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Post' }} />
        <SafeAreaView className="flex-1 items-center justify-center" edges={['bottom']}>
          <LoadingSpinner />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: post.title }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}>
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1 gap-1.5">
                <Text className="text-xl font-bold font-ui-bold" style={{ color: colors.foreground }}>
                  {post.title}
                </Text>
                <View className="flex-row flex-wrap items-center gap-2">
                  {post.authorUsername ? (
                    <Pressable
                      onPress={() => router.push({ pathname: '/u/[username]', params: { username: post.authorUsername! } })}
                      className="flex-row items-center gap-1.5"
                      hitSlop={4}
                    >
                      <UserAvatar url={post.authorAvatarUrl} size="sm" />
                      <Text className="text-xs font-ui" style={{ color: colors.muted }}>
                        {post.authorUsername}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text className="text-xs font-ui" style={{ color: colors.muted }}>
                    {post.authorUsername ? '· ' : ''}
                    {postDate(post.createdAt)}
                  </Text>
                  {post.unlisted ? (
                    <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: colors.surface }}>
                      <EyeOffIcon color={colors.muted} size={11} />
                      <Text className="text-xs font-ui-semibold" style={{ color: colors.muted }}>
                        Unlisted
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <Pressable
                onPress={() => void toggleLike({ id: post.id })}
                accessibilityLabel={liked ? 'Unlike this post' : 'Like this post'}
                className="items-center gap-0.5 rounded-2xl px-3 py-2"
                style={{ backgroundColor: liked ? `${colors.danger}1a` : colors.surface }}
              >
                <HeartIcon color={liked ? colors.danger : colors.muted} size={26} filled={liked} />
                <Text className="text-sm font-bold font-ui-bold" style={{ color: liked ? colors.danger : colors.muted }}>
                  {post.likeCount}
                </Text>
              </Pressable>
            </View>

            <View className="flex-row gap-2">
              <Pressable
                onPress={() => void handleShare()}
                className="flex-row items-center gap-1.5 rounded-xl px-3 py-2"
                style={{ backgroundColor: colors.surface }}
              >
                <ShareIcon color={colors.foreground} size={15} />
                <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                  Share
                </Text>
              </Pressable>
              {post.isMine ? (
                <Pressable
                  onPress={() => setConfirmDelete(true)}
                  accessibilityLabel="Delete this post"
                  className="flex-row items-center gap-1.5 rounded-xl px-3 py-2"
                  style={{ backgroundColor: colors.surface }}
                >
                  <TrashIcon color={colors.danger} size={15} />
                  <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.danger }}>
                    Delete
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {post.description ? (
              <Text className="text-sm font-ui" style={{ color: colors.muted }}>
                {post.description}
              </Text>
            ) : null}

            {post.kind === 'milestone' && post.payload ? (
              // A Shed Log progress card (posted from "Share your progress"), drawn as on the website.
              <View className="items-center">
                <ProgressCardView card={post.payload as ProgressCard} username={post.authorUsername} width={Math.min(width - 32, 420)} />
              </View>
            ) : post.kind === 'setlist' ? (
              <PublicSetlist title={post.title} tunes={post.tunes} isMine={post.isMine} ownSetlistId={post.setlistId} chartsParams={{ post: post.id }} />
            ) : (
              <PublicTuneList tunes={post.tunes} canAdd />
            )}
          </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete “${post.title}”?`}
        message="This removes it from Community for everyone. It doesn't touch anyone who already added it."
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

export default withScreenLoader(PostScreen);
