import { chordFont, chordSymbolFont } from "@/components/ChordChart";
import { UNITS, isBoxShape, normAngle, type ImageMark, type InkMark, type Mark, type ShapeMark, type TextFont, type TextMark } from "@/components/pdf/markup";

/**
 * Where marks are and how they change shape: text layout (wrapping), each mark's box, hitting,
 * selecting with a box, moving, scaling, turning and resizing, and snapping. All in page units.
 */

// ---------------------------------------------------------------- fonts and text

/** The CSS font family for each kind of text. Plain text is a print face so it looks the same in
    a downloaded PDF; chord symbols use the charts' handwritten face; symbols are SMuFL (Petaluma). */
export function fontFamily(font: TextFont) {
  // Music symbols in handwritten text ("To \uE048") come from the music font: the handwritten one
  // has none.
  if (font === "hand") return `${chordFont.style.fontFamily}, ${chordSymbolFont.style.fontFamily}`;
  if (font === "music") return chordSymbolFont.style.fontFamily;
  if (font === "serif") return 'Georgia, "Times New Roman", Times, serif';
  if (font === "mono") return '"Courier New", Courier, monospace';
  return "Helvetica, Arial, sans-serif";
}

export const FONTS: { font: TextFont; label: string }[] = [
  { font: "sans", label: "Sans" },
  { font: "serif", label: "Serif" },
  { font: "mono", label: "Typewriter" },
  { font: "hand", label: "Handwritten" },
  { font: "music", label: "Music" },
];

