"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyCard, PageHeader, PageShell, SearchBox } from "@/components/library/shared";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import { MicIcon } from "@/components/tools";
import { recordingsApi, useTuneIndex } from "@/lib/recordings";

/** `/recordings` — every saved recording, newest first: search by name, notes or tune; play in
    place; click a name to open it. */
export default function RecordingsPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const recordings = useQuery(recordingsApi.list, isAuthenticated ? {} : "skip");
  const byId = useTuneIndex();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!recordings || !q) return recordings ?? [];
    return recordings.filter((r) => {
      const tuneName = r.tuneId ? (byId.get(r.tuneId)?.tune.name ?? "") : "";
      return [r.name, r.notes, tuneName].some((text) => text.toLowerCase().includes(q));
    });
  }, [recordings, byId, query]);

  return (
    <PageShell>
      <PageHeader
        title="My recordings"
        helpTopic="recordings"
        actions={
          <Link href="/recorder" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            <MicIcon className="h-4 w-4" /> Record
          </Link>
        }
      />
      {isLoading || (isAuthenticated && recordings === undefined) ? (
        <LoadingSpinner />
      ) : !isAuthenticated ? (
        <EmptyCard>Sign in to see your recordings.</EmptyCard>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Search recordings" />
          {shown.length === 0 ? (
            <EmptyCard>{query ? "No recordings match." : "No recordings yet — open the Recorder to make one."}</EmptyCard>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {shown.map((r) => (
                <RecordingCard key={r._id} recording={r} tuneName={r.tuneId ? byId.get(r.tuneId)?.tune.name : null} />
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
