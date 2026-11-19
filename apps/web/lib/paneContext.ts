"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";

/** The split-screen pane a page is shown in (`components/TilingLayout.tsx`'s `data-pane` box), or
    null on a normal page. Inside a pane, phone-style sheets that would cover the whole window
    portal into the pane instead and cover just that pane (`absolute`, not `fixed`), so a pane
    behaves like a phone screen of its own size. */
export const PaneContext = createContext<HTMLElement | null>(null);

export function usePaneElement() {
  return useContext(PaneContext);
}

/** A spot in the pane's top bar right after the page's name, for the page's intro "?" (so it sits
    beside the title, as on a full page). Null outside split screen. */
export const PaneTitleSlotContext = createContext<HTMLElement | null>(null);

export function usePaneTitleSlot() {
  return useContext(PaneTitleSlotContext);
}

/** Whether a page-wide keyboard shortcut (Space to start/stop, Enter for next, ...) belongs to the
    page in `pane` (from `usePaneElement()`). Always true outside split screen. In split screen only
    one pane reacts: the one holding keyboard focus, or, when nothing in a pane has focus (a click
    on plain text or empty space), the active pane — the one last clicked, marked
    `data-pane-active` by `TilingLayout`. */
export function keyIsForPane(pane: HTMLElement | null, e: KeyboardEvent) {
  if (!pane) return true;
  const target = e.target instanceof Element ? e.target : null;
  const focusedPane = target?.closest("[data-pane]");
  if (focusedPane) return focusedPane === pane;
  return pane.hasAttribute("data-pane-active");
}

/** `keyIsForPane` for this page's pane, as a function that never changes, for a keydown listener
    added once (`useEffect(..., [])`): `const forThisPane = usePaneKeyGuard();` then
    `if (!forThisPane(e)) return;` in the listener. */
export function usePaneKeyGuard() {
  const pane = usePaneElement();
  const paneRef = useRef(pane);
  useEffect(() => {
    paneRef.current = pane;
  });
  return useCallback((e: KeyboardEvent) => keyIsForPane(paneRef.current, e), []);
}
