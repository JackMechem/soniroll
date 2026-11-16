"use client";

import { useMemo } from "react";
import DrumScore, { DRUM_LEGEND } from "@/components/drumgen/DrumScore";
import type { DrumVoice } from "@/lib/drums";
import { mainTimeVoice, resolveClave, TIME_VOICES, type ClaveChoice, type DrumStyle, type GrooveBar, type HandChoice } from "@/lib/drumStyles";

// Rhythm Section's drum pieces (from the Drum Generator): the kit as a mixer sees it, a part's
// fader, and the written-out groove with its key.

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
const dbLabel = (v: number) => {
  if (v <= 0.001) return "Off";
  const db = 20 * Math.log10(partGain(v));
  return Math.abs(db) < 0.05 ? "0 dB" : `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
};

/** One kit part's fader (double-click resets it). */
export function PartFader({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted tabular-nums">{dbLabel(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(PART_DEFAULT)}
        style={{ "--progress": `${value * 100}%` } as React.CSSProperties}
        className="slider h-6 w-full cursor-pointer"
        aria-label={`${label} level`}
        title="Double-click to reset"
      />
    </div>
  );
}

/** Every drum a style can play with these options (from its patterns, not from one random take,
    so it's the same on the server and in the browser): the key under the staff, and which kit
    faders to show. */
export function useStyleVoices(style: DrumStyle, opts: { fillEvery: number; hand: HandChoice; crossStick: ClaveChoice; block: ClaveChoice; comping: boolean }) {
  const { fillEvery, hand, crossStick, block, comping } = opts;
  return useMemo(() => {
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
  }, [style, fillEvery, hand, crossStick, block, comping]);
}

/** A plain-text stand-in for each notehead in the key under the staff. */
const NOTEHEAD_HINT: Partial<Record<string, string>> = {
  crash: "× top",
  hhClosed: "× (o = open)",
  ride: "×",
  bell: "◆",
  cowbell: "▲ high",
  crossStick: "⊗",
  block: "▲ low",
  pedal: "× below",
};

/** The groove on a percussion staff (the playing note lit by the page, `.drum-now`), with the key. */
export function GrooveScore({
  style,
  bars,
  firstBar,
  voices,
  scoreRef,
}: {
  style: DrumStyle;
  bars: GrooveBar[];
  firstBar: number;
  voices: Set<string>;
  scoreRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div ref={scoreRef}>
        <style>{`.drum-score g.drum-now{fill:var(--accent);stroke:var(--accent);color:var(--accent)}`}</style>
        <DrumScore style={style} bars={bars} firstBar={firstBar} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
        {DRUM_LEGEND.filter((l) => voices.has(l.voice)).map((l) => (
          <span key={l.voice}>
            <span className="font-semibold text-foreground">{NOTEHEAD_HINT[l.voice] ?? "●"}</span> {l.label}
          </span>
        ))}
      </div>
    </>
  );
}
