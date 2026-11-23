import type { ReactNode } from "react";
import type { PaneNav } from "@/lib/paneContext";

/** Stand-in for the website's `components/panes/NextPaneContexts.tsx` (Next's internal contexts):
    here the `next/navigation` stand-in reads `PaneNavContext` itself. */
export default function NextPaneContexts({ children }: { nav: PaneNav | null; children: ReactNode }) {
  return <>{children}</>;
}
