"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import SaveWhere from "@/components/files/SaveWhere";
import { FileRow, FileTypeIcon, fileDetail, useFileUploader } from "@/components/files/FileParts";
import { CloseIcon, SearchIcon, TrashIcon, UploadIcon, WaveIcon } from "@/components/tools";
import { type StoredEntry, fileKind, filesApi, formatBytes, formatFileDate } from "@/lib/files";
import { useDeviceUrls } from "@/lib/deviceFiles";
import { useSaveTarget } from "@/lib/storagePlan";
import { type DropArea, useFileDrop } from "@/lib/useFileDrop";

/**
 * Opening a file in a tool (the Slow Downer, the Tuner's takes, Rhythm Section's bass players):
 * one dialog listing the account's files the tool can open (its own uploads, recordings and tune
 * songs), newest first, with search and an Upload button for a file from this device; dropping a
 * file anywhere on the tool's page opens it too. With `saveToFiles`, a file opened from this
 * device is also saved to the account's Files (online with a storage plan, on this device without
 * one), once — opening the same file again doesn't save a second copy. Signed out it's this
 * device only (the tool can list what it keeps in the browser with `local`).
 */

/** What a tool can open. */
export type FileFilter = {
  /** For the system file picker. */
  accept: string;
  /** Which stored files to offer. */
  matches: (file: { name: string; mimeType: string }) => boolean;
  /** "an audio or video file", for messages. */
  noun: string;
};

export const AUDIO_OR_VIDEO: FileFilter = {
  accept: "audio/*,video/*",
  matches: (f) => {
    const kind = fileKind(f.mimeType, f.name);
    return kind === "audio" || kind === "video";
  },
  noun: "an audio or video file",
};

export const AUDIO_ONLY: FileFilter = {
  accept: "audio/*",
  matches: (f) => fileKind(f.mimeType, f.name) === "audio",
  noun: "an audio file",
};

/** Files a tool keeps in this browser itself (signed out, or from before files went to Files). */
export type LocalFiles = {
  title: string;
  files: { id: string; name: string; size: number; added: number; type?: string }[];
  open: (id: string) => void;
  /** Asks first; `removeMessage` says what removing does. */
  remove?: (id: string) => void;
  removeMessage?: string;
};

type Options = {
  filter: FileFilter;
  /** Opens the file in the tool. `from`: the stored item it came from, or null for a file from this
      device (the dialog's Upload, or a drop). */
  onFile: (file: File, from: StoredEntry | null) => void;
  /** Also save files from this device to the account's Files (signed in). */
  saveToFiles?: boolean;
  /** "Slow Downer": the drop overlay says "Drop to open in Slow Downer". Leave out for no drop. */
  dropInto?: string;
  title?: string;
  /** What the dialog's button for a file from this device says ("Upload" when it's saved). */
  uploadLabel?: string;
  local?: LocalFiles;
  /** A stored file to open when the tool loads (`<kind>:<id>`, from the page's `?open=` — "Open
      in…" in Files). */
  openStored?: string | null;
};

/** Files this tab has just saved (name and size → when): opening one again before the account's
    list has caught up mustn't save it twice. */
const justSaved = new Map<string, number>();
const JUST_SAVED_MS = 60_000;
const keyOf = (f: { name: string; size: number }) => `${f.name}|${f.size}`;

