"use client";
import PdfInline from "@/components/pdf/PdfInline";
import { AssignmentWork, StatusChip, SubmitSettings, type Submission } from "@/components/lessons/assignment";
import type { SubmitConfig } from "@jam-practice/core/lessonFiles";

/* eslint-disable @next/next/no-img-element -- files a teacher uploaded, from Convex storage */
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ChordChart from "@/components/ChordChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ChartMeta, ChartPaper } from "@/components/library/chartView";
import { Chip } from "@/components/library/ui";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import { CheckIcon, ChordChartIcon, CloseIcon, DocumentIcon, DotsVerticalIcon, GraduationCapIcon, MicIcon, PencilIcon, TrashIcon } from "@/components/tools";
import type { IRealSong } from "@/lib/iRealPro";
import { describeRepeat, formatMinutesShort, fromDateKey, lessonRoutineId, type Routine, type RoutineReport, todayKey, totalMinutes } from "@/lib/practiceLog";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { noteSnippet } from "@jam-practice/core/shedNotes";

/** Pieces of the Lessons pages (`components/lessons/*`): a teacher's students and what they give
    them; a student's teachers and what they've been given. */

// ---------------------------------------------------------------- icons

export const CapIcon = GraduationCapIcon;

export function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-4 w-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-4 w-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6v3H9zM9 12l2 2 4-4" />
    </svg>
  );
}

// ---------------------------------------------------------------- data

export type LessonItem = {
  id: Id<"lessonItems">;
  kind: "note" | "file" | "chart" | "assignment" | "routine";
  sessionId?: Id<"lessonSessions"> | null;
  title: string;
  body: string;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  chart: IRealSong | null;
  routine: Routine | null;
  dueDate: string | null;
  done: boolean;
  doneAt: number | null;
  submit: SubmitConfig | null;
  submission: Submission | null;
  createdAt: number;
  updatedAt: number;
};

export const KIND_LABEL: Record<LessonItem["kind"], string> = { note: "Lesson notes", file: "File", chart: "Chord chart", assignment: "Assignment", routine: "Routine" };
export const KIND_FILTERS: { id: LessonItem["kind"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "assignment", label: "Assignments" },
  { id: "routine", label: "Routines" },
  { id: "note", label: "Notes" },
  { id: "chart", label: "Charts" },
  { id: "file", label: "Files" },
];

const KIND_ICON: Record<LessonItem["kind"], (p: { className?: string }) => ReactNode> = {
  note: DocumentIcon,
  file: FileIcon,
  chart: ChordChartIcon,
  assignment: ClipboardIcon,
  routine: CapIcon,
};

export const MAX_FILE_MB = 25;

