import { SENSITIVITY, startAudioInput, type AudioInput } from '@/lib/audioInput';

/**
 * The native sibling of `apps/web/lib/tunerEngine.ts` — same plain module-level engine shape
 * `metronomeEngine.ts`/`practiceTimerEngine.ts` already use, for the same reason: "Start
 * listening" is a session worth surviving a re-render (and, on native, an app backgrounding —
 * though the mic itself stops delivering buffers once truly backgrounded, same as any other
 * native audio input). The screen is just a view: push settings in, read the live detected pitch
 * back out via `useSyncExternalStore`. The tone generator (tap a note to hear it) stays in the
 * screen component — a momentary action, not a session worth keeping alive here.
 */
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

/** One heard frame, for the graph in the dial: `t` from `Date.now()`, cents unsmoothed. */
export interface TunerHistoryPoint {
  t: number;
  target: number;
  cents: number;
}

let config: TunerConfig = { refA: 440, stringMidis: [], sensitivity: 'normal' };
let toneActive = false;
let input: AudioInput | null = null;
let listening = false;
let error: string | null = null;
let reading: TunerReading | null = null;
let candidate: { target: number; frames: number } | null = null;
let lastSeen = 0;
let history: TunerHistoryPoint[] = [];

/** The last few seconds of what the tuner heard (oldest first), like the website's. Not part of the
    snapshot: the graph in the dial reads it on its own animation frames, so the screen doesn't
    re-render for it. Cleared when listening starts. */
export function getTunerHistory(): readonly TunerHistoryPoint[] {
  return history;
}

function buildSnapshot(): TunerSnapshot {
  return { listening, error, reading };
}

let cachedSnapshot = buildSnapshot();
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

export function updateTunerConfig(next: TunerConfig) {
  config = next;
}

/** Called by the screen whenever its own tone-generator state changes — mic frames are ignored
    while a reference tone is playing, the mic would just hear our own tone. */
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
  const now = Date.now();
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

export async function startTunerListening(): Promise<boolean> {
  error = null;
  input?.stop();
  input = null;
  try {
    input = await startAudioInput(
      ({ freq }) => handleFrame(freq),
      () => (SENSITIVITY[config.sensitivity] ?? SENSITIVITY.normal).rms,
    );
    history = [];
    listening = true;
    notify();
    return true;
  } catch {
    error = "Couldn't open the microphone. Check this app's microphone permission.";
    listening = false;
    notify();
    return false;
  }
}

export function stopTunerListening() {
  input?.stop();
  input = null;
  candidate = null;
  listening = false;
  reading = null;
  notify();
}
