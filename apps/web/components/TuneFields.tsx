"use client";

import { useState } from "react";
import NumberField from "@/components/NumberField";
import { gridKeyName, prettyKey } from "@/components/library/ui";
import { MAX_BEATS, MAX_BEAT_UNIT, SIGNATURE_PRESETS, parseMeter } from "@/lib/meters";
import { Key, Tempo, makeId } from "@/lib/types";

const pill = (on: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium tabular-nums transition-colors ${
    on ? "bg-accent text-accent-foreground" : "bg-foreground/[0.05] hover:bg-surface-hover"
  }`;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

export function MeterPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const isPreset = SIGNATURE_PRESETS.some((p) => `${p.beats}/${p.unit}` === value);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const meter = parseMeter(value) ?? { beats: 4, unit: 4 };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {SIGNATURE_PRESETS.map(({ beats, unit }) => {
          const label = `${beats}/${unit}`;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={value === label}
              onClick={() => onChange(label)}
              className={pill(value === label)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setCustomOpen((o) => !o)}
          aria-expanded={customOpen}
          className="flex items-center gap-1 self-start rounded-md py-1 text-sm font-medium text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
        >
          Custom meter
          <Chevron open={customOpen} />
        </button>
        {customOpen && (
          <div className="grid grid-cols-2 gap-4 px-1 pt-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted">Beats per bar</span>
              <NumberField
                label="Beats per bar"
                value={meter.beats}
                min={1}
                max={MAX_BEATS}
                onChange={(beats) => onChange(`${beats}/${meter.unit}`)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted">Beat unit</span>
              <NumberField
                label="Beat unit"
                value={meter.unit}
                min={1}
                max={MAX_BEAT_UNIT}
                onChange={(unit) => onChange(`${meter.beats}/${unit}`)}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

const QUICK_TEMPOS = [60, 80, 100, 120, 140, 160, 180, 200, 220, 240];
const MIN_TEMPO = 20;
const MAX_TEMPO = 400;

export function TempoPicker({
  tempos,
  onChange,
}: {
  tempos: Tempo[];
  onChange: (tempos: Tempo[]) => void;
}) {
  const [custom, setCustom] = useState("");
  const chosen = new Set(tempos.map((t) => t.value));
  const shown = [...new Set([...QUICK_TEMPOS, ...chosen])].sort((a, b) => a - b);
  const customValue = Number(custom);
  const customValid = /^\d+$/.test(custom) && customValue >= MIN_TEMPO && customValue <= MAX_TEMPO;

  function toggle(value: number) {
    onChange(
      chosen.has(value)
        ? tempos.filter((t) => t.value !== value)
        : [...tempos, { id: makeId(), value, enabled: true }],
    );
  }

  function addCustom() {
    if (!customValid) return;
    if (!chosen.has(customValue)) toggle(customValue);
    setCustom("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {shown.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={chosen.has(value)}
            onClick={() => toggle(value)}
            className={pill(chosen.has(value))}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <input
          value={custom}
          inputMode="numeric"
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
          placeholder="Other BPM"
          title={`Any tempo from ${MIN_TEMPO} to ${MAX_TEMPO} BPM`}
          aria-label="Custom tempo"
          className="h-9 w-44 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!customValid}
          className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const KEY_PATTERN = /^([A-G][b#]?)(m?)$/;

function sortKeys(keys: Key[]): Key[] {
  const rank = (k: Key) => {
    const m = KEY_PATTERN.exec(k.value);
    return m ? ROOTS.indexOf(m[1]) * 2 + (m[2] ? 1 : 0) : 100;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

export function KeyPicker({ keys, onChange }: { keys: Key[]; onChange: (keys: Key[]) => void }) {
  const [minor, setMinor] = useState(
    keys.length > 0 && keys.every((k) => KEY_PATTERN.exec(k.value)?.[2] === "m"),
  );
  const [custom, setCustom] = useState("");
  const suffix = minor ? "m" : "";
  const chosen = new Set(keys.map((k) => k.value));
  const allSelected = ROOTS.every((r) => chosen.has(r + suffix));

  function toggle(value: string) {
    onChange(
      chosen.has(value)
        ? keys.filter((k) => k.value !== value)
        : sortKeys([...keys, { id: makeId(), value, enabled: true }]),
    );
  }

  function toggleAll() {
    const values = ROOTS.map((r) => r + suffix);
    if (allSelected) {
      onChange(keys.filter((k) => !values.includes(k.value)));
    } else {
      const missing = values.filter((v) => !chosen.has(v));
      onChange(
        sortKeys([...keys, ...missing.map((value) => ({ id: makeId(), value, enabled: true }))]),
      );
    }
  }

  function addCustom() {
    const value = custom.trim();
    if (!value) return;
    if (!chosen.has(value)) onChange(sortKeys([...keys, { id: makeId(), value, enabled: true }]));
    setCustom("");
  }

  const others = keys.filter((k) => !KEY_PATTERN.test(k.value));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div
          role="radiogroup"
          aria-label="Key quality"
          className="flex rounded-md bg-foreground/[0.05] p-0.5"
        >
          {[
            { label: "Major", value: false },
            { label: "Minor", value: true },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={minor === option.value}
              onClick={() => setMinor(option.value)}
              className={`rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
                minor === option.value ? "bg-accent text-accent-foreground" : "text-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="rounded-md px-2 py-1 text-sm font-medium text-muted hover:text-foreground"
        >
          {allSelected ? "Clear all" : "Select all 12"}
        </button>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {ROOTS.map((root) => {
          const value = root + suffix;
          return (
            <button
              key={root}
              type="button"
              aria-pressed={chosen.has(value)}
              onClick={() => toggle(value)}
              className={`${pill(chosen.has(value))} px-0 text-center`}
            >
              {gridKeyName(root, minor)}
            </button>
          );
        })}
      </div>

      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {others.map((k) => (
            <span
              key={k.id}
              className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
            >
              {prettyKey(k.value)}
              <button
                type="button"
                onClick={() => onChange(keys.filter((x) => x.id !== k.id))}
                aria-label={`Remove key ${k.value}`}
                className="opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
          placeholder="Other key"
          title="Any key, e.g. F# dorian"
          aria-label="Custom key"
          className="h-9 w-44 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim()}
          className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
