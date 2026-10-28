"use client";

import { LEVEL_RANK, type BeatLevel } from "@/lib/clickEngine";

const LEVEL_LABEL: Record<BeatLevel, string> = {
  2: "accent",
  1: "normal",
  3: "soft",
  0: "muted",
};

/** A single vertical bar — a main beat (numbered) or a subdivision tick (unnumbered) — shared by
    both rows below so they look and behave identically apart from the number. Its three segments
    fill from the bottom with the click's level: all three for an accent (in the accent colour),
    two for normal, one for soft, none when muted. */
function Bar({
  level,
  active,
  label,
  number,
  dim,
  onClick,
}: {
  level: BeatLevel;
  active: boolean;
  label: string;
  /** Shown top-left inside the bar; omitted for a subdivision tick. */
  number?: number;
  dim: string;
  onClick?: () => void;
}) {
  const rank = LEVEL_RANK[level] ?? 2;
  const lit = level === 2 ? "bg-accent" : "bg-foreground";
  const className = `relative flex ${dim} shrink-0 flex-col-reverse gap-[3px] rounded-md bg-surface p-[3px] ring-1 ring-inset ring-foreground/10 transition-[transform,filter] ${
    level === 0 ? "opacity-50" : ""
  } ${active ? "scale-105 brightness-110 ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`;
  const content = (
    <>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`flex-1 rounded-[3px] ${i < rank ? lit : "bg-foreground/10"}`} />
      ))}
      {number !== undefined && (
        <span
          className={`absolute left-1.5 top-1 text-xs font-semibold tabular-nums ${
            rank === 3 ? "text-accent-foreground" : "text-muted"
          } ${level === 0 ? "line-through" : ""}`}
        >
          {number}
        </span>
      )}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}. Click to change.`}
      title={label}
      className={className}
    >
      {content}
    </button>
  ) : (
    <div title={label} className={className}>
      {content}
    </div>
  );
}

/** The row of beat bars shared by the Metronome, Polyrhythm Metric Modulation Metronome, and Jam
    Practice pages — a sequencer-style strip (one tall bar per beat, grouped with its subdivision
    ticks) rather than the small numbered circles this used to be, per a direct follow-up request
    with a reference screenshot. */
export default function BeatIndicator({
  accents,
  currentBeat,
  onCycle,
  size = "md",
  subdivision = 1,
  subAccents = [],
  currentSub = 0,
  onCycleSub,
}: {
  accents: BeatLevel[];
  currentBeat: number | null;
  /** When given, beats are buttons that cycle accent / normal / soft / muted. */
  onCycle?: (index: number) => void;
  /** "sm" shrinks the whole thing — for a smaller reference metronome. */
  size?: "md" | "sm";
  /** Clicks per beat (`lib/meterControls.ts`'s `SUBDIVISIONS`) — 1 (the default) means no
      subdivision at all, so no extra bars show. Otherwise, `subdivision - 1` unnumbered bars
      follow every beat (e.g. eighth notes, subdivision 2: one tick after each beat), marking
      where each subdivision click falls within that beat. */
  subdivision?: number;
  /** One accent level per subdivision tick, flattened beat-major (`beat * (subdivision - 1) +
      subIndex`) — same shape `lib/clickEngine.ts`'s `ClickSettings.subAccents` and
      `lib/meterControls.ts`'s `defaultSubAccents` use. A missing/short entry defaults to
      "normal", same as the beats' own `accents[i] ?? 1`. */
  subAccents?: BeatLevel[];
  /** Which tick of `currentBeat` is currently sounding: `0` means the main beat itself; `1..
      subdivision-1` lights up that subdivision tick instead. Mirrors `lib/clickEngine.ts`'s
      `onBeat(beat, sub)` almost exactly — pass `sub` straight through. */
  currentSub?: number;
  /** When given, subdivision ticks are buttons that cycle accent / normal / soft / muted too, the same
      interaction `onCycle` gives the beats — called with the beat index and the tick's own
      0-based position within that beat (`0` is the first tick after the beat). */
  onCycleSub?: (beatIndex: number, subIndex: number) => void;
}) {
  const small = size === "sm";
  const dim = small ? "h-10 w-7" : "h-16 w-10";
  const dotCount = Math.max(0, Math.round(subdivision) - 1);

  return (
    <div
      className={`flex flex-wrap items-end justify-center ${small ? "gap-2" : "gap-3"}`}
      role="group"
      aria-label="Beats in bar"
    >
      {accents.map((level, i) => (
        // A small gap *within* a beat's own bars, a bigger one *between* beats (the outer
        // container's gap above) — the grouping the reference screenshot shows.
        <div key={i} className="flex items-end gap-0.5">
          <Bar
            level={level}
            active={currentBeat === i && currentSub === 0}
            label={`Beat ${i + 1}: ${LEVEL_LABEL[level]}`}
            number={i + 1}
            dim={dim}
            onClick={onCycle && (() => onCycle(i))}
          />
          {Array.from({ length: dotCount }, (_, d) => {
            const flatIndex = i * dotCount + d;
            const dotLevel = subAccents[flatIndex] ?? 1;
            return (
              <Bar
                key={d}
                level={dotLevel}
                active={currentBeat === i && currentSub === d + 1}
                label={`Subdivision after beat ${i + 1}${dotCount > 1 ? ` (${d + 1}/${dotCount})` : ""}: ${LEVEL_LABEL[dotLevel]}`}
                dim={dim}
                onClick={onCycleSub && (() => onCycleSub(i, d))}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
