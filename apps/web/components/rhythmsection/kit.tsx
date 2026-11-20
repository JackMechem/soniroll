"use client";

import { useMemo } from "react";
import DrumScore from "@/components/drumgen/DrumScore";
import { DRUM_LEGEND, NOTEHEAD_HINT, PART_DEFAULT, partDbLabel, styleVoices } from "@jam-practice/core/drumKit";
import type { ClaveChoice, DrumStyle, GrooveBar, HandChoice } from "@/lib/drumStyles";

// Rhythm Section's drum pieces (from the Drum Generator): the kit as a mixer sees it, a part's
// fader, and the written-out groove with its key. The kit's data and logic are shared with the
// phone (`packages/core/drumKit.ts`).

export { KIT_PARTS, PART_DEFAULT, partGain } from "@jam-practice/core/drumKit";

/** One kit part's fader (double-click resets it). */
export function PartFader({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted tabular-nums">{partDbLabel(value)}</span>
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
  return useMemo(() => styleVoices(style, { fillEvery, hand, crossStick, block, comping }), [style, fillEvery, hand, crossStick, block, comping]);
}

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
