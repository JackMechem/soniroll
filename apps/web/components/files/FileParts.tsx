"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import FileShareDialog from "@/components/files/FileShareDialog";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import PromptDialog from "@/components/PromptDialog";
import { MenuButton, menuPosition } from "@/components/library/shared";
import { TuneSelectDialog } from "@/components/recordings/RecordingParts";
import { CloudIcon, DeviceIcon, CloseIcon, DocumentIcon, DownloadIcon, FileIcon, ImageIcon, LinkIcon, MicIcon, NoteIcon, PencilIcon, SearchIcon, ShareIcon, TrashIcon, UploadIcon, VideoIcon, WaveIcon } from "@/components/tools";
import {
  type FileKind,
  type StoredEntry,
  type StoredKind,
  type UserFile,
  FILE_KIND_LABEL,
  canPreview,
  downloadFile,
  entryOf,
  errorText,
  fileKind,
  filesApi,
  formatBytes,
  formatFileDate,
  saveFile,
} from "@/lib/files";
import { PLAN_HREF, type SaveTarget, useSaveTarget, useStoragePlan } from "@/lib/storagePlan";
import { deleteOnDevice, useDeviceUrls } from "@/lib/deviceFiles";
import { isMovable, useStorageMoves } from "@/lib/storageMove";
import { KeptHereHint } from "@/components/files/StorageMove";
import SaveWhere from "@/components/files/SaveWhere";
import PdfEditor from "@/components/pdf/PdfEditor";
import PdfInline from "@/components/pdf/PdfInline";
import { useOpenInTool } from "@/components/files/openInTool";

// ---------------------------------------------------------------- icons

const KIND_ICON: Record<FileKind, React.ComponentType<{ className?: string }>> = {
  pdf: DocumentIcon,
  image: ImageIcon,
  audio: WaveIcon,
  video: VideoIcon,
  notation: NoteIcon,
  document: DocumentIcon,
  other: FileIcon,
};

/** A file's type as a plain muted icon (in a bordered square at `lg`). Audio shows the wave (as
    Slow Downer's opened-file bar does); pass `recording` for a soniroll recording to get the mic. */
export function FileTypeIcon({ kind, size = "md", recording = false }: { kind: FileKind; size?: "sm" | "md" | "lg"; recording?: boolean }) {
  const Icon = recording && kind === "audio" ? MicIcon : KIND_ICON[kind];
  const dims = size === "lg" ? "h-12 w-12 rounded-lg bg-foreground/[0.05]" : size === "sm" ? "h-5 w-5" : "h-8 w-5";
  return (
    <span className={`flex shrink-0 items-center justify-center text-muted ${dims}`} aria-hidden>
      <Icon className={size === "lg" ? "h-6 w-6" : "h-4 w-4"} />
    </span>
  );
}

// ---------------------------------------------------------------- rows

/** One file in a list: type icon, name, a detail line, and an optional ⋮ menu (and right-click
    menu). Clicking opens it. */
export function FileRow({
  name,
  mimeType,
  detail,
  onOpen,
  onMenu,
  onContextMenu,
  trailing,
  recording = false,
}: {
  name: string;
  mimeType: string;
  detail: string;
  onOpen: () => void;
  onMenu?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  trailing?: ReactNode;
  recording?: boolean;
}) {
  const kind = fileKind(mimeType, name);
  return (
    <div onContextMenu={onContextMenu} className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-surface-hover">
      <button type="button" onClick={onOpen} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left">
        <FileTypeIcon kind={kind} recording={recording} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted">{detail}</span>
        </span>
      </button>
      {trailing}
      {onMenu && <MenuButton label={`Options for ${name}`} onClick={onMenu} />}
    </div>
  );
}

