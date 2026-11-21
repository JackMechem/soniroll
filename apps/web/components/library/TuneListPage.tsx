"use client";

import { LibraryPage } from "@/components/library/ui";
import { TUNE_LIST_LABEL, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { LibraryIcon, NoteIcon, StarIcon } from "@/components/tools";
import TuneListManager from "@/components/TuneListManager";

/** Every tune in one list (Tunes I Know, Tunes to Learn or Library) — search, add (jazz standards or your
    own), edit, bulk select/export/import/delete; each tune's name opens its own page. */
export default function TuneListPage({ list }: { list: TuneListId }) {
  const lists = useTuneLists();
  return (
    <LibraryPage>
      <TuneListManager
        title={TUNE_LIST_LABEL[list]}
        icon={list === "learn" ? StarIcon : list === "library" ? LibraryIcon : NoteIcon}
        tunes={lists[list].tunes}
        setTunes={lists[list].setTunes}
        allowStandards
        listId={list}
        variant="page"
        searchPlaceholder={list === "learn" ? "Search your tunes to learn…" : list === "library" ? "Search your Library list…" : "Search the tunes you know…"}
        emptyMessage="No tunes here yet. Add one, or pick a jazz standard."
        exportFilenamePrefix={list === "learn" ? "jam-practice-tunes-to-learn" : list === "library" ? "jam-practice-library-tunes" : "jam-practice-tunes"}
      />
    </LibraryPage>
  );
}
