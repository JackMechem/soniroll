"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { SaveTakeDialog } from "@/components/recordings/RecordingParts";
import { MicIcon, StopIcon } from "@/components/tools";
import { type FinishedTake, getRecorderServerSnapshot, getRecorderSnapshot, startRecording, stopRecording, subscribeRecorder } from "@/lib/recorderEngine";
import { formatDuration } from "@/lib/recordings";
import { EMPTY_STRUCTURE } from "@/lib/structure";

const NO_METRONOME = {
  enabled: false,
  settings: { bpm: 100, beatsPerBar: 4, beatUnit: 4, accents: [], subdivision: 1, subAccents: [], volume: 0, soundId: "classic", tempoNoteValue: null },
  structure: { useStructure: false, structure: EMPTY_STRUCTURE },
  countInBars: 0,
};

/** "Record a clip": records straight from the microphone (the Recorder's own engine, auto gain
    on, no metronome) and then saves it to the account on this day — or on one of the day's
    routines (`routineId` preselects it). Signed out, it says recordings need an account. */
export default function RecordClip({
  date,
  routineId = null,
  routines,
  compact = false,
}: {
  date: string;
  routineId?: string | null;
  routines: { id: string; name: string }[];
  compact?: boolean;
}) {
  const { isAuthenticated } = useConvexAuth();
  const rec = useSyncExternalStore(subscribeRecorder, getRecorderSnapshot, getRecorderServerSnapshot);
  // Only the button that started it shows the take in progress (several are on the page).
  const [mine, setMine] = useState(false);
  const [take, setTake] = useState<FinishedTake | null>(null);
  const busy = rec.phase !== "idle";
  const recording = mine && busy;

  async function toggle() {
    if (!recording) {
      if (busy) return;
      setMine(true);
      await startRecording(NO_METRONOME, { autoGain: true, mono: null, gain: 1 });
      return;
    }
    if (rec.phase === "finishing") return;
    const finished = await stopRecording();
    setMine(false);
    if (finished) setTake(finished);
  }

  if (!isAuthenticated) {
    return compact ? null : <p className="text-xs text-muted">Sign in to record clips — recordings are saved to your account.</p>;
  }

  return (
    <>
      {recording ? (
        <div className="flex h-9 items-center gap-2 rounded-md border border-danger/30 pl-3 pr-1">
          <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
          <Elapsed since={rec.startedAt} />
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-foreground/10">
            <span className="block h-full bg-danger transition-[width]" style={{ width: `${Math.round(Math.min(1, rec.level * 3) * 100)}%` }} />
          </span>
          <button
            type="button"
            onClick={() => void toggle()}
            className="flex h-7 items-center gap-1 rounded-md bg-danger px-2.5 text-xs font-medium text-white hover:opacity-90"
          >
            <StopIcon className="h-3.5 w-3.5" /> Stop
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          title={busy ? "Already recording" : undefined}
          className={`flex items-center gap-1.5 rounded-md bg-foreground/[0.05] font-medium hover:bg-surface-hover disabled:opacity-50 ${compact ? "h-8 px-2.5 text-xs" : "h-8 px-3 text-sm"}`}
        >
          <MicIcon className="h-3.5 w-3.5 text-danger" /> {compact ? "Record" : "Record a clip"}
        </button>
      )}
      {mine && rec.error && <span className="text-xs text-danger">{rec.error}</span>}
      {take && (
        <SaveTakeDialog
          blob={take.blob}
          durationSec={take.durationSec}
          initialTuneId={null}
          log={{ date, routineId, routines }}
          onSaved={() => setTake(null)}
          onDiscard={() => setTake(null)}
        />
      )}
    </>
  );
}

function Elapsed({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return <span className="text-xs font-medium tabular-nums text-danger">{since ? formatDuration((now - since) / 1000) : "Starting…"}</span>;
}
