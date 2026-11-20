"use client";

import { useState } from "react";
import { useFilePicker, type FileFilter } from "@/components/files/FilePicker";
import PdfPageView from "@/components/pdf/PdfPageView";
import { freshLayer, newId, rotateMarks, type Layer, type LayerPage, type Rotation } from "@/components/pdf/markup";
import { openPdfBytes, type PdfSources } from "@/components/pdf/usePdfDoc";
import { fileKind } from "@/lib/files";
import { ChevronLeftIcon, ChevronRightIcon, DocumentIcon, PlusIcon, RotateIcon, TrashIcon } from "@/components/tools";
import type { PDFDocumentProxy } from "@/lib/pdfjs";

const PDFS: FileFilter = { accept: "application/pdf,.pdf", matches: (f) => fileKind(f.mimeType, f.name) === "pdf", noun: "a PDF" };

/**
 * Every page as a thumbnail, to put them in order (drag, or the arrows), turn them, delete them,
 * add blank or staff pages, and insert the pages of another PDF from Files (that PDF isn't changed
 * either; its pages are drawn from it). Clicking a page opens it.
 */
export default function PdfPages({ sources, fileId, layer, onChange, onOpen }: { sources: PdfSources; fileId: string; layer: Layer; onChange: (layer: Layer) => void; onOpen: (index: number) => void }) {
  const [note, setNote] = useState<string | null>(null);
  const picker = useFilePicker({
    filter: PDFS,
    title: "Insert pages from a PDF",
    uploadLabel: "Upload",
    saveToFiles: true,
    onFile: (file, from) => {
      if (!from || from.kind !== "file") {
        setNote("It's saved to your Files now. Choose Insert a PDF again and pick it from your files.");
        return;
      }
      void (async () => {
        try {
          const { doc } = await openPdfBytes(await file.arrayBuffer());
          const own = from.id === fileId;
          const added: LayerPage[] = Array.from({ length: doc.numPages }, (_, i) => ({ id: newId(), src: { kind: "pdf", page: i, ...(own ? {} : { file: from.id }) }, rotate: 0, marks: [] }));
          void doc.loadingTask.destroy();
          onChange({ ...layer, pages: [...layer.pages, ...added] });
          setNote(`Added ${added.length} page${added.length === 1 ? "" : "s"} from ${from.name} at the end.`);
        } catch {
          setNote("Couldn't open that PDF.");
        }
      })();
    },
  });
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
    const aspect = sources.aspectOf(p);
    set(pages.map((q, j) => (j === i ? { ...q, rotate: ((q.rotate + 90) % 360) as Rotation, marks: rotateMarks(q.marks, aspect) } : q)));
  };
  const remove = (i: number) => pages.length > 1 && set(pages.filter((_, j) => j !== i));
  const add = (at: number, kind: "blank" | "staff") => {
    const next = [...pages];
    next.splice(at, 0, { id: newId(), src: { kind }, rotate: 0, marks: [] });
    set(next);
  };
  // The PDF's own pages in their own order; each keeps its markings, turned back upright with it.
  const reset = () =>
    onChange({
      ...layer,
      pages: freshLayer(sources.pageCount).pages.map((p) => {
        const was = pages.find((q) => q.src.kind === "pdf" && !q.src.file && p.src.kind === "pdf" && q.src.page === p.src.page);
        if (!was) return p;
        let marks = was.marks;
        let at = was;
        for (let r = was.rotate; r % 360 !== 0; r += 90) {
          marks = rotateMarks(marks, sources.aspectOf(at));
          at = { ...at, rotate: ((at.rotate + 90) % 360) as Rotation };
        }
        return { ...p, marks };
      }),
    });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <p className="text-sm text-muted">{note ?? "Drag pages to reorder them. Your PDF itself isn't changed."}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => add(pages.length, "blank")} className={chip}>
            <PlusIcon className="h-4 w-4" /> Blank page
          </button>
          <button type="button" onClick={() => add(pages.length, "staff")} className={chip}>
            <PlusIcon className="h-4 w-4" /> Staff paper
          </button>
          <button type="button" onClick={picker.open} className={chip}>
            <DocumentIcon className="h-4 w-4" /> Insert a PDF
          </button>
          <button type="button" onClick={reset} className={chip} title="The PDF's own pages in their own order, keeping their markings">
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
              <Thumb doc={sources.docFor(p)} page={p} aspect={sources.aspectOf(p)} />
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
      {picker.elements}
    </div>
  );
}

const chip = "inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover";

function Thumb({ doc, page, aspect }: { doc: PDFDocumentProxy | null; page: LayerPage; aspect: number }) {
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
