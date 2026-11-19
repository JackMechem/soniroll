import { Suspense } from "react";
import LibraryHub from "@/components/library/LibraryHub";

export const metadata = { title: "Library" };

/** `/tunes` — the Library, with `?tab=setlists|charts|files|recordings` (none = Tunes). The old
    `/tunes/setlists`, `/chord-charts`, `/files` and `/recordings` addresses redirect here
    (next.config.ts); one recording's page is `/tunes/recording?id=…`. */
export default function LibraryRoute() {
  return (
    <Suspense>
      <LibraryHub />
    </Suspense>
  );
}
