"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { UNITS, inkPath, moveMark, newId, r2, staffLines, type LayerPage, type Mark, type ShapeKind, type Stamp, type TextFont, type TextMark } from "@/components/pdf/markup";
import { fontFamily, fontWeight, hitTest, markBounds, shapePath, textBox } from "@/components/pdf/marksRender";

export type Tool = "hand" | "select" | "pen" | "highlight" | "eraser" | "text" | "stamp" | "shape";

export type ToolOptions = {
  tool: Tool;
  ink: string;
  inkWidth: number;
  highlight: string;
  stamp: Stamp;
  shape: ShapeKind;
  textFont: TextFont;
  textBoxed: boolean;
  textSize: number;
};

export type PageEditing = {
  options: ToolOptions;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (mark: Mark) => void;
  onUpdate: (mark: Mark) => void;
  onRemove: (ids: string[]) => void;
  /** Start typing a new text mark here, or edit this one. */
  onText: (mark: TextMark) => void;
  /** A stamp was placed (letters and numbers count up). */
  onStamped: () => void;
  /** Touch scrolls instead of drawing once a pen has been used (palm rejection). */
  penOnly: boolean;
  onPen: () => void;
};

/** The largest canvas we'll draw (iOS refuses bigger ones). */
const MAX_PIXELS = 16_000_000;

/**
 * One page: the PDF page drawn on a canvas (only while it's near the screen), an added page's
 * paper or staff lines, and the markings over it as SVG. With `editing`, the pointer draws,
 * places, selects and erases with the chosen tool.
 */
