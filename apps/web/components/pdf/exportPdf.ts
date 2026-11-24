import { frameOf, layoutText, linePlace, rotatePt } from "@/components/pdf/geometry";
import { UNITS, staffLines, type Layer, type LayerPage, type Mark, type ShapeMark, type TextMark } from "@/components/pdf/markup";
import { drawMarks, fontFamily, opacityOf, underlineOf, type MarkImages } from "@/components/pdf/marksRender";

/** Pixels per unit for the drawn markings: 3000 px across a page, sharp when printed. */
const MARK_SCALE = 3;

type PdfLib = typeof import("pdf-lib");
type PdfLibDoc = Awaited<ReturnType<PdfLib["PDFDocument"]["create"]>>;
type PdfLibPage = ReturnType<PdfLibDoc["addPage"]>;
type PdfLibFont = Awaited<ReturnType<PdfLibDoc["embedFont"]>>;

/**
 * A new PDF with the layer applied: the pages in the layer's order and rotation (copied from the
 * original, so its text and music stay sharp), added blank and staff pages, and the markings over
 * each page. The original file isn't touched. `images`: the pictures image marks point at, by
 * `kind:id` (ones missing are left out).
 *
 * - **Text** in the sans, serif and typewriter fonts is written as real PDF text (Helvetica, Times,
 *   Courier, with bold and italic), so it's sharp, searchable and copyable; handwritten text, music
 *   symbols and letters those fonts can't write are drawn as a picture.
 * - **Covers** (boxes filled like the paper, no line) are real filled boxes, so they have no soft
 *   edge. The PDF's own words under a cover are still in the file (hidden, not removed).
 * - Everything else (ink, shapes, pictures, frames) is drawn in order into see-through pictures
 *   laid over the page: a new picture starts wherever real text or a cover comes between, so what's
 *   in front stays in front.
 * - **Sections** (bookmarks) become the PDF's outline (its bookmarks panel), sub-sections nested.
 */
