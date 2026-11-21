import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View, Share } from 'react-native';

import { formatMinutesShort, type ProgressCard } from '@jam-practice/core/practiceLog';

import { CalendarCheckIcon, EyeOffIcon, HeartIcon, MusicNoteIcon, SetlistIcon, ShareIcon } from '@/components/icons';
import { UserAvatar } from '@/components/UserAvatar';
import { useAppTheme } from '@/theme/ThemeProvider';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A post's date, short and plain: "just now", "5 min ago", "3 h ago", "2 days ago", then "Oct 18"
    (with the year once it's not this year: "Oct 18, 2025"). Never the phone's numeric format. */
export function postDate(ms: number) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  const d = new Date(ms);
  const label = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? label : `${label}, ${d.getFullYear()}`;
}

export type TunePostSummary = {
  id: Id<'communityTunes'>;
  title: string;
  description: string;
  tuneCount: number;
  tuneNames: string[];
  /** How many of this post's tunes carry a linked chord chart — see `PublicTune.linkedChart`'s
      own doc comment (`@jam-practice/core/profileTunes`). A chart only ever reaches Community by
      riding along on a tune this way; there's no separate "post a chart" flow anymore (there used
      to be a whole second post type for that — removed per an explicit request to stop the two
      concepts being confusing). `PostListItem` shows this as a small badge, and it's what a
      "chord charts" search scope filters on. */
  chartCount: number;
  chartTitles: string[];
  likeCount: number;
  unlisted: boolean;
  /** "setlist" for a setlist post (shown numbered, savable, kept in sync with the poster's setlist). */
  /** 'routine' / 'milestone' posts come from the Shed Log: a routine lists its tasks, a milestone
      carries a progress card (shown on the post's page). */
  kind?: 'setlist' | 'routine' | 'milestone' | null;
  payload?: unknown;
  createdAt: number;
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
  /** Only present on `communityTunes.list`'s own rows (the shared Feed) — `communityTunes.mine`'s
      rows don't need it, since every row returned from there is already the caller's own by
      construction (`MyPostsTab.tsx` always allows delete, regardless of this field). */
  isMine?: boolean;
};

/** "1 tune", "4 charts". */
function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A milestone's headline numbers in words ("1.4 h · 3 days · 3-day streak"; a day report: "45m
    practiced"), from the progress card it carries. */
