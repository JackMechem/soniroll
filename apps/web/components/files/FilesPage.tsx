"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import { FileTypeIcon, UploadProgress, fileDetail, useFileActions, useFileUploader } from "@/components/files/FileParts";
import { MenuButton } from "@/components/library/shared";
import { EmptyState, Hero, HeroSearch, LibraryPage, LibraryTabs, Pill, Toolbar } from "@/components/library/ui";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { CloudIcon, DeviceIcon, DownloadIcon, LibraryIcon, ChevronRightIcon, LinkIcon, TrashIcon, UploadIcon } from "@/components/tools";
import { type FileKind, type StoredEntry, type StoredKind, FILE_KIND_LABEL, fileKind, filesApi, formatBytes, formatFileDate } from "@/lib/files";
import { useTuneIndex } from "@/lib/recordings";
import StoragePill from "@/components/files/StoragePill";
import { tidyDeviceFiles, useDeviceUrls } from "@/lib/deviceFiles";
import { StorageMovePanel } from "@/components/files/StorageMove";
import { useBackup } from "@/lib/storageMove";
import { PLAN_HREF, useSaveTarget, useStoragePlan } from "@/lib/storagePlan";
import SaveWhere from "@/components/files/SaveWhere";
import { useSiteSettings } from "@/lib/siteSettings";

type Source = StoredKind;

const SOURCE_LABEL: Record<Source, string> = {
  file: "Uploads",
  recording: "Recordings",
  song: "Tune songs",
  lesson: "Lesson files",
  handin: "Hand-ins",
  profile: "Profile",
};

/** What a non-upload is, in the Where column. */
const SOURCE_SHORT: Record<Source, string | null> = {
  file: null,
  recording: "Recording",
  song: "Tune song",
  lesson: "Lesson file",
  handin: "Hand-in",
  profile: "Profile",
};

type SortKey = "added" | "name" | "where" | "size";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/** The phone's sort menu (the columns sort on wider screens). */
const SORT_OPTIONS: { value: string; label: string; sort: Sort }[] = [
  { value: "new", label: "Newest first", sort: { key: "added", dir: "desc" } },
  { value: "old", label: "Oldest first", sort: { key: "added", dir: "asc" } },
  { value: "name", label: "Name", sort: { key: "name", dir: "asc" } },
  { value: "big", label: "Largest first", sort: { key: "size", dir: "desc" } },
  { value: "small", label: "Smallest first", sort: { key: "size", dir: "asc" } },
];

/** A kind as a filter. */
const KIND_FILTER_LABEL: Record<FileKind, string> = {
  pdf: "PDFs",
  image: "Images",
  audio: "Audio",
  video: "Videos",
  notation: "Notation",
  document: "Documents",
  other: "Other",
};
const kindLabel = (k: FileKind) => KIND_FILTER_LABEL[k];

const keyOf = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;

/** The table's columns from `sm` up: select, name, where, size, added, ⋮. */
const COLUMNS = "sm:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,13rem)_5.5rem_6.5rem_2.5rem]";

/**
 * The Library's Files tab (`/tunes?tab=files`) — everything stored with your account, as a file browser: files you uploaded (on their
 * own or attached to tunes), recordings, tunes' songs, lesson files and hand-ins, profile images.
 * Upload (button or drop anywhere on the page), search, filter by where a file came from and what
 * kind it is, sort by any column, and open anything in place. Every item has a ⋮ menu (also on
 * right-click): rename, share a link, download, attach to a tune (uploads), delete. Tick several to
 * delete them together (Delete key works too).
 */
