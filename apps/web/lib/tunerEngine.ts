/**
 * Tuner's actual mic-listening/pitch-detection engine — moved out of `components/Tuner.tsx` into
 * this plain module, the same shape `lib/metronomeEngine.ts` uses (see that file's own doc
 * comment for *why*). The component is now just a view: it pushes its own synced settings
 * (reference pitch, which strings to snap to, mic sensitivity) and the tone generator's own
 * "am I currently playing a reference tone" flag into this module, and reads the live detected
 * pitch/cents-off back out via `useSyncExternalStore`. The tone generator itself (tap a note to
 * hear it) stays in the component — it's a momentary action, not a session worth keeping alive
 * across navigation, unlike "Start listening."
 */

import { SENSITIVITY, type AudioInput, startAudioInput } from "@/lib/audioInput";
import { micErrorMessage } from "@/lib/micError";

export interface TunerReading {
  target: number;
  cents: number;
  freq: number;
}

export interface TunerConfig {
  refA: number;
  stringMidis: number[];
  sensitivity: string;
}

export interface TunerSnapshot {
  listening: boolean;
  error: string | null;
  reading: TunerReading | null;
}

const HOLD_MS = 800;
/** How much of the recent pitch the engine keeps for the dial's graph. */
const HISTORY_MS = 12000;

/** One heard frame, for the graph in the dial: `t` from `performance.now()`, cents unsmoothed. */
export interface TunerHistoryPoint {
  t: number;
  target: number;
  cents: number;
}

let config: TunerConfig = { refA: 440, stringMidis: [], sensitivity: "normal" };
let toneActive = false;
let input: AudioInput | null = null;
let listening = false;
let error: string | null = null;
let reading: TunerReading | null = null;
let candidate: { target: number; frames: number } | null = null;
let lastSeen = 0;
let history: TunerHistoryPoint[] = [];

/** The last few seconds of what the tuner heard (oldest first). Not part of the snapshot: the
    graph reads it on its own animation frames, so the page doesn't re-render for every point. */
export function getTunerHistory(): readonly TunerHistoryPoint[] {
  return history;
}

function buildSnapshot(): TunerSnapshot {
  return { listening, error, reading };
}

let cachedSnapshot = buildSnapshot();
const SERVER_SNAPSHOT = cachedSnapshot;
const listeners = new Set<() => void>();

function notify() {
  cachedSnapshot = buildSnapshot();
  for (const listener of listeners) listener();
}

export function subscribeTuner(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTunerSnapshot(): TunerSnapshot {
  return cachedSnapshot;
}

export function getTunerServerSnapshot(): TunerSnapshot {
  return SERVER_SNAPSHOT;
}

export function updateTunerConfig(next: TunerConfig) {
  config = next;
}

/** Called by the component whenever its own tone-generator state changes — mic frames are
    ignored while a reference tone is playing, the mic would just hear our own tone. */
export function setTunerToneActive(active: boolean) {
  toneActive = active;
  if (active) {
    candidate = null;
    if (reading !== null) {
      reading = null;
      notify();
    }
  }
}

function handleFrame(freq: number | null) {
  if (toneActive) {
    candidate = null;
    return;
  }
  const now = performance.now();
  if (freq === null) {
    candidate = null;
    if (now - lastSeen > HOLD_MS && reading !== null) {
      reading = null;
      notify();
    }
    return;
  }
  const midi = 69 + 12 * Math.log2(freq / config.refA);
  const strings = config.stringMidis;
  const target =
    strings.length > 0
      ? strings.reduce((best, s) => (Math.abs(midi - s) < Math.abs(midi - best) ? s : best))
      : Math.round(midi);

  candidate =
    candidate && candidate.target === target
      ? { target, frames: candidate.frames + 1 }
      : { target, frames: 1 };
  if (candidate.frames < 2) return;

  lastSeen = now;
  const raw = (midi - target) * 100;
  history.push({ t: now, target, cents: raw });
  if (history[0].t < now - HISTORY_MS) history = history.filter((p) => p.t >= now - HISTORY_MS);
  const prev = reading;
  reading = {
    target,
    freq,
    cents: prev && prev.target === target ? prev.cents * 0.5 + raw * 0.5 : raw,
  };
  notify();
}

export async function startTunerListening(inputDeviceId: string): Promise<boolean> {
  error = null;
  input?.stop();
  input = null;
  try {
    const started = await startAudioInput(
      inputDeviceId,
      ({ freq }) => handleFrame(freq),
      () => (SENSITIVITY[config.sensitivity] ?? SENSITIVITY.normal).rms,
    );
    input = started;
    history = [];
    listening = true;
    notify();
    return true;
  } catch (e) {
    error = micErrorMessage(e, "Couldn't open the mic. Try again, or pick another input.");
    listening = false;
    notify();
    return false;
  }
}

/** Drops a mic error once it no longer applies (the Tuner calls it when you use the tone
    generator instead, which doesn't need the mic). */
export function clearTunerError() {
  if (error === null) return;
  error = null;
  notify();
}

export function stopTunerListening() {
  input?.stop();
  input = null;
  candidate = null;
  listening = false;
  reading = null;
  notify();
}
