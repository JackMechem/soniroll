import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { currentToolHref, NAV_LINKS_DATA } from "@jam-practice/core/navLinks";
import { usePersistedSettings } from "./usePersistedSettings";

/** The tools opened most recently in this browser (their nav hrefs, newest first) — Home's "Jump
    back in" row. Device-local, like the chart/tune recents (`lib/recents.ts`). */
const KEY = "jam-practice-tool-recents";
const DEFAULTS = { hrefs: [] as string[] };
const MAX = 8;
const TOOL_HREFS = new Set(NAV_LINKS_DATA.map((l) => l.href));

export function useRecentTools(): string[] {
  const hrefs = usePersistedSettings(KEY, DEFAULTS)[0].hrefs;
  // A tool folded into another (Bass Genius, Drum Generator) shows as the one that replaced it.
  return useMemo(() => [...new Set(hrefs.map(currentToolHref))], [hrefs]);
}

/** Mounted once (in `AppShell`): notes every tool page that's opened. */
export function useRecordToolVisits() {
  const pathname = usePathname();
  const [{ hrefs }, update] = usePersistedSettings(KEY, DEFAULTS);
  const latest = useRef({ hrefs, update });
  useEffect(() => {
    latest.current = { hrefs, update };
  });
  useEffect(() => {
    if (!TOOL_HREFS.has(pathname)) return;
    const { hrefs: prev, update: set } = latest.current;
    if (prev[0] === pathname) return;
    set({ hrefs: [pathname, ...prev.filter((h) => h !== pathname)].slice(0, MAX) });
  }, [pathname]);
}
