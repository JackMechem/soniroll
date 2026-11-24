"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useFilePicker, type FileFilter } from "@/components/files/FilePicker";
import { useFileUploader } from "@/components/files/FileParts";
import ObjectBar, { stepSize, type BarActions } from "@/components/pdf/ObjectBar";
import PdfPageView, { type PageEditing, type TextStyle, type Tool, type ToolOptions, type Typing } from "@/components/pdf/PdfPageView";
import PdfPages from "@/components/pdf/PdfPages";
import PdfPerform from "@/components/pdf/PdfPerform";
import PdfOutline, { type OutlineActions, type OutlineTab } from "@/components/pdf/PdfOutline";
import { headingNear, sectionsOf, usePdfOutline } from "@/components/pdf/outline";
import { CustomColour, FitGlyph, IconBtn, Pop, Swatch, ToolBtn, keepFocus, toolCls, useRowScroll } from "@/components/pdf/editorParts";
import { exportPdf } from "@/components/pdf/exportPdf";
import { aabb, fontFamily, imageKey, reanchorText, translate, unionBox } from "@/components/pdf/geometry";
import { covers } from "@/components/pdf/barPlace";
import {
  HIGHLIGHTS,
  INKS,
  SHAPES,
  STAMPS,
  SYMBOLS,
  UNITS,
  isEmptyLayer,
  newId,
  nextStampText,
  pageAspect,
  parseLayerInfo,
  roundMark,
  type ImageMark,
  type Layer,
  type LayerPage,
  type Mark,
  type TextMark,
} from "@/components/pdf/markup";
import {
  ChevronLeftIcon,
  CursorIcon,
  DotsVerticalIcon,
  DownloadIcon,
  EditTextIcon,
  EraserIcon,
  EyeIcon,
  EyeOffIcon,
  HandIcon,
  HighlighterIcon,
  ImageIcon,
  ListIcon,
  PagesIcon,
  PencilIcon,
  PlayIcon,
  RedoIcon,
  ShapesIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/components/tools";
import { downloadFile, errorText, fileKind, type StoredEntry, type StoredKind } from "@/lib/files";
import { usePdfDoc, usePdfDocs, type PdfSources } from "@/components/pdf/usePdfDoc";
import { useLayerSync } from "@/components/pdf/useLayerSync";
import { mergeLayers } from "@/components/pdf/merge";
import { useDeviceUrls } from "@/lib/deviceFiles";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { usePaneElement, usePaneKeyGuard } from "@/lib/paneContext";
import { useSaveTarget } from "@/lib/storagePlan";

export type PdfFile = {
  /** The id of an item in the signed-in user's Files: markings are saved to it. Without one (a
      shared file, a note's embed) the PDF opens to read only. */
  id?: string | null;
  /** Which kind of item `id` is (a lesson file, a hand-in, …); an upload (`files`) when left out. */
  kind?: StoredKind;
  name: string;
  url: string;
};

type History = { layer: Layer; past: Layer[]; future: Layer[]; merge?: string; at?: number };

const DEFAULT_TEXT: TextStyle = { font: "sans", size: 22, color: INKS[0].color, align: "left" };

const DEFAULT_OPTIONS: ToolOptions = {
  tool: "select",
  ink: INKS[1].color,
  inkWidth: 3,
  highlight: HIGHLIGHTS[0].color,
  stamp: STAMPS[0],
  shape: "line",
  text: DEFAULT_TEXT,
};

const WIDTHS = [
  { label: "Fine", width: 1.5 },
  { label: "Medium", width: 3 },
  { label: "Bold", width: 6 },
];

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

const IMAGES: FileFilter = { accept: "image/*", matches: (f) => fileKind(f.mimeType, f.name) === "image", noun: "a picture" };

/** Marks copied (Ctrl/⌘+C), shared by every open PDF so they paste into another one too. */
let clipboard: { marks: Mark[]; pageId: string; pasted: number } | null = null;

/** How far a duplicate or a paste lands from the original. */
const OFFSET = 12;

const NO_TEXT = "This page has no text to edit: it's a picture of the page (a scan). Cover a spot with Cover, then type over it with Text.";

/**
 * The PDF viewer and editor: every page in one scrolling column, zoom, and — on your own files —
 * markings drawn over the pages, page editing (order, rotation, deleting, blank and staff pages),
 * page turning for playing from it, and a download with the markings baked in. The markings are a
 * layer saved with the file (`pdfMarkups`); the PDF itself is never changed.
 *
 * Markings are objects, as in Canva or Acrobat: the Select tool (the default) clicks one to select
 * it (Shift adds), drags a box over several, moves them (snapping to the page and to each other;
 * Alt turns that off), resizes them with eight handles, turns them with the one above, and a bar
 * by the selection styles them. Scrolling stays as it was: the wheel, a trackpad and touch scroll
 * with any tool, a drag on empty paper with a mouse makes a selection box, and Space (held) or the
 * Hand tool drags the page.
 *
 * `embedded`: it fills the box it's in (a page of its own, `/files/view` — in a pane that's under
 * the pane's bar) instead of covering the window. Without `onClose` there's no Done button and
 * Escape doesn't leave (the pane's bar has Back and ×).
 */
export default function PdfEditor({ file, onClose, extraMenu, embedded = false }: { file: PdfFile; onClose?: () => void; extraMenu?: MenuItem[]; embedded?: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  // In a split-screen pane or the side view it covers just that pane (so other panes stay usable).
  const paneEl = usePaneElement();
  // Its keys (tools, undo, Escape) only when its pane has the keyboard, not while you use another.
  const forThisPane = usePaneKeyGuard();
  const fileId = file.id && (!file.kind || file.kind === "file") ? (file.id as Id<"files">) : null;
  // Which PDF the markings belong to: an upload by its id, any other item in your Files by kind + id.
  const otherKind = file.id && !fileId ? file.kind : undefined;
  const otherId = otherKind ? file.id : undefined;
  const target = useMemo(() => (fileId ? { fileId } : otherKind && otherId ? { kind: otherKind, id: otherId } : null), [fileId, otherKind, otherId]);

  // ---- the PDF itself
  const { doc, aspects, widths, error: loadError, bytesRef } = usePdfDoc(file.url);

  // ---- the markings
  const signedInOwner = !!target && isAuthenticated;
  const saved = useQuery(api.pdfMarkups.get, signedInOwner && target ? target : "skip");
  const savedReady = !signedInOwner || saved !== undefined;
  const parsed = useMemo(() => (doc && savedReady ? parseLayerInfo(saved?.data, doc.numPages) : null), [doc, savedReady, saved?.data]);
  const base = parsed?.layer ?? null;
  // A layer saved by a newer soniroll is shown but never saved over.
  const newer = !!parsed?.newer;
  const canEdit = signedInOwner && !newer;
  const [history, setHistory] = useState<History | null>(null);
  const layer = history?.layer ?? base;

  /** One step to undo. With `merge`, changes with the same key within a second are one step (arrow
      nudges). */
  const commit = useCallback(
    (change: (l: Layer) => Layer, merge?: string) => {
      setHistory((h) => {
        const current = h?.layer ?? base;
        if (!current) return h;
        const next = change(current);
        if (next === current) return h;
        const now = Date.now();
        if (merge && h && h.merge === merge && now - (h.at ?? 0) < 1000) return { ...h, layer: next, at: now };
        return { layer: next, past: [...(h?.past ?? []), current].slice(-100), future: [], merge, at: now };
      });
    },
    [base],
  );
  // Undo and redo select what they bring back (or change), so it can be cut, moved or deleted again.
  const undo = () => {
    const h = history;
    if (!h?.past.length) return;
    const prev = h.past[h.past.length - 1];
    finishTypingRef.current();
    setHistory({ layer: prev, past: h.past.slice(0, -1), future: [h.layer, ...h.future] });
    setSelection(changedMarks(h.layer, prev));
  };
  const redo = () => {
    const h = history;
    if (!h?.future.length) return;
    const next = h.future[0];
    finishTypingRef.current();
    setHistory({ layer: next, past: [...h.past, h.layer], future: h.future.slice(1) });
    setSelection(changedMarks(h.layer, next));
  };

  // Pages inserted from your other PDFs: their files' addresses, then the PDFs themselves.
  const otherIds = useMemo(() => [...new Set((layer?.pages ?? []).flatMap((p) => (p.src.kind === "pdf" && p.src.file ? [p.src.file] : [])))], [layer]);
  const myFiles = useDeviceUrls(useQuery(api.files.list, signedInOwner && otherIds.length ? {} : "skip"));
  const otherUrls = useMemo(() => Object.fromEntries(otherIds.map((id) => [id, myFiles?.find((f) => f._id === id)?.url])), [otherIds, myFiles]);
  const others = usePdfDocs(otherUrls);
  const otherAspects = useMemo(() => Object.fromEntries(Object.entries(others).map(([id, o]) => [id, o === "error" ? undefined : o.aspects])), [others]);
  const sources: PdfSources = useMemo(
    () => ({
      docFor: (p) => (p.src.kind === "pdf" && p.src.file ? (others[p.src.file] === "error" ? null : (others[p.src.file] as { doc: PDFDocumentProxy } | undefined)?.doc ?? null) : doc),
      aspectOf: (p) => pageAspect(p, aspects, otherAspects),
      pageCount: doc?.numPages ?? 0,
    }),
    [doc, aspects, others, otherAspects],
  );
  /** Points per unit on a page (text sizes are shown in points, as the page prints). */
  const ptPerUnit = (p: LayerPage | undefined) => {
    const own = p && p.src.kind === "pdf" && !p.src.file ? p.src.page : 0;
    const w = widths[own] ?? widths[0] ?? 612;
    const a = aspects[own] ?? 1.294;
    return (p && p.rotate % 180 !== 0 ? w * a : w) / UNITS;
  };

  // ---- pictures on the pages: their addresses from your Files (and ones just added, at once)
  const hasImages = useMemo(() => (layer?.pages ?? []).some((p) => p.marks.some((m) => m.t === "image")), [layer]);
  const storage = useQuery(api.files.storage, signedInOwner && hasImages ? {} : "skip");
  const stored = useDeviceUrls(storage?.items as StoredEntry[] | undefined);
  const [localImages, setLocalImages] = useState<Record<string, string>>({});
  const images = useMemo(() => {
    const out: Record<string, string | null | undefined> = {};
    for (const item of stored ?? []) out[`${item.kind}:${item.id}`] = item.url ?? (item.device ? null : undefined);
    return { ...out, ...localImages };
  }, [stored, localImages]);

  const updatePage = useCallback((pageId: string, change: (p: LayerPage) => LayerPage, merge?: string) => commit((l) => ({ ...l, pages: l.pages.map((p) => (p.id === pageId ? change(p) : p)) }), merge), [commit]);

  // ---- tools
  const [options, setOptions] = useState<ToolOptions>(DEFAULT_OPTIONS);
  const setOpt = (patch: Partial<ToolOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const [selection, setSelection] = useState<{ pageId: string; ids: string[] } | null>(null);
  const [typing, setTypingState] = useState<Typing | null>(null);
  const typingRef = useRef<Typing | null>(null);
  const setTyping = (t: Typing | null) => {
    typingRef.current = t;
    setTypingState(t);
  };
  // Text being typed is saved after a pause in the typing (and at once when the page goes away).
  const [typingSnap, setTypingSnap] = useState<Typing | null>(null);
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => setTypingSnap(typing), 800);
    return () => clearTimeout(t);
  }, [typing]);
  const typedSoFar = typing && typingSnap && typingSnap.mark.id === typing.mark.id && typingSnap.pageId === typing.pageId ? typingSnap : null;
  const editedLayer = history?.layer ?? null;
  const local = useMemo(() => (typedSoFar && layer ? withTyping(layer, typedSoFar) : editedLayer), [typedSoFar, layer, editedLayer]);
  const liveRef = useRef<Layer | null>(null);
  useEffect(() => {
    const t = typingRef.current;
    liveRef.current = t && layer ? withTyping(layer, t) : editedLayer;
  });
  const sync = useLayerSync({
    target,
    enabled: canEdit,
    row: signedInOwner ? saved : undefined,
    pageCount: doc?.numPages ?? 0,
    local,
    live: liveRef,
    // Newer markings saved elsewhere: this copy's changes (and its undo steps) go on top of them.
    rebase: (from, theirs) =>
      setHistory((h) =>
        h
          ? { ...h, layer: mergeLayers(from, h.layer, theirs), past: h.past.map((l) => mergeLayers(from, l, theirs)), future: h.future.map((l) => mergeLayers(from, l, theirs)) }
          : h,
      ),
    onDraft: (draft) => setHistory((h) => ({ layer: draft, past: [...(h?.past ?? []), ...(base ? [base] : [])], future: [] })),
  });
  // Typing counts once it changes something (not just from clicking into a box).
  const typingDirty =
    !!typing &&
    typing !== typedSoFar &&
    (typing.isNew ? !!typing.mark.text.trim() || !!typing.cover : JSON.stringify(layer?.pages.find((p) => p.id === typing.pageId)?.marks.find((m) => m.id === typing.mark.id)) !== JSON.stringify(typing.mark));
  const unsaved = sync.pending || typingDirty;
  const [penOnly, setPenOnly] = useState(false);
  const [spaceHand, setSpaceHand] = useState(false);
  const [gestureActive, setGestureActive] = useState(false);
  const [hideMarks, setHideMarks] = useState(false);
  const [view, setView] = useState<"read" | "pages" | "perform">("read");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pages = useMemo(() => layer?.pages ?? [], [layer]);
  const pageById = (id: string | undefined) => pages.find((p) => p.id === id);
  // The selection as it is now (undo can take marks away).
  const selPage = pageById(selection?.pageId);
  const typingHere = typing && typing.pageId === selection?.pageId ? typing.mark : null;
  const selectedMarks: Mark[] = selPage ? (selection?.ids ?? []).flatMap((id) => (typingHere?.id === id ? [typingHere] : selPage.marks.filter((m) => m.id === id))) : typingHere ? [typingHere] : [];
  const selectedIds = selectedMarks.map((m) => m.id);

  /** Replaces marks (by id) on a page; the one being typed changes in place, not as a step. */
  const changeMarks = (pageId: string, changed: Mark[], merge?: string) => {
    const t = typingRef.current;
    let rest = changed;
    if (t && t.pageId === pageId) {
      const mine = changed.find((m) => m.id === t.mark.id);
      if (mine && mine.t === "text") setTyping({ ...t, mark: mine });
      rest = changed.filter((m) => m.id !== t.mark.id);
    }
    if (!rest.length) return;
    const byId = new Map(rest.map((m) => [m.id, m]));
    updatePage(pageId, (p) => ({ ...p, marks: p.marks.map((m) => byId.get(m.id) ?? m) }), merge);
  };
  const addMarks = (pageId: string, added: Mark[], select = false) => {
    updatePage(pageId, (p) => ({ ...p, marks: [...p.marks, ...added] }));
    if (select) setSelection({ pageId, ids: added.map((m) => m.id) });
  };
  const removeMarks = (pageId: string, ids: string[]) => {
    updatePage(pageId, (p) => (p.marks.some((m) => ids.includes(m.id)) ? { ...p, marks: p.marks.filter((m) => !ids.includes(m.id)) } : p));
    setSelection((s) => (s && s.pageId === pageId ? { ...s, ids: s.ids.filter((id) => !ids.includes(id)) } : s));
  };

  /** Changes every selected mark; text keeps its anchor (grows the way it's aligned). */
  const patchSelected = (change: (m: Mark) => Mark, merge?: string) => {
    if (!selection) return;
    const changed = selectedMarks.filter((m) => !m.locked || change(m).locked === false).map((m) => {
      const next = change(m);
      return next.t === "text" && m.t === "text" ? reanchorText(m, next) : next;
    });
    // New text takes the style you last chose.
    const text = changed.find((m): m is TextMark => m.t === "text" && m.font !== "music");
    if (text) setOpt({ text: { font: text.font, size: text.size, color: text.color, bold: text.bold, italic: text.italic, underline: text.underline, align: text.align ?? "left", frame: text.frame, bg: text.bg, lh: text.lh } });
    changeMarks(selection.pageId, changed.map(roundMark), merge);
  };

  // ---- typing
  const finishTyping = () => {
    const t = typingRef.current;
    if (!t) return;
    setTyping(null);
    setTypingSnap(null);
    const text = t.mark.text.replace(/\s+$/, "");
    const mark = roundMark({ ...t.mark, text });
    const page = pageById(t.pageId);
    const exists = page?.marks.some((m) => m.id === mark.id);
    if (!exists) {
      // A cover stays even with no text: that's how the PDF's own words are taken out.
      const added = [...(t.cover ? [t.cover] : []), ...(text ? [mark] : [])];
      if (added.length) addMarks(t.pageId, added);
      setSelection(text ? { pageId: t.pageId, ids: [mark.id] } : null);
      return;
    }
    if (!text) removeMarks(t.pageId, [mark.id]);
    else {
      changeMarks(t.pageId, [mark]);
      setSelection({ pageId: t.pageId, ids: [mark.id] });
    }
  };
  const finishTypingRef = useRef(finishTyping);
  useEffect(() => {
    finishTypingRef.current = finishTyping;
  });
  const startTyping = (pageId: string, t: Omit<Typing, "pageId">) => {
    if (typingRef.current) finishTyping();
    setTypingSnap(null);
    setTyping({ ...t, pageId });
    setSelection({ pageId, ids: [t.mark.id] });
  };
  const patchTyping = (change: (m: TextMark) => TextMark) => {
    const t = typingRef.current;
    if (!t) return;
    setTyping({ ...t, mark: reanchorText(t.mark, change(t.mark)) });
  };
  const pt = (p: LayerPage | undefined) => ptPerUnit(p);
  const sizeStep = (m: TextMark, dir: 1 | -1, page: LayerPage | undefined) => ({ ...m, size: stepSize(m.size * pt(page), dir) / pt(page) });

  const pickTool = (tool: Tool) => {
    if (typingRef.current) finishTyping();
    setOpt({ tool });
    if (tool === "pen" || tool === "highlight" || tool === "eraser" || tool === "hand") setSelection(null);
  };
  const tool: Tool = spaceHand ? "hand" : options.tool;

  // ---- object actions
  const pageForNew = () => selection?.pageId ?? pages[Math.min(current, pages.length - 1)]?.id;
  const duplicate = () => {
    if (!selection || !selectedMarks.length) return;
    const copies = selectedMarks.map((m) => roundMark({ ...translate(m, OFFSET, OFFSET), id: newId(), locked: undefined }));
    addMarks(selection.pageId, copies, true);
  };
  const copy = (cut = false) => {
    if (!selection || !selectedMarks.length) return;
    clipboard = { marks: selectedMarks.map((m) => ({ ...m })), pageId: selection.pageId, pasted: 0 };
    if (cut) removeMarks(selection.pageId, selectedIds.filter((id) => !selectedMarks.find((m) => m.id === id)?.locked));
  };
  const paste = () => {
    const pageId = pageForNew();
    if (!clipboard || !pageId) return false;
    clipboard.pasted += 1;
    const d = clipboard.pageId === pageId ? OFFSET * clipboard.pasted : 0;
    addMarks(pageId, clipboard.marks.map((m) => roundMark({ ...translate(m, d, d), id: newId(), locked: undefined })), true);
    return true;
  };
  const order = (to: "forward" | "backward" | "front" | "back") => {
    if (!selection) return;
    const ids = new Set(selectedIds);
    updatePage(selection.pageId, (p) => {
      const marks = [...p.marks];
      if (to === "front") return { ...p, marks: [...marks.filter((m) => !ids.has(m.id)), ...marks.filter((m) => ids.has(m.id))] };
      if (to === "back") return { ...p, marks: [...marks.filter((m) => ids.has(m.id)), ...marks.filter((m) => !ids.has(m.id))] };
      if (to === "forward") {
        for (let i = marks.length - 2; i >= 0; i--) if (ids.has(marks[i].id) && !ids.has(marks[i + 1].id)) [marks[i], marks[i + 1]] = [marks[i + 1], marks[i]];
      } else for (let i = 1; i < marks.length; i++) if (ids.has(marks[i].id) && !ids.has(marks[i - 1].id)) [marks[i], marks[i - 1]] = [marks[i - 1], marks[i]];
      return { ...p, marks };
    });
  };
  const deleteSelected = () => {
    if (!selection) return;
    if (typingRef.current && selectedIds.includes(typingRef.current.mark.id)) {
      // Deleting the text being typed: it's dropped (and the cover with it, if it's new).
      const t = typingRef.current;
      setTyping(null);
      if (pageById(t.pageId)?.marks.some((m) => m.id === t.mark.id)) removeMarks(t.pageId, [t.mark.id]);
      setSelection(null);
      return;
    }
    removeMarks(selection.pageId, selectedMarks.filter((m) => !m.locked).map((m) => m.id));
  };
  const selectAll = () => {
    const pageId = pageForNew();
    const page = pageById(pageId);
    if (!page) return;
    setSelection({ pageId: page.id, ids: page.marks.filter((m) => !m.locked).map((m) => m.id) });
  };
  const barActions: BarActions = {
    onPatch: (change) => (typingRef.current && selectedIds.includes(typingRef.current.mark.id) ? patchTyping((m) => change(m) as TextMark) : patchSelected(change)),
    onDuplicate: duplicate,
    onOrder: order,
    onLock: (locked) => patchSelected((m) => ({ ...m, locked: locked || undefined })),
    onDelete: deleteSelected,
  };

  // ---- pictures
  const saveTarget = useSaveTarget();
  const pendingPicture = useRef<{ file: File; aspect: number; pageId: string } | null>(null);
  const placePicture = (pageId: string, src: ImageMark["src"], name: string, aspect: number, url: string) => {
    const page = pageById(pageId);
    const ph = page ? UNITS * sources.aspectOf(page) : UNITS * 1.3;
    let w = 420;
    let h = w * aspect;
    if (h > ph * 0.7) {
      h = ph * 0.7;
      w = h / aspect;
    }
    const [cx, cy] = visibleCentre(pageId, ph);
    setLocalImages((m) => ({ ...m, [`${src.kind}:${src.id}`]: url }));
    addMarks(pageId, [roundMark({ id: newId(), t: "image", x: cx - w / 2, y: cy - h / 2, w, h, src, name })], true);
    setOpt({ tool: "select" });
  };
  const uploader = useFileUploader(undefined, saveTarget, undefined, undefined, (saved) => {
    const p = pendingPicture.current;
    pendingPicture.current = null;
    if (p) placePicture(p.pageId, { kind: "file", id: saved.id }, saved.name, p.aspect, URL.createObjectURL(p.file));
  });
  const picker = useFilePicker({
    filter: IMAGES,
    title: "Add a picture",
    uploadLabel: "Upload",
    onFile: (f, from) => {
      void (async () => {
        const pageId = pageForNew();
        if (!pageId) return;
        let aspect = 0.75;
        try {
          const bmp = await createImageBitmap(f);
          aspect = bmp.height / Math.max(1, bmp.width);
          bmp.close();
        } catch {
          return setError("Couldn't open that picture.");
        }
        if (from) placePicture(pageId, { kind: from.kind, id: from.id }, from.name, aspect, URL.createObjectURL(f));
        else {
          // From this device: saved to your Files first, so the PDF can point at it.
          pendingPicture.current = { file: f, aspect, pageId };
          setBusy("Saving the picture to your Files…");
          const ok = await uploader.uploadAll([f]);
          setBusy(null);
          // Why it failed shows from the uploader (no room, too big…).
          if (!ok) pendingPicture.current = null;
        }
      })();
    },
  });

  // ---- zoom and the page you're on
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // The tool row scrolls sideways on a narrow phone; its edges fade to show there's more.
  const { attach: toolRowRef, style: toolRowFade, hints: toolRowHints } = useRowScroll<HTMLDivElement>();
  const [areaWidth, setAreaWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);
  const [zoom, setZoom] = useState(1);
  const fitWidth = Math.min(Math.max(areaWidth - 32, 200), 980);
  const pageWidth = Math.round(fitWidth * zoom);
  const zoomBy = (dir: 1 | -1) => setZoom((z) => (dir > 0 ? ZOOMS.find((v) => v > z + 0.01) ?? z : [...ZOOMS].reverse().find((v) => v < z - 0.01) ?? z));
  const [current, setCurrent] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [scrollTick, setScrollTick] = useState(0);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTick((t) => t + 1);
    const mid = el.getBoundingClientRect().top + el.clientHeight / 3;
    const found = el.querySelectorAll<HTMLElement>("[data-page]");
    let idx = 0;
    let y = 0;
    found.forEach((p, i) => {
      const r = p.getBoundingClientRect();
      if (r.top <= mid) {
        idx = i;
        y = Math.max(0, ((mid - r.top) / Math.max(1, r.width)) * UNITS);
      }
    });
    setCurrent(idx);
    setCurrentY(Math.round(y / 10) * 10);
  };
  /** Scrolls to page `i`, `y` units down it (a section's start) or its top. */
  const goToPage = (i: number, y?: number) => {
    const area = scrollRef.current;
    const el = area?.querySelectorAll<HTMLElement>("[data-page]")[i];
    if (!area || !el) return;
    const r = el.getBoundingClientRect();
    const k = r.width / UNITS;
    area.scrollTop += r.top - area.getBoundingClientRect().top - 16 + Math.max(0, (y ?? 0) - 8) * k;
  };
  /** The middle of what's showing of a page, in units (where pasted text and pictures go). */
  function visibleCentre(pageId: string, ph: number): [number, number] {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${pageId}"]`);
    const area = scrollRef.current?.getBoundingClientRect();
    if (!el || !area) return [UNITS / 2, ph / 2];
    const r = el.getBoundingClientRect();
    const k = UNITS / r.width;
    const top = Math.max(r.top, area.top);
    const bottom = Math.min(r.bottom, area.bottom);
    const left = Math.max(r.left, area.left);
    const right = Math.min(r.right, area.right);
    if (bottom <= top || right <= left) return [UNITS / 2, ph / 2];
    return [((left + right) / 2 - r.left) * k, ((top + bottom) / 2 - r.top) * k];
  }

  // Ctrl/⌘ + wheel zooms.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(3, Math.max(0.5, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view]);

  // ---- closing (text being typed is kept; what isn't saved yet is saved, see `useLayerSync`)
  const [confirmLeave, setConfirmLeave] = useState(false);
  const close = (force = false) => {
    finishTyping();
    // Offline or failing: ask (a save under way just carries on after it closes).
    if (!force && (sync.offline || sync.error) && sync.dirtyNow()) return setConfirmLeave(true);
    onClose?.();
  };

  // ---- keys
  useEffect(() => {
    if (view !== "read") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || menu || !forThisPane(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const has = selectedMarks.length > 0;
      const page = selPage;
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        redo();
      } else if (!canEdit) {
        if (e.key === "Escape" && onClose) close();
        else if (!mod && (e.key === "+" || e.key === "=")) zoomBy(1);
        else if (!mod && e.key === "-") zoomBy(-1);
      } else if (mod && k === "a") {
        e.preventDefault();
        selectAll();
      } else if (mod && (k === "c" || k === "x") && has) {
        e.preventDefault();
        copy(k === "x");
      } else if (mod && k === "v" && clipboard) {
        e.preventDefault();
        paste();
      } else if (mod && k === "d" && has) {
        e.preventDefault();
        duplicate();
      } else if (mod && (e.code === "BracketRight" || e.code === "BracketLeft") && has) {
        e.preventDefault();
        order(e.code === "BracketRight" ? (e.shiftKey ? "front" : "forward") : e.shiftKey ? "back" : "backward");
      } else if (mod && !e.shiftKey && (k === "b" || k === "i" || k === "u") && selectedMarks.some((m) => m.t === "text")) {
        e.preventDefault();
        const key = k === "b" ? "bold" : k === "i" ? "italic" : "underline";
        const on = !selectedMarks.every((m) => m.t !== "text" || m[key]);
        patchSelected((m) => (m.t === "text" ? { ...m, [key]: on || undefined } : m));
      } else if (mod && e.shiftKey && (e.code === "Period" || e.code === "Comma") && selectedMarks.some((m) => m.t === "text")) {
        e.preventDefault();
        patchSelected((m) => (m.t === "text" ? sizeStep(m, e.code === "Period" ? 1 : -1, page) : m), "size");
      } else if ((e.key === "Delete" || e.key === "Backspace") && has) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "Enter" && selectedMarks.length === 1 && selectedMarks[0].t === "text" && selectedMarks[0].font !== "music" && !selectedMarks[0].locked && selection) {
        e.preventDefault();
        startTyping(selection.pageId, { mark: selectedMarks[0], isNew: false });
      } else if (e.key.startsWith("Arrow") && has) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        patchSelected((m) => (m.locked ? m : translate(m, dx, dy)), "nudge");
      } else if (e.key === "Escape") {
        if (selection) setSelection(null);
        else if (onClose) close();
      } else if (e.key === " " && !mod) {
        // Held: drag the page like the Hand tool.
        e.preventDefault();
        if (!e.repeat) setSpaceHand(true);
      } else if (!mod && !e.altKey) {
        const keyTool: Record<string, Tool> = { v: "select", h: "hand", p: "pen", m: "highlight", e: "eraser", t: "text" };
        const next = keyTool[k];
        if (next) pickTool(next);
        else if (k === "b") {
          // (Not typed into the name box that opens for it.)
          e.preventDefault();
          addSection();
        }
        else if (e.key === "+" || e.key === "=") zoomBy(1);
        else if (e.key === "-") zoomBy(-1);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceHand(false);
    };
    // Pasting plain text (from somewhere else) makes a text box.
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (!canEdit || clipboard || t.closest?.("input, textarea, [contenteditable]") || !forThisPane(e as unknown as KeyboardEvent)) return;
      const text = e.clipboardData?.getData("text/plain")?.trim();
      const pageId = pageForNew();
      const page = pageById(pageId);
      if (!text || !page) return;
      e.preventDefault();
      const ph = UNITS * sources.aspectOf(page);
      const [cx, cy] = visibleCentre(page.id, ph);
      const s = options.text;
      const mark: TextMark = roundMark({ id: newId(), t: "text", x: cx, y: cy, text: text.slice(0, 5000), ...s, w: text.length > 60 ? 500 : undefined });
      addMarks(page.id, [mark], true);
    };
    const onBlur = () => setSpaceHand(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("blur", onBlur);
    };
  });

  // The page grid: Escape goes back to the document (not out of the editor).
  useEffect(() => {
    if (view !== "pages") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || menu || (e.target as HTMLElement).closest("input, textarea, [contenteditable]") || !forThisPane(e)) return;
      setView("read");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, menu, forThisPane]);

  // No page scrolling behind the editor.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---- the selection's toolbar: by the selection, kept inside the document's area
  const [rootWidth, setRootWidth] = useState(1000);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRootWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const docked = rootWidth < 640;
  const [barPos, setBarPos] = useState<{ left: number; top: number } | null>(null);
  const showBar = canEdit && view === "read" && selectedMarks.length > 0 && !gestureActive && !hideMarks;
  const barKey = showBar ? `${selection?.pageId}|${selectedMarks.map((m) => JSON.stringify(aabb(m))).join()}|${pageWidth}|${scrollTick}|${rootWidth}` : "";
  useEffect(() => {
    if (!barKey || docked) return;
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${selection?.pageId}"]`);
      const area = scrollRef.current?.getBoundingClientRect();
      const root = rootRef.current?.getBoundingClientRect();
      const box = unionBox(selectedMarks.map(aabb));
      if (!el || !area || !root || !box) return setBarPos(null);
      const r = el.getBoundingClientRect();
      const k = r.width / UNITS;
      const sel = { left: r.left + box.x * k, top: r.top + box.y * k, right: r.left + (box.x + box.w) * k, bottom: r.top + (box.y + box.h) * k };
      const bw = barRef.current?.offsetWidth ?? 360;
      const bh = barRef.current?.offsetHeight ?? 44;
      const left = Math.max(area.left + 8, Math.min(area.right - bw - 8, (sel.left + sel.right) / 2 - bw / 2));
      // By the selection, but never over what's next to it: just above it (over its turn handle),
      // just below, then further away step by step; the first spot clear of print and of other
      // marks wins. When none is, it waits at the top (or bottom) of the window.
      const page = pageById(selection?.pageId);
      const ids = new Set(selectedIds);
      const others = (page?.marks ?? [])
        .filter((m) => !ids.has(m.id))
        .map((m) => {
          const b = aabb(m);
          return { left: r.left + b.x * k, top: r.top + b.y * k, right: r.left + (b.x + b.w) * k, bottom: r.top + (b.y + b.h) * k };
        });
      const above = sel.top - bh - (typingRef.current ? 12 : 46);
      const below = sel.bottom + 14;
      const fits = (t: number) => t >= area.top + 8 && t + bh <= area.bottom - 8;
      const spots = [0, 1, 2, 3, 4, 5].flatMap((i) => [above - i * 26, below + i * 26]).filter(fits);
      let top = spots.find((t) => !covers(el, { left, top: t - 6, right: left + bw, bottom: t + bh + 6 }, others));
      if (top === undefined) top = sel.top - area.top > bh + 24 ? area.top + 8 : area.bottom - bh - 8;
      const next = { left: Math.round(left - root.left), top: Math.round(top - root.top) };
      setBarPos((p) => (p && p.left === next.left && p.top === next.top ? p : next));
    });
    return () => cancelAnimationFrame(raf);
  });

  // ---- the outline (sections) and pages panel
  const outlineStored = useSyncExternalStore(subscribeOutline, readOutlinePref, () => null);
  const wide = rootWidth >= 768;
  // Open when you last left it open on this device (at first: on wide screens).
  const outlineOpen = view === "read" && (outlineStored ?? (wide ? "1" : "0")) === "1";
  const setOutlineOpen = (open: boolean) => writeOutlinePref(open ? "1" : "0");
  const [outlineTab, setOutlineTab] = useState<OutlineTab>("outline");
  const [renaming, setRenaming] = useState<string | null>(null);
  const pdfOutline = usePdfOutline(doc);
  const addSection = (index = current) => {
    const page = pages[index];
    if (!page || !canEdit) return;
    // Where the window's top is on that page (its top when you can see the top of it, or it's
    // another page).
    let y = 0;
    const el = scrollRef.current?.querySelectorAll<HTMLElement>("[data-page]")[index];
    const area = scrollRef.current?.getBoundingClientRect();
    if (el && area && index === current) {
      const r = el.getBoundingClientRect();
      const down = ((area.top - r.top) / Math.max(1, r.width)) * UNITS;
      if (down > 60) y = Math.round(down / 10) * 10;
    }
    const id = newId();
    const n = sectionsOf(layer!).length + 1;
    void headingNear(sources.docFor(page), page.src.kind === "pdf" ? page.src.page : null, page.rotate, y).then((heading) => {
      updatePage(page.id, (p) => ({ ...p, bookmarks: [...(p.bookmarks ?? []), { id, title: heading ?? `Section ${n}`, ...(y ? { y } : {}) }] }));
      setOutlineOpen(true);
      setOutlineTab("outline");
      setRenaming(id);
    });
  };
  const patchBookmark = (pageId: string, id: string, change: (b: NonNullable<LayerPage["bookmarks"]>[number]) => NonNullable<LayerPage["bookmarks"]>[number] | null) =>
    updatePage(pageId, (p) => {
      const list = (p.bookmarks ?? []).flatMap((b) => {
        if (b.id !== id) return [b];
        const next = change(b);
        return next ? [next] : [];
      });
      const { bookmarks: _drop, ...rest } = p;
      void _drop;
      return list.length ? { ...rest, bookmarks: list } : rest;
    });
  const outlineActions: OutlineActions = {
    onJump: (i, y) => {
      if (!wide) setOutlineOpen(false);
      requestAnimationFrame(() => goToPage(i, y));
    },
    onAdd: addSection,
    onRename: (pageId, id, title) => patchBookmark(pageId, id, (b) => (b.title === title ? b : { ...b, title })),
    onRemove: (pageId, id) => patchBookmark(pageId, id, () => null),
    onSub: (pageId, id, sub) => patchBookmark(pageId, id, (b) => ({ ...b, sub: sub || undefined })),
    onUsePdfOutline: () => {
      if (!pdfOutline?.length) return;
      commit((l) => {
        const pagesNext = l.pages.map((p) => ({ ...p }));
        for (const it of pdfOutline) {
          const idx = it.page === null ? -1 : pagesNext.findIndex((p) => p.src.kind === "pdf" && !p.src.file && p.src.page === it.page);
          if (idx < 0) continue;
          const p = pagesNext[idx];
          if (p.bookmarks?.some((b) => b.title === it.title)) continue;
          p.bookmarks = [...(p.bookmarks ?? []), { id: newId(), title: it.title.slice(0, 120), ...(it.y ? { y: it.y } : {}), ...(it.depth > 0 ? { sub: true } : {}) }];
        }
        return { ...l, pages: pagesNext };
      });
      setOutlineTab("outline");
    },
    onPages: (change) => commit((l) => ({ ...l, pages: change(l.pages) })),
    onEditPages: () => {
      finishTyping();
      setSelection(null);
      setView("pages");
    },
    onClose: () => setOutlineOpen(false),
  };

  // ---- downloads
  const download = async (withMarks: boolean) => {
    setMenu(null);
    if (!withMarks || !layer || !bytesRef.current) {
      void downloadFile(file.url, file.name);
      return;
    }
    setBusy("Making your PDF…");
    try {
      const extra: Record<string, ArrayBuffer> = {};
      for (const [id, o] of Object.entries(others)) if (o !== "error") extra[id] = o.bytes;
      // Pictures, drawn from their files (fetched, so the drawing isn't blocked as another site's).
      const pics = new Map<string, CanvasImageSource>();
      const keys = [...new Set(layer.pages.flatMap((p) => p.marks.flatMap((m) => (m.t === "image" ? [imageKey(m)] : []))))];
      await Promise.all(
        keys.map(async (key) => {
          const url = images[key];
          if (!url) return;
          try {
            const res = await fetch(url);
            pics.set(key, await createImageBitmap(await res.blob()));
          } catch {
            // Left out of the download.
          }
        }),
      );
      const bytes = await exportPdf(bytesRef.current, layer, extra, pics);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, "") + " (marked).pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(errorText(e, "Couldn't make the PDF."));
    }
    setBusy(null);
  };

  const marked = layer && doc ? !isEmptyLayer(layer, doc.numPages) : false;
  const tools = canEdit && view === "read";

  const openMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      x: rect.right - 240,
      y: rect.bottom + 4,
      width: 240,
      items: [
        { label: "Download", icon: <DownloadIcon className="h-4 w-4" />, onSelect: () => void download(false) },
        ...(marked ? [{ label: "Download with markings", icon: <DownloadIcon className="h-4 w-4" />, onSelect: () => void download(true) }] : []),
        ...(canEdit
          ? [
              { label: hideMarks ? "Show markings" : "Hide markings", icon: hideMarks ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />, divider: true, onSelect: () => setHideMarks((v) => !v) },
              { label: "Clear all markings…", icon: <TrashIcon className="h-4 w-4" />, danger: true, onSelect: () => setConfirmClear(true) },
            ]
          : []),
        // The Files page's "Move to folder…" and "Tags…".
        ...(extraMenu ?? []),
      ],
    });
  };

  const editingFor = (p: LayerPage): PageEditing | undefined =>
    tools && !hideMarks
      ? {
          options: { ...options, tool },
          selected: selection?.pageId === p.id ? selectedIds : [],
          onSelect: (ids) => setSelection(ids.length ? { pageId: p.id, ids } : null),
          onChange: (marks) => changeMarks(p.id, marks),
          onAdd: (marks, select) => addMarks(p.id, marks, select),
          onRemove: (ids) => removeMarks(p.id, ids),
          onType: (t) => startTyping(p.id, t),
          typing,
          onTypingText: (text) => patchTyping((m) => ({ ...m, text })),
          onTypingToggle: (k) => patchTyping((m) => ({ ...m, [k]: !m[k] || undefined })),
          onTypingSize: (dir) => patchTyping((m) => sizeStep(m, dir, p)),
          onTypingDone: finishTyping,
          onStamped: () => setOpt({ stamp: { ...options.stamp, text: nextStampText(options.stamp.text, options.stamp.next) } }),
          onGesture: setGestureActive,
          onNoText: () => setNotice(NO_TEXT),
          penOnly,
          onPen: () => setPenOnly(true),
          scrollBy: (dx, dy) => scrollRef.current?.scrollBy(dx, dy),
          textStyleChosen: options.text !== DEFAULT_TEXT,
        }
      : undefined;

  const status = !signedInOwner
    ? isAuthenticated || !target
      ? "View only"
      : "Sign in to mark it up"
    : newer
      ? "Made with a newer soniroll: reload the page to edit"
      : unsaved && sync.offline
        ? "Offline: saves when you're back online"
        : unsaved && sync.error
          ? `Couldn't save: ${sync.error.replace(/\.$/, "")}. Trying again…`
          : unsaved
            ? "Saving…"
            : history
              ? "Saved"
              : "Markings are saved with this file";

  // Page and zoom (on a phone the selection's toolbar takes their place).
  const pagePills = view === "read" && layer && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {showBar && docked ? (
            <div className="mx-auto flex max-w-full justify-center">
              <ObjectBar marks={selectedMarks} ptPerUnit={ptPerUnit(selPage)} actions={barActions} docked />
            </div>
          ) : (
            <>
              <span className="pointer-events-auto rounded-full bg-surface/95 px-3 py-1.5 text-xs font-medium tabular-nums shadow-md ring-1 ring-foreground/10">
                {Math.min(current + 1, pages.length)} / {pages.length}
              </span>
              <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-surface/95 p-1 shadow-md ring-1 ring-foreground/10">
                <IconBtn label="Zoom out" icon={ZoomOutIcon} onClick={() => zoomBy(-1)} />
                <button type="button" onClick={() => setZoom(1)} className="h-8 min-w-12 rounded-full px-1 text-xs font-medium tabular-nums hover:bg-surface-hover" title="Fit the width">
                  {Math.round(zoom * 100)}%
                </button>
                <IconBtn label="Zoom in" icon={ZoomInIcon} onClick={() => zoomBy(1)} />
              </div>
            </>
          )}
        </div>
      );

  const body = (
    <div
      ref={rootRef}
      className={`${embedded ? "relative min-h-0 flex-1" : `${paneEl ? "absolute z-[21]" : "fixed z-[70]"} inset-0`} flex flex-col bg-background text-foreground`}
      role={embedded ? "region" : "dialog"}
      aria-label={file.name}
    >
      {/* Top bar */}
      <div className={`flex shrink-0 items-center gap-1 border-b border-foreground/10 bg-surface px-2 py-2 sm:gap-2 sm:px-3 ${embedded ? "" : "pt-[calc(env(safe-area-inset-top)+0.5rem)]"}`}>
        {onClose && (
          <button type="button" onClick={() => close()} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-foreground/[0.05] pl-2 pr-3 text-sm font-medium hover:bg-surface-hover">
            <ChevronLeftIcon className="h-4 w-4" /> Done
          </button>
        )}
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate text-sm font-semibold">{file.name}</h2>
          <p className="truncate text-xs text-muted">{status}</p>
        </div>
        <IconBtn label="Outline and pages" icon={ListIcon} onClick={() => setOutlineOpen(!outlineOpen)} active={outlineOpen} disabled={!layer || view !== "read"} />
        {canEdit && (
          <>
            <IconBtn label="Undo (Ctrl+Z)" icon={UndoIcon} onClick={undo} disabled={!history?.past.length} />
            <IconBtn label="Redo (Ctrl+Shift+Z)" icon={RedoIcon} onClick={redo} disabled={!history?.future.length} />
            <IconBtn
              label="Pages"
              icon={PagesIcon}
              onClick={() => {
                finishTyping();
                setSelection(null);
                setView(view === "pages" ? "read" : "pages");
              }}
              active={view === "pages"}
              disabled={!layer}
            />
          </>
        )}
        <button
          type="button"
          onClick={() => {
            finishTyping();
            setView("perform");
          }}
          disabled={!layer}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          title="Play from it: full screen, turn pages with the arrow keys, space or a page-turner pedal"
        >
          <PlayIcon className="h-4 w-4" /> <span className="hidden sm:inline">Play</span>
        </button>
        <IconBtn label="More" icon={DotsVerticalIcon} onClick={openMenu} />
      </div>

      {/* Tools */}
      {tools && (
        <div className="relative shrink-0 border-b border-foreground/10 bg-surface">
          {toolRowHints}
          <div ref={toolRowRef} style={toolRowFade} className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 [scrollbar-width:none] sm:justify-center sm:gap-1">
            <ToolBtn label="Select, move and resize (V)" icon={CursorIcon} active={tool === "select"} onClick={() => pickTool("select")} />
            <ToolBtn label="Drag the page (H, or hold Space)" icon={HandIcon} active={tool === "hand"} onClick={() => pickTool("hand")} />
            <ToolBtn label="Pen (P)" icon={PencilIcon} active={tool === "pen"} onClick={() => pickTool("pen")} />
            <ToolBtn label="Highlighter (M)" icon={HighlighterIcon} active={tool === "highlight"} onClick={() => pickTool("highlight")} />
            <ToolBtn label="Eraser (E)" icon={EraserIcon} active={tool === "eraser"} onClick={() => pickTool("eraser")} />
            <ToolBtn label="Text: click to type, or drag a box for text that wraps (T)" icon={TextIcon} active={tool === "text"} onClick={() => pickTool("text")} />
            <ToolBtn
              label="Edit the PDF's text: click a line to retype it. It's covered and typed over — the original words stay in the file underneath (hidden, but a download can still be searched or copied for them). A scanned page has no text: use Cover in Shapes, then Text"
              icon={EditTextIcon}
              active={tool === "edittext"}
              onClick={() => pickTool("edittext")}
            />
            <Pop
              label="Music symbols and stamps"
              trigger={
                <span className={`${toolCls(tool === "stamp")} w-auto min-w-9 gap-1 px-2 sm:w-auto sm:px-2.5 pointer-coarse:w-auto pointer-coarse:min-w-11`}>
                  <FitGlyph text={"\uE4C0"} family={fontFamily("music")} max={20} />
                  <span className="hidden text-xs font-medium sm:inline">{tool === "stamp" ? options.stamp.label : "Symbols"}</span>
                </span>
              }
            >
              {(closePop) => (
                <div className="flex w-[19rem] max-w-[calc(100vw-2rem)] flex-col gap-3">
                  {SYMBOLS.map((g) => (
                    <div key={g.group}>
                      <p className="mb-1 text-xs font-semibold text-muted">{g.group}</p>
                      <div className="grid grid-cols-6 gap-1">
                        {g.items.map((s) => (
                          <button
                            key={s.label}
                            type="button"
                            title={s.label}
                            aria-label={s.label}
                            onClick={() => {
                              pickTool("stamp");
                              setOpt({ tool: "stamp", stamp: s });
                              closePop();
                            }}
                            className={`flex h-11 items-center justify-center rounded-md hover:bg-surface-hover ${tool === "stamp" && options.stamp.label === s.label ? "bg-accent/15 text-accent" : "bg-foreground/[0.04]"}`}
                          >
                            {s.font === "music" ? (
                              <FitGlyph text={s.text} family={fontFamily(s.font)} max={28} />
                            ) : (
                              <span className="text-xs" style={{ fontFamily: fontFamily(s.font) }}>
                                {s.text}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted">Rehearsal and bars</p>
                    <div className="grid grid-cols-2 gap-1">
                      {STAMPS.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => {
                            pickTool("stamp");
                            setOpt({ tool: "stamp", stamp: s });
                            closePop();
                          }}
                          className={`flex h-10 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-surface-hover ${tool === "stamp" && options.stamp.label === s.label ? "bg-accent/15 text-accent" : "bg-foreground/[0.04]"}`}
                        >
                          <span className={`flex h-6 min-w-6 items-center justify-center text-sm font-bold ${s.frame === "box" ? "border-2 border-current px-1" : s.frame === "circle" ? "rounded-full border-2 border-current" : ""}`}>{s.text}</span>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {tool === "stamp" && options.stamp.next && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                        Next one
                        <input
                          value={options.stamp.text}
                          onChange={(e) => setOpt({ stamp: { ...options.stamp, text: e.target.value.slice(0, 4) || (options.stamp.next === "letter" ? "A" : "1") } })}
                          className="h-8 w-16 rounded-md bg-foreground/[0.05] px-2 text-sm text-foreground"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </Pop>
            <Pop label="Shapes" trigger={<span className={toolCls(tool === "shape")}><ShapesIcon className="h-5 w-5" /></span>}>
              {(closePop) => (
                <div className="grid w-56 grid-cols-2 gap-1">
                  {SHAPES.map((s) => (
                    <button
                      key={s.shape}
                      type="button"
                      title={s.shape === "cover" ? "A box the colour of the paper, to hide what's under it" : undefined}
                      onClick={() => {
                        pickTool("shape");
                        setOpt({ tool: "shape", shape: s.shape });
                        closePop();
                      }}
                      className={`h-9 rounded-md px-2 text-left text-sm hover:bg-surface-hover ${s.shape === "cover" ? "col-span-2" : ""} ${tool === "shape" && options.shape === s.shape ? "bg-accent/15 text-accent" : "bg-foreground/[0.04]"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </Pop>
            <ToolBtn
              label="Add a picture from your Files"
              icon={ImageIcon}
              onClick={() => {
                finishTyping();
                picker.open();
              }}
            />
            <span className="mx-0.5 h-6 w-px shrink-0 bg-foreground/10 sm:mx-1" />
            <Pop
              label="Pen colour and width"
              trigger={
                <span className={`${toolCls(false)} w-auto gap-1.5 px-2 sm:w-auto`}>
                  <span className="h-5 w-5 rounded-full ring-2 ring-foreground/15" style={{ background: tool === "highlight" ? options.highlight : options.ink }} />
                  <span className="hidden text-xs font-medium sm:inline">{WIDTHS.find((w) => w.width === options.inkWidth)?.label}</span>
                </span>
              }
            >
              {() => (
                <div className="flex w-60 flex-col gap-3">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted">Ink</p>
                    <div className="flex flex-wrap gap-1.5">
                      {INKS.map((c) => (
                        <Swatch key={c.color} name={c.name} color={c.color} on={options.ink === c.color} onClick={() => setOpt({ ink: c.color })} />
                      ))}
                      <CustomColour color={options.ink} on={!INKS.some((c) => c.color === options.ink)} onPick={(c) => setOpt({ ink: c })} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted">Highlighter</p>
                    <div className="flex flex-wrap gap-1.5">
                      {HIGHLIGHTS.map((c) => (
                        <Swatch key={c.color} name={c.name} color={c.color} on={options.highlight === c.color} onClick={() => setOpt({ highlight: c.color })} />
                      ))}
                      <CustomColour color={options.highlight} on={!HIGHLIGHTS.some((c) => c.color === options.highlight)} onPick={(c) => setOpt({ highlight: c })} label="Custom highlighter colour" />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted">Line</p>
                    <div className="flex gap-1">
                      {WIDTHS.map((w) => (
                        <button key={w.label} type="button" onClick={() => setOpt({ inkWidth: w.width })} className={`h-8 flex-1 rounded-md text-xs ${options.inkWidth === w.width ? "bg-accent/15 font-medium text-accent" : "bg-foreground/[0.04] hover:bg-surface-hover"}`}>
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted">Text, shapes and symbols: select one to change its colour, size and more.</p>
                </div>
              )}
            </Pop>
          </div>
        </div>
      )}

      {/* Pages */}
      {view === "pages" && layer && doc ? (
        <PdfPages
          sources={sources}
          fileId={file.id ?? ""}
          layer={layer}
          images={images}
          onChange={(next) => commit(() => next)}
          onOpen={(i) => {
            setView("read");
            requestAnimationFrame(() => requestAnimationFrame(() => goToPage(i)));
          }}
        />
      ) : (
        <div className="relative flex min-h-0 flex-1">
        {outlineOpen && layer && wide && (
          <PdfOutline layer={layer} sources={sources} images={images} canEdit={canEdit} current={current} currentY={currentY} pdfOutline={pdfOutline} mode="side" tab={outlineTab} onTab={setOutlineTab} renaming={renaming} onRenaming={setRenaming} actions={outlineActions} />
        )}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto">
          {loadError ? (
            <p className="p-10 text-center text-sm text-muted">{loadError}</p>
          ) : !layer ? (
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner label="Opening the PDF" />
            </div>
          ) : (
            <div
              className="mx-auto flex w-max min-w-full flex-col items-center gap-4 px-4 py-4 pb-24"
              onPointerDown={(e) => {
                // A click in the grey around the pages: done typing, nothing selected.
                if (e.target !== e.currentTarget) return;
                finishTyping();
                setSelection(null);
              }}
            >
              {pages.map((p) => (
                <PdfPageView key={p.id} doc={sources.docFor(p)} page={p} aspect={sources.aspectOf(p)} width={pageWidth} hideMarks={hideMarks} images={images} editing={editingFor(p)} />
              ))}
            </div>
          )}
        </div>
        {pagePills}
        </div>
        </div>
      )}

      {/* The selection's toolbar */}
      {showBar && !docked && (
        <div ref={barRef} className="pointer-events-none absolute z-[6]" style={barPos ? { left: barPos.left, top: barPos.top } : { left: -9999, top: 0 }}>
          <ObjectBar marks={selectedMarks} ptPerUnit={ptPerUnit(selPage)} actions={barActions} docked={false} style={{ position: "relative" }} />
        </div>
      )}

      {outlineOpen && layer && !wide && (
        <div className="absolute inset-0 z-[8] flex flex-col justify-end bg-overlay" onPointerDown={(e) => e.target === e.currentTarget && setOutlineOpen(false)}>
          <div className="h-[78%] overflow-hidden rounded-t-2xl shadow-[0_-8px_30px_rgb(0_0_0/0.2)] ring-1 ring-foreground/10">
            <PdfOutline layer={layer} sources={sources} images={images} canEdit={canEdit} current={current} currentY={currentY} pdfOutline={pdfOutline} mode="sheet" tab={outlineTab} onTab={setOutlineTab} renaming={renaming} onRenaming={setRenaming} actions={outlineActions} />
          </div>
        </div>
      )}

      {view === "perform" && layer && (
        <PdfPerform
          sources={sources}
          layer={layer}
          start={current}
          hideMarks={hideMarks}
          images={images}
          onExit={(i) => {
            setView("read");
            requestAnimationFrame(() => requestAnimationFrame(() => goToPage(i)));
          }}
        />
      )}

      {notice && (
        <div className="absolute inset-x-0 top-28 z-10 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-start gap-3 rounded-2xl bg-surface px-4 py-3 text-sm shadow-lg ring-1 ring-foreground/10">
          <span>{notice}</span>
          <div className="flex shrink-0 gap-1">
            {notice === NO_TEXT && (
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => {
                  setNotice(null);
                  pickTool("shape");
                  setOpt({ tool: "shape", shape: "cover" });
                }}
                className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
              >
                Use Cover
              </button>
            )}
            <button type="button" onClick={() => setNotice(null)} className="rounded-full px-2 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground">
              OK
            </button>
          </div>
        </div>
      )}
      {(busy || error || uploader.error) && (
        <div className="absolute inset-x-0 top-20 z-10 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm shadow-lg ring-1 ring-foreground/10">
          {busy ? <LoadingSpinner size="sm" inline label={busy} /> : null}
          <span className={error || uploader.error ? "text-danger" : ""}>{busy ?? error ?? uploader.error}</span>
          {(error || uploader.error) && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                uploader.clearError();
              }}
              className="ml-1 text-muted hover:text-foreground"
            >
              OK
            </button>
          )}
        </div>
      )}
      {picker.elements}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {confirmLeave && (
        <ConfirmDialog
          title="Leave without saving?"
          message={sync.offline ? "You're offline, so your latest markings aren't saved yet. They're kept on this device and saved next time you open this PDF here." : "Your latest markings couldn't be saved yet. They're kept on this device and saved next time you open this PDF here."}
          confirmLabel="Leave"
          onConfirm={() => {
            setConfirmLeave(false);
            close(true);
          }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
      {sync.askLeave && (
        <ConfirmDialog
          title="Leave without saving?"
          message="Your latest markings aren't saved yet. They're kept on this device and saved next time you open this PDF here."
          confirmLabel="Leave"
          onConfirm={() => sync.answerLeave(true)}
          onCancel={() => sync.answerLeave(false)}
        />
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Clear all markings?"
          message="Every marking on every page goes. Your page order and added pages stay. You can undo this until you close the PDF."
          confirmLabel="Clear"
          onConfirm={() => {
            setConfirmClear(false);
            setTyping(null);
            setSelection(null);
            commit((l) => ({ ...l, pages: l.pages.map((p) => (p.marks.length ? { ...p, marks: [] } : p)) }));
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
  return embedded ? body : createPortal(body, paneEl ?? document.body);
}

/** The layer with the text being typed in it (as it'll be once typing finishes), for saving. */
function withTyping(layer: Layer, t: Typing): Layer {
  const text = t.mark.text.replace(/\s+$/, "");
  return {
    ...layer,
    pages: layer.pages.map((p) => {
      if (p.id !== t.pageId) return p;
      const mark = roundMark({ ...t.mark, text });
      if (p.marks.some((m) => m.id === mark.id)) return { ...p, marks: text ? p.marks.map((m) => (m.id === mark.id ? mark : m)) : p.marks.filter((m) => m.id !== mark.id) };
      const added = [...(t.cover && !p.marks.some((m) => m.id === t.cover!.id) ? [t.cover] : []), ...(text ? [mark] : [])];
      return added.length ? { ...p, marks: [...p.marks, ...added] } : p;
    }),
  };
}

/** What changed from one layer to the next, as a selection: the marks on one page that are new or
    different in `to` (the page with the most of them). Undo and redo select them. */
function changedMarks(from: Layer, to: Layer): { pageId: string; ids: string[] } | null {
  let best: { pageId: string; ids: string[] } | null = null;
  for (const p of to.pages) {
    const was = from.pages.find((q) => q.id === p.id);
    if (!was || was.marks === p.marks) continue;
    const before = new Map(was.marks.map((m) => [m.id, m]));
    const ids = p.marks.filter((m) => {
      const b = before.get(m.id);
      return !b || (b !== m && JSON.stringify(b) !== JSON.stringify(m));
    }).map((m) => m.id);
    if (ids.length && (!best || ids.length > best.ids.length)) best = { pageId: p.id, ids };
  }
  return best;
}

// The outline panel's open/closed state, per device.
const OUTLINE_KEY = "jam-practice-pdf-outline";
const outlineListeners = new Set<() => void>();
function subscribeOutline(fn: () => void) {
  outlineListeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    outlineListeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}
let outlineMemory: string | null = null;
function readOutlinePref(): string | null {
  try {
    return localStorage.getItem(OUTLINE_KEY) ?? outlineMemory;
  } catch {
    return outlineMemory;
  }
}
function writeOutlinePref(v: string) {
  outlineMemory = v;
  try {
    localStorage.setItem(OUTLINE_KEY, v);
  } catch {
    // Not remembered after a reload; it still opens and closes.
  }
  for (const fn of outlineListeners) fn();
}
