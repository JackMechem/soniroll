"use client";

import { api } from "@jam-practice/convex/_generated/api";
import { useMutation } from "convex/react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MenuItem } from "@/components/ContextMenu";
import PromptDialog from "@/components/PromptDialog";
import { ManageTagsDialog, TagPill, TagsDialog } from "@/components/library/TagEditor";
import { ChevronRightIcon, CloseIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, PencilIcon, TagIcon, TrashIcon } from "@/components/tools";
import { type StoredEntry, errorText } from "@/lib/files";
import { deleteOnDevice } from "@/lib/deviceFiles";
import { showNotice } from "@/lib/notice";
import { cleanFolder, countFileTags, folderName, folderParent, isInFolder } from "@jam-practice/core/fileFolders";

/**
 * Folders and tags on the Files page (`packages/convex/fileFolders.ts`): the ⋮ menu items ("Move to
 * folder…", "Tags…"), the folder picker, new / rename / move / delete folder, tags on one file or
 * several, renaming or deleting a tag everywhere, and drag and drop (files and folders onto a
 * folder or a breadcrumb). `useFileOrganizer` holds it all; render its `dialogs`.
 */

const ITEMS_DRAG = "application/x-soniroll-files";
const FOLDER_DRAG = "application/x-soniroll-folder";

const keyOf = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;
const ref = (item: StoredEntry) => ({ kind: item.kind, id: item.id });

/** "Files" for the top level, else the folder's own name. */
export const folderLabel = (path: string) => (path ? folderName(path) : "Files");

export type FileOrganizer = ReturnType<typeof useFileOrganizer>;

/**
 * Everything for organising files. `items`: every stored item with its folder and tags (the
 * Files page's list, so dialogs always show the latest); `folders`: every folder (`files.storage`).
 * `onFolderMoved(from, to)` is told when a folder is renamed or moved (`to` its new path) or deleted
 * (`to` null), so the page can follow it.
 */