/** A CSS/canvas font string for a text mark at `size` px. */
export function fontCss(m: Pick<TextMark, "font" | "bold" | "italic">, size: number) {
  return `${m.italic ? "italic " : ""}${m.bold ? 700 : 400} ${size}px ${fontFamily(m.font)}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();

/** Forgets measured widths (a font finished loading, so they've changed). */
export function clearTextCache() {
  widths.clear();
}

/** The width of `text` at 100 px (scaled for other sizes, so resizing doesn't re-measure). */
function width100(m: Pick<TextMark, "font" | "bold" | "italic">, text: string) {
  if (!text) return 0;
  const key = `${m.font}|${m.bold ? 1 : 0}|${m.italic ? 1 : 0}|${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  measureCtx ??= typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  let w = text.length * 55;
  if (measureCtx) {
    measureCtx.font = fontCss(m, 100);
    w = measureCtx.measureText(text).width;
  }
  if (widths.size > 4000) widths.clear();
  widths.set(key, w);
  return w;
}

export function textWidth(m: Pick<TextMark, "font" | "bold" | "italic" | "size">, text: string) {
  return (width100(m, text) * m.size) / 100;
}

/** The width of a text mark's longest word (the narrowest it can wrap to without breaking one). */
export function longestWord(m: TextMark) {
  let w = 0;
  for (const word of m.text.split(/\s+/)) if (word) w = Math.max(w, textWidth(m, word));
  return w;
}

export type TextLine = { text: string; /** Where it starts in the mark's text. */ start: number; width: number };
export type TextLayout = { lines: TextLine[]; lineH: number; pad: number; innerW: number; innerH: number; w: number; h: number };

export function lineHeightOf(m: TextMark) {
  return m.size * (m.lh ?? (m.font === "music" ? 1 : 1.25));
}

/** Splits a paragraph into lines no wider than `max` (at spaces; a word that's too long on its own
    breaks between letters), the way a textarea with `pre-wrap` does. */
function wrap(m: TextMark, para: string, start: number, max: number, out: TextLine[]) {
  if (!para) {
    out.push({ text: "", start, width: 0 });
    return;
  }
  const tokens = para.match(/\s+|\S+/g) ?? [];
  let line = "";
  let lineStart = start;
  let at = start;
  const flush = () => {
    out.push({ text: line, start: lineStart, width: textWidth(m, line.replace(/\s+$/, "")) });
    line = "";
  };
  for (const tok of tokens) {
    const trial = line + tok;
    if (/^\s+$/.test(tok) || textWidth(m, trial.replace(/\s+$/, "")) <= max || !line) {
      if (!line) lineStart = at;
      if (!/^\s+$/.test(tok) && textWidth(m, tok) > max) {
        // One word wider than the box: letter by letter.
        for (const ch of tok) {
          if (line && textWidth(m, line + ch) > max) {
            flush();
            lineStart = at;
          }
          if (!line) lineStart = at;
          line += ch;
          at += ch.length;
        }
        continue;
      }
      line = trial;
    } else {
      flush();
      lineStart = at;
      line = tok;
    }
    at += tok.length;
  }
  flush();
}

/** How a text mark's lines fall: wrapped at `w` when it has one. Sizes are in units. */
export function layoutText(m: TextMark): TextLayout {
  const lineH = lineHeightOf(m);
  const pad = m.frame ? m.size * 0.3 : 0;
  const lines: TextLine[] = [];
  let start = 0;
  for (const para of m.text.split("\n")) {
    if (m.w) wrap(m, para, start, m.w, lines);
    else lines.push({ text: para, start, width: textWidth(m, para.replace(/\s+$/, "")) });
    start += para.length + 1;
  }
  const contentW = Math.max(0, ...lines.map((l) => l.width));
  const innerW = m.w ?? Math.max(contentW, m.size * 0.3);
  const innerH = lineH * lines.length;
  let w = innerW + pad * 2;
  let h = innerH + pad * 2;
  if (m.frame === "circle") w = h = Math.max(w, h);
  return { lines, lineH, pad, innerW, innerH, w, h };
}

/** Where line `i` and its text start, from the box's centre (before turning): `x` is the anchor for
    its alignment (`anchor` for SVG's `text-anchor`). */
export function linePlace(m: TextMark, lay: TextLayout, i: number) {
  const align = m.align ?? "center";
  const x = align === "left" ? -lay.innerW / 2 : align === "right" ? lay.innerW / 2 : 0;
  const y = -lay.innerH / 2 + lay.lineH / 2 + i * lay.lineH;
  const left = align === "left" ? x : align === "right" ? x - lay.lines[i].width : -lay.lines[i].width / 2;
  return { x, y, left, anchor: align === "left" ? ("start" as const) : align === "right" ? ("end" as const) : ("middle" as const) };
}

/** The place in a text mark's text nearest `x`, `y` (units on the page), for putting the caret
    where you double-click. */
export function caretAt(m: TextMark, x: number, y: number) {
  const f = frameOf(m);
  const [lx, ly] = toLocal(f, x, y);
  const lay = layoutText(m);
  const i = Math.max(0, Math.min(lay.lines.length - 1, Math.floor((ly + lay.innerH / 2) / lay.lineH)));
  const line = lay.lines[i];
  const { left } = linePlace(m, lay, i);
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k <= line.text.length; k++) {
    const d = Math.abs(left + textWidth(m, line.text.slice(0, k)) - lx);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return line.start + best;
}

// ---------------------------------------------------------------- boxes

/** A mark's box before turning (centre, size) and how far it's turned. */
export type Frame = { cx: number; cy: number; w: number; h: number; rot: number };
export type Box = { x: number; y: number; w: number; h: number };

const isLineShape = (m: Mark): m is ShapeMark => m.t === "shape" && !isBoxShape(m.shape);
/** Lines, arrows and hairpins: two end handles instead of a box. */
export const hasEnds = (m: Mark): m is ShapeMark => isLineShape(m);

/** How tall a hairpin's open end is, each side of the line. */
export function hairpinOpen(m: ShapeMark) {
  return Math.min(30, Math.hypot(m.x2 - m.x1, m.y2 - m.y1) / 3) / 2;
}

function inkBounds(m: InkMark) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < m.pts.length; i += 2) {
    x0 = Math.min(x0, m.pts[i]);
    x1 = Math.max(x1, m.pts[i]);
    y0 = Math.min(y0, m.pts[i + 1]);
    y1 = Math.max(y1, m.pts[i + 1]);
  }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}

export function frameOf(m: Mark): Frame {
  const rot = m.rot ?? 0;
  if (m.t === "text") {
    const lay = layoutText(m);
    return { cx: m.x, cy: m.y, w: lay.w, h: lay.h, rot };
  }
  if (m.t === "image") return { cx: m.x + m.w / 2, cy: m.y + m.h / 2, w: m.w, h: m.h, rot };
  if (m.t === "ink") {
    const b = inkBounds(m);
    const p = m.width / 2;
    return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w: b.x1 - b.x0 + p * 2, h: b.y1 - b.y0 + p * 2, rot };
  }
  if (isBoxShape(m.shape)) return { cx: (m.x1 + m.x2) / 2, cy: (m.y1 + m.y2) / 2, w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1), rot };
  const p = m.width / 2 + (m.shape === "cresc" || m.shape === "dim" ? hairpinOpen(m) : 0);
  return { cx: (m.x1 + m.x2) / 2, cy: (m.y1 + m.y2) / 2, w: Math.abs(m.x2 - m.x1) + p * 2, h: Math.abs(m.y2 - m.y1) + p * 2, rot: 0 };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Turns `x`, `y` by `deg` about `cx`, `cy`. */
