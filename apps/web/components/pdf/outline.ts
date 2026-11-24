"use client";

import { useEffect, useState } from "react";
import { UNITS, type Bookmark, type Layer } from "@/components/pdf/markup";
import { pageTextRuns } from "@/components/pdf/pdfText";
import type { PDFDocumentProxy } from "@/lib/pdfjs";

/**
 * Sections (bookmarks) and outlines: the sections in a layer in reading order with the pages each
 * one covers, the PDF's own outline (pdf.js `getOutline`), and a name for a new section from the
 * page's biggest text.
 */

export type Section = {
  bm: Bookmark;
  pageId: string;
  /** Where it starts: the page's place in the layer, and how far down it (units). */
  index: number;
  y: number;
  /** The pages it covers (indexes): from its own to the one before the next section starts — that
      one too when the next starts part-way down it. */
  pages: number[];
};

/** Every section in reading order (page by page, top to bottom). */
export function sectionsOf(layer: Layer): Section[] {
  const out: Section[] = [];
  layer.pages.forEach((p, index) => {
    const bms = [...(p.bookmarks ?? [])].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    for (const bm of bms) out.push({ bm, pageId: p.id, index, y: bm.y ?? 0, pages: [] });
  });
  out.forEach((s, i) => {
    const next = out[i + 1];
    // (None of its own when the next one starts at the same place: a heading over sub-sections.)
    const last = next ? (next.y > 1 ? next.index : next.index - 1) : layer.pages.length - 1;
    const same = next && next.index === s.index && next.y <= s.y + 1;
    if (!same) for (let k = s.index; k <= Math.max(s.index, last); k++) s.pages.push(k);
  });
  return out;
}

/** The section you're reading at page `index`, `y` units down it (−1 before the first). */
export function currentSection(sections: Section[], index: number, y: number) {
  let at = -1;
  sections.forEach((s, i) => {
    if (s.index < index || (s.index === index && s.y <= y + 1)) at = i;
  });
  return at;
}

export type PdfOutlineItem = { title: string; page: number | null; y?: number; depth: number };

/** The PDF's own outline (its bookmarks), flattened with each item's depth and the page (0-based in
    the PDF) it goes to; null while loading, [] when it has none. */
export function usePdfOutline(doc: PDFDocumentProxy | null) {
  const [items, setItems] = useState<{ doc: PDFDocumentProxy; items: PdfOutlineItem[] } | null>(null);
  useEffect(() => {
    if (!doc) return;
    let live = true;
    void readOutline(doc)
      .catch(() => [])
      .then((list) => live && setItems({ doc, items: list }));
    return () => {
      live = false;
    };
  }, [doc]);
  return items && items.doc === doc ? items.items : null;
}

type RawItem = { title: string; dest: string | unknown[] | null; items: RawItem[] };

async function readOutline(doc: PDFDocumentProxy): Promise<PdfOutlineItem[]> {
  const raw = (await doc.getOutline()) as RawItem[] | null;
  if (!raw?.length) return [];
  const out: PdfOutlineItem[] = [];
  const walk = async (list: RawItem[], depth: number) => {
    for (const it of list) {
      if (out.length > 2000) return;
      let page: number | null = null;
      let y: number | undefined;
      try {
        const dest = typeof it.dest === "string" ? await doc.getDestination(it.dest) : it.dest;
        if (Array.isArray(dest) && dest.length) {
          const ref = dest[0];
          page = typeof ref === "number" ? ref : ref && typeof ref === "object" ? await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]) : null;
          // "XYZ left top zoom": how far down the page it goes.
          const kind = (dest[1] as { name?: string } | undefined)?.name;
          if (page !== null && kind === "XYZ" && typeof dest[3] === "number") {
            const p = await doc.getPage(page + 1);
            const vp = p.getViewport({ scale: 1 });
            const [, vy] = vp.convertToViewportPoint(0, dest[3] as number);
            y = Math.max(0, Math.round((vy / vp.width) * UNITS));
          }
        }
      } catch {
        page = null;
      }
      out.push({ title: (it.title || "Untitled").trim(), page, y, depth });
      if (it.items?.length) await walk(it.items, depth + 1);
    }
  };
  await walk(raw, 0);
  return out;
}

/** A name for a section starting `y` units down a page of the PDF: its biggest line of text near
    there (a song's title), or null (a scan, a blank page). */
export async function headingNear(doc: PDFDocumentProxy | null, pdfPage: number | null, rotate: number, y: number) {
  if (!doc || pdfPage === null) return null;
  const runs = await pageTextRuns(doc, pdfPage, rotate).catch(() => []);
  const near = runs.filter((r) => !r.angle && r.cy >= y - 10 && r.cy <= y + 420 && r.text.trim().length > 1);
  if (!near.length) return null;
  const biggest = Math.max(...near.map((r) => r.size));
  const best = near.filter((r) => r.size >= biggest * 0.95).sort((a, b) => a.cy - b.cy)[0];
  const text = best.text.replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}
