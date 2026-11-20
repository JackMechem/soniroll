"use client";

import { useEffect, useRef, useState } from "react";
import { errorText } from "@/lib/files";
import type { LayerPage } from "@/components/pdf/markup";
import { openPdf, type PDFDocumentProxy } from "@/lib/pdfjs";

/** Where each page of a layer is drawn from: its PDF (this one, or another inserted one) and its
    height ÷ width as it's shown. */
export type PdfSources = { docFor: (page: LayerPage) => PDFDocumentProxy | null; aspectOf: (page: LayerPage) => number; pageCount: number };

/** A PDF opened from its address: the document, each page's height ÷ width, and its bytes (for
    downloading it with markings). */
export function usePdfDoc(url: string) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [aspects, setAspects] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bytesRef = useRef<ArrayBuffer | null>(null);
  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Couldn't download this PDF.");
        const bytes = await res.arrayBuffer();
        bytesRef.current = bytes;
        opened = await openPdf(bytes);
        const list: number[] = [];
        for (let i = 1; i <= opened.numPages; i++) {
          const vp = (await opened.getPage(i)).getViewport({ scale: 1 });
          list.push(vp.height / vp.width);
        }
        if (cancelled) return;
        setAspects(list);
        setDoc(opened);
      } catch (e) {
        if (!cancelled) setError(errorText(e, "Couldn't open this PDF."));
      }
    })();
    return () => {
      cancelled = true;
      void opened?.loadingTask.destroy();
    };
  }, [url]);
  return { doc, aspects, error, bytesRef };
}

export type OpenedPdf = { doc: PDFDocumentProxy; aspects: number[]; bytes: ArrayBuffer };

/** Opens a PDF's bytes: the document and each page's height ÷ width. */
export async function openPdfBytes(bytes: ArrayBuffer): Promise<OpenedPdf> {
  const doc = await openPdf(bytes);
  const aspects: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
    aspects.push(vp.height / vp.width);
  }
  return { doc, aspects, bytes };
}

/** Other PDFs whose pages were inserted, by id, each opened once its address is known. */
export function usePdfDocs(urls: Record<string, string | null | undefined>) {
  const [opened, setOpened] = useState<Record<string, OpenedPdf | "error">>({});
  const started = useRef(new Set<string>());
  const key = Object.entries(urls)
    .filter(([, url]) => url)
    .map(([id, url]) => `${id}=${url}`)
    .join("|");
  useEffect(() => {
    for (const part of key ? key.split("|") : []) {
      const [id, ...rest] = part.split("=");
      const url = rest.join("=");
      if (started.current.has(id)) continue;
      started.current.add(id);
      void (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error();
          const pdf = await openPdfBytes(await res.arrayBuffer());
          setOpened((o) => ({ ...o, [id]: pdf }));
        } catch {
          setOpened((o) => ({ ...o, [id]: "error" }));
        }
      })();
    }
  }, [key]);
  return opened;
}
