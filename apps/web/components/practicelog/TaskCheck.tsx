"use client";

import type { ReactNode } from "react";
import { burstAt } from "@/components/practicelog/Celebrations";
import { CheckIcon } from "@/components/tools";

/**
 * A task to tick off: its box, its name and the line under it (time, minutes) are one button, so
 * tapping the name ticks it too, not just the small box. Buttons that belong to the task (time it,
 * ⋮) go beside it, outside this.
 */
export default function TaskCheck({
  checked,
  label,
  color,
  onToggle,
  badge,
  meta,
  boxClass = "h-5 w-5 pointer-coarse:h-6 pointer-coarse:w-6",
}: {
  checked: boolean;
  label: string;
  /** The box's fill when ticked (a routine's colour, or `var(--accent)`). */
  color: string;
  onToggle: () => void;
  /** Shown after the name (e.g. "Today only"). */
  badge?: ReactNode;
  /** The small line under the name, as separate items (dots go between them). */
  meta?: ReactNode[];
  boxClass?: string;
}) {
  const accent = color === "var(--accent)";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${label || "Task"} done`}
      onClick={(e) => {
        if (!checked) burstAt(e.currentTarget.querySelector("[data-check]") ?? e.currentTarget, color);
        onToggle();
      }}
      className="group/check flex w-full min-w-0 items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <span
        data-check
        aria-hidden
        className={`mt-0.5 flex shrink-0 items-center justify-center rounded-sm border transition-colors ${boxClass} ${
          checked ? `log-check border-transparent ${accent ? "text-accent-foreground" : "text-white"}` : "border-foreground/25 group-hover/check:border-muted"
        }`}
        style={checked ? { background: color } : undefined}
      >
        {checked && <CheckIcon className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${checked ? "text-muted line-through" : ""}`}>
          {label || "Untitled task"}
          {badge}
        </span>
        {meta && <DotList className="text-xs text-muted" items={meta} />}
      </span>
    </button>
  );
}

/** Short items in a line with a "·" between them that wraps without leaving a dot dangling at
    either end: each item draws its dot on its left, and the one starting a line has it clipped. */
export function DotList({ items, className = "" }: { items: ReactNode[]; className?: string }) {
  // A prop, not children: an array as children wants keys on every item.
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== "");
  return (
    <span className={`block overflow-hidden ${className}`}>
      <span className="-ml-3 flex flex-wrap items-center">
        {shown.map((item, i) => (
          <span key={i} className="relative min-w-0 pl-3 before:absolute before:left-1 before:content-['·']">
            {item}
          </span>
        ))}
      </span>
    </span>
  );
}
