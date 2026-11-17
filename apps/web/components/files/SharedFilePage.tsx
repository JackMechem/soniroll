"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { FileTypeIcon, FileViewer, fileDetail } from "@/components/files/FileParts";
import { CheckIcon, DownloadIcon, FileIcon } from "@/components/tools";
import { canPreview, downloadFile, errorText, fileKind, filesApi } from "@/lib/files";
import { SIGN_IN_PATH } from "@/lib/landing";

/**
 * A file someone shared by link (`/file/<id>`) — open to anyone, signed in or not. The file shown in
 * place when the browser can (PDF, image, audio, video), a download button, and — signed in — "Save
 * to my files", which copies it into your account (it counts toward your storage).
 */
export default function SharedFilePage({ id }: { id: string }) {
  const shared = useQuery(filesApi.getSharedFile, { id });

  if (shared === undefined) {
    return (
      <Shell>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </Shell>
    );
  }
  if (shared === null) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <h1 className="text-xl font-semibold">This file isn&apos;t available</h1>
          <p className="text-sm text-muted">It isn&apos;t shared anymore, or the link is wrong.</p>
        </div>
      </Shell>
    );
  }

  const kind = fileKind(shared.mimeType, shared.name);
  return (
    <Shell>
      <header className="flex items-start gap-3">
        <FileTypeIcon kind={kind} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">
            File
            {shared.ownerUsername && (
              <>
                {" · shared by "}
                <Link href={`/u/${shared.ownerUsername}`} className="text-accent hover:underline">
                  @{shared.ownerUsername}
                </Link>
              </>
            )}
          </p>
          <h1 className="break-words text-2xl font-semibold tracking-tight">{shared.name}</h1>
          <p className="text-sm text-muted">{fileDetail(shared)}</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {shared.url && (
          <button
            type="button"
            onClick={() => void downloadFile(shared.url!, shared.name)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            <DownloadIcon className="h-4 w-4" /> Download
          </button>
        )}
        {shared.isMine ? (
          <Link href="/tunes?tab=files" className="inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
            <FileIcon className="h-4 w-4" /> This is your file — open Files
          </Link>
        ) : (
          <SaveCopy shareId={shared.id} />
        )}
      </div>

      {canPreview(kind) && (
        <div className={`flex items-center justify-center overflow-hidden rounded-lg bg-surface ${kind === "pdf" ? "h-[75vh]" : "min-h-48"}`}>
          <FileViewer file={shared} />
        </div>
      )}
    </Shell>
  );
}

/** "Save to my files": a copy in your account, or a sign-in link when signed out. */
function SaveCopy({ shareId }: { shareId: string }) {
  const { isAuthenticated } = useConvexAuth();
  const copy = useAction(filesApi.copySharedFile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <Link href={SIGN_IN_PATH} className="inline-flex h-10 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
        Sign in to save a copy
      </Link>
    );
  }
  if (saved) {
    return (
      <Link href="/tunes?tab=files" className="inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium text-accent hover:bg-surface-hover">
        <CheckIcon className="h-4 w-4" /> Saved — open your files
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await copy({ shareId });
            setSaved(true);
          } catch (e) {
            setError(errorText(e, "Couldn't save the file."));
          } finally {
            setSaving(false);
          }
        }}
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
      >
        {saving && <LoadingSpinner size="sm" inline label="Saving" />}
        Save to my files
      </button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-8">{children}</main>;
}
