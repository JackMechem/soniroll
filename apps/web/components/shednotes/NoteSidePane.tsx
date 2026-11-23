"use client";

import { useRouter } from "next/navigation";
import { usePageCrumbs } from "@/lib/pageCrumbs";
import { noteSideHref } from "@/lib/notePeek";
import { useNote } from "@/lib/useShedNotes";
import { DocumentIcon } from "@/components/tools";
import { usePaneId } from "@/lib/paneContext";
import GatedShedNotes from "./GatedShedNotes";
import NoteSurface from "./NoteSurface";

/** One Shed Note on its own, filling a pane — what the side view shows for a note
    (`/shed-notes?id=…&view=note`). Links to other notes open in the same pane (with Back); as a
    page of its own (no pane) it's Shed Notes with that note open. */
export default function NoteSidePane({ noteId }: { noteId: string }) {
  if (!usePaneId()) return <GatedShedNotes initialId={noteId} />;
  return <NoteInPane noteId={noteId} />;
}

function NoteInPane({ noteId }: { noteId: string }) {
  const router = useRouter();
  const { note } = useNote(noteId);
  usePageCrumbs({ crumbs: [{ label: "Shed Notes", href: `/shed-notes?id=${encodeURIComponent(noteId)}` }, { label: note?.title || "Note" }], icon: DocumentIcon });
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14">
      <NoteSurface
        key={noteId}
        noteId={noteId}
        onOpenNote={(id) => router.push(noteSideHref(id))}
        autoFocus={typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches}
        footer={(saveState) => <p className="px-5 pb-3 text-xs text-muted">{saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : "Saving…"}</p>}
      />
    </div>
  );
}
