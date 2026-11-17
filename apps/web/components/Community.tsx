"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { PostListItem } from "@/components/CommunityTunes";
import LikedPosts from "@/components/LikedPosts";
import { EmptyCard, PageHeader, PageShell, SearchBox, SectionHeader, menuPosition } from "@/components/library/shared";
import LoadingSpinner from "@/components/LoadingSpinner";
import UserAvatar from "@/components/UserAvatar";
import { CalendarIcon, NoteIcon, PlusIcon, SearchIcon, SetlistIcon } from "@/components/tools";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { useSetlists } from "@/lib/useSetlists";
import { SIGN_IN_PATH } from "@/lib/landing";

type Feed = "latest" | "following" | "popular" | "liked";
const FEEDS: { value: Feed; label: string }[] = [
  { value: "latest", label: "Latest" },
  { value: "following", label: "Following" },
  { value: "popular", label: "Popular" },
  { value: "liked", label: "Liked" },
];
const SEARCH_ID = "community-search";
type KindFilter = "all" | "tunes" | "setlist" | "routine" | "milestone";

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tunes", label: "Tunes" },
  { value: "setlist", label: "Setlists" },
  { value: "routine", label: "Routines" },
  { value: "milestone", label: "Milestones" },
];

/**
 * The Community page: a feed of what people post — tunes, setlists, Shed Log routines and
 * milestone cards. On top, your own strip (picture, @username, posts / followers / following,
 * liked) and New post; one search across people and posts; the feed as Latest / Following /
 * Popular with a filter by kind. On wide screens a right-hand column has your profile card,
 * people from the feed you don't follow yet, and links to Liked / Following / My posts. Signed
 * out: what Community is, Sign up / Sign in, and people search (which works without an account).
 * Every post opens its own page (`/post/[id]`); posting is the full-page composer
 * (`/community/new`), which checks for a public profile.
 */
