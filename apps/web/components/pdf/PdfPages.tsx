"use client";

import { useState } from "react";
import PdfPageView from "@/components/pdf/PdfPageView";
import { freshLayer, newId, pageAspect, rotateMarks, type Layer, type LayerPage, type Rotation } from "@/components/pdf/markup";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RotateIcon, TrashIcon } from "@/components/tools";
import type { PDFDocumentProxy } from "@/lib/pdfjs";

/**
 * Every page as a thumbnail, to put them in order (drag, or the arrows), turn them, delete them,
 * and add blank or staff pages. Clicking a page opens it.
 */
export default function PdfPages({ doc, layer, aspects, onChange, onOpen }: { doc: PDFDocumentProxy; layer: Layer; aspects: number[]; onChange: (layer: Layer) => void; onOpen: (index: number) => void }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const pages = layer.pages;
  const set = (next: LayerPage[]) => onChange({ ...layer, pages: next });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= pages.length || from === to) return;
    const next = [...pages];
    const [p] = next.splice(from, 1);
    next.splice(to, 0, p);
    set(next);
  };
  const rotate = (i: number) => {
    const p = pages[i];
    const aspect = pageAspect(p, aspects);
    set(pages.map((q, j) => (j === i ? { ...q, rotate: ((q.rotate + 90) % 360) as Rotation, marks: rotateMarks(q.marks, aspect) } : q)));
  };
  const remove = (i: number) => pages.length > 1 && set(pages.filter((_, j) => j !== i));
  const add = (at: number, kind: "blank" | "staff") => {
    const next = [...pages];
    next.splice(at, 0, { id: newId(), src: { kind }, rotate: 0, marks: [] });
    set(next);
  };
  const reset = () => onChange({ ...freshLayer(doc.numPages), pages: freshLayer(doc.numPages).pages.map((p) => ({ ...p, marks: pages.find((q) => q.src.kind === "pdf" && p.src.kind === "pdf" && q.src.page === p.src.page && q.rotate === 0)?.marks ?? [] })) });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <p className="text-sm text-muted">Drag pages to reorder them. Your PDF itself isn&apos;t changed.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => add(pages.length, "blank")} className={chip}>
            <PlusIcon className="h-4 w-4" /> Blank page
          </button>
          <button type="button" onClick={() => add(pages.length, "staff")} className={chip}>
            <PlusIcon className="h-4 w-4" /> Staff paper
          </button>
          <button type="button" onClick={reset} className={chip} title="The PDF's own pages in their own order (markings on them stay)">
            Reset pages
          </button>
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 p-4 pb-24 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {pages.map((p, i) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => {
              setDragging(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(i);
            }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null) move(dragging, i);
              setDragging(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            className={`flex flex-col items-center gap-2 rounded-xl p-2 transition-colors ${over === i && dragging !== i ? "bg-accent/15" : "bg-foreground/[0.03]"} ${dragging === i ? "opacity-40" : ""}`}
          >
            <button type="button" onClick={() => onOpen(i)} className="flex h-52 w-full items-center justify-center" aria-label={`Open page ${i + 1}`}>
              <Thumb doc={doc} page={p} aspect={pageAspect(p, aspects)} />
            </button>
            <div className="flex w-full items-center justify-between gap-1">
              <span className="pl-1 text-xs font-medium tabular-nums text-muted">
                {i + 1}
                {p.src.kind === "blank" ? " · Blank" : p.src.kind === "staff" ? " · Staff" : ""}
              </span>
              <div className="flex">
                <Small label="Move earlier" onClick={() => move(i, i - 1)} disabled={i === 0}>
                  <ChevronLeftIcon className="h-4 w-4" />
                </Small>
                <Small label="Move later" onClick={() => move(i, i + 1)} disabled={i === pages.length - 1}>
                  <ChevronRightIcon className="h-4 w-4" />
                </Small>
                <Small label="Turn" onClick={() => rotate(i)}>
                  <RotateIcon className="h-4 w-4" />
                </Small>
                <Small label="Add a staff page after this" onClick={() => add(i + 1, "staff")}>
                  <PlusIcon className="h-4 w-4" />
                </Small>
                <Small label="Delete page" onClick={() => remove(i)} disabled={pages.length < 2} danger>
                  <TrashIcon className="h-4 w-4" />
                </Small>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const chip = "inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover";

function Thumb({ doc, page, aspect }: { doc: PDFDocumentProxy; page: LayerPage; aspect: number }) {
  // Fits a 208px-tall box.
  const width = Math.min(160, 208 / aspect);
  return <PdfPageView doc={doc} page={page} aspect={aspect} width={width} />;
}

function Small({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-hover disabled:opacity-30 ${danger ? "text-danger" : "text-muted"}`}>
      {children}
    </button>
  );
}
