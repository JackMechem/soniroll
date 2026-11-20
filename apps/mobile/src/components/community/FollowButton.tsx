import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Native sibling of `apps/web/components/FollowButton.tsx` — the Follow/Unfollow toggle on a
 * public profile, only ever rendered for a signed-in viewer looking at someone *else's* profile
 * (the caller handles both of those checks before mounting this). `follow`/`unfollow` are both
 * idempotent, so a stray double-tap can't produce a weird state either way.
 */
export function FollowButton({ targetUserId }: { targetUserId: Id<'users'> }) {
  const { colors } = useAppTheme();
  const isFollowing = useQuery(api.follows.followStatus, { targetUserId });
  const followMutation = useMutation(api.follows.follow);
  const unfollowMutation = useMutation(api.follows.unfollow);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      if (isFollowing) await unfollowMutation({ targetUserId });
      else await followMutation({ targetUserId });
    } finally {
      setPending(false);
    }
  }

  const disabled = isFollowing === undefined || pending;

  return (
    <Pressable
      onPress={() => void toggle()}
      disabled={disabled}
      className="min-h-10 justify-center rounded-lg px-4 py-2"
      style={{ backgroundColor: isFollowing ? colors.surface : colors.accent, opacity: disabled ? 0.5 : 1 }}
    >
      <Text
        className="text-sm font-semibold font-ui-semibold"
        style={{ color: isFollowing ? colors.foreground : colors['accent-foreground'] }}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </Text>
    </Pressable>
  );
}
