import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ComponentType } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PostListItem } from '@/components/community/CommunityTunes';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { TabHeader } from '@/components/TabHeader';
import { EmptyState, IconButton, SearchField, SectionHeader, SignInGate, useScrolled } from '@/components/ui';
import { ActionSheet } from '@/components/ActionSheet';
import { FollowersIcon, HeartIcon, MusicNoteIcon, PlusIcon, PostIcon, SetlistIcon, UsersIcon, type IconProps } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { UserAvatar } from '@/components/UserAvatar';
import { useSetlists } from '@/lib/useSetlists';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The Community tab: a big title with a + (post tunes, or post one of your setlists), one search
 * across people and posts, a compact row of counts that open Liked posts / Following / My posts
 * (only once one of them has something), then the latest posts. Every post opens its own page
 * (`/post/[id]`). Posting itself is the full-page composer (`/community/new`), which checks for a
 * public profile.
 */
function CommunityScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors, derived } = useAppTheme();
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
  const { scrolled, onScroll, scrollEventThrottle } = useScrolled();

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

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Posting needs an account: no + until you're signed in (the gate below says why). */}
        <TabHeader title="Community" right={isAuthenticated ? <IconButton primary Icon={PlusIcon} label="New post" onPress={() => setNewOpen(true)} /> : undefined} />
        <View className="px-4 pb-2" style={{ borderBottomWidth: 1, borderBottomColor: scrolled ? derived.hairline : 'transparent' }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search people and posts" />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
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
              {/* Counts, once they've all arrived and one isn't zero (no "–" next to a "0"). */}
              {likedIds && following && mine && likedIds.length + following.length + mine.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  <CountLink Icon={HeartIcon} count={likedIds.length} label="Liked" onPress={() => router.push('/liked-posts')} />
                  <CountLink Icon={FollowersIcon} count={following.length} label="Following" onPress={() => router.push('/community/following')} />
                  <CountLink Icon={PostIcon} count={mine.length} label="My posts" onPress={() => router.push('/account/posts')} />
                </View>
              ) : null}

              <Section title="Latest posts">
                {!isAuthenticated ? (
                  <SignInGate Icon={UsersIcon} title="See what musicians are sharing" body="Tunes, setlists and the chord charts that come with them. Free with an account." />
                ) : posts === undefined ? (
                  <View className="items-center py-6">
                    <LoadingSpinner />
                  </View>
                ) : posts.length === 0 ? (
                  <EmptyState
                    Icon={PostIcon}
                    title="Nobody's posted yet"
                    body="Share the tunes you play, or a setlist, and be the first."
                    action={{ label: 'New post', Icon: PlusIcon, onPress: () => setNewOpen(true) }}
                  />
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
  return (
    <View className="gap-2">
      <SectionHeader title={title} />
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

/** A count that opens its list: a small pill with an icon, the name and the number. */
function CountLink({ Icon, count, label, onPress }: { Icon: ComponentType<IconProps>; count: number; label: string; onPress: () => void }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${count}`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 flex-row items-center gap-1.5 overflow-hidden rounded-full px-3.5"
      style={{ backgroundColor: derived.fill }}
    >
      <Icon color={colors.muted} size={16} />
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
      <Text className="font-ui text-sm" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
        {count}
      </Text>
    </Pressable>
  );
}

export default withScreenLoader(CommunityScreen);