export default function PdfPageView({
  doc,
  page,
  aspect,
  width,
  editing,
  hideMarks,
  editingText,
  onTextDone,
  eager,
}: {
  doc: PDFDocumentProxy | null;
  page: LayerPage;
  aspect: number;
  width: number;
  editing?: PageEditing;
  hideMarks?: boolean;
  /** The text mark being typed on this page. */
  editingText?: TextMark | null;
  onTextDone?: (text: string | null) => void;
  /** Draw it now, not only once it's scrolled near (page turning). */
  eager?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const drawnOnce = useRef(false);
  const height = width * aspect;
  const unitsH = UNITS * aspect;
  const visible = eager || near;

  // Only pages near the screen are drawn.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || eager) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

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

  // ---- drawing

  const [draft, setDraft] = useState<Mark | null>(null);
  const [moving, setMoving] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const gesture = useRef<{ kind: "ink" | "shape" | "move" | "erase"; startX: number; startY: number; mark?: Mark } | null>(null);

  const toUnits = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * UNITS, ((e.clientY - r.top) / r.width) * UNITS] as const;
  };

  const tool = editing?.options.tool ?? "hand";
  const drawing = editing && tool !== "hand";
  const tol = (10 / width) * UNITS; // about 10 screen pixels

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!editing || tool === "hand" || e.button > 0) return;
    if (e.pointerType === "pen") editing.onPen();
    else if (e.pointerType === "touch" && editing.penOnly) return;
    const [x, y] = toUnits(e);
    const o = editing.options;
    if (tool === "select") {
      const hit = hitTest(page.marks, x, y, tol);
      editing.onSelect(hit?.id ?? null);
      if (!hit) return;
      gesture.current = { kind: "move", startX: x, startY: y, mark: hit };
      setMoving({ id: hit.id, dx: 0, dy: 0 });
    } else if (tool === "eraser") {
      gesture.current = { kind: "erase", startX: x, startY: y };
      const hit = hitTest(page.marks, x, y, tol);
      if (hit) editing.onRemove([hit.id]);
    } else if (tool === "pen" || tool === "highlight") {
      const hl = tool === "highlight";
      const mark: Mark = { id: newId(), t: "ink", pts: [r2(x), r2(y)], color: hl ? o.highlight : o.ink, width: hl ? o.inkWidth * 6 : o.inkWidth, ...(hl ? { highlight: true } : {}) };
      gesture.current = { kind: "ink", startX: x, startY: y, mark };
      setDraft(mark);
    } else if (tool === "shape") {
      const mark: Mark = { id: newId(), t: "shape", shape: o.shape, x1: r2(x), y1: r2(y), x2: r2(x), y2: r2(y), color: o.ink, width: o.inkWidth };
      gesture.current = { kind: "shape", startX: x, startY: y, mark };
      setDraft(mark);
    } else if (tool === "text") {
      // Keeps the click from taking focus away from the new text box.
      e.preventDefault();
      const hit = hitTest(page.marks, x, y, tol);
      if (hit?.t === "text" && hit.font !== "music") editing.onText(hit);
      else editing.onText({ id: newId(), t: "text", x: r2(x), y: r2(y), text: "", size: o.textSize, color: o.ink, font: o.textFont, ...(o.textBoxed ? { frame: "fill" as const } : {}) });
      return;
    } else if (tool === "stamp") {
      const s = o.stamp;
      editing.onAdd({ id: newId(), t: "text", x: r2(x), y: r2(y), text: s.text, size: s.size, color: o.ink, font: s.font, ...(s.frame ? { frame: s.frame } : {}) });
      editing.onStamped();
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || !editing) return;
    const [x, y] = toUnits(e);
    if (g.kind === "ink" && g.mark?.t === "ink") {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      const pts = [...g.mark.pts];
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const [px, py] = toUnits(ev);
        const lx = pts[pts.length - 2];
        const ly = pts[pts.length - 1];
        if (Math.hypot(px - lx, py - ly) > 1.2) pts.push(r2(px), r2(py));
      }
      g.mark = { ...g.mark, pts };
      setDraft(g.mark);
    } else if (g.kind === "shape" && g.mark?.t === "shape") {
      g.mark = { ...g.mark, x2: r2(x), y2: r2(e.shiftKey && g.mark.shape !== "rect" && g.mark.shape !== "ellipse" ? g.mark.y1 : y) };
      setDraft(g.mark);
    } else if (g.kind === "move") {
      setMoving({ id: g.mark!.id, dx: x - g.startX, dy: y - g.startY });
    } else if (g.kind === "erase") {
      const hit = hitTest(page.marks, x, y, tol);
      if (hit) editing.onRemove([hit.id]);
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !editing) return;
    if ((g.kind === "ink" || g.kind === "shape") && g.mark) {
      const m = g.mark;
      const tiny = m.t === "shape" && Math.hypot(m.x2 - m.x1, m.y2 - m.y1) < 4;
      if (!tiny) editing.onAdd(m);
      setDraft(null);
    } else if (g.kind === "move" && moving && g.mark) {
      if (Math.abs(moving.dx) + Math.abs(moving.dy) > 0.5) editing.onUpdate(moveMark(g.mark, r2(moving.dx), r2(moving.dy)));
      setMoving(null);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!editing || tool !== "select") return;
    const [x, y] = toUnits(e);
    const hit = hitTest(page.marks, x, y, tol);
    if (hit?.t === "text" && hit.font !== "music") editing.onText(hit);
  };

  const marks = hideMarks ? [] : page.marks;
  const shown = marks.map((m) => (moving && m.id === moving.id ? moveMark(m, moving.dx, moving.dy) : m)).filter((m) => m.id !== editingText?.id);
  const selected = editing?.selectedId ? shown.find((m) => m.id === editing.selectedId) : null;
  const staff = page.src.kind === "staff" ? staffLines(aspect) : null;

  return (
    <div
      ref={wrapRef}
      data-page={page.id}
      className="relative shrink-0 overflow-hidden bg-white shadow-sm ring-1 ring-black/10"
      style={{ width, height }}
    >
      {page.src.kind === "pdf" && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
      <svg
        viewBox={`0 0 ${UNITS} ${unitsH}`}
        className="absolute inset-0 h-full w-full select-none"
        style={{
          touchAction: drawing && !editing?.penOnly ? "none" : "auto",
          cursor: !drawing ? undefined : tool === "select" ? "default" : tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {staff && staff.ys.map((y, i) => <line key={i} x1={staff.x1} x2={staff.x2} y1={y} y2={y} stroke="#555" strokeWidth={staff.stroke} />)}
        {shown.map((m) => (
          <MarkShape key={m.id} m={m} />
        ))}
        {draft && <MarkShape m={draft} />}
        {selected && <SelectionBox m={selected} />}
      </svg>
      {editingText && onTextDone && <TextInput mark={editingText} width={width} aspect={aspect} onDone={onTextDone} />}
    </div>
  );
}

function MarkShape({ m }: { m: Mark }) {
  if (m.t === "ink") {
    const pts = m.pts.length === 2 ? [...m.pts, m.pts[0] + 0.01, m.pts[1]] : m.pts;
    return (
      <path
        d={inkPath(pts)}
        fill="none"
        stroke={m.color}
        strokeWidth={m.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={m.highlight ? { mixBlendMode: "multiply", opacity: 0.4 } : undefined}
      />
    );
  }
  if (m.t === "shape") {
    const common = { fill: "none", stroke: m.color, strokeWidth: m.width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    const x = Math.min(m.x1, m.x2);
    const y = Math.min(m.y1, m.y2);
    const w = Math.abs(m.x2 - m.x1);
    const h = Math.abs(m.y2 - m.y1);
    if (m.shape === "rect") return <rect x={x} y={y} width={w} height={h} {...common} />;
    if (m.shape === "ellipse") return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />;
    return <path d={shapePath(m)} {...common} />;
  }
  const b = textBox(m);
  const sw = Math.max(1.5, m.size * 0.07);
  return (
    <g>
      {m.frame === "fill" && <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" />}
      {m.frame === "box" && <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={m.color} strokeWidth={sw} />}
      {m.frame === "circle" && <circle cx={m.x} cy={m.y} r={b.w / 2} fill="none" stroke={m.color} strokeWidth={sw} />}
      <text
        x={m.x}
        fill={m.color}
        fontSize={m.size}
        fontFamily={fontFamily(m.font)}
        fontWeight={fontWeight(m.font)}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {b.lines.map((line, i) => (
          <tspan key={i} x={m.x} y={m.y - ((b.lines.length - 1) * b.lineH) / 2 + i * b.lineH}>
            {line || " "}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function SelectionBox({ m }: { m: Mark }) {
  const b = markBounds(m);
  const p = 6;
  return (
    <rect
      x={b.x - p}
      y={b.y - p}
      width={b.w + p * 2}
      height={b.h + p * 2}
      fill="none"
      stroke="var(--accent)"
      strokeWidth={2}
      strokeDasharray="6 4"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

/** Typing a text mark, in place on the page. Enter, Escape or clicking away finishes (Shift+Enter
    for a new line); empty text is dropped, and undo takes back a mistake. */
function TextInput({ mark, width, aspect, onDone }: { mark: TextMark; width: number; aspect: number; onDone: (text: string | null) => void }) {
  const [text, setText] = useState(mark.text);
  const px = width / UNITS;
  const lines = Math.max(1, text.split("\n").length);
  const size = mark.size * px;
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <textarea
      autoFocus
      value={text}
      placeholder="Type here"
      rows={lines}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(text)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") finish(text);
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(text);
        }
      }}
      className="absolute resize-none overflow-hidden rounded-sm bg-white/90 text-center outline-2 outline-[var(--accent)] placeholder:text-black/30"
      style={{
        left: mark.x * px,
        top: (mark.y / (UNITS * aspect)) * width * aspect,
        transform: "translate(-50%, -50%)",
        minWidth: 120,
        width: Math.max(120, (Math.max(...text.split("\n").map((l) => l.length)) + 2) * size * 0.6),
        fontSize: size,
        lineHeight: 1.25,
        fontFamily: fontFamily(mark.font),
        fontWeight: fontWeight(mark.font),
        color: mark.color,
      }}
    />
  );
}
