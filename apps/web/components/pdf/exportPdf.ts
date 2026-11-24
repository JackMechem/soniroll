import { UNITS, staffLines, type Layer, type LayerPage } from "@/components/pdf/markup";
import { drawMarks, fontFamily, type MarkImages } from "@/components/pdf/marksRender";

/** Pixels per unit for the drawn markings: 3000 px across a page, sharp when printed. */
const MARK_SCALE = 3;

/**
 * A new PDF with the layer applied: the pages in the layer's order and rotation (copied from the
 * original, so its text and music stay sharp), added blank and staff pages, and the markings drawn
 * over each page (text wrapped and styled as on screen, turned marks, see-through ones, pictures and
 * covers). The original file isn't touched. `images`: the pictures image marks point at, by
 * `kind:id` (ones missing are left out).
 */
export async function exportPdf(original: ArrayBuffer, layer: Layer, others: Record<string, ArrayBuffer> = {}, images?: MarkImages): Promise<Uint8Array> {
  const { PDFDocument, degrees, rgb } = await import("pdf-lib");
  const src = await PDFDocument.load(original, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const otherDocs: Record<string, Awaited<ReturnType<typeof PDFDocument.load>>> = {};
  for (const [id, bytes] of Object.entries(others)) otherDocs[id] = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const first = src.getPageCount() ? src.getPage(0) : null;
  const firstSize = first ? first.getSize() : { width: 612, height: 792 };
  const turned = first ? (first.getRotation().angle % 180 !== 0) : false;
  const paper = turned ? { width: firstSize.height, height: firstSize.width } : firstSize;

  // Fonts used by text marks must be loaded before they're drawn on a canvas.
  const fonts = new Set<string>();
  for (const p of layer.pages) for (const m of p.marks) if (m.t === "text") fonts.add(`${m.italic ? "italic " : ""}${m.bold ? 700 : 400} 20px ${fontFamily(m.font)}`);
  await Promise.all([...fonts].map((f) => document.fonts.load(f).catch(() => null)));

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
    if (page.marks.length) await drawLayerImage(out, pdfPage, page, total, images);
  }
  return out.save();
}

type PdfLibDoc = Awaited<ReturnType<typeof import("pdf-lib").PDFDocument.create>>;
type PdfLibPage = ReturnType<PdfLibDoc["addPage"]>;

/** The page's markings as a transparent picture over the whole page. They're drawn as shown, then
    turned back to the page's own (unrotated) orientation, since that's how PDF positions things. */
async function drawLayerImage(out: PdfLibDoc, pdfPage: PdfLibPage, page: LayerPage, total: number, images?: MarkImages) {
  const box = pdfPage.getCropBox();
  const shownW = total % 180 === 0 ? box.width : box.height;
  const shownH = total % 180 === 0 ? box.height : box.width;
  const aspect = shownH / shownW;
  const shown = document.createElement("canvas");
  shown.width = UNITS * MARK_SCALE;
  shown.height = Math.round(UNITS * aspect * MARK_SCALE);
  const ctx = shown.getContext("2d")!;
  drawMarks(ctx, page.marks, MARK_SCALE, images);

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
    pixels left black show as a grey line round a cover. */
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