export async function exportPdf(original: ArrayBuffer, layer: Layer, others: Record<string, ArrayBuffer> = {}, images?: MarkImages): Promise<Uint8Array> {
  const lib = await import("pdf-lib");
  const { PDFDocument, degrees, rgb } = lib;
  const src = await PDFDocument.load(original, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const otherDocs: Record<string, Awaited<ReturnType<typeof PDFDocument.load>>> = {};
  for (const [id, bytes] of Object.entries(others)) otherDocs[id] = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const first = src.getPageCount() ? src.getPage(0) : null;
  const firstSize = first ? first.getSize() : { width: 612, height: 792 };
  const turned = first ? first.getRotation().angle % 180 !== 0 : false;
  const paper = turned ? { width: firstSize.height, height: firstSize.width } : firstSize;

  // Fonts used by text marks must be loaded before they're drawn on a canvas.
  const fonts = new Set<string>();
  for (const p of layer.pages) for (const m of p.marks) if (m.t === "text") fonts.add(`${m.italic ? "italic " : ""}${m.bold ? 700 : 400} 20px ${fontFamily(m.font)}`);
  await Promise.all([...fonts].map((f) => document.fonts.load(f).catch(() => null)));
  const pdfFonts = new Map<string, PdfLibFont>();
  const fontFor = async (m: TextMark) => {
    const name = standardFont(lib, m);
    if (!name) return null;
    let f = pdfFonts.get(name);
    if (!f) pdfFonts.set(name, (f = await out.embedFont(name)));
    return f;
  };

  const placed: { page: LayerPage; pdfPage: PdfLibPage; map: PageMap }[] = [];
  for (const page of layer.pages) {
    let pdfPage;
    let total = page.rotate as number; // how far the page is turned, clockwise, as shown
    const from = page.src.kind === "pdf" ? (page.src.file ? otherDocs[page.src.file] : src) : null;
    if (page.src.kind === "pdf" && !from) continue; // an inserted PDF that's since been deleted
    if (page.src.kind === "pdf" && from) {
      const [copied] = await out.copyPages(from, [page.src.page]);
      total = (copied.getRotation().angle + page.rotate) % 360;
      copied.setRotation(degrees(total));
      pdfPage = out.addPage(copied);
    } else {
      // Added pages are drawn upright at the shown size, so they need no turning.
      const portrait = page.rotate % 180 === 0;
      pdfPage = out.addPage(portrait ? [paper.width, paper.height] : [paper.height, paper.width]);
      total = 0;
      if (page.src.kind === "staff") {
        const { width, height } = pdfPage.getSize();
        const s = width / UNITS;
        const staff = staffLines(height / width);
        for (const y of staff.ys) {
          pdfPage.drawLine({ start: { x: staff.x1 * s, y: height - y * s }, end: { x: staff.x2 * s, y: height - y * s }, thickness: staff.stroke * s, color: rgb(0.33, 0.33, 0.33) });
        }
      }
    }
    const map = pageMap(pdfPage, total);
    placed.push({ page, pdfPage, map });

    // The marks in order: real text and covers drawn as themselves, the rest in pictures between.
    let batch: Mark[] = [];
    const frameOnly = new Set<string>();
    const flush = async () => {
      if (batch.length) await drawLayerImage(out, pdfPage, batch, map, images, frameOnly);
      batch = [];
    };
    for (const m of page.marks) {
      if (isCover(m)) {
        await flush();
        drawCover(lib, pdfPage, m, map);
        continue;
      }
      const font = m.t === "text" ? await fontFor(m) : null;
      if (m.t === "text" && font && canWrite(font, m.text)) {
        // Its frame (box, circle, fill) is drawn with the pictures, just under its words.
        if (m.frame) {
          batch.push(m);
          frameOnly.add(m.id);
        }
        await flush();
        drawWords(lib, pdfPage, m, font, map);
        continue;
      }
      batch.push(m);
    }
    await flush();
  }

  addOutline(lib, out, placed);
  return out.save();
}

// ---------------------------------------------------------------- where things go on a PDF page

/** From a page as it's shown (units, y down) to the PDF page's own space (points, y up, before its
    /Rotate): `pt(x, y)`, plus how a direction turned `deg` clockwise on screen turns in the PDF
    (counter-clockwise degrees), and points per unit. */
type PageMap = { pt: (x: number, y: number) => [number, number]; angle: (deg: number) => number; k: number; total: number; box: { x: number; y: number; width: number; height: number } };

function pageMap(pdfPage: PdfLibPage, total: number): PageMap {
  const box = pdfPage.getCropBox();
  const W = box.width;
  const H = box.height;
  const shownW = total % 180 === 0 ? W : H;
  const k = shownW / UNITS;
  const pt = (u: number, v: number): [number, number] => {
    const xs = u * k;
    const ys = v * k;
    if (total === 90) return [box.x + ys, box.y + xs];
    if (total === 180) return [box.x + W - xs, box.y + ys];
    if (total === 270) return [box.x + W - ys, box.y + H - xs];
    return [box.x + xs, box.y + H - ys];
  };
  return { pt, angle: (deg) => total - deg, k, total, box };
}

const isCover = (m: Mark): m is ShapeMark => m.t === "shape" && m.shape === "rect" && !!m.fill && m.width === 0;

function hexColor(lib: PdfLib, hex: string) {
  const h = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "000000";
  return lib.rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

/** A cover as a filled box (turned with it). */
function drawCover(lib: PdfLib, pdfPage: PdfLibPage, m: ShapeMark, map: PageMap) {
  const f = frameOf(m);
  const w = f.w * map.k;
  const h = f.h * map.k;
  const a = map.angle(f.rot);
  const [cx, cy] = map.pt(f.cx, f.cy);
  const r = (a * Math.PI) / 180;
  // pdf-lib turns a box about its bottom-left corner.
  const x = cx - (w / 2) * Math.cos(r) + (h / 2) * Math.sin(r);
  const y = cy - (w / 2) * Math.sin(r) - (h / 2) * Math.cos(r);
  pdfPage.drawRectangle({ x, y, width: w, height: h, rotate: lib.degrees(a), color: hexColor(lib, m.fill!), opacity: opacityOf(m), borderWidth: 0 });
}

/** Helvetica, Times or Courier in the mark's weight and slant (none for handwritten text and
    symbols: they're drawn as pictures). */
function standardFont(lib: PdfLib, m: TextMark) {
  const S = lib.StandardFonts;
  const pick = (plain: string, bold: string, italic: string, both: string) => (m.bold && m.italic ? both : m.bold ? bold : m.italic ? italic : plain);
  if (m.font === "sans") return pick(S.Helvetica, S.HelveticaBold, S.HelveticaOblique, S.HelveticaBoldOblique);
  if (m.font === "serif") return pick(S.TimesRoman, S.TimesRomanBold, S.TimesRomanItalic, S.TimesRomanBoldItalic);
  if (m.font === "mono") return pick(S.Courier, S.CourierBold, S.CourierOblique, S.CourierBoldOblique);
  return null;
}

/** Whether a standard font has every letter (they cover Western European text only). */
function canWrite(font: PdfLibFont, text: string) {
  try {
    font.encodeText(text.replace(/\n/g, ""));
    return true;
  } catch {
    return false;
  }
}

/** How far the baseline sits below the middle of a line, as a share of the size (canvas draws text
    centred on its line, so that's where the screen puts it). */
const baselines = new Map<string, number>();
function baselineShare(m: TextMark) {
  const key = `${m.font}${m.bold ? "b" : ""}${m.italic ? "i" : ""}`;
  let v = baselines.get(key);
  if (v === undefined) {
    v = 0.28;
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = `${m.italic ? "italic " : ""}${m.bold ? 700 : 400} 100px ${fontFamily(m.font)}`;
      ctx.textBaseline = "middle";
      const a = ctx.measureText("Hg").alphabeticBaseline;
      if (typeof a === "number" && isFinite(a) && a !== 0) v = -a / 100;
    }
    baselines.set(key, v);
  }
  return v;
}

/** A text mark's words as real PDF text: each line where the screen puts it (wrapped the same,
    aligned with the font's own widths), turned with the mark, underlined like on screen. */
function drawWords(lib: PdfLib, pdfPage: PdfLibPage, m: TextMark, font: PdfLibFont, map: PageMap) {
  const lay = layoutText(m);
  const f = frameOf(m);
  const size = m.size * map.k;
  const color = hexColor(lib, m.color);
  const opacity = opacityOf(m);
  const rotate = lib.degrees(map.angle(f.rot));
  const base = baselineShare(m) * m.size;
  const ul = underlineOf(m);
  const align = m.align ?? "center";
  lay.lines.forEach((line, i) => {
    const text = line.text.replace(/\s+$/, "");
    if (!text) return;
    const p = linePlace(m, lay, i);
    const w = font.widthOfTextAtSize(text, size) / map.k; // units
    const left = align === "left" ? p.x : align === "right" ? p.x - w : -w / 2;
    const [u, v] = rotatePt(f.cx + left, f.cy + p.y + base, f.cx, f.cy, f.rot);
    const [x, y] = map.pt(u, v);
    pdfPage.drawText(text, { x, y, size, font, color, opacity, rotate });
    if (m.underline) {
      const uy = f.cy + p.y + ul.dy + ul.thick / 2;
      const [a1, b1] = rotatePt(f.cx + left, uy, f.cx, f.cy, f.rot);
      const [a2, b2] = rotatePt(f.cx + left + w, uy, f.cx, f.cy, f.rot);
      const [x1, y1] = map.pt(a1, b1);
      const [x2, y2] = map.pt(a2, b2);
      pdfPage.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: ul.thick * map.k, color, opacity });
    }
  });
}

