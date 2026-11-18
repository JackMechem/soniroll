"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { cleanScore } from "@/lib/bassTranscription";
import { createPortal } from "react-dom";
import type { EditorView } from "@codemirror/view";
import Score from "@/components/notation/Score";
import { ScoreIcon } from "@/components/tools";
import { actionsFacet } from "./livePreview";
import { useEmbeds } from "./embedStore";

const noop = () => {};

/** Renders the scores in one editor's ```score blocks into their widgets (see `embedStore`). */
/** Someone else's scores are readable through a lesson's notes, a note shared with you, or a
    note's link. */
export type ScoreContext = { lessonId?: string; noteId?: string; token?: string };

export default function ScoreEmbeds({ owner, context }: { owner: string; context?: ScoreContext }) {
  const embeds = useEmbeds().filter((e) => e.owner === owner && e.kind === "score");
  return <>{embeds.map((e) => createPortal(<ScoreEmbed scoreId={e.id} view={e.view} context={context} />, e.el, e.key))}</>;
}

/** A score in a note: its title, Edit (the notation editor) and the score itself, read-only. */
function ScoreEmbed({ scoreId, view, context }: { scoreId: string; view: EditorView; context?: ScoreContext }) {
  const row = useQuery(api.scores.get, scoreId ? { id: scoreId, ...(context ?? {}) } : "skip");
  const data = row?.data;
  const score = useMemo(() => (data ? cleanScore(data) : row === null ? null : undefined), [data, row]);
  // Someone else's score (a teacher's, in lesson notes) is shown, not edited.
  const canEdit = !!row && !row.readOnly && !view.state.readOnly;
  const box = useRef<HTMLDivElement>(null);

  // The score draws after CodeMirror measured the widget — tell it the height changed.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => view.requestMeasure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const edit = () => view.state.facet(actionsFacet)().openScore?.(scoreId, noop);

  return (
    <div ref={box} className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <ScoreIcon className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate font-medium">{score ? score.title : score === null ? "Score not found" : "Loading…"}</span>
        {score && canEdit && (
          <>
            <button type="button" onClick={edit} className="h-7 rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover">
              Edit
            </button>
            <Link href={`/score-writer?id=${encodeURIComponent(scoreId)}`} className="hidden h-7 items-center rounded-md px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground sm:inline-flex">
              Open in Score Writer
            </Link>
          </>
        )}
      </div>
      {score === null ? (
        <p className="text-xs text-muted">This score was deleted from Score Writer.</p>
      ) : score ? (
        <div onDoubleClick={canEdit ? edit : undefined}>
          <Score transcription={score} cursor={null} playing={null} mode="select" onSelect={noop} onAdd={noop} onReplace={noop} onChordClick={noop} />
        </div>
      ) : (
        <div className="h-36" />
      )}
    </div>
  );
}