/** Uploads a file to Convex storage; returns its storage id. */
export function useUpload() {
  const generate = useMutation(api.lessons.generateUploadUrl);
  return async (file: File): Promise<Id<"_storage">> => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_FILE_MB} MB.`);
    const url = await generate();
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    if (!res.ok) throw new Error("The upload didn't go through — try again.");
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return storageId;
  };
}

export function dateLabel(key: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return fromDateKey(key).toLocaleDateString(undefined, opts);
}

export function ago(ms: number) {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Someone's picture, or their first letter on a tile. */
export function PersonBadge({ url, name, size = "md" }: { url: string | null | undefined; name: string; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm";
  if (url) return <img src={url} alt="" className={`${dim} shrink-0 rounded-full object-cover ring-1 ring-foreground/10`} />;
  return (
    <span className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-foreground/10 font-semibold text-foreground/70`}>
      {name.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** All / Assignments / Routines / … as chips with counts. */
export function KindFilter({ items, value, onChange }: { items: LessonItem[]; value: LessonItem["kind"] | "all"; onChange: (v: LessonItem["kind"] | "all") => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {KIND_FILTERS.map((f) => {
        const n = f.id === "all" ? items.length : items.filter((i) => i.kind === f.id).length;
        if (f.id !== "all" && n === 0) return null;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            aria-pressed={value === f.id}
            className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors ${value === f.id ? "bg-accent/15 text-accent" : "bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"}`}
          >
            {f.label} <span className={`tabular-nums ${value === f.id ? "text-accent/80" : "text-muted"}`}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- one item

export function FileView({ url, name, type }: { url: string; name: string; type: string }) {
  const [open, setOpen] = useState(false);
  if (type.startsWith("image/")) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className="block overflow-hidden rounded-md bg-background">
          <img src={url} alt={name} className="max-h-96 w-full object-contain" />
        </button>
        {open && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
            <img src={url} alt={name} className="max-h-full max-w-full rounded-lg object-contain" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </>
    );
  }
  if (type.startsWith("audio/")) {
    return (
      <div className="flex flex-col gap-1 rounded-md bg-background p-2.5">
        <span className="truncate text-xs font-medium">{name}</span>
        <audio controls src={url} preload="none" className="h-9 w-full" />
      </div>
    );
  }
  const pdf = type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-background py-2 pl-3 pr-2">
        <FileIcon className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        {pdf && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnSmall}>
            {open ? "Hide" : "Preview"}
          </button>
        )}
        <a href={url} target="_blank" rel="noreferrer" className={btnSmallPrimary}>
          Open
        </a>
      </div>
      {pdf && open && <PdfInline url={url} name={name} className="h-[70vh] w-full overflow-hidden rounded-md" />}
    </div>
  );
}

function ChartView({ chart, saveAs }: { chart: IRealSong; saveAs?: string }) {
  const [open, setOpen] = useState(false);
  const { importSongs } = useChordChartsLibrary(null);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className={btnSmall}>
          {open ? "Hide chart" : "Show chart"}
        </button>
        {saveAs && (
          <button
            type="button"
            disabled={!!saved}
            onClick={async () => {
              try {
                const { added } = await importSongs([chart], saveAs);
                setSaved(added ? `Saved to your charts, in "${saveAs}".` : "It's already in your charts.");
              } catch (e) {
                setSaved(e instanceof Error ? e.message : "Couldn't save it.");
              }
            }}
            className={`${btnSmallPrimary} disabled:opacity-60`}
          >
            Save to my charts
          </button>
        )}
        {saved && <span className="self-center text-xs text-muted">{saved}</span>}
      </div>
      {open && (
        <ChartPaper top={<ChartMeta song={chart} />}>
          <ChordChart song={chart} hideHeader />
        </ChartPaper>
      )}
    </div>
  );
}

function RoutineSummary({ routine }: { routine: Routine }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-foreground/[0.05] p-3">
      <div className="flex items-center gap-2.5">
        <RoutineIcon icon={routine.icon} color={routine.color} size="md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{routine.name}</div>
          <div className="truncate text-xs text-muted">
            {describeRepeat(routine.repeat)}
            {routine.startTime ? ` at ${routine.startTime}` : ""} · {formatMinutesShort(totalMinutes(routine))}
          </div>
        </div>
      </div>
      <ol className="flex flex-col gap-0.5 pl-1 text-sm">
        {routine.tasks.map((t, i) => (
          <li key={t.id} className="flex gap-2">
            <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted">{formatMinutesShort(t.minutes)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * One thing a teacher gave a student. The teacher (`teacher`) gets edit / delete and, on a
 * routine, its practice report; the student gets the done tick on an assignment, "Save to my
 * charts" on a chart, and a link to the routine in their Shed Log.
 */
export function ItemCard({
  item,
  teacher,
  saveChartsAs,
  onEdit,
  onRemove,
  onToggleDone,
  report,
  notesHref,
  studentName,
}: {
  item: LessonItem;
  teacher: boolean;
  /** For the teacher's view of a hand-in. */
  studentName?: string;
  /** Lesson notes open on their own page (`NotesPage`); the card shows a preview. */
  notesHref?: string;
  saveChartsAs?: string;
  onEdit?: () => void;
  onRemove?: () => void;
  onToggleDone?: (done: boolean) => void;
  report?: ReactNode;
}) {
  const Icon = KIND_ICON[item.kind];
  const today = todayKey();
  const overdue = item.kind === "assignment" && !item.done && item.dueDate && item.dueDate < today;
  /** Hand-in assignments show their hand-in status instead of "Done". */
  const shownDone = item.done && !item.submit;
  return (
    <article className={`flex flex-col gap-3 rounded-lg bg-surface p-4 ${overdue ? "ring-1 ring-danger/40" : ""}`}>
      <header className="flex items-start gap-3">
        {item.kind === "assignment" && item.submit ? (
          <span
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
              item.submission?.status === "reviewed"
                ? "bg-emerald-500 text-white"
                : item.submission?.status === "submitted"
                  ? "bg-accent text-accent-foreground"
                  : item.submission?.status === "changes"
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                    : "text-muted"
            }`}
          >
            {item.submission?.status === "reviewed" || item.submission?.status === "submitted" ? (
              <CheckIcon className="h-4 w-4" />
            ) : (
              <ClipboardIcon className="h-4 w-4" />
            )}
          </span>
        ) : item.kind === "assignment" ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={item.done}
            aria-label={item.done ? "Mark as not done" : "Mark as done"}
            disabled={!onToggleDone}
            onClick={() => onToggleDone?.(!item.done)}
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
              item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-foreground/20 text-transparent"
            } ${onToggleDone ? "hover:border-emerald-500" : "cursor-default"}`}
          >
            <CheckIcon className="h-4 w-4" />
          </button>
        ) : (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-muted">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className={`text-sm font-medium ${item.done && !item.submit ? "text-muted line-through" : ""}`}>{item.title}</h3>
            <Chip>{KIND_LABEL[item.kind]}</Chip>
            {item.kind === "assignment" && item.dueDate && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${overdue ? "bg-danger/15 text-danger" : shownDone ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "text-muted"}`}
              >
                {shownDone ? "Done" : overdue ? "Overdue · " : "Due "}
                {!shownDone && dateLabel(item.dueDate)}
              </span>
            )}
            {item.submission && <StatusChip status={item.submission.status} />}
            {item.kind === "assignment" && item.done && !item.dueDate && !item.submit && (
              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Done</span>
            )}
          </div>
          <p className="text-xs text-muted">
            {item.updatedAt > item.createdAt + 60000 ? `Updated ${ago(item.updatedAt)}` : `Added ${ago(item.createdAt)}`}
            {item.done && item.doneAt && !item.submit ? ` · done ${ago(item.doneAt)}` : ""}
          </p>
        </div>
        {teacher && (onEdit || onRemove) && (
          <div className="flex shrink-0 gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit ${item.title}`}
                title="Edit"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${item.title}`}
                title="Remove"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </header>
      {item.kind === "note" ? (
        <>
          {item.body.trim() && <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">{noteSnippet(item.body, 320)}</p>}
          {notesHref && (
            <Link href={notesHref} className={`self-start ${btnSmall}`}>
              {teacher ? "Open in notes" : "Read the notes"}
            </Link>
          )}
        </>
      ) : (
        item.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{item.body}</p>
      )}
      {item.fileUrl && <FileView url={item.fileUrl} name={item.fileName ?? item.title} type={item.fileType ?? ""} />}
      {item.chart && <ChartView chart={item.chart} saveAs={saveChartsAs} />}
      {item.routine && <RoutineSummary routine={item.routine} />}
      {item.kind === "assignment" && item.submit && <AssignmentWork item={item} teacher={teacher} studentName={studentName} />}
      {item.kind === "routine" && !teacher && (
        <Link
          href={`/shed-log/routine?id=${encodeURIComponent(lessonRoutineId(item.id))}`}
          className={`self-start ${btnSmallPrimary}`}
        >
          Open in your Shed Log
        </Link>
      )}
      {report}
    </article>
  );
}

// ---------------------------------------------------------------- dialogs

export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} flex-col gap-4 overflow-y-auto rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface p-5 shadow-2xl sm:rounded-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky -top-5 z-10 -mx-5 -mt-5 -mb-4 flex items-center justify-between gap-3 bg-surface px-5 pb-4 pt-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The action row at the bottom of a `Dialog`: stays in view while the rest scrolls under it. (A
    sticky offset counts from inside the dialog's padding, hence -bottom-5, as the title's -top-5.) */
export const dialogFooter = "sticky -bottom-5 z-10 -mx-5 -mb-5 -mt-4 bg-surface px-5 pb-5 pt-4";

export const field = "w-full rounded-md bg-foreground/[0.05] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

/** Buttons for the Lessons pages: a primary (one per area), a bordered secondary, and small ones. */
export const btnPrimary =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40";
export const btnSecondary =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-40";
export const btnGhost = "inline-flex h-9 shrink-0 items-center justify-center rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground";
export const btnSmall =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover disabled:opacity-40";
export const btnSmallPrimary =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40";

/** Add or edit a note, an assignment or a file (title, text, due date, the file). */
export function ItemDialog({
  lessonId,
  kind,
  item,
  sessionId,
  onClose,
}: {
  lessonId: Id<"lessonStudents">;
  /** The lesson a new item goes in. */
  sessionId?: Id<"lessonSessions">;
  kind: "note" | "assignment" | "file";
  item?: LessonItem;
  onClose: () => void;
}) {
  const add = useMutation(api.lessons.addItem);
  const update = useMutation(api.lessons.updateItem);
  const upload = useUpload();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [due, setDue] = useState(item?.dueDate ?? "");
  const [submit, setSubmit] = useState<SubmitConfig | null>(item ? item.submit : { file: true, text: false, link: false, fileKinds: [], extensions: [] });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!item;
  const needsFile = kind === "file" && !editing;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await update({ itemId: item.id, title, body, ...(kind === "assignment" ? { dueDate: due || null, submit } : {}) });
      } else {
        let fileArgs = {};
        if (file) fileArgs = { fileId: await upload(file), fileName: file.name, fileType: file.type };
        await add({
          lessonId,
          kind,
          ...(sessionId ? { sessionId } : {}),
          title: title || file?.name || "",
          body,
          ...(kind === "assignment" && due ? { dueDate: due } : {}),
          ...(kind === "assignment" && submit ? { submit } : {}),
          ...fileArgs,
        });
      }
      onClose();
    } catch (e) {
      setError(errorText(e, "Couldn't save that."));
      setBusy(false);
    }
  }

  const heading = `${editing ? "Edit" : kind === "file" ? "Add a" : "New"} ${kind === "note" ? "lesson notes" : kind === "assignment" ? "assignment" : "file"}`;
  return (
    <Dialog title={heading} onClose={onClose}>
      {(kind === "file" || (kind === "assignment" && !editing)) && !editing && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-foreground/20 p-5 text-center text-sm transition-colors hover:border-foreground/40">
          <FileIcon className="h-5 w-5 text-muted" />
          <span className="font-medium">
            {file ? file.name : kind === "file" ? "Choose a PDF, image or audio file" : "Attach a sheet, an image or a recording (optional)"}
          </span>
          <span className="text-xs text-muted">Up to {MAX_FILE_MB} MB</span>
          <input
            type="file"
            accept="application/pdf,image/*,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
            }}
          />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "assignment" ? "e.g. Learn the head of Autumn Leaves" : kind === "note" ? "e.g. Lesson — Oct 17" : "File name"}
          className={field}
          autoFocus={kind !== "file"}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {kind === "note" ? "Notes" : kind === "assignment" ? "Details" : "Note (optional)"}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={kind === "note" ? 8 : 4}
          placeholder={kind === "note" ? "What we worked on, what to practice next…" : ""}
          className={`${field} resize-y`}
        />
      </label>
      {kind === "assignment" && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Due (optional)
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
        </label>
      )}
      {kind === "assignment" && <SubmitSettings value={submit} onChange={setSubmit} />}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className={`${dialogFooter} flex justify-end gap-2`}>
        <button type="button" onClick={onClose} className={btnSecondary}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || (needsFile && !file) || (!title.trim() && !file)}
          className={btnPrimary}
        >
          {busy ? "Saving…" : editing ? "Save" : "Add"}
        </button>
      </div>
    </Dialog>
  );
}

/** Pick one of your Shed Log routines to assign (or to replace an assigned one with). */
export function RoutinePickDialog({
  routines,
  title = "Assign a routine",
  onPick,
  onClose,
}: {
  routines: Routine[];
  title?: string;
  onPick: (r: Routine) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="text-sm text-muted">
        Your student gets a copy in their Shed Log, and you&apos;ll see how each day of it goes. Changing it here later updates theirs.
      </p>
      {routines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">You don&apos;t have any routines yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-foreground/[0.05]">
          {routines.map((r) => (
            <button key={r.id} type="button" onClick={() => onPick(r)} className="flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover">
              <RoutineIcon icon={r.icon} color={r.color} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block truncate text-xs text-muted">
                  {r.tasks.length} task{r.tasks.length === 1 ? "" : "s"} · {formatMinutesShort(totalMinutes(r))} · {describeRepeat(r.repeat)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <Link href="/shed-log/routine/edit" className="self-start text-sm font-medium text-accent hover:underline">
        Make a new routine in your Shed Log →
      </Link>
    </Dialog>
  );
}

// ---------------------------------------------------------------- practice report

const STATUS_STYLE: Record<string, string> = {
  done: "bg-emerald-500 text-white",
  partial: "bg-amber-400 text-black",
  missed: "bg-danger text-white",
  today: "bg-foreground/10 text-muted",
};

function StatusDot({ status }: { status: string | null }) {
  const s = status ?? "today";
  return (
    <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1 text-[10px] font-semibold ${STATUS_STYLE[s]}`}>
      {s === "done" ? "✓" : s === "partial" ? "–" : s === "missed" ? "✕" : "•"}
    </span>
  );
}

