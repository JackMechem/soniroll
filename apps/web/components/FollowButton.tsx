"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import { CheckIcon } from "@/components/tools";

/** The Follow/Unfollow toggle on a public profile — only ever rendered for a signed-in viewer
    looking at someone *else's* profile (`PublicProfilePage.tsx` handles both of those checks
    itself before mounting this). `follow`/`unfollow` (`convex/follows.ts`) are both idempotent, so
    a stray double-click can't produce a weird state either way. */
export default function FollowButton({ targetUserId, size = "md" }: { targetUserId: Id<"users">; size?: "sm" | "md" }) {
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

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={isFollowing === undefined || pending}
      aria-pressed={!!isFollowing}
      title={isFollowing ? "Unfollow" : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md ${size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm"} font-medium transition-colors disabled:opacity-50 ${
        isFollowing
          ? "bg-foreground/[0.05] hover:bg-surface-hover"
          : "bg-accent text-accent-foreground hover:bg-accent-hover"
      }`}
    >
      {isFollowing && <CheckIcon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
