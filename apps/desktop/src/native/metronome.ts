import { NativeAudioContext } from "./webAudio/context";
import "./webAudio/install";

/** Desktop version of `lib/metronome`: `getAudioContext()` is the native Web Audio bridge
    (`webAudio/`), so every tool's sound (trainers, samples, Bass Genius, drums, the metronome's
    clicks) is one graph on one native output. The website's own `getAudioContext`, still reached
    from inside `lib/metronome` and through `./metronome` imports, returns the same object, because
    `window.AudioContext` is the bridge too (`webAudio/install.ts`). */

export * from "@web/lib/metronome";

export function getAudioContext(): AudioContext {
  return new NativeAudioContext() as unknown as AudioContext;
}