/** "PDF · 2.4 MB · Oct 8". */
export function fileDetail(file: { name: string; mimeType: string; size: number; createdAt: number }, extra?: string | null) {
  return [FILE_KIND_LABEL[fileKind(file.mimeType, file.name)], formatBytes(file.size), formatFileDate(file.createdAt), extra].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------- preview

export type PreviewFile = { name: string; mimeType: string; size: number; createdAt: number; url: string | null; device?: { label: string } | null };

/** The file itself: a PDF, image, audio or video shown in place, or a note to download anything the
    browser can't show. */
export function FileViewer({ file, autoPlay = false }: { file: PreviewFile; autoPlay?: boolean }) {
  const kind = fileKind(file.mimeType, file.name);
  const url = file.url;
  if (!url && file.device) {
    return (
      <div className="flex max-w-sm flex-col items-center gap-3 p-10 text-center">
        <DeviceIcon className="h-8 w-8 text-muted" />
        <p className="text-sm text-muted">
          This file is kept on {file.device.label}, so open it there. A{" "}
          <Link href={PLAN_HREF} className="text-accent hover:underline">
            storage plan
          </Link>{" "}
          keeps files on all your devices.
        </p>
      </div>
    );
  }
  if (!url) return <p className="p-8 text-sm text-muted">This file isn&apos;t available.</p>;
  if (kind === "pdf") return <PdfInline url={url} name={file.name} />;
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} className="max-h-full max-w-full object-contain p-2" />;
  }
  if (kind === "audio") {
    return (
      <div className="flex w-full max-w-lg flex-col items-center gap-4 p-8">
        <FileTypeIcon kind="audio" size="lg" />
        <audio controls autoPlay={autoPlay} src={url} className="w-full" />
      </div>
    );
  }
  if (kind === "video") return <video controls autoPlay={autoPlay} src={url} className="max-h-full max-w-full" />;
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <FileTypeIcon kind={kind} size="lg" />
      <p className="text-sm text-muted">This kind of file can&apos;t be shown here — download it to open it.</p>
    </div>
  );
}

/** A file opened full size: the PDF, image, audio or video itself, or a download for anything the
    browser can't show. `actions` adds buttons (rename, delete, …) for your own files. */
export function FilePreviewDialog({ file, actions, onClose }: { file: PreviewFile; actions?: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const kind = fileKind(file.mimeType, file.name);
  const url = file.url;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-overlay p-0 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label={file.name}
        className="flex w-full max-w-5xl flex-col overflow-hidden ring-1 ring-foreground/[0.06] bg-surface shadow-xl sm:rounded-xl sm:border sm:border-foreground/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-foreground/10 px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-3">
          <FileTypeIcon kind={kind} size="sm" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium">{file.name}</h2>
            <p className="truncate text-xs text-muted">{fileDetail(file)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background">
          <FileViewer file={file} autoPlay />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-foreground/10 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-3">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" download={file.name} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
              <DownloadIcon className="h-4 w-4" />
              {canPreview(kind) ? "Open in a new tab" : "Download"}
            </a>
          )}
          {actions}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const actionBtn = "inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover";

// ---------------------------------------------------------------- uploading

/**
 * Adding one or more files to the account, optionally attached to a tune: `pick()` opens the
 * file chooser, `drop` props make an element a drop target, and `input` must be rendered. They're
 * saved online with a storage plan, or on this device without one (`lib/storagePlan.ts`).
 */
export function useFileUploader(tuneId: string | undefined, target: SaveTarget) {
  const generateUploadUrl = useMutation(filesApi.generateUploadUrl);
  const create = useMutation(filesApi.create);
  const createOnDevice = useMutation(filesApi.createOnDevice);
  const { storage, online } = target;
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const uploadAll = useCallback(
    async (files: File[]): Promise<boolean> => {
      if (!files.length) return true;
      setError(null);
      setProgress({ done: 0, total: files.length });
      const failures: string[] = [];
      for (let i = 0; i < files.length; i++) {
        try {
          await saveFile(files[i], storage, { generateUploadUrl: () => generateUploadUrl({}), create: (args) => create(args), createOnDevice: (args) => createOnDevice(args) }, tuneId, undefined, online);
        } catch (e) {
          failures.push(errorText(e, `Couldn't upload "${files[i].name}".`));
          // Out of room: the rest won't fit either.
          if (/room|full|paused/i.test(failures[failures.length - 1])) break;
        }
        setProgress({ done: i + 1, total: files.length });
      }
      setProgress(null);
      if (failures.length) setError(failures.join(" "));
      return failures.length === 0;
    },
    [create, createOnDevice, generateUploadUrl, online, storage, tuneId],
  );

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        void uploadAll(files);
      }}
    />
  );

  const drop = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setDragging(false);
      void uploadAll(Array.from(e.dataTransfer.files));
    },
  };

  /** `uploadAll(files)`: saves files chosen some other way; resolves true when every one saved. */
  return { pick: () => inputRef.current?.click(), input, drop, dragging, progress, error, clearError: () => setError(null), uploadAll };
}

