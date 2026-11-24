"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import MarkSvg from "@/components/pdf/MarkSvg";
import TextEditor, { primeKeyboard } from "@/components/pdf/TextEditor";
import {
  aabb,
  caretAt,
  clearTextCache,
  frameOf,
  hasEnds,
  hitTest,
  layoutText,
  resizeTo,
  rotateAbout,
  rotatePt,
  scaleAbout,
  snapMove,
  snapTargets,
  toLocal,
  translate,
  unionBox,
  boxesTouch,
  type Box,
  type Frame,
  type Guides,
} from "@/components/pdf/geometry";
import { UNITS, newId, normAngle, r2, roundMark, staffLines, type LayerPage, type Mark, type ShapeChoice, type ShapeMark, type Stamp, type TextMark } from "@/components/pdf/markup";
import { pageTextRuns, type TextRun } from "@/components/pdf/pdfText";

export type Tool = "hand" | "select" | "pen" | "highlight" | "eraser" | "text" | "stamp" | "shape" | "edittext";

/** How new text looks (the last text style you used). */
export type TextStyle = Pick<TextMark, "font" | "size" | "color" | "bold" | "italic" | "underline" | "align" | "frame" | "bg" | "lh">;

export type ToolOptions = {
  tool: Tool;
  ink: string;
  inkWidth: number;
  highlight: string;
  stamp: Stamp;
  shape: ShapeChoice;
  text: TextStyle;
};

/** A text mark being typed: a new one (with the cover over the PDF's own text it replaces, for Edit
    text), or one already on the page. */
export type Typing = { pageId: string; mark: TextMark; isNew: boolean; cover?: ShapeMark; caret?: number };

export type PageEditing = {
  options: ToolOptions;
  /** The ids selected on this page. */
  selected: string[];
  onSelect: (ids: string[]) => void;
  /** These marks (by id) changed: one step to undo. */
  onChange: (marks: Mark[]) => void;
  onAdd: (marks: Mark[], select?: boolean) => void;
  onRemove: (ids: string[]) => void;
  /** Start typing in a text mark. */
  onType: (t: Omit<Typing, "pageId">) => void;
  /** The text being typed anywhere (on this page: shown in its box). */
  typing: Typing | null;
  onTypingText: (text: string) => void;
  onTypingToggle: (style: "bold" | "italic" | "underline") => void;
  onTypingSize: (dir: 1 | -1) => void;
  onTypingDone: () => void;
  /** A stamp was placed (letters and numbers count up). */
  onStamped: () => void;
  /** A drag (moving, resizing, turning) started or ended: the floating toolbar steps aside. */
  onGesture: (active: boolean) => void;
  /** Edit text found no text on this page (a scan). */
  onNoText: () => void;
  /** Touch scrolls instead of drawing once a pen has been used (palm rejection). */
  penOnly: boolean;
  onPen: () => void;
  /** Scrolls the document (the hand tool's drag). */
  scrollBy: (dx: number, dy: number) => void;
};

/** The largest canvas we'll draw (iOS refuses bigger ones). */
const MAX_PIXELS = 16_000_000;

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLE_DIRS: Record<Handle, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
const CORNERS: Handle[] = ["nw", "ne", "se", "sw"];
const ALL_HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

type Gesture =
  | { kind: "ink" | "shape"; mark: Mark; cover?: boolean }
  | { kind: "move"; x0: number; y0: number; orig: Mark[]; targets: { xs: number[]; ys: number[] }; moved: boolean; toggle?: string; dx: number; dy: number }
  | { kind: "resize"; handle: Handle; orig: Mark[]; frame: Frame | null; box: Box }
  | { kind: "rotate"; orig: Mark[]; cx: number; cy: number; a0: number; rot0: number; delta: number }
  | { kind: "end"; which: 1 | 2; orig: ShapeMark }
  | { kind: "marquee"; x0: number; y0: number; base: string[] }
  | { kind: "erase"; gone: Set<string> }
  | { kind: "pan"; lx: number; ly: number }
  | { kind: "textbox"; x0: number; y0: number; sx: number; sy: number }
  | { kind: "tap"; x0: number; y0: number; sx: number; sy: number; shift: boolean };

/**
 * One page: the PDF page drawn on a canvas (only while it's near the screen), an added page's
 * paper or staff lines, and the markings over it as SVG. With `editing`, the pointer draws, places,
 * selects, moves, resizes and turns marks with the chosen tool (see `PdfEditor`).
 */
