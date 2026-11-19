import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ComponentType } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchField } from '@/components/ChordChartList';
import { PostListItem } from '@/components/community/CommunityTunes';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { TabHeader } from '@/components/TabHeader';
import { IconButton } from '@/components/ui';
import { ActionSheet } from '@/components/ActionSheet';
import { FollowersIcon, HeartIcon, MusicNoteIcon, PlusIcon, PostIcon, SetlistIcon, type IconProps } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { UserAvatar } from '@/components/UserAvatar';
import { useSetlists } from '@/lib/useSetlists';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The Community tab, laid out like the Tunes and Chord Charts dashboards: a big title with a +
 * (post tunes, or post one of your setlists), one search across people and posts, stat cards that
 * open Liked posts / Following / My posts, then the latest posts. Every post opens its own page
 * (`/post/[id]`). Posting itself is the full-page composer (`/community/new`), which checks for a
 * public profile.
 */
function CommunityScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const authed = isAuthenticated ? {} : 'skip';
  const posts = useQuery(api.communityTunes.list, authed);
  const likedIds = useQuery(api.communityTunes.myLikes, authed);
  const mine = useQuery(api.communityTunes.mine, authed);
  const me = useQuery(api.users.current, authed);
  const following = useQuery(api.follows.listFollowing, me?._id ? { userId: me._id } : 'skip');
  const removePost = useMutation(api.communityTunes.remove);
  const { setlists } = useSetlists();

  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [pickSetlist, setPickSetlist] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<'communityTunes'> | null>(null);

  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  const people = useQuery(api.profiles.search, trimmed ? { query: trimmed } : 'skip');
  const matchingPosts = useMemo(() => {
    if (!posts || !q) return [];
    const words = q.split(/\s+/);
    return posts.filter((p) => {
      const hay = [p.title, p.authorUsername ?? '', ...p.tuneNames, ...p.chartTitles].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [posts, q]);

  if (isLoading) return <ScreenSpinner />;

  const gated = (go: () => void) => (isAuthenticated ? go() : router.push('/profile'));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <TabHeader title="Community" right={<IconButton primary Icon={PlusIcon} label="New post" onPress={() => gated(() => setNewOpen(true))} />} />
        <View className="px-4 pb-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search people and posts…" />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: bottomSpace, gap: 22 }}
        >
          {trimmed ? (
            <>
              <Section title="People">
                {people === undefined ? (
                  <View className="items-center py-2">
                    <LoadingSpinner size="sm" />
                  </View>
                ) : people.length === 0 ? (
                  <Empty text={`No one named “${trimmed}”.`} />
                ) : (
                  <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
                    {people.map((p, i) => (
                      <Pressable
                        key={p.userId}
                        onPress={() => router.push({ pathname: '/u/[username]', params: { username: p.username } })}
                        android_ripple={{ color: colors['surface-hover'] }}
                        className="flex-row items-center gap-3 px-3"
                        style={{ minHeight: 60, borderTopWidth: i ? 1 : 0, borderTopColor: colors.background }}
                      >
                        <UserAvatar url={p.avatarUrl} />
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                            @{p.username}
                          </Text>
                          {p.instruments.length > 0 ? (
                            <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                              {p.instruments.join(', ')}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Section>
              <Section title="Posts">
                {!isAuthenticated ? (
                  <Empty text="Sign in to search posts." />
                ) : posts === undefined ? (
                  <View className="items-center py-2">
                    <LoadingSpinner size="sm" />
                  </View>
                ) : matchingPosts.length === 0 ? (
                  <Empty text={`No posts match “${trimmed}”.`} />
                ) : (
                  <View className="gap-2">
                    {matchingPosts.map((post) => (
                      <PostListItem key={post.id} post={post} liked={likedSet.has(post.id)} onDelete={post.isMine ? () => setDeletingId(post.id) : undefined} />
                    ))}
                  </View>
                )}
              </Section>
            </>
          ) : (
            <>
              <View className="flex-row gap-3">
                <StatCard Icon={HeartIcon} count={likedIds?.length} label="Liked" onPress={() => gated(() => router.push('/liked-posts'))} />
                <StatCard Icon={FollowersIcon} count={following?.length} label="Following" onPress={() => gated(() => router.push('/community/following'))} />
                <StatCard Icon={PostIcon} count={mine?.length} label="My posts" onPress={() => gated(() => router.push('/account/posts'))} />
              </View>

              <Section title="Latest posts">
                {!isAuthenticated ? (
                  <View className="gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
                    <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                      Sign in to see what people on soniroll have posted — tunes, setlists, and the chord charts that come with them.
                    </Text>
                    <Pressable onPress={() => router.push('/profile')} className="items-center rounded-xl py-3" style={{ backgroundColor: colors.accent }}>
                      <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                        Sign in
                      </Text>
                    </Pressable>
                  </View>
                ) : posts === undefined ? (
                  <View className="items-center py-6">
                    <LoadingSpinner />
                  </View>
                ) : posts.length === 0 ? (
                  <Empty text="Nobody's posted yet — be the first with +." />
                ) : (
                  <View className="gap-2">
                    {posts.map((post) => (
                      <PostListItem key={post.id} post={post} liked={likedSet.has(post.id)} onDelete={post.isMine ? () => setDeletingId(post.id) : undefined} />
                    ))}
                  </View>
                )}
              </Section>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <ActionSheet
        visible={newOpen}
        title="New post"
        onClose={() => setNewOpen(false)}
        actions={[
          { key: 'tunes', icon: <MusicNoteIcon color={colors.accent} size={22} />, label: 'Post tunes', onPress: () => router.push('/community/new') },
          {
            key: 'setlist',
            icon: <SetlistIcon color={colors.accent} size={22} />,
            label: setlists.length ? 'Post a setlist' : 'Post a setlist (make one in Tunes first)',
            onPress: () => (setlists.length ? setPickSetlist(true) : router.push('/library')),
          },
        ]}
      />
      <ActionSheet
        visible={pickSetlist}
        title="Which setlist?"
        onClose={() => setPickSetlist(false)}
        actions={setlists.map((s) => ({
          key: s.id,
          icon: <SetlistIcon color={colors.accent} size={22} />,
          label: `${s.name} (${s.tuneIds.length})`,
          onPress: () => router.push({ pathname: '/community/new', params: { setlist: s.id } }),
        }))}
      />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2">
      <Text className="font-ui-bold px-1 text-lg font-bold" style={{ color: colors.foreground }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui rounded-2xl p-4 text-sm" style={{ backgroundColor: colors.surface, color: colors.muted }}>
      {text}
    </Text>
  );
}

function StatCard({ Icon, count, label, onPress }: { Icon: ComponentType<IconProps>; count: number | undefined; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors['surface-hover'] }} className="flex-1 gap-2 overflow-hidden rounded-2xl p-3" style={{ backgroundColor: colors.surface }}>
      <Icon color={colors.accent} size={22} />
      <View>
        <Text className="font-ui-extrabold text-2xl font-extrabold tabular-nums" style={{ color: colors.foreground }}>
          {count ?? '–'}
        </Text>
        <Text numberOfLines={1} className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default withScreenLoader(CommunityScreen);