export default function Community() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const authed = isAuthenticated ? {} : "skip";
  const posts = useQuery(api.communityTunes.list, authed);
  const likedIds = useQuery(api.communityTunes.myLikes, authed);
  const mine = useQuery(api.communityTunes.mine, authed);
  const me = useQuery(api.users.current, authed);
  const profile = useQuery(api.profiles.getMine, authed);
  const following = useQuery(api.follows.listFollowing, me?._id ? { userId: me._id } : "skip");
  const followers = useQuery(api.follows.listFollowers, me?._id ? { userId: me._id } : "skip");
  const removePost = useMutation(api.communityTunes.remove);
  const { setlists } = useSetlists();

  const [query, setQuery] = useState("");
  const [feed, setFeed] = useState<Feed>("latest");
  const [kind, setKind] = useState<KindFilter>("all");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"communityTunes"> | null>(null);

  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);
  const followingNames = useMemo(() => new Set((following ?? []).map((f) => f.username).filter(Boolean)), [following]);
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  const people = useQuery(api.profiles.search, trimmed ? { query: trimmed } : "skip");
  const matchingPosts = useMemo(() => {
    if (!posts || !q) return [];
    const words = q.split(/\s+/);
    return posts.filter((p) => {
      const hay = [p.title, p.authorUsername ?? "", ...p.tuneNames, ...p.chartTitles].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [posts, q]);

  const feedPosts = useMemo(() => {
    if (!posts) return undefined;
    let list = posts;
    if (feed === "following") list = list.filter((p) => p.authorUsername && followingNames.has(p.authorUsername));
    if (kind !== "all") list = list.filter((p) => (kind === "tunes" ? !p.kind : p.kind === kind));
    if (feed === "popular") list = [...list].sort((a, b) => b.likeCount - a.likeCount || b.createdAt - a.createdAt);
    return list;
  }, [posts, feed, kind, followingNames]);

  // People posting lately whom you don't follow yet (newest first, one each).
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: { username: string; avatarUrl: string | null; posts: number }[] = [];
    for (const p of posts ?? []) {
      const u = p.authorUsername;
      if (!u || p.isMine || followingNames.has(u)) continue;
      if (seen.has(u)) {
        const row = out.find((o) => o.username === u);
        if (row) row.posts++;
        continue;
      }
      seen.add(u);
      out.push({ username: u, avatarUrl: p.authorAvatarUrl ?? null, posts: 1 });
    }
    return out.slice(0, 5);
  }, [posts, followingNames]);

  /** The empty Following feed's way out: the search box (people show up as you type), with the
      suggestions under it. */
  function findPeople() {
    const input = document.getElementById(SEARCH_ID);
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus({ preventScroll: true });
  }

  function openNewMenu(e: React.MouseEvent) {
    if (!isAuthenticated) {
      router.push(SIGN_IN_PATH);
      return;
    }
    const pos = menuPosition(e);
    setMenu({
      ...pos,
      items: [
        { label: "Post tunes", icon: <NoteIcon className="h-4 w-4 text-muted" />, onSelect: () => router.push("/community/new") },
        setlists.length
          ? {
              label: "Post a setlist…",
              icon: <SetlistIcon className="h-4 w-4 text-muted" />,
              // A second menu, in the same spot, listing your setlists.
              onSelect: () =>
                setTimeout(
                  () =>
                    setMenu({
                      ...pos,
                      items: [...setlists]
                        .sort((a, b) => b.updatedAt - a.updatedAt)
                        .map((s) => ({ label: `${s.name} (${s.tuneIds.length})`, onSelect: () => router.push(`/community/new?setlist=${encodeURIComponent(s.id)}`) })),
                    }),
                  0,
                ),
            }
          : { label: "Post a setlist (make one in your Library first)", icon: <SetlistIcon className="h-4 w-4 text-muted" />, onSelect: () => router.push("/tunes") },
        { label: "Share a routine or progress (from the Shed Log)", icon: <CalendarIcon className="h-4 w-4 text-muted" />, onSelect: () => router.push("/shed-log/routines") },
      ],
    });
  }

  const postList = (list: NonNullable<typeof posts>) => (
    <ul className="flex flex-col gap-2">
      {list.map((post) => (
        <PostListItem key={post.id} post={post} liked={likedSet.has(post.id)} onDelete={post.isMine ? () => setDeletingId(post.id) : undefined} />
      ))}
    </ul>
  );

  const counts = {
    posts: mine?.length ?? 0,
    followers: followers?.length ?? 0,
    following: following?.length ?? 0,
    liked: likedIds?.length ?? 0,
  };
  const username = profile?.username || null;

  return (
    <PageShell wide fullWidth={false}>
      <PageHeader
        title="Community"
        helpTopic="community"
        actions={
          <button
            type="button"
            onClick={openNewMenu}
            className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-4 w-4" /> New post
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : (
        <div className={`grid gap-6 ${isAuthenticated ? "xl:grid-cols-[minmax(0,1fr)_18rem]" : ""}`}>
          <div className="flex min-w-0 flex-col gap-5">
            {isAuthenticated ? (
              <div className="xl:hidden">
                <MeCard username={username} avatarUrl={profile?.avatarUrl ?? null} isPublic={!!profile?.isPublic} counts={counts} />
              </div>
            ) : (
              <SignedOutHero />
            )}

            <SearchBox id={SEARCH_ID} value={query} onChange={setQuery} placeholder="Search people and posts…" />

            {trimmed ? (
              <>
                <Section title="People">
                  {people === undefined ? (
                    <Spinner />
                  ) : people.length === 0 ? (
                    <EmptyCard>No one named “{trimmed}”.</EmptyCard>
                  ) : (
                    <div className="divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
                      {people.map((p) => (
                        <Link key={p.userId} href={`/u/${p.username}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover">
                          <UserAvatar url={p.avatarUrl} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">@{p.username}</span>
                            <span className="block truncate text-xs text-muted">{p.instruments.length ? p.instruments.join(", ") : "Musician"}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="Posts">
                  {!isAuthenticated ? (
                    <EmptyCard>Sign in to search posts.</EmptyCard>
                  ) : posts === undefined ? (
                    <Spinner />
                  ) : matchingPosts.length === 0 ? (
                    <EmptyCard>No posts match “{trimmed}”.</EmptyCard>
                  ) : (
                    postList(matchingPosts)
                  )}
                </Section>
              </>
            ) : isAuthenticated ? (
              <>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-5 border-b border-foreground/10">
                    {FEEDS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setFeed(f.value)}
                        aria-pressed={feed === f.value}
                        className={`-mb-px flex h-10 items-center border-b-2 text-sm transition-colors ${feed === f.value ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {feed !== "liked" && (
                    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
                      {KIND_FILTERS.map((k) => (
                        <button
                          key={k.value}
                          type="button"
                          onClick={() => setKind(k.value)}
                          aria-pressed={kind === k.value}
                          className={`h-8 shrink-0 rounded-md px-3 text-sm transition-colors ${kind === k.value ? "bg-foreground font-medium text-background" : "bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"}`}
                        >
                          {k.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {feed === "liked" ? (
                  <LikedPosts />
                ) : feedPosts === undefined ? (
                  <Spinner />
                ) : feedPosts.length === 0 ? (
                  <EmptyCard>
                    {feed === "following" ? (
                      <div className="flex flex-col items-start gap-3">
                        <span>
                          {counts.following === 0
                            ? "Follow people to see their posts here."
                            : kind !== "all"
                              ? "Nothing of that kind from people you follow yet."
                              : "Nothing from people you follow yet."}
                        </span>
                        <button type="button" onClick={findPeople} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover">
                          <SearchIcon className="h-4 w-4" /> Find people to follow
                        </button>
                      </div>
                    ) : kind !== "all" ? (
                      "Nothing of that kind yet."
                    ) : (
                      "Nobody's posted yet — be the first with New post."
                    )}
                  </EmptyCard>
                ) : (
                  postList(feedPosts)
                )}
              </>
            ) : null}
          </div>

          {/* Right column on wide screens. */}
          {isAuthenticated && (
            <aside className="hidden flex-col gap-4 xl:flex">
              <div className="sticky top-6 flex flex-col gap-4">
                <MeCard username={username} avatarUrl={profile?.avatarUrl ?? null} isPublic={!!profile?.isPublic} counts={counts} column />
                {suggestions.length > 0 && <Suggestions people={suggestions} />}
              </div>
            </aside>
          )}
          {isAuthenticated && suggestions.length > 0 && !trimmed && (
            <div className="xl:hidden">
              <Suggestions people={suggestions} />
            </div>
          )}
        </div>
      )}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
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
    </PageShell>
  );
}

/** Your strip: picture, @username, and small links to Posts / Followers / Following / Liked. */
function MeCard({
  username,
  avatarUrl,
  isPublic,
  counts,
  column = false,
}: {
  username: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  counts: { posts: number; followers: number; following: number; liked: number };
  column?: boolean;
}) {
  const stats: [number, string, string][] = [
    [counts.posts, "Posts", "/community/posts"],
    [counts.followers, "Followers", "/community/following"],
    [counts.following, "Following", "/community/following"],
    [counts.liked, "Liked", "/community/liked"],
  ];
  return (
    <div className="rounded-lg bg-surface">
      <div className={`flex gap-3 p-4 ${column ? "flex-col" : "flex-col sm:flex-row sm:items-center"}`}>
        <Link href={username ? `/u/${username}` : "/account"} className="flex min-w-0 items-center gap-3">
          <UserAvatar url={avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold hover:underline">{username ? `@${username}` : "Your profile"}</span>
            <span className="block text-xs text-muted">{isPublic ? "Public profile" : "Private — only you can see it"}</span>
          </span>
        </Link>
        <div className={`flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted ${column ? "" : "sm:ml-auto"}`}>
          {stats.map(([n, label, href]) => (
            <Link key={label} href={href} className="transition-colors hover:text-foreground">
              <span className="font-medium tabular-nums text-foreground">{n}</span> {label.toLowerCase()}
            </Link>
          ))}
        </div>
      </div>
      {!isPublic && (
        <Link href="/account?tab=profile" className="flex items-center border-t border-foreground/10 px-4 py-2.5 text-xs text-muted transition-colors hover:text-foreground">
          Make your profile public to post and be found →
        </Link>
      )}
    </div>
  );
}

function Suggestions({ people }: { people: { username: string; avatarUrl: string | null; posts: number }[] }) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface">
      <div className="flex h-11 items-center px-4">
        <h2 className="text-sm font-medium">People to follow</h2>
      </div>
      <div className="divide-y divide-foreground/10">
        {people.map((p) => (
          <Link key={p.username} href={`/u/${p.username}`} className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-hover">
            <UserAvatar url={p.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">@{p.username}</span>
              <span className="block text-xs text-muted">
                {p.posts} recent post{p.posts === 1 ? "" : "s"}
              </span>
            </span>
            <span className="text-xs text-muted">View</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Signed out: what Community is, with sign up / sign in. */
function SignedOutHero() {
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">See what other musicians are working on</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">Tunes and setlists with their charts, practice routines you can add to your own Shed Log, and milestone cards. Follow people, like posts, share your own.</p>
      </div>
      <SignInButtons />
      <p className="text-xs text-muted">You can still search for people below without an account.</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={title} />
      {children}
    </section>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-4">
      <LoadingSpinner size="sm" />
    </div>
  );
}

/** A Community sub-page (Liked, Following, My posts): back to Community, a title, and — signed
    out — a sign-in prompt instead of the content (every one of them needs an account). */
export function CommunitySubPage({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  return (
    <PageShell fullWidth={false}>
      <PageHeader title={title} back={() => router.push("/community")} />
      {isLoading ? (
        <Spinner />
      ) : isAuthenticated ? (
        children
      ) : (
        <EmptyCard>
          <Link href={SIGN_IN_PATH} className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to see this.
        </EmptyCard>
      )}
    </PageShell>
  );
}
