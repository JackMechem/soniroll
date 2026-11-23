"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import PageBar from "@/components/PageBar";
import { FileTypeIcon, FileViewer, fileDetail } from "@/components/files/FileParts";
import { useOpenInTool } from "@/components/files/openInTool";
import { PageShell } from "@/components/library/shared";
import PdfEditor from "@/components/pdf/PdfEditor";
import { DownloadIcon, FileIcon, FolderIcon } from "@/components/tools";
import { useDeviceUrl } from "@/lib/deviceFiles";
import { type StoredEntry, type StoredKind, downloadFile, fileKind } from "@/lib/files";
import { filesHref } from "@/lib/fileView";
import { goBackOr } from "@/lib/goBack";
import { SIGN_IN_PATH } from "@/lib/landing";
import { usePageCrumbs } from "@/lib/pageCrumbs";
import { usePaneId } from "@/lib/paneContext";

const KINDS: StoredKind[] = ["file", "recording", "song", "lesson", "handin", "profile"];

/**
 * `/files/view?kind=…&id=…`: one of your own files on a page of its own, mostly for the side view
 * and split screen (`lib/fileView.ts`) — a PDF in the PDF viewer and editor (markings saved as
 * always) filling the pane under its bar, anything else shown in place with Download. As a page of
 * its own (not in a pane) a PDF opens in the full-window editor, and Done goes back.
 */
export default function FileViewPage({ kind, id }: { kind: string; id: string }) {
  const router = useRouter();
  const inPane = usePaneId() !== null;
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storedKind = KINDS.includes(kind as StoredKind) ? (kind as StoredKind) : null;
  const raw = useQuery(api.fileFolders.item, isAuthenticated && storedKind && id ? { kind: storedKind, id } : "skip");
  // A file kept on this device (no storage plan) opens from here too.
  const item = useDeviceUrl(raw) as (StoredEntry & { folder: string; tags: string[] }) | null | undefined;
  const openIn = useOpenInTool();

  const folder = item?.folder || undefined;
  const crumbs = [{ label: "Files", href: filesHref() }, ...(folder ? [{ label: folder.split("/").pop()!, href: filesHref({ folder }) }] : []), { label: item?.name ?? "File" }];
  const pdf = !!item && fileKind(item.mimeType, item.name) === "pdf";
  // The pane's bar shows the trail (PageBar does it for the other cases).
  usePageCrumbs(pdf ? { crumbs, icon: FileIcon } : null);

  const message = (text: React.ReactNode) => (
    <PageShell>
      <PageBar crumbs={crumbs} icon={FileIcon} />
      <div className="flex flex-col items-center gap-2 py-20 text-center text-sm text-muted">{text}</div>
    </PageShell>
  );

  if (isLoading || (isAuthenticated && raw === undefined)) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }
  if (!isAuthenticated) {
    return message(
      <p>
        <Link href={SIGN_IN_PATH} className="font-medium text-accent hover:underline">
          Sign in
        </Link>{" "}
        to open your files.
      </p>,
    );
  }
  if (!item) return message(<p>This file isn&apos;t in your Files any more.</p>);

  if (pdf && item.url) {
    const editor = (
      <PdfEditor
        file={{ id: item.kind === "file" ? item.id : undefined, name: item.name, url: item.url }}
        embedded={inPane}
        onClose={inPane ? undefined : () => goBackOr(router, filesHref({ folder }))}
      />
    );
    // In a pane: under the pane's bar (3.5rem), filling the rest.
    return inPane ? <div className="flex min-h-0 flex-1 flex-col pt-14">{editor}</div> : editor;
  }

  const kindOf = fileKind(item.mimeType, item.name);
  const tools = openIn.toolsFor(item);
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50";
  return (
    <PageShell>
      <PageBar crumbs={crumbs} icon={FileIcon} />
      <header className="flex items-center gap-3">
        <FileTypeIcon kind={kindOf} size="lg" recording={item.kind === "recording"} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{item.name}</h1>
          <p className="truncate text-sm text-muted">{fileDetail(item, folder ? `in ${folder}` : null)}</p>
        </div>
      </header>
      <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-foreground/[0.04]">
        <FileViewer file={item} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tools.map((t) => (
          <button key={t.href} type="button" className={btn} onClick={t.open} disabled={!!openIn.busy}>
            <t.icon className="h-4 w-4" /> Open in {t.label}
          </button>
        ))}
        {item.url && (
          <button type="button" className={btn} onClick={() => void downloadFile(item.url!, item.name)}>
            <DownloadIcon className="h-4 w-4" /> Download
          </button>
        )}
        <Link href={filesHref({ folder })} className={btn}>
          <FolderIcon className="h-4 w-4" /> {folder ? `Open ${folder.split("/").pop()}` : "Open Files"}
        </Link>
      </div>
      {openIn.error && <p className="text-sm text-danger">{openIn.error}</p>}
    </PageShell>
  );
}
