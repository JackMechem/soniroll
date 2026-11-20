/**
 * The markings on a PDF, kept apart from the PDF itself (Convex `pdfMarkups`, one JSON string per
 * file). The original file is never changed: the editor draws this layer over it, and "Download
 * with markings" bakes it into a new PDF (`exportPdf.ts`).
 *
 * Every page is measured in units: 1000 wide, and as tall as the page is in that frame
 * (`1000 × height / width` as it's shown, after rotation). Marks keep their places at any zoom.
 */

export type Rotation = 0 | 90 | 180 | 270;

/** Where a page comes from: a page of the PDF (0-based), or a page added in the editor. */
export type PageSource = { kind: "pdf"; page: number } | { kind: "blank" } | { kind: "staff" };

export type InkMark = { id: string; t: "ink"; pts: number[]; color: string; width: number; highlight?: boolean };

/** Text of any kind: typed text and text boxes, music symbols (SMuFL glyphs), rehearsal letters,
    bar numbers, chord symbols, fingerings. `x`, `y` is its centre. */
export type TextMark = {
  id: string;
  t: "text";
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  font: TextFont;
  frame?: "box" | "circle" | "fill";
};
export type TextFont = "sans" | "bold" | "hand" | "music";

/** A shape from one corner (or end) to the other. */
export type ShapeMark = {
  id: string;
  t: "shape";
  shape: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
};
export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "cresc" | "dim" | "bracket";

export type Mark = InkMark | TextMark | ShapeMark;

export type LayerPage = {
  id: string;
  src: PageSource;
  /** Turned clockwise from how the PDF shows it. */
  rotate: Rotation;
  marks: Mark[];
};

export type Layer = { v: 1; pages: LayerPage[] };

export const UNITS = 1000;

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/** The PDF's own pages, in order, with nothing on them. */
export function freshLayer(pageCount: number): Layer {
  return { v: 1, pages: Array.from({ length: pageCount }, (_, i) => ({ id: `p${i}`, src: { kind: "pdf", page: i }, rotate: 0, marks: [] })) };
}

/** A saved layer, or a fresh one when there's none (or it can't be read). Pages that point past the
    end of the PDF are dropped. */
export function parseLayer(json: string | null | undefined, pageCount: number): Layer {
  if (!json) return freshLayer(pageCount);
  try {
    const layer = JSON.parse(json) as Layer;
    if (layer?.v !== 1 || !Array.isArray(layer.pages)) return freshLayer(pageCount);
    const pages = layer.pages.filter((p) => p.src.kind !== "pdf" || p.src.page < pageCount);
    return { v: 1, pages };
  } catch {
    return freshLayer(pageCount);
  }
}

export function isEmptyLayer(layer: Layer, pageCount: number) {
  return (
    layer.pages.length === pageCount &&
    layer.pages.every((p, i) => p.src.kind === "pdf" && p.src.page === i && p.rotate === 0 && p.marks.length === 0)
  );
}

/** Height ÷ width of a page as it's shown. `pdfAspects[i]` is the PDF page's own (with its own
    rotation); added pages take the first page's shape. */
export function pageAspect(page: LayerPage, pdfAspects: number[]) {
  const base = page.src.kind === "pdf" ? pdfAspects[page.src.page] ?? 1.294 : pdfAspects[0] ?? 1.294;
  return page.rotate % 180 === 0 ? base : 1 / base;
}

/** The marks on a page turned a quarter clockwise, to stay where they were on the paper. `aspect`
    is the page's height ÷ width before turning. */
export function rotateMarks(marks: Mark[], aspect: number): Mark[] {
  const h = UNITS * aspect;
  const s = UNITS / h; // the turned page is `h` wide, scaled back to 1000
  const pt = (x: number, y: number): [number, number] => [(h - y) * s, x * s];
  return marks.map((m) => {
    if (m.t === "ink") {
      const pts: number[] = [];
      for (let i = 0; i < m.pts.length; i += 2) pts.push(...pt(m.pts[i], m.pts[i + 1]));
      return { ...m, pts, width: m.width * s };
    }
    if (m.t === "text") {
      const [x, y] = pt(m.x, m.y);
      return { ...m, x, y, size: m.size * s };
    }
    const [x1, y1] = pt(m.x1, m.y1);
    const [x2, y2] = pt(m.x2, m.y2);
    return { ...m, x1, y1, x2, y2, width: m.width * s };
  });
}

