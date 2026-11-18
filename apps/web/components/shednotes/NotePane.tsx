"use client";

import { titleKey } from "@jam-practice/core/shedNotes";
import type { SharedNote } from "./NoteList";

import { useMutation } from "convex/react";
import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CommandIcon,
  DotsVerticalIcon,
  DownloadIcon,
  EyeIcon,
  FolderIcon,
  GearIcon,
  KeyboardIcon,
  ListIcon,
  MaximizeIcon,
  NoteIcon,
  NotePlusIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon,
  ImageIcon,
} from "@/components/tools";
import { FONTS, getFont } from "@/lib/fonts";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import type { ShedNotesConfig } from "@/lib/shedNotesConfig";
import { type NoteMeta, errorText, useNote } from "@/lib/useShedNotes";
import { type NoteActions, keysFor, runCommand } from "./commands";
import LinksPanel from "./LinksPanel";
import NoteEditor from "./NoteEditor";

const SAVE_LABEL = { saved: "Saved", saving: "Saving…", unsaved: "Editing", error: "Not saved" } as const;

/** Formatting buttons — for phones and anyone who'd rather click. */
export const FORMAT: { label: string; title: string; command: string; className?: string }[] = [
  { label: "B", title: "Bold", command: "editor:toggle-bold", className: "font-bold" },
  { label: "I", title: "Italic", command: "editor:toggle-italic", className: "italic font-serif" },
  { label: "S", title: "Strikethrough", command: "editor:toggle-strikethrough", className: "line-through" },
  { label: "H1", title: "Heading 1", command: "editor:set-heading-1" },
  { label: "H2", title: "Heading 2", command: "editor:set-heading-2" },
  { label: "• List", title: "Bulleted list", command: "editor:toggle-bullet-list" },
  { label: "☐ Task", title: "Checklist item", command: "editor:toggle-checklist" },
  { label: "[[ ]]", title: "Link to a note", command: "editor:insert-wikilink" },
  { label: "Quote", title: "Quote", command: "editor:toggle-quote" },
  { label: "Table", title: "Insert a table (Tab moves between cells)", command: "editor:insert-table" },
];

