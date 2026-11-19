"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BugIcon } from "@/components/tools";
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

/** Bring the bug buttons back after they were hidden. */
export function showFeedbackFab() {
  setHidden(false);
}

/** Hide the bug buttons on this device (Settings → General). */
export function hideFeedbackFab() {
  setHidden(true);
}

/** Whether the bug buttons have been hidden on this device (false on the server). */
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

/** Desktop: "Report a bug" at the right end of a tool's header bar (`ToolLayout`). Hidden with the
    others (Settings → General). */
export function FeedbackHeaderButton() {
  const show = useShowFeedbackButton();
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => openFeedback({ kind: "bug" })}
      aria-label="Report a bug"
      title="Report a bug"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <BugIcon className="h-4 w-4" />
    </button>
  );
}

/** Phones: the same "Report a bug" as a small round button at the right of the top bar. Hidden
    with the others (Settings → General). */
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
