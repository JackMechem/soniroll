"use client";

import { useState } from "react";

/** Integer input that lets you clear and retype; commits only in-range values. */
export default function NumberField({
  value,
  min,
  max,
  onChange,
  label,
  className,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  /** Overrides the default input styling (e.g. for a large, borderless hero number). */
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const parsed = Number(shown);
  const valid = /^\d+$/.test(shown) && parsed >= min && parsed <= max;

  return (
    <input
      type="text"
      inputMode="numeric"
      value={shown}
      aria-label={label}
      aria-invalid={!valid}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        const n = Number(next);
        if (/^\d+$/.test(next) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const n = Math.min(max, Math.max(min, value + (e.key === "ArrowUp" ? 1 : -1)));
        setDraft(null);
        onChange(n);
      }}
      className={`${
        className ??
        "w-full rounded-lg bg-foreground/[0.05] px-3 py-2 tabular-nums outline-none focus:ring-2 focus:ring-accent"
      } ${valid ? "" : "text-danger"}`}
    />
  );
}
