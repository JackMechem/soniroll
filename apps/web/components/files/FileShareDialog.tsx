"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import { FileTypeIcon } from "@/components/files/FileParts";
import { CheckIcon, CloseIcon, LinkIcon, ShareIcon } from "@/components/tools";
import { type StoredEntry, errorText, fileKind, filesApi, formatBytes, sharedFileUrl } from "@/lib/files";
import { useStorageMoves } from "@/lib/storageMove";
import { useStoragePlan } from "@/lib/storagePlan";
import { shareLink } from "@/lib/shareLink";

/** What the person you send it to sees, by where the file came from. */
const NOTE: Partial<Record<StoredEntry["kind"], string>> = {
  lesson: "Only this file is shared, not the lesson it's in.",
  handin: "Only this file is shared, not the rest of your hand-in.",
  song: "Only the song is shared, not your takes or the tune.",
};

/**
 * Share one file by link (`/file/<id>`): make the link, send or copy it, or stop sharing. Anyone
 * with the link can open and download the file — no account needed — and save a copy to their own
 * files if they're signed in. The link always shows the file as it is now (a rename shows; deleting
 * the file ends the link).
 */
export default function FileShareDialog({ item, onClose }: { item: StoredEntry; onClose: () => void }) {
  const shareId = useQuery(filesApi.itemShare, { kind: item.kind, id: item.id });
  const share = useMutation(filesApi.shareItem);
  const unshare = useMutation(filesApi.unshareItem);
  const storage = useStoragePlan();
  const { moveOnline } = useStorageMoves(storage?.userId);
  // Kept on a device: a link can't reach it, so making one puts it online first.
  const onDevice = !!item.device;
  const elsewhere = onDevice && !item.url;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(id: string) {
    const result = await shareLink(item.name, sharedFileUrl(id));
    setStatus(result === "copied" ? "Link copied" : result === "failed" ? "Couldn't copy — select the link above" : null);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      // A file kept on this device goes online first; the link comes with it.
      const id = (onDevice ? await moveOnline(item, "share") : null) ?? (await share({ kind: item.kind, id: item.id }));
      await send(id);
    } catch (e) {
      setError(errorText(e, "Couldn't share the file."));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-overlay sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Share ${item.name}`}
        className="flex w-full max-w-md flex-col gap-4 rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Share a file</h2>
            <p className="text-sm text-muted">Anyone with the link can open and download it, no account needed.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-foreground/[0.05] p-3">
          <FileTypeIcon kind={fileKind(item.mimeType, item.name)} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{item.name}</p>
            <p className="text-xs text-muted">{formatBytes(item.size)}</p>
          </div>
        </div>
        {NOTE[item.kind] && <p className="-mt-2 text-xs text-muted">{NOTE[item.kind]}</p>}
        {shareId === null && onDevice && (
          <p className="-mt-2 text-xs text-muted">
            {elsewhere
              ? `It's kept on ${item.device!.label}. Share it from there.`
              : storage?.plan
                ? "It's kept on this device. Making a link puts it online first."
                : `It's kept on this device. Making a link puts it online first, using ${formatBytes(item.size)} of your ${formatBytes(storage?.quota ?? 0)} of online space for sharing.`}
          </p>
        )}

        {shareId === undefined ? (
          <LoadingSpinner />
        ) : shareId ? (
          <>
            <div className="flex h-10 items-center gap-2 rounded-md bg-background px-3">
              <LinkIcon className="h-4 w-4 shrink-0 text-muted" />
              <input readOnly value={sharedFileUrl(shareId)} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void send(shareId)} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
                <ShareIcon className="h-4 w-4" /> Share link
              </button>
              <a href={`/file/${shareId}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
                Open
              </a>
              <button
                type="button"
                onClick={() => {
                  setStatus(null);
                  void unshare({ kind: item.kind, id: item.id });
                }}
                className="ml-auto inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-danger hover:bg-surface-hover"
              >
                Stop sharing
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || elsewhere}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? <LoadingSpinner size="sm" inline label="Making the link" /> : <LinkIcon className="h-4 w-4" />}
            Make a link
          </button>
        )}
        {status && (
          <p className="flex items-center gap-1.5 text-sm text-accent">
            <CheckIcon className="h-4 w-4" /> {status}
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
