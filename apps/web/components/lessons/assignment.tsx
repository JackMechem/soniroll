"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { CheckIcon, CloseIcon, LinkIcon, PlusIcon } from "@/components/tools";
import { FileIcon, FileView, ago, btnPrimary, btnSecondary, btnSmall, errorText, field } from "@/components/lessons/parts";
import {
  FILE_KINDS,
  MAX_SUBMIT_FILES,
  MAX_SUBMIT_LINKS,
  MAX_SUBMIT_MB,
  acceptAttr,
  cleanExtension,
  cleanLink,
  describeFiles,
  describeSubmit,
  fileAllowed,
  type SubmitConfig,
} from "@jam-practice/core/lessonFiles";

export type Submission = {
  id: Id<"lessonSubmissions">;
  text: string;
  links: string[];
  files: { fileId: Id<"_storage">; name: string; type: string; size: number; url: string | null }[];
  status: "submitted" | "reviewed" | "changes";
  feedback: string | null;
  reviewedAt: number | null;
  submittedAt: number;
  updatedAt: number;
};

export const EMPTY_SUBMIT: SubmitConfig = { file: true, text: false, link: false, fileKinds: [], extensions: [] };

/** The teacher's "How they hand it in" settings, in the assignment dialog. `null` = nothing to hand
    in (they just tick it off). */
