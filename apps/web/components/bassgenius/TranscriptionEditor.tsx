"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/library/shared";
import ScoreEditor from "@/components/notation/ScoreEditor";
import { DownloadIcon, TrashIcon } from "@/components/tools";
import { transcriptionFile, type Transcription } from "@/lib/bassTranscription";

/** Downloads `data` as a .json file. */
export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string) {
  return name.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "transcription";
}

/** Saves a moment after the last change, and on leaving. */
export function useAutosave<T>(onSave: (value: T) => Promise<void>) {
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    setSaveState("saving");
    saveRef.current(value)
      .then(() => setSaveState(pending.current === null ? "saved" : "unsaved"))
      .catch(() => setSaveState("error"));
  }, []);
  const change = useCallback(
    (value: T) => {
      pending.current = value;
      setSaveState("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush],
  );
  useEffect(() => () => flush(), [flush]);
  return { change, flush, saveState };
}

export const SAVE_LABEL = { saving: "Saving…", unsaved: "Unsaved", error: "Couldn't save — retrying on next change", saved: "Saved" } as const;

/**
 * A bass transcription in Bass Genius: the shared notation editor (bass clef, upright bass
 * playback) with the transcription's title, details, export and delete around it.
 */
export default function TranscriptionEditor({
  initial,
  playerName,
  onSave,
  onBack,
  onDelete,
}: {
  initial: Transcription;
  playerName: string;
  onSave: (t: Transcription) => Promise<void>;
  onBack: () => void;
  onDelete: () => void;
}) {
  const { change, saveState } = useAutosave(onSave);
  const btn = "flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md bg-foreground/[0.05] px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover";
  return (
    <ScoreEditor
      initial={initial}
      onChange={change}
      sound="upright-bass"
      header={(t, setMeta) => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <BackButton onClick={onBack} label={playerName} className="mb-2" />
              <input
                value={t.title}
                onChange={(e) => setMeta({ title: e.target.value })}
                aria-label="Title"
                className="w-full min-w-0 rounded-md bg-transparent text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted" aria-live="polite">
                {SAVE_LABEL[saveState]}
              </span>
              <button type="button" onClick={() => downloadJson(transcriptionFile(t, playerName), `${safeFilename(t.title)}.json`)} className={btn} title="Export as JSON">
                <DownloadIcon className="h-4 w-4" /> Export
              </button>
              <button type="button" onClick={onDelete} className={`${btn} hover:text-danger`} title="Delete transcription" aria-label="Delete transcription">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <details className="rounded-lg bg-surface px-4 py-2 text-sm">
            <summary className="cursor-pointer py-1 font-medium text-muted">Details</summary>
            <div className="grid gap-3 py-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Tune</span>
                <input value={t.tune} onChange={(e) => setMeta({ tune: e.target.value })} placeholder="All the Things You Are" className="h-9 rounded-md bg-foreground/[0.05] px-3 outline-none focus:ring-2 focus:ring-accent/40" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Recording</span>
                <input value={t.source} onChange={(e) => setMeta({ source: e.target.value })} placeholder="Album, track, year, time" className="h-9 rounded-md bg-foreground/[0.05] px-3 outline-none focus:ring-2 focus:ring-accent/40" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Tempo (BPM)</span>
                <input
                  type="number"
                  min={20}
                  max={400}
                  value={t.tempo ?? ""}
                  onChange={(e) => setMeta({ tempo: e.target.value ? Math.max(20, Math.min(400, Math.round(Number(e.target.value)))) : null })}
                  placeholder="120"
                  className="h-9 rounded-md bg-foreground/[0.05] px-3 outline-none focus:ring-2 focus:ring-accent/40"
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-3">
                <span className="text-xs font-medium text-muted">Notes</span>
                <textarea value={t.comments} onChange={(e) => setMeta({ comments: e.target.value })} rows={2} className="rounded-md bg-foreground/[0.05] px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
              </label>
            </div>
          </details>
        </>
      )}
    />
  );
}
