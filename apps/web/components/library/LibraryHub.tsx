"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import FilesPage from "@/components/files/FilesPage";
import ChartsDashboard from "@/components/library/ChartsDashboard";
import SetlistsPage from "@/components/library/SetlistsPage";
import TunesDashboard from "@/components/library/TunesDashboard";
import RecordingsPage from "@/components/recordings/RecordingsPage";
import { LIBRARY_TABS, type LibraryTab } from "@/components/library/ui";

/** `/tunes` — the Library: Tunes, Setlists, Chord Charts, Files and Recordings as tabs on one page, picked by
    `?tab=` (see `libraryHref`). `defaultTab` is for split-screen panes opened as Chord Charts. */
export default function LibraryHub({ defaultTab = "tunes" }: { defaultTab?: LibraryTab }) {
  const param = useSearchParams()?.get("tab");
  const tab = LIBRARY_TABS.includes(param as LibraryTab) ? (param as LibraryTab) : defaultTab;
  if (tab === "setlists") return <SetlistsPage />;
  if (tab === "charts") return <ChartsDashboard />;
  if (tab === "files") return <FilesPage />;
  if (tab === "recordings") return <RecordingsPage />;
  return <TunesDashboard />;
}

/** Split-screen panes (lib/toolRegistry.tsx): Library, and Library opened on Chord Charts. */
export function LibraryPane() {
  return (
    <Suspense>
      <LibraryHub />
    </Suspense>
  );
}

export function ChartsPane() {
  return (
    <Suspense>
      <LibraryHub defaultTab="charts" />
    </Suspense>
  );
}
