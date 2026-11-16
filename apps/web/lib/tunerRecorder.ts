/**
 * The Tuner's Record button on the website: one take from the Tuner's own input (the same device,
 * with the same voice-call processing turned off), through the browser's `MediaRecorder`. A plain
 * module like `lib/tunerEngine.ts`, so a take keeps going if you look at another page.
 *
 * The desktop app swaps this module for `apps/desktop/src/native/tunerRecorder.ts` (same exports),
 * which records through the native engine instead.
 *
 * Separate from the Recorder's engine (`lib/recorderEngine.ts`) on purpose: those takes are saved
 * to the account; these stay on this device (`lib/tunerTakes.ts`).
 */

import { openStream } from "@/lib/audioInput";
import { beginMicUse, endMicUse } from "@/lib/iosAudio";

export type TunerRecorderPhase = "idle" | "starting" | "recording" | "finishing";

export interface TunerRecorderSnapshot {
  phase: TunerRecorderPhase;
  /** `Date.now()` when the take started. */
  startedAt: number | null;
  error: string | null;
}

export type TunerTakeAudio = { blob: Blob; durationSec: number };

// AAC in MP4 where the browser records it (plays everywhere), else Opus in WebM.
const MIME_CANDIDATES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

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

let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
/** Bumped by every start and stop, so a start still waiting for the mic knows it was stopped. */
let session = 0;

function release() {
  stream?.getTracks().forEach((t) => t.stop());
  if (stream) endMicUse();
  stream = null;
  recorder = null;
}

export async function startTunerRecording(deviceId: string): Promise<void> {
  if (snapshot.phase !== "idle") return;
  const id = ++session;
  setSnapshot({ phase: "starting", error: null, startedAt: null });
  beginMicUse();
  let opened: MediaStream;
  try {
    opened = await openStream(deviceId);
  } catch {
    endMicUse();
    if (id === session) setSnapshot({ phase: "idle", error: "Couldn't open the audio input. Check the browser's microphone permission." });
    return;
  }
  if (id !== session) {
    opened.getTracks().forEach((t) => t.stop());
    endMicUse();
    return;
  }
  stream = opened;
  const mimeType = MIME_CANDIDATES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  try {
    recorder = new MediaRecorder(opened, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 });
  } catch {
    release();
    setSnapshot({ phase: "idle", error: "This browser can't record audio." });
    return;
  }
  chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.start(1000);
  setSnapshot({ phase: "recording", startedAt: Date.now() });
}

/** Stops the take and returns it, or null if there's nothing (stopped before it started). */
export async function stopTunerRecording(): Promise<TunerTakeAudio | null> {
  session++;
  const rec = recorder;
  if (snapshot.phase !== "recording" || !rec) {
    release();
    setSnapshot({ phase: "idle", startedAt: null });
    return null;
  }
  const startedAt = snapshot.startedAt ?? Date.now();
  setSnapshot({ phase: "finishing" });
  const blob = await new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    try {
      rec.stop();
    } catch {
      resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    }
  });
  chunks = [];
  release();
  setSnapshot({ phase: "idle", startedAt: null });
  if (!blob.size) {
    setSnapshot({ error: "Nothing was recorded." });
    return null;
  }
  // Browser-recorded files often carry no length; the Tuner reads the exact one when it decodes it.
  return { blob, durationSec: (Date.now() - startedAt) / 1000 };
}

export function clearTunerRecorderError() {
  setSnapshot({ error: null });
}
