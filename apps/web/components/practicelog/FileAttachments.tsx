"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { fileTagKey } from "@jam-practice/core/fileFolders";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import { FileTypeIcon, UploadProgress, fileDetail, useFileUploader } from "@/components/files/FileParts";
import { MenuButton, menuPosition } from "@/components/library/shared";
import { FILL, Quiet } from "@/components/practicelog/pageParts";
import { DocumentIcon, ExternalLinkIcon, FileIcon, FolderIcon, ImageIcon, MicIcon, TagIcon, TrashIcon, UploadIcon, VideoIcon, WaveIcon } from "@/components/tools";
import { type StoredKind, fileKind, filesApi } from "@/lib/files";
import { fileViewHref, filesHref, openFileBeside } from "@/lib/fileView";
import { usePaneId } from "@/lib/paneContext";
import { type Attachment, type FileAttachment, attachmentKey, isFileAttachment } from "@/lib/practiceLog";
import { useSaveTarget } from "@/lib/storagePlan";

/**
 * Files on a Shed Log routine or task (`FileAttachment` in `packages/core/practiceLog.ts`): single
 * files picked from Files, a linked folder (what's in it and under it, as it is now) or a linked tag
 * (every file with it). The routine and task pages list them under Files (`LinkedFiles`); the
 * attach picker's Files tab (`FilesPickerTab`) picks them. Everything opens in the side view, so a
 * PDF stays open while you practice with a tool beside it.
 */

type IconType = (props: { className?: string }) => React.JSX.Element;

/** A file attachment's icon, from what it is. */
export function fileAttachmentIcon(a: FileAttachment): IconType {
  if (a.kind === "folder") return FolderIcon;
  if (a.kind === "fileTag") return TagIcon;
  if (a.itemKind === "recording") return MicIcon;
  const kind = fileKind(a.mimeType ?? "", a.label);
  return kind === "image" ? ImageIcon : kind === "audio" ? WaveIcon : kind === "video" ? VideoIcon : kind === "pdf" || kind === "document" ? DocumentIcon : FileIcon;
}

/** Where a file attachment goes: the file's own page (opened beside), or Files on that folder/tag. */
export function fileAttachmentHref(a: FileAttachment): string {
  if (a.kind === "folder") return filesHref({ folder: a.path });
  if (a.kind === "fileTag") return filesHref({ tag: a.tag });
  return fileViewHref(a.itemKind, a.id);
}

// ---------------------------------------------------------------- the picker's Files tab

type PickRow = { attachment: Attachment; title: string; detail: string; group: string; icon: IconType };

/**
 * The attach picker's Files tab: Upload (the new files are attached), your folders, your tags and
 * your files, filtered by the picker's search. Tap to attach or take off.
 */