/** Marks drawn as a see-through picture over the whole page. They're drawn as shown, then turned back
    to the page's own (unrotated) orientation, since that's how PDF positions things. */
async function drawLayerImage(out: PdfLibDoc, pdfPage: PdfLibPage, marks: Mark[], map: PageMap, images: MarkImages | undefined, frameOnly: Set<string>) {
  const { box, total } = map;
  const shownW = total % 180 === 0 ? box.width : box.height;
  const shownH = total % 180 === 0 ? box.height : box.width;
  const aspect = shownH / shownW;
  const shown = document.createElement("canvas");
  shown.width = UNITS * MARK_SCALE;
  shown.height = Math.round(UNITS * aspect * MARK_SCALE);
  const ctx = shown.getContext("2d")!;
  drawMarks(ctx, marks, MARK_SCALE, images, frameOnly);

  let canvas = shown;
  if (total) {
    canvas = document.createElement("canvas");
    const sideways = total % 180 !== 0;
    canvas.width = sideways ? shown.height : shown.width;
    canvas.height = sideways ? shown.width : shown.height;
    const c = canvas.getContext("2d")!;
    c.translate(canvas.width / 2, canvas.height / 2);
    c.rotate((-total * Math.PI) / 180);
    c.drawImage(shown, -shown.width / 2, -shown.height / 2);
  }
  whitenClear(canvas);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the markings."))), "image/png"));
  const png = await out.embedPng(await blob.arrayBuffer());
  pdfPage.drawImage(png, { x: box.x, y: box.y, width: box.width, height: box.height });
}

