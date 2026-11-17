"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ChangeText, KindIcon } from "@/components/changelog/ChangelogPage";
import { ChevronLeftIcon, CloseIcon, PlusIcon } from "@/components/tools";
import {
  CHANGE_KINDS,
  type Change,
  type ChangeKind,
  RELEASES,
  type Release,
  formatReleaseDate,
  mergeReleases,
  releaseAnchor,
  releaseKey,
  type ShownRelease,
} from "@/lib/changelog";

/**
 * Admin → Changelog. Releases are written in the code (apps/web/lib/changelog.ts) whenever the
 * version goes up; here an admin fixes any of them. A fix replaces that version's entry on
 * /changelog and is never overwritten by later changes to the code.
 */
export default function ChangelogAdmin() {
  const edits = useQuery(api.changelog.edits);
  const releases = useMemo(() => mergeReleases(RELEASES, edits), [edits]);
  const [open, setOpen] = useState<string | null>(null);

  if (edits === undefined) return <LoadingSpinner />;
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-3xl">
        <p className="text-sm text-muted">
          Each version&apos;s entry is written when the version goes up. Fix anything here: your version replaces that entry on{" "}
          <Link href="/changelog" className="font-medium text-accent hover:underline">
            What&apos;s new
          </Link>{" "}
          and later updates never overwrite it. &ldquo;Revert&rdquo; goes back to the original.
        </p>
      </div>
      <div className="divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
      {releases.map((r) =>
        open === r.version ? (
          <ReleaseEditor key={r.version} release={r} onClose={() => setOpen(null)} />
        ) : (
          <div key={r.version} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-muted">v{r.version}</span>
            <div className="min-w-0 flex-1 basis-40">
              <p className={`truncate text-sm font-medium ${r.hidden ? "text-muted line-through" : ""}`}>{r.title}</p>
              <p className="text-xs text-muted">
                {formatReleaseDate(r.date)} · {r.changes.length} {r.changes.length === 1 ? "change" : "changes"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {r.edited && <span className="rounded-sm bg-foreground/[0.05] px-1.5 text-[11px] font-medium text-foreground">Edited</span>}
              {r.hidden && <span className="rounded-sm bg-foreground/[0.05] px-1.5 text-[11px] text-muted">Hidden</span>}
              {r.originalChanged && (
                <span className="rounded-sm border border-foreground/25 px-1.5 text-[11px] font-medium text-foreground">Updated since your edit</span>
              )}
            </div>
            <Link href={`/changelog#${releaseAnchor(r.version)}`} className="flex h-8 items-center rounded-md px-2.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
              View
            </Link>
            <button type="button" onClick={() => setOpen(r.version)} className="h-8 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
              Edit
            </button>
          </div>
        ),
      )}
      </div>
    </div>
  );
}

function errorText(e: unknown): string {
  if (e instanceof ConvexError && typeof e.data === "string") return e.data;
  return "Couldn't save that. Try again.";
}

