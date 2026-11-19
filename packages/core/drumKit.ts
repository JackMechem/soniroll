import type { DrumVoice } from "./drums";
import { mainTimeVoice, resolveClave, TIME_VOICES, type ClaveChoice, type DrumStyle, type HandChoice } from "./drumStyles";

// Rhythm Section's drum kit as the player sees it (shared by the website and the phone): the kit
// parts a mixer shows, a part's fader as a gain, which drums a style can play, and the key under
// the written-out groove.

/** The kit, as a mixer sees it: one fader per part (a part can be several sounds). */
export const KIT_PARTS: { id: string; label: string; voices: DrumVoice[] }[] = [
  { id: "kick", label: "Bass drum", voices: ["kick"] },
  { id: "snare", label: "Snare", voices: ["snare", "rimshot"] },
  { id: "crossStick", label: "Cross-stick", voices: ["crossStick"] },
  { id: "hihat", label: "Hi-hat", voices: ["hhClosed", "hhOpen"] },
  { id: "pedal", label: "Hi-hat foot", voices: ["pedal"] },
  { id: "ride", label: "Ride", voices: ["ride", "bell"] },
  { id: "crash", label: "Crash", voices: ["crash"] },
  { id: "toms", label: "Toms", voices: ["tomHigh", "tomLow"] },
  { id: "cowbell", label: "Cowbell", voices: ["cowbell"] },
  { id: "block", label: "Woodblock", voices: ["block"] },
];
export const PART_DEFAULT = 0.5;
/** Fader position → gain: linear, 0.5 = unity, 1 = ×2 (+6 dB). */
export const partGain = (v: number) => v / PART_DEFAULT;
/** A fader's level as the mixer shows it ("Off", "0 dB", "+3.5 dB"). */
export function partDbLabel(v: number): string {
  if (v <= 0.001) return "Off";
  const db = 20 * Math.log10(partGain(v));
  return Math.abs(db) < 0.05 ? "0 dB" : `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

/** Every drum a style can play with these options (from its patterns, not from one random take,
    so it's the same everywhere): the key under the staff, and which kit faders to show. */
export function styleVoices(
  style: DrumStyle,
  opts: { fillEvery: number; hand: HandChoice; crossStick: ClaveChoice; block: ClaveChoice; comping: boolean },
): Set<string> {
  const { fillEvery, hand, crossStick, block, comping } = opts;
  const set = new Set<string>();
  if (style.swing) ["ride", "pedal", "kick", ...(comping ? ["snare", "crash"] : [])].forEach((v) => set.add(v));
  for (const lanes of [style.lanes ?? {}, ...(style.variations ?? []).map((v) => v.lanes)])
    for (const [v, l] of Object.entries(lanes)) if (l) set.add(v === "hhOpen" ? "hhClosed" : v);
  if (!style.swing && fillEvery > 0) ["snare", "tomHigh", "tomLow", "crash"].forEach((v) => set.add(v));
  // The hand on the instrument chosen (unless the drummer's free to move between them).
  const main = mainTimeVoice(style);
  const handVoice = main && hand !== "style" && hand !== "auto" ? hand : main;
  if (main && hand !== "auto") {
    for (const t of TIME_VOICES) if (t.id !== handVoice && !Object.entries(style.lanes ?? {}).some(([v, l]) => v === t.id && l && v !== main)) set.delete(t.id);
    set.add(handVoice!);
  }
  if (crossStick === "off") set.delete("crossStick");
  else if (resolveClave(style, crossStick, "crossStick")) set.add("crossStick");
  if (resolveClave(style, block, "block")) set.add("block");
  return set;
}

/** The key under the drum staff, in the order it's printed. */
export const DRUM_LEGEND: { voice: DrumVoice; label: string }[] = [
  { voice: "crash", label: "Crash" },
  { voice: "hhClosed", label: "Hi-hat" },
  { voice: "ride", label: "Ride" },
  { voice: "bell", label: "Ride bell" },
  { voice: "cowbell", label: "Cowbell" },
  { voice: "tomHigh", label: "High tom" },
  { voice: "snare", label: "Snare" },
  { voice: "crossStick", label: "Cross-stick" },
  { voice: "tomLow", label: "Floor tom" },
  { voice: "block", label: "Woodblock" },
  { voice: "kick", label: "Bass drum" },
  { voice: "pedal", label: "Hi-hat foot" },
];

/** A plain-text stand-in for each notehead in the key under the staff. */
export const NOTEHEAD_HINT: Partial<Record<string, string>> = {
  crash: "× top",
  hhClosed: "× (o = open)",
  ride: "×",
  bell: "◆",
  cowbell: "▲ high",
  crossStick: "⊗",
  block: "▲ low",
  pedal: "× below",
};
