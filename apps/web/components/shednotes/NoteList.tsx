"use client";

import { useQuery } from "convex/react";
import { useDeferredValue, useMemo, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { ChevronRightIcon, DocumentIcon, DotsVerticalIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, NotePlusIcon, PlusIcon, SearchIcon, UsersIcon } from "@/components/tools";
import type { NoteMeta } from "@/lib/useShedNotes";

type Folder = { name: string; path: string; folders: Folder[]; notes: NoteMeta[] };

/** The folder tree: folders made on their own (they can be empty) and the ones notes are in. */
function buildTree(notes: NoteMeta[], folderPaths: string[]): Folder {
  const root: Folder = { name: "", path: "", folders: [], notes: [] };
  const folderAt = (path: string): Folder => {
    let at = root;
    for (const part of path.split("/").filter(Boolean)) {
      const next = at.path ? `${at.path}/${part}` : part;
      let child = at.folders.find((f) => f.name === part);
      if (!child) {
        child = { name: part, path: next, folders: [], notes: [] };
        at.folders.push(child);
      }
      at = child;
    }
    return at;
  };
  for (const p of folderPaths) folderAt(p);
  for (const n of notes) folderAt(n.folder).notes.push(n);
  const sort = (f: Folder) => {
    f.folders.sort((a, b) => a.name.localeCompare(b.name));
    f.notes.sort((a, b) => a.title.localeCompare(b.title));
    f.folders.forEach(sort);
  };
  sort(root);
  return root;
}

const count = (f: Folder): number => f.notes.length + f.folders.reduce((s, c) => s + count(c), 0);

export type NoteListActions = {
  open: (id: string) => void;
  newNote: (folder: string) => void;
  newFolder: (parent: string) => void;
  rename: (note: NoteMeta) => void;
  move: (note: NoteMeta) => void;
  remove: (note: NoteMeta) => void;
  share: (note: NoteMeta) => void;
  /** Takes a note someone shared with you out of your list. */
  leave: (id: string) => void;
  renameFolder: (path: string) => void;
  moveFolderPrompt: (path: string) => void;
  deleteFolder: (path: string) => void;
  /** The templates page. */
  openTemplates: () => void;
  /** Pick a template and make a note from it. */
  newFromTemplate: () => void;
  /** Drag and drop: a note into a folder ("" = the top level). */
  moveNoteTo: (id: string, folder: string) => void;
  /** Drag and drop: a folder into another ("" = the top level). */
  moveFolderTo: (path: string, parent: string) => void;
};

/** `via`: shared because a note shared with you links to it (that note's title). */
export type SharedNote = { id: string; title: string; owner: string | null; ownerName: string; ownerId: string; role: "read" | "write"; updatedAt: number; via: string | null };

type Dragging = { kind: "note"; id: string; folder: string } | { kind: "folder"; path: string };

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** The notes, as folders (A–Z) or most recently edited first, with a search box that matches
    titles, folders and #tags right away and the notes' text from the server. Notes and folders
    can be dragged into folders (or to the top level, below the list). */
export default function NoteList({
  notes,
  folders,
  shared = [],
  templateCount = 0,
  templatesOpen = false,
  currentId,
  actions,
  initialQuery = "",
}: {
  notes: NoteMeta[];
  folders: string[];
  shared?: SharedNote[];
  templateCount?: number;
  templatesOpen?: boolean;
  currentId: string | null;
  actions: NoteListActions;
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [sort, setSort] = useState<"folders" | "recent">("folders");
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [sharedOpen, setSharedOpen] = useState(true);
  const query = q.trim().toLowerCase();
  const deferred = useDeferredValue(query);
  const textHits = useQuery(api.shedNotes.search, deferred.length >= 2 && !deferred.startsWith("#") ? { q: deferred } : "skip");

  const tree = useMemo(() => buildTree(notes, folders), [notes, folders]);
  const recent = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes]);
  const titleHits = useMemo(() => {
    if (!query) return [];
    if (query.startsWith("#")) {
      const tag = query.slice(1);
      return notes.filter((n) => n.tags.some((t) => t === tag || t.startsWith(`${tag}/`)));
    }
    return notes.filter((n) => n.title.toLowerCase().includes(query) || n.folder.toLowerCase().includes(query));
  }, [notes, query]);
  const titleIds = new Set(titleHits.map((n) => n.id));
  const bodyHits = (textHits ?? []).filter((h) => !titleIds.has(h.id));

  // ---- drag and drop
  /** Whether what's being dragged can go into `folder`. */
  const canDrop = (folder: string) => {
    if (!dragging) return false;
    if (dragging.kind === "note") return dragging.folder !== folder;
    return folder !== parentOf(dragging.path) && folder !== dragging.path && !folder.startsWith(`${dragging.path}/`);
  };
  const dropOn = (folder: string) => {
    if (!dragging || !canDrop(folder)) return;
    if (dragging.kind === "note") actions.moveNoteTo(dragging.id, folder);
    else actions.moveFolderTo(dragging.path, folder);
    setDragging(null);
    setOver(null);
  };
  const dropProps = (folder: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canDrop(folder)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (over !== folder) setOver(folder);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null) && over === folder) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropOn(folder);
    },
  });
  const dragProps = (d: Dragging) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", d.kind === "note" ? d.id : d.path);
      setDragging(d);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });

  function noteMenu(e: React.MouseEvent, n: NoteMeta) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Open", onSelect: () => actions.open(n.id) },
        { label: "Rename", onSelect: () => actions.rename(n) },
        { label: "Move to folder", onSelect: () => actions.move(n) },
        { label: "Share", onSelect: () => actions.share(n) },
        { label: "Delete", danger: true, onSelect: () => actions.remove(n) },
      ],
    });
  }
  function folderMenu(e: React.MouseEvent, path: string) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "New note here", onSelect: () => actions.newNote(path) },
        { label: "New folder inside", onSelect: () => actions.newFolder(path) },
        { label: "Rename folder", onSelect: () => actions.renameFolder(path) },
        { label: "Move folder", onSelect: () => actions.moveFolderPrompt(path) },
        { label: "Delete folder", danger: true, onSelect: () => actions.deleteFolder(path) },
      ],
    });
  }

  // On touch screens the row buttons and rows grow to finger size (40px buttons, 44px rows).
  const rowBtn =
    "shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-background hover:text-foreground lg:opacity-60 lg:group-hover:opacity-100 pointer-coarse:flex pointer-coarse:h-10 pointer-coarse:w-10 pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:opacity-100";

  const noteRow = (n: NoteMeta, detail?: string, draggable = true) => (
    <li key={n.id}>
      <div
        className={`group flex items-center rounded-md pl-1.5 transition-colors ${n.id === currentId ? "bg-surface-hover text-foreground" : "hover:bg-surface-hover/60"} ${dragging?.kind === "note" && dragging.id === n.id ? "opacity-40" : ""}`}
        onContextMenu={(e) => noteMenu(e, n)}
        {...(draggable ? dragProps({ kind: "note", id: n.id, folder: n.folder }) : {})}
      >
        <button type="button" onClick={() => actions.open(n.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left pointer-coarse:min-h-11">
          <DocumentIcon className={`h-3.5 w-3.5 shrink-0 ${n.id === currentId ? "text-foreground" : "text-muted"}`} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm ${n.id === currentId ? "font-medium" : "text-foreground/80"}`}>{n.title}</span>
            {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
          </span>
        </button>
        <button type="button" onClick={(e) => noteMenu(e, n)} aria-label={`Options for ${n.title}`} className={`${rowBtn} mr-1 lg:opacity-0`}>
          <DotsVerticalIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );

  const folderRows = (f: Folder): React.ReactNode[] =>
    f.folders.map((c) => {
      const isClosed = closed.has(c.path);
      const target = over === c.path;
      const Icon = isClosed ? FolderIcon : FolderOpenIcon;
      return (
        <li key={`folder:${c.path}`}>
          <div
            className={`group flex items-center rounded-md transition-colors ${target ? "bg-accent/10 ring-1 ring-inset ring-accent/60" : "hover:bg-surface-hover/60"} ${dragging?.kind === "folder" && dragging.path === c.path ? "opacity-40" : ""}`}
            onContextMenu={(e) => folderMenu(e, c.path)}
            {...dragProps({ kind: "folder", path: c.path })}
            {...dropProps(c.path)}
          >
            <button
              type="button"
              aria-expanded={!isClosed}
              onClick={() =>
                setClosed((s) => {
                  const next = new Set(s);
                  if (next.has(c.path)) next.delete(c.path);
                  else next.add(c.path);
                  return next;
                })
              }
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-0.5 text-left pointer-coarse:min-h-11"
            >
              <ChevronRightIcon className={`h-3 w-3 shrink-0 text-muted transition-transform ${isClosed ? "" : "rotate-90"}`} />
              <Icon className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 truncate text-sm font-medium">{c.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{count(c)}</span>
            </button>
            <button type="button" onClick={() => actions.newNote(c.path)} aria-label={`New note in ${c.name}`} title="New note here" className={rowBtn}>
              <NotePlusIcon className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => actions.newFolder(c.path)} aria-label={`New folder in ${c.name}`} title="New folder inside" className={rowBtn}>
              <FolderPlusIcon className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={(e) => folderMenu(e, c.path)} aria-label={`Options for folder ${c.name}`} className={`${rowBtn} mr-1`}>
              <DotsVerticalIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {!isClosed && (c.folders.length > 0 || c.notes.length > 0) && (
            // Indented, with a guide line down the left so it's clear what's inside.
            <ul className="ml-[0.95rem] border-l border-foreground/10 pl-1.5">{[...folderRows(c), ...c.notes.map((n) => noteRow(n))]}</ul>
          )}
          {!isClosed && c.folders.length === 0 && c.notes.length === 0 && <p className="ml-[1.7rem] py-1 text-xs text-muted">Empty</p>}
        </li>
      );
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 transition-colors focus-within:ring-2 focus-within:ring-accent/40">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes or #tags" aria-label="Search notes" className="min-w-0 flex-1 bg-transparent text-base outline-none lg:text-sm" />
        </label>
        <button
          type="button"
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({
              x: r.right - 208,
              y: r.bottom + 4,
              items: [
                { label: "New note", icon: <PlusIcon className="h-4 w-4" />, onSelect: () => actions.newNote("") },
                ...(templateCount > 0 ? [{ label: "From a template…", icon: <NotePlusIcon className="h-4 w-4" />, onSelect: actions.newFromTemplate }] : []),
                { label: "New folder", icon: <FolderPlusIcon className="h-4 w-4" />, onSelect: () => actions.newFolder("") },
              ],
            });
          }}
          className="flex h-9 shrink-0 items-center gap-1 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
          <PlusIcon className="h-4 w-4" /> New
        </button>
      </div>
      {!query && (
        <div className="flex items-center gap-1 border-b border-foreground/10 text-sm">
          {/* The same underline tabs as the Library's. */}
          {(["folders", "recent"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSort(s)} aria-pressed={sort === s} className={`-mb-px flex h-10 items-center border-b-2 px-2 transition-colors ${sort === s ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
              {s === "folders" ? "Folders" : "Recent"}
            </button>
          ))}
        </div>
      )}
      <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto border-b border-foreground/10 px-1 pb-2" {...(!query && sort === "folders" ? dropProps("") : {})}>
        {query ? (
          <>
            {titleHits.map((n) => noteRow(n, n.folder || undefined, false))}
            {bodyHits.length > 0 && <li className="px-2 pb-1 pt-3 text-xs font-medium text-muted">In the text</li>}
            {bodyHits.map((h) => {
              const meta = notes.find((n) => n.id === h.id);
              return meta ? noteRow(meta, h.snippet, false) : null;
            })}
            {titleHits.length === 0 && bodyHits.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">{textHits === undefined && deferred.length >= 2 && !deferred.startsWith("#") ? "Searching…" : "No notes match."}</li>}
          </>
        ) : sort === "recent" ? (
          recent.map((n) => noteRow(n, n.folder || undefined, false))
        ) : (
          <>
            {folderRows(tree)}
            {tree.notes.map((n) => noteRow(n))}
            {/* Where a drag goes to put something at the top level. */}
            {dragging && (
              <li className={`mt-2 rounded-md border border-dashed px-3 py-3 text-center text-xs font-medium transition-colors ${over === "" ? "border-accent bg-accent/10 text-foreground" : "border-foreground/15 text-muted"}`}>
                {canDrop("") ? "Drop here for the top level" : "Drop on a folder"}
              </li>
            )}
          </>
        )}
        {!query && shared.length > 0 && (
          <li className="mt-3 border-t border-foreground/10 pt-2">
            <button type="button" aria-expanded={sharedOpen} onClick={() => setSharedOpen((o) => !o)} className="flex w-full items-center gap-1.5 rounded-md py-1.5 pl-0.5 text-left text-xs font-medium text-muted transition-colors hover:text-foreground">
              <ChevronRightIcon className={`h-3 w-3 shrink-0 transition-transform ${sharedOpen ? "rotate-90" : ""}`} />
              <UsersIcon className="h-3.5 w-3.5 shrink-0" /> Shared with me
              <span className="tabular-nums">{shared.length}</span>
            </button>
            {sharedOpen && (
              <ul>
                {shared.map((n) => (
                  <li key={`shared:${n.id}`}>
                    <div className={`group flex items-center rounded-md pl-1.5 transition-colors ${n.id === currentId ? "bg-surface-hover" : "hover:bg-surface-hover/60"}`}>
                      <button type="button" onClick={() => actions.open(n.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left pointer-coarse:min-h-11">
                        <DocumentIcon className={`h-3.5 w-3.5 shrink-0 ${n.id === currentId ? "text-foreground" : "text-muted"}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm ${n.id === currentId ? "font-medium" : "text-foreground/80"}`}>{n.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {n.owner ? `@${n.owner}` : n.ownerName} · {n.role === "write" ? "can edit" : "can view"}
                            {n.via && ` · linked from ${n.via}`}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenu({ x: e.clientX, y: e.clientY, items: [
                              { label: "Open", onSelect: () => actions.open(n.id) },
                              // A linked note comes and goes with the note that links to it.
                              ...(n.via ? [] : [{ label: "Remove from my list", danger: true, onSelect: () => actions.leave(n.id) }]),
                            ],
                          });
                        }}
                        aria-label={`Options for ${n.title}`}
                        className={`${rowBtn} mr-1 lg:opacity-0`}
                      >
                        <DotsVerticalIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
        {!query && notes.length === 0 && folders.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">No notes yet. Make one with New.</li>}
      </ul>
      <button
        type="button"
        onClick={actions.openTemplates}
        className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${templatesOpen ? "bg-surface-hover font-medium text-foreground" : "text-foreground/75 hover:bg-surface-hover/60 hover:text-foreground"}`}
      >
        <DocumentIcon className={`h-4 w-4 shrink-0 ${templatesOpen ? "text-foreground" : "text-muted"}`} />
        <span className="flex-1">Templates</span>
        <span className="text-xs tabular-nums text-muted">{templateCount}</span>
      </button>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
