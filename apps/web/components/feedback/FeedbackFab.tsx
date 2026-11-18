"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BugIcon, CloseIcon } from "@/components/tools";
import { openFeedback } from "@/components/feedback/FeedbackForm";
import { useSiteStatus } from "@/lib/useSiteStatus";

const KEY = "jam-practice-feedback-fab-hidden";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function setHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: it just comes back next visit
  }
  listeners.forEach((l) => l());
}

/** Bring the floating button back (e.g. from a menu) after it was closed. */
export function showFeedbackFab() {
  setHidden(false);
}

/** Hide the floating button on this device (Settings → General). */
export function hideFeedbackFab() {
  setHidden(true);
}

/** Whether the floating button has been closed on this device (false on the server). */
export function useFeedbackFabHidden(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * "Report a bug" pinned to the bottom-right corner of every page on desktop, opening the feedback
 * dialog. The little × hides it on this device (localStorage); "Send feedback" in the sidebar's ⋮
 * menu still works after that. Phones get `FeedbackBarButton` in the top bar instead, where it
 * can't sit on top of a tool's controls. Rendered hidden on the server so it never flashes for
 * someone who closed it.
 */
export default function FeedbackFab() {
  const show = useShowFeedbackButton();
  if (!show) return null;
  // z-[35]: above the page, but under menus, sheets and dialogs, so it never sits on their rows.
  return (
    <div className="group fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-[35] flex items-center print:hidden max-lg:hidden">
      <button
        type="button"
        onClick={() => openFeedback({ kind: "bug" })}
        aria-label="Report a bug"
        className="flex h-10 min-w-10 items-center justify-center rounded-full bg-background/80 px-3 ring-1 ring-foreground/10 text-sm font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:bg-background/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <BugIcon className="h-4 w-4 shrink-0" />
        {/* The label only opens out on hover / keyboard focus. */}
        <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-32 group-hover:opacity-100 group-focus-within:ml-2 group-focus-within:max-w-32 group-focus-within:opacity-100">
          Report a bug
        </span>
      </button>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Hide the bug report button"
        title="Hide (you can still send feedback from the sidebar menu)"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted shadow ring-1 ring-foreground/10 backdrop-blur hover:text-foreground"
      >
        <CloseIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Phones: the same "Report a bug" as a small round button at the right of the top bar. Hidden
    with the floating one (its ×, or Settings → General). */
export function FeedbackBarButton() {
  const show = useShowFeedbackButton();
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => openFeedback({ kind: "bug" })}
      aria-label="Report a bug"
      title="Report a bug"
      className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <BugIcon className="h-[18px] w-[18px]" />
    </button>
  );
}

function useShowFeedbackButton(): boolean {
  const hidden = useSyncExternalStore(subscribe, read, () => true);
  const site = useSiteStatus();
  const pathname = usePathname();
  // Not on the feedback page itself: it would only sit over its Send button.
  return !hidden && !site?.feedbackPaused && pathname !== "/feedback";
}
