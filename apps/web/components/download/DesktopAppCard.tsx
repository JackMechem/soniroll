"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CloseIcon, DownloadIcon } from "@/components/tools";
import { useInDesktopApp } from "@/lib/deviceFiles";
import { DOWNLOAD_PATH, PLATFORM_NAME, detectPlatform } from "@/lib/desktopRelease";

/**
 * The dashboard's desktop app card: what it is and a button for your computer. Only on the website
 * on a computer (not inside the app, not on phones). × puts it away for good on this device; it's
 * also a normal dashboard card (Edit can move, resize or remove it).
 */

const DISMISS_KEY = "jam-practice-desktop-card-dismissed";
const listeners = new Set<() => void>();
const noSubscribe = () => () => {};

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** True once the card was closed on this device (true on the server, so it never flashes in). */
export function useDesktopCardDismissed() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readDismissed,
    () => true,
  );
}

/** Whether the card has anything to offer here: a computer, on the website. */
export function useDesktopCardApplies() {
  const inApp = useInDesktopApp();
  const platform = useSyncExternalStore(noSubscribe, detectPlatform, () => null);
  return !inApp && platform !== null;
}

export function DesktopAppCard({ always = false }: { always?: boolean }) {
  const dismissed = useDesktopCardDismissed();
  const applies = useDesktopCardApplies();
  const platform = useSyncExternalStore(noSubscribe, detectPlatform, () => null);
  if (!always && (dismissed || !applies)) return null;
  return (
    <section className="relative flex h-full flex-col gap-4 overflow-hidden rounded-lg bg-surface p-4 @2xl:flex-row @2xl:items-center sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <DownloadIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">soniroll for your computer</h2>
        <p className="text-sm text-muted">The desktop app: its own audio engine for steadier timing, files kept on your computer, its own window. Free.</p>
      </div>
      <div className={`flex shrink-0 flex-wrap items-center gap-2 ${always ? "" : "pr-6 @2xl:pr-8"}`}>
        <Link href={DOWNLOAD_PATH} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
          <DownloadIcon className="h-4 w-4" /> {platform ? `Get it for ${PLATFORM_NAME[platform]}` : "Get the desktop app"}
        </Link>
      </div>
      {/* While the dashboard is edited (`always`), its frame has its own × to take the card off. */}
      {!always && (
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
            listeners.forEach((l) => l());
          }}
          aria-label="Hide this card"
          title="Hide this card"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}
