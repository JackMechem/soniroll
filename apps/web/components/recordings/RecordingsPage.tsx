"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyCard } from "@/components/library/shared";
import { EmptyState, Hero, HeroSearch, LibraryPage, LibraryTabs, Toolbar } from "@/components/library/ui";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import StoragePill from "@/components/files/StoragePill";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import { LibraryIcon, MicIcon } from "@/components/tools";
import { recordingsApi, useTuneIndex } from "@/lib/recordings";

/** `/recordings` — every saved recording, newest first: search by name, notes or tune; play in
    place; click a name to open it. Shown as the Library's last tab (its header and tabs). */
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
    <LibraryPage>
      <Hero title="Library" icon={LibraryIcon} titleExtra={<StoragePill />} helpTopic="recordings" tabs={<LibraryTabs active="recordings" />}>
        {isAuthenticated && (
          <Toolbar>
            <HeroSearch value={query} onChange={setQuery} placeholder="Search recordings" />
            <Link
              href="/recorder"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover sm:h-9"
            >
              <MicIcon className="h-4 w-4" /> Record
            </Link>
          </Toolbar>
        )}
      </Hero>
      {isLoading || (isAuthenticated && recordings === undefined) ? (
        <LoadingSpinner />
      ) : !isAuthenticated ? (
        <EmptyState
          boxed
          title="Keep your recordings with your account"
          body="Record takes in the Recorder or on a tune's page, and play them back on any device."
          action={<SignInButtons />}
        />
      ) : shown.length === 0 ? (
        <EmptyCard>{query ? "No recordings match." : "No recordings yet — open the Recorder to make one."}</EmptyCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {shown.map((r) => (
            <RecordingCard key={r._id} recording={r} tuneName={r.tuneId ? byId.get(r.tuneId)?.tune.name : null} />
          ))}
        </div>
      )}
    </LibraryPage>
  );
}