export default function PdfPageView({
  doc,
  page,
  aspect,
  width,
  editing,
  hideMarks,
  eager,
  images,
}: {
  doc: PDFDocumentProxy | null;
  page: LayerPage;
  aspect: number;
  width: number;
  editing?: PageEditing;
  hideMarks?: boolean;
  /** Draw it now, not only once it's scrolled near (page turning). */
  eager?: boolean;
  /** Image marks' picture addresses, by `kind:id` (null: kept on another device). */
  images?: Record<string, string | null | undefined>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const drawnOnce = useRef(false);
  const height = width * aspect;
  const unitsH = UNITS * aspect;
  const visible = eager || near;
  const px = width / UNITS;

  // Only pages near the screen are drawn.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || eager) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  // Text is measured with canvas; once a font arrives the measurements change.
  const [, setFontTick] = useState(0);
  useEffect(() => {
    const onFonts = () => {
      clearTextCache();
      setFontTick((t) => t + 1);
    };
    document.fonts?.addEventListener?.("loadingdone", onFonts);
    return () => document.fonts?.removeEventListener?.("loadingdone", onFonts);
  }, []);

  // Draw the PDF page — again when the width settles at a new zoom (the old drawing stretches
  // meanwhile).
  const pdfPage = page.src.kind === "pdf" ? page.src.page : -1;
  useEffect(() => {
    if (!doc || pdfPage < 0 || !visible || width < 10) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    const t = setTimeout(async () => {
      const p = await doc.getPage(pdfPage + 1);
      if (cancelled) return;
      const rotation = (p.rotate + page.rotate) % 360;
      const base = p.getViewport({ scale: 1, rotation });
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      let scale = (width * dpr) / base.width;
      if (base.width * base.height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (base.width * base.height));
      const viewport = p.getViewport({ scale, rotation });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = p.render({ canvas, viewport });
      try {
        await task.promise;
      } catch {
        return;
      }
      const shown = canvasRef.current;
      if (cancelled || !shown) return;
      shown.width = canvas.width;
      shown.height = canvas.height;
      shown.getContext("2d")?.drawImage(canvas, 0, 0);
      drawnOnce.current = true;
    }, drawnOnce.current ? 150 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
      task?.cancel();
    };
  }, [doc, pdfPage, page.rotate, visible, width]);

  const tool = editing?.options.tool ?? "hand";

  // ---- the PDF's own text (Edit text)
  const [runs, setRuns] = useState<TextRun[] | null>(null);
  const [hoverRun, setHoverRun] = useState<number | null>(null);
  const wantRuns = !!editing && tool === "edittext" && visible && !!doc && pdfPage >= 0;
  useEffect(() => {
    if (!wantRuns || !doc) return;
    let live = true;
    void pageTextRuns(doc, pdfPage, page.rotate).then((r) => live && setRuns(r));
    return () => {
      live = false;
    };
  }, [wantRuns, doc, pdfPage, page.rotate]);
  const shownRuns = wantRuns ? runs : null;

  // ---- what's drawn
  const [draft, setDraft] = useState<Mark | null>(null);
  const [preview, setPreview] = useState<Record<string, Mark> | null>(null);
  const [guides, setGuides] = useState<Guides | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [turning, setTurning] = useState<{ deg: number; groupBox: Box | null } | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const typing = editing?.typing?.pageId === page.id ? editing.typing : null;
  const base = hideMarks ? [] : page.marks;
  let marks = base;
  if (typing) {
    const has = base.some((m) => m.id === typing.mark.id);
    marks = has ? base.map((m) => (m.id === typing.mark.id ? typing.mark : m)) : [...base, ...(typing.cover ? [typing.cover] : []), typing.mark];
  }
  const shown = preview ? marks.map((m) => preview[m.id] ?? m) : marks;
  const selectedIds = editing?.selected ?? [];
  const selection = shown.filter((m) => selectedIds.includes(m.id));

  // ---- pointer helpers
  const toUnits = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * UNITS, ((e.clientY - r.top) / r.width) * UNITS] as const;
  };
  const tol = (10 / Math.max(width, 1)) * UNITS; // about 10 screen pixels
  const editable = (m: Mark) => !m.locked;
  const isTextEditable = (m: Mark | null): m is TextMark => !!m && m.t === "text" && m.font !== "music" && !m.locked;

  /** The paper's colour around a box (units): the lightest of a ring of pixels just outside it, so a
      cover matches cream or grey scans as well as white paper. */
  const paperColor = (b: Box) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d", { willReadFrequently: true });
    if (!c || !ctx || !c.width) return "#ffffff";
    const k = c.width / UNITS;
    let best: [number, number, number] | null = null;
    let bestL = -1;
    const m = 3;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      for (const [x, y] of [
        [b.x + b.w * t, b.y - m],
        [b.x + b.w * t, b.y + b.h + m],
        [b.x - m, b.y + b.h * t],
        [b.x + b.w + m, b.y + b.h * t],
      ]) {
        const sx = Math.round(x * k);
        const sy = Math.round(y * k);
        if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) continue;
        try {
          const d = ctx.getImageData(sx, sy, 1, 1).data;
          const l = d[0] * 0.3 + d[1] * 0.59 + d[2] * 0.11;
          if (l > bestL) {
            bestL = l;
            best = [d[0], d[1], d[2]];
          }
        } catch {
          return "#ffffff";
        }
      }
    }
    if (!best) return "#ffffff";
    return `#${best.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };

  const startWindowGesture = (g: Gesture) => {
    gesture.current = g;
    const move = (e: PointerEvent) => onMove(e);
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onUp(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    if (g.kind === "move" || g.kind === "resize" || g.kind === "rotate" || g.kind === "end") editing?.onGesture(true);
  };

  /** Starts moving these marks (by id, from what's shown). */
  const startMove = (ids: string[], x: number, y: number, toggle?: string) => {
    const orig = shown.filter((m) => ids.includes(m.id) && editable(m));
    if (!orig.length) return;
    const others = shown.filter((m) => !ids.includes(m.id));
    startWindowGesture({ kind: "move", x0: x, y0: y, orig, targets: snapTargets(others, unitsH), moved: false, toggle, dx: 0, dy: 0 });
  };

  /** A click (or a tap) with the select tool. */
  const selectAt = (x: number, y: number, shift: boolean, startDrag: boolean) => {
    if (!editing) return;
    const hit = hitTest(shown, x, y, tol);
    if (hit) {
      if (shift) {
        const on = selectedIds.includes(hit.id);
        const next = on ? selectedIds : [...selectedIds, hit.id];
        editing.onSelect(next);
        // Shift-clicking a selected mark takes it out, unless it's dragged.
        if (startDrag) startMove(next, x, y, on ? hit.id : undefined);
        else if (on) editing.onSelect(selectedIds.filter((id) => id !== hit.id));
        return;
      }
      const next = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
      editing.onSelect(next);
      if (startDrag) startMove(next, x, y);
      return;
    }
    if (!shift) editing.onSelect([]);
    if (startDrag) startWindowGesture({ kind: "marquee", x0: x, y0: y, base: shift ? selectedIds : [] });
  };

  const newText = (x: number, y: number, w?: number): TextMark => {
    const s = editing!.options.text;
    const m: TextMark = { id: newId(), t: "text", x: 0, y: 0, text: "", ...s, align: s.align ?? "left", ...(w ? { w } : {}) };
    const f = frameOf(m);
    const lay = layoutText(m);
    // The click is the top-left (a box) or the start of the first line (a click).
    return { ...m, x: r2(x + f.w / 2), y: r2(w ? y + f.h / 2 : y - lay.pad - lay.lineH / 2 + f.h / 2) };
  };

  /** Edit text: the run under the pointer. */
  const runAt = (x: number, y: number) => {
    if (!shownRuns) return -1;
    return shownRuns.findIndex((r) => {
      const [lx, ly] = toLocal({ cx: r.cx, cy: r.cy, w: r.w, h: r.h, rot: r.angle }, x, y);
      return Math.abs(lx) <= r.w / 2 + 2 && Math.abs(ly) <= r.h / 2 + 2;
    });
  };

  const editRun = (i: number, x: number, y: number) => {
    if (!editing || !shownRuns) return;
    const r = shownRuns[i];
    const padX = r.size * 0.08;
    const padY = r.size * 0.1;
    const w = r.w + padX * 2;
    const h = r.h + padY * 2;
    const coverBox = { x: r.cx - w / 2, y: r.cy - h / 2, w, h };
    const cover: ShapeMark = roundMark({ id: newId(), t: "shape", shape: "rect", x1: coverBox.x, y1: coverBox.y, x2: coverBox.x + w, y2: coverBox.y + h, color: "#000000", width: 0, fill: paperColor(coverBox), ...(r.angle ? { rot: r.angle } : {}) });
    const m: TextMark = { id: newId(), t: "text", x: 0, y: 0, text: r.text, size: r.size, color: "#1f2328", font: r.font, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), align: "left", ...(r.angle ? { rot: r.angle } : {}) };
    const f = frameOf(m);
    // Its left edge where the line starts, its middle a little above the baseline (where text drawn
    // on its line's middle has its baseline).
    const along = f.w / 2;
    const across = -0.3 * r.size;
    const dir = [Math.cos((r.angle * Math.PI) / 180), Math.sin((r.angle * Math.PI) / 180)];
    const mark = { ...m, x: r2(r.ox + dir[0] * along - dir[1] * across), y: r2(r.oy + dir[1] * along + dir[0] * across) };
    editing.onType({ mark, isNew: true, cover, caret: caretAt(mark, x, y) });
    setHoverRun(null);
  };

  /** A click (mouse), or a tap (touch), with a placing tool. */
  const placeAt = (x: number, y: number) => {
    if (!editing) return;
    const o = editing.options;
    if (tool === "text") {
      primeKeyboard();
      const hit = hitTest(shown, x, y, tol);
      if (isTextEditable(hit)) editing.onType({ mark: hit, isNew: false, caret: caretAt(hit, x, y) });
      else editing.onType({ mark: newText(x, y), isNew: true });
    } else if (tool === "edittext") {
      const hit = hitTest(shown, x, y, tol);
      if (isTextEditable(hit)) return editing.onType({ mark: hit, isNew: false, caret: caretAt(hit, x, y) });
      const i = runAt(x, y);
      if (i >= 0) {
        primeKeyboard();
        editRun(i, x, y);
      }
      else if (shownRuns && !shownRuns.length) editing.onNoText();
    } else if (tool === "stamp") {
      const s = o.stamp;
      const mark: TextMark = { id: newId(), t: "text", x: r2(x), y: r2(y), text: s.text, size: s.size, color: o.ink, font: s.font, ...(s.bold ? { bold: true } : {}), ...(s.frame ? { frame: s.frame } : {}) };
      editing.onAdd([mark], true);
      editing.onStamped();
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!editing || e.button > 0) return;
    if (e.pointerType === "pen") editing.onPen();
    const [x, y] = toUnits(e);
    const o = editing.options;
    const touch = e.pointerType === "touch";
    // Clicking away from text being typed just finishes it.
    if (editing.typing && tool !== "select" && tool !== "hand") {
      e.preventDefault();
      editing.onTypingDone();
      return;
    }
    if (tool === "hand") {
      if (touch) return;
      startWindowGesture({ kind: "pan", lx: e.clientX, ly: e.clientY });
      e.preventDefault();
      return;
    }
    // Touch with the select and placing tools: a tap acts, a drag scrolls (the browser's own).
    if (touch && (tool === "select" || tool === "text" || tool === "stamp" || tool === "edittext")) {
      startWindowGesture({ kind: "tap", x0: x, y0: y, sx: e.clientX, sy: e.clientY, shift: e.shiftKey });
      return;
    }
    if (touch && editing.penOnly) return;
    if (tool === "select") {
      if (editing.typing) editing.onTypingDone();
      selectAt(x, y, e.shiftKey, true);
      e.preventDefault();
      return;
    }
    if (tool === "text") {
      // Keeps the click from taking focus away from the new text box.
      e.preventDefault();
      const hit = hitTest(shown, x, y, tol);
      if (isTextEditable(hit)) return placeAt(x, y);
      startWindowGesture({ kind: "textbox", x0: x, y0: y, sx: e.clientX, sy: e.clientY });
      return;
    }
    if (tool === "stamp" || tool === "edittext") {
      e.preventDefault();
      placeAt(x, y);
      return;
    }
    if (tool === "eraser") {
      const g: Gesture = { kind: "erase", gone: new Set() };
      startWindowGesture(g);
      const hit = hitTest(shown, x, y, tol, (m) => !!m.locked);
      if (hit) {
        g.gone.add(hit.id);
        editing.onRemove([hit.id]);
      }
    } else if (tool === "pen" || tool === "highlight") {
      const hl = tool === "highlight";
      const mark: Mark = { id: newId(), t: "ink", pts: [r2(x), r2(y)], color: hl ? o.highlight : o.ink, width: hl ? o.inkWidth * 6 : o.inkWidth, ...(hl ? { highlight: true } : {}) };
      setDraft(mark);
      startWindowGesture({ kind: "ink", mark });
    } else if (tool === "shape") {
      const cover = o.shape === "cover";
      const mark: Mark = { id: newId(), t: "shape", shape: o.shape === "cover" ? "rect" : o.shape, x1: r2(x), y1: r2(y), x2: r2(x), y2: r2(y), color: o.ink, width: cover ? 0 : o.inkWidth, ...(cover ? { fill: "#ffffff" } : {}) };
      setDraft(mark);
      startWindowGesture({ kind: "shape", mark, cover });
    }
    e.preventDefault();
  };

  function onMove(e: PointerEvent) {
    const g = gesture.current;
    if (!g || !editing) return;
    const [x, y] = toUnits(e);
    if (g.kind === "ink" && g.mark.t === "ink") {
      const events = e.getCoalescedEvents?.() ?? [e];
      const pts = [...g.mark.pts];
      for (const ev of events.length ? events : [e]) {
        const [px2, py2] = toUnits(ev);
        if (Math.hypot(px2 - pts[pts.length - 2], py2 - pts[pts.length - 1]) > 1.2) pts.push(r2(px2), r2(py2));
      }
      g.mark = { ...g.mark, pts };
      setDraft(g.mark);
    } else if (g.kind === "shape" && g.mark.t === "shape") {
      let x2 = x;
      let y2 = y;
      const m = g.mark;
      if (e.shiftKey) {
        if (m.shape === "rect" || m.shape === "ellipse") {
          // A square or a circle.
          const d = Math.max(Math.abs(x - m.x1), Math.abs(y - m.y1));
          x2 = m.x1 + Math.sign(x - m.x1 || 1) * d;
          y2 = m.y1 + Math.sign(y - m.y1 || 1) * d;
        } else if (m.shape !== "bracket") [x2, y2] = snapEnd(m.x1, m.y1, x, y);
      }
      g.mark = { ...m, x2: r2(x2), y2: r2(y2) };
      setDraft(g.mark);
    } else if (g.kind === "erase") {
      const hit = hitTest(shown, x, y, tol, (m) => !!m.locked || g.gone.has(m.id));
      if (hit) {
        g.gone.add(hit.id);
        editing.onRemove([hit.id]);
      }
    } else if (g.kind === "pan") {
      editing.scrollBy(g.lx - e.clientX, g.ly - e.clientY);
      g.lx = e.clientX;
      g.ly = e.clientY;
    } else if (g.kind === "marquee") {
      const b = { x: Math.min(g.x0, x), y: Math.min(g.y0, y), w: Math.abs(x - g.x0), h: Math.abs(y - g.y0) };
      setMarquee(b);
      const inside = shown.filter((m) => !m.locked && boxesTouch(aabb(m), b)).map((m) => m.id);
      editing.onSelect([...new Set([...g.base, ...inside])]);
    } else if (g.kind === "move") {
      let dx = x - g.x0;
      let dy = y - g.y0;
      if (!g.moved && Math.hypot(dx, dy) * px < 3) return;
      g.moved = true;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      let gd: Guides | null = null;
      if (!e.altKey) {
        const box = unionBox(g.orig.map(aabb))!;
        const s = snapMove(box, dx, dy, g.targets, 6 / px);
        if (!e.shiftKey || dy === 0) dx = s.dx;
        if (!e.shiftKey || dx === 0) dy = s.dy;
        gd = s.guides;
      }
      setGuides(gd && (gd.xs.length || gd.ys.length) ? gd : null);
      g.dx = dx;
      g.dy = dy;
      setPreview(Object.fromEntries(g.orig.map((m) => [m.id, translate(m, dx, dy)])));
    } else if (g.kind === "resize") {
      setPreview(Object.fromEntries(resized(g, x, y, e.shiftKey).map((m) => [m.id, m])));
    } else if (g.kind === "rotate") {
      const a = (Math.atan2(y - g.cy, x - g.cx) * 180) / Math.PI;
      let target = g.rot0 + (a - g.a0);
      if (e.shiftKey) target = Math.round(target / 15) * 15;
      else {
        const q = Math.round(target / 90) * 90;
        if (Math.abs(target - q) < 4) target = q;
      }
      const delta = target - g.rot0;
      g.delta = delta;
      setTurning({ deg: normAngle(target), groupBox: g.orig.length > 1 ? unionBox(g.orig.map(aabb)) : null });
      setPreview(Object.fromEntries(g.orig.map((m) => [m.id, rotateAbout(m, delta, g.cx, g.cy)])));
    } else if (g.kind === "end") {
      const m = g.orig;
      const [ox, oy] = g.which === 1 ? [m.x2, m.y2] : [m.x1, m.y1];
      const [ex, ey] = e.shiftKey ? snapEnd(ox, oy, x, y) : [x, y];
      setPreview({ [m.id]: g.which === 1 ? { ...m, x1: ex, y1: ey } : { ...m, x2: ex, y2: ey } });
    } else if (g.kind === "textbox") {
      const b = { x: Math.min(g.x0, x), y: Math.min(g.y0, y), w: Math.abs(x - g.x0), h: Math.abs(y - g.y0) };
      setMarquee(Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8 ? b : null);
    } else if (g.kind === "tap") {
      // A drag: the browser scrolls, it isn't a tap any more.
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 10) gesture.current = null;
    }
  }

  function onUp(e: PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !editing) return;
    const [x, y] = toUnits(e);
    const cancelled = e.type === "pointercancel";
    if ((g.kind === "ink" || g.kind === "shape") && g.mark) {
      let m = g.mark;
      setDraft(null);
      if (m.t === "shape") {
        const tiny = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) * px < 6;
        if (tiny) {
          // A click: a shape of a usual size there.
          const box = m.shape === "rect" || m.shape === "ellipse" || m.shape === "bracket";
          const [w, h] = g.cover ? [160, 36] : box ? [m.shape === "bracket" ? 160 : 120, m.shape === "bracket" ? 18 : 80] : [150, 0];
          m = box ? { ...m, x1: m.x1 - w / 2, y1: m.y1 - h / 2, x2: m.x1 + w / 2, y2: m.y1 + h / 2 } : { ...m, x1: m.x1 - w / 2, x2: m.x1 + w / 2, y2: m.y1 };
        }
        if (m.shape === "rect" || m.shape === "ellipse" || m.shape === "bracket") {
          m = { ...m, x1: Math.min(m.x1, m.x2), y1: Math.min(m.y1, m.y2), x2: Math.max(m.x1, m.x2), y2: Math.max(m.y1, m.y2) };
          if (m.shape === "bracket" && m.y2 - m.y1 < 6) m = { ...m, y2: m.y1 + 18 };
        }
        if (g.cover && m.t === "shape") m = { ...m, fill: paperColor({ x: m.x1, y: m.y1, w: m.x2 - m.x1, h: m.y2 - m.y1 }) };
        editing.onAdd([roundMark(m)], true);
      } else editing.onAdd([m]);
    } else if (g.kind === "move") {
      setGuides(null);
      setPreview(null);
      editing.onGesture(false);
      if (g.moved && !cancelled) editing.onChange(g.orig.map((m) => roundMark(translate(m, g.dx, g.dy)))); else if (g.toggle) editing.onSelect(selectedIds.filter((id) => id !== g.toggle));
    } else if (g.kind === "resize") {
      setPreview(null);
      editing.onGesture(false);
      if (!cancelled) editing.onChange(resized(g, x, y, e.shiftKey).map(roundMark));
    } else if (g.kind === "rotate") {
      setPreview(null);
      setTurning(null);
      editing.onGesture(false);
      if (!cancelled && g.delta) editing.onChange(g.orig.map((m) => roundMark(rotateAbout(m, g.delta, g.cx, g.cy))));
    } else if (g.kind === "end") {
      setPreview(null);
      editing.onGesture(false);
      const m = g.orig;
      const [ox, oy] = g.which === 1 ? [m.x2, m.y2] : [m.x1, m.y1];
      const [ex, ey] = e.shiftKey ? snapEnd(ox, oy, x, y) : [x, y];
      if (!cancelled) editing.onChange([roundMark(g.which === 1 ? { ...m, x1: ex, y1: ey } : { ...m, x2: ex, y2: ey })]);
    } else if (g.kind === "marquee") setMarquee(null);
    else if (g.kind === "textbox") {
      setMarquee(null);
      if (cancelled) return;
      const dragged = Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8;
      if (dragged) editing.onType({ mark: newText(Math.min(g.x0, x), Math.min(g.y0, y), Math.max(40, Math.abs(x - g.x0))), isNew: true });
      else placeAt(g.x0, g.y0);
    } else if (g.kind === "tap") {
      if (cancelled) return;
      if (editing.typing) return editing.onTypingDone();
      if (tool === "select") selectAt(g.x0, g.y0, g.shift, false);
      else placeAt(g.x0, g.y0);
    }
  }

  function resized(g: Extract<Gesture, { kind: "resize" }>, x: number, y: number, shift: boolean): Mark[] {
    const [hx, hy] = HANDLE_DIRS[g.handle];
    const min = 6;
    if (g.frame && g.orig.length === 1) {
      const f = g.frame;
      const m = g.orig[0];
      const [lx, ly] = toLocal(f, x, y);
      const ax = -hx * (f.w / 2);
      const ay = -hy * (f.h / 2);
      let w = hx ? Math.max(min, (lx - ax) * hx) : f.w;
      let h = hy ? Math.max(min, (ly - ay) * hy) : f.h;
      const proportional = hx !== 0 && hy !== 0 && (shift || m.t === "text");
      if (proportional) {
        const s = Math.max(w / f.w, h / f.h);
        w = f.w * s;
        h = f.h * s;
      }
      const cxl = hx ? ax + hx * (w / 2) : 0;
      const cyl = hy ? ay + hy * (h / 2) : 0;
      const [cx, cy] = rotatePt(f.cx + cxl, f.cy + cyl, f.cx, f.cy, f.rot);
      const mode = m.t === "text" && hy === 0 ? "width" : "scale";
      return [resizeTo(m, { cx, cy, w, h, rot: f.rot }, mode)];
    }
    // A group: scaled evenly from the opposite corner.
    const b = g.box;
    const ax = b.x + (hx < 0 ? b.w : 0);
    const ay = b.y + (hy < 0 ? b.h : 0);
    const s = Math.max(0.05, Math.max(((x - ax) * hx) / Math.max(b.w, 1), ((y - ay) * hy) / Math.max(b.h, 1)));
    return g.orig.map((m) => scaleAbout(m, s, ax, ay));
  }

  const startHandle = (e: ReactPointerEvent, handle: Handle | "rotate" | "end1" | "end2") => {
    if (!editing || e.button > 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (e.pointerType === "pen") editing.onPen();
    const orig = selection.filter(editable);
    if (!orig.length) return;
    const [x, y] = toUnits(e);
    if (handle === "end1" || handle === "end2") {
      const m = orig[0];
      if (m.t === "shape") startWindowGesture({ kind: "end", which: handle === "end1" ? 1 : 2, orig: m });
      return;
    }
    const box = unionBox(orig.map(aabb))!;
    if (handle === "rotate") {
      const single = orig.length === 1 ? frameOf(orig[0]) : null;
      const cx = single ? single.cx : box.x + box.w / 2;
      const cy = single ? single.cy : box.y + box.h / 2;
      startWindowGesture({ kind: "rotate", orig, cx, cy, a0: (Math.atan2(y - cy, x - cx) * 180) / Math.PI, rot0: single?.rot ?? 0, delta: 0 });
      return;
    }
    startWindowGesture({ kind: "resize", handle, orig, frame: orig.length === 1 ? frameOf(orig[0]) : null, box });
  };

  /** Pressing inside the selection box: whatever's under the pointer, or the whole selection. */
  const onBodyDown = (e: ReactPointerEvent) => {
    if (!editing || e.button > 0) return;
    e.stopPropagation();
    if (e.pointerType === "pen") editing.onPen();
    const [x, y] = toUnits(e);
    const hit = hitTest(shown, x, y, tol);
    if (hit && !selectedIds.includes(hit.id) && !e.shiftKey) {
      editing.onSelect([hit.id]);
      startMove([hit.id], x, y);
    } else if (hit && e.shiftKey) selectAt(x, y, true, true);
    else startMove(selectedIds, x, y);
    e.preventDefault();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!editing || (tool !== "select" && tool !== "text")) return;
    const [x, y] = toUnits(e);
    const hit = hitTest(shown, x, y, tol);
    if (isTextEditable(hit)) editing.onType({ mark: hit, isNew: false, caret: caretAt(hit, x, y) });
  };

  const onHover = (e: ReactPointerEvent) => {
    if (!shownRuns || gesture.current) return;
    const [x, y] = toUnits(e);
    const i = runAt(x, y);
    if (i !== hoverRun) setHoverRun(i >= 0 ? i : null);
  };

  const staff = page.src.kind === "staff" ? staffLines(aspect) : null;
  const drawing = !!editing && tool !== "hand";
  const drawTool = tool === "pen" || tool === "highlight" || tool === "eraser" || tool === "shape";
  const typingId = typing?.mark.id;

  return (
    <div ref={wrapRef} data-page={page.id} className="relative shrink-0 bg-white shadow-sm ring-1 ring-black/10" style={{ width, height }}>
      {page.src.kind === "pdf" && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
      <svg
        viewBox={`0 0 ${UNITS} ${unitsH}`}
        className="absolute inset-0 h-full w-full select-none"
        style={{
          touchAction: !drawing ? "auto" : drawTool && !editing?.penOnly ? "none" : "manipulation",
          cursor: !drawing ? (editing ? "grab" : undefined) : tool === "select" ? "default" : tool === "text" || tool === "edittext" ? "text" : tool === "eraser" ? "cell" : "crosshair",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onHover}
        onDoubleClick={onDoubleClick}
      >
        {staff && staff.ys.map((y, i) => <line key={i} x1={staff.x1} x2={staff.x2} y1={y} y2={y} stroke="#555" strokeWidth={staff.stroke} />)}
        {shown.map((m) => (
          <MarkSvg key={m.id} m={m} images={images} hideText={m.id === typingId} />
        ))}
        {draft && <MarkSvg m={draft} />}
        {shownRuns?.map((r, i) => (
          <rect
            key={i}
            x={r.cx - r.w / 2 - 2}
            y={r.cy - r.h / 2 - 2}
            width={r.w + 4}
            height={r.h + 4}
            transform={r.angle ? `rotate(${r.angle} ${r.cx} ${r.cy})` : undefined}
            fill={i === hoverRun ? "var(--accent)" : "none"}
            fillOpacity={0.12}
            stroke="var(--accent)"
            strokeOpacity={i === hoverRun ? 0.9 : 0.35}
            strokeWidth={1}
            strokeDasharray={i === hoverRun ? undefined : "3 3"}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
        {guides?.xs.map((gx) => <line key={`gx${gx}`} x1={gx} x2={gx} y1={0} y2={unitsH} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
        {guides?.ys.map((gy) => <line key={`gy${gy}`} x1={0} x2={UNITS} y1={gy} y2={gy} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
        {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="var(--accent)" fillOpacity={0.08} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      </svg>
      {editing && selection.length > 0 && !marquee && (
        <SelectionOverlay
          marks={selection}
          px={px}
          bodyActive={tool === "select" && !typing}
          typing={!!typing}
          turning={turning}
          onHandle={startHandle}
          onBody={onBodyDown}
          onDoubleClick={onDoubleClick}
        />
      )}
      {typing && editing && (
        <TextEditor
          key={typing.mark.id}
          mark={typing.mark}
          px={px}
          caret={typing.caret}
          onChange={editing.onTypingText}
          onToggle={editing.onTypingToggle}
          onSize={editing.onTypingSize}
          onDone={editing.onTypingDone}
        />
      )}
    </div>
  );
}

/** Shift on a line's end: its angle in steps of 15°, keeping its length. */
function snapEnd(ox: number, oy: number, x: number, y: number): [number, number] {
  const len = Math.hypot(x - ox, y - oy);
  const a = Math.round(Math.atan2(y - oy, x - ox) / (Math.PI / 12)) * (Math.PI / 12);
  return [ox + Math.cos(a) * len, oy + Math.sin(a) * len];
}

/** The resize cursor for a handle on a box turned `rot` degrees. */
function cursorFor(h: Handle, rot: number) {
  const [hx, hy] = HANDLE_DIRS[h];
  const a = (((Math.atan2(hy, hx) * 180) / Math.PI + rot) % 180 + 180) % 180;
  const names = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];
  return names[Math.round(a / 45) % 4];
}

// A small dot to see, in a bigger box to hit (bigger still on touch screens).
const handleCls =
  "absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 touch-none pointer-coarse:h-8 pointer-coarse:w-8 after:absolute after:inset-0 after:m-auto after:h-2.5 after:w-2.5 after:rounded-[3px] after:bg-white after:shadow-sm after:ring-[1.5px] after:ring-[var(--accent)] after:content-[''] pointer-coarse:after:h-3.5 pointer-coarse:after:w-3.5 pointer-coarse:after:rounded-full";

/** Touch screens: is the main pointer a finger? (Handles get room around small marks.) */
const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * The selection box: the frame of what's selected (turned with it), eight handles to resize (text:
 * the corners scale it, the sides set its width; a group: the corners), a handle above to turn it,
 * and for lines, arrows and hairpins a handle on each end. Locked marks show the frame only.
 */
function SelectionOverlay({
  marks,
  px,
  bodyActive,
  typing,
  turning,
  onHandle,
  onBody,
  onDoubleClick,
}: {
  marks: Mark[];
  px: number;
  bodyActive: boolean;
  typing: boolean;
  turning: { deg: number; groupBox: Box | null } | null;
  onHandle: (e: ReactPointerEvent, h: Handle | "rotate" | "end1" | "end2") => void;
  onBody: (e: ReactPointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}) {
  const single = marks.length === 1 ? marks[0] : null;
  const locked = marks.every((m) => m.locked);
  if (single && hasEnds(single)) {
    const len = Math.hypot(single.x2 - single.x1, single.y2 - single.y1) * px;
    const ang = (Math.atan2(single.y2 - single.y1, single.x2 - single.x1) * 180) / Math.PI;
    return (
      <>
        <div
          className="absolute touch-none"
          style={{
            left: ((single.x1 + single.x2) / 2) * px - len / 2,
            top: ((single.y1 + single.y2) / 2) * px - 12,
            width: len,
            height: 24,
            transform: `rotate(${ang}deg)`,
            pointerEvents: bodyActive ? "auto" : "none",
            cursor: locked ? "default" : "move",
          }}
          onPointerDown={onBody}
        />
        {!locked &&
          ([
            ["end1", single.x1, single.y1],
            ["end2", single.x2, single.y2],
          ] as const).map(([h, x, y]) => (
            <div key={h} className={`${handleCls} after:!rounded-full`} style={{ left: x * px, top: y * px, cursor: "crosshair" }} onPointerDown={(e) => onHandle(e, h)} />
          ))}
      </>
    );
  }
  let f: Frame;
  if (single) f = frameOf(single);
  else {
    const b = turning?.groupBox ?? unionBox(marks.map(aabb))!;
    f = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, rot: turning?.groupBox ? turning.deg : 0 };
  }
  const touch = coarse();
  const pad = touch ? 8 : 4; // px around the marks
  const w = f.w * px + pad * 2;
  const h = f.h * px + pad * 2;
  // On a small mark, side handles would crowd the corners (on touch, where they're big).
  const roomX = !touch || w >= 56;
  const roomY = !touch || h >= 56;
  // Short text on a touch screen keeps its width handles (the size is in the toolbar), not corners.
  const shortText = touch && single?.t === "text" && !roomY;
  const sides = (hd: Handle) => (hd === "n" || hd === "s" ? roomX : hd === "e" || hd === "w" ? roomY || shortText : !shortText);
  const handles = (locked ? [] : !single ? CORNERS : single.t === "text" ? [...CORNERS, "e" as Handle, "w" as Handle] : ALL_HANDLES).filter(sides);
  const pos = (hd: Handle) => {
    const [hx, hy] = HANDLE_DIRS[hd];
    return { left: ((hx + 1) / 2) * w, top: ((hy + 1) / 2) * h };
  };
  return (
    <div
      className="absolute"
      style={{
        left: f.cx * px - w / 2,
        top: f.cy * px - h / 2,
        width: w,
        height: h,
        transform: f.rot ? `rotate(${f.rot}deg)` : undefined,
        pointerEvents: "none",
      }}
    >
      <div
        className={`absolute inset-0 rounded-[2px] ${locked ? "border-[1.5px] border-dashed border-foreground/40" : "ring-[1.5px] ring-[var(--accent)]"} ${bodyActive ? "touch-none" : ""}`}
        style={{ pointerEvents: bodyActive ? "auto" : "none", cursor: locked ? "default" : "move" }}
        onPointerDown={onBody}
        onDoubleClick={onDoubleClick}
      />
      {locked && (
        <span className="absolute -top-6 left-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted shadow-sm ring-1 ring-foreground/10" style={{ pointerEvents: "none" }}>
          Locked
        </span>
      )}
      {handles.map((hd) => (
        <div key={hd} className={handleCls} style={{ ...pos(hd), cursor: cursorFor(hd, f.rot), pointerEvents: "auto" }} onPointerDown={(e) => onHandle(e, hd)} />
      ))}
      {!locked && !typing && (
        <>
          <div className="absolute left-1/2 h-5 w-px -translate-x-1/2 bg-[var(--accent)] pointer-coarse:h-7" style={{ bottom: "100%" }} />
          <div
            title="Turn (Shift: steps of 15°)"
            className="absolute bottom-[calc(100%+18px)] left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-white shadow-sm ring-[1.5px] ring-[var(--accent)] touch-none pointer-coarse:bottom-[calc(100%+26px)] pointer-coarse:h-6 pointer-coarse:w-6"
            style={{ cursor: "grab", pointerEvents: "auto" }}
            onPointerDown={(e) => onHandle(e, "rotate")}
          />
          {turning && (
            <span className="absolute left-1/2 rounded-full bg-foreground px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-background" style={{ bottom: "calc(100% + 40px)", pointerEvents: "none", transform: `translateX(-50%) rotate(${-f.rot}deg)` }}>
              {Math.round(turning.deg)}°
            </span>
          )}
        </>
      )}
    </div>
  );
}
