"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import { CheckIcon, CloseIcon, FolderIcon, UploadIcon } from "@/components/tools";
import { type ImportNote, readNoteFiles } from "@/lib/exportNotes";
import { errorText } from "@/lib/useShedNotes";

type Clash = "skip" | "replace" | "copy";
const CLASH: { value: Clash; label: string }[] = [
  { value: "skip", label: "Skip it (keep mine)" },
  { value: "replace", label: "Replace mine" },
  { value: "copy", label: "Keep both" },
];

/** Under Convex's limits per call: at most 100 notes and about 4 MB of text. */
function chunks(notes: ImportNote[]): ImportNote[][] {
  const out: ImportNote[][] = [];
  let cur: ImportNote[] = [];
  let size = 0;
  for (const n of notes) {
    if (cur.length && (cur.length >= 100 || size + n.body.length > 4_000_000)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(n);
    size += n.body.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Only what the server takes (a hand-edited metadata file can't break the import). */
const clean = (n: ImportNote): ImportNote => ({
  title: String(n.title),
  folder: String(n.folder ?? ""),
  body: String(n.body),
  ...(n.view && (typeof n.view.fullWidth === "boolean" || typeof n.view.font === "string")
    ? { view: { ...(typeof n.view.fullWidth === "boolean" ? { fullWidth: n.view.fullWidth } : {}), ...(typeof n.view.font === "string" ? { font: n.view.font } : {}) } }
    : {}),
  ...(typeof n.createdAt === "number" ? { createdAt: n.createdAt } : {}),
  ...(typeof n.updatedAt === "number" ? { updatedAt: n.updatedAt } : {}),
});

/**
 * Import notes: an export's .zip (titles, folders and looks come back exactly, from its
 * soniroll-notes.json), any .zip or folder of Markdown files (folders from the paths, titles from
 * the file names — an Obsidian vault works), or loose .md files.
 */
export default function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const importMut = useMutation(api.shedNotes.importNotes);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [found, setFound] = useState<{ notes: ImportNote[]; folders: string[]; from: string } | null>(null);
  const [clash, setClash] = useState<Clash>("skip");
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && progress === null && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, progress]);

  // Folder picking isn't in React's input props.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  async function pick(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setReading(true);
    setError(null);
    try {
      const data = await readNoteFiles(files);
      if (!data.notes.length) setError("No notes in there — pick a .zip, a folder, or .md files.");
      setFound({ ...data, from: files.length === 1 ? files[0].name : `${files.length} files` });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setReading(false);
    }
  }

  async function run() {
    if (!found) return;
    const parts = chunks(found.notes.map(clean));
    const total = { created: 0, replaced: 0, skipped: 0 };
    setProgress(0);
    setError(null);
    try {
      for (let i = 0; i < Math.max(1, parts.length); i++) {
        const r = await importMut({ notes: parts[i] ?? [], folders: i === 0 ? found.folders : [], clash });
        total.created += r.created;
        total.replaced += r.replaced;
        total.skipped += r.skipped;
        setProgress(Math.min(found.notes.length, (i + 1) * 100));
      }
      const bits = [
        total.created && `${total.created} ${total.created === 1 ? "note" : "notes"} imported`,
        total.replaced && `${total.replaced} replaced`,
        total.skipped && `${total.skipped} skipped (you had them)`,
      ].filter(Boolean);
      onDone(bits.join(", ") || "Nothing new to import");
      onClose();
    } catch (e) {
      setError(`${errorText(e)} ${total.created + total.replaced ? `(${total.created + total.replaced} notes got in before that.)` : ""}`);
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-overlay sm:items-center sm:p-4" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-label="Import notes"
        className="flex w-full max-w-md flex-col gap-4 rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Import notes</h2>
            <p className="text-sm text-muted">A .zip from Export all, or any folder of Markdown files.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-40">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <input ref={filesInput} type="file" multiple accept=".zip,.md,.markdown,.txt" className="hidden" onChange={(e) => void pick(e.target.files)} />
        <input ref={folderInput} type="file" multiple className="hidden" onChange={(e) => void pick(e.target.files)} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy || reading} onClick={() => filesInput.current?.click()} className="flex flex-col items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 py-4 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-50">
            <UploadIcon className="h-4 w-4 text-muted" /> A .zip or files
          </button>
          <button type="button" disabled={busy || reading} onClick={() => folderInput.current?.click()} className="flex flex-col items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 py-4 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-50">
            <FolderIcon className="h-4 w-4 text-muted" /> A folder
          </button>
        </div>

        {reading && <LoadingSpinner />}
        {found && found.notes.length > 0 && (
          <>
            <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2.5 text-sm">
              <CheckIcon className="h-4 w-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {found.notes.length} {found.notes.length === 1 ? "note" : "notes"}
                  {found.folders.length > 0 && `, ${found.folders.length} ${found.folders.length === 1 ? "folder" : "folders"}`}
                </span>
                <span className="block truncate text-xs text-muted">from {found.from}</span>
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted">When you already have a note with the same title</p>
              <Select value={clash} options={CLASH} onChange={setClash} disabled={busy} />
            </div>
            <button type="button" onClick={() => void run()} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60">
              {busy ? (
                <>
                  <LoadingSpinner size="sm" inline label="Importing" /> Importing {progress} of {found.notes.length}…
                </>
              ) : (
                `Import ${found.notes.length} ${found.notes.length === 1 ? "note" : "notes"}`
              )}
            </button>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
