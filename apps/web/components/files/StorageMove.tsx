"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CloseIcon, DeviceIcon, DownloadIcon } from "@/components/tools";
import { type StoredEntry, errorText, formatBytes } from "@/lib/files";
import { downloadEverything, isMovable, useStorageMoves } from "@/lib/storageMove";
import { type AccountStorage, moveDateLabel, useStoragePlan } from "@/lib/storagePlan";

/**
 * The notice for free accounts that still have files, recordings or songs online from before
 * files moved to devices: a small banner everywhere (closable for a week), and a panel on the Files
 * page to back them up or move them to this device.
 */

const DISMISS_KEY = "jam-practice-device-move-dismissed";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const listeners = new Set<() => void>();

/** Closing it hides it for a week (not for good: the date matters). */
function readHidden() {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < WEEK;
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** What the banner should say, or null when it shouldn't show. */
export function useMoveNotice(): { count: number; bytes: number; dismiss: () => void } | null {
  const storage = useStoragePlan();
  const pathname = usePathname();
  const hidden = useSyncExternalStore(subscribe, readHidden, () => true);
  // Pages that already explain it.
  if (pathname === "/files" || pathname === "/plans" || pathname?.startsWith("/tunes")) return null;
  if (!storage || storage.plan || storage.toMove.count === 0) return null;
  if (hidden) return null;
  return {
    ...storage.toMove,
    dismiss: () => {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {}
      listeners.forEach((l) => l());
    },
  };
}

/** The notice as a small card at the bottom of the screen (out of the way of page headers), on
    every page but the ones that explain it. Rendered by `AppChrome`. */
export function StorageMoveBanner() {
  const notice = useMoveNotice();
  if (!notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[44] flex justify-center px-4 lg:pl-64 lg:pr-20">
      <div role="status" className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl bg-background/95 px-4 py-3 text-sm text-foreground shadow-lg ring-1 ring-foreground/10 backdrop-blur">
        <DeviceIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="font-medium">Files are moving to your devices on {moveDateLabel()}.</span> Back up your{" "}
          {notice.count === 1 ? "file" : `${notice.count} files`} ({formatBytes(notice.bytes)}) or move {notice.count === 1 ? "it" : "them"} now.{" "}
          <Link href="/tunes?tab=files" className="font-medium text-accent hover:underline">
            Review
          </Link>
        </span>
        <button type="button" aria-label="Hide for a week" onClick={notice.dismiss} className="-mr-1 mt-0.5 shrink-0 rounded-sm p-0.5 opacity-60 hover:opacity-100">
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The Files page's panel: what's changing, and buttons to back up or move what's still online. */
export function StorageMovePanel({ storage, items }: { storage: AccountStorage; items: StoredEntry[] }) {
  const { moveToDevice } = useStorageMoves(storage.userId);
  const [busy, setBusy] = useState<{ what: "zip" | "move"; done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  if (storage.plan || storage.toMove.count === 0) return null;
  const toMove = items.filter((i) => isMovable(i) && !i.device && !i.sharedId && !i.keepOnline);
  const plural = storage.toMove.count === 1 ? "" : "s";

  async function backUp() {
    setMessage(null);
    setBusy({ what: "zip", done: 0, total: toMove.length });
    try {
      const { saved, skipped } = await downloadEverything(toMove, (done, total) => setBusy({ what: "zip", done, total }));
      setMessage(skipped ? { text: `Downloaded ${saved}; ${skipped} couldn't be downloaded.`, error: true } : { text: `Downloaded ${saved} file${saved === 1 ? "" : "s"} as a .zip.` });
    } catch (e) {
      setMessage({ text: errorText(e, "Couldn't make the download."), error: true });
    } finally {
      setBusy(null);
    }
  }

  async function moveAll() {
    setMessage(null);
    let failed = 0;
    let lastError = "";
    for (let i = 0; i < toMove.length; i++) {
      setBusy({ what: "move", done: i, total: toMove.length });
      try {
        await moveToDevice(toMove[i]);
      } catch (e) {
        failed += 1;
        lastError = errorText(e, "");
        // The browser is out of room: the rest won't fit either.
        if (/full|turned off|private/i.test(lastError)) break;
      }
    }
    setBusy(null);
    setMessage(failed ? { text: `${failed} couldn't be moved. ${lastError}`.trim(), error: true } : { text: "Done: they're on this device now." });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <DeviceIcon className="h-5 w-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-semibold">Your files are moving to your devices</h2>
          <p className="text-sm text-muted">
            From {moveDateLabel()}, free accounts keep files, recordings and songs on the device that saved them instead of online. Nothing else changes:
            every tool and feature still works, and your tunes, notes and Shed Log still sync. Only having these files on all your devices needs a{" "}
            <Link href="/plans" className="text-accent hover:underline">
              storage plan
            </Link>
            .
          </p>
          <p className="text-sm">
            <span className="font-medium">
              {storage.toMove.count} file{plural} ({formatBytes(storage.toMove.bytes)})
            </span>{" "}
            {storage.toMove.count === 1 ? "is" : "are"} still online. Download a backup, or move {storage.toMove.count === 1 ? "it" : "them"} to this device
            now. Shared files, lesson files and your profile picture stay online.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:pl-12">
        <button
          type="button"
          onClick={() => void backUp()}
          disabled={!!busy}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 sm:h-9"
        >
          <DownloadIcon className="h-4 w-4" /> Download a backup
        </button>
        <button
          type="button"
          onClick={() => void moveAll()}
          disabled={!!busy}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-50 sm:h-9"
        >
          <DeviceIcon className="h-4 w-4" /> Move to this device
        </button>
        <Link href="/plans" className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground sm:h-9">
          See storage plans
        </Link>
        {busy && (
          <span className="flex items-center gap-2 text-sm text-muted">
            <LoadingSpinner size="sm" inline label={busy.what === "zip" ? "Downloading" : "Moving"} />
            {busy.what === "zip" ? "Downloading" : "Moving"} {Math.min(busy.done + 1, busy.total)} of {busy.total}…
          </span>
        )}
      </div>
      {message && <p className={`text-sm sm:pl-12 ${message.error ? "text-danger" : "text-muted"}`}>{message.text}</p>}
    </section>
  );
}

/** In place of a player or preview, for something kept on another device. */
export function OnOtherDevice({ label, what = "file" }: { label: string; what?: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-foreground/[0.05] px-3 py-2 text-xs text-muted">
      <DeviceIcon className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        This {what} is kept on {label}, so play it there. A{" "}
        <Link href="/plans" className="text-accent hover:underline">
          storage plan
        </Link>{" "}
        keeps it on all your devices.
      </span>
    </p>
  );
}