export function FilesPickerTab({
  query,
  selected,
  onChange,
  renderRows,
}: {
  query: string;
  selected: Attachment[];
  onChange: (items: Attachment[]) => void;
  renderRows: (rows: PickRow[], empty: string) => React.ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const storage = useQuery(filesApi.storage, isAuthenticated ? {} : "skip");
  const overview = useQuery(api.fileFolders.overview, isAuthenticated ? {} : "skip");
  // Uploads land after the picker's list has moved on: attach to the latest list.
  const latest = useRef(selected);
  const change = useRef(onChange);
  useEffect(() => {
    latest.current = selected;
    change.current = onChange;
  });
  const [onSaved] = useState(() => (file: { id: string; name: string; mimeType: string }) => {
    const a: Attachment = { kind: "file", itemKind: "file", id: file.id, label: file.name, mimeType: file.mimeType };
    if (!latest.current.some((x) => attachmentKey(x) === attachmentKey(a))) {
      latest.current = [...latest.current, a];
      change.current(latest.current);
    }
  });
  const uploader = useFileUploader(undefined, useSaveTarget(), storage?.items, undefined, onSaved);

  const rows = useMemo((): PickRow[] => {
    const q = query.trim().toLowerCase();
    const match = (text: string) => !q || q.split(/\s+/).every((w) => text.toLowerCase().includes(w));
    const folders: PickRow[] = (overview?.folders ?? [])
      .filter((path) => match(path))
      .map((path) => ({ attachment: { kind: "folder", path, label: path.split("/").pop() || path }, title: path, detail: "Folder · everything in it, as it changes", group: "Folders", icon: FolderIcon }));
    const tags: PickRow[] = (overview?.tags ?? [])
      .filter((t) => match(t.tag))
      .map((t) => ({ attachment: { kind: "fileTag", tag: t.tag, label: t.tag }, title: t.tag, detail: `Tag · ${t.count} file${t.count === 1 ? "" : "s"} now`, group: "Tags", icon: TagIcon }));
    const files: PickRow[] = (storage?.items ?? [])
      .filter((f) => f.kind !== "profile" && match(`${f.name} ${f.folder} ${f.tags.join(" ")}`))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 300)
      .map((f) => {
        const attachment: FileAttachment = { kind: "file", itemKind: f.kind, id: f.id, label: f.name, mimeType: f.mimeType };
        return { attachment, title: f.name, detail: fileDetail(f, f.folder || null), group: "Files", icon: fileAttachmentIcon(attachment) };
      });
    return [...folders, ...tags, ...files];
  }, [query, overview, storage]);

  if (!isAuthenticated) return <p className="px-3 py-6 text-center text-sm text-muted">Sign in to attach your files.</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={uploader.pick}
          disabled={!!uploader.progress}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          <UploadIcon className="h-4 w-4" /> Upload and attach
        </button>
        <UploadProgress progress={uploader.progress} />
      </div>
      {uploader.error && <p className="text-sm text-danger">{uploader.error}</p>}
      {uploader.input}
      {storage === undefined || overview === undefined ? <div className={`${FILL} h-24`} aria-hidden /> : renderRows(rows, query ? "Nothing matches." : "No files yet. Upload one here, or add some in Files.")}
    </div>
  );
}

// ---------------------------------------------------------------- the pages' Files section

/** A group of file attachments on a page: the task's own (editable), the ones for just one day, or
    (on a routine's page) each task's. */
export type FileGroup = {
  key: string;
  /** A heading above the group ("Just for today", a task's name); none for the page's own. */
  title?: string;
  /** The heading links here (a task's page, opened beside). */
  href?: string;
  attachments: FileAttachment[];
  /** Taking one off (never deletes the file). Without it the group is read-only here. */
  onChange?: (next: FileAttachment[]) => void;
};

type Linked = NonNullable<ReturnType<typeof useLinkedQuery>>;
type LinkedItem = Linked["items"][number];

function useLinkedQuery(groups: FileGroup[]) {
  const { isAuthenticated } = useConvexAuth();
  const all = groups.flatMap((g) => g.attachments);
  const args = {
    items: all.flatMap((a) => (a.kind === "file" ? [{ kind: a.itemKind as StoredKind, id: a.id }] : [])),
    folders: [...new Set(all.flatMap((a) => (a.kind === "folder" ? [a.path] : [])))],
    tags: [...new Set(all.flatMap((a) => (a.kind === "fileTag" ? [a.tag] : [])))],
  };
  const empty = !args.items.length && !args.folders.length && !args.tags.length;
  return useQuery(api.fileFolders.linked, isAuthenticated && !empty ? args : "skip");
}

/**
 * A routine's or task's Files: the files attached one by one, then each linked folder and tag with
 * what's in it now. Every file opens in the side view (the ⋮ has a split and the whole page too);
 * "Take off" takes it off here and never deletes the file.
 */
