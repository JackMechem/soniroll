"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useEdgeFade } from "@/components/library/ui";
import PdfPageView, { type Tool, type ToolOptions } from "@/components/pdf/PdfPageView";
import PdfPages from "@/components/pdf/PdfPages";
import PdfPerform from "@/components/pdf/PdfPerform";
import { exportPdf } from "@/components/pdf/exportPdf";
import { HIGHLIGHTS, INKS, SHAPES, STAMPS, SYMBOLS, isEmptyLayer, nextStampText, pageAspect, parseLayer, type Layer, type LayerPage, type Mark, type TextMark } from "@/components/pdf/markup";
import { fontFamily } from "@/components/pdf/marksRender";
import {
  ChevronLeftIcon,
  CursorIcon,
  DotsVerticalIcon,
  DownloadIcon,
  EraserIcon,
  EyeIcon,
  EyeOffIcon,
  HandIcon,
  HighlighterIcon,
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
import { downloadFile, errorText } from "@/lib/files";
import { usePdfDoc, usePdfDocs, type PdfSources } from "@/components/pdf/usePdfDoc";
import { useDeviceUrls } from "@/lib/deviceFiles";
import type { PDFDocumentProxy } from "@/lib/pdfjs";

export type PdfFile = {
  /** A `files` row of the signed-in user's: markings are saved to it. Without one (a shared file,
      a note's embed) the PDF opens to read only. */
  id?: string | null;
  name: string;
  url: string;
};

type History = { layer: Layer; past: Layer[]; future: Layer[] };

const DEFAULT_OPTIONS: ToolOptions = {
  tool: "hand",
  ink: INKS[1].color,
  inkWidth: 3,
  highlight: HIGHLIGHTS[0].color,
  stamp: STAMPS[0],
  shape: "line",
  textFont: "sans",
  textBoxed: false,
  textSize: 22,
};

const WIDTHS = [
  { label: "Fine", width: 1.5 },
  { label: "Medium", width: 3 },
  { label: "Bold", width: 6 },
];

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

/**
 * The PDF viewer and editor: every page in one scrolling column, zoom, and — on your own files —
 * markings drawn over the pages (pen, highlighter, text, music symbols, rehearsal letters and bar
 * numbers, shapes), page editing (order, rotation, deleting, blank and staff pages), page turning
 * for playing from it, and a download with the markings baked in. The markings are a layer saved
 * with the file (`pdfMarkups`); the PDF itself is never changed.
 */
export default function PdfEditor({ file, onClose }: { file: PdfFile; onClose: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const fileId = file.id ? (file.id as Id<"files">) : null;
  const canEdit = !!fileId && isAuthenticated;

  // ---- the PDF itself
  const { doc, aspects, error: loadError, bytesRef } = usePdfDoc(file.url);

  // ---- the markings
  const saved = useQuery(api.pdfMarkups.get, canEdit && fileId ? { fileId } : "skip");
  const savedReady = !canEdit || saved !== undefined;
  const base = useMemo(() => (doc && savedReady ? parseLayer(saved?.data, doc.numPages) : null), [doc, savedReady, saved?.data]);
  const [history, setHistory] = useState<History | null>(null);
  const layer = history?.layer ?? base;

  const commit = useCallback(
    (change: (l: Layer) => Layer) => {
      setHistory((h) => {
        const current = h?.layer ?? base;
        if (!current) return h;
        const next = change(current);
        if (next === current) return h;
        return { layer: next, past: [...(h?.past ?? []), current].slice(-100), future: [] };
      });
    },
    [base],
  );
  const undo = () => setHistory((h) => (h && h.past.length ? { layer: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.layer, ...h.future] } : h));
  const redo = () => setHistory((h) => (h && h.future.length ? { layer: h.future[0], past: [...h.past, h.layer], future: h.future.slice(1) } : h));

  // Pages inserted from your other PDFs: their files' addresses, then the PDFs themselves.
  const otherIds = useMemo(() => [...new Set((layer?.pages ?? []).flatMap((p) => (p.src.kind === "pdf" && p.src.file ? [p.src.file] : [])))], [layer]);
  const myFiles = useDeviceUrls(useQuery(api.files.list, canEdit && otherIds.length ? {} : "skip"));
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

  const updatePage = useCallback((pageId: string, change: (p: LayerPage) => LayerPage) => commit((l) => ({ ...l, pages: l.pages.map((p) => (p.id === pageId ? change(p) : p)) })), [commit]);

  // ---- saving (a second after the last change)
  const save = useMutation(api.pdfMarkups.save);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const pending = useRef<string | null>(null);
  const editedLayer = history?.layer;
  useEffect(() => {
    if (!editedLayer || !fileId || !canEdit) return;
    const data = JSON.stringify(editedLayer);
    pending.current = data;
    const t = setTimeout(() => {
      setSaveState("saving");
      save({ fileId, data })
        .then(() => {
          if (pending.current === data) pending.current = null;
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 1000);
    return () => clearTimeout(t);
  }, [editedLayer, fileId, canEdit, save]);
  const close = () => {
    if (pending.current && fileId) void save({ fileId, data: pending.current });
    onClose();
  };

  // ---- tools
  const [options, setOptions] = useState<ToolOptions>(DEFAULT_OPTIONS);
  const setOpt = (patch: Partial<ToolOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const [selected, setSelected] = useState<{ pageId: string; id: string } | null>(null);
  const [typing, setTyping] = useState<{ pageId: string; mark: TextMark } | null>(null);
  const [penOnly, setPenOnly] = useState(false);
  const [hideMarks, setHideMarks] = useState(false);
  const [view, setView] = useState<"read" | "pages" | "perform">("read");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedMark = selected && layer ? layer.pages.find((p) => p.id === selected.pageId)?.marks.find((m) => m.id === selected.id) ?? null : null;
  const removeSelected = () => {
    if (!selected) return;
    updatePage(selected.pageId, (p) => ({ ...p, marks: p.marks.filter((m) => m.id !== selected.id) }));
    setSelected(null);
  };
  const changeSelected = (change: (m: Mark) => Mark) => selected && updatePage(selected.pageId, (p) => ({ ...p, marks: p.marks.map((m) => (m.id === selected.id ? change(m) : m)) }));

  const pickTool = (tool: Tool) => {
    setOpt({ tool });
    if (tool !== "select") setSelected(null);
  };

  // ---- zoom and the page you're on
  const scrollRef = useRef<HTMLDivElement>(null);
  // The tool row scrolls sideways on a narrow phone; its edges fade to show there's more.
  const { attach: toolRowRef, style: toolRowFade } = useEdgeFade<HTMLDivElement>();
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
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const mid = el.getBoundingClientRect().top + el.clientHeight / 3;
    const pages = el.querySelectorAll<HTMLElement>("[data-page]");
    let idx = 0;
    pages.forEach((p, i) => {
      if (p.getBoundingClientRect().top <= mid) idx = i;
    });
    setCurrent(idx);
  };
  const goToPage = (i: number) => {
    const el = scrollRef.current?.querySelectorAll<HTMLElement>("[data-page]")[i];
    el?.scrollIntoView({ block: "start" });
  };

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

  // ---- keys
  useEffect(() => {
    if (view !== "read") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]") || menu) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        if (selected) setSelected(null);
        else close();
      } else if (!mod && canEdit) {
        const keyTool: Record<string, Tool> = { v: "select", h: "hand", p: "pen", m: "highlight", e: "eraser", t: "text" };
        const tool = keyTool[e.key.toLowerCase()];
        if (tool) pickTool(tool);
        else if (e.key === "+" || e.key === "=") zoomBy(1);
        else if (e.key === "-") zoomBy(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // No page scrolling behind the editor.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
      const bytes = await exportPdf(bytesRef.current, layer, extra);
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

  const pages = layer?.pages ?? [];
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
      ],
    });
  };

  const body = (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground" role="dialog" aria-label={file.name}>
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-foreground/10 bg-surface px-2 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:gap-2 sm:px-3">
        <button type="button" onClick={close} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-foreground/[0.05] pl-2 pr-3 text-sm font-medium hover:bg-surface-hover">
          <ChevronLeftIcon className="h-4 w-4" /> Done
        </button>
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate text-sm font-semibold">{file.name}</h2>
          <p className="truncate text-xs text-muted">
            {!canEdit ? (isAuthenticated || !fileId ? "View only" : "Sign in to mark it up") : saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save — it'll try again" : history ? "Saved" : "Markings are saved with this file"}
          </p>
        </div>
        {canEdit && (
          <>
            <IconBtn label="Undo (Ctrl+Z)" icon={UndoIcon} onClick={undo} disabled={!history?.past.length} />
            <IconBtn label="Redo (Ctrl+Shift+Z)" icon={RedoIcon} onClick={redo} disabled={!history?.future.length} />
            <IconBtn label="Pages" icon={PagesIcon} onClick={() => setView(view === "pages" ? "read" : "pages")} active={view === "pages"} disabled={!layer} />
          </>
        )}
        <button
          type="button"
          onClick={() => setView("perform")}
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
        <div className="shrink-0 border-b border-foreground/10 bg-surface">
        <div ref={toolRowRef} style={toolRowFade} className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 [scrollbar-width:none] sm:justify-center sm:gap-1">
          <ToolBtn label="Scroll (H)" icon={HandIcon} active={options.tool === "hand"} onClick={() => pickTool("hand")} />
          <ToolBtn label="Select and move (V)" icon={CursorIcon} active={options.tool === "select"} onClick={() => pickTool("select")} />
          <ToolBtn label="Pen (P)" icon={PencilIcon} active={options.tool === "pen"} onClick={() => pickTool("pen")} />
          <ToolBtn label="Highlighter (M)" icon={HighlighterIcon} active={options.tool === "highlight"} onClick={() => pickTool("highlight")} />
          <ToolBtn label="Eraser (E)" icon={EraserIcon} active={options.tool === "eraser"} onClick={() => pickTool("eraser")} />
          <ToolBtn label="Text (T)" icon={TextIcon} active={options.tool === "text"} onClick={() => pickTool("text")} />
          <Pop
            label="Music symbols and stamps"
            trigger={
              <span className={`${toolCls(options.tool === "stamp")} w-auto gap-1 px-2 sm:w-auto sm:px-2.5`}>
                <span className="text-xl leading-none" style={{ fontFamily: fontFamily("music") }}>
                  {""}
                </span>
                <span className="hidden text-xs font-medium sm:inline">{options.tool === "stamp" ? options.stamp.label : "Symbols"}</span>
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
                            setOpt({ tool: "stamp", stamp: s });
                            closePop();
                          }}
                          className={`flex h-11 items-center justify-center rounded-md hover:bg-surface-hover ${options.tool === "stamp" && options.stamp.label === s.label ? "bg-accent/15 text-accent" : "bg-foreground/[0.04]"}`}
                        >
                          <span className={s.font === "music" ? "text-2xl leading-none" : "text-xs"} style={{ fontFamily: fontFamily(s.font) }}>
                            {s.text}
                          </span>
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
                          setOpt({ tool: "stamp", stamp: s });
                          closePop();
                        }}
                        className={`flex h-10 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-surface-hover ${options.tool === "stamp" && options.stamp.label === s.label ? "bg-accent/15 text-accent" : "bg-foreground/[0.04]"}`}
                      >
                        <span className={`flex h-6 min-w-6 items-center justify-center text-sm font-bold ${s.frame === "box" ? "border-2 border-current px-1" : s.frame === "circle" ? "rounded-full border-2 border-current" : ""}`}>{s.text}</span>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {options.tool === "stamp" && options.stamp.next && (
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
          <Pop label="Shapes" trigger={<span className={toolCls(options.tool === "shape")}><ShapesIcon className="h-5 w-5" /></span>}>
            {(closePop) => (
              <div className="grid w-56 grid-cols-2 gap-1">
                {SHAPES.map((s) => (
                  <button
                    key={s.shape}
                    type="button"
                    onClick={() => {
                      setOpt({ tool: "shape", shape: s.shape });
                      closePop();
                    }}
                    className={`h-9 rounded-md px-2 text-left text-sm hover:bg-surface-hover ${options.tool === "shape" && options.shape === s.shape ? "bg-accent/15 text-accent" : "bg-foreground/[0.04]"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </Pop>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-foreground/10 sm:mx-1" />
          <Pop
            label="Colour and size"
            trigger={
              <span className={`${toolCls(false)} w-auto gap-1.5 px-2 sm:w-auto`}>
                <span className="h-5 w-5 rounded-full ring-2 ring-foreground/15" style={{ background: options.tool === "highlight" ? options.highlight : options.ink }} />
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
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted">Highlighter</p>
                  <div className="flex flex-wrap gap-1.5">
                    {HIGHLIGHTS.map((c) => (
                      <Swatch key={c.color} name={c.name} color={c.color} on={options.highlight === c.color} onClick={() => setOpt({ highlight: c.color })} />
                    ))}
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
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted">Text</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ["sans", "Plain"],
                        ["bold", "Bold"],
                        ["hand", "Chords"],
                      ] as const
                    ).map(([font, label]) => (
                      <button key={font} type="button" onClick={() => setOpt({ textFont: font })} className={`h-8 rounded-md text-xs ${options.textFont === font ? "bg-accent/15 font-medium text-accent" : "bg-foreground/[0.04] hover:bg-surface-hover"}`} style={{ fontFamily: fontFamily(font), fontWeight: font === "bold" ? 700 : 400 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-pressed={options.textBoxed}
                    onClick={() => setOpt({ textBoxed: !options.textBoxed })}
                    title="Puts a white box behind new text, covering what's under it"
                    className={`mt-1 h-8 w-full rounded-md text-xs ${options.textBoxed ? "bg-accent/15 font-medium text-accent" : "bg-foreground/[0.04] hover:bg-surface-hover"}`}
                  >
                    White box
                  </button>
                </div>
              </div>
            )}
          </Pop>
          {selectedMark && (
            <>
              <span className="mx-0.5 h-6 w-px shrink-0 bg-foreground/10 sm:mx-1" />
              <button type="button" onClick={() => changeSelected((m) => (m.t === "text" ? { ...m, size: Math.max(8, m.size / 1.2) } : m.t === "ink" || m.t === "shape" ? { ...m, width: Math.max(0.5, m.width / 1.3) } : m))} className={`${toolCls(false)} text-sm font-semibold`} aria-label="Smaller" title="Smaller">
                A−
              </button>
              <button type="button" onClick={() => changeSelected((m) => (m.t === "text" ? { ...m, size: Math.min(200, m.size * 1.2) } : m.t === "ink" || m.t === "shape" ? { ...m, width: Math.min(60, m.width * 1.3) } : m))} className={`${toolCls(false)} text-sm font-semibold`} aria-label="Bigger" title="Bigger">
                A+
              </button>
              <button
                type="button"
                onClick={() => changeSelected((m) => ({ ...m, color: m.t === "ink" && m.highlight ? options.highlight : options.ink }))}
                className={toolCls(false)}
                aria-label="Use the chosen colour"
                title="Use the chosen colour"
              >
                <span className="h-5 w-5 rounded-full ring-2 ring-foreground/15" style={{ background: options.ink }} />
              </button>
              <ToolBtn label="Delete (Del)" icon={TrashIcon} onClick={removeSelected} danger />
            </>
          )}
        </div>
        </div>
      )}

      {/* Pages */}
      {view === "pages" && layer && doc ? (
        <PdfPages
          sources={sources}
          fileId={fileId ?? ""}
          layer={layer}
          onChange={(next) => commit(() => next)}
          onOpen={(i) => {
            setView("read");
            requestAnimationFrame(() => requestAnimationFrame(() => goToPage(i)));
          }}
        />
      ) : (
        <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto">
          {loadError ? (
            <p className="p-10 text-center text-sm text-muted">{loadError}</p>
          ) : !layer ? (
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner label="Opening the PDF" />
            </div>
          ) : (
            <div className="mx-auto flex w-max min-w-full flex-col items-center gap-4 px-4 py-4 pb-24">
              {pages.map((p) => (
                <PdfPageView
                  key={p.id}
                  doc={sources.docFor(p)}
                  page={p}
                  aspect={sources.aspectOf(p)}
                  width={pageWidth}
                  hideMarks={hideMarks}
                  editingText={typing?.pageId === p.id ? typing.mark : null}
                  onTextDone={(text) => {
                    const t = typing;
                    setTyping(null);
                    if (!t) return;
                    const exists = p.marks.some((m) => m.id === t.mark.id);
                    const clean = (text ?? "").replace(/\s+$/, "");
                    if (!clean) {
                      if (exists && text !== null) updatePage(p.id, (pg) => ({ ...pg, marks: pg.marks.filter((m) => m.id !== t.mark.id) }));
                      return;
                    }
                    const mark = { ...t.mark, text: clean };
                    updatePage(p.id, (pg) => ({ ...pg, marks: exists ? pg.marks.map((m) => (m.id === mark.id ? mark : m)) : [...pg.marks, mark] }));
                  }}
                  editing={
                    tools && !hideMarks
                      ? {
                          options,
                          selectedId: selected?.pageId === p.id ? selected.id : null,
                          onSelect: (id) => setSelected(id ? { pageId: p.id, id } : null),
                          onAdd: (mark) => updatePage(p.id, (pg) => ({ ...pg, marks: [...pg.marks, mark] })),
                          onUpdate: (mark) => updatePage(p.id, (pg) => ({ ...pg, marks: pg.marks.map((m) => (m.id === mark.id ? mark : m)) })),
                          onRemove: (ids) => updatePage(p.id, (pg) => ({ ...pg, marks: pg.marks.filter((m) => !ids.includes(m.id)) })),
                          onText: (mark) => setTyping({ pageId: p.id, mark }),
                          onStamped: () => setOpt({ stamp: { ...options.stamp, text: nextStampText(options.stamp.text, options.stamp.next) } }),
                          penOnly,
                          onPen: () => setPenOnly(true),
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Page and zoom */}
      {view === "read" && layer && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
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
        </div>
      )}

      {view === "perform" && layer && <PdfPerform sources={sources} layer={layer} start={current} hideMarks={hideMarks} onExit={(i) => { setView("read"); requestAnimationFrame(() => requestAnimationFrame(() => goToPage(i))); }} />}

      {(busy || error) && (
        <div className="absolute inset-x-0 top-20 z-10 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm shadow-lg ring-1 ring-foreground/10">
          {busy ? <LoadingSpinner size="sm" inline label={busy} /> : null}
          <span className={error ? "text-danger" : ""}>{busy ?? error}</span>
          {error && (
            <button type="button" onClick={() => setError(null)} className="ml-1 text-muted hover:text-foreground">
              OK
            </button>
          )}
        </div>
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {confirmClear && (
        <ConfirmDialog
          title="Clear all markings?"
          message="Every marking on every page goes. Your page order and added pages stay. You can undo this until you close the PDF."
          confirmLabel="Clear"
          onConfirm={() => {
            setConfirmClear(false);
            commit((l) => ({ ...l, pages: l.pages.map((p) => (p.marks.length ? { ...p, marks: [] } : p)) }));
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
  return createPortal(body, document.body);
}

// ---------------------------------------------------------------- bits

const toolCls = (active: boolean) =>
  `flex h-10 w-9 shrink-0 items-center justify-center rounded-lg transition-colors sm:w-10 ${active ? "bg-accent/15 text-accent" : "text-foreground/80 hover:bg-surface-hover"}`;

function ToolBtn({ label, icon: Icon, active = false, danger, onClick }: { label: string; icon: ComponentType<{ className?: string }>; active?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={`${toolCls(active)} ${danger ? "text-danger" : ""}`}>
      <Icon className="h-5 w-5" />
    </button>
  );
}

function IconBtn({ label, icon: Icon, onClick, disabled, active }: { label: string; icon: ComponentType<{ className?: string }>; onClick: (e: React.MouseEvent) => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-35 ${active ? "bg-accent/15 text-accent" : "text-foreground/80 hover:bg-surface-hover"}`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

function Swatch({ name, color, on, onClick }: { name: string; color: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      title={name}
      className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-surface ${on ? "ring-2 ring-accent" : "ring-1 ring-foreground/15"}`}
      style={{ background: color }}
    />
  );
}

/** A button that opens a small panel under it (portaled, kept on screen). */
function Pop({ label, trigger, children }: { label: string; trigger: ReactNode; children: (close: () => void) => ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setPos(null);
    };
    // Escape closes just this panel: stopping it here (capture, on window) keeps the editor's own
    // Escape handler from closing the whole editor.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPos(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [pos]);
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={!!pos}
        onClick={() => {
          if (pos) return setPos(null);
          const r = btn.current!.getBoundingClientRect();
          setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 344)) });
        }}
        className="shrink-0"
      >
        {trigger}
      </button>
      {pos &&
        createPortal(
          <div ref={panel} className="fixed z-[75] max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-xl bg-surface p-3 shadow-xl ring-1 ring-foreground/10" style={{ top: pos.top, left: pos.left }}>
            {children(() => setPos(null))}
          </div>,
          document.body,
        )}
    </>
  );
}
