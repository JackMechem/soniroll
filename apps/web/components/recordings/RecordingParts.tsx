"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import MixPlayer, { SavedMixPlayer } from "@/components/recordings/MixPlayer";
import TakePlayer from "@/components/recordings/TakePlayer";
import { CloseIcon, LinkIcon, MicIcon, NoteIcon, SearchIcon, TrashIcon } from "@/components/tools";
import { sortByText } from "@jam-practice/core/sortText";
import { errorText } from "@/lib/files";
import {
  type Recording,
  type RecordingMix,
  DEFAULT_MIX,
  audioFileDuration,
  formatDuration,
  formatRecordedAt,
  recordingsApi,
  tuneSongsApi,
  uploadRecordingBlob,
  useTuneIndex,
  useTuneSong,
} from "@/lib/recordings";

/** A recording in a list: name (links to its page), date · length (· tune), and a player — over
    the tune's song, with the mixer, when `songUrl` is given. */
export function RecordingCard({
  recording,
  tuneName,
  songUrl,
  songName,
}: {
  recording: Recording;
  tuneName?: string | null;
  songUrl?: string | null;
  songName?: string;
}) {
  const detail = [formatRecordedAt(recording.createdAt), formatDuration(recording.durationSec), tuneName].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-3">
      <Link href={`/recordings/view?id=${recording._id}`} className="min-w-0 hover:underline">
        <div className="truncate text-sm font-medium">{recording.name}</div>
        <div className="truncate text-xs text-muted">{detail}</div>
      </Link>
      {recording.url &&
        (songUrl ? (
          <SavedMixPlayer recording={recording} songUrl={songUrl} songName={songName} compact lazy />
        ) : (
          <TakePlayer url={recording.url} durationSec={recording.durationSec} compact />
        ))}
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** Pick one of your tunes (from both lists) to link a recording to. */
export function TuneSelectDialog({ onPick, onClose }: { onPick: (tuneId: string) => void; onClose: () => void }) {
  useEscape(onClose);
  const byId = useTuneIndex();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...byId.values()].filter((r) => !q || r.tune.name.toLowerCase().includes(q));
    return sortByText(all, (r) => r.tune.name);
  }, [byId, query]);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-label="Link to a tune" className="flex max-h-[75vh] w-full max-w-lg flex-col gap-3 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40 sm:h-9">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your tunes" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm" />
        </div>
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {rows.length === 0 ? (
            <li className="p-3 text-sm text-muted">{query ? "No tunes match." : "No tunes in your library yet."}</li>
          ) : (
            rows.slice(0, 300).map((r) => (
              <li key={r.tune.id}>
                <button type="button" onClick={() => onPick(r.tune.id)} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-hover">
                  <LinkIcon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.tune.name}</span>
                    <span className="block truncate text-xs text-muted">{r.list === "learn" ? "Tunes to Learn" : "Tunes I Know"}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

/** Pick one of your existing recordings to link to a tune. Ones already linked to it aren't
    offered; ones linked to another tune say so (linking moves them). */
export function RecordingSelectDialog({
  excludeTuneId,
  onPick,
  onClose,
}: {
  excludeTuneId: string;
  onPick: (recording: Recording) => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const recordings = useQuery(recordingsApi.list, {});
  const byId = useTuneIndex();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recordings ?? []).filter((r) => r.tuneId !== excludeTuneId && (!q || r.name.toLowerCase().includes(q)));
  }, [recordings, excludeTuneId, query]);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-label="Link a recording" className="flex max-h-[75vh] w-full max-w-lg flex-col gap-3 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40 sm:h-9">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recordings" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm" />
        </div>
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {recordings === undefined ? (
            <li className="flex justify-center p-4">
              <LoadingSpinner />
            </li>
          ) : rows.length === 0 ? (
            <li className="p-3 text-sm text-muted">{query ? "No recordings match." : "No other recordings to link."}</li>
          ) : (
            rows.map((r) => {
              const other = r.tuneId ? byId.get(r.tuneId)?.tune.name : null;
              return (
                <li key={r._id}>
                  <button type="button" onClick={() => onPick(r)} className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-surface-hover">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <span className="truncate text-xs text-muted">
                      {[formatRecordedAt(r.createdAt), formatDuration(r.durationSec), other ? `linked to ${other}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

/** What a finished take turns into: listen back, name it, link a tune, add notes, then Save
    uploads it to the account. Discard asks first — the take only exists in this tab until saved. */
export function SaveTakeDialog({
  blob,
  durationSec,
  initialTuneId,
  initialMix,
  onSaved,
  onDiscard,
  log,
}: {
  blob: Blob;
  durationSec: number;
  initialTuneId: string | null;
  /** A Shed Log clip: the day it's on, and the routines that day it can be attached to
      (`routineId` preselects one; null = the day itself). */
  log?: { date: string; routineId: string | null; routines: { id: string; name: string }[] };
  /** The mix it was recorded with, when the tune's song played along (its line-up measured). */
  initialMix?: RecordingMix | null;
  onSaved: (id: string) => void;
  onDiscard: () => void;
}) {
  const byId = useTuneIndex();
  const generateUploadUrl = useMutation(recordingsApi.generateUploadUrl);
  const create = useMutation(recordingsApi.create);
  const forTune = useQuery(recordingsApi.listForTune, initialTuneId ? { tuneId: initialTuneId } : "skip");
  // Released when the dialog is done (saved/discarded) — not in an effect cleanup, which React's
  // dev double-mount runs early and leaves the preview pointing at a revoked URL.
  const [url] = useState(() => URL.createObjectURL(blob));
  const [recordedAt] = useState(() => Date.now());

  const [tuneId, setTuneId] = useState<string | null>(initialTuneId);
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [mix, setMix] = useState<RecordingMix>(initialMix ?? DEFAULT_MIX);
  const [logRoutineId, setLogRoutineId] = useState<string | null>(log?.routineId ?? null);
  const song = useTuneSong(tuneId);

  const defaultName = initialTuneId && forTune ? `Take ${forTune.length + 1}` : formatRecordedAt(recordedAt);
  const shownName = name ?? defaultName;
  const tune = tuneId ? byId.get(tuneId)?.tune : undefined;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const storageId = await uploadRecordingBlob(blob, generateUploadUrl);
      const id = await create({
        storageId,
        name: shownName,
        notes,
        durationSec,
        mimeType: blob.type || "audio/webm",
        ...(tuneId ? { tuneId } : {}),
        ...(tuneId && (song?.url || initialMix) ? { mix } : {}),
        ...(log ? { logDate: log.date, ...(logRoutineId ? { routineId: logRoutineId } : {}) } : {}),
      });
      URL.revokeObjectURL(url);
      onSaved(id);
    } catch (e) {
      setSaving(false);
      setError(errorText(e, "Couldn't save the recording."));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-overlay p-4 pt-[8vh]">
      <div role="dialog" aria-label="Save recording" className="flex w-full max-w-lg flex-col gap-4 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 text-left shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Save recording</h2>
          <button type="button" onClick={() => setConfirmDiscard(true)} aria-label="Discard" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {song?.url ? (
          <MixPlayer takeUrl={url} songUrl={song.url} takeName={shownName} songName={song.name} mix={mix} onMixChange={setMix} />
        ) : (
          <TakePlayer url={url} durationSec={durationSec} />
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Name</span>
          <input value={shownName} onChange={(e) => setName(e.target.value)} className="h-10 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:h-9 sm:text-sm" />
        </label>
        {log && log.routines.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">Attached to</span>
            <div className="flex flex-wrap gap-1.5">
              {[{ id: null as string | null, name: "Just the day" }, ...log.routines].map((r) => (
                <button
                  key={r.id ?? "day"}
                  type="button"
                  onClick={() => setLogRoutineId(r.id)}
                  aria-pressed={logRoutineId === r.id}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${logRoutineId === r.id ? "bg-accent text-accent-foreground" : "hover:bg-surface-hover"}`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Tune</span>
          <div className="flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40 sm:h-9">
            <LinkIcon className="h-4 w-4 text-muted" />
            <button type="button" onClick={() => setPicking(true)} className={`min-w-0 flex-1 truncate text-left text-base sm:text-sm ${tune ? "" : "text-muted"}`}>
              {tune ? tune.name : "Not linked — click to link a tune"}
            </button>
            {tune && (
              <button type="button" onClick={() => setTuneId(null)} className="text-sm font-medium text-muted hover:text-foreground">
                Unlink
              </button>
            )}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="How did it go? What to work on…"
            className="resize-y rounded-md bg-foreground/[0.05] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
          />
        </label>
        {error && <p className="text-sm text-danger">{error} Your take is still here — try Save again.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmDiscard(true)} disabled={saving} className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-danger hover:bg-surface-hover disabled:opacity-50">
            Discard
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
          >
            {saving && <LoadingSpinner size="sm" inline />}
            {saving ? "Uploading…" : "Save"}
          </button>
        </div>
        {confirmDiscard && (
          <div className="flex flex-col gap-3 rounded-md bg-foreground/[0.05] p-3">
            <p className="text-sm">Discard this take? It hasn&apos;t been saved, so it&apos;ll be gone for good.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-surface-hover">
                Keep it
              </button>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(url);
                  onDiscard();
                }}
                className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
      {picking && (
        <TuneSelectDialog
          onPick={(id) => {
            setTuneId(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** A tune page's Recordings: its takes (playable in place), "Record a take" (the Recorder, already
    linked to this tune, metronome at its tempo) and "Link existing". */
export function TuneRecordings({ tuneId }: { tuneId: string }) {
  const { isAuthenticated } = useConvexAuth();
  const recordings = useQuery(recordingsApi.listForTune, isAuthenticated ? { tuneId } : "skip");
  const song = useTuneSong(tuneId);
  const update = useMutation(recordingsApi.update);
  const [linking, setLinking] = useState(false);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Recordings</h2>
        {recordings && recordings.length > 0 && <span className="text-xs tabular-nums text-muted">{recordings.length}</span>}
      </div>
      {!isAuthenticated ? (
        <p className="text-sm text-muted">Sign in to record takes of this tune — recordings are saved to your account.</p>
      ) : (
        <>
          <TuneSongPanel tuneId={tuneId} />
          {recordings === undefined ? (
            <LoadingSpinner />
          ) : (
            recordings.length > 0 && (
              <div className={song?.url ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2"}>
                {recordings.map((r) => (
                  <RecordingCard key={r._id} recording={r} songUrl={song?.url} songName={song?.name} />
                ))}
              </div>
            )
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/recorder?tuneId=${tuneId}`} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
              <MicIcon className="h-4 w-4" /> Record a take
            </Link>
            <button type="button" onClick={() => setLinking(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
              <LinkIcon className="h-4 w-4" /> Link existing
            </button>
          </div>
        </>
      )}
      {linking && (
        <RecordingSelectDialog
          excludeTuneId={tuneId}
          onPick={(r) => {
            setLinking(false);
            void update({ id: r._id, tuneId });
          }}
          onClose={() => setLinking(false)}
        />
      )}
    </section>
  );
}

const MAX_SONG_BYTES = 100 * 1024 * 1024;

/** The tune's song: an audio file of the real recording, played behind your takes (with a mixer)
    and, from the Recorder, along with you while you record. Add, replace or remove it. */
function TuneSongPanel({ tuneId }: { tuneId: string }) {
  const song = useTuneSong(tuneId);
  const generateUploadUrl = useMutation(recordingsApi.generateUploadUrl);
  const setSong = useMutation(tuneSongsApi.set);
  const removeSong = useMutation(tuneSongsApi.remove);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|aac|wav|aiff?|flac|ogg|opus|webm)$/i.test(file.name)) {
      setError("That isn't an audio file.");
      return;
    }
    if (file.size > MAX_SONG_BYTES) {
      setError("That file is over 100 MB — try an mp3 or m4a of it.");
      return;
    }
    setUploading(true);
    try {
      const durationSec = await audioFileDuration(file);
      const storageId = await uploadRecordingBlob(file, generateUploadUrl);
      await setSong({
        tuneId,
        storageId,
        name: file.name.replace(/\.[^.]+$/, ""),
        mimeType: file.type || "audio/mpeg",
        durationSec,
      });
    } catch (e) {
      setError(errorText(e, "Couldn't upload the song."));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-3">
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.aif,.aiff,.flac,.ogg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <div className="flex items-center gap-3">
        <NoteIcon className="h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          {song === undefined ? (
            <LoadingSpinner size="sm" inline />
          ) : song ? (
            <>
              <div className="truncate text-sm font-medium">{song.name}</div>
              <div className="text-xs text-muted">Song{song.durationSec ? ` · ${formatDuration(song.durationSec)}` : ""} · plays behind your takes</div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium">Add the song</div>
              <div className="text-xs text-muted">Upload an audio file of the tune to play behind your takes, with a mixer for each.</div>
            </>
          )}
        </div>
        {uploading ? (
          <LoadingSpinner size="sm" label="Uploading the song" />
        ) : (
          <>
            <button type="button" onClick={() => input.current?.click()} className="inline-flex h-8 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
              {song ? "Replace" : "Upload"}
            </button>
            {song && (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                aria-label="Remove the song"
                title="Remove the song"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {confirmRemove && (
        <ConfirmDialog
          title="Remove the song?"
          message="The audio file is deleted from your account. Your recordings stay; they just play on their own."
          confirmLabel="Remove"
          onConfirm={() => {
            setConfirmRemove(false);
            void removeSong({ tuneId });
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}
