"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import Select from "@/components/Select";
import LoadingSpinner from "@/components/LoadingSpinner";
import { type GitHubIssue, type GitHubItem, issueByRef, recentCommits, recentIssues, recentPulls, repoBranches } from "@/lib/githubWork";
import { type InboxRow, useInbox } from "@/components/admin/useInbox";
import { LibraryPage } from "@/components/library/ui";
import { BugIcon, CloseIcon, FeedbackIcon, FlagIcon, SearchIcon, ShieldIcon, SparkIcon, TrashIcon, UsersIcon } from "@/components/tools";
import { VERSION_LABEL } from "@/lib/version";
import { useSiteStatus } from "@/lib/useSiteStatus";
import Mayday from "@/components/admin/Mayday";
import ChangelogAdmin from "@/components/admin/ChangelogAdmin";
import Analytics from "@/components/admin/Analytics";

type Tab = "overview" | "analytics" | "inbox" | "posts" | "users" | "changelog" | "mayday";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "analytics", label: "Analytics" },
  { id: "inbox", label: "Inbox" },
  { id: "posts", label: "Posts" },
  { id: "users", label: "Users" },
  { id: "changelog", label: "Changelog" },
  { id: "mayday", label: "Mayday" },
];

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/**
 * `/admin` — only for the site admin (every query and mutation behind it checks on the server).
 * Overview (numbers and sign-ups), Inbox (feedback and reports: status, notes, reply, delete),
 * Posts (every community post; remove), Users (every account; hide a profile, delete an account).
 */
