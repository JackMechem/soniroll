"use client";

import { useSyncExternalStore } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/tools";

/**
 * Back and Forward, always shown at the start of every window's header (Jack: "forward and back
 * buttons that are always visible on every window header"): a page's bar (the browser's history)
 * and every split-screen pane's bar (that pane's own history). Greyed out when there's nowhere to
 * go. The desktop app has no browser buttons, so these are its only ones.
 */
export default function HistoryArrows({
  canBack,
  canForward,
  onBack,
  onForward,
  backTitle = "Back",
}: {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  backTitle?: string;
}) {
  const btn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-35 pointer-coarse:h-10 pointer-coarse:w-10";
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" onClick={onBack} disabled={!canBack} aria-label={backTitle} title={backTitle} className={btn}>
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
      <button type="button" onClick={onForward} disabled={!canForward} aria-label="Forward" title="Forward" className={btn}>
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ——— The browser's own history, for a page's bar ———

type NavigationLike = EventTarget & { canGoBack: boolean; canGoForward: boolean };

function navigationApi(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const nav = (window as Window & { navigation?: NavigationLike }).navigation;
  return nav && typeof nav.canGoBack === "boolean" ? nav : null;
}

function subscribe(listener: () => void) {
  // Next changes the address inside an insertion effect, where React mustn't be told to update:
  // re-read a moment later instead.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(listener, 0);
  };
  const nav = navigationApi();
  nav?.addEventListener("currententrychange", later);
  window.addEventListener("popstate", later);
  return () => {
    clearTimeout(timer);
    nav?.removeEventListener("currententrychange", later);
    window.removeEventListener("popstate", later);
  };
}

/** Whether the browser can go back / forward. Where the Navigation API is missing (Safari, the
    desktop app's WebKit) both stay available, since there's no way to tell. */
export function useBrowserHistory(): { canBack: boolean; canForward: boolean } {
  const canBack = useSyncExternalStore(subscribe, () => navigationApi()?.canGoBack ?? true, () => false);
  const canForward = useSyncExternalStore(subscribe, () => navigationApi()?.canGoForward ?? true, () => false);
  return { canBack, canForward };
}