/** Folds a side panel away (desktop): the note list on the left, the links on the right. */
export function PanelButton({ side, open, onClick, className = "", keys }: { side: "left" | "right"; open: boolean; onClick: () => void; className?: string; keys?: string }) {
  // The links panel never hides: closed, it sits under the note (as on a phone).
  const label = side === "left" ? `${open ? "Hide" : "Show"} the note list` : open ? "Move the links under the note" : "Move the links beside the note";
  const title = keys ? `${label} (${keys})` : label;
  const x = side === "left" ? 9 : 15;
  // The chevron points the way the panel will move.
  const chevron = side === "left" ? (open ? "m15 10-2 2 2 2" : "m13 10 2 2-2 2") : open ? "m9 10 2 2-2 2" : "m11 10-2 2 2 2";
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={open} title={title} className={`shrink-0 rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${className}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <path d={`M${x} 4v16`} />
        <path d={chevron} />
      </svg>
    </button>
  );
}

export function VimSwitch({ on, onChange, keys }: { on: boolean; onChange: (on: boolean) => void; keys?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={`${on ? "Vim keys are on" : "Vim keys are off"}${keys ? ` (${keys})` : ""}`}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-surface-hover ${on ? "text-foreground" : "text-muted hover:text-foreground"}`}
    >
      <span className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? "bg-accent" : "bg-foreground/20"}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-background transition-[left] ${on ? "left-3" : "left-0.5"}`} />
      </span>
      Vim
    </button>
  );
}

/**
 * One open note: back/forward, its title (renaming it renames the links to it), the toolbar (live
 * preview or source, Vim, notation, links panel, ⋮), formatting buttons, the editor, and the
 * links panel beside it (below it on narrower screens).
 */
/** Phones and tablets: a note opens to read, and the keyboard comes up only when you tap into it. */
function isTouchScreen() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export default function NotePane({
  id,
  notes,
  config,
  actions,
  setConfig,
  focusTitle,
  onBackToList,
  canBack,
  canForward,
  onView,
  onNotice,
  onTag,
  onOpen,
  shared = [],
  listOpen,
  onToggleList,
  linksOpen,
  onToggleLinks,
  templates,
}: {
  id: string;
  notes: NoteMeta[];
  config: ShedNotesConfig;
  actions: NoteActions;
  setConfig: (key: keyof ShedNotesConfig, value: boolean) => void;
  focusTitle: boolean;
  onBackToList: () => void;
  canBack: boolean;
  canForward: boolean;
  onView: (view: EditorView | null) => void;
  onNotice: (text: string) => void;
  onTag: (tag: string) => void;
  onOpen: (id: string) => void;
  /** Notes shared with you (a shared note's links open the owner's notes from here). */
  shared?: SharedNote[];
  listOpen: boolean;
  onToggleList: () => void;
  linksOpen: boolean;
  onToggleLinks: () => void;
  templates: { id: string; name: string }[];
}) {
  const { note, setBody, flush, saveState, saveError } = useNote(id);
  const rename = useMutation(api.shedNotes.rename);
  const [draft, setDraft] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Whether the note is empty right now (it offers templates then).
  const [empty, setEmpty] = useState<boolean | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const titleText = draft ?? note?.title ?? "";
  // The title wraps onto more lines rather than being cut off.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [titleText]);
  const viewRef = useRef<EditorView | null>(null);
  const loaded = !!note;

  useEffect(() => {
    if (focusTitle && loaded) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [focusTitle, loaded]);

  // This note's width and font (its own choice, else the general setting / the site's font).
  const setView = useMutation(api.shedNotes.setView);
  const fullWidth = note?.view?.fullWidth ?? !config.readableLineLength;
  const fontStack = note?.view?.font ? getFont(note.view.font).stack : undefined;
  const editorConfig = useMemo(() => ({ ...config, readableLineLength: !fullWidth }), [config, fullWidth]);
  const toggleFullWidth = useCallback(() => {
    void setView({ id: id as Id<"shedNotes">, fullWidth: !fullWidth });
  }, [setView, id, fullWidth]);

  // A note shared with you: what you can do depends on the owner's choice; only the owner renames,
  // moves, deletes, shares or changes how it looks.
  const mine = note?.role === "owner";
  const canEdit = mine || note?.role === "write";
  const paneActions: NoteActions = useMemo(
    () =>
      mine
        ? {
            ...actions,
            save: flush,
            toggleFullWidth,
            renameNote: () => {
              titleRef.current?.focus();
              titleRef.current?.select();
            },
          }
        : {
            ...actions,
            save: canEdit ? flush : undefined,
            // Its links point at the owner's notes: theirs opens if it's shared with you (as the
            // notes a shared note links to can be), else yours by that name.
            openNoteByTitle: (title: string) => {
              const key = titleKey(title);
              const theirs = shared.find((s) => s.ownerId === note?.ownerId && titleKey(s.title) === key);
              if (theirs) onOpen(theirs.id);
              else actions.openNoteByTitle?.(title);
            },
            createLinkedNote: undefined,
            renameNote: undefined,
            moveNote: undefined,
            deleteNote: undefined,
            shareNote: undefined,
            applyTemplate: undefined,
            newFromTemplate: undefined,
            // A score made here would be yours, not the note owner's — so no new notation.
            openScore: undefined,
          },
    [actions, flush, toggleFullWidth, mine, canEdit, shared, note?.ownerId, onOpen],
  );
  const titles = useMemo(() => notes.map((n) => ({ title: n.title, folder: n.folder })), [notes]);

  if (note === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }
  if (note === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-sm text-muted">This note isn&apos;t there any more.</p>
        <button type="button" onClick={onBackToList} className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
          All notes
        </button>
      </div>
    );
  }

  async function commitTitle() {
    if (draft === null || !note) return;
    const next = draft.trim();
    setDraft(null);
    if (!next || next === note.title) return;
    try {
      await rename({ id: note.id as Id<"shedNotes">, title: next });
    } catch (e) {
      onNotice(errorText(e));
    }
  }

  function run(command: string) {
    runCommand(command, { view: viewRef.current, actions: paneActions });
  }

  // Everything about the note lives in its ⋮ menu: how it's shown (preview, Vim, font, width),
  // then the note itself, then the app. Each item has an icon, and its key when it has one.
  function openMenu(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = { x: r.right - 260, y: r.bottom + 4, width: 260 };
    // The first key only, and none on phones (no keyboard).
    const hint = (command: string) => (window.innerWidth >= 640 ? keysFor(command, config.keybindings).split(" or ")[0] : "") || undefined;
    const icon = "h-4 w-4";
    const fontName = note?.view?.font ? getFont(note.view.font).label : "Site font";
    const template = note?.templateId ? (templates.find((t) => t.id === note.templateId)?.name ?? "deleted") : null;
    setMenu({
      ...at,
      items: [
        { label: "Live preview", icon: <EyeIcon className={icon} />, checked: config.livePreview, hint: hint("view:toggle-live-preview"), onSelect: () => setConfig("livePreview", !config.livePreview) },
        { label: "Vim keys", icon: <KeyboardIcon className={icon} />, checked: config.vimMode, hint: hint("view:toggle-vim"), onSelect: () => setConfig("vimMode", !config.vimMode) },
        { label: "Line numbers", icon: <ListIcon className={icon} />, checked: config.lineNumbers, onSelect: () => setConfig("lineNumbers", !config.lineNumbers) },
        ...(mine
          ? [
              // Wide screens only: on a phone the note is always the full width.
              ...(window.innerWidth >= 640 ? [{ label: "Full width", icon: <MaximizeIcon className={icon} />, checked: fullWidth, hint: hint("view:toggle-full-width"), onSelect: toggleFullWidth }] : []),
              { label: `Font: ${fontName}…`, icon: <span className="w-4 text-center font-serif text-[11px] font-bold leading-4">Aa</span>, onSelect: () => openFontMenu(at) },
            ]
          : []),
        ...(mine
          ? [
              { label: "Share…", icon: <UsersIcon className={icon} />, hint: hint("note:share"), divider: true, onSelect: () => actions.shareNote?.() },
              { label: "Rename", icon: <PencilIcon className={icon} />, onSelect: () => paneActions.renameNote?.() },
              { label: "Move to folder", icon: <FolderIcon className={icon} />, onSelect: () => actions.moveNote?.() },
              { label: template ? `Change template (now ${template})…` : "Apply a template…", icon: <NotePlusIcon className={icon} />, hint: hint("note:apply-template"), onSelect: () => actions.applyTemplate?.() },
            ]
          : []),
        { label: "Export as PDF", icon: <DownloadIcon className={icon} />, hint: hint("note:export-pdf"), divider: !mine, onSelect: () => actions.exportPdf?.() },
        { label: "Command palette", icon: <CommandIcon className={icon} />, hint: hint("app:command-palette"), divider: true, onSelect: () => actions.openCommandPalette?.() },
        { label: "Open a note…", icon: <SearchIcon className={icon} />, hint: hint("app:quick-switcher"), onSelect: () => actions.openQuickSwitcher?.() },
        { label: "Settings file", icon: <GearIcon className={icon} />, hint: hint("app:open-settings"), onSelect: () => actions.openSettings?.() },
        ...(mine ? [{ label: "Delete note", icon: <TrashIcon className={icon} />, danger: true, divider: true, onSelect: () => actions.deleteNote?.() }] : []),
      ],
    });
  }

  // The font list, in place of the ⋮ menu: each font's "Aa" drawn in that font.
  function openFontMenu(at: { x: number; y: number; width: number }) {
    const current = note?.view?.font ?? "";
    setMenu({
      ...at,
      items: [{ value: "", label: "Site font", stack: undefined as string | undefined }, ...FONTS.map((f) => ({ value: f.id, label: `${f.label} · ${f.kind.toLowerCase()}`, stack: f.stack }))].map((o) => ({
        label: o.label,
        icon: (
          <span className="w-4 text-center text-[11px] font-semibold leading-4" style={o.stack ? { fontFamily: o.stack } : undefined}>
            Aa
          </span>
        ),
        checked: o.value === current,
        onSelect: () => void setView({ id: id as Id<"shedNotes">, font: o.value || null }),
      })),
    });
  }

  const withKeys = (title: string, command: string) => {
    const keys = keysFor(command, config.keybindings);
    return keys ? `${title} (${keys})` : title;
  };
  const iconBtn = "shrink-0 rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    // A container: the links sit beside the note only when this pane has room for both (not by
    // screen width — the sidebar and the note list take some of it).
    <div className="@container flex min-h-0 flex-1 flex-col">
    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${linksOpen ? "@4xl:flex-row @4xl:gap-6" : ""}`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={onBackToList} className="flex h-9 shrink-0 items-center gap-1 rounded-md bg-foreground/[0.05] pl-2 pr-3 text-sm font-medium transition-colors hover:bg-surface-hover lg:hidden">
            <ChevronLeftIcon className="h-4 w-4" /> Notes
          </button>
          <PanelButton side="left" open={listOpen} onClick={onToggleList} keys={keysFor("view:toggle-note-list", config.keybindings)} className="hidden lg:block" />
          <button type="button" onClick={() => actions.goBack?.()} disabled={!canBack} aria-label="Back" className={`${iconBtn} hidden lg:block`}>
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => actions.goForward?.()} disabled={!canForward} aria-label="Forward" className={`${iconBtn} hidden lg:block`}>
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <span className="hidden min-w-0 truncate text-xs text-muted @2xl:inline">{note.folder ? `${note.folder.replace(/\//g, " / ")} /` : ""}</span>
          <span className="flex-1" />
          {!mine && (
            <span className="min-w-0 truncate rounded-md bg-foreground/[0.05] px-2 py-0.5 text-xs text-muted" title={`Shared with you by @${note.owner ?? "someone"}`}>
              @{note.owner ?? "someone"} · {canEdit ? "can edit" : "view only"}
            </span>
          )}
          <span className={`hidden shrink-0 text-xs @xl:inline ${canEdit ? "" : "!hidden"} ${saveState === "error" ? "font-semibold text-danger" : "text-muted"}`} title={saveError ?? undefined}>
            {SAVE_LABEL[saveState]}
          </span>
          <button type="button" onClick={openMenu} aria-label="Note options" className={iconBtn}>
            <DotsVerticalIcon className="h-4 w-4" />
          </button>
          {mine && <PanelButton side="right" open={linksOpen} onClick={onToggleLinks} keys={keysFor("view:toggle-links-panel", config.keybindings)} className="hidden lg:block" />}
        </div>

        <textarea
          ref={titleRef}
          rows={1}
          value={draft ?? note.title}
          onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitTitle();
              viewRef.current?.focus();
            } else if (e.key === "Escape") {
              setDraft(null);
              viewRef.current?.focus();
            }
          }}
          aria-label="Note title"
          readOnly={!mine}
          className="w-full resize-none overflow-hidden bg-transparent text-2xl leading-tight font-semibold tracking-tight outline-none sm:text-3xl"
          style={{ ...(fullWidth ? {} : { maxWidth: "46rem", marginInline: "auto" }), ...(fontStack ? { fontFamily: fontStack } : {}) }}
        />

        <div className={`${canEdit ? "flex" : "hidden"} items-center gap-0.5 overflow-x-auto border-b border-foreground/10 pb-1.5 [scrollbar-width:none] ${canEdit ? "sm:flex-wrap" : ""} [&::-webkit-scrollbar]:hidden`} style={fullWidth ? undefined : { maxWidth: "46rem", marginInline: "auto", width: "100%" }}>
          {FORMAT.map((f) => (
            <button key={f.command} type="button" title={withKeys(f.title, f.command)} aria-label={f.title} onMouseDown={(e) => e.preventDefault()} onClick={() => run(f.command)} className={`h-7 min-w-7 shrink-0 rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${f.className ?? "font-medium"}`}>
              {f.label}
            </button>
          ))}
          {mine && <button type="button" title={withKeys("Write music notation", "editor:insert-notation")} onMouseDown={(e) => e.preventDefault()} onClick={() => run("editor:insert-notation")} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <NoteIcon className="h-3.5 w-3.5" /> Notation
          </button>}
          {canEdit && <button type="button" title={withKeys("Insert a file or picture (or paste one)", "editor:insert-file")} onMouseDown={(e) => e.preventDefault()} onClick={() => run("editor:insert-file")} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <ImageIcon className="h-3.5 w-3.5" /> File
          </button>}
        </div>

        {mine && (empty ?? !note.body.trim()) && (
          // An empty note: start it from a template.
          <div className="flex flex-wrap items-center gap-1.5 text-xs" style={fullWidth ? undefined : { maxWidth: "46rem", marginInline: "auto", width: "100%" }}>
            <span className="font-medium text-muted">Start from a template:</span>
            {templates.slice(0, 6).map((t) => (
              <button key={t.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => actions.applyTemplate?.(t.id)} className="h-7 rounded-md bg-foreground/[0.05] px-2 font-medium transition-colors hover:bg-surface-hover">
                {t.name}
              </button>
            ))}
            {templates.length > 6 && (
              <button type="button" onClick={() => actions.applyTemplate?.()} className="h-7 rounded-md px-2 font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                More…
              </button>
            )}
            {templates.length === 0 && (
              <button type="button" onClick={() => actions.openTemplates?.()} className="h-7 rounded-md px-2 font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                Make a template
              </button>
            )}
          </div>
        )}

        <div className="relative min-h-[55vh] rounded-lg lg:min-h-0 lg:flex-1">
          <NoteEditor
            key={id}
            initialText={note.body}
            config={editorConfig}
            fontFamily={fontStack}
            notes={titles}
            actions={paneActions}
            onChange={(text) => {
              setBody(text);
              setEmpty(!text.trim());
            }}
            readOnly={!canEdit}
            scoreContext={mine ? undefined : { noteId: id }}
            syncText={saveState === "saved" ? note.body : undefined}
            onView={(v) => {
              viewRef.current = v;
              onView(v);
            }}
            autoFocus={!focusTitle && !isTouchScreen()}
            placeholder="Start writing. [[ links a note, # makes a heading, - [ ] a checkbox."
            className="h-full lg:absolute lg:inset-0"
          />
        </div>
      </div>

      {/* Beside the note when there's room and it's open; otherwise under it. */}
      <aside className={`${mine ? "" : "!hidden"} shrink-0 border-t border-foreground/10 pt-4 lg:max-h-[35%] lg:overflow-y-auto ${linksOpen ? "@4xl:max-h-none @4xl:w-72 @4xl:border-l @4xl:border-t-0 @4xl:pl-6 @4xl:pt-1" : ""}`}>
        {/* Under the note, lined up with its text column. */}
        <div className={linksOpen ? "@4xl:!max-w-none" : ""} style={fullWidth ? undefined : { maxWidth: "46rem", marginInline: "auto" }}>
          <LinksPanel note={note} body={note.body} notes={notes} onOpen={onOpen} onOpenTitle={(t) => paneActions.openNoteByTitle?.(t, { create: true })} onTag={onTag} />
        </div>
      </aside>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
    </div>
  );
}