function ReleaseEditor({ release, onClose }: { release: ShownRelease; onClose: () => void }) {
  const save = useMutation(api.changelog.saveEdit);
  const revert = useMutation(api.changelog.revertEdit);
  const [draft, setDraft] = useState<Release>({
    version: release.version,
    date: release.date,
    title: release.title,
    summary: release.summary ?? "",
    changes: release.changes.map((c) => ({ ...c })),
  });
  const [hidden, setHidden] = useState(release.hidden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const setChange = (i: number, c: Partial<Change>) => setDraft((d) => ({ ...d, changes: d.changes.map((x, j) => (j === i ? { ...x, ...c } : x)) }));
  const move = (i: number, by: number) =>
    setDraft((d) => {
      const changes = [...d.changes];
      const j = i + by;
      if (j < 0 || j >= changes.length) return d;
      [changes[i], changes[j]] = [changes[j], changes[i]];
      return { ...d, changes };
    });

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      await save({ version: release.version, release: draft, hidden, base: releaseKey(release.original) });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-md bg-foreground/[0.05] px-3 py-2 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-accent/40";
  const label = "flex flex-col gap-1.5 text-xs font-medium text-muted";
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs tabular-nums text-muted">v{release.version}</span>
        <h3 className="flex-1 text-sm font-medium">Edit this version</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {release.originalChanged && (
        <div className="flex flex-col gap-2 rounded-md bg-background p-3 text-sm">
          <p>This version&apos;s entry was updated after you edited it. The site still shows your edit.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowOriginal((v) => !v)} className="h-8 rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover">
              {showOriginal ? "Hide the update" : "See the update"}
            </button>
          </div>
          {showOriginal && <Preview release={release.original} />}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <label className={label}>
          Date
          <input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className={input} />
        </label>
        <label className={label}>
          Title
          <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={input} />
        </label>
      </div>
      <label className={label}>
        <span>
          Summary <span className="font-normal">(optional, one or two sentences)</span>
        </span>
        <textarea rows={2} value={draft.summary ?? ""} onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))} className={`${input} resize-y`} />
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted">
          Changes <span className="font-normal">— **text** for bold</span>
        </p>
        {draft.changes.map((c, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md bg-foreground/[0.05] p-2.5 sm:flex-row sm:items-start">
            <div role="radiogroup" aria-label="Kind of change" className="flex shrink-0 gap-0.5 self-start rounded-md bg-background p-0.5">
              {CHANGE_KINDS.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setChange(i, { kind })}
                  role="radio"
                  aria-checked={c.kind === kind}
                  className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors ${c.kind === kind ? "bg-surface-hover text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
                >
                  <KindIcon kind={kind} className="h-3 w-3" /> {label}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={c.text}
              onChange={(e) => setChange(i, { text: e.target.value })}
              aria-label={`Change ${i + 1}`}
              className="min-h-[3.25rem] min-w-0 flex-1 resize-y rounded-md bg-foreground/[0.05] px-2.5 py-1.5 text-sm outline-none [field-sizing:content] focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex shrink-0 gap-0.5 self-end sm:self-start">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30">
                <ChevronLeftIcon className="h-4 w-4 rotate-90" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === draft.changes.length - 1} aria-label="Move down" className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30">
                <ChevronLeftIcon className="h-4 w-4 -rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, changes: d.changes.filter((_, j) => j !== i) }))}
                aria-label="Remove this change"
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-danger"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...d, changes: [...d.changes, { kind: "improved" as ChangeKind, text: "" }] }))}
          className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-foreground/15 text-sm font-medium text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <PlusIcon className="h-4 w-4" /> Add a change
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        Hide this version on What&apos;s new
      </label>

      <details className="rounded-md bg-foreground/[0.05] p-3">
        <summary className="cursor-pointer text-sm font-medium">Preview</summary>
        <div className="mt-3">
          <Preview release={draft} />
        </div>
      </details>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {release.edited && (
          <button type="button" onClick={() => setConfirmRevert(true)} className="h-9 rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            Revert to original
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover">
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={busy} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {confirmRevert && (
        <ConfirmDialog
          title="Revert to the original?"
          message={`Your edits to v${release.version} are dropped and the original entry shows again.`}
          confirmLabel="Revert"
          onConfirm={async () => {
            await revert({ version: release.version });
            setConfirmRevert(false);
            onClose();
          }}
          onCancel={() => setConfirmRevert(false)}
        />
      )}
    </div>
  );
}

/** A release the way /changelog shows it, smaller. */
function Preview({ release: r }: { release: Release }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-xs text-muted">{formatReleaseDate(r.date)}</p>
      <p className="text-base font-semibold">{r.title || "Untitled"}</p>
      {r.summary && <p className="text-muted">{r.summary}</p>}
      {CHANGE_KINDS.map(({ kind }) => {
        const items = r.changes.filter((c) => c.kind === kind && c.text.trim());
        if (!items.length) return null;
        return (
          <div key={kind} className="flex flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted">
              <KindIcon kind={kind} className="h-3 w-3" /> {CHANGE_KINDS.find((k) => k.kind === kind)?.label}
            </span>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {items.map((c, i) => (
                <li key={i}>
                  <ChangeText text={c.text} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
