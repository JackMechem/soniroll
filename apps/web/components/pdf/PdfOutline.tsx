"use client";

import { useEffect, useRef, useState } from "react";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import PdfPageView from "@/components/pdf/PdfPageView";
import { rotateMarks, type Layer, type LayerPage, type Rotation } from "@/components/pdf/markup";
import { currentSection, sectionsOf, type PdfOutlineItem, type Section } from "@/components/pdf/outline";
import type { PdfSources } from "@/components/pdf/usePdfDoc";
import { BookmarkIcon, CheckIcon, ChevronRightIcon, CloseIcon, DotsVerticalIcon, PagesIcon, PencilIcon, PlusIcon, RotateIcon, TrashIcon } from "@/components/tools";

export type OutlineTab = "outline" | "pages";

export type OutlineActions = {
  onJump: (index: number, y?: number) => void;
  /** Adds a section on page `index` (the page you're on when left out), named and ready to rename. */
  onAdd: (index?: number) => void;
  onRename: (pageId: string, id: string, title: string) => void;
  onRemove: (pageId: string, id: string) => void;
  onSub: (pageId: string, id: string, sub: boolean) => void;
  /** Copies the PDF's own outline into your sections. */
  onUsePdfOutline: () => void;
  onPages: (change: (pages: LayerPage[]) => LayerPage[]) => void;
  /** The page grid (reorder, insert, staff paper). */
  onEditPages: () => void;
  onClose: () => void;
};

/**
 * The panel down the editor's left side (a sheet on a phone): **Outline** — your sections (bookmarks:
 * named, renamed in place, made sub-sections, deleted), each a link to where it starts with the
 * pages it covers as small thumbnails, and the PDF's own outline when it has one; **Pages** — every
 * page as a thumbnail with its number, to jump to, tick to turn or delete several, or bookmark. The
 * section and page you're on are highlighted as you scroll.
 */
