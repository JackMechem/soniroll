"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, type ReactNode, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import PublicSetlist from "@/components/PublicSetlist";
import { ProgressCardView } from "@/components/practicelog/ProgressCard";
import { AddRoutineButton, RoutinePreview } from "@/components/practicelog/PublicRoutineView";
import PublicTuneList from "@/components/PublicTuneList";
import UserAvatar from "@/components/UserAvatar";
import { CalendarIcon, CheckIcon, EyeOffIcon, FlagIcon, HeartIcon, NoteIcon, SetlistIcon, ShareIcon, TrashIcon, UsersIcon, findToolLink } from "@/components/tools";
import { openFeedback } from "@/components/feedback/FeedbackForm";
import FollowButton from "@/components/FollowButton";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { useConvexAuth } from "@convex-dev/auth/react";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import PageBar from "@/components/PageBar";
import { ROUTINE_COLORS, describePublicRepeat, formatMinutesShort } from "@/lib/practiceLog";
import { shareLink } from "@/lib/shareLink";

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** The header bar: "Community / <post title>" ("Post" until it's loaded or when it isn't there). */
function PostBar({ title = "Post" }: { title?: string }) {
  return <PageBar crumbs={[{ label: "Community", href: "/community" }, { label: title }]} icon={findToolLink("/community")?.icon} />;
}

function NotAvailable() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (!isLoading && !isAuthenticated) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] text-center sm:px-6 lg:pt-20">
        <PostBar />
        <UsersIcon className="h-6 w-6 text-muted" />
        <h2 className="text-2xl font-semibold tracking-tight">Sign in to see this post</h2>
        <p className="text-sm text-muted">Community posts — tunes, setlists, routines and milestones — are for soniroll members. It&apos;s free.</p>
        <SignInButtons />
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-2 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] text-center sm:px-6 lg:pt-20">
      <PostBar />
      <h2 className="text-xl font-semibold">This post isn&apos;t available</h2>
      <p className="text-sm text-muted">
        It may have been removed, or its author&apos;s profile is no longer public.
      </p>
    </main>
  );
}


/** Convex's own id validator (`v.id("communityTunes")`) runs server-side, with no equivalent
    client-exposed check to mirror it exactly — a cheap, plainly-wrong id (containing a dash, a
    slash, anything non-alphanumeric) is rejected here before ever subscribing, but an
    alphanumeric string that merely *looks* plausible and isn't a real document still reaches the
    server and throws `ArgumentValidationError`, which `useQuery` surfaces as an uncaught render
    error, not a `null` result — confirmed directly against the real dev deployment, not assumed.
    `PostErrorBoundary` below is the actual safety net for that case; this regex is just a fast,
    cheap first filter for the common case (a typo, a stale non-Convex link) that doesn't need a
    round trip to find out it's wrong. */
const VALID_ID_RE = /^[a-z0-9]+$/i;

/** Catches the render error a malformed-but-plausible id throws (see `VALID_ID_RE`'s own comment)
    and falls back to the same "not available" page any other bad id already shows — Convex's own
    documented pattern for a query that can throw, since `useQuery` has no built-in way to turn a
    thrown server error into an ordinary return value. */
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

export default function PostPage({ id }: { id: string }) {
  return (
    <PostErrorBoundary>
      <PostPageContent id={id} />
    </PostErrorBoundary>
  );
}

