"use client";

import EarTrainingProgress from "@/components/learning/EarTrainingProgress";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import { PostListItem } from "@/components/CommunityTunes";
import FollowButton from "@/components/FollowButton";
import LoadingSpinner from "@/components/LoadingSpinner";
import PublicTuneList from "@/components/PublicTuneList";
import UserAvatar from "@/components/UserAvatar";
import ProfileBanner from "@/components/ProfileBanner";
import { SIGN_IN_PATH } from "@/lib/landing";
import { shareLink } from "@/lib/shareLink";
import { CheckIcon, FlagIcon, ShareIcon, StopwatchIcon } from "@/components/tools";
import { openFeedback } from "@/components/feedback/FeedbackForm";
import { FlameIcon } from "@/components/practicelog/Celebrations";
import { BackButton } from "@/components/library/shared";
import { useRouter } from "next/navigation";
import { type PublicPracticeStats, todayKey } from "@/lib/practiceLog";

/** A public profile page (`app/u/[username]/page.tsx`) — reachable by anyone, signed in or not;
    this is the shareable link. `getPublicByUsername` returns `null` for both "no such username"
    and "that profile exists but isn't public", deliberately indistinguishable from here — a
    visitor can't tell the difference by probing usernames. "Tunes" and "Tunes to Learn" are two
    separate sections, both rendered with `PublicTuneList` (the same Jam-Practice-styled row layout
    for both — see that component for why one component covers both), which also lets a signed-in
    viewer copy a tune they see into their own lists.

    "Posts" is this profile's Community posts (`communityTunes.listByUser`) — added per a direct
    follow-up request ("when looking at another user's profile it should show their posts"),
    reusing the exact `PostListItem` component Community's own Feed renders with, so clicking a
    post from here opens the same `/post/[id]` full page either way. Used to be two sections
    ("Chord Chart Posts"/"Tune Posts") — collapsed into one once
    Community itself dropped its separate chord-chart-only post type (see `Community.tsx`'s own doc
    comment); a post's own `chartCount` still shows as a small badge on each row. Gated on the
    *viewer* being signed in, same as Community's own Posts section — browsing posts needs an
    account there, so it needs one here too, rather than this page quietly having a looser rule for
    the same underlying data depending on which page you reached it from. */
type ProfileTab = "posts" | "tunes" | "learn" | "ear";

export default function PublicProfilePage({ username }: { username: string }) {
  const router = useRouter();
  const [today] = useState(() => todayKey());
  const profile = useQuery(api.profiles.getPublicByUsername, { username, today });
  const viewer = useQuery(api.users.current);
  const userId = profile ? (profile.userId as Id<"users">) : null;
  const posts = useQuery(api.communityTunes.listByUser, userId ? { userId } : "skip");
  const followers = useQuery(api.follows.listFollowers, userId ? { userId } : "skip");
  const following = useQuery(api.follows.listFollowing, userId ? { userId } : "skip");
  const likedIds = useQuery(api.communityTunes.myLikes);
  const [tab, setTab] = useState<ProfileTab | null>(null);
  const [copied, setCopied] = useState(false);

  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);

  if (profile === undefined || viewer === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16">
        <LoadingSpinner />
      </main>
    );
  }

  if (profile === null) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-2 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] text-center sm:px-6 lg:pt-16">
        <h1 className="text-xl font-semibold">This profile isn&apos;t available</h1>
        <p className="text-sm text-muted">It might not exist, or its owner hasn&apos;t made it public.</p>
      </main>
    );
  }

  const isOwnProfile = viewer?._id === profile.userId;
  const earTraining = profile.earTraining;
  const levelsPassed = earTraining ? earTraining.interval.passed + earTraining.chord.passed + earTraining.progression.passed : 0;
  const canAdd = !isOwnProfile && !!viewer;
  const tabs: { id: ProfileTab; label: string; count?: number }[] = [
    { id: "posts", label: "Posts", count: viewer ? posts?.length : undefined },
    { id: "tunes", label: "Tunes I Know", count: profile.tunes.length },
    { id: "learn", label: "Tunes to Learn", count: profile.tunesToLearn.length },
    ...(earTraining && levelsPassed > 0 ? [{ id: "ear" as const, label: "Ear training", count: levelsPassed }] : []),
  ];
  const current: ProfileTab = tab ?? (viewer && (posts?.length ?? 0) > 0 ? "posts" : profile.tunes.length ? "tunes" : "posts");
  const stats: [string, number | undefined][] = [
    ["followers", followers?.length],
    ["following", following?.length],
    ["posts", viewer ? posts?.length : undefined],
  ];

  async function share() {
    if ((await shareLink(`@${profile!.username} on soniroll`, `https://www.soniroll.com/u/${profile!.username}`)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-12">
      <BackButton onClick={() => (window.history.length > 1 ? router.back() : router.push("/community"))} className="self-start" />
      <section className="overflow-hidden rounded-lg bg-surface">
        <ProfileBanner banner={profile.banner} className="h-24 sm:h-32" />
        <div className="-mt-10 flex flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-5">
          <div className="flex items-end gap-3">
            <span className="relative z-10 rounded-full ring-4 ring-surface">
              <UserAvatar url={profile.avatarUrl} size="lg" className="sm:h-20 sm:w-20" />
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2 self-start pt-12">
              <button type="button" onClick={() => void share()} aria-label="Share profile" className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
                {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <ShareIcon className="h-4 w-4" />} <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
              </button>
              {!isOwnProfile && (
                <button
                  type="button"
                  onClick={() => openFeedback({ kind: "report", target: { type: "profile", id: profile.userId, label: `@${profile.username}` } })}
                  aria-label="Report this profile"
                  title="Report this profile"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger"
                >
                  <FlagIcon className="h-4 w-4" />
                </button>
              )}
              {isOwnProfile ? (
                <Link href="/account?tab=profile" className="flex h-9 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
                  Edit profile
                </Link>
              ) : viewer ? (
                <FollowButton targetUserId={profile.userId as Id<"users">} />
              ) : (
                <Link href={SIGN_IN_PATH} className="flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
                  Sign in to follow
                </Link>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">@{profile.username}</h1>
            <p className="mt-0.5 text-sm text-muted">{profile.instruments.length > 0 ? profile.instruments.join(" · ") : "Musician on soniroll"}</p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {stats.map(([label, n]) => (
                <span key={label}>
                  <span className="font-medium tabular-nums text-foreground">{n ?? "–"}</span> {label}
                </span>
              ))}
            </p>
          </div>
        </div>
      </section>

      {profile.practice && <PracticeCard stats={profile.practice} username={profile.username} />}

      <div className="-mx-4 flex gap-5 overflow-x-auto border-b border-foreground/10 px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={current === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-sm transition-colors ${current === t.id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {t.label}
            {t.count !== undefined && <span className="text-xs font-normal tabular-nums text-muted">{t.count}</span>}
          </button>
        ))}
      </div>

      {current === "posts" &&
        (!viewer ? (
          <Empty>
            <Link href={SIGN_IN_PATH} className="font-medium text-accent hover:underline">
              Sign in
            </Link>{" "}
            to see @{profile.username}&apos;s posts.
          </Empty>
        ) : posts === undefined ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner size="sm" />
          </div>
        ) : posts.length === 0 ? (
          <Empty>No posts yet.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {posts.map((post) => (
              <PostListItem key={post.id} post={post} liked={likedSet.has(post.id)} />
            ))}
          </ul>
        ))}

      {current === "tunes" &&
        (profile.tunes.length ? (
          <div className="rounded-lg bg-surface p-4">
            <PublicTuneList tunes={profile.tunes} canAdd={canAdd} />
          </div>
        ) : (
          <Empty>No tunes yet.</Empty>
        ))}

      {current === "learn" &&
        (profile.tunesToLearn.length ? (
          <div className="rounded-lg bg-surface p-4">
            <PublicTuneList tunes={profile.tunesToLearn} canAdd={canAdd} />
          </div>
        ) : (
          <Empty>Nothing on the list yet.</Empty>
        ))}

      {current === "ear" && earTraining && (
        <div className="rounded-lg bg-surface p-4">
          <EarTrainingProgress summaries={earTraining} links={isOwnProfile} />
        </div>
      )}
    </main>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">{children}</p>;
}