/** Moves a mark by `dx`, `dy` units. */
export function moveMark(m: Mark, dx: number, dy: number): Mark {
  if (m.t === "ink") return { ...m, pts: m.pts.map((v, i) => v + (i % 2 ? dy : dx)) };
  if (m.t === "text") return { ...m, x: m.x + dx, y: m.y + dy };
  return { ...m, x1: m.x1 + dx, y1: m.y1 + dy, x2: m.x2 + dx, y2: m.y2 + dy };
}

/** Rounds to two decimals, so saved ink stays small. */
export const r2 = (v: number) => Math.round(v * 100) / 100;

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

export const HIGHLIGHTS = [
  { name: "Yellow", color: "#ffe14d" },
  { name: "Green", color: "#7ee787" },
  { name: "Pink", color: "#ff9bce" },
  { name: "Blue", color: "#80ccff" },
  { name: "Orange", color: "#ffb35c" },
] as const;

export type Stamp = { label: string; text: string; font: TextFont; size: number; frame?: TextMark["frame"]; /** Counts up each time it's placed. */ next?: "letter" | "number" };

/** Music symbols, drawn with Petaluma (SMuFL code points). */
export const SYMBOLS: { group: string; items: Stamp[] }[] = [
  {
    group: "Road map",
    items: [
      { label: "Fermata", text: "", font: "music", size: 44 },
      { label: "Segno", text: "", font: "music", size: 44 },
      { label: "Coda", text: "", font: "music", size: 44 },
      { label: "Start repeat", text: "", font: "music", size: 44 },
      { label: "End repeat", text: "", font: "music", size: 44 },
      { label: "D.S.", text: "", font: "music", size: 44 },
      { label: "D.C.", text: "", font: "music", size: 44 },
      { label: "Fine", text: "Fine", font: "hand", size: 26 },
      { label: "To coda", text: "To ", font: "hand", size: 26 },
      { label: "Breath", text: "", font: "music", size: 44 },
      { label: "Caesura", text: "", font: "music", size: 44 },
    ],
  },
  {
    group: "Dynamics",
    items: [
      { label: "ppp", text: "", font: "music", size: 44 },
      { label: "pp", text: "", font: "music", size: 44 },
      { label: "p", text: "", font: "music", size: 44 },
      { label: "mp", text: "", font: "music", size: 44 },
      { label: "mf", text: "", font: "music", size: 44 },
      { label: "f", text: "", font: "music", size: 44 },
      { label: "ff", text: "", font: "music", size: 44 },
      { label: "fff", text: "", font: "music", size: 44 },
      { label: "sfz", text: "", font: "music", size: 44 },
      { label: "fp", text: "", font: "music", size: 44 },
    ],
  },
  {
    group: "Articulations",
    items: [
      { label: "Accent", text: "", font: "music", size: 44 },
      { label: "Staccato", text: "", font: "music", size: 44 },
      { label: "Tenuto", text: "", font: "music", size: 44 },
      { label: "Marcato", text: "", font: "music", size: 44 },
    ],
  },
];

/** Rehearsal and bar tools: letters and numbers count up as they're placed. */
export const STAMPS: Stamp[] = [
  { label: "Rehearsal letter", text: "A", font: "bold", size: 30, frame: "box", next: "letter" },
  { label: "Bar number", text: "1", font: "sans", size: 18, next: "number" },
  { label: "Circled number", text: "1", font: "bold", size: 20, frame: "circle", next: "number" },
  { label: "Fingering", text: "1", font: "bold", size: 20 },
];

export const SHAPES: { shape: ShapeKind; label: string }[] = [
  { shape: "line", label: "Line" },
  { shape: "arrow", label: "Arrow" },
  { shape: "rect", label: "Box" },
  { shape: "ellipse", label: "Circle" },
  { shape: "cresc", label: "Crescendo" },
  { shape: "dim", label: "Diminuendo" },
  { shape: "bracket", label: "Bracket" },
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
