"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { SAVE_LABEL, useAutosave } from "@/components/bassgenius/TranscriptionEditor";
import ScoreEditor from "@/components/notation/ScoreEditor";
import { CloseIcon } from "@/components/tools";
import type { Transcription } from "@/lib/bassTranscription";
import { newScore, useScore, useScoreActions } from "@/lib/useScores";

/**
 * The notation editor in a dialog, on a Score Writer score — how notation is written from Shed
 * Notes. `scoreId` null starts a new score, which is only made once something's written; `onDone`
 * gets its id when the dialog closes.
 */
export default function ScoreDialog({ scoreId, onDone, onClose }: { scoreId: string | null; onDone: (scoreId: string) => void; onClose: () => void }) {
  const loaded = useScore(scoreId);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay sm:items-center sm:p-4">
      <div role="dialog" aria-label="Music notation" className="flex h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-xl bg-background text-foreground shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] sm:h-[90vh] sm:rounded-xl">
        {scoreId && loaded === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : scoreId && loaded === null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted">This score was deleted.</p>
            <button type="button" onClick={onClose} className="flex h-9 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
              Close
            </button>
          </div>
        ) : (
          <Editing scoreId={scoreId} start={loaded ?? null} onDone={onDone} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function Editing({ scoreId, start, onDone, onClose }: { scoreId: string | null; start: Transcription | null; onDone: (id: string) => void; onClose: () => void }) {
  const [initial] = useState(() => start ?? newScore());
  const { create, save } = useScoreActions();
  const idRef = useRef<string | null>(scoreId);
  const [id, setId] = useState<string | null>(scoreId);
  const creating = useRef<Promise<string> | null>(null);
  const { change, flush, saveState } = useAutosave(async (t: Transcription) => {
    if (idRef.current) return save(idRef.current, t);
    // A new score: made on the first save (later saves wait for it).
    creating.current ??= create(t).then((made) => {
      idRef.current = made;
      setId(made);
      return made;
    });
    const made = await creating.current;
    if (made) await save(made, t);
  });

  const finish = async () => {
    flush();
    const made = idRef.current ?? (creating.current ? await creating.current : null);
    if (made) onDone(made);
    onClose();
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape is the editor's own (back to Select); Ctrl/⌘-Enter closes.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void finishRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 pt-4 sm:px-6">
      <ScoreEditor
        initial={initial}
        onChange={change}
        staffControls
        autoFocus
        header={(t, setMeta) => (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={t.title}
              onChange={(e) => setMeta({ title: e.target.value })}
              aria-label="Title"
              className="min-w-0 flex-1 rounded-md bg-transparent px-1 -mx-1 text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            <span className="text-xs text-muted" aria-live="polite">
              {id || saveState !== "saved" ? SAVE_LABEL[saveState] : "Not saved yet"}
            </span>
            {id && (
              <Link href={`/score-writer?id=${encodeURIComponent(id)}`} onClick={() => flush()} className="flex h-9 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
                Open in Score Writer
              </Link>
            )}
            <button type="button" onClick={() => void finish()} className="flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover" title="Done (Ctrl/⌘-Enter)">
              {scoreId ? "Done" : "Add to note"}
            </button>
            <button type="button" onClick={() => void finish()} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      />
    </div>
  );
}
