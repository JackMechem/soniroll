"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import PromptDialog from "@/components/PromptDialog";
import { CloseIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/tools";
import { cleanTag, hasTag } from "@jam-practice/core/tuneLibrary";

/** A tag as a small pill; `onRemove` adds an ×. */
export function TagPill({ tag, onRemove, active = false }: { tag: string; onRemove?: () => void; active?: boolean }) {
  return (
    <span
      className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md pl-2.5 text-xs font-medium ${onRemove ? "pr-1" : "pr-2.5"} ${
        active ? "bg-accent/15 text-accent" : "bg-foreground/[0.06] text-foreground"
      }`}
    >
      <span className="truncate">{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove the tag ${tag}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-hover hover:text-foreground"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/**
 * A tune's tags, edited in place: each tag with an ×, and a box to add one (Enter or comma adds
 * it). Tags already used on other tunes are offered as you type, so the same tag isn't spelled
 * two ways.
 */
export function TagEditor({ tags, known, onChange }: { tags: string[]; known: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const q = text.trim().toLowerCase();
  const suggestions = useMemo(() => known.filter((t) => !hasTag({ tags }, t) && (!q || t.toLowerCase().includes(q))).slice(0, 8), [known, tags, q]);
  function add(raw: string) {
    const tag = cleanTag(raw);
    if (!tag) return;
    // Use the spelling already in use when it matches one.
    const existing = known.find((t) => t.toLowerCase() === tag.toLowerCase());
    onChange([...tags, existing ?? tag]);
    setText("");
  }
  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <TagPill key={t} tag={t} onRemove={() => onChange(tags.filter((x) => x !== t))} />
          ))}
        </div>
      )}
      <input
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && tags.length) onChange(tags.slice(0, -1));
        }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          // Hide the suggestions a moment later: hiding them at once moved the dialog's Save button
          // up between the press and the release, so the click missed it.
          const box = e.currentTarget;
          window.setTimeout(() => setFocused(document.activeElement === box), 200);
          if (text.trim()) add(text);
        }}
        placeholder={tags.length ? "Add another tag" : "Add a tag, e.g. Gig, Ballads"}
        aria-label="Add a tag"
        className="h-10 w-full rounded-md bg-background px-3 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/40 sm:h-9 sm:text-sm"
      />
      {focused && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              // Before the input's blur, which would add what's typed instead.
              onMouseDown={(e) => {
                e.preventDefault();
                add(t);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-foreground/[0.05] px-2 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground"
            >
              <PlusIcon className="h-3 w-3" />
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A dialog with a tune's tags (from a tune's ⋮ menu). */
export function TagsDialog({
  title,
  tags,
  known,
  onSave,
  onClose,
}: {
  title: string;
  tags: string[];
  known: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(tags);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-surface p-5 text-foreground shadow-2xl ring-1 ring-foreground/[0.06]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <TagEditor tags={draft} known={known} onChange={setDraft} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** Every tag, to rename or delete across all your tunes (or, with `noun`, files). */
export function ManageTagsDialog({
  tags,
  onRename,
  onDelete,
  onClose,
  noun = { one: "tune", many: "tunes" },
  emptyText = "No tags yet. Add one on a tune's page, or when you import charts.",
}: {
  tags: { tag: string; count: number }[];
  onRename: (from: string, to: string) => void;
  onDelete: (tag: string) => void;
  onClose: () => void;
  /** What has the tags ("tune" / "tunes"). */
  noun?: { one: string; many: string };
  emptyText?: string;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    if (renaming || deleting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, renaming, deleting]);
  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay p-3 sm:items-center sm:p-4" onClick={onClose}>
        <div
          role="dialog"
          aria-label="Tags"
          className="flex max-h-[80dvh] w-full max-w-md flex-col gap-3 rounded-3xl bg-surface px-5 pb-5 pt-4 text-foreground shadow-2xl ring-1 ring-foreground/[0.06] sm:rounded-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <h2 className="min-w-0 flex-1 text-base font-semibold">Tags</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-foreground"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          {tags.length === 0 ? (
            <p className="text-sm text-muted">{emptyText}</p>
          ) : (
            <ul className="-mx-2 flex flex-col overflow-y-auto">
              {tags.map(({ tag, count }) => (
                <li key={tag} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-hover">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{tag}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {count} {count === 1 ? noun.one : noun.many}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRenaming(tag)}
                    aria-label={`Rename ${tag}`}
                    title="Rename"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(tag)}
                    aria-label={`Delete ${tag}`}
                    title="Delete"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-background hover:text-danger"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {renaming && (
        <PromptDialog
          title="Rename tag"
          initialValue={renaming}
          onSubmit={(name) => {
            if (cleanTag(name) && cleanTag(name) !== renaming) onRename(renaming, cleanTag(name));
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete the tag “${deleting}”?`}
          message={`It's taken off every ${noun.one}. The ${noun.many} themselves stay.`}
          confirmLabel="Delete tag"
          onConfirm={() => {
            onDelete(deleting);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
