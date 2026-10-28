import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** The JavaScript side of the native audio: the output's clock, and the types the Native audio
    chip and the microphone use. Sound itself goes through the Web Audio bridge (`webAudio/`). */

export { Channel, invoke };

// The output's clock, as Web Audio's `currentTime` would give it: the last time Rust reported,
// plus how long ago that was. Rust reports about 50 times a second while the output runs.
let anchor: { time: number; perf: number } | null = null;
let latest = 0;
let outputLatency = 0;

void listen<{ time: number; latency: number }>("audio-clock", ({ payload }) => {
  anchorClock(payload.time);
  outputLatency = payload.latency;
});

/** A fresh reading of the clock (from Rust, just now). */
export function anchorClock(time: number): void {
  anchor = { time, perf: performance.now() };
}

/** Stops the clock where it is (a suspended context), until Rust reports again. */
export function holdClock(): void {
  engineNow();
  anchor = null;
}

/** Output seconds right now. Never goes backwards. */
export function engineNow(): number {
  if (!anchor) return latest;
  latest = Math.max(latest, anchor.time + (performance.now() - anchor.perf) / 1000);
  return latest;
}

/** Seconds from a sound's scheduled time to it coming out of the speakers. */
export function engineLatency(): number {
  return outputLatency;
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
