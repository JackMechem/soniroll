"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import FilesPage from "@/components/files/FilesPage";
import SetlistsPage from "@/components/library/SetlistsPage";
import TunesDashboard from "@/components/library/TunesDashboard";
import { LIBRARY_VIEWS, type LibraryView } from "@/components/library/ui";

/** `/tunes` — the Library: two tabs, Tunes and Files, picked by `?tab=` (see `libraryHref`).
    Setlists (`?tab=setlists`) is a page inside Tunes, with a back button to it. Every chord chart
    belongs to a tune, so the old Chord Charts page (`?tab=charts`) opens Tunes; `?tab=recordings`
    (Recordings was a tab once) opens Files showing recordings. `?list=tunes|learn|library` opens
    Tunes on that list. Files takes `?folder=Etudes/Wilcoxon` or `?tag=Gig` to open on a folder or a tag (and `?q=`
    a search); it keeps them up to date as you browse, so Back (a pane's too) returns to them. */
export default function LibraryHub({ defaultTab = "tunes" }: { defaultTab?: LibraryView }) {
  const params = useSearchParams();
  const param = params?.get("tab");
  const tab = LIBRARY_VIEWS.includes(param as LibraryView) ? (param as LibraryView) : defaultTab;
  if (tab === "setlists") return <SetlistsPage />;
  if (tab === "files") return <FilesPage initialFolder={params?.get("folder") ?? null} initialTag={params?.get("tag") ?? null} initialQuery={params?.get("q") ?? ""} />;
  if (tab === "recordings") return <FilesPage initialSource="recording" />;
  return <TunesDashboard initialList={params?.get("list")} />;
}

/** The split-screen pane (lib/toolRegistry.tsx; `/chord-charts` panes open it too). */
export function LibraryPane() {
  return (
    <Suspense>
      <LibraryHub />
    </Suspense>
  );
}
