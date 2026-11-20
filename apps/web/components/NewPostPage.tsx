"use client";

import { tuneChartIds } from "@jam-practice/core/tuneLibrary";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { BackButton, PageShell, tuneSummary } from "@/components/library/shared";
import { TunePickerModal } from "@/components/library/setlistParts";
import { useTuneLists } from "@/components/library/useTuneActions";
import LoadingSpinner from "@/components/LoadingSpinner";
import SwitchRow from "@/components/SwitchRow";
import { CloseIcon, PlusIcon } from "@/components/tools";
import { toPublicTune } from "@/lib/profileTunes";
import type { Tune } from "@/lib/types";
import { useSetlists } from "@/lib/useSetlists";
import { SIGN_IN_PATH } from "@/lib/landing";
import { useSiteStatus } from "@/lib/useSiteStatus";

/**
 * Posting to Community, as a full page (reached from Community's + or a setlist's "Post to
 * Community"): title, description, unlisted, and the tunes to post, in order. `setlistId` starts
 * from one of your setlists — its name, description and tunes — and posts it *as* that setlist: the
 * post then always shows the setlist's current tunes, so its tune list isn't edited here. Each
 * tune's linked chord chart rides along (`communityTunes.create` attaches it); notes never do.
 * Posting needs a public profile, checked up front.
 */
export default function NewPostPage({ setlistId }: { setlistId?: string }) {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : "skip");
  const create = useMutation(api.communityTunes.create);
  const { setlists } = useSetlists();
  const lists = useTuneLists();

  const byId = new Map<string, Tune>();
  for (const t of [...lists.tunes.tunes, ...lists.learn.tunes, ...lists.library.tunes]) byId.set(t.id, t);

  const fromSetlist = setlistId ? setlists.find((s) => s.id === setlistId) : undefined;
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [unlisted, setUnlisted] = useState(false);
  const [tuneIds, setTuneIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form from the setlist once it's loaded (render-time, so there's no empty flash).
  if (fromSetlist && seededFrom !== fromSetlist.id) {
    setSeededFrom(fromSetlist.id);
    setTitle(fromSetlist.name);
    setDescription(fromSetlist.description);
  }

  const chosen = (fromSetlist ? fromSetlist.tuneIds : tuneIds).map((id) => byId.get(id)).filter((t): t is Tune => !!t);

  async function post() {
    setError(null);
    if (!title.trim()) return setError("Give this post a title.");
    if (chosen.length === 0) return setError("Add at least one tune.");
    setPosting(true);
    try {
      const id = await create({
        title: title.trim(),
        description: description.trim(),
        tunes: chosen.map(toPublicTune),
        unlisted,
        ...(fromSetlist ? { kind: "setlist" as const, setlistId: fromSetlist.id } : {}),
      });
      router.replace(`/post/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post that.");
      setPosting(false);
    }
  }

  const site = useSiteStatus();
  const paused = !!site?.postingPaused;
  const loading = isLoading || (isAuthenticated && profile === undefined);
  const blocked = !isAuthenticated || !profile?.isPublic || paused;

  return (
    <PageShell fullWidth={false}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-foreground/10 pb-6">
        <div>
          <BackButton onClick={() => router.back()} className="mb-2" />
          <h1 className="text-2xl font-semibold tracking-tight">{fromSetlist ? "Post a setlist" : "New post"}</h1>
        </div>
        {paused && <p className="w-full rounded-lg bg-surface px-4 py-3 text-sm">New posts are paused for a bit. Try again later.</p>}
        {!loading && !blocked && (
          <button type="button" onClick={() => void post()} disabled={posting} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50">
            {posting ? "Posting…" : "Post"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : blocked ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-foreground/15 p-6 text-center">
          <p className="text-sm text-muted">{isAuthenticated ? "Make your profile public before posting to Community." : "Sign in to post to Community."}</p>
          <Link href={isAuthenticated ? "/account" : SIGN_IN_PATH} className="flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            {isAuthenticated ? "Edit public profile" : "Sign in"}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title — e.g. Friday gig setlist"
              autoFocus={!setlistId}
              className="h-10 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              className="resize-y rounded-md bg-foreground/[0.05] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
            />
            <div className="rounded-lg bg-surface px-4 py-2">
              <SwitchRow label="Unlisted" checked={unlisted} onChange={setUnlisted} />
              <p className="pb-1 text-xs text-muted">Won&apos;t show up in Community&apos;s feed or search, or on your public profile — only people with the link can see it.</p>
            </div>
          </div>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">
                {fromSetlist ? "Setlist" : "Tunes"} <span className="font-normal text-muted">· {chosen.length}</span>
              </h2>
              {!fromSetlist && (
                <button type="button" onClick={() => setPicking(true)} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
                  <PlusIcon className="h-4 w-4" />
                  Add tunes
                </button>
              )}
            </div>
            {fromSetlist && <p className="text-sm text-muted">Posted as a setlist — it stays in sync: when you change the setlist, the post changes too.</p>}
            {chosen.length === 0 ? (
              <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">No tunes yet — add some from your lists. Each one&apos;s chord chart comes along.</p>
            ) : (
              <ol className="divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
                {chosen.map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-6 text-right text-sm tabular-nums text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.name}</span>
                      <span className="block truncate text-xs text-muted">{[tuneSummary(t), tuneChartIds(t).length ? "chart included" : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    {!fromSetlist && (
                      <button type="button" onClick={() => setTuneIds((prev) => prev.filter((x) => x !== t.id))} aria-label={`Remove ${t.name}`} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </section>
        </>
      )}
      {picking && <TunePickerModal exclude={tuneIds} onAdd={(ids) => setTuneIds((prev) => [...prev, ...ids])} onClose={() => setPicking(false)} />}
    </PageShell>
  );
}
