"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ChevronLeftIcon, DocumentIcon, PlusIcon, TrashIcon } from "@/components/tools";
import type { ShedNotesConfig } from "@/lib/shedNotesConfig";
import { templateVars } from "@/lib/noteTemplates";
import { errorText } from "@/lib/useShedNotes";
import type { NoteActions } from "./commands";
import type { NoteTitle } from "./editorSetup";
import NoteEditor from "./NoteEditor";
import type { NoteTemplate } from "./TemplateFillDialog";

type Patch = { name?: string; title?: string; body?: string };

/**
 * Templates live here, apart from notes: a list on the left and the open template on the right —
 * its name, the title new notes get, and its text, written like any note. {{name}} anywhere makes
 * a blank that's asked for when a note is made from it.
 */
export default function TemplatesPane({
  templates,
  notes,
  config,
  actions,
  onBack,
  onNotice,
}: {
  templates: NoteTemplate[];
  notes: NoteTitle[];
  config: ShedNotesConfig;
  actions: NoteActions;
  onBack: () => void;
  onNotice: (text: string) => void;
}) {
  const createMut = useMutation(api.shedNoteTemplates.create);
  const updateMut = useMutation(api.shedNoteTemplates.update);
  const removeMut = useMutation(api.shedNoteTemplates.remove);
  const [openId, setOpenId] = useState<string | null>(templates[0]?.id ?? null);
  const [deleting, setDeleting] = useState<NoteTemplate | null>(null);
  const open = templates.find((t) => t.id === openId) ?? null;

  // Typing is saved a moment after it stops (and when switching template or leaving).
  const pending = useRef<{ id: string; patch: Patch } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) void updateMut({ id: p.id as Id<"shedNoteTemplates">, ...p.patch }).catch((e) => onNotice(errorText(e)));
  }, [updateMut, onNotice]);
  const change = useCallback(
    (id: string, patch: Patch) => {
      if (pending.current && pending.current.id !== id) flush();
      pending.current = { id, patch: { ...(pending.current?.patch ?? {}), ...patch } };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );
  useEffect(() => () => flush(), [flush]);

  async function newTemplate() {
    flush();
    try {
      const made = await createMut({ name: "New template", body: "" });
      setOpenId(made.id);
    } catch (e) {
      onNotice(errorText(e));
    }
  }

  // Writing a template: the palette, settings and notation (each note made from it gets its own
  // copy of the scores); no links to follow or notes to make from here.
  const editorActions = useMemo<NoteActions>(
    () => ({ setConfig: actions.setConfig, config: actions.config, openCommandPalette: actions.openCommandPalette, openScore: actions.openScore }),
    [actions],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-foreground/[0.05] pl-2 pr-3 text-sm font-medium transition-colors hover:bg-surface-hover">
          <ChevronLeftIcon className="h-4 w-4" /> Notes
        </button>
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">Templates</h2>
        <button type="button" onClick={() => void newTemplate()} className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
          <PlusIcon className="h-4 w-4" /> New template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/15 p-6 text-center">
          <p className="text-sm font-medium">No templates yet</p>
          <p className="max-w-sm text-sm text-muted">A template is a note to start from. Put {"{{blanks}}"} in it, like {"{{tune}}"} or {"{{student}}"}, and you&apos;ll fill them in when you make a note from it.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          <ul className="flex shrink-0 gap-1 overflow-x-auto border-b border-foreground/10 pb-2 md:w-56 md:flex-col md:gap-px md:overflow-y-auto md:border-b-0 md:border-r md:pb-0 md:pr-3">
            {templates.map((t) => (
              <li key={t.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    flush();
                    setOpenId(t.id);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${t.id === open?.id ? "bg-surface-hover font-medium" : "text-foreground/80 hover:bg-surface-hover/60 hover:text-foreground"}`}
                >
                  <DocumentIcon className={`h-3.5 w-3.5 shrink-0 ${t.id === open?.id ? "text-foreground" : "text-muted"}`} />
                  <span className="truncate">{t.name}</span>
                </button>
              </li>
            ))}
          </ul>

          {open && <TemplateEditor key={open.id} template={open} notes={notes} config={config} actions={editorActions} onChange={(patch) => change(open.id, patch)} onDelete={() => setDeleting(open)} />}
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete the template "${deleting.name}"?`}
          message="Notes made from it stay as they are."
          confirmLabel="Delete"
          onConfirm={() => {
            const t = deleting;
            setDeleting(null);
            pending.current = null;
            setOpenId(templates.find((x) => x.id !== t.id)?.id ?? null);
            void removeMut({ id: t.id as Id<"shedNoteTemplates"> }).catch((e) => onNotice(errorText(e)));
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  notes,
  config,
  actions,
  onChange,
  onDelete,
}: {
  template: NoteTemplate;
  notes: NoteTitle[];
  config: ShedNotesConfig;
  actions: NoteActions;
  onChange: (patch: Patch) => void;
  onDelete: () => void;
}) {
  // Typed here, saved in the background — these stay what was typed (not the saved copy).
  const [name, setName] = useState(template.name);
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const vars = templateVars(title, body);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) onChange({ name: e.target.value });
          }}
          aria-label="Template name"
          placeholder="Template name"
          className="min-w-0 flex-1 bg-transparent text-2xl font-semibold tracking-tight outline-none"
        />
        <button type="button" onClick={onDelete} aria-label="Delete template" title="Delete template" className="shrink-0 rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-danger">
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Title for new notes</span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            onChange({ title: e.target.value });
          }}
          placeholder="Blank to type a title each time, or e.g. {{date}} lesson with {{student}}"
          className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-accent/40"
        />
      </label>
      <p className="text-xs text-muted">
        {vars.length ? (
          <>
            Asked for: <span className="font-medium text-foreground">{vars.join(", ")}</span>.{" "}
          </>
        ) : null}
        Type {"{{name}}"} to make a blank. {"{{date}}"}, {"{{time}}"} and {"{{title}}"} fill in by themselves.
      </p>
      <div className="relative min-h-[50vh] rounded-lg md:min-h-0 md:flex-1">
        <NoteEditor
          initialText={template.body}
          config={config}
          notes={notes}
          actions={actions}
          onChange={(text) => {
            setBody(text);
            onChange({ body: text });
          }}
          placeholder="Write the template like a note. {{tune}} makes a blank."
          className="h-full md:absolute md:inset-0"
        />
      </div>
    </div>
  );
}