export function SubmitSettings({ value, onChange }: { value: SubmitConfig | null; onChange: (v: SubmitConfig | null) => void }) {
  const [ext, setExt] = useState("");
  const on = value !== null;
  const c = value ?? EMPTY_SUBMIT;
  const set = (p: Partial<SubmitConfig>) => {
    const next = { ...c, ...p };
    onChange(next.file || next.text || next.link ? next : null);
  };
  const toggleKind = (id: string) => {
    if (id === "any") return set({ fileKinds: c.fileKinds.includes("any") ? [] : ["any"], extensions: [] });
    const kinds = c.fileKinds.filter((k) => k !== "any");
    set({ fileKinds: kinds.includes(id) ? kinds.filter((k) => k !== id) : [...kinds, id] });
  };
  const anyFile = (c.fileKinds.length === 0 && c.extensions.length === 0) || c.fileKinds.includes("any");
  function addExt() {
    const e = cleanExtension(ext);
    if (e && !c.extensions.includes(e)) set({ extensions: [...c.extensions, e], fileKinds: c.fileKinds.filter((k) => k !== "any") });
    setExt("");
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-foreground/[0.05] p-3.5">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">How they hand it in</p>
        <div className="flex flex-wrap gap-1.5">
          <Toggle on={!on} onClick={() => onChange(null)} label="Just tick it off" />
          <Toggle on={on && c.file} onClick={() => set({ file: !(on && c.file) })} label="Upload a file" />
          <Toggle on={on && c.text} onClick={() => set(on ? { text: !c.text } : { ...EMPTY_SUBMIT, file: false, text: true })} label="Write text" />
          <Toggle on={on && c.link} onClick={() => set(on ? { link: !c.link } : { ...EMPTY_SUBMIT, file: false, link: true })} label="Paste a link" />
        </div>
        <p className="text-xs text-muted">
          {on ? `They hand in ${describeSubmit(c)}; you review it and give feedback.` : "No hand-in — they tick it off when it's done."}
        </p>
      </div>
      {on && c.file && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted">Files you&apos;ll take</p>
          <div className="flex flex-wrap gap-1.5">
            {FILE_KINDS.map((k) => (
              <Toggle key={k.id} small on={k.id === "any" ? anyFile : c.fileKinds.includes(k.id)} onClick={() => toggleKind(k.id)} label={k.label} />
            ))}
            {c.extensions.map((e) => (
              <span key={e} className="flex h-7 items-center gap-1 rounded-md border border-foreground/25 bg-surface-hover pl-2.5 pr-1 text-xs font-medium">
                {e}
                <button
                  type="button"
                  aria-label={`Remove ${e}`}
                  onClick={() => set({ extensions: c.extensions.filter((x) => x !== e) })}
                  className="flex h-5 w-5 items-center justify-center rounded-sm text-muted hover:bg-foreground/10 hover:text-foreground"
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={ext}
              onChange={(e) => setExt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExt();
                }
              }}
              placeholder="Another type, e.g. .logicx"
              className={`${field} max-w-56`}
            />
            <button
              type="button"
              onClick={addExt}
              disabled={!cleanExtension(ext)}
              className={btnSecondary}
            >
              Add
            </button>
          </div>
          <p className="text-xs text-muted">
            Taking {describeFiles(c)} · up to {MAX_SUBMIT_FILES} files, {MAX_SUBMIT_MB} MB each.
          </p>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, label, small = false }: { on: boolean; onClick: () => void; label: string; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md border font-medium transition-colors ${small ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm"} ${
        on ? "border-foreground/25 bg-surface-hover text-foreground" : "border-foreground/10 text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {on && <CheckIcon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

export const STATUS_LABEL: Record<Submission["status"], string> = { submitted: "Handed in", reviewed: "Reviewed", changes: "Needs changes" };
const STATUS_CLASS: Record<Submission["status"], string> = {
  submitted: "bg-foreground/[0.05] text-foreground",
  reviewed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  changes: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export function StatusChip({ status }: { status: Submission["status"] }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** What was handed in: text, links, files (previewed where the browser can). */
function SubmissionView({ s }: { s: Submission }) {
  return (
    <div className="flex flex-col gap-2">
      {s.text && <p className="whitespace-pre-wrap rounded-md bg-background px-3 py-2 text-sm leading-relaxed">{s.text}</p>}
      {s.links.map((l) => (
        <a
          key={l}
          href={l}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 truncate rounded-md bg-background px-3 py-2 text-sm font-medium text-accent hover:underline"
        >
          <LinkIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{l}</span>
        </a>
      ))}
      {s.files.map((f) =>
        f.url ? (
          f.type.startsWith("video/") ? (
            <div key={f.fileId} className="flex flex-col gap-1 rounded-md bg-background p-2.5">
              <span className="truncate text-xs font-medium">{f.name}</span>
              <video controls src={f.url} preload="metadata" className="max-h-80 w-full rounded-md bg-black" />
            </div>
          ) : (
            <FileView key={f.fileId} url={f.url} name={f.name} type={f.type} />
          )
        ) : null,
      )}
    </div>
  );
}

type Item = { id: Id<"lessonItems">; title: string; submit: SubmitConfig | null; submission: Submission | null };

/**
 * An assignment's hand-in, under its card. Student: the form (file / text / link, whatever the
 * teacher asked for), then what they handed in and the teacher's feedback. Teacher: what was handed
 * in, and feedback — "Reviewed" or "Ask for changes".
 */
export function AssignmentWork({ item, teacher, studentName }: { item: Item; teacher: boolean; studentName?: string }) {
  const s = item.submission;
  const [editing, setEditing] = useState(false);
  if (!item.submit) return null;
  if (teacher) {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-foreground/[0.05] p-3">
        {s ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{studentName ?? "Your student"} handed this in</span>
              <StatusChip status={s.status} />
              <span className="text-xs text-muted">{ago(s.updatedAt)}</span>
            </div>
            <SubmissionView s={s} />
            <ReviewForm itemId={item.id} s={s} />
          </>
        ) : (
          <p className="text-sm text-muted">Not handed in yet · they&apos;ll hand in {describeSubmit(item.submit)}.</p>
        )}
      </div>
    );
  }
  const open = !s || editing || s.status === "changes";
  return (
    <div className="flex flex-col gap-2 rounded-md bg-foreground/[0.05] p-3">
      {s && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Your hand-in</span>
            <StatusChip status={s.status} />
            <span className="text-xs text-muted">{ago(s.updatedAt)}</span>
          </div>
          {s.feedback && (
            <blockquote className="border-l-2 border-accent py-0.5 pl-3 text-sm">
              <span className="mb-0.5 block text-xs font-medium text-muted">Feedback</span>
              <span className="whitespace-pre-wrap">{s.feedback}</span>
            </blockquote>
          )}
          {!open && <SubmissionView s={s} />}
        </>
      )}
      {open ? (
        <HandInForm
          item={item}
          config={item.submit}
          previous={s}
          onDone={() => setEditing(false)}
          onCancel={s && s.status !== "changes" ? () => setEditing(false) : undefined}
        />
      ) : (
        <StudentActions item={item} s={s!} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
}

function StudentActions({ item, s, onEdit }: { item: Item; s: Submission; onEdit: () => void }) {
  const withdraw = useMutation(api.lessons.withdrawSubmission);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={onEdit} className={btnSmall}>
        {s.status === "reviewed" ? "Hand in again" : "Change your hand-in"}
      </button>
      {s.status === "submitted" && (
        <button
          type="button"
          onClick={() => withdraw({ itemId: item.id }).catch((e) => setError(errorText(e, "Couldn't take it back.")))}
          className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          Take it back
        </button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/** Uploads one hand-in file (checked against what the teacher takes first). */
function useSubmitUpload() {
  const generate = useMutation(api.lessons.generateSubmitUploadUrl);
  return async (file: File): Promise<Id<"_storage">> => {
    const url = await generate();
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    if (!res.ok) throw new Error(`${file.name} didn't upload — try again.`);
    return ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
  };
}

function HandInForm({
  item,
  config,
  previous,
  onDone,
  onCancel,
}: {
  item: Item;
  config: SubmitConfig;
  previous: Submission | null;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const submit = useMutation(api.lessons.submitWork);
  const upload = useSubmitUpload();
  const [text, setText] = useState(previous?.text ?? "");
  const [links, setLinks] = useState<string[]>(previous?.links.length ? previous.links : [""]);
  const [kept, setKept] = useState(previous?.files ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accept = acceptAttr(config);
  const total = kept.length + files.length;

  function pick(list: FileList | null) {
    setError(null);
    const add: File[] = [];
    for (const f of Array.from(list ?? [])) {
      if (!fileAllowed(config, f.name, f.type)) {
        setError(`${f.name} isn't a file this assignment takes (${describeFiles(config)}).`);
        continue;
      }
      if (f.size > MAX_SUBMIT_MB * 1024 * 1024) {
        setError(`${f.name} is over ${MAX_SUBMIT_MB} MB.`);
        continue;
      }
      add.push(f);
    }
    setFiles((cur) => [...cur, ...add].slice(0, MAX_SUBMIT_FILES - kept.length));
  }

  const badLink = config.link && links.some((l) => l.trim() && !cleanLink(l));
  const hasSomething = (config.text && text.trim()) || (config.link && links.some((l) => cleanLink(l))) || (config.file && total > 0);

  async function send() {
    setError(null);
    try {
      const uploaded: { fileId: Id<"_storage">; name: string }[] = [];
      for (const [i, f] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        uploaded.push({ fileId: await upload(f), name: f.name });
      }
      setBusy("Handing in…");
      await submit({
        itemId: item.id,
        ...(config.text ? { text } : {}),
        ...(config.link ? { links: links.filter((l) => l.trim()) } : {}),
        ...(config.file ? { files: [...kept.map((f) => ({ fileId: f.fileId, name: f.name })), ...uploaded] } : {}),
      });
      setFiles([]);
      onDone();
    } catch (e) {
      setError(errorText(e, "Couldn't hand it in."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">Hand in {describeSubmit(config)}.</p>
      {config.text && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Your answer…"
          className={`${field} resize-y`}
          aria-label="Your answer"
        />
      )}
      {config.link && (
        <div className="flex flex-col gap-1.5">
          {links.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 shrink-0 text-muted" />
              <input
                value={l}
                onChange={(e) => setLinks((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="https://… (a video, a recording, a doc)"
                aria-label={`Link ${i + 1}`}
                className={`${field} ${l.trim() && !cleanLink(l) ? "border-danger" : ""}`}
              />
              {links.length > 1 && (
                <button
                  type="button"
                  aria-label="Remove link"
                  onClick={() => setLinks((cur) => cur.filter((_, j) => j !== i))}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {links.length < MAX_SUBMIT_LINKS && (
            <button
              type="button"
              onClick={() => setLinks((cur) => [...cur, ""])}
              className="flex items-center gap-1 self-start text-xs font-medium text-muted hover:text-foreground"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Another link
            </button>
          )}
        </div>
      )}
      {config.file && (
        <div className="flex flex-col gap-1.5">
          {[
            ...kept.map((f) => ({ key: f.fileId as string, name: f.name, size: f.size, drop: () => setKept((k) => k.filter((x) => x.fileId !== f.fileId)) })),
            ...files.map((f, i) => ({ key: `new-${i}-${f.name}`, name: f.name, size: f.size, drop: () => setFiles((cur) => cur.filter((_, j) => j !== i)) })),
          ].map((f) => (
            <div key={f.key} className="flex items-center gap-2 rounded-md bg-background py-1.5 pl-3 pr-1.5">
              <FileIcon className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
              <span className="shrink-0 text-xs text-muted">{sizeLabel(f.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={f.drop}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {total < MAX_SUBMIT_FILES && (
            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-foreground/20 p-4 text-center text-sm transition-colors hover:border-foreground/40">
              <FileIcon className="h-5 w-5 text-muted" />
              <span className="font-medium">{total ? "Add another file" : "Choose a file"}</span>
              <span className="text-xs text-muted">
                {describeFiles(config).replace(/^./, (c) => c.toUpperCase())} · up to {MAX_SUBMIT_MB} MB
              </span>
              <input
                type="file"
                multiple
                accept={accept || undefined}
                className="hidden"
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={btnSecondary}>
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={!!busy || !hasSomething || badLink}
          onClick={() => void send()}
          className={btnPrimary}
        >
          {busy ?? (previous ? "Hand in again" : "Hand in")}
        </button>
      </div>
    </div>
  );
}

function ReviewForm({ itemId, s }: { itemId: Id<"lessonItems">; s: Submission }) {
  const review = useMutation(api.lessons.reviewSubmission);
  const [feedback, setFeedback] = useState(s.feedback ?? "");
  const [open, setOpen] = useState(s.status === "submitted");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go(status: "reviewed" | "changes") {
    setBusy(true);
    setError(null);
    try {
      await review({ itemId, status, feedback });
      setOpen(false);
    } catch (e) {
      setError(errorText(e, "Couldn't save that."));
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <div className="flex flex-col gap-1.5">
        {s.feedback && (
          <blockquote className="border-l-2 border-accent py-0.5 pl-3 text-sm">
            <span className="mb-0.5 block text-xs font-medium text-muted">Your feedback</span>
            <span className="whitespace-pre-wrap">{s.feedback}</span>
          </blockquote>
        )}
        <button type="button" onClick={() => setOpen(true)} className="self-start text-xs font-medium text-accent hover:underline">
          {s.feedback ? "Change feedback" : "Give feedback"}
        </button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={3}
        placeholder="Feedback for them (optional)"
        className={`${field} resize-y`}
        aria-label="Feedback"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void go("changes")}
          className={btnSecondary}
        >
          Ask for changes
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void go("reviewed")}
          className={btnPrimary}
        >
          <CheckIcon className="h-4 w-4" /> Mark reviewed
        </button>
      </div>
    </div>
  );
}