/** "Uploading 2 of 5…" while files go up. */
export function UploadProgress({ progress }: { progress: { done: number; total: number } | null }) {
  if (!progress) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <LoadingSpinner size="sm" inline label="Uploading" />
      Uploading {progress.total > 1 ? `${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : ""}…
    </div>
  );
}

// ---------------------------------------------------------------- managing what you store

/** What the ⋮ menu's "go to" item says, for items managed somewhere else too. */
const GO_TO: Partial<Record<StoredKind, string>> = {
  recording: "Open the recording",
  lesson: "Open the lesson",
  handin: "Open the lesson",
  profile: "Change it in Account",
};

/** What deleting does, by where the item came from. */
function deleteMessage(item: StoredEntry, tune: string | undefined) {
  switch (item.kind) {
    case "recording":
      return "The recording is deleted for good.";
    case "song":
      return `The song behind your takes${tune ? ` on ${tune}` : ""} is deleted for good. Your takes stay.`;
    case "lesson":
      return "It's taken out of your student's lesson and deleted for good.";
    case "handin":
      return "It's taken out of your hand-in, so your teacher won't see it any more.";
    case "profile":
      return "It's taken off your profile.";
    default:
      return "The file is deleted from your account for good. If the tune it's on is shared, it disappears from the link too.";
  }
}

/**
 * The ⋮ menu (also a right-click menu), preview and dialogs for anything you store: open, rename,
 * share by link, download, attach an upload to a tune (or move / detach it), go to where it's
 * managed, delete — and deleting several at once. `tuneName` shows which tune a file is on;
 * `hereTuneId` (on a tune's page) offers "Remove from this tune" instead of "Move to another tune".
 */
export function useFileActions({ tuneName, hereTuneId }: { tuneName: (tuneId: string) => string | undefined; hereTuneId?: string }) {
  const update = useMutation(filesApi.update);
  const rename = useMutation(filesApi.renameItem);
  const remove = useMutation(filesApi.removeItem);
  const storage = useStoragePlan();
  const moves = useStorageMoves(storage?.userId);
  const [moving, setMoving] = useState<string | null>(null);

  /** Puts a file kept on this device online, or the other way round, saying how it went. */
  async function move(item: StoredEntry, to: "online" | "device") {
    setError(null);
    setMoving(to === "online" ? `Putting "${item.name}" online…` : `Saving "${item.name}" on this device…`);
    try {
      if (to === "online") await moves.moveOnline(item);
      else await moves.moveToDevice(item);
      if (open && open.kind === item.kind && open.id === item.id) setOpen(null);
    } catch (e) {
      setError(errorText(e, to === "online" ? "Couldn't put it online." : "Couldn't save it on this device."));
    } finally {
      setMoving(null);
    }
  }
  const router = useRouter();
  const openIn = useOpenInTool();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [open, setOpen] = useState<StoredEntry | null>(null);
  const [renaming, setRenaming] = useState<StoredEntry | null>(null);
  const [linking, setLinking] = useState<StoredEntry | null>(null);
  const [sharing, setSharing] = useState<StoredEntry | null>(null);
  const [deleting, setDeleting] = useState<{ items: StoredEntry[]; onDone?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const goTo = (item: StoredEntry) =>
    item.href ? item.href : item.kind === "song" && item.tuneId ? `/tunes/tune?id=${encodeURIComponent(item.tuneId)}` : null;
  const goToLabel = (item: StoredEntry) => (item.kind === "song" ? `Open ${(item.tuneId && tuneName(item.tuneId)) || "the tune"}` : (GO_TO[item.kind] ?? "Open"));

  function items(item: StoredEntry): MenuItem[] {
    const onTune = item.tuneId ? tuneName(item.tuneId) : undefined;
    const where = goTo(item);
    return [
      { label: "Open", onSelect: () => setOpen(item), icon: <FileIcon className="h-4 w-4" /> },
      // Audio (and video): open it in a tool that plays it.
      ...openIn.toolsFor(item).map((t) => ({ label: `Open in ${t.label}`, onSelect: t.open, icon: <t.icon className="h-4 w-4" /> })),
      ...(item.kind !== "profile" ? [{ label: "Rename", onSelect: () => setRenaming(item), icon: <PencilIcon className="h-4 w-4" /> }] : []),
      ...(item.kind !== "profile" ? [{ label: item.sharedId ? "Shared — manage link" : "Share a link", onSelect: () => setSharing(item), icon: <ShareIcon className="h-4 w-4" /> }] : []),
      ...(item.url ? [{ label: "Download", onSelect: () => void downloadFile(item.url!, item.name), icon: <DownloadIcon className="h-4 w-4" /> }] : []),
      // Kept here: put it online (with a plan, or using the free online space). Online on the free
      // plan: keep it on this device instead (frees the online space).
      ...(isMovable(item) && item.device && item.url && storage?.hasPlan ? [{ label: "Put online", onSelect: () => void move(item, "online"), icon: <CloudIcon className="h-4 w-4" /> }] : []),
      ...(isMovable(item) && !item.device && !item.keepOnline && storage && !storage.hasPlan
        ? [{ label: "Keep on this device only", onSelect: () => void move(item, "device"), icon: <DeviceIcon className="h-4 w-4" /> }]
        : []),
      ...(item.kind !== "file"
        ? []
        : hereTuneId && item.tuneId === hereTuneId
          ? [{ label: "Remove from this tune", onSelect: () => void update({ id: item.id as Id<"files">, tuneId: null }), icon: <LinkIcon className="h-4 w-4" /> }]
          : [
              { label: item.tuneId ? "Move to another tune" : "Attach to a tune", onSelect: () => setLinking(item), icon: <LinkIcon className="h-4 w-4" /> },
              ...(item.tuneId ? [{ label: `Detach from ${onTune ?? "its tune"}`, onSelect: () => void update({ id: item.id as Id<"files">, tuneId: null }) }] : []),
            ]),
      ...(where ? [{ label: goToLabel(item), onSelect: () => router.push(where) }] : []),
      { label: "Delete", onSelect: () => setDeleting({ items: [item] }), danger: true, icon: <TrashIcon className="h-4 w-4" /> },
    ];
  }

  /** The ⋮ button's menu, under the button. */
  const openMenu = (item: StoredEntry, e: React.MouseEvent) => setMenu({ ...menuPosition(e), items: items(item) });
  /** A right-click menu, at the pointer. */
  const contextMenu = (item: StoredEntry, e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items: items(item) });
  };
  /** Ask, then delete several items (the Files page's selection). */
  const deleteMany = (list: StoredEntry[], onDone?: () => void) => list.length && setDeleting({ items: list, onDone });

  async function confirmDelete(list: StoredEntry[], onDone?: () => void) {
    setDeleting(null);
    if (open && list.some((i) => i.kind === open.kind && i.id === open.id)) setOpen(null);
    const failed: string[] = [];
    for (const item of list) {
      try {
        await remove({ kind: item.kind, id: item.id });
        if (item.device) await deleteOnDevice(item.device.key);
      } catch {
        failed.push(item.name);
      }
    }
    setError(failed.length ? `Couldn't delete ${failed.map((n) => `"${n}"`).join(", ")}.` : null);
    onDone?.();
  }

  const one = deleting?.items.length === 1 ? deleting.items[0] : null;
  const stacked = (
    <>
      {renaming && (
        <PromptDialog
          title="Rename"
          initialValue={renaming.name}
          confirmLabel="Rename"
          onSubmit={(name) => {
            const clean = name.trim();
            if (clean) {
              rename({ kind: renaming.kind, id: renaming.id, name: clean }).catch((e) => setError(errorText(e, "Couldn't rename it.")));
              if (open && open.kind === renaming.kind && open.id === renaming.id) setOpen({ ...open, name: clean });
            }
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
      {linking && (
        <TuneSelectDialog
          onPick={(tuneId) => {
            void update({ id: linking.id as Id<"files">, tuneId });
            if (open && open.id === linking.id) setOpen({ ...open, tuneId });
            setLinking(null);
          }}
          onClose={() => setLinking(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={one ? `Delete "${one.name}"?` : `Delete ${deleting.items.length} items?`}
          message={
            one
              ? deleteMessage(one, one.tuneId ? tuneName(one.tuneId) : undefined)
              : "They're deleted for good, along with any links to them. Lesson files leave your students' lessons, and recordings are gone from their tunes."
          }
          confirmLabel="Delete"
          onConfirm={() => void confirmDelete(deleting.items, deleting.onDone)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );

  const where = open ? goTo(open) : null;
  const dialogs = (
    <>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {open && open.url && open.kind === "file" && fileKind(open.mimeType, open.name) === "pdf" && (
        <PdfEditor file={{ id: open.id, name: open.name, url: open.url }} onClose={() => setOpen(null)} />
      )}
      {open && !(open.url && open.kind === "file" && fileKind(open.mimeType, open.name) === "pdf") && (
        <FilePreviewDialog
          file={open}
          onClose={() => setOpen(null)}
          actions={
            <>
              {openIn.toolsFor(open).map((t) => (
                <button key={t.href} type="button" className={actionBtn} onClick={t.open} disabled={!!openIn.busy}>
                  <t.icon className="h-4 w-4" /> Open in {t.label}
                </button>
              ))}
              {open.kind !== "profile" && (
                <button type="button" className={actionBtn} onClick={() => setRenaming(open)}>
                  <PencilIcon className="h-4 w-4" /> Rename
                </button>
              )}
              {open.kind !== "profile" && (
                <button type="button" className={actionBtn} onClick={() => setSharing(open)}>
                  <ShareIcon className="h-4 w-4" /> Share
                </button>
              )}
              {open.kind === "file" && (
                <button type="button" className={actionBtn} onClick={() => setLinking(open)}>
                  <LinkIcon className="h-4 w-4" /> {open.tuneId ? `On ${tuneName(open.tuneId) ?? "a tune"}` : "Attach to a tune"}
                </button>
              )}
              {where && (
                <Link href={where} className={actionBtn}>
                  {goToLabel(open)}
                </Link>
              )}
              <button type="button" className={`${actionBtn} ml-auto text-danger`} onClick={() => setDeleting({ items: [open] })}>
                <TrashIcon className="h-4 w-4" /> Delete
              </button>
            </>
          }
        />
      )}
      {/* Above the preview, which they can be opened from. */}
      {(renaming || linking || deleting) && createPortal(<div className="relative z-[80]">{stacked}</div>, document.body)}
      {/* Portals itself above the preview. */}
      {sharing && <FileShareDialog item={sharing} onClose={() => setSharing(null)} />}
    </>
  );

  /** Puts several files kept on this device online (with a plan), one by one. */
  async function putOnline(list: StoredEntry[], onDone?: () => void) {
    setError(null);
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setMoving(`Putting ${i + 1} of ${list.length} online…`);
      try {
        await moves.moveOnline(list[i]);
      } catch (e) {
        failed.push(errorText(e, `"${list[i].name}" couldn't be put online.`));
        if (/room|plan/i.test(failed[failed.length - 1])) break;
      }
    }
    setMoving(null);
    if (failed.length) setError(failed.join(" "));
    onDone?.();
  }

  /** `status`: what's happening while a file is being put online or saved here. */
  return {
    openMenu,
    contextMenu,
    openFile: setOpen,
    deleteMany,
    putOnline,
    error: error ?? openIn.error,
    status: moving ?? (openIn.busy ? `Opening “${openIn.busy}” in the Tuner…` : null),
    clearError: () => setError(null),
    dialogs,
  };
}

// ---------------------------------------------------------------- picking files already uploaded

/** Pick files you've already uploaded to attach to a tune. Ones on this tune aren't offered; ones
    on another tune say so (attaching moves them). */
export function FileSelectDialog({
  excludeTuneId,
  tuneName,
  onPick,
  onClose,
}: {
  excludeTuneId: string;
  tuneName: (tuneId: string) => string | undefined;
  onPick: (file: UserFile) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const files = useDeviceUrls(useQuery(filesApi.list, {}));
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (files ?? []).filter((f) => f.tuneId !== excludeTuneId && (!q || f.name.toLowerCase().includes(q)));
  }, [files, excludeTuneId, query]);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-label="Add from your files" className="flex max-h-[75vh] w-full max-w-lg flex-col gap-3 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40 sm:h-9">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your files" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm" />
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {files === undefined ? (
            <div className="flex justify-center p-4">
              <LoadingSpinner />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-3 text-sm text-muted">{query ? "No files match." : "No other files to add. Upload one instead."}</p>
          ) : (
            rows.map((f) => {
              const other = f.tuneId ? tuneName(f.tuneId) : null;
              return (
                <FileRow key={f._id} name={f.name} mimeType={f.mimeType} detail={fileDetail(f, other ? `on ${other}` : null)} onOpen={() => onPick(f)} />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- a tune's files

/** A tune page's Files: what's attached (open in place), Upload (or drop files here), and "Add
    from my files". */
export function TuneFiles({ tuneId, tuneName }: { tuneId: string; tuneName: (tuneId: string) => string | undefined }) {
  const { isAuthenticated } = useConvexAuth();
  const files = useDeviceUrls(useQuery(filesApi.listForTune, isAuthenticated ? { tuneId } : "skip"));
  const update = useMutation(filesApi.update);
  const saveTarget = useSaveTarget();
  const uploader = useFileUploader(tuneId, saveTarget);
  const actions = useFileActions({ tuneName, hereTuneId: tuneId });
  const [adding, setAdding] = useState(false);

  return (
    <section
      {...(isAuthenticated ? uploader.drop : {})}
      className={`flex flex-col gap-3 rounded-lg bg-surface p-4 ${uploader.dragging ? "ring-2 ring-accent" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">Files</h2>
        {files && files.length > 0 && <span className="text-xs tabular-nums text-muted">{files.length}</span>}
        {isAuthenticated && (
          <div className="ml-auto flex flex-wrap gap-2">
            <SaveWhere target={saveTarget} />
            <button type="button" onClick={uploader.pick} disabled={!!uploader.progress} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50">
              <UploadIcon className="h-4 w-4" /> Upload
            </button>
            <button type="button" onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
              <LinkIcon className="h-4 w-4" /> From my files
            </button>
          </div>
        )}
      </div>
      {!isAuthenticated ? (
        <p className="text-sm text-muted">Sign in to attach files to this tune — PDFs, lead sheets, images, audio, video.</p>
      ) : files === undefined ? (
        <LoadingSpinner />
      ) : files.length === 0 && !uploader.progress ? (
        <button
          type="button"
          onClick={uploader.pick}
          className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-foreground/15 px-4 py-6 text-center text-sm text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <UploadIcon className="h-5 w-5" />
          <span>
            <span className="pointer-coarse:hidden">Drop files here, or click to upload</span>
            <span className="hidden pointer-coarse:inline">Tap to upload</span> a PDF, image, recording or any other file.
          </span>
        </button>
      ) : (
        <div className="flex flex-col">
          {files.map((f) => (
            <FileRow
              key={f._id}
              name={f.name}
              mimeType={f.mimeType}
              detail={fileDetail(f)}
              onOpen={() => actions.openFile(entryOf(f))}
              onMenu={(e) => actions.openMenu(entryOf(f), e)}
              onContextMenu={(e) => actions.contextMenu(entryOf(f), e)}
            />
          ))}
        </div>
      )}
      <UploadProgress progress={uploader.progress} />
      {uploader.error && <p className="text-sm text-danger">{uploader.error}</p>}
      {actions.error && <p className="text-sm text-danger">{actions.error}</p>}
      {isAuthenticated && files && files.length > 0 && <KeptHereHint />}
      {uploader.input}
      {actions.dialogs}
      {adding && (
        <FileSelectDialog
          excludeTuneId={tuneId}
          tuneName={tuneName}
          onPick={(f) => {
            setAdding(false);
            void update({ id: f._id, tuneId });
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}
