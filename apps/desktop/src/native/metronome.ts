import { engineNow, ensureStarted } from "./engine";

/** Desktop version of `lib/metronome`: `getAudioContext()` returns the native engine's clock
    instead of a Web Audio context. Only `currentTime`, `state` and `resume` exist on it — enough
    for the Metronome and Tuner, which play through the other native modules. */

export * from "@web/lib/metronome";

const nativeContext = {
  get currentTime() {
    return engineNow();
  },
  state: "running" as AudioContextState,
  sampleRate: 48000,
  resume: () => ensureStarted(),
};

export function getAudioContext(): AudioContext {
  void ensureStarted();
  return nativeContext as unknown as AudioContext;
}
