import { listen } from "@tauri-apps/api/event";
import { enqueue } from "./engine";

/** Desktop version of `lib/toneGenerator`: reference tones from the native engine. Same
    envelope as the website's (30 ms attack, exponential fade, 120 ms release). */

export type ToneHandle = { stop: () => void };

let nextId = 1;
const onEnded = new Map<number, () => void>();

void listen<number>("audio-tone-ended", ({ payload }) => {
  const handler = onEnded.get(payload);
  onEnded.delete(payload);
  handler?.();
});

export function startTone(
  freq: number,
  wave: OscillatorType,
  volume = 0.35,
  duration?: number,
  onEnd?: () => void,
): ToneHandle {
  const id = nextId++;
  if (onEnd) onEnded.set(id, onEnd);
  enqueue("audio_tone_start", { id, freq, wave, volume, duration: duration ?? null });
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      enqueue("audio_tone_stop", { id });
    },
  };
}