const LEVEL_BG = ["var(--surface-hover)", "#0e4429", "#006d32", "#26a641", "#39d353"];

/** Their Shed Log, as far as a profile shows it: the streak (and best), hours, days, goal days,
    the last 26 weeks of practice, and the milestones reached. */
function PracticeCard({ stats, username }: { stats: PublicPracticeStats; username: string }) {
  const lit = stats.streak > 0;
  const fmtH = (h: number) => (h < 10 ? String(Math.round(h * 10) / 10) : String(Math.floor(h)));
  const tiles: [string, string][] = [
    ["Best streak", `${stats.best} ${stats.best === 1 ? "day" : "days"}`],
    ["Practiced", `${fmtH(stats.hours)} h`],
    ["This year", `${stats.days} ${stats.days === 1 ? "day" : "days"}`],
    ["This week", `${fmtH(stats.weekHours)} h`],
  ];
  const weeks = Math.ceil(stats.levels.length / 7);
  return (
    <section className="overflow-hidden rounded-lg bg-surface">
      <div className="flex h-11 items-center gap-2 px-4">
        <h2 className="text-sm font-medium">Shed Log</h2>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted">
          <FlameIcon className={`h-3.5 w-3.5 ${lit ? "log-flame text-foreground" : ""}`} />
          <span className={lit ? "font-medium text-foreground" : ""}>{stats.streak}</span> day streak
        </span>
      </div>
      <div className="flex flex-col gap-4 p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {tiles.map(([l, v]) => (
          <div key={l} className="min-w-0">
            <dt className="text-xs text-muted">{l}</dt>
            <dd className="text-sm font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-muted">
          <span>Last {weeks} weeks</span>
          <span>{stats.goalDays} of the last 30 days on goal</span>
        </div>
        <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))", gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
          {Array.from(stats.levels).map((l, i) => (
            <span key={i} className="aspect-square rounded-[3px]" style={{ background: LEVEL_BG[Number(l)] ?? LEVEL_BG[0] }} />
          ))}
        </div>
      </div>

      {stats.achievements.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted">Milestones</h3>
          <div className="flex flex-wrap gap-1.5">
            {stats.achievements.map((a) => (
              <span
                key={`${a.kind}${a.value}`}
                title={a.kind === "streak" ? `Practiced ${a.value} days in a row` : `${a.value} hours of practice logged`}
                className="flex items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2 py-1 text-xs font-medium"
              >
                {a.kind === "streak" ? <FlameIcon className="h-3.5 w-3.5 text-muted" /> : <StopwatchIcon className="h-3.5 w-3.5 text-muted" />}
                {a.kind === "streak" ? `${a.value}-day streak` : `${a.value} ${a.value === 1 ? "hour" : "hours"}`}
              </span>
            ))}
          </div>
        </div>
      )}
      </div>
      <p className="sr-only">Shed Log stats for @{username}</p>
    </section>
  );
}
