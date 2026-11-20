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
    (Recordings was a tab once) opens Files showing recordings. */
export default function LibraryHub({ defaultTab = "tunes" }: { defaultTab?: LibraryView }) {
  const param = useSearchParams()?.get("tab");
  const tab = LIBRARY_VIEWS.includes(param as LibraryView) ? (param as LibraryView) : defaultTab;
  if (tab === "setlists") return <SetlistsPage />;
  if (tab === "files") return <FilesPage />;
  if (tab === "recordings") return <FilesPage initialSource="recording" />;
  return <TunesDashboard />;
}

/** The split-screen pane (lib/toolRegistry.tsx; `/chord-charts` panes open it too). */
export function LibraryPane() {
  return (
    <Suspense>
      <LibraryHub />
    </Suspense>
  );
}
