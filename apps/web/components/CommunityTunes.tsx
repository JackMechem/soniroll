"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import UserAvatar from "@/components/UserAvatar";
import {
  CalendarIcon,
  ChordChartIcon,
  CheckIcon,
  EyeOffIcon,
  HeartIcon,
  NoteIcon,
  SetlistIcon,
  ShareIcon,
  TrashIcon,
} from "@/components/tools";
import { shareLink } from "@/lib/shareLink";
import { type ProgressCard, type PublicRoutine, formatMinutesShort } from "@/lib/practiceLog";
import { ProgressCardView } from "@/components/practicelog/ProgressCard";

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export type TunePostSummary = {
  id: Id<"communityTunes">;
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
  /** "setlist" for a setlist post (shown numbered, savable, kept in sync with the poster's setlist);
      "routine" / "milestone" for a Shed Log routine or progress card (`payload`). */
  kind?: "setlist" | "routine" | "milestone" | null;
  payload?: PublicRoutine | ProgressCard | null;
  createdAt: number;
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
  /** Only present on `communityTunes.list`'s own rows (the shared Browse list) —
      `communityTunes.mine`'s rows don't need it, since every row returned from there is already
      the caller's own by construction (`MyPostsTab.tsx` always allows delete, regardless of this
      field). */
  isMine?: boolean;
};

/** "just now", "5m", "3h", "2d", then a date. */
function timeAgo(ms: number) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return formatDate(ms);
}

/**
 * One post in a list (Community's feed and search, My posts, Liked posts, a profile's posts) — a
 * card, matching the mobile app's: author and how long ago on top, a "Setlist" tag for a setlist
 * post; the title, description and a preview of the first few tunes (numbered for a setlist); then
 * a footer with tune/chart counts, Share (the device's share sheet, or copies the link) and the like
 * button. **The whole card is clickable** (opens `/post/[id]`), except the author (their profile)
 * and the footer buttons — a plain `<li onClick>` with `role="link"` rather than a real `<a>`
 * wrapping the card, since nesting the author link and the buttons inside an `<a>` is invalid HTML
 * that breaks click handling; every nested control stops propagation. `liked` comes from one
 * `myLikes` query per page, never a per-row query.
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
  const router = useRouter();
  const toggleLike = useMutation(api.communityTunes.toggleLike);
  const [copied, setCopied] = useState(false);
  const isSetlist = post.kind === "setlist";
  const routine = post.kind === "routine" && post.payload && "tasks" in post.payload ? post.payload : null;
  const card = post.kind === "milestone" && post.payload && "levels" in post.payload ? post.payload : null;
  const names = routine ? routine.tasks.map((t) => t.title || "Task") : post.tuneNames;
  const preview = card ? [] : names.slice(0, 3);
  const more = names.length - preview.length;

  function open() {
    router.push(`/post/${post.id}`);
  }

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    if ((await shareLink(post.title, `https://www.soniroll.com/post/${post.id}`)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <li
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="flex cursor-pointer flex-col gap-3 rounded-lg bg-surface px-4 pb-2 pt-4 text-left transition-colors hover:border-foreground/20"
    >
      <div className="flex items-center gap-2 text-sm">
        {post.authorUsername && (
          <Link
            href={`/u/${post.authorUsername}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 font-medium hover:underline"
          >
            <UserAvatar url={post.authorAvatarUrl ?? null} />
            {post.authorUsername}
          </Link>
        )}
        <span className="text-muted">
          {post.authorUsername ? "· " : ""}
          {timeAgo(post.createdAt)}
        </span>
        <span className="flex-1" />
        {post.unlisted && <EyeOffIcon className="h-4 w-4 text-muted" />}
        {isSetlist && (
          <span className="flex items-center gap-1 rounded-md bg-foreground/[0.05] px-2 py-0.5 text-xs font-medium text-muted">
            <SetlistIcon className="h-3.5 w-3.5" />
            Setlist
          </span>
        )}
        {(routine || card) && (
          <span className="flex items-center gap-1 rounded-md bg-foreground/[0.05] px-2 py-0.5 text-xs font-medium text-muted">
            <CalendarIcon className="h-3.5 w-3.5" />
            {routine ? "Routine" : "Milestone"}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className="line-clamp-2 text-base font-semibold leading-snug">{post.title}</p>
        {post.description && <p className="line-clamp-2 text-sm text-muted">{post.description}</p>}
      </div>

      {preview.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-foreground/[0.05] px-3 py-2.5">
          {preview.map((name, i) => (
            <div key={`${name}-${i}`} className="flex items-center gap-2.5 text-sm">
              {isSetlist || routine ? (
                <span className="w-4 text-right tabular-nums text-muted">{i + 1}</span>
              ) : (
                <NoteIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
              )}
              <span className="min-w-0 flex-1 truncate">{name}</span>
            </div>
          ))}
          {more > 0 && <p className="pl-6 text-xs text-muted">+{more} more</p>}
        </div>
      )}

      {card && (
        <div className="w-full max-w-[17rem]">
          <ProgressCardView card={card} username={post.authorUsername ?? null} />
        </div>
      )}

      <div className="flex items-center gap-4 text-xs font-medium tabular-nums text-muted">
        {routine ? (
          <span className="flex items-center gap-1">
            <CalendarIcon className="h-4 w-4" />
            {routine.tasks.length} task{routine.tasks.length === 1 ? "" : "s"} · {formatMinutesShort(routine.tasks.reduce((a, t) => a + t.minutes, 0))}
          </span>
        ) : !card && (
          <span className="flex items-center gap-1" title={`${post.tuneCount} tune${post.tuneCount === 1 ? "" : "s"}`}>
            <NoteIcon className="h-4 w-4" />
            {post.tuneCount}
          </span>
        )}
        {post.chartCount > 0 && (
          <span className="flex items-center gap-1" title={`${post.chartCount} chord chart${post.chartCount === 1 ? "" : "s"}`}>
            <ChordChartIcon className="h-4 w-4" />
            {post.chartCount}
          </span>
        )}
        <span className="flex-1" />
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete post"
            title="Delete post"
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-hover hover:text-danger"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => void handleShare(e)}
          aria-label="Share this post"
          title={copied ? "Link copied" : "Share"}
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-hover hover:text-foreground"
        >
          {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <ShareIcon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleLike({ id: post.id });
          }}
          aria-label={liked ? "Unlike this post" : "Like this post"}
          className={`flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium hover:bg-surface-hover ${liked ? "text-danger" : "hover:text-foreground"}`}
        >
          <HeartIcon className="h-4 w-4" filled={liked} />
          {post.likeCount}
        </button>
      </div>
    </li>
  );
}
