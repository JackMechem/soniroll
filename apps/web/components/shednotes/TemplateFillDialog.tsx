"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fillTemplate, templateVars } from "@/lib/noteTemplates";

export type NoteTemplate = { id: string; name: string; title: string; body: string };

/**
 * Asks for a template's variables before a note is made from it (or it's applied to a note). The
 * title box shows when the template has no title of its own and the note doesn't have one yet;
 * below, the title the note will get, filled in as you type.
 */
export default function TemplateFillDialog({
  template,
  askTitle,
  initialTitle = "",
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  template: NoteTemplate;
  /** A new note from a template with no title: ask for one. */
  askTitle: boolean;
  initialTitle?: string;
  confirmLabel: string;
  onSubmit: (values: Record<string, string>, title: string) => void;
  onCancel: () => void;
}) {
  const vars = templateVars(template.title, template.body);
  const [values, setValues] = useState<Record<string, string>>({});
  const [title, setTitle] = useState(initialTitle);
  const filledTitle = askTitle ? title.trim() : fillTemplate(template.title, values).trim();
  const ready = !askTitle || !!title.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const submit = () => ready && onSubmit(values, askTitle ? title.trim() : filledTitle);

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-overlay sm:items-center sm:p-4" onMouseDown={onCancel}>
      <form
        role="dialog"
        aria-label={`Fill in ${template.name}`}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-foreground shadow-xl sm:rounded-xl sm:pb-5"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <h2 className="text-base font-semibold">{template.name}</h2>
          <p className="text-sm text-muted">{vars.length ? "Fill in the blanks for the new note." : "This template has nothing to fill in."}</p>
        </div>
        {askTitle && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Title</span>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-accent/40" />
          </label>
        )}
        {vars.map((name, i) => (
          <label key={name} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">{name}</span>
            <input
              autoFocus={!askTitle && i === 0}
              value={values[name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-accent/40"
            />
          </label>
        ))}
        {!askTitle && template.title.trim() && (
          <p className="text-xs text-muted">
            Title: <span className="font-medium text-foreground">{filledTitle || "Untitled"}</span>
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover">
            Cancel
          </button>
          <button type="submit" autoFocus={!askTitle && !vars.length} disabled={!ready} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
