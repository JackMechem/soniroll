/**
 * The markings on a PDF, kept apart from the PDF itself (Convex `pdfMarkups`, one JSON string per
 * file). The original file is never changed: the editor draws this layer over it, and "Download
 * with markings" bakes it into a new PDF (`exportPdf.ts`).
 *
 * Every page is measured in units: 1000 wide, and as tall as the page is in that frame
 * (`1000 × height / width` as it's shown, after rotation). Marks keep their places at any zoom.
 *
 * Version 2 (2026-11-23) made every mark an object you can move, resize and turn: each has an
 * optional `rot` (degrees clockwise about its box's centre), `opacity` and `locked`; text gained
 * a box width (it wraps), bold/italic/underline, alignment, line height and more fonts; shapes a
 * fill; and there are images. Version 1 layers are turned into version 2 when they're read
 * (`parseLayer`), looking just as they did.
 */

import type { StoredKind } from "@jam-practice/core/files";

export type Rotation = 0 | 90 | 180 | 270;

/** Where a page comes from: a page of the PDF (0-based), or a page added in the editor. */
export type PageSource =
  /** `file`: a page of another of your PDFs (a `files` id), inserted into this one. */
  | { kind: "pdf"; page: number; file?: string }
  | { kind: "blank" }
  | { kind: "staff" };

/** What every mark has. `rot`: turned clockwise about the centre of its box, in degrees (not used
    by lines, arrows and hairpins: their ends say where they point). */
type Common = { id: string; rot?: number; opacity?: number; locked?: boolean };

/** A pen or highlighter stroke: `pts` is x, y, x, y… (before `rot`). */
export type InkMark = Common & { t: "ink"; pts: number[]; color: string; width: number; highlight?: boolean };

/** Text of any kind: typed text and text boxes, music symbols (SMuFL glyphs), rehearsal letters,
    bar numbers, chord symbols, fingerings. `x`, `y` is its box's centre. Without `w` the box is
    as wide as the text (no wrapping); with it, the text wraps at that width. Styles are for the
    whole box. */
export type TextMark = Common & {
  t: "text";
  x: number;
  y: number;
  /** The width the text wraps at (inside the frame's padding). */
  w?: number;
  text: string;
  size: number;
  color: string;
  font: TextFont;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Centre when left out (how version 1 drew all text). */
  align?: TextAlign;
  /** Line height, times the size (1.25 when left out; 1 for music symbols). */
  lh?: number;
  frame?: "box" | "circle" | "fill";
  /** The fill behind a `fill` frame (white when left out). */
  bg?: string;
};
export type TextFont = "sans" | "serif" | "mono" | "hand" | "music";
export type TextAlign = "left" | "center" | "right";

/** A shape from one corner (or end) to the other. Boxes, ellipses and brackets are boxes (turned by
    `rot`); lines, arrows and hairpins go from (x1, y1) to (x2, y2). A cover (white-out) is a box with
    a `fill` and no line (`width` 0). */
export type ShapeMark = Common & {
  t: "shape";
  shape: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  fill?: string;
};
export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "cresc" | "dim" | "bracket";

/** A picture from your Files, by reference (never the picture itself: the layer has to stay small).
    `x`, `y` is its top-left corner before turning. */
export type ImageMark = Common & { t: "image"; x: number; y: number; w: number; h: number; src: { kind: StoredKind; id: string }; name?: string };

export type Mark = InkMark | TextMark | ShapeMark | ImageMark;

export type LayerPage = {
  id: string;
  src: PageSource;
  /** Turned clockwise from how the PDF shows it. */
  rotate: Rotation;
  marks: Mark[];
};

export const LAYER_VERSION = 2;
export type Layer = { v: 2; pages: LayerPage[] };

export const UNITS = 1000;

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/** The PDF's own pages, in order, with nothing on them. */
export function freshLayer(pageCount: number): Layer {
  return { v: 2, pages: Array.from({ length: pageCount }, (_, i) => ({ id: `p${i}`, src: { kind: "pdf", page: i }, rotate: 0, marks: [] })) };
}