/** A routine's last two weeks at a glance (the student list / summary). */
export function RecentStrip({ recent }: { recent: { date: string; status: string | null }[] }) {
  if (!recent.length) return <span className="text-xs text-muted">No days yet</span>;
  return (
    <div className="flex flex-row-reverse justify-end gap-1">
      {recent.map((d) => (
        <span key={d.date} title={`${dateLabel(d.date)} — ${d.status ?? "today"}`}>
          <StatusDot status={d.status} />
        </span>
      ))}
    </div>
  );
}

/** Every day of an assigned routine in the student's Shed Log: totals, then each day — its
    status, the tasks ticked with the minutes logged, subtasks, notes — and recordings. */
export function RoutineReportView({ itemId }: { itemId: Id<"lessonItems"> }) {
  const data = useQuery(api.lessons.routineReportFor, { itemId, today: todayKey() });
  const [showAll, setShowAll] = useState(false);
  if (data === undefined) return <LoadingSpinner size="sm" />;
  if (!data) return null;
  if (!data.joined) return <p className="rounded-md border border-dashed border-foreground/15 p-3 text-sm text-muted">Once your student joins, you&apos;ll see how each day of this routine goes.</p>;
  const report = data.report as RoutineReport | null;
  if (!report)
    return <p className="rounded-md border border-dashed border-foreground/15 p-3 text-sm text-muted">It&apos;s on its way to their Shed Log — it appears the next time they open soniroll.</p>;
  const t = report.totals;
  const days = showAll ? report.days : report.days.slice(0, 7);
  const rate = t.tasksTotal ? Math.round((t.tasksDone / t.tasksTotal) * 100) : null;
  return (
    <div className="flex flex-col gap-3 rounded-md bg-foreground/[0.05] p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Stat label="Days done" value={String(t.done)} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="Partly done" value={String(t.partial)} tone="text-amber-600 dark:text-amber-400" />
        <Stat label="Missed" value={String(t.missed)} tone="text-danger" />
        <Stat label="Practiced" value={formatMinutesShort(t.minutes)} sub={rate != null ? `${rate}% of tasks` : undefined} />
      </div>
      {report.days.length === 0 ? (
        <p className="text-sm text-muted">No days for it yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-foreground/10 border-t border-foreground/10">
          {days.map((d) => (
            <li key={d.date} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusDot status={d.status} />
                <span className="text-sm font-medium">{dateLabel(d.date)}</span>
                {d.status === null && <span className="text-xs text-muted">Today</span>}
                {d.skipped && <Chip>Skipped</Chip>}
                {d.added && <Chip>Added that day</Chip>}
                <span className="ml-auto text-xs tabular-nums text-muted">{d.minutes ? formatMinutesShort(d.minutes) : "No time logged"}</span>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {d.tasks.map((task) => (
                  <li key={task.id} className="flex flex-col">
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${task.done ? "bg-emerald-500 text-white" : "ring-1 ring-foreground/20"}`}
                      >
                        {task.done && <CheckIcon className="h-3 w-3" />}
                      </span>
                      <span className={`min-w-0 flex-1 truncate ${task.done ? "" : "text-muted"}`}>{task.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {task.minutes ? formatMinutesShort(task.minutes) : "—"} / {formatMinutesShort(task.planned)}
                      </span>
                    </span>
                    {task.subtasks.length > 0 && (
                      <span className="ml-6 text-xs text-muted">
                        {task.subtasks.filter((s) => s.done).length} of {task.subtasks.length} steps:{" "}
                        {task.subtasks.map((s) => (s.done ? `✓ ${s.title}` : s.title)).join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {d.notes && <p className="mt-2 whitespace-pre-wrap border-l-2 border-foreground/15 pl-2 text-xs italic text-foreground/80">“{d.notes}”</p>}
            </li>
          ))}
        </ol>
      )}
      {report.days.length > 7 && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="self-start text-xs font-medium text-muted hover:text-foreground">
          {showAll ? "Show the last week only" : `Show all ${report.days.length} days`}
        </button>
      )}
      {data.recordings.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-medium">
            <MicIcon className="h-4 w-4 text-muted" /> Recordings
          </h4>
          {data.recordings.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 rounded-md bg-foreground/[0.05] p-2.5">
              <span className="text-xs font-medium">
                {r.name}
                <span className="font-normal text-muted"> · {r.date ? dateLabel(r.date) : ago(r.createdAt)}</span>
              </span>
              {r.url && <audio controls src={r.url} className="h-9 w-full" preload="none" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

/** Sorts a student's things: open assignments first (soonest due), then everything else newest
    first. */
export function useSortedItems(items: LessonItem[] | undefined, filter: LessonItem["kind"] | "all") {
  return useMemo(() => {
    const list = (items ?? []).filter((i) => filter === "all" || i.kind === filter);
    const open = list.filter((i) => i.kind === "assignment" && !i.done).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    const rest = list.filter((i) => !(i.kind === "assignment" && !i.done)).sort((a, b) => b.createdAt - a.createdAt);
    return [...open, ...rest];
  }, [items, filter]);
}

export function MoreButton({ onClick, label }: { onClick: (e: React.MouseEvent) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground/[0.05] text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <DotsVerticalIcon className="h-4 w-4" />
    </button>
  );
}

// ---------------------------------------------------------------- invites

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Convex errors arrive wrapped ("[Request ID …] Server Error Uncaught Error: …") — just the message. */
export function errorText(e: unknown, fallback: string) {
  if (!(e instanceof Error)) return fallback;
  return e.message.replace(/^[\s\S]*Uncaught Error: /, "").split("\n")[0] || fallback;
}

/** Emails a student their invite: their address, an optional note from you, Send. */
export function EmailInviteForm({
  lessonId,
  name,
  initialEmail = "",
  sentTo,
  sentAt,
}: {
  lessonId: Id<"lessonStudents">;
  name: string;
  initialEmail?: string;
  sentTo?: string | null;
  sentAt?: number | null;
}) {
  const send = useAction(api.lessons.emailInvite);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const valid = EMAIL_RE.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const { sentTo } = await send({ id: lessonId, email, message: message.trim() || undefined });
      setResult({ ok: true, text: `Invite emailed to ${sentTo}.` });
      setMessage("");
      setNoteOpen(false);
    } catch (err) {
      setResult({ ok: false, text: errorText(err, "Couldn't send the email.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={`${name}'s email`}
          aria-label={`${name}'s email`}
          autoComplete="off"
          className="h-9 min-w-0 flex-1 basis-56 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="submit"
          disabled={!valid || busy}
          className={btnPrimary}
        >
          {busy ? "Sending…" : sentTo ? "Email it again" : "Email invite"}
        </button>
      </div>
      {noteOpen ? (
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="A note to go with it (optional) — e.g. Looking forward to our first lesson on Tuesday!"
          className={`${field} resize-y`}
        />
      ) : (
        <button type="button" onClick={() => setNoteOpen(true)} className="self-start text-xs font-medium text-muted hover:text-foreground">
          + Add a note to the email
        </button>
      )}
      {result ? (
        <p className={`text-xs ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>{result.text}</p>
      ) : (
        sentTo && (
          <p className="text-xs text-muted">
            Emailed to {sentTo}
            {sentAt ? ` · ${ago(sentAt)}` : ""}
          </p>
        )
      )}
    </form>
  );
}

/** Add a student: their name and (optionally) their email — the invite goes out straight away. */
export function AddStudentDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (id: Id<"lessonStudents">) => void }) {
  const add = useMutation(api.lessons.addStudent);
  const send = useAction(api.lessons.emailInvite);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Id<"lessonStudents"> | null>(null);
  const emailOk = !email.trim() || EMAIL_RE.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !emailOk || busy) return;
    setBusy(true);
    setError(null);
    let id = added;
    try {
      if (!id) {
        id = await add({ name });
        setAdded(id);
      }
      if (email.trim()) await send({ id, email, message: message.trim() || undefined });
      onAdded(id);
    } catch (err) {
      setError(errorText(err, "Something went wrong."));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Add a student" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" className={field} autoFocus disabled={!!added} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email <span className="font-normal text-muted">(optional — we&apos;ll email them their invite link)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sam@example.com" className={field} />
        </label>
        {email.trim() && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            A note with the invite <span className="font-normal text-muted">(optional)</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Looking forward to our first lesson!"
              className={`${field} resize-y`}
            />
          </label>
        )}
        {!emailOk && <p className="text-sm text-danger">That doesn&apos;t look like an email address.</p>}
        {error && (
          <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm">
            <p className="text-danger">{error}</p>
            {added && (
              <button type="button" onClick={() => onAdded(added)} className="self-start font-medium text-accent hover:underline">
                Go to {name} without emailing →
              </button>
            )}
          </div>
        )}
        <div className={`${dialogFooter} flex justify-end gap-2`}>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || !emailOk || busy}
            className={btnPrimary}
          >
            {busy ? (email.trim() ? "Sending…" : "Adding…") : email.trim() ? "Add and email invite" : "Add student"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