export function useFilePicker({ filter, onFile, saveToFiles = false, dropInto, title = "Open a file", uploadLabel, local, openStored }: Options) {
  const { isAuthenticated } = useConvexAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  // The note fades out rather than unmounting, so whatever sits under it doesn't jump up.
  const [noteFaded, setNoteFaded] = useState(false);
  const saveTarget = useSaveTarget();
  const uploader = useFileUploader(undefined, saveTarget);
  // The account's own files, to see whether one is already there.
  const myFiles = useQuery(filesApi.list, isAuthenticated && saveToFiles ? {} : "skip");
  const inputRef = useRef<HTMLInputElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
  }, []);
  // "Open in…" from Files: the stored file named in `?open=`, opened once the account's list loads.
  const linked = openStored || null;
  const linkedStorage = useQuery(filesApi.storage, linked && isAuthenticated ? {} : "skip");
  const linkedItems = useDeviceUrls(linkedStorage?.items as StoredEntry[] | undefined);
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });
  const linkedDone = useRef(false);
  useEffect(() => {
    if (!linked || linkedDone.current || !linkedItems) return;
    linkedDone.current = true;
    // Take `open` out of the address, so a reload doesn't open it again.
    const url = new URL(window.location.href);
    url.searchParams.delete("open");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const entry = linkedItems.find((i) => `${i.kind}:${i.id}` === linked);
    void (async () => {
      if (!entry || !filter.matches(entry)) return setError("That file isn't in your Files any more.");
      if (!entry.url) return setError(entry.device ? `“${entry.name}” is kept on ${entry.device.label}. Open it there.` : `Couldn't open “${entry.name}”.`);
      try {
        const res = await fetch(entry.url);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        onFileRef.current(new File([blob], entry.name, { type: entry.mimeType || blob.type }), entry);
      } catch {
        setError(`Couldn't open “${entry.name}”. Check your connection and try again.`);
      }
    })();
  }, [linked, linkedItems, filter]);

  /** Saves a file from this device to Files unless it's there already. Resolves whether it's in
      Files now. */
  async function save(file: File): Promise<boolean> {
    if (!isAuthenticated || !saveToFiles) return false;
    const key = keyOf(file);
    if (Date.now() - (justSaved.get(key) ?? 0) < JUST_SAVED_MS || myFiles?.some((f) => keyOf(f) === key)) return true;
    justSaved.set(key, Date.now());
    const online = saveTarget.online;
    const ok = await uploader.uploadAll([file]);
    if (!ok) {
      justSaved.delete(key);
      return false;
    }
    setSavedNote(online ? "Saved to your Files" : "Saved to your Files, on this device");
    setNoteFaded(false);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNoteFaded(true), 4000);
    return true;
  }

  /** A file from this device: open it, and save it to Files. */
  function fromDevice(files: File[]) {
    const file = files.find((f) => filter.matches({ name: f.name, mimeType: f.type }));
    if (!file) {
      setError(`That isn't ${filter.noun}.`);
      return;
    }
    setError(null);
    uploader.clearError();
    setOpen(false);
    onFile(file, null);
    void save(file);
  }

  const { setAnchor, area: dropArea, dropId } = useFileDrop(fromDevice, !!dropInto);

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={filter.accept}
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length) fromDevice(files);
      }}
    />
  );

  const elements = (
    <>
      {/* Marks where the tool is on the page (which pane, in split screen). */}
      <span ref={setAnchor} hidden />
      {input}
      {open && (
        <FilePickerDialog
          title={title}
          filter={filter}
          dropId={dropId}
          signedIn={isAuthenticated}
          saveTarget={saveToFiles ? saveTarget : null}
          uploadLabel={uploadLabel ?? (saveToFiles && isAuthenticated ? "Upload" : "From this device")}
          canDrop={!!dropInto}
          local={local}
          onUpload={() => inputRef.current?.click()}
          onPick={(file, entry) => {
            setOpen(false);
            setError(null);
            onFile(file, entry);
          }}
          onLocal={(id) => {
            setOpen(false);
            setError(null);
            local?.open(id);
          }}
          onClose={() => setOpen(false)}
        />
      )}
      {dropArea && dropInto && <DropOverlay area={dropArea} label={`Drop to open in ${dropInto}`} />}
    </>
  );

  /** What happened to the last file from this device: saving, saved, or why not. */
  const status = uploader.progress ? (
    <div className="flex items-center gap-2 text-xs text-muted">
      <LoadingSpinner size="sm" inline label="Saving" /> Saving to your Files…
    </div>
  ) : error || uploader.error ? (
    <p className="text-xs text-danger">{error ?? `Not saved to your Files: ${uploader.error}`}</p>
  ) : savedNote ? (
    <p role="status" aria-hidden={noteFaded} className={`text-xs text-muted transition-opacity duration-500 ${noteFaded ? "opacity-0" : ""}`}>
      {savedNote}
    </p>
  ) : null;

  return { open: () => setOpen(true), elements, status, signedIn: isAuthenticated, save };
}

