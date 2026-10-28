"use client";

import { useState } from "react";
import Hint from "@/components/Hint";
import NumberField from "@/components/NumberField";
import Select from "@/components/Select";
import { MetronomeIcon } from "@/components/tools";
import { OptionGroup, SoundPicker, SubdivisionPicker, TimeSignatureControl } from "@/components/metronome/MetronomeOptions";
import type { BeatLevel } from "@/lib/clickEngine";
import { MAX_BEATS } from "@/lib/meters";
import {
  MAX_BPM,
  MIN_BPM,
  NOTE_VALUES,
  NOTE_VALUE_NAMES,
  SLIDER_STEPS,
  bpmFromSlider,
  convertTempo,
  nearestNoteValue,
  sliderFromBpm,
  splitTenths,
} from "@/lib/meterControls";
import { Sparkle, useReward } from "@/components/reward/Reward";

// Shared UI atoms for the Metronome, Polyrhythm Metric Modulation Metronome, and Tempo Trainer
// tools' meter/tempo controls.

export const CIRCLE_BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-full bg-background text-lg font-semibold leading-none text-foreground hover:bg-surface-hover disabled:opacity-40";
export const CIRCLE_INPUT =
  "h-14 w-14 rounded-full bg-background text-center text-lg font-semibold tabular-nums outline-none focus:ring-2 focus:ring-accent";
// A smaller cut of the same two, for the beats-per-bar/beat-unit pair specifically (see
// `MeterOptions` below) — every other `SteppedField`/`BeatUnitField` caller (Polyrhythm's own
// "Bars between modulations", a Structure section's "Bars") keeps the full size above.
const CIRCLE_BUTTON_SM =
  "flex h-7 w-7 items-center justify-center rounded-full bg-background text-sm font-semibold leading-none text-foreground hover:bg-surface-hover disabled:opacity-40";
const CIRCLE_INPUT_SM =
  "h-10 w-10 rounded-full bg-background text-center text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-accent";

export function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-xl font-medium hover:bg-surface-hover"
    >
      {children}
    </button>
  );
}

/**
 * A round number field with plus/minus circles for quick adjusting. `layout="stack"` (default)
 * puts them above and below the number; `"row"` puts them on either side of it instead.
 */
