import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfWorkerSrc } from "@/lib/pdfWorker";

type Pdfjs = typeof import("pdfjs-dist");
let loading: Promise<Pdfjs> | null = null;

/** pdf.js, loaded the first time a PDF is opened (it's big, and browser-only). */
export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
    return pdfjs;
  });
  return loading;
}

/** Opens a PDF from its bytes. */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  // Its decoders (JBIG2 / JPEG 2000 page images in scanned PDFs: without them every page is
  // blank), character maps, standard fonts and colour profiles, served from public/pdfjs/ (copied
  // there by scripts/copy-pdfjs-assets.mjs, per pdf.js version).
  const base = `/pdfjs/${pdfjs.version}/`;
  // pdf.js takes ownership of the buffer it's given, so it gets a copy.
  return pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    wasmUrl: `${base}wasm/`,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    iccUrl: `${base}iccs/`,
  }).promise;
}

export type { PDFDocumentProxy };
