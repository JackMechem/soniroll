import type { CSSProperties } from "react";

/**
 * Shared class names for the ear-training and pitch tools (Guess the Interval/Chord/Progression,
 * Find the Root, the Note/Scale/Interval Trainers, the Tuner), so their buttons, answer grids,
 * results and history lists look the same everywhere. Calm and flat: rectangular `rounded-md`
 * buttons, bordered panels, hairline-divided lists.
 */

/** The tool's main Start / Stop button under its display: a round-ended pill, like the rhythm
    tools' (`BIG_PRIMARY` in MeterFields.tsx). */
export function startButtonClass(running: boolean) {
  return `inline-flex h-12 min-w-36 items-center justify-center gap-2 rounded-full px-8 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    running
      ? "text-foreground hover:bg-surface-hover"
      : "bg-accent text-accent-foreground hover:bg-accent-hover"
  }`;
}

/** A primary text button (one per area). */
export const PRIMARY_BUTTON =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

/** A secondary text button: bordered, no fill. */
export const SECONDARY_BUTTON =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50";

/** Small versions, for inside option popovers and side panels. */
export const PRIMARY_BUTTON_SM =
  "inline-flex h-8 items-center justify-center gap-1.5 self-start rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";
export const SECONDARY_BUTTON_SM =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50";

/** A quiet text-only action ("I don't know", "Clear these times"). */
export const TEXT_BUTTON = "text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50";
export const TEXT_BUTTON_DANGER = "self-start text-sm font-medium text-muted transition-colors hover:text-danger disabled:opacity-50";

/** One answer in a quiz's grid of choices. `color` is set once the round is answered (right or
    wrong); unanswered choices are plain bordered buttons. */
export function answerButtonClass(color: string | undefined, answered: boolean) {
  return `min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
    color ? "" : answered ? "border-foreground/10 text-muted opacity-50" : "border-foreground/15 bg-background hover:bg-surface-hover"
  }`;
}
export function answerButtonStyle(color: string | undefined): CSSProperties | undefined {
  return color
    ? { color, borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` }
    : undefined;
}

/** The end-of-round results panel. */
export const RESULTS_PANEL = "flex w-full flex-col gap-4 rounded-lg bg-surface p-4 text-left sm:p-5";

/** A small graded tag (a round's item in the results), tinted with its grade colour. */
export const GRADE_TAG = "rounded-sm px-2 py-0.5 text-xs font-medium";
export function gradeTagStyle(color: string): CSSProperties {
  return { color, background: `color-mix(in srgb, ${color} 12%, transparent)` };
}

/** The scrolling list in the History / Struggles panels, and its rows. */
export const PANEL_LIST = "flex max-h-72 flex-col divide-y divide-foreground/10 overflow-y-auto";
export const PANEL_ROW = "flex items-center justify-between gap-3 py-2 text-sm";

/** "Level 3 · Fourths and fifths" above the display while a learning-path level runs. */
export const LEVEL_LABEL = "text-xs font-medium text-muted";

/** Text inputs in the quizzes (typed answers). */
export const TEXT_INPUT =
  "h-10 w-full rounded-md bg-foreground/[0.05] px-3 text-foreground outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60";
