"use client";

import { useState } from "react";
import Hint from "@/components/Hint";
import NumberField from "@/components/NumberField";
import Select from "@/components/Select";
import { MetronomeIcon } from "@/components/tools";
import { MeterQuickPicks, OptionGroup, SoundPicker, SubdivisionPicker, TimeSignatureControl } from "@/components/metronome/MetronomeOptions";
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
import { useReward } from "@/components/reward/Reward";

// Shared UI atoms for the Metronome, Polyrhythm Metric Modulation Metronome, and Tempo Trainer
// tools' meter/tempo controls.

export const CIRCLE_BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-full bg-foreground/[0.05] text-lg leading-none text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent";
export const CIRCLE_INPUT =
  "h-9 w-14 rounded-md bg-foreground/[0.05] text-center text-base font-medium tabular-nums outline-none focus:ring-2 focus:ring-accent/40";

/** The big Start/Stop (Play, Record) button under a tool's main display: a round-ended pill
    (the one prominent action on the page), filled while stopped, outlined while running. Shared
    by every rhythm/time tool so they all look the same. */
const BIG_BUTTON =
  "inline-flex h-12 min-w-36 items-center justify-center gap-2 rounded-full px-8 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const BIG_PRIMARY = `${BIG_BUTTON} bg-accent text-accent-foreground hover:bg-accent-hover`;
export const BIG_SECONDARY = `${BIG_BUTTON} bg-foreground/[0.05] text-foreground hover:bg-surface-hover`;
// A smaller cut of the same two, for the beats-per-bar/beat-unit pair specifically (see
// `MeterOptions` below) — every other `SteppedField`/`BeatUnitField` caller (Polyrhythm's own
// "Bars between modulations", a Structure section's "Bars") keeps the full size above.
const CIRCLE_BUTTON_SM =
  "flex h-8 w-8 items-center justify-center rounded-full bg-foreground/[0.05] text-sm leading-none text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent";
const CIRCLE_INPUT_SM =
  "h-8 w-11 rounded-md bg-foreground/[0.05] text-center text-sm font-medium tabular-nums outline-none focus:ring-2 focus:ring-accent/40";

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
      className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/[0.05] text-xl text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
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

/** The note value the tempo counts ("Quarter", "Eighth" …), for `TempoHero`'s `tempoNote` slot,
    where it reads with the number as one unit: "100 / ♩ Quarter BPM · 4/4". Lets the
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
    <Select
      value={value ?? TEMPO_NOTE_MATCH}
      onChange={(v) => onChange(v === TEMPO_NOTE_MATCH ? null : v)}
      options={TEMPO_NOTE_OPTIONS}
      // The menu is as wide as this button, so make it wide enough for "♩ Quarter ✓".
      className="min-w-[8.75rem] text-sm"
    />
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
/** A small round "+5" / "−10" button beside Tap tempo. */
function JumpButton({ amount, onClick }: { amount: number; onClick: () => void }) {
  const text = `${amount > 0 ? "+" : "−"}${Math.abs(amount)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${amount > 0 ? "Increase" : "Decrease"} tempo by ${Math.abs(amount)}`}
      className="flex h-10 w-11 shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] text-sm font-medium tabular-nums text-muted transition-colors hover:bg-surface-hover hover:text-foreground @max-[22rem]:w-10"
    >
      {text}
    </button>
  );
}

export function TempoHero({
  bpm,
  setBpm,
  beatsPerBar,
  beatUnit,
  onTap,
  locked = false,
  precise,
  tempoNote,
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
  /** The note value the tempo counts (`TempoNoteValuePicker`), shown in the line under the big
      number, before "BPM", so the two read as one: "100 / ♩ Quarter BPM · 4/4". */
  tempoNote?: React.ReactNode;
}) {
  const { whole, tenths } = splitTenths(precise ?? bpm);
  const reward = useReward();
  const [taps, setTaps] = useState(0);
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex flex-col items-center">
      <div className="flex items-center gap-4">
        {!locked && (
          <StepButton label="Decrease tempo" onClick={() => setBpm(bpm - 1)}>
            −
          </StepButton>
        )}
        <div className="flex w-40 flex-col items-center">
          {locked ? (
            <span className="w-full text-center text-6xl font-bold tracking-tight tabular-nums sm:text-7xl">
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
              className="w-full rounded-md bg-transparent text-center text-6xl font-bold tracking-tight tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:text-7xl"
            />
          )}
        </div>
        {!locked && (
          <StepButton label="Increase tempo" onClick={() => setBpm(bpm + 1)}>
            +
          </StepButton>
        )}
      </div>
      {/* Its own row under the −/number/+ one (not inside the number's column), so a note-value
          picker can be wider than the number without crowding the steppers. */}
      <span className={`flex items-center gap-1.5 text-sm text-muted ${tempoNote ? "mt-1" : ""}`}>
        {/* No ✦ on round tempos here any more: beside the note-value menu it read as a
            "magic" button. */}
        {tempoNote}
        <span>
          BPM · {beatsPerBar}/{beatUnit}
        </span>
      </span>
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
            aria-valuetext={`${bpm} BPM`}
            style={
              {
                "--progress": `${(sliderFromBpm(bpm) / SLIDER_STEPS) * 100}%`,
                ...(reward ? { "--reward": reward.color } : {}),
              } as React.CSSProperties
            }
            className={`slider h-6 w-full cursor-pointer ${reward ? "slider-reward" : ""}`}
          />
          {/* Bigger jumps either side of Tap tempo: −10, −5 … +5, +10. In a narrow column (Rhythm
              Section's side panel) Tap tempo shortens to "Tap" so all five fit on one line. */}
          <div className="@container">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {[-10, -5].map((n) => (
              <JumpButton key={n} amount={n} onClick={() => setBpm(Math.max(MIN_BPM, bpm + n))} />
            ))}
            <button
              type="button"
              onClick={() => {
                onTap();
                setTaps((n) => n + 1);
              }}
              title="Tap along a few times to set the tempo"
              aria-label="Tap tempo"
              className="relative mx-1 inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover @max-[22rem]:mx-0 @max-[22rem]:px-3"
            >
              <MetronomeIcon className="h-4 w-4 text-muted @max-[22rem]:hidden" />
              <span>
                Tap<span className="@max-[22rem]:hidden"> tempo</span>
              </span>
              {/* A ring flashes out from the button on every tap. */}
              {taps > 0 && <span key={taps} aria-hidden className="tap-ring pointer-events-none absolute inset-0 rounded-full opacity-0 ring-2 ring-accent" />}
            </button>
            {[5, 10].map((n) => (
              <JumpButton key={n} amount={n} onClick={() => setBpm(Math.min(MAX_BPM, bpm + n))} />
            ))}
          </div>
          </div>
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
  onPickMeter,
}: {
  beatsPerBar: number;
  beatUnit: number;
  accents?: BeatLevel[];
  subdivision: number;
  onChangeBeats: (n: number) => void;
  onSetBeatUnit: (unit: number) => void;
  onSetSubdivision: (n: number) => void;
  onApplyGroups?: (groups: number[]) => void;
  /** Sets both numbers at once; when given, the common-meter "Quick picks" show too. */
  onPickMeter?: (beatsPerBar: number, beatUnit: number) => void;
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
      {onPickMeter && <MeterQuickPicks beatsPerBar={beatsPerBar} beatUnit={beatUnit} onPick={onPickMeter} />}
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