// ---------------------------------------------------------------- the dialog

function FilePickerDialog({
  title,
  filter,
  dropId,
  signedIn,
  saveTarget,
  uploadLabel,
  canDrop,
  local,
  onUpload,
  onPick,
  onLocal,
  onClose,
}: {
  title: string;
  filter: FileFilter;
  dropId: string;
  signedIn: boolean;
  saveTarget: ReturnType<typeof useSaveTarget> | null;
  uploadLabel: string;
  canDrop: boolean;
  local?: LocalFiles;
  onUpload: () => void;
  onPick: (file: File, entry: StoredEntry) => void;
  onLocal: (id: string) => void;
  onClose: () => void;
}) {
  const storage = useQuery(filesApi.storage, signedIn ? {} : "skip");
  const items = useDeviceUrls(storage?.items as StoredEntry[] | undefined);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<LocalFiles["files"][number] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !removing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, removing]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (items ?? []).filter(
        (i) => (i.kind === "file" || i.kind === "recording" || i.kind === "song") && filter.matches(i) && (!q || i.name.toLowerCase().includes(q)),
      ),
    [items, filter, q],
  );
  // The tool's own browser-kept files, leaving out ones already in Files.
  const inFiles = useMemo(() => new Set((items ?? []).map((i) => keyOf(i))), [items]);
  const localRows = (local?.files ?? []).filter((f) => !inFiles.has(keyOf(f)) && (!q || f.name.toLowerCase().includes(q)));

  async function pick(entry: StoredEntry) {
    if (!entry.url) return;
    const id = `${entry.kind}:${entry.id}`;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(entry.url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      onPick(new File([blob], entry.name, { type: entry.mimeType || blob.type }), entry);
    } catch {
      setError(`Couldn't open "${entry.name}". Check your connection and try again.`);
    } finally {
      setBusy(null);
    }
  }

  const hasAny = rows.length > 0 || localRows.length > 0;
  // Search only helps once there's something to search.
  const anyToSearch =
    (items ?? []).some((i) => (i.kind === "file" || i.kind === "recording" || i.kind === "song") && filter.matches(i)) ||
    (local?.files ?? []).some((f) => !inFiles.has(keyOf(f)));

  return createPortal(
    <div data-file-drop={dropId} className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-start sm:p-4 sm:pt-[10vh]" onClick={onClose}>
      {/* On phones, the same floating sheet as the option chips' (inset, rounded, padding). */}
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[80dvh] w-full max-w-lg flex-col gap-3 rounded-3xl bg-surface px-5 pb-5 pt-4 text-foreground shadow-xl ring-1 ring-foreground/[0.06] sm:max-h-[75vh] sm:rounded-xl sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            <UploadIcon className="h-4 w-4" />
            {uploadLabel}
          </button>
          {saveTarget && signedIn && <SaveWhere target={saveTarget} />}
          {canDrop && <span className="text-xs text-muted [@media(pointer:coarse)]:hidden">or drop {filter.noun} anywhere</span>}
        </div>

        {anyToSearch && (
          <div className="flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40 sm:h-9">
            <SearchIcon className="h-4 w-4 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={signedIn ? "Search your files" : "Search"}
              aria-label="Search your files"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
            />
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1">
          {signedIn && items === undefined ? (
            <div className="flex justify-center p-4">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {rows.map((entry) => {
                const id = `${entry.kind}:${entry.id}`;
                const where = entry.kind === "recording" ? "Recording" : entry.kind === "song" ? "Tune song" : null;
                if (!entry.url) {
                  // Kept on another device: listed, but it can't be opened here. A tap says so (a
                  // phone has no hover title).
                  const where = entry.device?.label ?? "another device";
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setError(`“${entry.name}” is kept on ${where}. Open it there.`)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-md px-2.5 py-2 text-left opacity-60"
                      title={`Kept on ${where}`}
                    >
                      <FileTypeIcon kind={fileKind(entry.mimeType, entry.name)} recording={entry.kind === "recording"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{entry.name}</span>
                        <span className="block truncate text-xs text-muted">{entry.device ? `On ${entry.device.label} · open it there` : "Not available"}</span>
                      </span>
                    </button>
                  );
                }
                return (
                  <FileRow
                    key={id}
                    name={entry.name}
                    mimeType={entry.mimeType}
                    recording={entry.kind === "recording"}
                    detail={fileDetail(entry, where)}
                    onOpen={() => void pick(entry)}
                    trailing={busy === id ? <LoadingSpinner size="sm" inline label="Opening" /> : null}
                  />
                );
              })}
              {localRows.length > 0 && (
                <>
                  {signedIn && <h3 className="px-2.5 pb-1 pt-3 text-xs font-semibold text-muted">{local!.title}</h3>}
                  {localRows.map((f) => (
                    <FileRow
                      key={`local:${f.id}`}
                      name={f.name}
                      mimeType={f.type ?? ""}
                      detail={[formatBytes(f.size), formatFileDate(f.added), signedIn ? null : "In this browser"].filter(Boolean).join(" · ")}
                      onOpen={() => onLocal(f.id)}
                      trailing={
                        local!.remove ? (
                          <button
                            type="button"
                            onClick={() => setRemoving(f)}
                            aria-label={`Remove ${f.name}`}
                            title="Remove from this browser"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-danger"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        ) : null
                      }
                    />
                  ))}
                </>
              )}
              {!hasAny && (
                <p className="p-3 text-sm text-muted">
                  {q ? "No files match." : signedIn ? `None of your files is ${filter.noun} yet.${saveTarget ? " Upload one, and it's kept in your Files." : ""}` : null}
                </p>
              )}
            </>
          )}
        </div>

        {!signedIn && (
          <p className="text-xs text-muted">{saveTarget ? "Sign in to keep the files you open in your Files." : "Signed in, your Files are listed here too."}</p>
        )}
      </div>

      {removing && local?.remove && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title={`Remove "${removing.name}"?`}
            message={local.removeMessage ?? "It's removed from this browser."}
            confirmLabel="Remove"
            onConfirm={() => {
              local.remove?.(removing.id);
              setRemoving(null);
            }}
            onCancel={() => setRemoving(null)}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- the drop overlay

function DropOverlay({ area, label }: { area: DropArea; label: string }) {
  const style = area === "window" ? { inset: 0 } : { top: area.top, left: area.left, width: area.width, height: area.height };
  return createPortal(
    <div style={style} className="pointer-events-none fixed z-[90] flex items-center justify-center bg-overlay p-4" aria-hidden>
      <div className="flex items-center gap-3 rounded-2xl bg-surface px-6 py-5 text-base font-semibold text-foreground shadow-xl ring-2 ring-accent">
        <UploadIcon className="h-6 w-6 text-accent" />
        {label}
      </div>
    </div>,
    document.body,
  );
}

/** A button-shaped summary of the open file that opens the picker ("Change"). */
export function OpenFileButton({ name, mimeType, onClick, children }: { name: string; mimeType: string; onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Open another file"
      className="inline-flex h-10 w-full max-w-md items-center gap-2 rounded-md bg-foreground/[0.05] pl-1 pr-3 text-left text-sm transition-colors hover:bg-surface-hover"
    >
      {/* An opened audio file shows a wave, not the microphone the file lists use for audio. */}
      {fileKind(mimeType, name) === "audio" ? (
        <span className="flex h-8 w-5 shrink-0 items-center justify-center text-muted" aria-hidden>
          <WaveIcon className="h-4 w-4" />
        </span>
      ) : (
        <FileTypeIcon kind={fileKind(mimeType, name)} />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {children ?? <span className="shrink-0 text-xs font-medium text-muted">Change</span>}
    </button>
  );
}