export default function AdminPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const isAdmin = useQuery(api.admin.amIAdmin, isAuthenticated ? {} : "skip");
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "overview") as Tab;
  const stats = useQuery(api.admin.stats, isAdmin ? {} : "skip");
  const role = useQuery(api.admin.myRole, isAdmin ? {} : "skip");
  const site = useSiteStatus();
  const maydayOn = site
    ? [site.maintenance, site.communityOff, site.postingPaused, site.signupsPaused, site.uploadsPaused, site.feedbackPaused, !!site.banner].filter(Boolean).length
    : 0;

  if (isLoading || (isAuthenticated && isAdmin === undefined))
    return (
      <LibraryPage>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </LibraryPage>
    );
  if (!isAdmin)
    return (
      <LibraryPage>
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-1 rounded-lg border border-dashed border-foreground/15 p-8 text-center">
          <p className="text-sm font-medium">Nothing here</p>
          <p className="text-sm text-muted">This page isn&apos;t available.</p>
        </div>
      </LibraryPage>
    );

  const go = (t: Tab) => router.replace(t === "overview" ? "/admin" : `/admin?tab=${t}`, { scroll: false });

  return (
    <LibraryPage>
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">Admin</h1>
            <p className="text-sm text-muted">
              soniroll {VERSION_LABEL} · {role === "owner" ? "Owner" : "Admin"}
            </p>
          </div>
          {stats && stats.newFeedback > 0 && (
            <button type="button" onClick={() => go("inbox")} className="h-9 shrink-0 self-start rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover sm:self-auto">
              {stats.newFeedback} new in the inbox
            </button>
          )}
        </div>
        <nav className="-mx-4 flex gap-5 overflow-x-auto border-b border-foreground/10 px-4 sm:mx-0 sm:px-0">
          {TABS.map((t) => {
            const badge = t.id === "inbox" ? stats?.newFeedback : t.id === "posts" ? stats?.reports : t.id === "mayday" ? maydayOn : 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => go(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`-mb-px flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-sm transition-colors ${
                  tab === t.id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {t.label}
                {!!badge && <span className="min-w-5 rounded-full bg-foreground/10 px-1.5 text-center text-[11px] font-medium tabular-nums text-foreground">{badge}</span>}
              </button>
            );
          })}
        </nav>
      </header>

      {tab === "overview" && <Overview onGo={go} />}
      {tab === "inbox" && <Inbox />}
      {tab === "posts" && <Posts />}
      {tab === "users" && <Users />}
      {tab === "mayday" && <Mayday />}
      {tab === "changelog" && <ChangelogAdmin />}
      {tab === "analytics" && <Analytics />}
    </LibraryPage>
  );
}

// ---------------------------------------------------------------- overview

/** One number in the overview's bordered grid: a small label, the number, and a line under it. */
function Stat({ label, value, sub, onClick }: { label: string; value: number | string; sub?: string; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`flex flex-col items-start gap-1 bg-surface p-4 text-left ${onClick ? "transition-colors hover:bg-surface-hover" : ""}`}
    >
      <span className="text-xs text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </Comp>
  );
}

/** A bordered panel with a title row (and an optional link on the right). */
function Panel({ title, detail, action, children, bodyClass = "p-4" }: { title: string; detail?: string; action?: { label: string; onClick: () => void }; children: ReactNode; bodyClass?: string }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface">
      <div className="flex h-11 shrink-0 items-center gap-2 px-4">
        <h2 className="shrink-0 text-sm font-medium">{title}</h2>
        {detail && <span className="truncate text-xs text-muted">{detail}</span>}
        {action && (
          <button type="button" onClick={action.onClick} className="ml-auto shrink-0 text-xs text-muted transition-colors hover:text-foreground">
            {action.label}
          </button>
        )}
      </div>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

function Overview({ onGo }: { onGo: (t: Tab) => void }) {
  const s = useQuery(api.admin.stats, {});
  const { rows: feedback } = useInbox();
  const users = useQuery(api.admin.users, {});
  const [now] = useState(() => Date.now());
  if (!s)
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  const max = Math.max(1, ...s.signups);
  const total30 = s.signups.reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-foreground/[0.05] bg-foreground/10 lg:grid-cols-4">
        <Stat label="Accounts" value={s.users} sub={`+${s.newThisWeek} this week`} onClick={() => onGo("users")} />
        <Stat label="Community posts" value={s.posts} sub={`+${s.postsThisWeek} this week`} onClick={() => onGo("posts")} />
        <Stat label="Inbox" value={s.openFeedback} sub={s.newFeedback ? `${s.newFeedback} new` : "all read"} onClick={() => onGo("inbox")} />
        <Stat label="Open reports" value={s.reports} sub={s.reports ? "needs a look" : "none"} onClick={() => onGo("inbox")} />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Sign-ups" detail={`Last 30 days · ${total30} new`} bodyClass="flex flex-col gap-3 p-4">
          <div className="flex gap-6 text-xs text-muted">
            <span>
              <span className="block text-base font-semibold tabular-nums text-foreground">{s.publicProfiles}</span>public profiles
            </span>
            <span>
              <span className="block text-base font-semibold tabular-nums text-foreground">{s.teachers}</span>teachers
            </span>
            <span>
              <span className="block text-base font-semibold tabular-nums text-foreground">{s.students}</span>students
            </span>
          </div>
          <div className="flex h-40 items-end gap-1 border-b border-foreground/10">
            {s.signups.map((n, i) => (
              <div key={i} className="group relative flex h-full flex-1 items-end">
                <div
                  className="w-full rounded-t-sm bg-accent transition-opacity group-hover:opacity-80"
                  style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 100)}%`, opacity: n ? 1 : 0.15 }}
                />
                <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background group-hover:block">
                  {n} · {new Date(now - (29 - i) * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted">
            <span>30 days ago</span>
            <span>today</span>
          </div>
        </Panel>
        <Panel title="Latest in the inbox" action={{ label: "Open inbox", onClick: () => onGo("inbox") }} bodyClass="flex flex-col gap-0.5 p-2">
          {!feedback ? (
            <div className="p-2">
              <LoadingSpinner size="sm" />
            </div>
          ) : feedback.length === 0 ? (
            <p className="p-2 text-sm text-muted">Nothing yet. Feedback from the site lands here.</p>
          ) : (
            feedback.slice(0, 5).map((f) => (
              <button key={f.id} type="button" onClick={() => onGo("inbox")} className="flex items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-hover">
                <KindBadge kind={f.kind} small />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm">{f.message}</span>
                  <span className="text-[11px] text-muted">
                    {f.from?.username ? `@${f.from.username}` : (f.email ?? "Anonymous")} · {ago(f.createdAt)}
                  </span>
                </span>
                {f.status === "new" && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New" />}
              </button>
            ))
          )}
        </Panel>
      </div>
      <Panel title="Newest accounts" action={{ label: "All accounts", onClick: () => onGo("users") }} bodyClass="grid gap-0.5 p-2 sm:grid-cols-2 xl:grid-cols-4">
          {(users ?? []).slice(0, 8).map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-md p-2">
              <Avatar url={u.avatarUrl} name={u.username ?? u.email ?? "?"} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{u.username ? `@${u.username}` : (u.name ?? "No username yet")}</span>
                <span className="block truncate text-xs text-muted">{ago(u.joined)}</span>
              </span>
            </div>
          ))}
      </Panel>
    </div>
  );
}

function Avatar({ url, name, size = 9 }: { url: string | null; name: string; size?: number }) {
  const dim = size === 9 ? "h-9 w-9 text-sm" : "h-11 w-11 text-base";
  // eslint-disable-next-line @next/next/no-img-element -- remote avatar
  if (url) return <img src={url} alt="" className={`${dim} shrink-0 rounded-full object-cover`} />;
  return (
    <span className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-foreground/10 font-medium text-foreground`}>
      {name.replace(/^@/, "").charAt(0).toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------- inbox

const KIND_META = {
  bug: { label: "Bug", Icon: BugIcon, cls: "text-muted" },
  feature: { label: "Idea", Icon: SparkIcon, cls: "text-muted" },
  other: { label: "Other", Icon: FeedbackIcon, cls: "text-muted" },
  report: { label: "Report", Icon: FlagIcon, cls: "text-danger" },
} as const;

function KindBadge({ kind, small = false }: { kind: keyof typeof KIND_META; small?: boolean }) {
  const m = KIND_META[kind];
  return small ? (
    <m.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${m.cls}`} aria-label={m.label} />
  ) : (
    <span className="flex items-center gap-1 rounded-md bg-foreground/[0.05] px-1.5 py-0.5 text-xs font-medium">
      <m.Icon className={`h-3.5 w-3.5 ${m.cls}`} /> {m.label}
    </span>
  );
}

const STATUSES = [
  { id: "new", label: "New" },
  { id: "seen", label: "Seen" },
  { id: "planned", label: "Planned" },
  { id: "done", label: "Done" },
  { id: "closed", label: "Closed" },
] as const;
type Status = (typeof STATUSES)[number]["id"];

function Inbox() {
  const { rows, shared, error: inboxError, change, createIssue, moveToShared, errorText } = useInbox();
  const removePost = useMutation(api.admin.removePost);
  const [view, setView] = useState<"open" | Status | "all">("open");
  const [kind, setKind] = useState<keyof typeof KIND_META | "all">("all");
  const [q, setQ] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (view === "all" || (view === "open" ? r.status === "new" || r.status === "seen" : r.status === view)) &&
        (kind === "all" || r.kind === kind) &&
        (!t || `fb-${r.number ?? ""} ${r.issue ? `#${r.issue.number} ${r.issue.title}` : ""} ${r.version ?? ""} ${r.source ?? ""} ${r.message} ${r.email ?? ""} ${r.from?.username ?? ""} ${r.page ?? ""} ${r.target?.label ?? ""} ${r.links.map((l) => `${l.ref} ${l.title}`).join(" ")}`.toLowerCase().includes(t.replace(/^fb\s+/, "fb-"))),
    );
  }, [rows, view, kind, q]);

  if (!rows)
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  const count = (v: typeof view) => rows.filter((r) => (v === "all" ? true : v === "open" ? r.status === "new" || r.status === "seen" : r.status === v)).length;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3 rounded-lg bg-surface p-2 lg:sticky lg:top-6">
        <div className="flex flex-col gap-0.5">
          {(["open", ...STATUSES.map((s) => s.id), "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`flex h-8 items-center justify-between rounded-md px-2.5 text-sm transition-colors ${view === v ? "bg-surface-hover font-medium text-foreground" : "text-foreground/75 hover:bg-surface-hover/60 hover:text-foreground"}`}
            >
              {v === "open" ? "Open" : v === "all" ? "Everything" : STATUSES.find((s) => s.id === v)!.label}
              <span className="text-xs tabular-nums text-muted">{count(v)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-foreground/10 px-1 pb-1 pt-3">
          <button
            type="button"
            onClick={() => setKind("all")}
            aria-pressed={kind === "all"}
            className={`h-7 rounded-md border px-2 text-xs font-medium transition-colors ${kind === "all" ? "border-foreground/30 bg-surface-hover text-foreground" : "border-foreground/10 text-muted hover:text-foreground"}`}
          >
            All kinds
          </button>
          {(Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`h-7 rounded-md border px-2 text-xs font-medium transition-colors ${kind === k ? "border-foreground/30 bg-surface-hover text-foreground" : "border-foreground/10 text-muted hover:text-foreground"}`}
            >
              {KIND_META[k].label}
            </button>
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-col gap-3">
        <SearchField value={q} onChange={setQ} placeholder="Search messages, people, pages, FB-12, #45" />
        <p className="px-1 text-xs text-muted">
          {shared
            ? "The shared inbox: bugs, ideas and notes from every deployment (reports about posts stay on the one they're about). Refreshes every 15 seconds."
            : "This deployment's inbox. Refreshes every 15 seconds."}
        </p>
        {inboxError && <p className="rounded-md border border-danger/30 px-3 py-2 text-sm text-danger">Couldn&apos;t reach the inbox: {inboxError}</p>}
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
            {rows.length ? "Nothing here." : "No feedback yet — it'll show up here as people send it."}
          </p>
        ) : (
          list.map((f) => (
            <article key={f.id} className={`flex min-w-0 flex-col gap-3 rounded-lg border bg-surface p-4 ${f.status === "new" ? "border-foreground/30" : "border-foreground/10"}`}>
              <div className="flex flex-wrap items-center gap-2">
                {f.number !== null && <FeedbackId number={f.number} />}
                <KindBadge kind={f.kind} />
                {f.status === "new" && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">New</span>}
                <span className="min-w-0 text-xs text-muted [overflow-wrap:anywhere]">
                  {f.from ? (
                    f.from.username ? (
                      <Link href={`/u/${f.from.username}`} className="font-medium text-foreground hover:underline">
                        @{f.from.username}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{f.from.name ?? "Account without a username"}</span>
                    )
                  ) : (
                    "Signed out"
                  )}
                  {f.email ? ` · ${f.email}` : ""} · {ago(f.createdAt)}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  {f.email && (
                    <a
                      href={`mailto:${f.email}?subject=${encodeURIComponent(`Re: your ${KIND_META[f.kind].label.toLowerCase()} on soniroll`)}&body=${encodeURIComponent(`\n\n> ${f.message.split("\n").join("\n> ")}`)}`}
                      className="flex h-8 items-center rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover"
                    >
                      Reply
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label="Delete"
                    title="Delete"
                    onClick={() => setConfirm({ title: "Delete this?", body: "It's gone for good (including any screenshot).", action: () => void change(f, { op: "delete", id: f.id }) })}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </span>
              </div>
              {f.target && (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-background px-3 py-2 text-sm">
                  <FlagIcon className="h-4 w-4 text-danger" />
                  Reported {f.target.type}: <span className="font-medium">{f.target.label}</span>
                  <span className="ml-auto flex gap-1.5">
                    <Link
                      href={f.target.type === "post" ? `/post/${f.target.id}` : `/u/${f.target.label.replace(/^@/, "")}`}
                      className="flex h-8 items-center rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover"
                    >
                      Open
                    </Link>
                    {f.target.type === "post" && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirm({
                            title: `Remove "${f.target!.label}"?`,
                            body: "The post is deleted for everyone, and reports about it are closed.",
                            action: () => void removePost({ id: f.target!.id as Id<"communityTunes"> }),
                          })
                        }
                        className="flex h-8 items-center rounded-md bg-danger px-2.5 text-xs font-medium text-background hover:opacity-90"
                      >
                        Remove post
                      </button>
                    )}
                  </span>
                </div>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{f.message}</p>
              {f.screenshotUrl && (
                <button type="button" onClick={() => setShot(f.screenshotUrl)} className="self-start overflow-hidden rounded-md bg-foreground/[0.05]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded screenshot */}
                  <img src={f.screenshotUrl} alt="Screenshot" className="max-h-56 max-w-full object-contain" />
                </button>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                {f.page && (
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    on{" "}
                    <Link href={f.page} className="font-medium text-foreground hover:underline">
                      {f.page}
                    </Link>
                  </span>
                )}
                {f.userAgent && (
                  <span className="max-w-full truncate" title={f.userAgent}>
                    {deviceOf(f.userAgent)}
                  </span>
                )}
                {f.version && <span title="The site's version when this was sent">v{f.version}</span>}
                {f.source && <span className="rounded-sm bg-foreground/[0.05] px-1.5" title="Sent from this deployment">from {f.source}</span>}
              </div>
              {shared && f.where === "here" && f.kind !== "report" && (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-background px-3 py-2 text-xs">
                  <span className="flex-1">Only on this deployment (sent before it shared its inbox).</span>
                  <button type="button" onClick={() => void moveToShared(f).catch((e: unknown) => setConfirm({ title: "Couldn't move it", body: errorText(e), action: () => {} }))} className="flex h-8 items-center rounded-md bg-foreground/[0.05] px-2.5 font-medium transition-colors hover:bg-surface-hover">
                    Move to the shared inbox
                  </button>
                </div>
              )}
              {(f.kind === "bug" || f.kind === "feature") && (!shared || f.where === "shared") && <IssueBox row={f} createIssue={createIssue} change={change} errorText={errorText} />}
              <WorkLinks row={f} change={change} errorText={errorText} />
              <div className="flex flex-wrap items-center gap-2 border-t border-foreground/10 pt-3">
                <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-0.5 rounded-md bg-background p-0.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void change(f, { op: "status", id: f.id, status: s.id })}
                      role="radio"
                      aria-checked={f.status === s.id}
                      className={`rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors ${f.status === s.id ? "bg-surface-hover text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <NoteField note={f.adminNote} onSave={(note) => void change(f, { op: "note", id: f.id, note })} />
              </div>
            </article>
          ))
        )}
      </section>
      {shot && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4" onClick={() => setShot(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded screenshot */}
          <img src={shot} alt="Screenshot" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
      {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function deviceOf(ua: string) {
  const os = /iPad/.test(ua)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return `${os}${browser ? ` · ${browser}` : ""}`;
}

/** "FB-12": the feedback's ID — click to copy it (for a commit message or PR). */
function FeedbackId({ number }: { number: number }) {
  const [copied, setCopied] = useState(false);
  const id = `FB-${number}`;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title="Copy the ID — put it in a commit message or PR to link them (“Fixes FB-12” marks it done on main)"
      className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground transition-colors hover:bg-surface-hover"
    >
      {copied ? "Copied" : id}
    </button>
  );
}

type WorkLink = { kind: "commit" | "pr"; ref: string; url: string; title: string; merged?: boolean; at: number };

/** The commits and pull requests linked to a feedback, and a field to link one by hand. */
type Inbox = ReturnType<typeof useInbox>;

/** A bug's or idea's GitHub issue: made or linked by the admin — never automatically. */
function IssueBox({ row, createIssue, change, errorText }: { row: InboxRow; createIssue: Inbox["createIssue"]; change: Inbox["change"]; errorText: Inbox["errorText"] }) {
  const [mode, setMode] = useState<"create" | "link" | null>(null);
  const [withShot, setWithShot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (row.issue) {
    const open = row.issue.state === "open";
    return (
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <span className={`shrink-0 rounded-sm bg-foreground/[0.05] px-1.5 py-0.5 text-[10px] font-medium ${open ? "text-foreground" : "text-muted"}`}>
          {open ? "Issue open" : "Issue closed"}
        </span>
        <a href={row.issue.url} target="_blank" rel="noreferrer" className="shrink-0 font-mono font-medium text-foreground hover:underline">
          #{row.issue.number}
        </a>
        <span className="min-w-0 flex-1 truncate text-muted">{row.issue.title}</span>
        <button type="button" onClick={() => void change(row, { op: "setIssue", id: row.id, issue: null }).catch((e: unknown) => setError(errorText(e)))} className="shrink-0 rounded-md px-2 py-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground" title="Unlink the issue (it stays on GitHub)">
          Unlink
        </button>
      </div>
    );
  }

  async function make() {
    setBusy(true);
    setError(null);
    try {
      await createIssue(row, withShot);
      setMode(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMode(mode === "create" ? null : "create")} aria-expanded={mode === "create"} className="flex h-8 items-center rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover">
          Create GitHub issue
        </button>
        <button type="button" onClick={() => setMode("link")} className="flex h-8 items-center rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover">
          Link existing issue
        </button>
      </div>
      {mode === "create" && (
        <div className="flex flex-col gap-2 rounded-md bg-background p-3 text-xs">
          <p className="text-muted">
            Makes a public issue on GitHub labelled <span className="font-medium text-foreground">{row.kind === "bug" ? "bug" : "enhancement"}</span>: the message, the page, the site version, the device and FB-{row.number ?? "?"}. Never their email or name.
          </p>
          {row.screenshotUrl && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={withShot} onChange={(e) => setWithShot(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Include the screenshot (it becomes public too)
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void make()} className="flex h-8 items-center rounded-md bg-accent px-3 font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50">
              {busy ? "Making it…" : "Create issue"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="flex h-8 items-center rounded-md px-3 font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}
      {mode === "link" && (
        <IssuePicker
          onPick={(issue) => {
            setMode(null);
            void change(row, { op: "setIssue", id: row.id, issue: { number: issue.number, url: issue.url, title: issue.title, state: issue.state } }).catch((e: unknown) => setError(errorText(e)));
          }}
          onClose={() => setMode(null)}
        />
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** The repo's issues to link one (or type #45 / paste its link). */
function IssuePicker({ onPick, onClose }: { onPick: (issue: GitHubIssue) => void; onClose: () => void }) {
  const [issues, setIssues] = useState<GitHubIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    recentIssues().then(
      (list) => live && setIssues(list),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const t = q.trim().toLowerCase().replace(/^#/, "");
  const shown = (issues ?? []).filter((i) => !t || `${i.number} ${i.title} ${i.labels.join(" ")}`.toLowerCase().includes(t));
  async function byRef() {
    try {
      const issue = await issueByRef(q);
      if (issue) onPick(issue);
      else setError("That isn't an issue in the repo.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[8vh]" onMouseDown={onClose}>
      <div role="dialog" aria-label="Link a GitHub issue" className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface shadow-2xl shadow-black/20" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-foreground/10 p-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && /^\s*(#?\d+|https?:\/\/\S+\/issues\/\d+)\s*$/.test(q) && void byRef()}
            placeholder="Search issues, or type #45 / paste its link"
            aria-label="Search issues"
            className="h-9 min-w-0 flex-1 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {error ? (
            <li className="px-3 py-6 text-center text-sm text-danger">{error}</li>
          ) : !issues ? (
            <li className="flex justify-center py-8">
              <LoadingSpinner />
            </li>
          ) : shown.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {issues.length === 0 && !t ? "There are no issues on GitHub yet." : `No issues match${/^#?\d+$/.test(q.trim()) ? " — press Enter to look it up" : ""}.`}
            </li>
          ) : (
            shown.map((i) => (
              <li key={i.number}>
                <button type="button" onClick={() => onPick(i)} className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-hover">
                  <span className="mt-0.5 shrink-0 font-mono text-xs font-medium">#{i.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{i.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {i.state}
                      {i.labels.length ? ` · ${i.labels.join(", ")}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function WorkLinks({ row, change, errorText }: { row: InboxRow; change: Inbox["change"]; errorText: Inbox["errorText"] }) {
  const links: WorkLink[] = row.links;
  const add = (a: { input: string; title?: string }) => change(row, { op: "addLink", id: row.id, ...a });
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  async function submit() {
    if (!value.trim()) return;
    try {
      await add({ input: value });
      setValue("");
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      {links.length > 0 && (
        <ul className="flex flex-col gap-1">
          {links.map((l) => (
            <li key={l.url} className="group flex min-w-0 items-center gap-2 text-xs">
              <span className={`shrink-0 rounded-sm bg-foreground/[0.05] px-1.5 py-0.5 text-[10px] font-medium ${l.kind === "pr" && !l.merged ? "text-foreground" : "text-muted"}`}>
                {l.kind === "pr" ? (l.merged ? "PR merged" : "PR") : "Commit"}
              </span>
              <a href={l.url} target="_blank" rel="noreferrer" className="shrink-0 font-mono font-medium text-foreground hover:underline">
                {l.ref}
              </a>
              <span className="min-w-0 flex-1 truncate text-muted">{l.title}</span>
              <button type="button" onClick={() => void change(row, { op: "removeLink", id: row.id, url: l.url })} aria-label={`Unlink ${l.ref}`} className="shrink-0 rounded-md px-1.5 text-muted opacity-60 transition-colors hover:bg-surface-hover hover:text-danger hover:opacity-100">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="Link a commit or PR: hash, #12 or a GitHub link"
          aria-label="Link a commit or pull request"
          className="h-8 min-w-0 flex-1 rounded-md bg-foreground/[0.05] px-3 text-xs outline-none focus:ring-2 focus:ring-accent/40"
        />
        {value.trim() ? (
          <button type="button" onClick={() => void submit()} className="flex h-8 shrink-0 items-center rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent-hover">
            Link
          </button>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className="flex h-8 shrink-0 items-center rounded-md bg-foreground/[0.05] px-3 text-xs font-medium transition-colors hover:bg-surface-hover">
            Pick…
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {picking && (
        <WorkPicker
          linked={new Set(links.map((l) => l.url))}
          onPick={(item) => {
            void add({ input: item.url, title: item.title }).catch((e: unknown) => setError(errorText(e)));
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** The repo's recent commits (by branch) and pull requests, to link one with a click. */
function WorkPicker({ linked, onPick, onClose }: { linked: Set<string>; onPick: (item: GitHubItem) => void; onClose: () => void }) {
  const [kind, setKind] = useState<"commits" | "pulls">("commits");
  const [branch, setBranch] = useState("preview");
  const [data, setData] = useState<{ branches: string[]; items: GitHubItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let live = true;
    Promise.all([repoBranches(), kind === "commits" ? recentCommits(branch) : recentPulls()]).then(
      ([branches, items]) => live && (setData({ branches, items }), setError(null)),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [kind, branch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const t = q.trim().toLowerCase();
  const shown = (data?.items ?? []).filter((it) => it.kind === (kind === "commits" ? "commit" : "pr") && (!t || `${it.ref} ${it.title} ${it.detail}`.toLowerCase().includes(t)));
  const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[8vh]" onMouseDown={onClose}>
      <div role="dialog" aria-label="Link work from GitHub" className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface shadow-2xl shadow-black/20" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/10 p-3">
          <div className="flex gap-0.5 rounded-md bg-background p-0.5 text-xs font-medium">
            {(["commits", "pulls"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-sm px-2.5 py-1.5 transition-colors ${kind === k ? "bg-surface-hover text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                {k === "commits" ? "Commits" : "Pull requests"}
              </button>
            ))}
          </div>
          {kind === "commits" && data && (
            <Select value={branch} options={data.branches.map((b) => ({ value: b, label: b }))} onChange={setBranch} className="min-w-32" />
          )}
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search commits" className="h-9 min-w-0 flex-1 basis-32 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40" />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {error ? (
            <li className="px-3 py-6 text-center text-sm text-danger">{error}</li>
          ) : !data ? (
            <li className="flex justify-center py-8">
              <LoadingSpinner />
            </li>
          ) : shown.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches.</li>
          ) : (
            shown.map((it) => {
              const done = linked.has(it.url) || picked.has(it.url);
              return (
                <li key={it.url}>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => {
                      onPick(it);
                      setPicked((p) => new Set(p).add(it.url));
                    }}
                    className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-hover disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-xs font-medium">{it.ref}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{it.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {it.detail} · {date(it.at)}
                      </span>
                    </span>
                    <span className={`shrink-0 text-xs font-medium ${done ? "text-muted" : "text-accent"}`}>{done ? "Linked" : "Link"}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex justify-end border-t border-foreground/10 p-3">
          <button type="button" onClick={onClose} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteField({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const [value, setValue] = useState(note);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== note && onSave(value)}
      placeholder="Private note…"
      className="h-8 min-w-0 flex-1 basis-48 rounded-md bg-foreground/[0.05] px-3 text-xs outline-none focus:ring-2 focus:ring-accent/40"
    />
  );
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40">
      <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
      />
    </label>
  );
}

function Confirm({
  title,
  body,
  action,
  onClose,
  confirmWord,
  danger = true,
}: {
  title: string;
  body: string;
  action: () => void | Promise<void>;
  onClose: () => void;
  confirmWord?: string;
  danger?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = !confirmWord || typed.trim().toLowerCase() === confirmWord.toLowerCase();
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex w-full flex-col gap-4 rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface p-5 shadow-2xl shadow-black/20 sm:max-w-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted">{body}</p>
        {confirmWord && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Type <code className="rounded-sm bg-background px-1.5">{confirmWord}</code> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await action();
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message.replace(/^[\s\S]*Uncaught Error: /, "").split("\n")[0] : "Something went wrong.");
                setBusy(false);
              }
            }}
            className={`h-9 rounded-md px-4 text-sm font-medium disabled:opacity-40 ${danger ? "bg-danger text-background hover:opacity-90" : "bg-accent text-accent-foreground hover:bg-accent-hover"}`}
          >
            {busy ? "Working…" : "Yes, do it"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- posts

const POST_KIND: Record<string, string> = { tunes: "Tunes", setlist: "Setlist", routine: "Routine", milestone: "Milestone" };

function Posts() {
  const rows = useQuery(api.admin.posts, {});
  const removePost = useMutation(api.admin.removePost);
  const [q, setQ] = useState("");
  const [reportedOnly, setReportedOnly] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (p) => (!reportedOnly || p.reports > 0) && (!t || `${p.title} ${p.description} ${p.author.username ?? ""} ${p.author.email ?? ""}`.toLowerCase().includes(t)),
    );
  }, [rows, q, reportedOnly]);
  if (!rows)
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  const reported = rows.filter((p) => p.reports > 0).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchField value={q} onChange={setQ} placeholder="Search posts and authors" />
        </div>
        <button
          type="button"
          onClick={() => setReportedOnly((v) => !v)}
          aria-pressed={reportedOnly}
          className={`h-9 shrink-0 rounded-md border px-3 text-sm font-medium transition-colors ${reportedOnly ? "border-foreground/40 bg-surface-hover text-foreground" : "border-foreground/15 text-muted hover:bg-surface-hover hover:text-foreground"}`}
        >
          Reported only {reported ? `(${reported})` : ""}
        </button>
      </div>
      <div className="overflow-hidden rounded-lg bg-surface">
        {list.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No posts.</p>
        ) : (
          list.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-t border-foreground/10 px-4 py-3 first:border-t-0">
              <Avatar url={p.author.avatarUrl} name={p.author.username ?? "?"} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/post/${p.id}`} className="truncate text-sm font-medium hover:underline">
                    {p.title}
                  </Link>
                  <span className="rounded-sm bg-foreground/[0.05] px-1.5 text-[11px] text-muted">{POST_KIND[p.kind] ?? p.kind}</span>
                  {p.unlisted && <span className="rounded-sm bg-foreground/[0.05] px-1.5 text-[11px] text-muted">Unlisted</span>}
                  {p.reports > 0 && (
                    <span className="rounded-sm border border-danger/40 px-1.5 text-[11px] font-medium text-danger">
                      {p.reports} report{p.reports === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted">
                  {p.author.username ? `@${p.author.username}` : (p.author.email ?? "Unknown")} · {ago(p.createdAt)} · ♥ {p.likes}
                  {p.description ? ` · ${p.description}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    title: `Remove "${p.title}"?`,
                    body: "The post is deleted for everyone. Its author isn't told.",
                    action: () => void removePost({ id: p.id }),
                  })
                }
                className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
              >
                <TrashIcon className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          ))
        )}
      </div>
      {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- users

function Users() {
  const rows = useQuery(api.admin.users, {});
  const setPublic = useMutation(api.admin.setProfilePublic);
  const deleteUser = useAction(api.admin.deleteUser);
  const grantAdmin = useMutation(api.admin.grantAdmin);
  const revokeAdmin = useMutation(api.admin.revokeAdmin);
  const myRole = useQuery(api.admin.myRole, {});
  const owner = myRole === "owner";
  const [q, setQ] = useState("");
  const [onlyAdmins, setOnlyAdmins] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => Promise<void> | void; confirmWord?: string; danger?: boolean } | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((u) => (!onlyAdmins || u.role) && (!t || `${u.username ?? ""} ${u.email ?? ""} ${u.name ?? ""}`.toLowerCase().includes(t)));
  }, [rows, q, onlyAdmins]);
  const adminCount = (rows ?? []).filter((u) => u.role).length;
  if (!rows)
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <SearchField value={q} onChange={setQ} placeholder="Search by username, email or name" />
        </div>
        <button
          type="button"
          onClick={() => setOnlyAdmins((v) => !v)}
          aria-pressed={onlyAdmins}
          className={`h-9 shrink-0 rounded-md border px-3 text-sm font-medium transition-colors ${onlyAdmins ? "border-foreground/40 bg-surface-hover text-foreground" : "border-foreground/15 text-muted hover:bg-surface-hover hover:text-foreground"}`}
        >
          Admins ({adminCount})
        </button>
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <UsersIcon className="h-4 w-4" /> {rows.length} account{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {owner && (
        <p className="px-1 text-xs text-muted">
          As the owner you can make other accounts admins. Admins can use this page to moderate, but can&apos;t add admins or change another admin&apos;s account or
          yours.
        </p>
      )}
      <div className="overflow-hidden rounded-lg bg-surface">
        {list.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 border-t border-foreground/10 px-4 py-3 first:border-t-0">
            <Avatar url={u.avatarUrl} name={u.username ?? u.email ?? "?"} size={11} />
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex flex-wrap items-center gap-1.5">
                {u.username ? (
                  <Link href={`/u/${u.username}`} className="text-sm font-medium hover:underline">
                    @{u.username}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-muted">No username</span>
                )}
                {u.role === "owner" && (
                  <span className="rounded-sm bg-foreground px-1.5 text-[11px] font-medium text-background">Owner</span>
                )}
                {u.role === "admin" && <span className="rounded-sm bg-accent px-1.5 text-[11px] font-medium text-accent-foreground">Admin</span>}
                {u.isMe && <span className="rounded-sm bg-foreground/[0.05] px-1.5 text-[11px] text-muted">You</span>}
                <span className={`rounded-sm bg-foreground/[0.05] px-1.5 text-[11px] ${u.isPublic ? "text-foreground" : "text-muted"}`}>
                  {u.isPublic ? "Public" : "Private"}
                </span>
                {u.providers.map((p) => (
                  <span key={p} className="rounded-sm bg-foreground/[0.05] px-1.5 text-[11px] text-muted">
                    {p === "google" ? "Google" : p === "password" ? "Email" : p}
                  </span>
                ))}
              </div>
              <p className="truncate text-xs text-muted">
                {u.email ?? "No email"} · joined {ago(u.joined)} · {u.posts} post{u.posts === 1 ? "" : "s"}
              </p>
            </div>
            {!u.isMe && u.role !== "owner" && (owner || !u.role) && (
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {owner &&
                  (u.role === "admin" ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          title: `Remove ${u.username ? `@${u.username}` : (u.email ?? "this account")} as an admin?`,
                          body: "They lose access to the admin page straight away. Their account isn't changed otherwise.",
                          action: async () => {
                            await revokeAdmin({ userId: u.id });
                          },
                        })
                      }
                      className="flex h-8 items-center rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover"
                    >
                      Remove admin
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          title: `Make ${u.username ? `@${u.username}` : (u.email ?? "this account")} an admin?`,
                          body: "They'll be able to read every feedback message and report, see every account's email, remove community posts, and hide or delete regular accounts. They can't add admins or touch another admin's account or yours. You can remove them any time.",
                          confirmWord: u.username ?? u.email ?? "admin",
                          danger: false,
                          action: async () => {
                            await grantAdmin({ userId: u.id });
                          },
                        })
                      }
                      className="flex h-8 items-center gap-1 rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover"
                    >
                      <ShieldIcon className="h-3.5 w-3.5" /> Make admin
                    </button>
                  ))}
                {u.isPublic && (
                  <button
                    type="button"
                    onClick={() => void setPublic({ userId: u.id, isPublic: false })}
                    className="flex h-8 items-center rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover"
                    title="Take their profile off public view"
                  >
                    Make private
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setConfirm({
                      title: `Delete ${u.username ? `@${u.username}` : (u.email ?? "this account")}?`,
                      body: "Their account and everything in it — profile, posts, library, Shed Log, lessons, recordings and files — is deleted for good. They can sign up again with the same email.",
                      confirmWord: u.username ?? u.email ?? "delete",
                      action: async () => {
                        await deleteUser({ userId: u.id });
                      },
                    })
                  }
                  className="flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  <TrashIcon className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {confirm && <Confirm {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
