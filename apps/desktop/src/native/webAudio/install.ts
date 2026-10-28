import { NativeAudioContext } from "./context";

/** Every `new AudioContext()` in the website's code gets the native bridge instead of the window's
    own Web Audio. An alias on `@/lib/metronome` alone isn't enough: `playCountOff` calls that
    module's own `getAudioContext`, and several lib files import it as `./metronome`, which the
    alias doesn't see. This catches all of them, with no change to the website.
    (`OfflineAudioContext` stays the window's: it's only the decoder of last resort.) */

const w = window as unknown as Record<string, unknown>;
w.AudioContext = NativeAudioContext;
w.webkitAudioContext = NativeAudioContext;
