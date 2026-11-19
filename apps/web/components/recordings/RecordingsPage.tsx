"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyState, Hero, HeroSearch, LibraryPage, LibraryTabs, Pill, Toolbar } from "@/components/library/ui";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import StoragePill from "@/components/files/StoragePill";
import { RecordingCard } from "@/components/recordings/RecordingParts";
import { LibraryIcon, MicIcon } from "@/components/tools";
import { useFileActions } from "@/components/files/FileParts";
import { filesApi, type StoredEntry } from "@/lib/files";
import { recordingsApi, useTuneIndex, type Recording } from "@/lib/recordings";
import { useDeviceUrls } from "@/lib/deviceFiles";

/** A recording as the Files page's item, for its ⋮ menu: the storage list's entry (size, share
    link) when it's loaded, else one made from the recording. */
function entryOf(r: Recording, stored: Map<string, StoredEntry>): StoredEntry {
  return (
    stored.get(r._id) ?? { kind: "recording", id: r._id, name: r.name, mimeType: r.mimeType, size: 0, createdAt: r.createdAt, url: r.url, tuneId: r.tuneId, href: `/tunes/recording?id=${r._id}` }
  );
}

/** Library's Recordings tab (`/tunes?tab=recordings`, see LibraryHub) — every saved recording,
    newest first: search by name, notes or tune; play in place; click a name to open it. */
export default function RecordingsPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const recordings = useDeviceUrls(useQuery(recordingsApi.list, isAuthenticated ? {} : "skip"));
  const byId = useTuneIndex();
  const [query, setQuery] = useState("");
  // The Files page's ⋮ menu (open, rename, share, download, delete) for each recording.
  const files = useFileActions({ tuneName: (tuneId) => byId.get(tuneId)?.tune.name });
  // The same list the storage meter reads (one subscription), for each recording's size and share link.
  const storage = useQuery(filesApi.storage, isAuthenticated ? {} : "skip");
  const storedItems = useDeviceUrls(storage?.items);
  const stored = useMemo(() => new Map((storedItems ?? []).filter((i) => i.kind === "recording").map((i) => [i.id, i as StoredEntry])), [storedItems]);
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
            <HeroSearch value={query} onChange={setQuery} placeholder="Search recordings…" />
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
        query ? (
          <EmptyState boxed title={`No recordings match “${query}”`} body="Try part of a name or a tune." />
        ) : (
          <EmptyState
            boxed
            title="No recordings yet"
            body="Record a take in the Recorder or on a tune's page and it shows up here."
            action={<Pill primary icon={MicIcon} label="Open the Recorder" href="/recorder" />}
          />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {shown.map((r) => (
            <RecordingCard
              key={r._id}
              recording={r}
              tuneName={r.tuneId ? byId.get(r.tuneId)?.tune.name : null}
              onMenu={(e) => files.openMenu(entryOf(r, stored), e)}
              onContextMenu={(e) => files.contextMenu(entryOf(r, stored), e)}
            />
          ))}
        </div>
      )}
      {files.error && (
        <p role="alert" className="text-sm text-danger">
          {files.error}
        </p>
      )}
      {files.dialogs}
    </LibraryPage>
  );
}
