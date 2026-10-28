/**
 * Ported verbatim from `apps/web/lib/clickEngine.ts` — the actual click-scheduling engine itself
 * is platform-specific (Web Audio oscillators on web, pre-rendered samples + `playbackRate` on
 * native — see `apps/mobile/src/lib/metronomeClickEngine.ts`), but this *data* — which sounds
 * exist, their frequencies/wave shapes/lengths/gains, and the per-level gain/length formulas built
 * around it — is the one thing both engines need to agree on exactly, so it lives here rather than
 * in either platform's own engine file.
 */

/** 0 = silent, 1 = normal click, 2 = accented click. */
/** 0 = muted, 3 = soft, 1 = normal, 2 = accent (soft got the next free number, so saved settings
    keep their meaning). The website sets soft; the mobile app plays it but doesn't offer it. */
export type BeatLevel = 0 | 1 | 2 | 3;

export type OscillatorWave = "sine" | "square" | "triangle" | "sawtooth";

export type ClickSound = {
  id: string;
  label: string;
  wave: OscillatorWave;
  accentFreq: number;
  normalFreq: number;
  subFreq: number;
  /** Seconds — the web engine's own oscillator envelope duration at the *reference* (accent)
      pitch; the native engine's pre-rendered sample is baked at this exact length. */
  length: number;
  gain: number;
};

export const CLICK_SOUNDS: ClickSound[] = [
  { id: "classic", label: "Classic click", wave: "sine", accentFreq: 1500, normalFreq: 900, subFreq: 700, length: 0.06, gain: 1 },
  { id: "beep", label: "Beep", wave: "sine", accentFreq: 1046, normalFreq: 784, subFreq: 523, length: 0.12, gain: 0.8 },
  { id: "wood", label: "Woodblock", wave: "triangle", accentFreq: 1300, normalFreq: 950, subFreq: 750, length: 0.045, gain: 1 },
  { id: "digital", label: "Digital", wave: "square", accentFreq: 1760, normalFreq: 1175, subFreq: 880, length: 0.04, gain: 0.35 },
  { id: "soft", label: "Soft thump", wave: "triangle", accentFreq: 330, normalFreq: 220, subFreq: 165, length: 0.09, gain: 1.1 },
];

export const DEFAULT_CLICK_SOUND_ID = CLICK_SOUNDS[0].id;

export function getClickSound(id: string): ClickSound {
  return CLICK_SOUNDS.find((c) => c.id === id) ?? CLICK_SOUNDS[0];
}

/** One tick's worth of click parameters — what a scheduler's `getSettings(beat, sub)` callback
    returns, and what each platform's engine turns into an actual sound. */
export type ClickSettings = {
  bpm: number;
  beatsPerBar: number;
  accents: BeatLevel[];
  subdivision: number;
  /** Flattened beat-major: `beat * (subdivision - 1) + subIndex`. */
  subAccents: BeatLevel[];
  volume: number;
  soundId: string;
};

/** The four distinct (frequency, length) combinations a click ever actually needs — also exactly
    the native engine's own pre-rendered-sample variants (`scripts/generate-click-sounds.mjs`
    writes one real WAV per `${soundId}-${variant}`, baked at that variant's own fixed length, so
    native playback never has to stretch a sample's duration via `playbackRate` to reach a
    different pitch — pitch-shifting one reference sample down was tried first and sounded
    noticeably wrong, a longer "beep" instead of a short "click", since slowing a sample's
    *playback rate* down stretches its envelope's duration right along with its pitch). */
export type ClickVariant = "accent" | "normal" | "subAccent" | "subNormal";

/** The gain/length formula every click engine (web or native) applies on top of a `ClickSound`'s
    own base frequencies — level 0 (silent) returns `null`, meaning "schedule nothing". */
export function resolveMainBeatClick(
  level: BeatLevel,
  sound: ClickSound,
  vol: number,
): { variant: ClickVariant; freq: number; gain: number; length: number } | null {
  if (level === 2) return { variant: "accent", freq: sound.accentFreq, gain: 0.9 * vol, length: sound.length };
  if (level === 1) return { variant: "normal", freq: sound.normalFreq, gain: 0.55 * vol, length: sound.length };
  if (level === 3) return { variant: "normal", freq: sound.normalFreq, gain: 0.25 * vol, length: sound.length };
  return null;
}

export function resolveSubClick(
  level: BeatLevel,
  sound: ClickSound,
  vol: number,
): { variant: ClickVariant; freq: number; gain: number; length: number } | null {
  if (level === 2) {
    return { variant: "subAccent", freq: sound.normalFreq, gain: 0.4 * vol, length: sound.length * 0.8 };
  }
  if (level === 1) {
    return { variant: "subNormal", freq: sound.subFreq, gain: 0.25 * vol, length: sound.length * 0.6 };
  }
  if (level === 3) {
    return { variant: "subNormal", freq: sound.subFreq, gain: 0.12 * vol, length: sound.length * 0.6 };
  }
  return null;
}