/** A version 1 mark as version 2: only text's "bold" font changed (it's the sans font, bold now),
    and a bracket's box (its legs were always 18 units, whatever was dragged). */
function upgradeMark(m: Mark): Mark {
  if (m.t === "text" && (m.font as string) === "bold") return { ...m, font: "sans", bold: true };
  // Drawn along its first point's height with 18-unit legs hanging down.
  if (m.t === "shape" && m.shape === "bracket") return { ...m, x1: Math.min(m.x1, m.x2), x2: Math.max(m.x1, m.x2), y1: m.y1, y2: m.y1 + 18 };
  return m;
}

export type ParsedLayer = { layer: Layer; /** Saved by a newer soniroll: shown, but not saved over. */ newer: boolean };

/** A saved layer (version 1 is upgraded), or a fresh one when there's none (or it can't be read).
    Pages that point past the end of this PDF are dropped. */
export function parseLayerInfo(json: string | null | undefined, pageCount: number): ParsedLayer {
  if (!json) return { layer: freshLayer(pageCount), newer: false };
  try {
    const raw = JSON.parse(json) as { v?: number; pages?: LayerPage[] };
    if (!raw || !Array.isArray(raw.pages) || typeof raw.v !== "number") return { layer: freshLayer(pageCount), newer: false };
    const newer = raw.v > LAYER_VERSION;
    let pages = raw.pages.filter((p) => p.src.kind !== "pdf" || !!p.src.file || p.src.page < pageCount);
    if (raw.v === 1) pages = pages.map((p) => ({ ...p, marks: p.marks.map(upgradeMark) }));
    return { layer: { v: 2, pages }, newer };
  } catch {
    return { layer: freshLayer(pageCount), newer: false };
  }
}

export function parseLayer(json: string | null | undefined, pageCount: number): Layer {
  return parseLayerInfo(json, pageCount).layer;
}

export function isEmptyLayer(layer: Layer, pageCount: number) {
  return (
    layer.pages.length === pageCount &&
    layer.pages.every((p, i) => p.src.kind === "pdf" && !p.src.file && p.src.page === i && p.rotate === 0 && p.marks.length === 0)
  );
}

/** Height ÷ width of a page as it's shown. `pdfAspects[i]` is the PDF page's own (with its own
    rotation), `others` the same for inserted PDFs; added pages take the first page's shape. */
export function pageAspect(page: LayerPage, pdfAspects: number[], others?: Record<string, number[] | undefined>) {
  const own = page.src.kind === "pdf" ? (page.src.file ? others?.[page.src.file] : pdfAspects)?.[page.src.page] : undefined;
  const base = own ?? pdfAspects[0] ?? 1.294;
  return page.rotate % 180 === 0 ? base : 1 / base;
}

/** Box shapes (turned by `rot`); the rest go end to end. */
export const isBoxShape = (shape: ShapeKind) => shape === "rect" || shape === "ellipse" || shape === "bracket";

/** The marks on a page turned a quarter clockwise, to stay where they were on the paper. `aspect`
    is the page's height ÷ width before turning. Everything turns with the paper. */
