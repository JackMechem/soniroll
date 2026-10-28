import type { AudioInput, InputDevice, InputFrame } from "@web/lib/audioInput";
import { Channel, invoke, type AudioDevices } from "./engine";

/** Desktop version of `lib/audioInput`: the microphone or audio interface is opened by the
    native engine, which also runs the pitch detector (the same YIN code, ported to Rust) and
    sends back ~30 readings a second. */

export * from "@web/lib/audioInput";

const SILENCE_RMS = 0.008;

export async function listAudioInputs(): Promise<InputDevice[]> {
  const devices = await invoke<AudioDevices>("audio_devices");
  return devices.inputs;
}

export async function startAudioInput(
  deviceId: string,
  onFrame: (frame: InputFrame) => void,
  getSilenceRms: () => number = () => SILENCE_RMS,
): Promise<AudioInput> {
  const channel = new Channel<{ freq: number | null; level: number }>();
  channel.onmessage = ({ freq, level }) => onFrame({ freq: level < getSilenceRms() ? null : freq, level });
  await invoke("input_start", { deviceId, onFrame: channel });
  return { stop: () => void invoke("input_stop") };
}
