"use client";

import { useEffect, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import PdfEditor from "@/components/pdf/PdfEditor";
import PdfPageView from "@/components/pdf/PdfPageView";
import { freshLayer } from "@/components/pdf/markup";
import { usePdfDoc } from "@/components/pdf/usePdfDoc";
import { MaximizeIcon } from "@/components/tools";

/** A PDF shown in place (a shared file, a note's embed): its pages in a scrolling box as wide as
    the box, and a button to open it full screen. */
export default function PdfInline({ url, name, className = "h-full min-h-[60vh] w-full" }: { url: string; name: string; className?: string }) {
  const { doc, aspects, error } = usePdfDoc(url);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pages = doc ? freshLayer(doc.numPages).pages : [];
  return (
    <div className={`relative ${className}`}>
      <div ref={boxRef} className="absolute inset-0 overflow-y-auto bg-foreground/[0.04]">
        {error ? (
          <p className="p-8 text-center text-sm text-muted">{error}</p>
        ) : !doc ? (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner label="Opening the PDF" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 p-3">
            {width > 0 && pages.map((p) => <PdfPageView key={p.id} doc={doc} page={p} aspect={aspects[p.src.kind === "pdf" ? p.src.page : 0] ?? 1.294} width={Math.min(width - 24, 900)} />)}
          </div>
        )}
      </div>
      {doc && (
        <button type="button" onClick={() => setOpen(true)} className="absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-medium shadow-md ring-1 ring-foreground/10 hover:bg-surface-hover">
          <MaximizeIcon className="h-4 w-4" /> Full screen
        </button>
      )}
      {open && <PdfEditor file={{ name, url }} onClose={() => setOpen(false)} />}
    </div>
  );
}
