"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import { BackButton, PageHeader, PageShell } from "@/components/library/shared";
import { SAVE_LABEL, downloadJson, safeFilename, useAutosave } from "@/components/bassgenius/TranscriptionEditor";
import ScoreEditor from "@/components/notation/ScoreEditor";
import { DotsVerticalIcon, DownloadIcon, PlusIcon, ScoreIcon, TrashIcon, UploadIcon } from "@/components/tools";
import { cleanScore, type Transcription } from "@/lib/bassTranscription";
import { type ScoreMeta, newScore, useScore, useScoreActions, useScoreList } from "@/lib/useScores";

const FILE_FORMAT = "soniroll.score";

/** Keeps the address bar on the open score without Next's router (that would remount the page). */
function syncUrl(id: string | null) {
  if (typeof window === "undefined" || !window.location.pathname.startsWith("/score-writer")) return;
  const href = id ? `/score-writer?id=${encodeURIComponent(id)}` : "/score-writer";
  if (window.location.pathname + window.location.search !== href) window.history.replaceState(window.history.state, "", href);
}

const ago = (ms: number) => {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

/**
 * Score Writer: write music in notation — your scores (in your account, or this browser when
 * signed out), each opened in the shared notation editor with its clef, key, time and tempo. Shed
 * Notes embed these same scores.
 */
export default function ScoreWriter({ initialId }: { initialId?: string }) {
  const [openId, setOpenId] = useState<string | null>(initialId || null);
  const open = (id: string | null) => {
    setOpenId(id);
    syncUrl(id);
  };
  return openId ? <ScorePage key={openId} id={openId} onBack={() => open(null)} /> : <ScoreList onOpen={open} />;
}

function ScoreList({ onOpen }: { onOpen: (id: string) => void }) {
  const scores = useScoreList();
  const { create, remove } = useScoreActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [deleting, setDeleting] = useState<ScoreMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function make(data?: Transcription) {
    try {
      onOpen(await create(data ?? newScore()));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importFile(file: File) {
    setError(null);
    try {
      const raw = JSON.parse(await file.text()) as { format?: unknown; score?: unknown; transcription?: unknown };
      const data = raw.format === FILE_FORMAT ? raw.score : raw.transcription ?? raw;
      await make(cleanScore(data));
    } catch {
      setError("That file isn't a score exported from Score Writer or Rhythm Section's bass players.");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Score Writer"
        subtitle="Write music in notation: notes, rests, chords, any key and time. Play it back as you go."
        helpTopic="score-writer"
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
              <UploadIcon className="h-4 w-4" /> Import
            </button>
            <button type="button" onClick={() => void make()} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
              <PlusIcon className="h-4 w-4" /> New score
            </button>
          </div>
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importFile(f);
        }}
      />
      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {!isLoading && !isAuthenticated && <p className="text-sm text-muted">Signed out, your scores are kept in this browser. Sign in to keep them in your account and put them in Shed Notes.</p>}

      {scores === undefined ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : scores.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-foreground/15 p-6 text-center">
          <p className="max-w-sm text-sm text-muted">No scores yet. Start one and write with the keyboard (letters for notes, 3–7 for lengths) or click notes onto the staff.</p>
          <button type="button" onClick={() => void make()} className="flex h-9 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
            New score
          </button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
          {scores.map((s) => (
            <li key={s.id}>
              <div
                className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, items: [{ label: "Open", onSelect: () => onOpen(s.id) }, { label: "Delete", danger: true, onSelect: () => setDeleting(s) }] });
                }}
              >
                <button type="button" onClick={() => onOpen(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <ScoreIcon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {s.measureCount} {s.measureCount === 1 ? "bar" : "bars"} · {ago(s.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Options for ${s.title}`}
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenu({ x: r.right - 200, y: r.bottom + 4, items: [{ label: "Open", onSelect: () => onOpen(s.id) }, { label: "Delete", danger: true, onSelect: () => setDeleting(s) }] });
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground"
                >
                  <DotsVerticalIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.title}"?`}
          message="The score goes for good, and notes that show it will say it's gone."
          confirmLabel="Delete"
          onConfirm={() => {
            void remove(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageShell>
  );
}

function ScorePage({ id, onBack }: { id: string; onBack: () => void }) {
  const score = useScore(id);
  if (score === undefined) {
    return (
      <PageShell>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </PageShell>
    );
  }
  if (score === null) {
    return (
      <PageShell>
        <BackButton onClick={onBack} label="Scores" />
        <p className="text-sm text-muted">This score isn&apos;t there any more.</p>
      </PageShell>
    );
  }
  return <OpenScore id={id} loaded={score} onBack={onBack} />;
}

function OpenScore({ id, loaded, onBack }: { id: string; loaded: Transcription; onBack: () => void }) {
  // The editor keeps its own copy once open: it starts from the first version loaded, and later
  // updates (our own saves coming back) don't reset it.
  const [initial] = useState(loaded);
  const { save, remove } = useScoreActions();
  const [deleting, setDeleting] = useState(false);
  const { change, flush, saveState } = useAutosave((t: Transcription) => save(id, t));

  const btn = "flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover";
  return (
    <PageShell>
      <ScoreEditor
        initial={initial}
        onChange={change}
        staffControls
        autoFocus
        header={(t, setMeta) => (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full min-w-0 sm:w-auto sm:flex-1">
              <BackButton
                onClick={() => {
                  flush();
                  onBack();
                }}
                label="Scores"
                className="mb-2"
              />
              <input
                value={t.title}
                onChange={(e) => setMeta({ title: e.target.value })}
                aria-label="Title"
                className="w-full min-w-0 rounded-md bg-transparent px-1 -mx-1 text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted" aria-live="polite">
                {SAVE_LABEL[saveState]}
              </span>
              <button type="button" onClick={() => downloadJson({ format: FILE_FORMAT, version: 1, exportedAt: new Date().toISOString(), score: t }, `${safeFilename(t.title)}.json`)} className={btn} title="Export as a file">
                <DownloadIcon className="h-4 w-4" /> Export
              </button>
              <button type="button" onClick={() => setDeleting(true)} className={`${btn} hover:text-danger`} aria-label="Delete score" title="Delete score">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      />
      {deleting && (
        <ConfirmDialog
          title="Delete this score?"
          message="It goes for good, and notes that show it will say it's gone."
          confirmLabel="Delete"
          onConfirm={() => {
            void remove(id);
            onBack();
          }}
          onCancel={() => setDeleting(false)}
        />
      )}
    </PageShell>
  );
}
