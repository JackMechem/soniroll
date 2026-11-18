"use client";

import type { EditorView } from "@codemirror/view";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import ScoreDialog from "@/components/notation/ScoreDialog";
import { type NoteActions, runCommand } from "@/components/shednotes/commands";
import NoteEditor from "@/components/shednotes/NoteEditor";
import { FORMAT, VimSwitch } from "@/components/shednotes/NotePane";
import { ImageIcon, NoteIcon } from "@/components/tools";
import { useNotesConfig } from "@/lib/useShedNotes";

const noop = () => {};

/**
 * Lesson notes in the Shed Notes editor: markdown with live preview, vim (from your Shed Notes
 * settings) and notation (the teacher's Score Writer scores, which the student can see through
 * the lesson). The teacher writes; the student reads the same view. Give it a `key` per note: the
 * text is only read when it mounts.
 */
export default function LessonNoteEditor({
  lessonId,
  markdown,
  editable,
  onChange,
  placeholder,
}: {
  lessonId: string;
  markdown: string;
  editable: boolean;
  onChange?: (markdown: string) => void;
  placeholder?: string;
}) {
  const router = useRouter();
  const cfg = useNotesConfig();
  const { config: settings, setValue } = cfg;
  const viewRef = useRef<EditorView | null>(null);
  const [notation, setNotation] = useState<{ scoreId: string | null; onDone: (id: string) => void } | null>(null);
  // The editor reads its actions through a ref, so a new object each render is fine.
  const actions: NoteActions = {
    openScore: (scoreId, onDone) => setNotation({ scoreId, onDone }),
    openPath: (path) => router.push(path),
    setConfig: (key, value) => void setValue(key, value),
    config: () => settings,
  };
  const config = useMemo(() => ({ ...settings, readableLineLength: false }), [settings]);
  const run = (command: string) => runCommand(command, { view: viewRef.current, actions });

  return (
    <div className="flex flex-col gap-2">
      {editable && (
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-0.5 border-b border-foreground/10 bg-background px-1 py-1.5">
          {FORMAT.map((f) => (
            <button key={f.command} type="button" title={f.title} aria-label={f.title} onMouseDown={(e) => e.preventDefault()} onClick={() => run(f.command)} className={`h-7 min-w-7 shrink-0 rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${f.className ?? "font-medium"}`}>
              {f.label}
            </button>
          ))}
          <button type="button" title="Write music notation" onMouseDown={(e) => e.preventDefault()} onClick={() => run("editor:insert-notation")} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <NoteIcon className="h-3.5 w-3.5" /> Notation
          </button>
          <button type="button" title="Insert a file or picture (or paste one)" onMouseDown={(e) => e.preventDefault()} onClick={() => run("editor:insert-file")} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <ImageIcon className="h-3.5 w-3.5" /> File
          </button>
          <span className="flex-1" />
          <VimSwitch on={settings.vimMode} onChange={(on) => void setValue("vimMode", on)} />
        </div>
      )}
      <NoteEditor
        initialText={markdown}
        readOnly={!editable}
        scoreContext={{ lessonId }}
        config={config}
        actions={actions}
        onChange={onChange ?? noop}
        onView={(v) => {
          viewRef.current = v;
        }}
        placeholder={editable ? placeholder : ""}
        bottomSpace="3rem"
        className="min-h-[50vh]"
      />
      {notation && (
        <ScoreDialog
          scoreId={notation.scoreId}
          onClose={() => {
            setNotation(null);
            viewRef.current?.focus();
          }}
          onDone={(id) => notation.onDone(id)}
        />
      )}
    </div>
  );
}
