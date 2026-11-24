import { UNITS, type TextFont } from "@/components/pdf/markup";
import { loadPdfjs, type PDFDocumentProxy } from "@/lib/pdfjs";

/**
 * The PDF's own text, for "Edit text": pdf.js's text layer (`getTextContent`) gathered into runs —
 * the pieces of one line that sit together — each with where it is on the page (units, as the page
 * is shown) and a guess at its font. Scanned PDFs have none.
 */

export type TextRun = {
  text: string;
  /** The run's box before turning: its centre, length along the line and height. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Degrees clockwise (0 for ordinary text). */
  angle: number;
  /** Where the baseline starts, and the text's size (its font height). */
  ox: number;
  oy: number;
  size: number;
  font: TextFont;
  bold: boolean;
  italic: boolean;
};

type Item = { str: string; transform: number[]; width: number; height: number; fontName: string; hasEOL?: boolean };
type Style = { fontFamily?: string; ascent?: number; descent?: number };
type FontInfo = { name?: string; bold?: boolean; italic?: boolean; black?: boolean; isSerifFont?: boolean; isMonospace?: boolean };

const cache = new WeakMap<PDFDocumentProxy, Map<string, Promise<TextRun[]>>>();

/** The text runs on page `index` (0-based) of `doc`, turned `extra` degrees past its own rotation. */
export function pageTextRuns(doc: PDFDocumentProxy, index: number, extra: number): Promise<TextRun[]> {
  let forDoc = cache.get(doc);
  if (!forDoc) cache.set(doc, (forDoc = new Map()));
  const key = `${index}:${extra}`;
  let found = forDoc.get(key);
  if (!found) {
    found = readRuns(doc, index, extra).catch(() => []);
    forDoc.set(key, found);
  }
  return found;
}

function guessFont(style: Style | undefined, info: FontInfo | null): { font: TextFont; bold: boolean; italic: boolean } {
  const name = (info?.name ?? "").replace(/^[A-Z]{6}\+/, "");
  const fam = style?.fontFamily ?? "";
  const mono = info?.isMonospace || /courier|mono|consol/i.test(name) || fam === "monospace";
  const serif = !mono && (info?.isSerifFont || /times|serif|roman|georgia|garamond|minion|cambria|book|palatino/i.test(name) || fam === "serif") && !/sans/i.test(name);
  return {
    font: mono ? "mono" : serif ? "serif" : "sans",
    bold: !!info?.bold || !!info?.black || /bold|black|heavy|semibold|demi/i.test(name),
    italic: !!info?.italic || /italic|oblique/i.test(name),
  };
}

async function readRuns(doc: PDFDocumentProxy, index: number, extra: number): Promise<TextRun[]> {
  const pdfjs = await loadPdfjs();
  const page = await doc.getPage(index + 1);
  const rotation = (page.rotate + extra) % 360;
  const base = page.getViewport({ scale: 1, rotation });
  const vp = page.getViewport({ scale: UNITS / base.width, rotation });
  const content = await page.getTextContent();
  const styles = content.styles as Record<string, Style>;
  const fontInfo = (name: string): FontInfo | null => {
    try {
      const objs = page.commonObjs as unknown as { has: (n: string) => boolean; get: (n: string) => FontInfo };
      return objs.has(name) ? objs.get(name) : null;
    } catch {
      return null;
    }
  };

  type Open = { text: string; ox: number; oy: number; dir: [number, number]; angle: number; size: number; end: number; ascent: number; descent: number; style: Style | undefined; fontName: string };
  const runs: TextRun[] = [];
  let open: Open | null = null;
  const close = () => {
    if (!open) return;
    const o: Open = open;
    open = null;
    const text = o.text.replace(/\s+$/, "").replace(/^\s+/, "");
    if (!text) return;
    const [dx, dy] = o.dir;
    const nx = -dy;
    const ny = dx;
    const top = -o.ascent * o.size;
    const bottom = -o.descent * o.size;
    const along = o.end / 2;
    const across = (top + bottom) / 2;
    const g = guessFont(o.style, fontInfo(o.fontName));
    runs.push({
      text,
      cx: o.ox + dx * along + nx * across,
      cy: o.oy + dy * along + ny * across,
      w: o.end,
      h: bottom - top,
      angle: Math.abs(o.angle) < 0.5 ? 0 : o.angle,
      ox: o.ox,
      oy: o.oy,
      size: o.size,
      ...g,
    });
  };

  for (const raw of content.items as Item[]) {
    if (typeof raw.str !== "string") continue;
    const tx = pdfjs.Util.transform(vp.transform, raw.transform) as number[];
    const size = Math.hypot(tx[2], tx[3]);
    if (!size || (!raw.str.trim() && !open)) {
      if (raw.hasEOL) close();
      continue;
    }
    const angle = (Math.atan2(tx[1], tx[0]) * 180) / Math.PI;
    const dir: [number, number] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
    const len = raw.width * vp.scale;
    const style = styles[raw.fontName];
    const [ox, oy] = [tx[4], tx[5]];
    if (open) {
      const o: Open = open;
      const rx = ox - o.ox;
      const ry = oy - o.oy;
      const along = rx * o.dir[0] + ry * o.dir[1];
      const across = -rx * o.dir[1] + ry * o.dir[0];
      const gap = along - o.end;
      const fits = Math.abs(angle - o.angle) < 1 && Math.abs(across) < o.size * 0.35 && gap > -o.size * 0.5 && gap < o.size * 1.2 && size / o.size > 0.7 && size / o.size < 1.4;
      if (fits) {
        if (gap > o.size * 0.18 && !/\s$/.test(o.text) && !/^\s/.test(raw.str)) o.text += " ";
        o.text += raw.str;
        o.end = Math.max(o.end, along + len);
        if (raw.hasEOL) close();
        continue;
      }
      close();
    }
    if (!raw.str.trim()) continue;
    open = { text: raw.str, ox, oy, dir, angle, size, end: len, ascent: style?.ascent ?? 0.8, descent: style?.descent ?? -0.2, style, fontName: raw.fontName };
    if (raw.hasEOL) close();
  }
  close();
  return runs;
}
