import type { PadChunk, PadInput } from "@web/lib/padInput";
import { Channel, invoke } from "./engine";

/** Desktop version of `lib/padInput` (the Time Test's microphone): the input is opened by the
    native engine (`src-tauri/src/pad_input.rs`), which sends every sample with where it sits on
    the output's clock, from the capture times the audio system reports. What's left of the round
    trip (the air, the converters) is small, and the Time Test's calibration measures it. */

export type { PadChunk, PadInput } from "@web/lib/padInput";

export async function startPadInput(deviceId: string, onChunk: (chunk: PadChunk) => void): Promise<PadInput> {
  const channel = new Channel<ArrayBuffer>();
  let open = true;
  channel.onmessage = (data) => {
    if (!open) return;
    const view = new DataView(data);
    const frame = view.getFloat64(0, true);
    const time = view.getFloat64(8, true);
    onChunk({ samples: new Float32Array(data.slice(16)), frame, time });
  };
  const info = await invoke<{ sample_rate: number; device_name: string }>("pad_input_open", { deviceId, onChunk: channel });
  return {
    sampleRate: info.sample_rate,
    // The engine's clock already includes the output and capture delays it knows about.
    latencyGuessMs: 0,
    stop: () => {
      open = false;
      void invoke("pad_input_close");
    },
  };
}
