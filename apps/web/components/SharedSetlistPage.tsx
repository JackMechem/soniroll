"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import PageBar from "@/components/PageBar";
import PublicSetlist from "@/components/PublicSetlist";
import { SetlistIcon } from "@/components/tools";

/**
 * A setlist someone shared by link (`/setlist/<id>` — the same path the mobile app's share links
 * use) — open to anyone, signed in or not. It always shows the setlist as it is now. Its tunes in
 * order (each opening the chart reader at that tune), plus **Save as my setlist**.
 */
export default function SharedSetlistPage({ id }: { id: string }) {
  const shared = useQuery(api.setlists.getShared, { id });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-20">
      <PageBar crumbs={[{ label: shared ? shared.title : "Shared setlist" }]} icon={SetlistIcon} />
      {shared === undefined ? (
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      ) : shared === null ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <h2 className="text-xl font-semibold">This setlist isn&apos;t available</h2>
          <p className="text-sm text-muted">It isn&apos;t shared anymore, or the link is wrong.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-sm text-muted">
              <SetlistIcon className="h-4 w-4" />
              Setlist · {shared.tunes.length} tune{shared.tunes.length === 1 ? "" : "s"}
              {shared.ownerUsername && (
                <>
                  {" · shared by "}
                  <Link href={`/u/${shared.ownerUsername}`} className="text-accent hover:underline">
                    @{shared.ownerUsername}
                  </Link>
                </>
              )}
            </p>
            {shared.description && <p className="whitespace-pre-line">{shared.description}</p>}
          </div>
          <PublicSetlist title={shared.title} tunes={shared.tunes} isMine={shared.isMine} ownSetlistId={shared.setlistId} chartsParam={`shared=${encodeURIComponent(shared.id)}`} />
        </>
      )}
    </main>
  );
}
