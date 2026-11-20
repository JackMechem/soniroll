"use client";

import { useEffect, useRef, useState } from "react";
import { errorText } from "@/lib/files";
import { openPdf, type PDFDocumentProxy } from "@/lib/pdfjs";

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
