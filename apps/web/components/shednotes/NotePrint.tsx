"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CloseIcon, DownloadIcon } from "@/components/tools";
import NoteDocument, { notationCount } from "./NoteDocument";
import type { ScoreContext } from "./ScoreEmbeds";

/**
 * Export as PDF: the note laid out as a page over everything else, with the browser's print
 * dialog (where "Save as PDF" is) opened once its music has drawn. Only this prints.
 */
export default function NotePrint({
  title,
  body,
  context,
  fontFamily,
  subtitle,
  onClose,
}: {
  title: string;
  body: string;
  context?: ScoreContext;
  fontFamily?: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const page = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const printed = useRef(false);

  // Waits (up to a few seconds) for the scores and ABC to draw, then opens the print dialog once.
  useEffect(() => {
    const want = notationCount(body);
    const started = Date.now();
    const timer = setInterval(() => {
      const done = page.current?.querySelectorAll("[data-ready]").length ?? 0;
      if (done >= want || Date.now() - started > 6000) {
        clearInterval(timer);
        setReady(true);
        if (!printed.current) {
          printed.current = true;
          setTimeout(() => window.print(), 250);
        }
      }
    }, 200);
    return () => clearInterval(timer);
  }, [body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevTitle = document.title;
    // The PDF's file name comes from the page title.
    document.title = title;
    return () => {
      window.removeEventListener("keydown", onKey);
      document.title = prevTitle;
    };
  }, [onClose, title]);

  return createPortal(
    <div className="note-print fixed inset-0 z-[90] overflow-y-auto bg-background text-foreground">
      <div className="note-print-bar sticky top-0 z-10 flex items-center gap-2 border-b border-foreground/10 bg-background/95 px-4 py-2 backdrop-blur">
        <p className="min-w-0 flex-1 truncate text-sm text-muted">{ready ? "Choose “Save as PDF” in the print dialog." : "Getting the page ready…"}</p>
        <button type="button" onClick={() => window.print()} disabled={!ready} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50">
          {ready ? <DownloadIcon className="h-4 w-4" /> : <LoadingSpinner size="sm" inline label="Getting ready" />} Save as PDF
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <article ref={page} className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight" style={fontFamily ? { fontFamily } : undefined}>
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <NoteDocument body={body} context={context} fontFamily={fontFamily} className="mt-6" />
      </article>
    </div>,
    document.body,
  );
}
