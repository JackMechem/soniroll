import { getRecorderSnapshot } from "@/lib/recorderEngine";
import type { TunerRecorderSnapshot, TunerTakeAudio } from "@web/lib/tunerRecorder";
import { Channel, invoke } from "./engine";

/**
 * Desktop version of `lib/tunerRecorder` (the Tuner's Record button), with the same exports: the
 * take is recorded by the native Recorder engine (`src-tauri/src/recorder.rs`, MP3) from the
 * Tuner's own input, instead of `getUserMedia` + `MediaRecorder`, which WebKitGTK doesn't do
 * reliably. Mono (both sides mixed) and without auto gain: the Tuner only needs the pitch, and
 * the level stays as it was played.
 *
 * The native engine records one take at a time, so this won't start while the Recorder tool is
 * recording (and the Recorder would cut a Tuner take off if started during one).
 */

export type { TunerRecorderPhase, TunerRecorderSnapshot, TunerTakeAudio } from "@web/lib/tunerRecorder";

let snapshot: TunerRecorderSnapshot = { phase: "idle", startedAt: null, error: null };
const SERVER_SNAPSHOT = snapshot;
const listeners = new Set<() => void>();

function setSnapshot(patch: Partial<TunerRecorderSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeTunerRecorder(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getTunerRecorderSnapshot(): TunerRecorderSnapshot {
  return snapshot;
}
export function getTunerRecorderServerSnapshot(): TunerRecorderSnapshot {
  return SERVER_SNAPSHOT;
}

/** Bumped by every start and stop, so a start still opening the input knows it was stopped. */
let session = 0;
let open = false;

export async function startTunerRecording(deviceId: string): Promise<void> {
  if (snapshot.phase !== "idle") return;
  if (getRecorderSnapshot().phase !== "idle") {
    setSnapshot({ error: "The Recorder is recording right now. Stop it first." });
    return;
  }
  const id = ++session;
  setSnapshot({ phase: "starting", error: null, startedAt: null });
  // The level isn't shown (the needle is), but the engine wants somewhere to send it.
  const onLevel = new Channel<number>();
  try {
    await invoke("recorder_open", { deviceId, mono: "mix", autoGain: false, onLevel });
  } catch (error) {
    console.error("tuner recorder: couldn't open the input", error);
    if (id === session) setSnapshot({ phase: "idle", error: "Couldn't open the audio input. Check the Tuner's input." });
    return;
  }
  if (id !== session) {
    void invoke("recorder_cancel");
    return;
  }
  open = true;
  try {
    await invoke<number>("recorder_begin", { at: null });
  } catch {
    open = false;
    void invoke("recorder_cancel");
    setSnapshot({ phase: "idle", error: "The recording couldn't start. Try again." });
    return;
  }
  if (id !== session) return;
  setSnapshot({ phase: "recording", startedAt: Date.now() });
}

/** Stops the take and returns it, or null if there's nothing (stopped before it started). */
export async function stopTunerRecording(): Promise<TunerTakeAudio | null> {
  session++;
  if (snapshot.phase !== "recording") {
    if (open) void invoke("recorder_cancel");
    open = false;
    setSnapshot({ phase: "idle", startedAt: null });
    return null;
  }
  setSnapshot({ phase: "finishing" });
  try {
    const { duration_sec: durationSec } = await invoke<{ duration_sec: number; bytes: number }>("recorder_stop");
    open = false;
    const bytes = await invoke<ArrayBuffer>("recorder_take");
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    setSnapshot({ phase: "idle", startedAt: null });
    if (!blob.size || durationSec <= 0) {
      setSnapshot({ error: "Nothing was recorded." });
      return null;
    }
    return { blob, durationSec };
  } catch (error) {
    console.error("tuner recorder: couldn't finish the take", error);
    if (open) void invoke("recorder_cancel");
    open = false;
    setSnapshot({ phase: "idle", startedAt: null, error: "The recording couldn't be finished. Try again." });
    return null;
  }
}

export function clearTunerRecorderError() {
  setSnapshot({ error: null });
}