export function SteppedField({
  label,
  showLabel = true,
  value,
  min,
  max,
  disabled,
  layout = "stack",
  size = "md",
  minusOnRight,
  hint,
  onChange,
}: {
  label: string;
  /** The visible title above the control — off leaves just the +/number/− control itself, still
      using `label` for the individual buttons'/field's own accessible names (via aria-label). */
  showLabel?: boolean;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  layout?: "stack" | "row";
  /** "sm" shrinks the whole control — for the beats-per-bar/beat-unit pair specifically, which
      sits inside an already-busy panel and doesn't need to be this prominent. */
  size?: "md" | "sm";
  /** `layout="row"` only: puts the number first, then −, then + (instead of −, number, +). */
  minusOnRight?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const small = size === "sm";
  const increase = (
    <button
      type="button"
      aria-label={`Increase ${label}`}
      onClick={() => onChange(Math.min(max, value + 1))}
      disabled={disabled || value >= max}
      className={small ? CIRCLE_BUTTON_SM : CIRCLE_BUTTON}
    >
      +
    </button>
  );
  const decrease = (
    <button
      type="button"
      aria-label={`Decrease ${label}`}
      onClick={() => onChange(Math.max(min, value - 1))}
      disabled={disabled || value <= min}
      className={small ? CIRCLE_BUTTON_SM : CIRCLE_BUTTON}
    >
      −
    </button>
  );
  const field = (
    <NumberField
      label={label}
      value={value}
      min={min}
      max={max}
      onChange={onChange}
      className={small ? CIRCLE_INPUT_SM : CIRCLE_INPUT}
    />
  );

  return (
    <div className={`flex flex-col gap-1.5 text-sm ${small ? "items-start" : "items-center"}`}>
      {showLabel && (
        <span className={`font-medium text-muted ${small ? "text-xs" : ""}`}>{label}</span>
      )}
      {layout === "row" ? (
        <div className="flex items-center gap-2">
          {minusOnRight ? (
            <>
              {field}
              {decrease}
              {increase}
            </>
          ) : (
            <>
              {decrease}
              {field}
              {increase}
            </>
          )}
        </div>
      ) : (
        <>
          {increase}
          {field}
          {decrease}
        </>
      )}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

/**
 * Beat unit picker: only steps through actual note values (1, 2, 4, 8...). Typing a non-note
 * number snaps to the nearest one.
 */
export function BeatUnitField({
  value,
  showLabel = true,
  layout = "stack",
  size = "md",
  minusOnRight,
  hint,
  onChange,
}: {
  value: number;
  /** Same meaning as `SteppedField`'s own `showLabel` — off hides just the visible "Beat unit"
      title, the field itself keeps its aria-label regardless. */
  showLabel?: boolean;
  /** Mirrors `SteppedField`'s own layout option: `"stack"` (default) puts +/− above and below
      the number; `"row"` puts them on either side of it instead. */
  layout?: "stack" | "row";
  /** Mirrors `SteppedField`'s own `size` option — "sm" shrinks the whole control. */
  size?: "md" | "sm";
  /** Mirrors `SteppedField`'s own `minusOnRight` option. */
  minusOnRight?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const small = size === "sm";
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const index = NOTE_VALUES.indexOf(value);

  function step(delta: number) {
    const from =
      index === -1 ? NOTE_VALUES.indexOf(nearestNoteValue(value)) : index;
    const next = Math.min(NOTE_VALUES.length - 1, Math.max(0, from + delta));
    onChange(NOTE_VALUES[next]);
  }

  function commit(text: string) {
    const n = Number(text);
    if (Number.isFinite(n) && n > 0) onChange(nearestNoteValue(n));
    setDraft(null);
  }

  const increase = (
    <button
      type="button"
      aria-label="Larger beat unit"
      onClick={() => step(1)}
      disabled={index >= NOTE_VALUES.length - 1}
      className={small ? CIRCLE_BUTTON_SM : CIRCLE_BUTTON}
    >
      +
    </button>
  );
  const decrease = (
    <button
      type="button"
      aria-label="Smaller beat unit"
      onClick={() => step(-1)}
      disabled={index <= 0}
      className={small ? CIRCLE_BUTTON_SM : CIRCLE_BUTTON}
    >
      −
    </button>
  );
  const field = (
    <input
      type="text"
      inputMode="numeric"
      value={shown}
      aria-label="Beat unit"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") setDraft(null);
        else if (e.key === "ArrowUp") {
          e.preventDefault();
          step(1);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          step(-1);
        }
      }}
      className={small ? CIRCLE_INPUT_SM : CIRCLE_INPUT}
    />
  );

  return (
    <div className={`flex flex-col gap-1.5 text-sm ${small ? "items-start" : "items-center"}`}>
      {showLabel && (
        <span className={`font-medium text-muted ${small ? "text-xs" : ""}`}>Beat unit</span>
      )}
      {layout === "row" ? (
        <div className="flex items-center gap-2">
          {minusOnRight ? (
            <>
              {field}
              {decrease}
              {increase}
            </>
          ) : (
            <>
              {decrease}
              {field}
              {increase}
            </>
          )}
        </div>
      ) : (
        <>
          {increase}
          {field}
          {decrease}
        </>
      )}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

/** Engraved notes for a beat split into `count` parts (beamed, with a tuplet number when odd). */
export function SubdivisionIcon({ count }: { count: number }) {
  const spacing = 9;
  const width = count === 1 ? 12 : (count - 1) * spacing + 12;
  const beams = count <= 1 ? 0 : count === 2 || count === 3 ? 1 : 2;
  const xs = Array.from({ length: count }, (_, i) => 4 + i * spacing);
  const stemTop = 9;
  const showTuplet = count === 3 || count >= 5;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} 28`}
      className="h-7 w-auto"
      style={{ width }}
      fill="currentColor"
    >
      {xs.map((x) => (
        <g key={x}>
          <ellipse
            cx={x}
            cy={23}
            rx={3.2}
            ry={2.4}
            transform={`rotate(-20 ${x} 23)`}
          />
          <rect x={x + 2.4} y={stemTop} width={1.2} height={14} />
        </g>
      ))}
      {beams >= 1 && (
        <rect
          x={xs[0] + 2.4}
          y={stemTop}
          width={xs[count - 1] - xs[0] + 1.2}
          height={2.2}
        />
      )}
      {beams >= 2 && (
        <rect
          x={xs[0] + 2.4}
          y={stemTop + 3.6}
          width={xs[count - 1] - xs[0] + 1.2}
          height={2.2}
        />
      )}
      {showTuplet && (
        <text
          x={(xs[0] + xs[count - 1] + 3.6) / 2}
          y={6.5}
          fontSize={7}
          fontWeight={700}
          textAnchor="middle"
        >
          {count}
        </text>
      )}
    </svg>
  );
}

/** A single engraved note of the given note value — hollow for whole/half, filled with a stem for
    quarter and shorter, plus one flag per halving below a quarter (eighth = 1 flag, sixteenth = 2,
    ...). Same notehead/stem proportions as `SubdivisionIcon`'s own beamed notes, just for one note
    standing alone — used as each option's icon in Metronome.tsx's "tempo note value" picker. */
export function NoteValueIcon({ value, className }: { value: number; className?: string }) {
  const filled = value >= 4;
  const hasStem = value >= 2;
  const flagCount = value > 4 ? Math.round(Math.log2(value)) - 2 : 0;
  const stemX = 6.4;
  const stemTop = 9;
  const noteheadCy = 23;

  return (
    <svg aria-hidden viewBox="0 0 12 28" className={className ?? "h-7 w-3"} fill="currentColor">
      <ellipse
        cx={4}
        cy={noteheadCy}
        rx={3.2}
        ry={2.4}
        transform={`rotate(-20 4 ${noteheadCy})`}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.1}
      />
      {hasStem && <rect x={stemX} y={stemTop} width={1.2} height={noteheadCy - stemTop} />}
      {Array.from({ length: flagCount }, (_, i) => (
        <path
          key={i}
          d={`M${stemX + 1.2} ${stemTop + i * 4.5} q5 1.5 4.5 7 q-2.5 -2.5 -4.5 -1.5 z`}
        />
      ))}
    </svg>
  );
}

// Short labels for the compact "tempo note value" picker sitting right next to the BPM digits —
// `NOTE_VALUE_NAMES`' own full names ("Quarter note") are used for the longer readout sentence
// below it instead, where there's room to spell it out. Shared by Metronome and Tempo Trainer —
// per a direct request that the two tools' metronomes be identical, not two copies of this picker
// that could quietly drift apart.
const TEMPO_NOTE_MATCH = 0;
const SHORT_NOTE_NAME: Record<number, string> = {
  1: "Whole",
  2: "Half",
  4: "Quarter",
  8: "Eighth",
  16: "16th",
  32: "32nd",
  64: "64th",
};
const TEMPO_NOTE_OPTIONS = [
  { value: TEMPO_NOTE_MATCH, label: "Beat unit" },
  ...NOTE_VALUES.map((v) => ({
    value: v,
    label: SHORT_NOTE_NAME[v] ?? `1/${v}`,
    icon: <NoteValueIcon value={v} className="h-5 w-2.5" />,
  })),
];

/** The "quarter note = 140"-style picker meant for `TempoHero`'s own `aboveNumber` slot — lets the
    displayed tempo refer to a different note value than the meter's own beat unit. `null` means
    "match the beat unit" (the `TEMPO_NOTE_MATCH` sentinel's own "Beat unit" option); any other
    value is one of `NOTE_VALUES`. */
export function TempoNoteValuePicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={value ?? TEMPO_NOTE_MATCH}
        onChange={(v) => onChange(v === TEMPO_NOTE_MATCH ? null : v)}
        options={TEMPO_NOTE_OPTIONS}
      />
      <span className="text-lg font-semibold text-muted">=</span>
    </div>
  );
}

/** The small "= 550 BPM at eighth note clicks" readout under the BPM number — shown only once the
    chosen tempo note value actually differs from whatever beat unit it's being converted against.
    `effectiveBeatUnit` is the plain meter's own beat unit, or (in structure mode) whichever
    section is currently active, since that can differ bar to bar. */
export function TempoNoteConversionHint({
  bpm,
  tempoNoteValue,
  effectiveBeatUnit,
}: {
  bpm: number;
  tempoNoteValue: number | null;
  effectiveBeatUnit: number;
}) {
  if (tempoNoteValue === null || tempoNoteValue === effectiveBeatUnit) return null;
  return (
    <p className="-mt-2 text-xs text-muted">
      = {Math.round(convertTempo(bpm, tempoNoteValue, effectiveBeatUnit))} BPM at{" "}
      {(NOTE_VALUE_NAMES[effectiveBeatUnit] ?? `1/${effectiveBeatUnit} note`).toLowerCase()} clicks
    </p>
  );
}

/** The big BPM number, its +/- steppers, the log-scaled quick-adjust slider and tap tempo. */
export function TempoHero({
  bpm,
  setBpm,
  beatsPerBar,
  beatUnit,
  onTap,
  locked = false,
  precise,
  aboveNumber,
}: {
  bpm: number;
  setBpm: (bpm: number) => void;
  beatsPerBar: number;
  beatUnit: number;
  onTap: () => void;
  /** While true (e.g. a tool that changes tempo on its own while running), the tempo can't be
      touched here: no +/- steppers, no slider, no tap tempo, and the number is plain text. */
  locked?: boolean;
  /** The exact (possibly fractional) tempo, if it can differ from the rounded `bpm` shown/edited
      here — e.g. mid-run, between modulations. Only used while `locked`; a nonzero tenths digit
      is shown right after the whole number, in smaller, dimmer text. */
  precise?: number;
  /** Rendered directly above the big number itself (e.g. Metronome's "tempo note value" picker)
      — optional, so every other caller is unaffected. */
  aboveNumber?: React.ReactNode;
}) {
  const { whole, tenths } = splitTenths(precise ?? bpm);
  const reward = useReward();
  const [taps, setTaps] = useState(0);
  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* A sibling row above the −/number/+ row, not nested inside it — so the steppers below
          stay centered against *just* the number (their own row's only other content), never
          shifted by however tall this happens to be. Both rows share the same horizontal center
          either way (this whole column is itself `items-center`), so it still reads as "on top
          of the big number". */}
      {aboveNumber}
      <div className="flex items-center gap-4">
        {!locked && (
          <StepButton label="Decrease tempo" onClick={() => setBpm(bpm - 1)}>
            −
          </StepButton>
        )}
        <div className="flex w-40 flex-col items-center">
          {locked ? (
            <span className="w-full text-center text-6xl font-bold tabular-nums sm:text-7xl">
              {whole}
              {tenths !== null && (
                <span className="text-2xl text-muted">.{tenths}</span>
              )}
            </span>
          ) : (
            <NumberField
              label="Tempo in BPM"
              value={bpm}
              min={MIN_BPM}
              max={MAX_BPM}
              onChange={setBpm}
              className="w-full rounded-lg bg-transparent text-center text-6xl font-bold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-7xl"
            />
          )}
          <span className="flex items-center gap-1 text-sm font-medium text-muted">
            {reward && <Sparkle show={!locked && bpm % 10 === 0} at={bpm} color={reward.color} />}
            BPM · {beatsPerBar}/{beatUnit}
          </span>
        </div>
        {!locked && (
          <StepButton label="Increase tempo" onClick={() => setBpm(bpm + 1)}>
            +
          </StepButton>
        )}
      </div>

      {!locked && (
        <div className="flex w-full flex-col gap-3">
          <input
            type="range"
            min={0}
            max={SLIDER_STEPS}
            step={1}
            value={sliderFromBpm(bpm)}
            onChange={(e) => setBpm(bpmFromSlider(Number(e.target.value)))}
            aria-label="Tempo (drag to adjust quickly)"
            style={
              {
                "--progress": `${(sliderFromBpm(bpm) / SLIDER_STEPS) * 100}%`,
                ...(reward ? { "--reward": reward.color } : {}),
              } as React.CSSProperties
            }
            className={`slider h-6 w-full cursor-pointer ${reward ? "slider-reward" : ""}`}
          />
          <button
            type="button"
            onClick={() => {
              onTap();
              setTaps((n) => n + 1);
            }}
            title="Tap along a few times to set the tempo"
            className="relative flex h-11 items-center gap-2 self-center rounded-full bg-surface px-6 text-sm font-semibold transition-transform hover:bg-surface-hover active:scale-95"
          >
            <MetronomeIcon className="h-4 w-4 text-accent" />
            Tap tempo
            {/* A ring flashes out from the button on every tap. */}
            {taps > 0 && <span key={taps} aria-hidden className="tap-ring pointer-events-none absolute inset-0 rounded-full opacity-0 ring-2 ring-accent" />}
          </button>
        </div>
      )}
    </div>
  );
}

/** A meter: the time signature (drawn as one, with a "7 eighth notes per bar" readout) and the
    subdivision tiles — the Metronome's controls (`components/metronome/MetronomeOptions.tsx`),
    shared by every metronome-style tool. Accents are set by tapping beats in each tool's beat
    strip, so there's no grouping field here any more (`onApplyGroups` is accepted but unused). */
export function MeterOptions({
  beatsPerBar,
  beatUnit,
  subdivision,
  onChangeBeats,
  onSetBeatUnit,
  onSetSubdivision,
}: {
  beatsPerBar: number;
  beatUnit: number;
  accents?: BeatLevel[];
  subdivision: number;
  onChangeBeats: (n: number) => void;
  onSetBeatUnit: (unit: number) => void;
  onSetSubdivision: (n: number) => void;
  onApplyGroups?: (groups: number[]) => void;
}) {
  return (
    <>
      <OptionGroup title="Time signature">
        <TimeSignatureControl
          beatsPerBar={beatsPerBar}
          beatUnit={beatUnit}
          onChangeBeats={(n) => onChangeBeats(Math.min(MAX_BEATS, Math.max(1, n)))}
          onSetBeatUnit={onSetBeatUnit}
        />
      </OptionGroup>
      <SubdivisionPicker value={subdivision} onChange={onSetSubdivision} />
    </>
  );
}

/** Click sound cards (each plays when picked) and volume — the Metronome's `SoundPicker`, shared by
    every metronome-style tool. */
export function SoundOptions(props: {
  soundId: string;
  setSoundId: (id: string) => void;
  volume: number;
  setVolume: (volume: number) => void;
}) {
  return <SoundPicker {...props} />;
}
