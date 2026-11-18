"use client";

import { createContext, useContext } from "react";

/** The split-screen pane a page is shown in (`components/TilingLayout.tsx`'s `data-pane` box), or
    null on a normal page. Inside a pane, phone-style sheets that would cover the whole window
    portal into the pane instead and cover just that pane (`absolute`, not `fixed`), so a pane
    behaves like a phone screen of its own size. */
export const PaneContext = createContext<HTMLElement | null>(null);

export function usePaneElement() {
  return useContext(PaneContext);
}
