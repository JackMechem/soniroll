"use client";

import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { APP_VERSION, CHANNEL } from "@/lib/version";
import {
  CHANGELOG_SEEN_KEY,
  CHANGE_KINDS,
  type ChangeKind,
  RELEASES,
  formatReleaseDate,
  mergeReleases,
  releaseAnchor,
  type ShownRelease,
} from "@/lib/changelog";
import { LinkIcon } from "@/components/tools";
import { siteOrigin } from "@/lib/siteOrigin";

/** How each kind of change looks: its heading's colour and its bullet. Kept quiet: only New takes
    the accent. */
export const KIND_STYLE: Record<ChangeKind, { label: string; chip: string; dot: string }> = {
  new: { label: "New", chip: "text-accent", dot: "bg-accent" },
  improved: { label: "Improved", chip: "text-foreground", dot: "bg-foreground/40" },
  fixed: { label: "Fixed", chip: "text-foreground", dot: "bg-foreground/25" },
};

export function KindIcon({ kind, className = "h-3.5 w-3.5" }: { kind: ChangeKind; className?: string }) {
  const p = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "new") return <svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>;
  if (kind === "improved") return <svg {...p}><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
  return <svg {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z" /></svg>;
}

/** A change's text, with `**bold**` made bold. */
export function ChangeText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i} className="font-semibold text-foreground">{p}</strong> : p))}</>;
}

/** `/changelog`: every version and what changed in it, newest first. */
export default function ChangelogPage() {
  const edits = useQuery(api.changelog.edits);
  const releases = useMemo(() => mergeReleases(RELEASES, edits).filter((r) => !r.hidden), [edits]);
  const [filter, setFilter] = useState<ChangeKind | "all">("all");
  const latest = RELEASES[0]?.version;

  // Seen: the version dot in the sidebar goes away.
  useEffect(() => {
    try {
      if (latest) localStorage.setItem(CHANGELOG_SEEN_KEY, latest);
      window.dispatchEvent(new Event("soniroll:changelog-seen"));
    } catch {}
  }, [latest]);

  const counts = useMemo(() => {
    const c: Record<ChangeKind, number> = { new: 0, improved: 0, fixed: 0 };
    for (const r of releases) for (const ch of r.changes) c[ch.kind]++;
    return c;
  }, [releases]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-20 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">What&apos;s new</h1>
              <span className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted">
                v{APP_VERSION}
                {CHANNEL === "beta" ? " beta" : ""}
              </span>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted">Every update to soniroll: new things, improvements and fixes, newest first.</p>
          </div>
        </div>
        <div>
          <div className="-mx-4 flex gap-5 overflow-x-auto border-b border-foreground/10 px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label="Show">
            {([{ kind: "all" as const, label: "Everything" }, ...CHANGE_KINDS]).map((k) => {
              const on = filter === k.kind;
              return (
                <button
                  key={k.kind}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setFilter(k.kind)}
                  className={`-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-sm transition-colors ${
                    on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  {k.label}
                  {k.kind !== "all" && <span className="text-xs font-normal tabular-nums text-muted">{counts[k.kind]}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
        {/* Versions, to jump between (desktop). */}
        <nav aria-label="Versions" className="sticky top-8 hidden flex-col gap-0.5 lg:flex">
          <p className="mb-1 px-3 text-xs font-medium text-muted">Versions</p>
          {releases.map((r) => (
            <a key={r.version} href={`#${releaseAnchor(r.version)}`} className="flex items-baseline justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-surface-hover">
              <span className="font-medium tabular-nums">v{r.version}</span>
              <span className="text-xs text-muted">{formatReleaseDate(r.date).replace(/, \d{4}$/, "")}</span>
            </a>
          ))}
        </nav>

        <ol className="flex flex-col divide-y divide-foreground/10">
          {releases.map((r) => (
            <ReleaseEntry key={r.version} release={r} latest={r.version === latest} filter={filter} />
          ))}
        </ol>
      </div>
    </main>
  );
}

function ReleaseEntry({ release: r, latest, filter }: { release: ShownRelease; latest: boolean; filter: ChangeKind | "all" }) {
  const [copied, setCopied] = useState(false);
  const groups = CHANGE_KINDS.map(({ kind }) => ({ kind, items: r.changes.filter((c) => c.kind === kind) })).filter(
    (g) => g.items.length && (filter === "all" || filter === g.kind),
  );
  const anchor = releaseAnchor(r.version);
  return (
    <li id={anchor} className="scroll-mt-8 py-8 first:pt-0">
      <article className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 text-xs font-medium tabular-nums">v{r.version}</span>
            {latest && <span className="text-xs font-medium text-accent">Latest</span>}
            <time dateTime={r.date} className="text-muted">
              {formatReleaseDate(r.date)}
            </time>
            <button
              type="button"
              onClick={() => {
                const url = `${siteOrigin()}/changelog#${anchor}`;
                navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }, () => {});
              }}
              className="ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground"
            >
              <LinkIcon className="h-3.5 w-3.5" /> {copied ? "Copied" : "Link"}
            </button>
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{r.title}</h2>
          {r.summary && <p className="text-sm text-muted">{r.summary}</p>}
        </div>
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-foreground/15 p-4 text-sm text-muted">Nothing {filter === "all" ? "" : KIND_STYLE[filter as ChangeKind].label.toLowerCase()} in this version.</p>
        ) : (
          <div className="divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
            {groups.map((g) => (
              <section key={g.kind} className="p-4 sm:p-5">
                <h3 className={`mb-3 flex items-center gap-1.5 text-sm font-medium ${KIND_STYLE[g.kind].chip}`}>
                  <KindIcon kind={g.kind} /> {KIND_STYLE[g.kind].label}
                </h3>
                <ul className="flex flex-col gap-2">
                  {g.items.map((c, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground/85">
                      <span aria-hidden className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${KIND_STYLE[g.kind].dot}`} />
                      <span>
                        <ChangeText text={c.text} />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </article>
    </li>
  );
}