export function rotatePt(x: number, y: number, cx: number, cy: number, deg: number): [number, number] {
  if (!deg) return [x, y];
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

/** A point on the page in a frame's own (unturned) space, from its centre. */
export function toLocal(f: Frame, x: number, y: number): [number, number] {
  const [lx, ly] = rotatePt(x, y, f.cx, f.cy, -f.rot);
  return [lx - f.cx, ly - f.cy];
}

export function corners(f: Frame): [number, number][] {
  const hw = f.w / 2;
  const hh = f.h / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => rotatePt(f.cx + x, f.cy + y, f.cx, f.cy, f.rot));
}

/** The upright box around a mark (turned marks take more room). */
export function aabb(m: Mark): Box {
  if (isLineShape(m)) {
    const f = frameOf(m);
    return { x: f.cx - f.w / 2, y: f.cy - f.h / 2, w: f.w, h: f.h };
  }
  return aabbOfFrame(frameOf(m));
}

export function aabbOfFrame(f: Frame): Box {
  if (!f.rot) return { x: f.cx - f.w / 2, y: f.cy - f.h / 2, w: f.w, h: f.h };
  const cs = corners(f);
  const xs = cs.map((c) => c[0]);
  const ys = cs.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

export const boxesTouch = (a: Box, b: Box) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

// ---------------------------------------------------------------- hitting

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** The straight pieces a line, arrow, hairpin or bracket is drawn with. */
export function shapeSegments(m: ShapeMark): [number, number, number, number][] {
  const { x1, y1, x2, y2 } = m;
  if (m.shape === "cresc" || m.shape === "dim") {
    const open = hairpinOpen(m);
    const a = Math.atan2(y2 - y1, x2 - x1);
    const nx = -Math.sin(a) * open;
    const ny = Math.cos(a) * open;
    const [px, py, ox, oy] = m.shape === "cresc" ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
    return [
      [ox + nx, oy + ny, px, py],
      [px, py, ox - nx, oy - ny],
    ];
  }
  if (m.shape === "bracket") {
    const x0 = Math.min(x1, x2), xr = Math.max(x1, x2), top = Math.min(y1, y2), bot = Math.max(y1, y2);
    return [
      [x0, bot, x0, top],
      [x0, top, xr, top],
      [xr, top, xr, bot],
    ];
  }
  return [[x1, y1, x2, y2]];
}

/** Whether `x`, `y` (units) is on a mark, within `tol`. */
export function hits(m: Mark, x: number, y: number, tol: number) {
  if (m.t === "shape" && !isBoxShape(m.shape)) {
    const reach = m.width / 2 + tol;
    return shapeSegments(m).some(([ax, ay, bx, by]) => segDist(x, y, ax, ay, bx, by) < reach);
  }
  const f = frameOf(m);
  const [lx, ly] = toLocal(f, x, y);
  if (m.t === "ink") {
    const reach = m.width / 2 + tol;
    // Points are kept before turning, about the frame's centre.
    const px = lx + f.cx;
    const py = ly + f.cy;
    if (m.pts.length === 2) return Math.hypot(px - m.pts[0], py - m.pts[1]) < reach;
    for (let j = 0; j + 3 < m.pts.length; j += 2) if (segDist(px, py, m.pts[j], m.pts[j + 1], m.pts[j + 2], m.pts[j + 3]) < reach) return true;
    return false;
  }
  const hw = f.w / 2;
  const hh = f.h / 2;
  const inside = Math.abs(lx) <= hw + tol && Math.abs(ly) <= hh + tol;
  if (m.t !== "shape") return inside;
  // Shapes: filled ones anywhere inside; open ones on their line (small ones anywhere inside).
  if (m.fill || (f.w < tol * 4 && f.h < tol * 4)) return inside;
  const reach = m.width / 2 + tol;
  if (m.shape === "bracket") {
    const [lx2, ly2] = [lx + f.cx, ly + f.cy];
    return shapeSegments(m).some(([ax, ay, bx, by]) => segDist(lx2, ly2, ax, ay, bx, by) < reach);
  }
  if (m.shape === "rect") return inside && (hw - Math.abs(lx) < reach || hh - Math.abs(ly) < reach);
  // Ellipse: how far from its outline, roughly.
  const r = Math.hypot(lx / Math.max(hw, 1), ly / Math.max(hh, 1));
  return Math.abs(r - 1) * Math.min(hw, hh) < reach;
}

/** The top-most mark at `x`, `y` (units), within `tol`. */
export function hitTest(marks: Mark[], x: number, y: number, tol: number, skip?: (m: Mark) => boolean): Mark | null {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (skip?.(m)) continue;
    if (hits(m, x, y, tol)) return m;
  }
  return null;
}

