"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import FilesPage from "@/components/files/FilesPage";
import ChartsDashboard from "@/components/library/ChartsDashboard";
import SetlistsPage from "@/components/library/SetlistsPage";
import TunesDashboard from "@/components/library/TunesDashboard";
import { LIBRARY_VIEWS, type LibraryView } from "@/components/library/ui";

/** `/tunes` — the Library: two tabs, Tunes and Files, picked by `?tab=` (see `libraryHref`).
    Setlists (`?tab=setlists`) and Chord Charts (`?tab=charts`) are pages inside Tunes, with a back
    button to it; `?tab=recordings` (Recordings was a tab once) opens Files showing recordings.
    `defaultTab` is for split-screen panes opened as Chord Charts. */
export default function LibraryHub({ defaultTab = "tunes" }: { defaultTab?: LibraryView }) {
  const param = useSearchParams()?.get("tab");
  const tab = LIBRARY_VIEWS.includes(param as LibraryView) ? (param as LibraryView) : defaultTab;
  if (tab === "setlists") return <SetlistsPage />;
  if (tab === "charts") return <ChartsDashboard />;
  if (tab === "files") return <FilesPage />;
  if (tab === "recordings") return <FilesPage initialSource="recording" />;
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