/** Makes the clear pixels white and all but clear (1/255: a canvas can't keep a colour on a fully
    clear pixel). PDF viewers scale a picture's colours and its transparency separately, so clear
    pixels left black show as a grey line round a box. */
function whitenClear(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 1;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- the outline

/** The sections as the PDF's outline: each a link to where it starts, sub-sections under the
    section before them. */
function addOutline(lib: PdfLib, out: PdfLibDoc, placed: { page: LayerPage; pdfPage: PdfLibPage; map: PageMap }[]) {
  type Item = { title: string; dest: unknown; kids: Item[] };
  const top: Item[] = [];
  for (const { page, pdfPage, map } of placed) {
    for (const b of page.bookmarks ?? []) {
      // Where it starts: the left edge at its height (pages turned sideways just open at the page).
      const [, y] = map.pt(0, Math.max(0, (b.y ?? 0) - 12));
      const dest = out.context.obj([pdfPage.ref, lib.PDFName.of("XYZ"), lib.PDFNull, map.total === 0 ? lib.PDFNumber.of(Math.round(y)) : lib.PDFNull, lib.PDFNull]);
      const item: Item = { title: b.title.trim() || "Untitled section", dest, kids: [] };
      if (b.sub && top.length) top[top.length - 1].kids.push(item);
      else top.push(item);
    }
  }
  if (!top.length) return;
  const ctx = out.context;
  const root = ctx.nextRef();
  const write = (items: Item[], parent: ReturnType<typeof ctx.nextRef>) => {
    const refs = items.map(() => ctx.nextRef());
    items.forEach((it, i) => {
      const kids = it.kids.length ? write(it.kids, refs[i]) : null;
      const dict: Record<string, unknown> = { Title: lib.PDFHexString.fromText(it.title), Parent: parent, Dest: it.dest };
      if (i > 0) dict.Prev = refs[i - 1];
      if (i < items.length - 1) dict.Next = refs[i + 1];
      if (kids) {
        dict.First = kids[0];
        dict.Last = kids[kids.length - 1];
        dict.Count = kids.length; // open, showing its sub-sections
      }
      ctx.assign(refs[i], ctx.obj(dict as Parameters<typeof ctx.obj>[0]));
    });
    return refs;
  };
  const refs = write(top, root);
  const count = top.reduce((n, it) => n + 1 + it.kids.length, 0);
  ctx.assign(root, ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: count }));
  out.catalog.set(lib.PDFName.of("Outlines"), root);
  // Open with the bookmarks panel showing.
  out.catalog.set(lib.PDFName.of("PageMode"), lib.PDFName.of("UseOutlines"));
}