// ---------------------------------------------------------------- changing marks

export function translate<M extends Mark>(m: M, dx: number, dy: number): M {
  if (m.t === "ink") return { ...m, pts: m.pts.map((v, i) => v + (i % 2 ? dy : dx)) };
  if (m.t === "text" || m.t === "image") return { ...m, x: m.x + dx, y: m.y + dy };
  const s = m as ShapeMark;
  return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy } as M;
}

/** Scales a mark by `s` about `px`, `py` (the same in both directions; line widths too). */
export function scaleAbout<M extends Mark>(m: M, s: number, px: number, py: number): M {
  const sx = (v: number) => px + (v - px) * s;
  const sy = (v: number) => py + (v - py) * s;
  if (m.t === "ink") return { ...m, pts: m.pts.map((v, i) => (i % 2 ? sy(v) : sx(v))), width: m.width * s };
  if (m.t === "text") return { ...m, x: sx(m.x), y: sy(m.y), size: m.size * s, ...(m.w ? { w: m.w * s } : {}) };
  if (m.t === "image") return { ...m, x: sx(m.x), y: sy(m.y), w: m.w * s, h: m.h * s };
  const sh = m as ShapeMark;
  return { ...sh, x1: sx(sh.x1), y1: sy(sh.y1), x2: sx(sh.x2), y2: sy(sh.y2), width: sh.width * s } as M;
}

/** Turns a mark by `deg` about `px`, `py`. */
export function rotateAbout<M extends Mark>(m: M, deg: number, px: number, py: number): M {
  if (isLineShape(m)) {
    const [x1, y1] = rotatePt(m.x1, m.y1, px, py, deg);
    const [x2, y2] = rotatePt(m.x2, m.y2, px, py, deg);
    return { ...m, x1, y1, x2, y2 };
  }
  const f = frameOf(m);
  const [cx, cy] = rotatePt(f.cx, f.cy, px, py, deg);
  const moved = translate(m, cx - f.cx, cy - f.cy);
  return { ...moved, rot: normAngle((m.rot ?? 0) + deg) || undefined };
}

/** A single mark resized to a new frame (same turn). Text: `"width"` sets the width it wraps at
    (its height follows, top kept); otherwise text scales, size and all. */
export function resizeTo<M extends Mark>(m: M, f: Frame, mode: "scale" | "width" = "scale"): M {
  const old = frameOf(m);
  if (m.t === "image") return { ...m, x: f.cx - f.w / 2, y: f.cy - f.h / 2, w: f.w, h: f.h };
  if (m.t === "text") {
    if (mode === "width") {
      const pad = m.frame ? m.size * 0.3 : 0;
      // Never narrower than its longest word (it would break inside words).
      const next = { ...m, w: Math.max(m.size * 0.8, longestWord(m), f.w - pad * 2), x: f.cx, y: f.cy };
      // Keep the top where it was: the height comes from the wrapped text.
      const nf = frameOf(next);
      const d = (nf.h - old.h) / 2;
      const [ox, oy] = rotatePt(0, d, 0, 0, old.rot);
      return { ...next, x: f.cx + ox, y: f.cy + oy };
    }
    const s = f.w / Math.max(old.w, 0.01);
    return { ...m, x: f.cx, y: f.cy, size: Math.max(2, m.size * s), ...(m.w ? { w: m.w * s } : {}) };
  }
  if (m.t === "ink") {
    const p = m.width / 2;
    const iw = old.w - p * 2;
    const ih = old.h - p * 2;
    const kx = iw > 0.5 ? (f.w - p * 2) / iw : 1;
    const ky = ih > 0.5 ? (f.h - p * 2) / ih : 1;
    return { ...m, pts: m.pts.map((v, i) => (i % 2 ? f.cy + (v - old.cy) * ky : f.cx + (v - old.cx) * kx)) };
  }
  const sh = m as ShapeMark;
  if (isBoxShape(sh.shape)) return { ...sh, x1: f.cx - f.w / 2, y1: f.cy - f.h / 2, x2: f.cx + f.w / 2, y2: f.cy + f.h / 2 } as M;
  const kx = old.w > 0.5 ? f.w / old.w : 1;
  const ky = old.h > 0.5 ? f.h / old.h : 1;
  const mx = (v: number) => f.cx + (v - old.cx) * kx;
  const my = (v: number) => f.cy + (v - old.cy) * ky;
  return { ...sh, x1: mx(sh.x1), y1: my(sh.y1), x2: mx(sh.x2), y2: my(sh.y2) } as M;
}

