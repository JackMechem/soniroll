import { Suspense } from "react";
import LibraryHub from "@/components/library/LibraryHub";

export const metadata = { title: "Library" };

/** `/tunes` — the Library, with `?tab=setlists|charts|files` (none = Tunes). The old `/tunes/setlists`,
    `/chord-charts` and `/files` addresses redirect here (next.config.ts). */
export default function LibraryRoute() {
  return (
    <Suspense>
      <LibraryHub />
    </Suspense>
  );
}
