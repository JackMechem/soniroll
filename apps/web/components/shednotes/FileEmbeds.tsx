"use client";

import type { EditorView } from "@codemirror/view";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import { FilePreviewDialog, FileRow, FileTypeIcon, fileDetail, type PreviewFile } from "@/components/files/FileParts";
import { DownloadIcon, MaximizeIcon, SearchIcon, UploadIcon } from "@/components/tools";
import { downloadFile, errorText, fileKind, type StoredEntry } from "@/lib/files";
import { useEmbeds } from "./embedStore";
import type { ScoreContext } from "./ScoreEmbeds";
import { useDeviceUrl, useDeviceUrls } from "@/lib/deviceFiles";
import { isMovable, useStorageMoves } from "@/lib/storageMove";
import { useStoragePlan } from "@/lib/storagePlan";

/** Renders the files in one editor's `![name](file:…)` lines into their widgets (see `embedStore`). */
export default function FileEmbeds({ owner, context }: { owner: string; context?: ScoreContext }) {
  const embeds = useEmbeds().filter((e) => e.owner === owner && e.kind === "file");
  return <>{embeds.map((e) => createPortal(<FileEmbedView fileRef={e.id} name={e.name ?? ""} width={e.width} context={context} view={e.view} />, e.el, e.key))}</>;
}

/** The ref a stored item goes into a note by: an upload's id, or `<kind>/<id>` for the rest. */
export const refOf = (item: Pick<StoredEntry, "kind" | "id">) => (item.kind === "file" ? item.id : `${item.kind}/${item.id}`);

const card = "flex items-center gap-3 rounded-lg bg-surface p-2.5 pr-3";
const pill = "print:hidden inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover";

/**
 * One file in a note: a picture as itself (double-click or ⤢ for full size), a PDF in a frame
 * (wide screens; a card on phones), audio and video with their players, anything else as a card to
 * download. In the editor (`view`) it tells CodeMirror when its height changes; on a page
 * (printing, a note's link) it marks itself `data-ready` once it's drawn.
 */
export function FileEmbedView({ fileRef, name, width, context, view }: { fileRef: string; name: string; width?: number; context?: ScoreContext; view?: EditorView }) {
  const web = fileRef.startsWith("https://");
  const row = useDeviceUrl(useQuery(api.files.embed, web ? "skip" : { ref: fileRef, ...(context ?? {}) }));
  const file: PreviewFile | null | undefined = useMemo(
    () => (web ? { name: name || "Picture", mimeType: "image/*", size: 0, createdAt: 0, url: fileRef } : row ? { name: row.name, mimeType: row.mimeType, size: row.size, createdAt: row.createdAt, url: row.url } : row),
    [web, name, fileRef, row],
  );
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Pictures and players size themselves after CodeMirror measured the widget.
  useEffect(() => {
    const el = box.current;
    if (!el || !view) return;
    const ro = new ResizeObserver(() => view.requestMeasure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const kind = file ? fileKind(file.mimeType, file.name) : null;
  const ready = file === null || (file !== undefined && (kind !== "image" || loaded));

  let body;
  if (file === undefined) body = <div className="h-24 rounded-lg bg-surface motion-safe:animate-pulse" />;
  else if (file === null || !file.url) {
    body = (
      <div className={card}>
        <FileTypeIcon kind="other" size="sm" />
        <p className="min-w-0 flex-1 text-sm text-muted">
          <span className="font-medium text-foreground">{name || "A file"}</span> isn&apos;t available — it was deleted, or it isn&apos;t shared with you.
        </p>
      </div>
    );
  } else if (kind === "image") {
    body = (
      <div className="group relative inline-block max-w-full align-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.url}
          alt={name || file.name}
          title={file.name}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          onDoubleClick={() => setOpen(true)}
          style={width ? { width: `${width}px` } : undefined}
          className="block max-h-[36rem] max-w-full rounded-lg object-contain"
        />
        {view && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Open ${file.name} full size`}
            title="Full size"
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md bg-background/85 text-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <MaximizeIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  } else {
    const header = (
      <div className={card}>
        <FileTypeIcon kind={kind ?? "other"} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name || file.name}</span>
          <span className="block truncate text-xs text-muted">{fileDetail(file)}</span>
        </span>
        {kind === "pdf" || kind === "video" ? (
          <button type="button" onClick={() => setOpen(true)} className={pill}>
            <MaximizeIcon className="h-3.5 w-3.5" /> Open
          </button>
        ) : kind !== "audio" ? (
          <button type="button" onClick={() => void downloadFile(file.url!, file.name)} className={pill}>
            <DownloadIcon className="h-3.5 w-3.5" /> Download
          </button>
        ) : null}
      </div>
    );
    body = (
      <div className="flex flex-col gap-1.5">
        {header}
        {kind === "audio" && <audio controls preload="metadata" src={file.url} className="w-full" />}
        {kind === "video" && <video controls preload="metadata" src={file.url} className="max-h-[28rem] max-w-full rounded-lg bg-background" />}
        {/* Phones don't draw PDFs in a frame — Open shows it full screen instead. */}
        {kind === "pdf" && <iframe src={file.url} title={file.name} className="hidden h-[32rem] w-full rounded-lg bg-background sm:block print:hidden" />}
      </div>
    );
  }

  return (
    <div ref={box} data-ready={ready ? "" : undefined} className="note-file">
      {body}
      {open && file?.url && <FilePreviewDialog file={file} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** "Insert a file": everything on your Files page (search by name), or upload new ones. */
export function FilePickDialog({ onPick, onUpload, onClose }: { onPick: (ref: string, name: string) => void; onUpload: (files: File[]) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const storage = useQuery(api.files.storage, {});
  const storedItems = useDeviceUrls(storage?.items);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const plan = useStoragePlan();
  const { moveOnline } = useStorageMoves(plan?.userId);
  const keepOnline = useMutation(api.files.keepOnline);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Everyone who can open the note sees what's in it, so a file kept on this device goes online
      first, and stays online (it's marked as being in a note). */
  async function pick(f: StoredEntry) {
    setError(null);
    try {
      if (isMovable(f)) {
        if (f.device) {
          setBusy(`Putting "${f.name}" online…`);
          await moveOnline(f, "note");
        }
        await keepOnline({ kind: f.kind, id: f.id });
      }
      onPick(refOf(f), f.name);
    } catch (e) {
      setError(errorText(e, `Couldn't add "${f.name}".`));
    } finally {
      setBusy(null);
    }
  }
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (storedItems ?? []).filter((f) => f.kind !== "profile" && (!q || f.name.toLowerCase().includes(q)));
  }, [storedItems, query]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-label="Insert a file" className="flex max-h-[75vh] w-full max-w-lg flex-col gap-3 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-base font-semibold">Insert a file</h2>
          <button type="button" onClick={() => input.current?.click()} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
            <UploadIcon className="h-4 w-4" /> Upload
          </button>
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) onUpload(files);
            }}
          />
        </div>
        {busy && <p className="text-sm text-muted">{busy}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex h-9 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 transition-colors focus-within:ring-2 focus-within:ring-accent/40">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your files" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <div className="-mx-1 flex flex-col gap-0.5 overflow-y-auto">
          {storage === undefined ? (
            <div className="flex justify-center p-4">
              <LoadingSpinner />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-3 text-sm text-muted">{query ? "No files match." : "Nothing in your files yet. Upload one, or paste a picture straight into the note."}</p>
          ) : (
            rows.map((f) => <FileRow key={`${f.kind}:${f.id}`} name={f.name} mimeType={f.mimeType} detail={fileDetail(f)} onOpen={() => void pick(f)} />)
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
