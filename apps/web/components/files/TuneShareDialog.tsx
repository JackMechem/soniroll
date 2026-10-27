"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CheckIcon, ChordChartIcon, CloseIcon, FileIcon, LinkIcon, MicIcon, ShareIcon } from "@/components/tools";
import { errorText, filesApi } from "@/lib/files";
import { recordingsApi } from "@/lib/recordings";
import { shareLink } from "@/lib/shareLink";
import { siteOrigin } from "@/lib/siteOrigin";

/** The address a shared tune's link opens (`app/tune/[id]`). */
export function sharedTuneUrl(shareId: string) {
  return `${siteOrigin()}/tune/${shareId}`;
}

/**
 * Share a tune by link: make the link, send or copy it, or stop sharing. The link always shows the
 * tune as it is now — its chord chart, attached files and recordings — never its notes. Anyone with
 * the link can see it, no account needed.
 */
export default function TuneShareDialog({ tuneId, tuneName, hasChart, onClose }: { tuneId: string; tuneName: string; hasChart: boolean; onClose: () => void }) {
  const shareId = useQuery(filesApi.tuneShare, { tuneId });
  const files = useQuery(filesApi.listForTune, { tuneId });
  const recordings = useQuery(recordingsApi.listForTune, { tuneId });
  const share = useMutation(filesApi.shareTune);
  const unshare = useMutation(filesApi.unshareTune);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(id: string) {
    const result = await shareLink(tuneName, sharedTuneUrl(id));
    setStatus(result === "copied" ? "Link copied" : result === "failed" ? "Couldn't copy — select the link above" : null);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const id = await share({ tuneId });
      await send(id);
    } catch (e) {
      setError(errorText(e, "Couldn't share the tune."));
    } finally {
      setBusy(false);
    }
  }

  const fileCount = files?.length ?? 0;
  const recCount = recordings?.length ?? 0;
  const included = [
    { icon: ChordChartIcon, text: hasChart ? "Its chord chart" : "No chord chart linked", on: hasChart },
    { icon: FileIcon, text: fileCount ? `${fileCount} file${fileCount === 1 ? "" : "s"}` : "No files attached", on: fileCount > 0 },
    { icon: MicIcon, text: recCount ? `${recCount} recording${recCount === 1 ? "" : "s"}` : "No recordings", on: recCount > 0 },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Share ${tuneName}`}
        className="flex w-full max-w-md flex-col gap-4 rounded-t-3xl bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-3xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">Share {tuneName}</h2>
            <p className="text-sm text-muted">Anyone with the link can see it, no account needed. It always shows the tune as it is now.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <ul className="flex flex-col gap-1.5 rounded-2xl bg-background p-3 text-sm">
          {included.map(({ icon: Icon, text, on }) => (
            <li key={text} className={`flex items-center gap-2.5 ${on ? "" : "text-muted"}`}>
              <Icon className={`h-4 w-4 ${on ? "text-accent" : ""}`} />
              {text}
            </li>
          ))}
          <li className="flex items-center gap-2.5 text-muted">
            <span className="h-4 w-4" />
            Your notes are never shared.
          </li>
        </ul>

        {shareId === undefined ? (
          <LoadingSpinner />
        ) : shareId ? (
          <>
            <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2.5">
              <LinkIcon className="h-4 w-4 shrink-0 text-muted" />
              <input readOnly value={sharedTuneUrl(shareId)} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void send(shareId)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
                <ShareIcon className="h-4 w-4" /> Share link
              </button>
              <a href={`/tune/${shareId}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-full bg-background px-4 text-sm font-semibold hover:bg-surface-hover">
                Open
              </a>
              <button
                type="button"
                onClick={() => {
                  setStatus(null);
                  void unshare({ tuneId });
                }}
                className="ml-auto inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold text-danger hover:bg-background"
              >
                Stop sharing
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
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