export default function PdfOutline({
  layer,
  sources,
  images,
  canEdit,
  current,
  currentY,
  pdfOutline,
  mode,
  tab,
  onTab,
  renaming,
  onRenaming,
  actions,
}: {
  layer: Layer;
  sources: PdfSources;
  images?: Record<string, string | null | undefined>;
  canEdit: boolean;
  current: number;
  currentY: number;
  pdfOutline: PdfOutlineItem[] | null;
  mode: "side" | "sheet";
  tab: OutlineTab;
  onTab: (tab: OutlineTab) => void;
  /** The section whose name is being typed (by id). */
  renaming: string | null;
  onRenaming: (id: string | null) => void;
  actions: OutlineActions;
}) {
  const sections = sectionsOf(layer);
  const at = currentSection(sections, current, currentY);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pages = layer.pages;
  // Where each of the PDF's own pages is now (for its outline's links).
  const ownPages = new Map<number, number>();
  pages.forEach((p, i) => {
    if (p.src.kind === "pdf" && !p.src.file && !ownPages.has(p.src.page)) ownPages.set(p.src.page, i);
  });
  const hasPdfOutline = !!pdfOutline?.length;
  const checkedNow = checked.filter((id) => pages.some((p) => p.id === id));

  // Keep what you're on in view in the panel as you scroll the document.
  const activeKey = tab === "outline" ? (at >= 0 ? sections[at].bm.id : "") : pages[current]?.id;
  useEffect(() => {
    const body = bodyRef.current;
    const el = activeKey ? body?.querySelector<HTMLElement>(`[data-key="${activeKey}"]`) : null;
    if (!body || !el) return;
    const b = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < b.top + 8) body.scrollBy({ top: r.top - b.top - 8 });
    else if (r.bottom > b.bottom - 8) body.scrollBy({ top: Math.min(r.top - b.top - 8, r.bottom - b.bottom + 8) });
  }, [activeKey, tab]);

  const openMenu = (e: React.MouseEvent, items: MenuItem[], title?: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4, flipY: r.top - 4, width: 220, items, title });
  };

  const turn = (ids: string[]) =>
    actions.onPages((ps) =>
      ps.map((p) => (ids.includes(p.id) ? { ...p, rotate: ((p.rotate + 90) % 360) as Rotation, marks: rotateMarks(p.marks, sources.aspectOf(p)), bookmarks: p.bookmarks?.map((b) => ({ ...b, y: undefined })) } : p)),
    );
  const remove = (ids: string[]) => actions.onPages((ps) => (ps.length > ids.length ? ps.filter((p) => !ids.includes(p.id)) : ps));

  const manage: MenuItem[] = [
    ...(canEdit ? [{ label: "Add a section here", icon: <BookmarkIcon className="h-4 w-4" />, hint: "B", onSelect: () => actions.onAdd() }] : []),
    ...(canEdit && hasPdfOutline ? [{ label: "Use the PDF's outline", icon: <PlusIcon className="h-4 w-4" />, onSelect: actions.onUsePdfOutline }] : []),
    ...(canEdit ? [{ label: "Edit pages…", icon: <PagesIcon className="h-4 w-4" />, onSelect: actions.onEditPages }] : []),
    { label: "Close the panel", icon: <CloseIcon className="h-4 w-4" />, divider: canEdit, onSelect: actions.onClose },
  ];

  return (
    <div className={`flex min-h-0 flex-col bg-surface ${mode === "side" ? "h-full w-64 shrink-0 border-r border-foreground/10" : "h-full w-full"}`} aria-label="Outline and pages">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2 pb-1.5">
        <div className="flex flex-1 rounded-full bg-foreground/[0.05] p-0.5" role="tablist">
          {(["outline", "pages"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => onTab(t)}
              className={`h-8 flex-1 rounded-full text-sm font-medium transition-colors ${tab === t ? "bg-surface text-foreground shadow-sm ring-1 ring-foreground/10" : "text-muted hover:text-foreground"}`}
            >
              {t === "outline" ? "Outline" : "Pages"}
            </button>
          ))}
        </div>
        {canEdit && (
          <button type="button" onClick={() => actions.onAdd()} className={iconBtn} title="Add a section on this page (B)" aria-label="Add a section on this page">
            <PlusIcon className="h-[18px] w-[18px]" />
          </button>
        )}
        <button type="button" onClick={(e) => openMenu(e, manage, "Outline and pages")} className={iconBtn} title="Manage" aria-label="Manage">
          <DotsVerticalIcon className="h-[18px] w-[18px]" />
        </button>
      </div>

      {tab === "pages" && canEdit && checkedNow.length > 0 && (
        <div className="mx-2 mb-1 flex shrink-0 items-center gap-1 rounded-xl bg-accent/10 px-2 py-1 text-sm">
          <span className="flex-1 font-medium tabular-nums text-accent">{checkedNow.length} selected</span>
          <button type="button" onClick={() => turn(checkedNow)} className={iconBtn} title="Turn" aria-label="Turn the selected pages">
            <RotateIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              remove(checkedNow);
              setChecked([]);
            }}
            disabled={checkedNow.length >= pages.length}
            className={`${iconBtn} text-danger disabled:opacity-35`}
            title={checkedNow.length >= pages.length ? "A PDF keeps at least one page" : "Delete"}
            aria-label="Delete the selected pages"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setChecked([])} className={iconBtn} title="Clear the selection" aria-label="Clear the selection">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {tab === "outline" ? (
          <>
            {sections.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted">
                {canEdit ? (
                  <>
                    No sections yet. Add one on the page you&rsquo;re on with <span className="font-semibold text-foreground">+</span> (or press B): a song, a movement, the bridge. They show here as links, with their pages.
                  </>
                ) : (
                  "No sections in this PDF."
                )}
              </p>
            )}
            {sections.length > 0 && sections[0].index > 0 && (
              <SectionPages label="Before the first section" pages={range(0, sections[0].y > 1 ? sections[0].index : sections[0].index - 1)} {...{ layer, sources, images, current, onJump: actions.onJump }} />
            )}
            {sections.map((s, i) => (
              <SectionRow
                key={s.bm.id}
                s={s}
                active={i === at}
                canEdit={canEdit}
                renaming={renaming === s.bm.id}
                collapsed={collapsed.includes(s.bm.id)}
                onCollapse={() => setCollapsed((c) => (c.includes(s.bm.id) ? c.filter((x) => x !== s.bm.id) : [...c, s.bm.id]))}
                onJump={() => actions.onJump(s.index, s.y)}
                onStartRename={() => onRenaming(s.bm.id)}
                onRename={(title) => {
                  if (title !== null) actions.onRename(s.pageId, s.bm.id, title);
                  onRenaming(null);
                }}
                onMenu={(e) =>
                  openMenu(
                    e,
                    [
                      { label: "Rename", icon: <PencilIcon className="h-4 w-4" />, onSelect: () => onRenaming(s.bm.id) },
                      s.bm.sub
                        ? { label: "Make it a section", icon: <BookmarkIcon className="h-4 w-4" />, onSelect: () => actions.onSub(s.pageId, s.bm.id, false) }
                        : { label: "Make it a sub-section", icon: <BookmarkIcon className="h-4 w-4" />, onSelect: () => actions.onSub(s.pageId, s.bm.id, true) },
                      { label: "Delete", icon: <TrashIcon className="h-4 w-4" />, danger: true, divider: true, onSelect: () => actions.onRemove(s.pageId, s.bm.id) },
                    ],
                    s.bm.title,
                  )
                }
              >
                <SectionPages pages={s.pages} {...{ layer, sources, images, current, onJump: actions.onJump }} />
              </SectionRow>
            ))}
            {hasPdfOutline && (
              <div className="mt-4 border-t border-foreground/10 pt-3">
                <div className="flex items-center justify-between gap-2 px-2 pb-1">
                  <p className="text-xs font-semibold text-muted">In the PDF</p>
                  {canEdit && (
                    <button type="button" onClick={actions.onUsePdfOutline} className="rounded-full px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10">
                      Use as sections
                    </button>
                  )}
                </div>
                {pdfOutline!.map((it, i) => {
                  const index = it.page === null ? undefined : ownPages.get(it.page);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={index === undefined}
                      onClick={() => index !== undefined && actions.onJump(index, it.y)}
                      className="flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm hover:bg-surface-hover disabled:opacity-50"
                      style={{ paddingLeft: 8 + Math.min(it.depth, 3) * 14 }}
                      title={index === undefined ? "That page isn't in this PDF any more" : undefined}
                    >
                      <span className="min-w-0 flex-1 truncate">{it.title}</span>
                      {index !== undefined && <span className="text-xs tabular-nums text-muted">{index + 1}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className={`pt-1 ${mode === "sheet" ? "grid grid-cols-2 gap-x-2 gap-y-3" : "flex flex-col items-center gap-3"}`}>
            {pages.map((p, i) => {
              const on = checkedNow.includes(p.id);
              return (
                <div key={p.id} data-key={p.id} className="flex w-full flex-col items-center gap-1">
                  <div className="relative">
                  <button type="button" onClick={() => actions.onJump(i)} className={`block rounded-[3px] ${i === current ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : on ? "ring-2 ring-accent/50 ring-offset-2 ring-offset-surface" : ""}`} aria-label={`Go to page ${i + 1}`}>
                    <Thumb page={p} sources={sources} images={images} width={mode === "side" ? 150 : 132} />
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`Select page ${i + 1}`}
                        onClick={() => setChecked((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}
                        className={`absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-md shadow-sm ring-1 ${on ? "bg-accent text-accent-foreground ring-accent" : "bg-surface/95 text-transparent ring-foreground/25"}`}
                      >
                        <CheckIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) =>
                          openMenu(
                            e,
                            [
                              { label: "Add a section here", icon: <BookmarkIcon className="h-4 w-4" />, onSelect: () => actions.onAdd(i) },
                              { label: "Turn", icon: <RotateIcon className="h-4 w-4" />, onSelect: () => turn([p.id]) },
                              ...(pages.length > 1 ? [{ label: "Delete page", icon: <TrashIcon className="h-4 w-4" />, danger: true, divider: true, onSelect: () => remove([p.id]) }] : []),
                            ],
                            `Page ${i + 1}`,
                          )
                        }
                        className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-surface/95 text-foreground/80 shadow-sm ring-1 ring-foreground/15"
                        aria-label={`Page ${i + 1} actions`}
                      >
                        <DotsVerticalIcon className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  </div>
                  <span className={`text-xs tabular-nums ${i === current ? "font-semibold text-accent" : "text-muted"}`}>
                    {i + 1}
                    {p.bookmarks?.length ? <BookmarkIcon className="ml-1 inline h-3 w-3 align-[-1px]" /> : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

const iconBtn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/80 hover:bg-surface-hover";

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

function SectionRow({
  s,
  active,
  canEdit,
  renaming,
  collapsed,
  onCollapse,
  onJump,
  onStartRename,
  onRename,
  onMenu,
  children,
}: {
  s: Section;
  active: boolean;
  canEdit: boolean;
  renaming: boolean;
  collapsed: boolean;
  onCollapse: () => void;
  onJump: () => void;
  onStartRename: () => void;
  onRename: (title: string | null) => void;
  onMenu: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div data-key={s.bm.id} className={s.bm.sub ? "ml-4" : "mt-1"}>
      <div className={`group flex items-center gap-0.5 rounded-lg ${active ? "bg-accent/10 text-accent" : "hover:bg-surface-hover"}`}>
        <button type="button" onClick={onCollapse} className="flex h-8 w-6 shrink-0 items-center justify-center text-muted" aria-label={collapsed ? "Show its pages" : "Hide its pages"} aria-expanded={!collapsed}>
          <ChevronRightIcon className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`} />
        </button>
        {renaming ? (
          <RenameField title={s.bm.title} onDone={onRename} />
        ) : (
          <button
            type="button"
            onClick={onJump}
            onDoubleClick={() => canEdit && onStartRename()}
            className={`min-w-0 flex-1 truncate py-1.5 text-left text-sm ${s.bm.sub ? "" : "font-semibold"}`}
            title={s.bm.title}
          >
            {s.bm.title || "Untitled section"}
          </button>
        )}
        {!renaming && <span className="shrink-0 px-1 text-xs tabular-nums text-muted">{s.index + 1}</span>}
        {canEdit && !renaming && (
          <button type="button" onClick={onMenu} className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:text-foreground" aria-label={`${s.bm.title} actions`}>
            <DotsVerticalIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}

function RenameField({ title, onDone }: { title: string; onDone: (title: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value === null ? null : value.trim().slice(0, 120) || title);
  };
  return (
    <input
      ref={ref}
      defaultValue={title}
      aria-label="Section name"
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish((e.target as HTMLInputElement).value);
        if (e.key === "Escape") finish(null);
      }}
      className="h-8 min-w-0 flex-1 rounded-md bg-background px-2 text-sm text-foreground outline-none ring-2 ring-accent"
    />
  );
}

/** A section's pages as small thumbnails (three to a row), each a link. */
function SectionPages({
  pages: indexes,
  label,
  layer,
  sources,
  images,
  current,
  onJump,
}: {
  pages: number[];
  label?: string;
  layer: Layer;
  sources: PdfSources;
  images?: Record<string, string | null | undefined>;
  current: number;
  onJump: (index: number) => void;
}) {
  if (!indexes.length) return null;
  return (
    <div className="pb-1.5 pl-6">
      {label && <p className="px-1 pt-1 pb-1 text-xs font-semibold text-muted">{label}</p>}
      <div className="grid grid-cols-3 gap-x-1.5 gap-y-1 pt-1">
        {indexes.map((i) => {
          const p = layer.pages[i];
          if (!p) return null;
          return (
            <button key={p.id} type="button" onClick={() => onJump(i)} className="flex flex-col items-center gap-0.5" aria-label={`Go to page ${i + 1}`}>
              <span className={`rounded-[2px] ${i === current ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : ""}`}>
                <Thumb page={p} sources={sources} images={images} width={52} />
              </span>
              <span className={`text-[11px] tabular-nums ${i === current ? "font-semibold text-accent" : "text-muted"}`}>{i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Thumb({ page, sources, images, width }: { page: LayerPage; sources: PdfSources; images?: Record<string, string | null | undefined>; width: number }) {
  const aspect = sources.aspectOf(page);
  // Landscape pages a little wider, so they're not tiny.
  return (
    <span className="pointer-events-none block">
      <PdfPageView doc={sources.docFor(page)} page={page} aspect={aspect} width={aspect < 1 ? Math.round(width * 1.3) : width} images={images} />
    </span>
  );
}