export function LinkedFiles({ groups, empty }: { groups: FileGroup[]; empty: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const paneId = usePaneId();
  const linked = useLinkedQuery(groups);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const shown = groups.filter((g) => g.attachments.length > 0);

  if (!isAuthenticated) return <Quiet>Sign in to attach files.</Quiet>;
  if (!shown.length) return <Quiet>{empty}</Quiet>;

  const itemFor = (a: Extract<FileAttachment, { kind: "file" }>) => linked?.items.find((i) => i.kind === a.itemKind && i.id === a.id);
  const isMissing = (a: Extract<FileAttachment, { kind: "file" }>) => !!linked?.missing.some((m) => m.kind === a.itemKind && m.id === a.id);
  const wide = () => window.matchMedia("(min-width: 1024px)").matches;

  const openMenu = (e: React.MouseEvent, item: { kind: StoredKind; id: string; folder?: string }, takeOff?: { label: string; run: () => void }) => {
    const items: MenuItem[] = [
      { label: "Open in the side view", onSelect: () => void openFileBeside(item.kind, item.id, { from: paneId }) },
      ...(wide() ? [{ label: "Open side by side", onSelect: () => void openFileBeside(item.kind, item.id, { mode: "right", from: paneId }) }] : []),
      { label: "Open", onSelect: () => open(item), icon: <ExternalLinkIcon className="h-4 w-4" /> },
      { label: item.folder ? `Show in ${item.folder.split("/").pop()}` : "Show in Files", onSelect: () => router.push(filesHref({ folder: item.folder || undefined })), icon: <FolderIcon className="h-4 w-4" /> },
      ...(takeOff ? [{ label: takeOff.label, onSelect: takeOff.run, danger: true, divider: true, icon: <TrashIcon className="h-4 w-4" /> }] : []),
    ];
    setMenu({ ...menuPosition(e), items, width: 220 });
  };
  // Opens in place (this page or pane; Back returns to the task). The ⋮ menu opens it beside.
  const open = (item: { kind: StoredKind; id: string }) => router.push(fileViewHref(item.kind, item.id));

  const fileRow = (item: LinkedItem, detail: string, takeOff?: { label: string; run: () => void }) => (
    <div key={`${item.kind}:${item.id}`} className="group flex items-center gap-1 pr-2 transition-colors hover:bg-foreground/[0.04]" onContextMenu={(e) => { e.preventDefault(); openMenu(e, item, takeOff); }}>
      <button type="button" onClick={() => open(item)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left">
        <FileTypeIcon kind={fileKind(item.mimeType, item.name)} recording={item.kind === "recording"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          <span className="block truncate text-xs text-muted">{detail}</span>
        </span>
      </button>
      <MenuButton label={`Options for ${item.name}`} onClick={(e) => openMenu(e, item, takeOff)} />
    </div>
  );

  const takeOffFrom = (g: FileGroup, a: FileAttachment, label: string) =>
    g.onChange ? { label, run: () => g.onChange!(g.attachments.filter((x) => attachmentKey(x) !== attachmentKey(a))) } : undefined;

  const groupHeader = (g: FileGroup) =>
    g.title ? (
      <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-xs font-semibold text-muted">
        {g.href ? (
          <Link href={g.href} className="truncate hover:text-foreground hover:underline">
            {g.title}
          </Link>
        ) : (
          <span className="truncate">{g.title}</span>
        )}
      </div>
    ) : null;

  return (
    <div className={`${FILL} flex flex-col overflow-hidden py-1`}>
      {shown.map((g) => (
        <div key={g.key} className="flex flex-col">
          {groupHeader(g)}
          {g.attachments.map((a) => {
            if (a.kind === "file") {
              const item = itemFor(a);
              if (item) return fileRow(item, fileDetail(item), takeOffFrom(g, a, "Take off (the file stays)"));
              const gone = isMissing(a);
              return (
                <div key={attachmentKey(a)} className="flex items-center gap-3 px-4 py-2">
                  <FileTypeIcon kind={fileKind(a.mimeType ?? "", a.label)} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${gone ? "text-muted line-through" : ""}`}>{a.label}</span>
                    <span className="block truncate text-xs text-muted">{gone ? "Not in your Files any more" : " "}</span>
                  </span>
                  {gone && g.onChange && (
                    <button type="button" onClick={() => g.onChange!(g.attachments.filter((x) => attachmentKey(x) !== attachmentKey(a)))} className="h-8 rounded-md px-2.5 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground">
                      Take off
                    </button>
                  )}
                </div>
              );
            }
            // A folder or a tag: its heading, then what's in it now.
            const list =
              a.kind === "folder"
                ? linked?.folders.find((f) => f.path === a.path)?.items
                : linked?.tags.find((t) => fileTagKey(t.tag) === fileTagKey(a.tag))?.items;
            const Icon = fileAttachmentIcon(a);
            const name = a.kind === "folder" ? a.path : a.tag;
            const unlink = takeOffFrom(g, a, a.kind === "folder" ? "Unlink this folder" : "Unlink this tag");
            return (
              <div key={attachmentKey(a)} className="flex flex-col border-t border-foreground/[0.06] first:border-t-0">
                <div className="flex items-center gap-2 py-1 pl-4 pr-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted" />
                  <Link href={fileAttachmentHref(a)} className="min-w-0 truncate text-sm font-semibold hover:underline" title={a.kind === "folder" ? `Open ${name} in Files` : `Files tagged ${name}`}>
                    {name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">
                    {a.kind === "folder" ? "Folder" : "Tag"}
                    {list ? ` · ${list.length}` : ""}
                  </span>
                  <span className="ml-auto" />
                  <MenuButton
                    label={`Options for ${name}`}
                    onClick={(e) =>
                      setMenu({
                        ...menuPosition(e),
                        width: 220,
                        items: [
                          { label: "Open in Files", onSelect: () => router.push(fileAttachmentHref(a)), icon: <FolderIcon className="h-4 w-4" /> },
                          ...(unlink ? [{ label: unlink.label, onSelect: unlink.run, danger: true, icon: <TrashIcon className="h-4 w-4" /> }] : []),
                        ],
                      })
                    }
                  />
                </div>
                {list === undefined ? (
                  <div className="mx-4 mb-2 h-10 rounded-lg bg-foreground/[0.03]" aria-hidden />
                ) : list.length === 0 ? (
                  <p className="px-4 pb-2.5 text-xs text-muted">{a.kind === "folder" ? "Nothing in this folder yet. Files you put in it show here." : "No files with this tag yet. Files you tag show here."}</p>
                ) : (
                  list.map((item) => fileRow(item, fileDetail(item, a.kind === "fileTag" && item.folder ? `in ${item.folder}` : a.kind === "folder" && item.folder !== a.path ? `in ${item.folder}` : null)))
                )}
              </div>
            );
          })}
        </div>
      ))}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** How many files a page's Files section shows (attached ones, plus what's in the linked folders
    and tags), counted once each — for the section's count. Undefined while loading. */
export function useLinkedCount(groups: FileGroup[]): number | undefined {
  const linked = useLinkedQuery(groups);
  const all = groups.flatMap((g) => g.attachments);
  if (!all.length) return 0;
  if (!linked) return undefined;
  const keys = new Set<string>();
  for (const i of linked.items) keys.add(`${i.kind}:${i.id}`);
  for (const f of linked.folders) for (const i of f.items) keys.add(`${i.kind}:${i.id}`);
  for (const t of linked.tags) for (const i of t.items) keys.add(`${i.kind}:${i.id}`);
  return keys.size;
}

/** The file attachments in a list, and a setter that keeps the others. */
export function splitFiles(list: Attachment[] | undefined): { files: FileAttachment[]; other: Attachment[] } {
  const files: FileAttachment[] = [];
  const other: Attachment[] = [];
  for (const a of list ?? []) (isFileAttachment(a) ? files : other).push(a);
  return { files, other };
}
