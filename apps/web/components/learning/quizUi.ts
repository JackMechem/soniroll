import type { CSSProperties } from "react";
import { BIG_PRIMARY, BIG_SECONDARY } from "@/components/MeterFields";
import { PASS_SCORE } from "@/lib/learningPath";

/**
 * Shared class names for the ear-training and pitch tools (Guess the Interval/Chord/Progression,
 * Find the Root, the Note/Scale/Interval Trainers, the Tuner), so their buttons, answer grids,
 * results and history lists look the same everywhere. Calm and flat: rectangular `rounded-md`
 * buttons, bordered panels, hairline-divided lists.
 */

/** The tool's main Start / Stop button under its display: the rhythm tools' round-ended pill
    (`BIG_PRIMARY` / `BIG_SECONDARY` in MeterFields.tsx), filled with the accent while stopped and
    a quiet fill while running. */
export function startButtonClass(running: boolean) {
  return running ? BIG_SECONDARY : BIG_PRIMARY;
}

/** The "—" in a trainer's round display before the first round (and after Stop): the same size
    and colour on every trainer. */
export const IDLE_DASH = "relative z-10 text-4xl font-bold leading-none text-muted";

/** The "Press Start, …" line inside a trainer's round display. It hangs a fixed distance below
    the display's centre (where the idle dash sits), so however many lines it wraps to on a
    phone, it grows downwards and never crowds the dash. */
export const IDLE_HINT = "absolute inset-x-0 top-1/2 z-10 mt-6 text-center text-sm leading-snug text-muted";

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

/** "All" / "None" / "Reset" above a pool of pill toggles (which intervals, which chords): small
    round pills, big enough to tap (32px). */
export const POOL_BUTTON =
  "inline-flex h-8 items-center justify-center rounded-full bg-foreground/[0.05] px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50";

/** A quiet text-only action ("I don't know", "Clear these times"). */
export const TEXT_BUTTON = "text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50";
export const TEXT_BUTTON_DANGER = "self-start text-sm font-medium text-muted transition-colors hover:text-danger disabled:opacity-50";

/** One answer in a quiz's grid of choices. `color` is set once the round is answered (right or
    wrong); unanswered choices are plain bordered buttons. */
export function answerButtonClass(color: string | undefined, answered: boolean) {
  return `min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
    color ? "" : answered ? "border-foreground/15 opacity-60" : "border-foreground/15 bg-background hover:bg-surface-hover"
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

/** Whether a finished round passed (the learning path's pass mark, 80%). Only passing rounds
    count towards a trainer's "Best" time — a fast 0 / 15 isn't a best. */
export function passedRound(entry: { score: number; total: number }): boolean {
  return entry.total > 0 && entry.score / entry.total >= PASS_SCORE;
}

/** The fastest time among these finished rounds that passed, or null if none did. */
export function bestPassingMs(entries: { score: number; total: number; elapsedMs: number }[]): number | null {
  const times = entries.filter(passedRound).map((e) => e.elapsedMs);
  return times.length ? Math.min(...times) : null;
}

/** True when a touch screen is the main pointer (a phone or tablet). The typed-answer quizzes
    don't focus their text field on their own there: the on-screen keyboard would cover the
    answer keypad. Only call it from effects and event handlers, never during render. */
export function isTouchFirst(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

/** Shows a note name's accidentals as ♯ / ♭ ("G#3" → "G♯3", "Bb" → "B♭"). Display only: stored
    notes and what people type keep the plain # and b. Only a # or b straight after a note letter
    changes, so other words in the text are left alone. */
export function noteGlyphs(text: string): string {
  return text.replace(/([A-G])#/g, "$1♯").replace(/([A-G])b/g, "$1♭");
}