export function useFileOrganizer({ items, folders, onFolderMoved }: { items: StoredEntry[]; folders: string[]; onFolderMoved?: (from: string, to: string | null) => void }) {
  const moveItems = useMutation(api.fileFolders.moveItems);
  const setTags = useMutation(api.fileFolders.setTags);
  const tagItems = useMutation(api.fileFolders.tagItems);
  const renameTag = useMutation(api.fileFolders.renameTag);
  const deleteTag = useMutation(api.fileFolders.deleteTag);
  const createFolder = useMutation(api.fileFolders.createFolder);
  const renameFolder = useMutation(api.fileFolders.renameFolder);
  const deleteFolder = useMutation(api.fileFolders.deleteFolder);
  const removeItem = useMutation(api.files.removeItem);

  const [moving, setMoving] = useState<{ items: StoredEntry[]; onDone?: () => void } | { folder: string } | null>(null);
  const [tagging, setTagging] = useState<StoredEntry | null>(null);
  const [tagMany, setTagMany] = useState<{ items: StoredEntry[]; onDone?: () => void } | null>(null);
  const [naming, setNaming] = useState<{ parent: string; then?: (path: string) => void } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // What's being dragged (dataTransfer can't be read until the drop).
  const dragged = useRef<{ items?: StoredEntry[]; folder?: string } | null>(null);

  const byKey = useMemo(() => new Map(items.map((i) => [keyOf(i), i])), [items]);
  const fresh = (item: StoredEntry) => byKey.get(keyOf(item)) ?? item;
  const tags = useMemo(() => countFileTags(items.map((i) => i.tags)), [items]);
  const knownTags = useMemo(() => tags.map((t) => t.tag), [tags]);

  async function run(what: Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await what;
      return true;
    } catch (e) {
      setError(errorText(e, fallback));
      return false;
    }
  }

  /** Moves items into a folder (skipping ones already there). */
  async function moveTo(list: StoredEntry[], folder: string) {
    const todo = list.filter((i) => (fresh(i).folder ?? "") !== folder);
    if (!todo.length) return;
    if (await run(moveItems({ items: todo.map(ref), folder }), "Couldn't move them.")) {
      const what = todo.length === 1 ? `“${todo[0].name}”` : `${todo.length} files`;
      showNotice(`Moved ${what} to “${folderLabel(folder)}”`);
    }
  }

  /** Renames or moves a folder to `to` (a full path). */
  async function moveFolderTo(from: string, to: string) {
    const clean = cleanFolder(to);
    if (!clean || clean === from) return;
    if (clean.startsWith(`${from}/`)) return setError("A folder can't go inside itself.");
    if (await run(renameFolder({ from, to: clean }), "Couldn't move the folder.")) {
      onFolderMoved?.(from, clean);
      if (folderParent(clean) !== folderParent(from)) showNotice(`Moved “${folderName(clean)}” to “${folderLabel(folderParent(clean))}”`);
    }
  }

  /** A sibling with the same name (ignoring case) is the same folder. */
  function pathFor(parent: string, name: string) {
    const path = cleanFolder(`${parent}/${name}`);
    return folders.find((f) => f.toLowerCase() === path.toLowerCase()) ?? path;
  }

  async function makeFolder(parent: string, name: string) {
    const path = pathFor(parent, name);
    if (!path) return null;
    try {
      return await createFolder({ path });
    } catch (e) {
      setError(errorText(e, "Couldn't make the folder."));
      return null;
    }
  }

  const contents = (path: string) => items.filter((i) => isInFolder(i.folder ?? "", path, true));

  async function removeFolder(path: string, withFiles: boolean) {
    setDeleting(null);
    setError(null);
    if (withFiles) {
      const list = contents(path);
      const failed: string[] = [];
      for (let n = 0; n < list.length; n++) {
        setStatus(`Deleting ${n + 1} of ${list.length}…`);
        try {
          await removeItem({ kind: list[n].kind, id: list[n].id });
          if (list[n].device) await deleteOnDevice(list[n].device!.key);
        } catch {
          failed.push(list[n].name);
        }
      }
      setStatus(null);
      if (failed.length) setError(`Couldn't delete ${failed.map((f) => `"${f}"`).join(", ")}; they've moved up a level.`);
    }
    if (await run(deleteFolder({ path }), "Couldn't delete the folder.")) onFolderMoved?.(path, null);
  }

  /** "Move to folder…" and "Tags…" for an item's ⋮ menu. */
  function menuItems(item: StoredEntry): MenuItem[] {
    const now = fresh(item);
    return [
      { label: "Move to folder…", onSelect: () => setMoving({ items: [now] }), icon: <FolderIcon className="h-4 w-4" />, divider: true },
      { label: "Tags…", onSelect: () => setTagging(now), icon: <TagIcon className="h-4 w-4" /> },
    ];
  }

  /** A folder's ⋮ menu (`open` opens it). */
  function folderMenu(path: string, open: () => void): MenuItem[] {
    return [
      { label: "Open", onSelect: open, icon: <FolderOpenIcon className="h-4 w-4" /> },
      { label: "Rename", onSelect: () => setRenaming(path), icon: <PencilIcon className="h-4 w-4" /> },
      { label: "Move to…", onSelect: () => setMoving({ folder: path }), icon: <FolderIcon className="h-4 w-4" /> },
      { label: "New folder inside", onSelect: () => setNaming({ parent: path }), icon: <FolderPlusIcon className="h-4 w-4" /> },
      { label: "Delete", onSelect: () => setDeleting(path), danger: true, divider: true, icon: <TrashIcon className="h-4 w-4" /> },
    ];
  }

  /** The folder and tags in the file viewer's footer, each opening its dialog. */
  function previewBar(item: StoredEntry): ReactNode {
    const now = fresh(item);
    return (
      <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setMoving({ items: [now] })} className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium hover:bg-surface-hover" title="Move to folder">
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="truncate">{now.folder ? now.folder.replaceAll("/", " / ") : "Files"}</span>
        </button>
        {(now.tags ?? []).map((t) => (
          <TagPill key={t} tag={t} />
        ))}
        <button type="button" onClick={() => setTagging(now)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground">
          <TagIcon className="h-3.5 w-3.5" /> {now.tags?.length ? "Edit tags" : "Add tags"}
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------ drag and drop (desktop)

  /** Makes a file row draggable; dragging a ticked row drags everything ticked. */
  function dragItem(item: StoredEntry, picked: StoredEntry[]) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        const list = picked.some((p) => keyOf(p) === keyOf(item)) ? picked : [item];
        dragged.current = { items: list };
        e.dataTransfer.setData(ITEMS_DRAG, JSON.stringify(list.map(keyOf)));
        e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        dragged.current = null;
        setOver(null);
      },
    };
  }

  /** Makes a folder row draggable (onto another folder moves it there). */
  function dragFolder(path: string) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        dragged.current = { folder: path };
        e.dataTransfer.setData(FOLDER_DRAG, path);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        dragged.current = null;
        setOver(null);
      },
    };
  }

  /** Makes a folder (row or breadcrumb) a place to drop files and folders. `over === path` while
      something is dragged over it. */
  function dropOn(path: string) {
    const accepts = (e: React.DragEvent) => {
      const types = e.dataTransfer.types;
      if (types.includes(ITEMS_DRAG)) return true;
      if (!types.includes(FOLDER_DRAG)) return false;
      const from = dragged.current?.folder;
      return !!from && from !== path && !path.startsWith(`${from}/`) && folderParent(from) !== path;
    };
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(path);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === path ? null : o));
      },
      onDrop: (e: React.DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(null);
        const what = dragged.current;
        dragged.current = null;
        if (what?.items) void moveTo(what.items, path);
        else if (what?.folder) void moveFolderTo(what.folder, path ? `${path}/${folderName(what.folder)}` : folderName(what.folder));
      },
    };
  }

  // ------------------------------------------------------------ dialogs

  const movingFolder = moving && "folder" in moving ? moving.folder : null;
  const movingItems = moving && "items" in moving ? moving.items : null;
  const deletingCounts = deleting
    ? { files: contents(deleting).length, folders: folders.filter((f) => f.startsWith(`${deleting}/`)).length }
    : null;

  const stacked = (
    <>
      {moving && (
        <FolderPickerDialog
          folders={folders}
          title={
            movingFolder
              ? `Move “${folderName(movingFolder)}” to…`
              : movingItems!.length === 1
                ? `Move “${movingItems![0].name}” to…`
                : `Move ${movingItems!.length} files to…`
          }
          initial={movingFolder ? folderParent(movingFolder) : movingItems!.length === 1 ? (movingItems![0].folder ?? "") : ""}
          blocked={(p) => (movingFolder ? p === movingFolder || p.startsWith(`${movingFolder}/`) : false)}
          onNewFolder={makeFolder}
          onPick={(path) => {
            const was = moving;
            setMoving(null);
            if ("folder" in was) void moveFolderTo(was.folder, path ? `${path}/${folderName(was.folder)}` : folderName(was.folder));
            else void moveTo(was.items, path).then(() => was.onDone?.());
          }}
          onClose={() => setMoving(null)}
        />
      )}
      {tagging && (
        <TagsDialog
          title={`Tags on “${tagging.name}”`}
          tags={tagging.tags ?? []}
          known={knownTags}
          onSave={(next) => {
            const item = tagging;
            setTagging(null);
            void run(setTags({ kind: item.kind, id: item.id, tags: next }), "Couldn't save the tags.");
          }}
          onClose={() => setTagging(null)}
        />
      )}
      {tagMany && (
        <TagsDialog
          title={`Add tags to ${tagMany.items.length} files`}
          tags={[]}
          known={knownTags}
          onSave={(add) => {
            const job = tagMany;
            setTagMany(null);
            if (add.length) void run(tagItems({ items: job.items.map(ref), add }), "Couldn't add the tags.").then(() => job.onDone?.());
          }}
          onClose={() => setTagMany(null)}
        />
      )}
      {naming && (
        <PromptDialog
          title={naming.parent ? `New folder in “${folderName(naming.parent)}”` : "New folder"}
          initialValue=""
          placeholder="e.g. Etudes"
          confirmLabel="Make folder"
          onSubmit={(name) => {
            const job = naming;
            setNaming(null);
            void makeFolder(job.parent, name).then((path) => path && job.then?.(path));
          }}
          onCancel={() => setNaming(null)}
        />
      )}
      {renaming && (
        <PromptDialog
          title="Rename folder"
          initialValue={folderName(renaming)}
          confirmLabel="Rename"
          onSubmit={(name) => {
            const from = renaming;
            setRenaming(null);
            // A "/" in the new name would move it; keep renaming a rename.
            const clean = name.replaceAll("/", "-").trim();
            if (clean) void moveFolderTo(from, folderParent(from) ? `${folderParent(from)}/${clean}` : clean);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
      {deleting && deletingCounts && (
        <DeleteFolderDialog
          path={deleting}
          files={deletingCounts.files}
          folders={deletingCounts.folders}
          onMoveUp={() => void removeFolder(deleting, false)}
          onDeleteAll={() => void removeFolder(deleting, true)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {managing && (
        <ManageTagsDialog
          tags={tags}
          noun={{ one: "file", many: "files" }}
          emptyText="No tags yet. Add one from a file's ⋮ menu."
          onRename={(from, to) => void run(renameTag({ from, to }), "Couldn't rename the tag.")}
          onDelete={(tag) => void run(deleteTag({ tag }), "Couldn't delete the tag.")}
          onClose={() => setManaging(false)}
        />
      )}
    </>
  );
  const anyOpen = !!(moving || tagging || tagMany || naming || renaming || deleting || managing);
  // Above the file viewer and the PDF editor (z-70), which they can be opened from.
  const dialogs = anyOpen && typeof document !== "undefined" ? createPortal(<div className="relative z-[80]">{stacked}</div>, document.body) : null;

  return {
    /** Every tag with how many items have it, A–Z. */
    tags,
    menuItems,
    folderMenu,
    previewBar,
    moveTo,
    /** Ask where to move several items. */
    moveMany: (list: StoredEntry[], onDone?: () => void) => list.length && setMoving({ items: list, onDone }),
    /** Ask which tags to add to several items. */
    tagMany: (list: StoredEntry[], onDone?: () => void) => list.length && setTagMany({ items: list, onDone }),
    /** Ask for a new folder's name, inside `parent`; `then` gets its path. */
    newFolder: (parent: string, then?: (path: string) => void) => setNaming({ parent, then }),
    manageTags: () => setManaging(true),
    dragItem,
    dragFolder,
    dropOn,
    /** The folder something is being dragged over. */
    over,
    error,
    status,
    clearError: () => setError(null),
    dialogs,
  };
}

// ---------------------------------------------------------------- the folder picker

/**
 * Pick a folder: the top level and every folder as a tree, tap one, then "Move here". "New folder"
 * makes one inside the one picked. A bottom sheet on phones. `blocked` greys out folders that can't
 * be picked (a folder can't move into itself).
 */
export function FolderPickerDialog({
  folders,
  title,
  initial,
  confirmLabel = "Move here",
  blocked,
  onNewFolder,
  onPick,
  onClose,
}: {
  folders: string[];
  title: string;
  initial: string;
  confirmLabel?: string;
  blocked?: (path: string) => boolean;
  onNewFolder?: (parent: string, name: string) => Promise<string | null>;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState(initial);
  const [naming, setNaming] = useState(false);
  // Folders made here show straight away (before the page's list catches up).
  const [made, setMade] = useState<string[]>([]);
  useEffect(() => {
    if (naming) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, naming]);
  const all = useMemo(() => {
    const set = new Set([...folders, ...made]);
    return [...set].sort((a, b) => {
      const pa = a.split("/");
      const pb = b.split("/");
      for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
        const c = pa[i].localeCompare(pb[i], undefined, { numeric: true, sensitivity: "base" });
        if (c) return c;
      }
      return pa.length - pb.length;
    });
  }, [folders, made]);
  const rows = [{ path: "", depth: 0 }, ...all.map((path) => ({ path, depth: path.split("/").length }))];

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay sm:items-center sm:p-4" onClick={onClose}>
        <div
          role="dialog"
          aria-label={title}
          className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl bg-surface text-foreground shadow-2xl ring-1 ring-foreground/[0.06] sm:max-w-md sm:rounded-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-5 pb-2 pt-4">
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-foreground">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2" role="listbox" aria-label="Folders">
            {rows.map(({ path, depth }) => {
              const off = blocked?.(path) ?? false;
              const on = picked === path;
              return (
                <li key={path || "(top)"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    disabled={off}
                    onClick={() => setPicked(path)}
                    onDoubleClick={() => !off && onPick(path)}
                    style={{ paddingLeft: `${0.5 + Math.min(depth, 6) * 1}rem` }}
                    className={`flex h-11 w-full items-center gap-2.5 rounded-md pr-2 text-left text-sm sm:h-9 ${
                      on ? "bg-accent/15 font-medium text-accent" : "hover:bg-surface-hover"
                    } disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
                  >
                    {path ? <FolderIcon className={`h-4 w-4 shrink-0 ${on ? "" : "text-muted"}`} /> : <FolderOpenIcon className={`h-4 w-4 shrink-0 ${on ? "" : "text-muted"}`} />}
                    <span className="min-w-0 flex-1 truncate">{path ? folderName(path) : "Files (top level)"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-2 border-t border-foreground/10 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-3">
            {onNewFolder && (
              <button
                type="button"
                onClick={() => setNaming(true)}
                disabled={!!blocked?.(picked)}
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50 sm:h-9"
              >
                <FolderPlusIcon className="h-4 w-4" /> New folder
              </button>
            )}
            <button type="button" onClick={onClose} className="ml-auto h-10 rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground sm:h-9">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onPick(picked)}
              disabled={!!blocked?.(picked)}
              className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50 sm:h-9"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
      {naming && (
        <PromptDialog
          title={picked ? `New folder in “${folderName(picked)}”` : "New folder"}
          initialValue=""
          placeholder="e.g. Etudes"
          confirmLabel="Make folder"
          onSubmit={(name) => {
            setNaming(false);
            void onNewFolder?.(picked, name).then((path) => {
              if (!path) return;
              setMade((m) => [...m, path]);
              setPicked(path);
            });
          }}
          onCancel={() => setNaming(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- deleting a folder

/** Deleting a folder: its files move up a level (the safe, first choice), or go with it. */
function DeleteFolderDialog({
  path,
  files,
  folders,
  onMoveUp,
  onDeleteAll,
  onCancel,
}: {
  path: string;
  files: number;
  folders: number;
  onMoveUp: () => void;
  onDeleteAll: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  const parent = folderParent(path);
  const empty = files === 0 && folders === 0;
  const inside = [files && `${files} file${files === 1 ? "" : "s"}`, folders && `${folders} folder${folders === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
  const btn = "flex min-h-11 w-full items-center justify-center rounded-md px-4 py-2 text-center text-sm font-medium sm:min-h-9";
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay sm:items-center sm:p-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`Delete ${folderName(path)}`}
        className="flex w-full flex-col gap-4 rounded-t-xl bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-foreground shadow-2xl ring-1 ring-foreground/[0.06] sm:max-w-sm sm:rounded-xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold">Delete the folder “{folderName(path)}”?</h2>
          <p className="text-sm text-muted">
            {empty ? "It's empty." : `It has ${inside} in it. Keep them by moving them up to “${folderLabel(parent)}”, or delete them with it.`}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" autoFocus onClick={onMoveUp} className={`${btn} bg-accent text-accent-foreground hover:bg-accent-hover`}>
            {empty ? "Delete folder" : `Delete folder, move what's in it to “${folderLabel(parent)}”`}
          </button>
          {files > 0 && (
            <button type="button" onClick={onDeleteAll} className={`${btn} bg-foreground/[0.05] text-danger hover:bg-surface-hover`}>
              Delete the folder and its {files} file{files === 1 ? "" : "s"} for good
            </button>
          )}
          <button type="button" onClick={onCancel} className={`${btn} text-muted hover:bg-surface-hover hover:text-foreground`}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- breadcrumb

/**
 * Where you are: "Files › Etudes › Wilcoxon". Every crumb but the last opens that folder and takes
 * dropped files. On phones the middle crumbs fold into "…" (the parent stays).
 */
export function FolderCrumbs({ folder, onOpen, org }: { folder: string; onOpen: (path: string) => void; org: FileOrganizer }) {
  const parts = folder ? folder.split("/") : [];
  const crumbs = [{ path: "", label: "Files" }, ...parts.map((p, i) => ({ path: parts.slice(0, i + 1).join("/"), label: p }))];
  const last = crumbs.length - 1;
  return (
    <nav aria-label="Folder" className="flex min-w-0 items-center">
      {crumbs.map((c, i) => {
        // Phones keep the top, the parent and the folder itself.
        const folds = i > 0 && i < last - 1;
        return (
          <Fragment key={c.path || "(top)"}>
          {i === 1 && last > 2 && (
            <span className="flex shrink-0 items-center sm:hidden" aria-hidden>
              <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="px-1 text-sm text-muted">…</span>
            </span>
          )}
          {/* The top never shrinks; a long parent gives way before the folder you're in. */}
          <span className={`items-center ${folds ? "hidden sm:flex" : "flex"} ${i === 0 ? "shrink-0" : i === last ? "min-w-[4rem] shrink" : "min-w-0 shrink-[3]"}`}>
            {i > 0 && <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted" />}
            {i === last ? (
              <h2 className="truncate px-1.5 text-sm font-medium" aria-current="page">
                {c.label}
              </h2>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(c.path)}
                {...org.dropOn(c.path)}
                className={`h-8 min-w-0 truncate rounded-md px-1.5 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground ${org.over === c.path ? "bg-accent/15 text-accent ring-2 ring-accent/40" : ""}`}
              >
                {c.label}
              </button>
            )}
          </span>
          </Fragment>
        );
      })}
    </nav>
  );
}
