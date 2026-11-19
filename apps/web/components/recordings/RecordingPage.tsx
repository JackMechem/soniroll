"use client";

import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyCard, PageHeader, PageShell } from "@/components/library/shared";
import { SavedMixPlayer } from "@/components/recordings/MixPlayer";
import TakePlayer from "@/components/recordings/TakePlayer";
import { TuneSelectDialog } from "@/components/recordings/RecordingParts";
import { LinkIcon, TrashIcon, TunerIcon } from "@/components/tools";
import { formatDuration, formatRecordedAt, recordingsApi, useTuneIndex, useTuneSong } from "@/lib/recordings";
import { copyRecordingToTuner } from "@/lib/tunerTakes";
import { useDeviceUrl } from "@/lib/deviceFiles";
import { OnOtherDevice } from "@/components/files/StorageMove";
import { libraryHref } from "@/components/library/ui";
import { goBackOr } from "@/lib/goBack";

/** Where Back goes when there's no soniroll page behind this one, and where a delete lands. */
const RECORDINGS_TAB = libraryHref("recordings");

/** `/tunes/recording?id=…` (was `/recordings/view`) — one recording: play it, rename it, keep notes on it, link it to a tune
    (or change or unlink it), or delete it. Edits save with the Save button, or when you leave. */
export default function RecordingPage({ id }: { id: string }) {
  const router = useRouter();
  const recording = useDeviceUrl(useQuery(recordingsApi.get, id ? { id: id as Id<"recordings"> } : "skip"));
  const update = useMutation(recordingsApi.update);
  const remove = useMutation(recordingsApi.remove);
  const byId = useTuneIndex();
  const song = useTuneSong(recording?.tuneId);
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toTuner, setToTuner] = useState<"idle" | "busy" | string>("idle");

  // Anything typed but not saved is saved on the way out.
  const pending = useRef<{ id: Id<"recordings">; name?: string; notes?: string } | null>(null);
  useEffect(() => {
    if (!recording) return;
    const n = name?.trim();
    pending.current = {
      id: recording._id,
      ...(n && n !== recording.name ? { name: n } : {}),
      ...(notes !== null && notes !== recording.notes ? { notes } : {}),
    };
  }, [recording, name, notes]);
  useEffect(
    () => () => {
      const p = pending.current;
      if (p && (p.name !== undefined || p.notes !== undefined)) void update(p);
    },
    [update],
  );

  if (recording === undefined) {
    return (
      <PageShell>
        <LoadingSpinner />
      </PageShell>
    );
  }
  if (recording === null) {
    return (
      <PageShell>
        <PageHeader title="Recording" back={() => goBackOr(router, RECORDINGS_TAB)} />
        <EmptyCard>This recording doesn&apos;t exist anymore.</EmptyCard>
      </PageShell>
    );
  }
  const rec = recording;
  const shownName = name ?? rec.name;
  const shownNotes = notes ?? rec.notes;
  const dirty = (shownName.trim() !== "" && shownName.trim() !== rec.name) || shownNotes !== rec.notes;
  function save() {
    const patch = {
      ...(shownName.trim() && shownName.trim() !== rec.name ? { name: shownName.trim() } : {}),
      ...(shownNotes !== rec.notes ? { notes: shownNotes } : {}),
    };
    if (Object.keys(patch).length) void update({ id: rec._id, ...patch });
    setName(null);
    setNotes(null);
  }
  const linked = rec.tuneId ? byId.get(rec.tuneId) : undefined;
  // A copy goes into the Tuner's takes (on this device only), so it can be looked at there again.
  async function openInTuner() {
    if (!rec.url) return;
    setToTuner("busy");
    try {
      const takeId = await copyRecordingToTuner({ id: rec._id, name: rec.name, url: rec.url, durationSec: rec.durationSec });
      router.push(`/tuner?take=${encodeURIComponent(takeId)}`);
    } catch (e) {
      setToTuner((e as Error).message || "Couldn't open it in the Tuner.");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={rec.name}
        subtitle={`${formatRecordedAt(rec.createdAt)} · ${formatDuration(rec.durationSec)}`}
        back={() => goBackOr(router, RECORDINGS_TAB)}
        actions={
          <>
            {dirty && (
              <button type="button" onClick={save} className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
                Save
              </button>
            )}
            {rec.url && (
              <button
                type="button"
                onClick={() => void openInTuner()}
                disabled={toTuner === "busy"}
                aria-label="Open in Tuner"
                title="Play it through the Tuner to see your intonation"
                className="flex h-9 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-60"
              >
                {toTuner === "busy" ? <LoadingSpinner size="sm" inline label="Opening in the Tuner" /> : <TunerIcon className="h-4 w-4 text-muted" />}
                <span className="hidden sm:inline">Open in Tuner</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete recording"
              title="Delete recording"
              className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-danger"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </>
        }
      />
      {toTuner !== "idle" && toTuner !== "busy" && <p className="text-sm text-danger">{toTuner}</p>}
      {rec.url &&
        (song?.url ? (
          <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
            <div className="text-sm text-muted">
              Playing over <span className="font-medium text-foreground">{song.name}</span>
            </div>
            <SavedMixPlayer key={rec._id} recording={rec} songUrl={song.url} songName={song.name} />
          </div>
        ) : (
          <TakePlayer url={rec.url} durationSec={rec.durationSec} />
        ))}
      {!rec.url && rec.device && <OnOtherDevice label={rec.device.label} what="recording" />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted">Name</span>
        <input value={shownName} onChange={(e) => setName(e.target.value)} className="h-10 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:h-9 sm:text-sm" />
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted">Tune</span>
        <div className="flex min-h-10 items-center gap-3 rounded-md bg-surface px-3 py-2">
          <LinkIcon className="h-4 w-4 shrink-0 text-muted" />
          {linked ? (
            <Link href={`/tunes/tune?id=${linked.tune.id}&list=${linked.list}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
              {linked.tune.name}
            </Link>
          ) : (
            <span className="flex-1 text-sm text-muted">{rec.tuneId ? "Its tune was deleted." : "Not linked to a tune."}</span>
          )}
          <button type="button" onClick={() => setPicking(true)} className="text-sm font-medium text-accent hover:underline">
            {linked ? "Change" : "Link a tune"}
          </button>
          {linked && (
            <button type="button" onClick={() => void update({ id: rec._id, tuneId: null })} className="text-sm font-medium text-muted hover:text-foreground">
              Unlink
            </button>
          )}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted">Notes</span>
        <textarea
          value={shownNotes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          placeholder="How did it go? What to work on…"
          className="resize-y rounded-md bg-background p-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
        />
      </label>

      {picking && (
        <TuneSelectDialog
          onPick={(tuneId) => {
            setPicking(false);
            void update({ id: rec._id, tuneId });
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this recording?"
          message="The audio is deleted from your account for good."
          confirmLabel="Delete"
          onConfirm={() => {
            pending.current = null;
            setConfirmDelete(false);
            void remove({ id: rec._id });
            router.replace(RECORDINGS_TAB);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </PageShell>
  );
}