export function rotateMarks(marks: Mark[], aspect: number): Mark[] {
  const h = UNITS * aspect;
  const s = UNITS / h; // the turned page is `h` wide, scaled back to 1000
  const pt = (x: number, y: number): [number, number] => [(h - y) * s, x * s];
  const turn = (rot: number | undefined) => normAngle((rot ?? 0) + 90);
  return marks.map((m) => {
    if (m.t === "ink") {
      // The points turn with the page; turning them all is the same as turning the stroke.
      const pts: number[] = [];
      for (let i = 0; i < m.pts.length; i += 2) pts.push(...pt(m.pts[i], m.pts[i + 1]));
      return { ...m, pts, width: m.width * s };
    }
    if (m.t === "text") {
      const [x, y] = pt(m.x, m.y);
      return { ...m, x, y, size: m.size * s, ...(m.w ? { w: m.w * s } : {}), rot: turn(m.rot) };
    }
    if (m.t === "image") {
      const [cx, cy] = pt(m.x + m.w / 2, m.y + m.h / 2);
      const w = m.w * s;
      const hh = m.h * s;
      return { ...m, x: cx - w / 2, y: cy - hh / 2, w, h: hh, rot: turn(m.rot) };
    }
    if (isBoxShape(m.shape)) {
      const [cx, cy] = pt((m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2);
      const w = (Math.abs(m.x2 - m.x1) * s) / 2;
      const hh = (Math.abs(m.y2 - m.y1) * s) / 2;
      return { ...m, x1: cx - w, y1: cy - hh, x2: cx + w, y2: cy + hh, width: m.width * s, rot: turn(m.rot) };
    }
    const [x1, y1] = pt(m.x1, m.y1);
    const [x2, y2] = pt(m.x2, m.y2);
    return { ...m, x1, y1, x2, y2, width: m.width * s };
  });
}

/** An angle in degrees, in (-180, 180]. */
export function normAngle(a: number) {
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.abs(r) < 1e-6 ? 0 : r;
}

/** Rounds to two decimals, so saved ink stays small. */
export const r2 = (v: number) => Math.round(v * 100) / 100;

/** A mark with its numbers rounded (saved layers stay small). */
export function roundMark<M extends Mark>(m: M): M {
  const o = { ...m } as Record<string, unknown>;
  for (const k of ["x", "y", "w", "h", "x1", "y1", "x2", "y2", "size", "width"]) if (typeof o[k] === "number") o[k] = r2(o[k] as number);
  if (typeof o.rot === "number") o.rot = Math.round((o.rot as number) * 10) / 10 || undefined;
  if (Array.isArray(o.pts)) o.pts = (o.pts as number[]).map(r2);
  return o as M;
}

// ---------------------------------------------------------------- what can be placed

/** Ink colours. Markings sit on paper (white), not on the theme, so these are fixed. */
export const INKS = [
  { name: "Black", color: "#1f2328" },
  { name: "Red", color: "#d1242f" },
  { name: "Blue", color: "#0969da" },
  { name: "Green", color: "#1a7f37" },
  { name: "Orange", color: "#bc4c00" },
  { name: "Purple", color: "#8250df" },
] as const;

/** Text and shape colours: the inks, plus grey and white (for text on a dark fill). */
export const COLORS = [...INKS, { name: "Grey", color: "#6e7781" }, { name: "White", color: "#ffffff" }] as const;

export const HIGHLIGHTS = [
  { name: "Yellow", color: "#ffe14d" },
  { name: "Green", color: "#7ee787" },
  { name: "Pink", color: "#ff9bce" },
  { name: "Blue", color: "#80ccff" },
  { name: "Orange", color: "#ffb35c" },
] as const;

/** Fills for boxes and behind text. */
export const FILLS = [
  { name: "White", color: "#ffffff" },
  { name: "Cream", color: "#fff8e1" },
  ...HIGHLIGHTS,
  { name: "Grey", color: "#e6e8eb" },
  { name: "Black", color: "#1f2328" },
] as const;

export type Stamp = {
  label: string;
  text: string;
  font: TextFont;
  bold?: boolean;
  size: number;
  frame?: TextMark["frame"];
  /** Counts up each time it's placed. */
  next?: "letter" | "number";
};

/** Music symbols, drawn with Petaluma (SMuFL code points). */
export const SYMBOLS: { group: string; items: Stamp[] }[] = [
  {
    group: "Road map",
    items: [
      { label: "Fermata", text: "\uE4C0", font: "music", size: 44 },
      { label: "Segno", text: "\uE047", font: "music", size: 44 },
      { label: "Coda", text: "\uE048", font: "music", size: 44 },
      { label: "Start repeat", text: "\uE040", font: "music", size: 44 },
      { label: "End repeat", text: "\uE041", font: "music", size: 44 },
      { label: "D.S.", text: "\uE045", font: "music", size: 44 },
      { label: "D.C.", text: "\uE046", font: "music", size: 44 },
      { label: "Fine", text: "Fine", font: "hand", size: 26 },
      { label: "To coda", text: "To \uE048", font: "hand", size: 26 },
      { label: "Breath", text: "\uE4CE", font: "music", size: 44 },
      { label: "Caesura", text: "\uE4D1", font: "music", size: 44 },
    ],
  },
  {
    group: "Dynamics",
    items: [
      { label: "ppp", text: "\uE52A", font: "music", size: 44 },
      { label: "pp", text: "\uE52B", font: "music", size: 44 },
      { label: "p", text: "\uE520", font: "music", size: 44 },
      { label: "mp", text: "\uE52C", font: "music", size: 44 },
      { label: "mf", text: "\uE52D", font: "music", size: 44 },
      { label: "f", text: "\uE522", font: "music", size: 44 },
      { label: "ff", text: "\uE52F", font: "music", size: 44 },
      { label: "fff", text: "\uE530", font: "music", size: 44 },
      { label: "sfz", text: "\uE539", font: "music", size: 44 },
      { label: "fp", text: "\uE534", font: "music", size: 44 },
    ],
  },
  {
    group: "Articulations",
    items: [
      { label: "Accent", text: "\uE4A0", font: "music", size: 44 },
      { label: "Staccato", text: "\uE4A2", font: "music", size: 44 },
      { label: "Tenuto", text: "\uE4A4", font: "music", size: 44 },
      { label: "Marcato", text: "\uE4AC", font: "music", size: 44 },
    ],
  },
];

/** Rehearsal and bar tools: letters and numbers count up as they're placed. */
export const STAMPS: Stamp[] = [
  { label: "Rehearsal letter", text: "A", font: "sans", bold: true, size: 30, frame: "box", next: "letter" },
  { label: "Bar number", text: "1", font: "sans", size: 18, next: "number" },
  { label: "Circled number", text: "1", font: "sans", bold: true, size: 20, frame: "circle", next: "number" },
  { label: "Fingering", text: "1", font: "sans", bold: true, size: 20 },
];

/** What the Shapes popover offers: the shapes, and a cover (a box filled like the paper, no line). */
export type ShapeChoice = ShapeKind | "cover";
export const SHAPES: { shape: ShapeChoice; label: string }[] = [
  { shape: "line", label: "Line" },
  { shape: "arrow", label: "Arrow" },
  { shape: "rect", label: "Box" },
  { shape: "ellipse", label: "Circle" },
  { shape: "cresc", label: "Crescendo" },
  { shape: "dim", label: "Diminuendo" },
  { shape: "bracket", label: "Bracket" },
  { shape: "cover", label: "Cover (white-out)" },
];

/** The stamp's text after `text`: B after A, 13 after 12. */
export function nextStampText(text: string, next: Stamp["next"]) {
  if (next === "letter") {
    const c = text.charCodeAt(0);
    return c >= 65 && c < 90 ? String.fromCharCode(c + 1) : "A";
  }
  if (next === "number") return String((parseInt(text, 10) || 0) + 1);
  return text;
}

/** A smooth SVG path through ink points (midpoint quadratic curves). */
export function inkPath(pts: number[]) {
  if (pts.length < 2) return "";
  if (pts.length <= 4) return `M${pts[0]} ${pts[1]}L${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2;
    const my = (pts[i + 1] + pts[i + 3]) / 2;
    d += `Q${pts[i]} ${pts[i + 1]} ${mx} ${my}`;
  }
  return d + `L${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
}

/** Staff lines for a staff page, in units: 12 staves of 5 lines. */
export function staffLines(aspect: number) {
  const h = UNITS * aspect;
  const top = h * 0.08;
  const gap = (h * 0.86) / 12;
  const line = gap * 0.075;
  const ys: number[] = [];
  for (let s = 0; s < 12; s++) for (let l = 0; l < 5; l++) ys.push(top + s * gap + l * line * 1.6 + gap * 0.2);
  return { ys, x1: 70, x2: UNITS - 70, stroke: 1.4 };
}
