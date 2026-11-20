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
  // pdf.js takes ownership of the buffer it's given, so it gets a copy.
  return pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
}

export type { PDFDocumentProxy };
