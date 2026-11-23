"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { TABS_DEFAULTS, TABS_KEY, receiveSavedTabs, setTabNavigator, switchBy, switchToIndex } from "@/lib/useTabs";

/** Whether a key press comes from somewhere you type (no tab shortcuts there). */
function typing(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], .cm-editor");
}

/**
 * Connects the tabs (`lib/useTabs.ts`) to where they're saved — the account signed in, this
 * browser signed out (`useSyncedSettings`) — and to Next's router, and adds the keyboard
 * shortcuts: Ctrl+Alt (⌘⌥ on a Mac) with 1–8 for that tab, 9 for the last, [ and ] for the one
 * before or after. Not while typing. Mounted once, by `AppShell`.
 */
export default function TabsSync() {
  const [saved, update, ready] = useSyncedSettings(TABS_KEY, TABS_DEFAULTS);
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    receiveSavedTabs(saved.tabs, isAuthenticated ? "account" : "local", ready, update);
  }, [saved, isAuthenticated, ready, update]);

  useEffect(() => {
    setTabNavigator((href) => router.replace(href));
    return () => setTabNavigator(null);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.defaultPrevented || typing(e.target)) return;
      // `code`, not `key`: with Alt held a Mac types other characters.
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) {
        const n = Number(digit[1]);
        switchToIndex(n === 9 ? -1 : n - 1);
      } else if (e.code === "BracketLeft") switchBy(-1);
      else if (e.code === "BracketRight") switchBy(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