/** A text mark after a change (typing, a new size, bold), moved so it grows the way its alignment
    says: left-aligned text keeps its left edge, right-aligned its right, centred its centre; and
    every box keeps its top. */
export function reanchorText(prev: TextMark, next: TextMark): TextMark {
  const a = frameOf(prev);
  const b = frameOf(next);
  const align = next.align ?? "center";
  const dx = align === "left" ? (b.w - a.w) / 2 : align === "right" ? -(b.w - a.w) / 2 : 0;
  const dy = (b.h - a.h) / 2;
  const [ox, oy] = rotatePt(dx, dy, 0, 0, a.rot);
  return { ...next, x: next.x + ox, y: next.y + oy };
}

// ---------------------------------------------------------------- snapping

export type Guides = { xs: number[]; ys: number[] };

/** Where things snap to while moving: the page's edges and middle, and other marks' edges and
    middles. */
export function snapTargets(others: Mark[], pageH: number) {
  const xs = [0, UNITS / 2, UNITS];
  const ys = [0, pageH / 2, pageH];
  for (const m of others) {
    const b = aabb(m);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}

/** Moves `box` by `dx`, `dy`, nudged so its edge or middle lines up with a target when one is within
    `thr`. Returns the move and the lines it lined up with. */
export function snapMove(box: Box, dx: number, dy: number, targets: { xs: number[]; ys: number[] }, thr: number) {
  const pick = (vals: number[], ts: number[]) => {
    let best: { d: number; t: number } | null = null;
    for (const v of vals) for (const t of ts) {
      const d = t - v;
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
    }
    return best;
  };
  const x = box.x + dx;
  const y = box.y + dy;
  const sx = pick([x, x + box.w / 2, x + box.w], targets.xs);
  const sy = pick([y, y + box.h / 2, y + box.h], targets.ys);
  const ndx = dx + (sx?.d ?? 0);
  const ndy = dy + (sy?.d ?? 0);
  // Every target the moved box now lines up with (several can at once).
  const fx = box.x + ndx;
  const fy = box.y + ndy;
  const near = (v: number, t: number) => Math.abs(v - t) < 0.01;
  const xs = sx ? [...new Set(targets.xs.filter((t) => [fx, fx + box.w / 2, fx + box.w].some((v) => near(v, t))))] : [];
  const ys = sy ? [...new Set(targets.ys.filter((t) => [fy, fy + box.h / 2, fy + box.h].some((v) => near(v, t))))] : [];
  return { dx: ndx, dy: ndy, guides: { xs, ys } as Guides };
}



/** A line, arrow, hairpin or bracket as SVG path data (boxes and ellipses are drawn as their own
    elements). */
export function shapePath(m: ShapeMark) {
  const { x1, y1, x2, y2 } = m;
  if (m.shape === "arrow") {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.max(12, m.width * 5);
    const p = (da: number) => `${x2 - len * Math.cos(a + da)} ${y2 - len * Math.sin(a + da)}`;
    return `M${x1} ${y1}L${x2} ${y2}M${p(0.45)}L${x2} ${y2}L${p(-0.45)}`;
  }
  if (m.shape === "line") return `M${x1} ${y1}L${x2} ${y2}`;
  const segs = shapeSegments(m);
  return segs.map(([ax, ay, bx, by], i) => `${i ? "" : `M${ax} ${ay}`}L${bx} ${by}`).join("");
}

/** The SVG/canvas transform that turns a mark (about its box's centre), or null. */
export function turnOf(m: Mark): { deg: number; cx: number; cy: number } | null {
  if (!m.rot || (m.t === "shape" && !isBoxShape(m.shape))) return null;
  const f = frameOf(m);
  return { deg: m.rot, cx: f.cx, cy: f.cy };
}

/** Where an image mark's picture comes from: `kind:id`. */
export const imageKey = (m: ImageMark) => `${m.src.kind}:${m.src.id}`;
