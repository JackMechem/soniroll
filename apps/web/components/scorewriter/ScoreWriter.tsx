"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import { BackButton } from "@/components/library/shared";
import ToolLayout from "@/components/ToolLayout";
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
    <ScoreShell
      actions={
        <>
          <button type="button" onClick={() => fileInput.current?.click()} className="flex h-8 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
            <UploadIcon className="h-4 w-4" /> Import
          </button>
          <button type="button" onClick={() => void make()} className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
            <PlusIcon className="h-4 w-4" /> New score
          </button>
        </>
      }
    >
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
          <p className="max-w-sm text-sm text-muted">
            {/* Touch screens have no keyboard to type notes with. */}
            {/* "New score" is the header's button (one is enough). */}
            <span className="[@media(pointer:coarse)]:hidden">No scores yet. Start one and write with the keyboard (letters for notes, 3–7 for lengths) or click notes onto the staff.</span>
            <span className="hidden [@media(pointer:coarse)]:inline">No scores yet. Start one, then tap a length and a note name (C to B) to add notes, or switch to Write, hold a finger on the staff and lift to add one.</span>
          </p>
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
    </ScoreShell>
  );
}

/** Score Writer's pages in the same frame as the other tools: the compact header bar with the
    tool's icon, name and ? (desktop), or the row under the app's top bar (phones). */
function ScoreShell({ actions, children }: { actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <ToolLayout title="Score Writer" layout="stacked" topAligned options={null} actions={actions}>
      <div className="flex w-full flex-col gap-6 text-left lg:px-2">{children}</div>
    </ToolLayout>
  );
}

function ScorePage({ id, onBack }: { id: string; onBack: () => void }) {
  const score = useScore(id);
  if (score === undefined) {
    return (
      <ScoreShell>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </ScoreShell>
    );
  }
  if (score === null) {
    return (
      <ScoreShell>
        <BackButton onClick={onBack} label="Scores" />
        <p className="text-sm text-muted">This score isn&apos;t there any more.</p>
      </ScoreShell>
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

  // The latest version, for Export (the editor keeps its own copy; this follows its changes).
  const latest = useRef(initial);

  const btn = "flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover";
  const back = (
    <BackButton
      onClick={() => {
        flush();
        onBack();
      }}
      label="Scores"
    />
  );
  return (
    <ScoreShell
      // Saved, Export and Delete go in the tool's own bar (the header bar on desktop; on phones the
      // row with the ?, along with Back), so on a phone the staff isn't pushed down by a row of them.
      actions={
        <>
          <div className="flex lg:hidden">{back}</div>
          <span className="text-xs text-muted max-lg:ml-auto" aria-live="polite">
            {SAVE_LABEL[saveState]}
          </span>
          <button
            type="button"
            onClick={() => {
              const t = latest.current;
              downloadJson({ format: FILE_FORMAT, version: 1, exportedAt: new Date().toISOString(), score: t }, `${safeFilename(t.title)}.json`);
            }}
            className={btn}
            title="Export as a file"
            aria-label="Export as a file"
          >
            <DownloadIcon className="h-4 w-4" /> <span className="max-sm:hidden">Export</span>
          </button>
          <button type="button" onClick={() => setDeleting(true)} className={`${btn} hover:text-danger`} aria-label="Delete score" title="Delete score">
            <TrashIcon className="h-4 w-4" />
          </button>
        </>
      }
    >
      <ScoreEditor
        initial={initial}
        onChange={(t) => {
          latest.current = t;
          change(t);
        }}
        staffControls
        underAppBar
        autoFocus
        header={(t, setMeta) => (
          <div className="flex flex-col gap-2">
            <div className="flex max-lg:hidden">{back}</div>
            <input
              value={t.title}
              onChange={(e) => setMeta({ title: e.target.value })}
              aria-label="Title"
              className="w-full min-w-0 rounded-md bg-transparent px-1 -mx-1 text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
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
    </ScoreShell>
  );
}
