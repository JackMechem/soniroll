"use client";

import type { ReactNode } from "react";
import { RewardCard, Sparkle, rewardGradient, useReward } from "@/components/reward/Reward";
import { SubdivisionIcon } from "@/components/MeterFields";
import NumberField from "@/components/NumberField";
import { CLICK_SOUNDS, scheduleClick } from "@/lib/clickEngine";
import { MAX_BEATS } from "@/lib/meters";
import { getAudioContext } from "@/lib/metronome";
import { NOTE_VALUES, NOTE_VALUE_NAMES, SUBDIVISIONS } from "@/lib/meterControls";

/*
 * The Metronome's options, designed to explain themselves by how they look rather than with
 * description text: the time signature is drawn as a time signature (with a plain-English
 * readout next to it), subdivisions are named pictures, and each click sound plays when you pick
 * it. Accents aren't here: tapping a beat in the main beat strip sets them.
 */

export const SUB_LABELS: Record<number, string> = { 1: "Beat", 2: "8ths", 3: "Triplets", 4: "16ths", 5: "Quintuplets", 6: "Sextuplets" };

/** A small titled group inside a panel. */
export function OptionGroup({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Two or more mutually exclusive choices as one pill-shaped control. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  onPage = false,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  /** Sitting on the page background rather than inside a panel: a surface-coloured track. */
  onPage?: boolean;
  disabled?: boolean;
}) {
  const reward = useReward();
  if (reward) {
    // Reward look: a chunky track, the picked side lit in the tool's colour.
    return (
      <div role="radiogroup" aria-label={label} className={`grid auto-cols-fr grid-flow-col gap-1 rounded-full p-1.5 ${onPage ? "bg-surface" : "bg-background"}`}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
                on ? "text-accent-foreground shadow-md" : "text-muted hover:text-foreground"
              }`}
              style={on ? { background: rewardGradient(reward.color) } : undefined}
            >
              <span key={on ? "on" : "off"} className={`inline-block ${on ? "reward-pop" : ""}`}>{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label={label} className={`grid auto-cols-fr grid-flow-col gap-1 rounded-full p-1 ${onPage ? "bg-surface" : "bg-background"}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 disabled:cursor-not-allowed disabled:opacity-60 text-sm font-semibold transition ${
              on ? `${onPage ? "bg-surface-hover" : "bg-surface"} text-foreground shadow-sm` : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Arrow({ dir, label, onClick, disabled }: { dir: "left" | "right"; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir === "left" ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"} />
      </svg>
    </button>
  );
}

/** The time signature, drawn as one: beats over beat unit, each with arrows either side. */
export function TimeSignatureControl({
  beatsPerBar,
  beatUnit,
  onChangeBeats,
  onSetBeatUnit,
}: {
  beatsPerBar: number;
  beatUnit: number;
  onChangeBeats: (n: number) => void;
  onSetBeatUnit: (unit: number) => void;
}) {
  const unitIndex = NOTE_VALUES.indexOf(beatUnit as (typeof NOTE_VALUES)[number]);
  const noteName = (NOTE_VALUE_NAMES[beatUnit] ?? `1/${beatUnit} note`).toLowerCase();
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center rounded-lg bg-background px-1 py-1.5">
        <div className="flex items-center">
          <Arrow dir="left" label="Fewer beats per bar" onClick={() => onChangeBeats(beatsPerBar - 1)} disabled={beatsPerBar <= 1} />
          <NumberField
            label="Beats per bar"
            value={beatsPerBar}
            min={1}
            max={MAX_BEATS}
            onChange={onChangeBeats}
            className="w-12 rounded-md bg-transparent text-center text-3xl font-semibold tabular-nums leading-none outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <Arrow dir="right" label="More beats per bar" onClick={() => onChangeBeats(beatsPerBar + 1)} disabled={beatsPerBar >= MAX_BEATS} />
        </div>
        <div className="my-1 h-0.5 w-10 rounded-full bg-foreground/70" />
        <div className="flex items-center">
          <Arrow dir="left" label="Longer beat" onClick={() => onSetBeatUnit(NOTE_VALUES[unitIndex - 1])} disabled={unitIndex <= 0} />
          <span className="w-12 text-center text-3xl font-semibold tabular-nums leading-none" aria-label={`Beat unit ${beatUnit}`}>
            {beatUnit}
          </span>
          <Arrow dir="right" label="Shorter beat" onClick={() => onSetBeatUnit(NOTE_VALUES[unitIndex + 1])} disabled={unitIndex < 0 || unitIndex >= NOTE_VALUES.length - 1} />
        </div>
      </div>
      <p className="min-w-0 text-sm leading-snug text-muted">
        <span className="block text-base font-medium leading-tight text-foreground">
          {beatsPerBar} {beatsPerBar === 1 ? noteName : `${noteName}s`}
        </span>
        per bar
      </p>
    </div>
  );
}

/** A number with arrows either side and a unit after it ("‹ 4 › bars"), styled like the time
    signature control. */
export function StepperPill({
  value,
  onChange,
  min,
  max,
  unit,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  /** Shown after the number, singular/plural, e.g. ["bar", "bars"]. */
  unit: [string, string];
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center rounded-md bg-background p-0.5">
        <Arrow dir="left" label={`Fewer ${unit[1]}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} />
        <NumberField
          label={label}
          value={value}
          min={min}
          max={max}
          onChange={onChange}
          className="w-12 rounded-md bg-transparent text-center text-xl font-semibold tabular-nums leading-none outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <Arrow dir="right" label={`More ${unit[1]}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} />
      </div>
      <span className="text-sm font-medium">{value === 1 ? unit[0] : unit[1]}</span>
    </div>
  );
}

/** How many clicks per beat, as named pictures. */
export function SubdivisionPicker({ value, onChange, showTitle = true }: { value: number; onChange: (n: number) => void; showTitle?: boolean }) {
  const reward = useReward();
  const grid = reward ? (
    <div role="radiogroup" aria-label="Subdivision" className="grid grid-cols-3 gap-2.5">
      {SUBDIVISIONS.map((s) => (
        <RewardCard key={s.value} id={`sub:${s.value}`} on={s.value === value} onPick={() => onChange(s.value)} label={s.label} className="h-20">
          <span className="flex h-8 items-end">
            <SubdivisionIcon count={s.value} />
          </span>
          <span className="text-xs font-medium">{SUB_LABELS[s.value] ?? s.label}</span>
        </RewardCard>
      ))}
    </div>
  ) : (
      <div role="radiogroup" aria-label="Subdivision" className="grid grid-cols-3 gap-2">
        {SUBDIVISIONS.map((s) => {
          const on = s.value === value;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={on}
              title={s.label}
              aria-label={s.label}
              onClick={() => onChange(s.value)}
              className={`flex h-[4.25rem] flex-col items-center justify-center gap-1 rounded-md border transition-colors ${
                on ? "border-accent bg-accent/10 text-foreground" : "border-foreground/15 bg-background text-foreground hover:bg-surface-hover"
              }`}
            >
              <span className="flex h-7 items-end">
                <SubdivisionIcon count={s.value} />
              </span>
              <span className={`text-xs font-medium ${on ? "" : "text-muted"}`}>{SUB_LABELS[s.value] ?? s.label}</span>
            </button>
          );
        })}
      </div>
  );
  return showTitle ? <OptionGroup title="Subdivision">{grid}</OptionGroup> : grid;
}

/** A sound chip's value: "Woodblock · 80%". */
export function soundSummary(soundId: string, volume: number) {
  return `${CLICK_SOUNDS.find((c) => c.id === soundId)?.label ?? "Click"} · ${Math.round(volume * 100)}%`;
}

/** Plays a sound's accent and normal click, so you can hear a tone before (or by) picking it. */
function previewSound(id: string, volume: number) {
  const sound = CLICK_SOUNDS.find((c) => c.id === id);
  if (!sound) return;
  const ctx = getAudioContext();
  void ctx.resume?.();
  const vol = Math.max(volume, 0.15) * sound.gain;
  const t = ctx.currentTime + 0.02;
  scheduleClick(ctx, t, sound.wave, sound.accentFreq, 0.9 * vol, sound.length);
  scheduleClick(ctx, t + 0.28, sound.wave, sound.normalFreq, 0.55 * vol, sound.length);
}

function VolumeIcon({ loud }: { loud?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H3v6h3l5 4z" />
      {loud ? <path d="M15.5 8.5a5 5 0 010 7M18.5 6a9 9 0 010 12" /> : <path d="M15.5 10a2.5 2.5 0 010 4" />}
    </svg>
  );
}

/** The click sounds as cards; picking one plays it. */
export function ClickSoundCards({
  soundId,
  onChange,
  volume = 0.8,
  label = "Click sound",
}: {
  soundId: string;
  onChange: (id: string) => void;
  /** How loud the preview plays. */
  volume?: number;
  label?: string;
}) {
  const reward = useReward();
  if (reward) {
    return (
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2.5">
        {CLICK_SOUNDS.map((c) => {
          const on = c.id === soundId;
          return (
            <RewardCard
              key={c.id}
              id={`sound:${c.id}`}
              on={on}
              label={c.label}
              onPick={() => {
                onChange(c.id);
                previewSound(c.id, volume);
              }}
              className="h-11 !flex-row !justify-start px-3"
            >
              <span className="flex flex-row items-center gap-2.5">
                <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" style={{ color: reward.color }} fill="currentColor" aria-hidden>
                  <path d="M5 3.2v9.6a.8.8 0 001.2.7l7.5-4.8a.8.8 0 000-1.4L6.2 2.5A.8.8 0 005 3.2z" />
                </svg>
                <span className="truncate text-sm font-medium">{c.label}</span>
              </span>
            </RewardCard>
          );
        })}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {CLICK_SOUNDS.map((c) => {
        const on = c.id === soundId;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              onChange(c.id);
              previewSound(c.id, volume);
            }}
            className={`flex h-11 items-center gap-2.5 rounded-md border px-3 text-left text-sm font-medium transition-colors ${
              on ? "border-accent bg-accent/10" : "border-foreground/15 bg-background hover:bg-surface-hover"
            }`}
          >
            <svg viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 ${on ? "text-accent" : "text-muted"}`} fill="currentColor" aria-hidden>
              <path d="M5 3.2v9.6a.8.8 0 001.2.7l7.5-4.8a.8.8 0 000-1.4L6.2 2.5A.8.8 0 005 3.2z" />
            </svg>
            <span className="truncate">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Click sound cards (each plays when picked) and a volume slider. */
export function SoundPicker({
  soundId,
  setSoundId,
  volume,
  setVolume,
}: {
  soundId: string;
  setSoundId: (id: string) => void;
  volume: number;
  setVolume: (volume: number) => void;
}) {
  const reward = useReward();
  const pct = Math.round(volume * 100);
  return (
    <>
      <OptionGroup title="Click">
        <ClickSoundCards soundId={soundId} onChange={setSoundId} volume={volume} />
      </OptionGroup>
      <OptionGroup
        title="Volume"
        aside={
          <span className="flex items-center gap-1 text-sm font-medium tabular-nums">
            {reward && <Sparkle show={pct % 25 === 0 && pct > 0} at={pct} color={reward.color} />}
            {pct}%
          </span>
        }
      >
        <div className="flex items-center gap-3">
          <VolumeIcon />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            aria-label="Volume"
            onChange={(e) => setVolume(Number(e.target.value))}
            onPointerUp={() => previewSound(soundId, volume)}
            style={{ "--progress": `${volume * 100}%`, ...(reward ? { "--reward": reward.color } : {}) } as React.CSSProperties}
            className={`slider h-6 w-full cursor-pointer ${reward ? "slider-reward" : ""}`}
          />
          <VolumeIcon loud />
        </div>
      </OptionGroup>
    </>
  );
}