function PostPageContent({ id }: { id: string }) {
  const router = useRouter();
  const idLooksValid = VALID_ID_RE.test(id);
  const post = useQuery(
    api.communityTunes.get,
    idLooksValid ? { id: id as Id<"communityTunes"> } : "skip",
  );
  const likedIds = useQuery(api.communityTunes.myLikes);
  const toggleLike = useMutation(api.communityTunes.toggleLike);
  const removePost = useMutation(api.communityTunes.remove);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const liked = post ? (likedIds ?? []).includes(post.id) : false;

  async function handleShare() {
    if (!post) return;
    if ((await shareLink(post.title, `https://www.soniroll.com/post/${post.id}`)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  async function handleDelete() {
    if (!post) return;
    await removePost({ id: post.id });
    setConfirmDelete(false);
    router.push("/community");
  }

  if (!idLooksValid) {
    return <NotAvailable />;
  }

  if (post === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-20">
        <PostBar />
        <LoadingSpinner />
      </main>
    );
  }

  if (post === null) {
    return <NotAvailable />;
  }

  const routine = post.kind === "routine" && post.payload && "tasks" in post.payload ? post.payload : null;
  const card = post.kind === "milestone" && post.payload && "levels" in post.payload ? post.payload : null;
  const tag =
    post.kind === "setlist"
      ? { label: "Setlist", icon: SetlistIcon }
      : routine
        ? { label: "Routine", icon: CalendarIcon }
        : card
          ? { label: "Milestone", icon: CalendarIcon }
          : { label: post.tunes.length === 1 ? "Tune" : "Tunes", icon: NoteIcon };
  const TagIcon = tag.icon;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:max-w-none lg:px-8 lg:pt-20">
      <PostBar title={post.title} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="min-w-0 overflow-hidden rounded-lg bg-surface">
          {routine && <div className="h-1" style={{ background: ROUTINE_COLORS[routine.color % ROUTINE_COLORS.length] }} />}
          <header className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {post.authorUsername && (
                <Link href={`/u/${post.authorUsername}`} className="flex items-center gap-2 font-medium hover:underline">
                  <UserAvatar url={post.authorAvatarUrl} size="sm" />@{post.authorUsername}
                </Link>
              )}
              <span className="text-muted">· {formatDate(post.createdAt)}</span>
              <span className="flex-1" />
              {post.unlisted && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <EyeOffIcon className="h-3.5 w-3.5" /> Unlisted
                </span>
              )}
              <span className="flex items-center gap-1 rounded-md bg-foreground/[0.05] px-2 py-0.5 text-xs text-muted">
                <TagIcon className="h-3.5 w-3.5" /> {tag.label}
              </span>
            </div>
            <div className="flex items-start gap-3">
              {routine && <RoutineIcon icon={routine.icon} color={routine.color} size="lg" />}
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold leading-tight tracking-tight">{post.title}</h2>
                {post.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{post.description}</p>}
              </div>
            </div>
            {routine && (
              <p className="text-xs text-muted">
                {routine.tasks.length} {routine.tasks.length === 1 ? "task" : "tasks"} · {formatMinutesShort(routine.tasks.reduce((s2, t) => s2 + t.minutes, 0))} in total · {describePublicRepeat(routine.repeat)}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void toggleLike({ id: post.id })}
                aria-label={liked ? "Unlike this post" : "Like this post"}
                className={`flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium tabular-nums transition-colors hover:bg-surface-hover ${liked ? "text-danger" : ""}`}
              >
                <HeartIcon className="h-4 w-4" filled={liked} /> {post.likeCount}
              </button>
              <button type="button" onClick={() => void handleShare()} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
                {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <ShareIcon className="h-4 w-4" />} {copied ? "Link copied" : "Share"}
              </button>
              {routine &&
                (post.isMine && post.routineId ? (
                  <Link href={`/shed-log/routine?id=${encodeURIComponent(post.routineId)}`} className="flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
                    Open in your Shed Log
                  </Link>
                ) : (
                  <AddRoutineButton routine={routine} />
                ))}
              <span className="flex-1" />
              {!post.isMine && (
                <button
                  type="button"
                  onClick={() => openFeedback({ kind: "report", target: { type: "post", id: post.id, label: post.title } })}
                  aria-label="Report this post"
                  title="Report this post"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger"
                >
                  <FlagIcon className="h-4 w-4" />
                </button>
              )}
              {post.isMine && (
                <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Delete post" title="Delete post" className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger">
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </header>
          <div className="border-t border-foreground/10 p-4 sm:p-6">
            {routine ? (
              <RoutinePreview routine={routine} meta={false} />
            ) : card ? (
              <div className="mx-auto w-full max-w-sm">
                <ProgressCardView card={card} username={post.authorUsername ?? null} />
              </div>
            ) : post.kind === "setlist" ? (
              <PublicSetlist title={post.title} tunes={post.tunes} isMine={post.isMine} ownSetlistId={post.setlistId} chartsParam={`post=${post.id}`} />
            ) : (
              <PublicTuneList tunes={post.tunes} canAdd />
            )}
          </div>
        </article>

        {post.authorUsername && <AuthorColumn username={post.authorUsername} avatarUrl={post.authorAvatarUrl ?? null} postId={post.id} isMine={post.isMine} />}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${post.title}"?`}
          message="This removes it from Community for everyone. It doesn't touch anyone who already added it."
          confirmLabel="Delete"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </main>
  );
}

/** Who posted it: their picture and name, Follow, and a few more of their posts. */
function AuthorColumn({ username, avatarUrl, postId, isMine }: { username: string; avatarUrl: string | null; postId: Id<"communityTunes">; isMine: boolean }) {
  const profile = useQuery(api.profiles.getPublicByUsername, { username });
  const viewer = useQuery(api.users.current);
  const posts = useQuery(api.communityTunes.listByUser, profile ? { userId: profile.userId as Id<"users"> } : "skip");
  const more = (posts ?? []).filter((p) => p.id !== postId).slice(0, 4);
  return (
    <aside className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg bg-surface p-4 lg:sticky lg:top-6">
        <div className="flex items-center gap-3">
        <UserAvatar url={avatarUrl} />
        <div className="min-w-0">
          <Link href={`/u/${username}`} className="block truncate text-sm font-semibold hover:underline">
            @{username}
          </Link>
          {profile && profile.instruments.length > 0 && <p className="truncate text-xs text-muted">{profile.instruments.join(", ")}</p>}
        </div>
        </div>
        <div className="flex gap-2">
          {!isMine && viewer && profile && <FollowButton targetUserId={profile.userId as Id<"users">} />}
          <Link href={`/u/${username}`} className="flex h-9 items-center rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover">
            Profile
          </Link>
        </div>
        {more.length > 0 && (
          <div className="-mx-4 -mb-4 flex flex-col border-t border-foreground/10 pt-3 text-left">
            <h2 className="px-4 pb-1 text-xs font-medium text-muted">More from @{username}</h2>
            {more.map((p) => (
              <Link key={p.id} href={`/post/${p.id}`} className="px-4 py-2 transition-colors hover:bg-surface-hover">
                <span className="block truncate text-sm font-medium">{p.title}</span>
                <span className="block text-xs text-muted">
                  {p.kind === "setlist" ? "Setlist" : p.kind === "routine" ? "Routine" : p.kind === "milestone" ? "Milestone" : `${p.tuneCount} tune${p.tuneCount === 1 ? "" : "s"}`} · {p.likeCount} like{p.likeCount === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
