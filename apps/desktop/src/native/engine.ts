import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** The JavaScript side of the Rust audio engine (`src-tauri/src/audio.rs`). */

export { Channel, invoke };

// The engine clock, as Web Audio's `currentTime` would give it: the last time Rust reported,
// plus how long ago that was. Rust reports about 50 times a second while sound is on.
let anchor: { time: number; perf: number } | null = null;
let latest = 0;
let outputLatency = 0;

void listen<{ time: number; latency: number }>("audio-clock", ({ payload }) => {
  anchor = { time: payload.time, perf: performance.now() };
  outputLatency = payload.latency;
});

/** Engine seconds right now. Never goes backwards. */
export function engineNow(): number {
  if (!anchor) return latest;
  latest = Math.max(latest, anchor.time + (performance.now() - anchor.perf) / 1000);
  return latest;
}

/** Seconds from a sound's scheduled time to it coming out of the speakers. */
export function engineLatency(): number {
  return outputLatency;
}

export function engineStarted(): boolean {
  return anchor !== null;
}

let starting: Promise<void> | null = null;

/** Opens the output stream (once) and waits for the clock. */
export function ensureStarted(): Promise<void> {
  starting ??= invoke<number>("audio_start").then((time) => {
    anchor = { time, perf: performance.now() };
    latest = time;
  });
  return starting;
}

/** Calls the engine one after another, so a "stop" can never overtake its "start". */
let queue: Promise<unknown> = Promise.resolve();
export function enqueue(command: string, args: Record<string, unknown>): void {
  queue = queue
    .then(() => ensureStarted())
    .then(() => invoke(command, args))
    .catch((error) => console.error(`audio: ${command} failed`, error));
}

export type AudioStatus = {
  running: boolean;
  host: string;
  device_id: string;
  device_name: string;
  sample_rate: number;
  requested_buffer: number;
  buffer_frames: number;
  buffer_ms: number;
  output_latency_ms: number;
};

export type AudioDevices = {
  host: string;
  inputs: { id: string; label: string }[];
  outputs: { id: string; label: string }[];
};