export default function FilesPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storage = useQuery(filesApi.storage, isAuthenticated ? {} : "skip");
  const tunes = useTuneIndex();
  const tuneName = (id: string) => tunes.get(id)?.tune.name;
  const saveTarget = useSaveTarget();
  const uploader = useFileUploader(undefined, saveTarget);
  const actions = useFileActions({ tuneName });

  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source | "all">("all");
  const [kind, setKind] = useState<FileKind | "all">("all");
  const [sort, setSort] = useState<Sort>({ key: "added", dir: "desc" });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selecting, setSelecting] = useState(false);

  const plan = useStoragePlan();
  const backup = useBackup();
  const withUrls = useDeviceUrls(storage?.items);
  const items = useMemo<StoredEntry[]>(() => withUrls ?? [], [withUrls]);

  // Forget files on this device that the account no longer lists (deleted or moved online, maybe
  // from another device).
  const owner = plan?.userId;
  const liveKeys = useMemo(() => (storage ? new Set(storage.items.flatMap((i) => (i.device ? [i.device.key] : []))) : null), [storage]);
  useEffect(() => {
    if (owner && liveKeys) void tidyDeviceFiles(owner, liveKeys);
  }, [owner, liveKeys]);

  const counts = useMemo(() => {
    const bySource = new Map<string, number>();
    const byKind = new Map<string, number>();
    for (const item of items) {
      bySource.set(item.kind, (bySource.get(item.kind) ?? 0) + 1);
      const k = fileKind(item.mimeType, item.name);
      byKind.set(k, (byKind.get(k) ?? 0) + 1);
    }
    return { bySource, byKind };
  }, [items]);

  /** The Where column: what it is and which tune it's on. */
  const whereOf = (item: StoredEntry) => {
    const tune = item.tuneId ? tuneName(item.tuneId) : undefined;
    return [SOURCE_SHORT[item.kind], tune].filter(Boolean).join(" · ") || "Your files";
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = items.filter((item) => {
      if (source !== "all" && item.kind !== source) return false;
      if (kind !== "all" && fileKind(item.mimeType, item.name) !== kind) return false;
      if (!q) return true;
      const tune = item.tuneId ? (tuneName(item.tuneId) ?? "") : "";
      return [item.name, tune].some((t) => t.toLowerCase().includes(q));
    });
    const by: Record<SortKey, (a: StoredEntry, b: StoredEntry) => number> = {
      added: (a, b) => a.createdAt - b.createdAt,
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      where: (a, b) => whereOf(a).localeCompare(whereOf(b)),
      size: (a, b) => a.size - b.size,
    };
    out.sort((a, b) => (sort.dir === "asc" ? 1 : -1) * by[sort.key](a, b));
    return out;
    // tuneName and whereOf read `tunes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, source, kind, sort, tunes]);

  // Only what's still listed counts as selected (deleted or filtered-out items drop out).
  const picked = shown.filter((item) => selected.has(keyOf(item)));
  const allPicked = shown.length > 0 && picked.length === shown.length;
  const showChecks = selecting || picked.length > 0;

  function toggle(item: StoredEntry) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(keyOf(item))) next.delete(keyOf(item));
      else next.add(keyOf(item));
      return next;
    });
  }
  const clearSelection = () => {
    setSelected(new Set());
    setSelecting(false);
  };
  const deletePicked = () => actions.deleteMany(picked, clearSelection);

  // Delete / Backspace deletes what's ticked; Escape clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Not while typing (ticking a box leaves focus on it, which is fine).
      if (t?.closest("textarea, select, [contenteditable], [role=dialog]") || (t instanceof HTMLInputElement && t.type !== "checkbox")) return;
      if (!picked.length) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        actions.deleteMany(picked, clearSelection);
      } else if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function sortBy(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "where" ? "asc" : "desc" }));
  }

  const used = storage?.used ?? 0;
  const quota = storage?.quota ?? 1;
  const phoneSort = SORT_OPTIONS.find((o) => o.sort.key === sort.key && o.sort.dir === sort.dir)?.value ?? "new";
  // Phones pick one filter at a time (a source or a kind); a kind wins if both are set.
  const phoneFilter = kind !== "all" ? `kind:${kind}` : `source:${source}`;

  return (
    <LibraryPage>
      <div {...(isAuthenticated ? uploader.drop : {})} className="flex flex-col gap-6">
        <Hero
          title="Library"
          icon={LibraryIcon}
          titleExtra={<StoragePill />}
          helpTopic="files"
          tabs={<LibraryTabs active="files" />}
        >
          {isAuthenticated && (
            <Toolbar>
              <HeroSearch value={query} onChange={setQuery} placeholder="Search files" />
              {/* Only when there's something to back up (a greyed-out icon explained nothing). */}
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => void backup.backUp(items)}
                  disabled={backup.busy}
                  title="Download every file you can open here — online or on this device — as one .zip"
                  aria-label="Back up as a .zip"
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-50 sm:h-9"
                >
                  <DownloadIcon className="h-4 w-4" /> <span className="hidden sm:inline">Back up</span>
                </button>
              )}
              <SaveWhere target={saveTarget} className="h-10 sm:h-9" />
              <button
                type="button"
                onClick={uploader.pick}
                disabled={!!uploader.progress}
                title="Or drop files anywhere on this page"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 sm:h-9"
              >
                <UploadIcon className="h-4 w-4" /> Upload
              </button>
            </Toolbar>
          )}
        </Hero>

        {isLoading || (isAuthenticated && storage === undefined) ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : !isAuthenticated ? (
          <EmptyState
            boxed
            title="Keep your files with your account"
            body="Upload PDFs, lead sheets, images, audio and video — on their own or attached to a tune — and open them on any device."
            action={<SignInButtons />}
          />
        ) : (
          <>
            {plan && <StorageMovePanel storage={plan} items={items} />}
            {plan && <WhereFilesGo storage={plan} />}

            {(backup.status || backup.message) && (
              <p className={`flex items-center gap-2 text-sm ${backup.message?.error ? "text-danger" : "text-muted"}`}>
                {backup.status ? (
                  <>
                    <LoadingSpinner size="sm" inline label="Backing up" /> {backup.status}
                  </>
                ) : (
                  backup.message?.text
                )}
              </p>
            )}

            {((plan?.hasPlan && used >= quota) || uploader.progress || uploader.error) && (
              <div className="flex flex-col gap-2">
                {plan?.hasPlan && used >= quota && <p className="text-sm text-danger">Your online storage is full. Delete something to add more.</p>}
                <UploadProgress progress={uploader.progress} />
                {uploader.error && <p className="text-sm text-danger">{uploader.error}</p>}
              </div>
            )}

            {/* Phones: one row — what to show (where it came from, or what kind) and the order. Hidden
                until there's something to filter. */}
            {items.length > 0 && (
            <>
            <div className="flex items-center gap-2 sm:hidden">
              <Select
                value={phoneFilter}
                onChange={(v) => {
                  const [what, value] = v.split(":");
                  setSource(what === "source" ? (value as Source | "all") : "all");
                  setKind(what === "kind" ? (value as FileKind) : "all");
                }}
                options={[
                  { value: "source:all", label: `Everything · ${items.length}` },
                  ...(Object.keys(SOURCE_LABEL) as Source[])
                    .filter((s) => counts.bySource.get(s))
                    .map((s) => ({ value: `source:${s}`, label: `${SOURCE_LABEL[s]} · ${counts.bySource.get(s)}` })),
                  ...(Object.keys(FILE_KIND_LABEL) as FileKind[])
                    .filter((k) => counts.byKind.get(k))
                    .map((k) => ({ value: `kind:${k}`, label: `${kindLabel(k)} · ${counts.byKind.get(k)}` })),
                ]}
                className="min-w-0 flex-1"
              />
              <Select
                value={phoneSort}
                onChange={(v) => setSort(SORT_OPTIONS.find((o) => o.value === v)!.sort)}
                options={SORT_OPTIONS.map(({ value, label }) => ({ value, label }))}
                className="min-w-0 flex-1"
              />
            </div>
            <div className="hidden flex-col gap-3 sm:flex">
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip active={source === "all"} onClick={() => setSource("all")} label="Everything" count={items.length} />
                {(Object.keys(SOURCE_LABEL) as Source[])
                  .filter((s) => counts.bySource.get(s))
                  .map((s) => (
                    <FilterChip key={s} active={source === s} onClick={() => setSource(s)} label={SOURCE_LABEL[s]} count={counts.bySource.get(s) ?? 0} />
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip active={kind === "all"} onClick={() => setKind("all")} label="All types" small />
                {(Object.keys(FILE_KIND_LABEL) as FileKind[])
                  .filter((k) => counts.byKind.get(k))
                  .map((k) => (
                    <FilterChip key={k} active={kind === k} onClick={() => setKind(k)} label={kindLabel(k)} small />
                  ))}
              </div>
            </div>
            </>
            )}

            <section className="flex flex-col overflow-hidden rounded-lg bg-surface">
              {/* Title, or what's ticked and what to do with it. */}
              <div className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 pl-4 pr-2">
                {picked.length > 0 ? (
                  <>
                    <span className="text-sm font-medium">{picked.length} selected</span>
                    <span className="text-xs tabular-nums text-muted">{formatBytes(picked.reduce((sum, i) => sum + i.size, 0))}</span>
                    <div className="ml-auto flex items-center gap-1.5">
                      {plan?.hasPlan && picked.some((i) => i.device && i.url) && (
                        <button
                          type="button"
                          onClick={() => void actions.putOnline(picked.filter((i) => i.device && i.url), clearSelection)}
                          disabled={!!actions.status}
                          title="Put what's ticked and kept on this device online, on all your devices"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
                        >
                          <CloudIcon className="h-4 w-4" /> Put online
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void backup.backUp(picked)}
                        disabled={backup.busy}
                        title="Download what's ticked as one .zip"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
                      >
                        <DownloadIcon className="h-4 w-4" /> Download
                      </button>
                      <button type="button" onClick={deletePicked} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium text-danger hover:bg-surface-hover">
                        <TrashIcon className="h-4 w-4" /> Delete
                      </button>
                      <button type="button" onClick={clearSelection} className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-sm font-medium">{source === "all" ? "Everything" : SOURCE_LABEL[source]}</h2>
                    <span className="text-xs tabular-nums text-muted">{shown.length}</span>
                    {/* Recordings have their own page (playback, takes per tune). */}
                    {source === "recording" && (
                      <Link href="/recordings" className="ml-auto inline-flex h-8 items-center gap-0.5 rounded-md px-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground">
                        All recordings <ChevronRightIcon className="h-4 w-4" />
                      </Link>
                    )}
                    {shown.length > 0 && (
                      <button
                        type="button"
                        onClick={() => (selecting ? clearSelection() : setSelecting(true))}
                        className={`${source === "recording" ? "" : "ml-auto"} inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground sm:hidden`}
                      >
                        {selecting ? "Done" : "Select"}
                      </button>
                    )}
                  </>
                )}
              </div>

              {shown.length === 0 ? (
                items.length === 0 ? (
                  <EmptyState
                    title="Nothing here yet"
                    body={
                      <>
                        Upload a PDF, a lead sheet, a photo of a chart, a recording — anything you want with your tunes.
                        <span className="pointer-coarse:hidden"> You can drop files anywhere on this page.</span>
                      </>
                    }
                    action={
                      <Pill primary icon={UploadIcon} label="Upload files" onClick={uploader.pick} />
                    }
                  />
                ) : (
                  <EmptyState title="Nothing matches" body="Try another word, or clear the filters." />
                )
              ) : (
                <div role="table" aria-label="Your files" className="flex flex-col divide-y divide-foreground/10">
                  <div role="row" className={`hidden h-9 items-center px-1.5 text-xs font-medium text-muted sm:grid ${COLUMNS}`}>
                    <span role="columnheader" className="flex justify-center">
                      <Checkbox
                        checked={allPicked}
                        mixed={picked.length > 0 && !allPicked}
                        label="Select all"
                        onChange={() => setSelected(allPicked ? new Set() : new Set(shown.map(keyOf)))}
                      />
                    </span>
                    <SortHeader label="Name" k="name" sort={sort} onSort={sortBy} />
                    <SortHeader label="Where" k="where" sort={sort} onSort={sortBy} />
                    <SortHeader label="Size" k="size" sort={sort} onSort={sortBy} end />
                    <SortHeader label="Added" k="added" sort={sort} onSort={sortBy} end />
                    <span />
                  </div>
                  {shown.map((item) => {
                    const isPicked = selected.has(keyOf(item));
                    const where = whereOf(item);
                    return (
                      <div
                        key={keyOf(item)}
                        role="row"
                        aria-selected={isPicked}
                        onContextMenu={(e) => actions.contextMenu(item, e)}
                        className={`group grid items-center px-1.5 ${showChecks ? "grid-cols-[2.25rem_minmax(0,1fr)_2.5rem]" : "grid-cols-[minmax(0,1fr)_2.5rem]"} ${COLUMNS} ${
                          isPicked ? "bg-accent/10" : "hover:bg-surface-hover"
                        }`}
                      >
                        <span role="cell" className={`${showChecks ? "flex" : "hidden sm:flex"} justify-center`}>
                          <Checkbox
                            checked={isPicked}
                            label={`Select ${item.name}`}
                            onChange={() => toggle(item)}
                            faint={!showChecks}
                          />
                        </span>
                        <button
                          type="button"
                          role="cell"
                          onClick={() => (showChecks && !window.matchMedia("(min-width: 640px)").matches ? toggle(item) : actions.openFile(item))}
                          className="flex min-w-0 items-center gap-3 px-2 py-2 text-left"
                        >
                          <FileTypeIcon kind={fileKind(item.mimeType, item.name)} />
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{item.name}</span>
                              {item.sharedId && (
                                <span title="Shared by link" className="inline-flex shrink-0 items-center gap-1 rounded-md bg-foreground/[0.05] px-1.5 py-px text-[11px] font-medium text-muted">
                                  <LinkIcon className="h-3 w-3" />
                                  <span className="hidden lg:inline">Shared</span>
                                </span>
                              )}
                              <PlaceBadge item={item} paid={!!plan?.hasPlan} />
                            </span>
                            {/* Phones: everything in one line under the name. */}
                            <span className="block truncate text-xs text-muted sm:hidden">{fileDetail(item, where === "Your files" ? null : where)}</span>
                            <span className="hidden truncate text-xs text-muted sm:block">{FILE_KIND_LABEL[fileKind(item.mimeType, item.name)]}</span>
                          </span>
                        </button>
                        <span role="cell" className="hidden truncate px-2 text-sm text-muted sm:block" title={where}>
                          {item.tuneId && tuneName(item.tuneId) ? (
                            <>
                              {SOURCE_SHORT[item.kind] && `${SOURCE_SHORT[item.kind]} · `}
                              <Link href={`/tunes/tune?id=${encodeURIComponent(item.tuneId)}`} className="text-foreground hover:text-accent hover:underline">
                                {tuneName(item.tuneId)}
                              </Link>
                            </>
                          ) : (
                            where
                          )}
                        </span>
                        <span role="cell" className="hidden px-2 text-right text-sm tabular-nums text-muted sm:block">
                          {formatBytes(item.size)}
                        </span>
                        <span role="cell" className="hidden px-2 text-right text-sm tabular-nums text-muted sm:block">
                          {formatFileDate(item.createdAt)}
                        </span>
                        <span role="cell" className="flex justify-center">
                          <MenuButton label={`Options for ${item.name}`} onClick={(e) => actions.openMenu(item, e)} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {actions.status && <p className="border-t border-foreground/10 px-4 py-3 text-sm text-muted">{actions.status}</p>}
              {actions.error && <p className="border-t border-foreground/10 px-4 py-3 text-sm text-danger">{actions.error}</p>}
            </section>
          </>
        )}
      </div>
      {uploader.input}
      {actions.dialogs}
    </LibraryPage>
  );
}

/** A column heading that sorts by it; a second click flips the order. */
function SortHeader({ label, k, sort, onSort, end = false }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; end?: boolean }) {
  const on = sort.key === k;
  return (
    <span role="columnheader" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`flex px-2 ${end ? "justify-end" : ""}`}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-0.5 rounded-md py-1 hover:text-foreground ${on ? "text-foreground" : ""}`}>
        {label}
        <ChevronRightIcon className={`h-3 w-3 transition-transform ${on ? "" : "opacity-0"} ${sort.dir === "asc" ? "-rotate-90" : "rotate-90"}`} />
      </button>
    </span>
  );
}

/** A row's tick box: faint until the row is hovered (or anything is ticked). */
function Checkbox({ checked, mixed = false, label, onChange, faint = false }: { checked: boolean; mixed?: boolean; label: string; onChange: () => void; faint?: boolean }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = mixed;
      }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className={`h-4 w-4 cursor-pointer accent-accent transition-opacity ${faint && !checked ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" : ""}`}
    />
  );
}

function FilterChip({ active, onClick, label, count, small = false }: { active: boolean; onClick: () => void; label: string; count?: number; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${small ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm"} ${
        active ? "bg-accent/15 text-accent" : "bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {label}
      {count != null && <span className={`text-xs tabular-nums ${active ? "text-accent/80" : "text-muted"}`}>{count}</span>}
    </button>
  );
}

/** Where an item's data is, beside its name: on this device, on another one (it won't open here),
    or online — shown for online items only on the free plan, where most things are on devices. */
function PlaceBadge({ item, paid }: { item: StoredEntry; paid: boolean }) {
  const badge = "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-medium";
  if (item.device) {
    return item.url ? (
      <span title="Kept on this device" className={`${badge} bg-foreground/[0.05] text-muted`}>
        <DeviceIcon className="h-3 w-3" />
        <span className="hidden lg:inline">This device</span>
      </span>
    ) : (
      <span title={`Kept on ${item.device.label}. Open it there.`} className={`${badge} bg-foreground/[0.05] text-muted`}>
        <DeviceIcon className="h-3 w-3" />
        <span className="max-w-[10rem] truncate">{item.device.label}</span>
      </span>
    );
  }
  // Online on the free plan: only for what's going to move (not lesson files, the profile, things
  // in notes or shared by link — those stay online).
  if (paid || !(item.kind === "file" || item.kind === "recording" || item.kind === "song") || item.keepOnline || item.sharedId) return null;
  return (
    <span title="Online" className={`${badge} bg-foreground/[0.05] text-muted`}>
      <CloudIcon className="h-3 w-3" />
      <span className="hidden lg:inline">Online</span>
    </span>
  );
}

/** One line on where new files go: this device (free), or online with the plan. */
function WhereFilesGo({ storage }: { storage: NonNullable<ReturnType<typeof useStoragePlan>> }) {
  const [settings] = useSiteSettings();
  const Icon = storage.hasPlan ? CloudIcon : DeviceIcon;
  const gb = storage.plan?.storageGb ?? storage.gift?.storageGb;
  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <span>
        {storage.hasPlan
          ? `Your ${gb} GB ${storage.plan ? "plan" : "gift"}: ${formatBytes(storage.used)} of ${formatBytes(storage.quota)} online. New files go ${settings.newFilesOnline ? "online" : "on this device"} unless you pick otherwise beside Upload.`
          : "New files are kept on this device. Every feature works; to have them on all your devices, get a storage plan."}{" "}
        <Link href={PLAN_HREF} className="font-medium text-accent hover:underline">
          {storage.hasPlan ? "Manage plan" : "Storage plans"}
        </Link>
      </span>
    </p>
  );
}