function milestoneSummary(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const card = payload as Partial<ProgressCard>;
  if (card.kind === 'day' && card.report) return `${formatMinutesShort(card.report.minutes)} practiced`;
  const parts: string[] = [];
  if (typeof card.rangeHours === 'number') parts.push(`${Math.round(card.rangeHours * 10) / 10} h`);
  if (typeof card.rangeDays === 'number') parts.push(plural(card.rangeDays, 'day'));
  if (card.streak) parts.push(`${card.streak}-day streak`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * One post in a list (Community's feed and search, My posts, Liked posts, a profile's posts) — a
 * card: author and how long ago on top; a "Setlist" tag for setlist posts; the title, description
 * and a preview of the first few tunes (numbered for a setlist); then a footer saying how many
 * tunes and charts it has, Share (copies the link) and the like button. Tap opens the post's page; the author opens
 * their profile. Long-press deletes, when `onDelete` is given (your own posts).
 */
export function PostListItem({
  post,
  liked,
  onDelete,
}: {
  post: TunePostSummary;
  liked: boolean;
  onDelete?: () => void;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const toggleLike = useMutation(api.communityTunes.toggleLike);
  const isSetlist = post.kind === 'setlist';
  // A routine's payload carries its tasks; a milestone's carries a progress card (no tunes).
  const routineTasks =
    post.kind === 'routine' && post.payload && typeof post.payload === 'object' && 'tasks' in post.payload
      ? ((post.payload as { tasks?: { title?: string; minutes?: number }[] }).tasks ?? [])
      : null;
  const isMilestone = post.kind === 'milestone';
  const names = routineTasks ? routineTasks.map((t) => t.title || 'Task') : post.tuneNames;
  const preview = isMilestone ? [] : names.slice(0, 3);
  const more = names.length - preview.length;
  const footer = routineTasks
    ? `${plural(routineTasks.length, 'task')} · ${formatMinutesShort(routineTasks.reduce((a, t) => a + (t.minutes ?? 0), 0))}`
    : isMilestone
      ? milestoneSummary(post.payload)
      : [plural(post.tuneCount, 'tune'), post.chartCount > 0 ? plural(post.chartCount, 'chart') : null].filter(Boolean).join(' · ');

  async function handleShare() {
    if (!post) return;
    const url = `https://www.soniroll.com/post/${post.id}`;
    try {
      await Share.share({ message: `${post.title} — ${url}`, url, title: post.title });
    } catch {
      // share sheet dismissed/unavailable — nothing to do.
    }
  }


  return (
    <Pressable
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
      onLongPress={onDelete}
      android_ripple={{ color: colors['surface-hover'] }}
      className="overflow-hidden rounded-2xl"
      style={{ backgroundColor: colors.surface }}
    >
      <View className="gap-2.5 px-4 pb-2 pt-3.5">
        <View className="flex-row items-center gap-2">
          {post.authorUsername ? (
            <Pressable
              onPress={() => router.push({ pathname: '/u/[username]', params: { username: post.authorUsername! } })}
              className="flex-row items-center gap-2"
              hitSlop={6}
            >
              <UserAvatar url={post.authorAvatarUrl ?? null} name={post.authorUsername} size="sm" />
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {post.authorUsername}
              </Text>
            </Pressable>
          ) : null}
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            {post.authorUsername ? '· ' : ''}
            {postDate(post.createdAt)}
          </Text>
          <View className="flex-1" />
          {post.unlisted ? <EyeOffIcon color={colors.muted} size={16} /> : null}
          {isSetlist ? (
            <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: `${colors.accent}22` }}>
              <SetlistIcon color={colors.accent} size={14} />
              <Text className="font-ui-bold text-xs font-bold" style={{ color: colors.accent }}>
                Setlist
              </Text>
            </View>
          ) : null}
          {routineTasks || isMilestone ? (
            <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: `${colors.accent}22` }}>
              <CalendarCheckIcon color={colors.accent} size={14} />
              <Text className="font-ui-bold text-xs font-bold" style={{ color: colors.accent }}>
                {routineTasks ? 'Routine' : 'Milestone'}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="gap-1">
          <Text numberOfLines={2} className="font-ui-bold text-lg font-bold leading-snug" style={{ color: colors.foreground }}>
            {post.title}
          </Text>
          {post.description ? (
            <Text numberOfLines={2} className="font-ui text-sm" style={{ color: colors.muted }}>
              {post.description}
            </Text>
          ) : null}
        </View>

        {preview.length ? (
          <View className="gap-1 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.background }}>
            {preview.map((name, i) => (
              <View key={`${name}-${i}`} className="flex-row items-center gap-2.5">
                {isSetlist || routineTasks ? (
                  <Text className="font-ui-bold w-4 text-right text-sm font-bold tabular-nums" style={{ color: colors.accent }}>
                    {i + 1}
                  </Text>
                ) : (
                  <MusicNoteIcon color={colors.accent} size={14} />
                )}
                <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
                  {name}
                </Text>
              </View>
            ))}
            {more > 0 ? (
              <Text className="font-ui pl-6 text-xs" style={{ color: colors.muted }}>
                +{more} more
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center gap-4 px-4 pb-1.5">
        {/* What's in it, in words ("4 tunes · 2 charts", "5 tasks · 45m"). */}
        {footer ? (
          <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
            {footer}
          </Text>
        ) : null}
        <View className="flex-1" />
        <Pressable onPress={() => void handleShare()} accessibilityLabel="Share this post" className="h-11 w-11 items-center justify-center">
          <ShareIcon color={colors.muted} size={19} />
        </Pressable>
        <Pressable
          onPress={() => void toggleLike({ id: post.id })}
          accessibilityLabel={liked ? 'Unlike this post' : 'Like this post'}
          className="h-11 min-w-11 flex-row items-center gap-1.5 pl-1"
        >
          <HeartIcon color={liked ? colors.danger : colors.muted} size={21} filled={liked} />
          <Text className="font-ui-bold text-sm font-bold tabular-nums" style={{ color: liked ? colors.danger : colors.muted }}>
            {post.likeCount}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
