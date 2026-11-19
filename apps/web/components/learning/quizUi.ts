import type { CSSProperties } from "react";
import { BIG_PRIMARY, BIG_SECONDARY } from "@/components/MeterFields";
import { PASS_SCORE } from "@/lib/learningPath";
import type { Grade } from "@/lib/noteGrade";

/** Right / half / wrong colours for the trainers, as theme colours so they read on every theme:
    `--success` is a darker green in light themes (text on the pale backgrounds stays above 4.5:1)
    and the bright one in dark themes; wrong is the theme's own `--danger`. Use these on the web
    instead of `@/lib/noteGrade`'s fixed hex `GRADE_COLOR` (that one stays for the mobile app). */
export const GRADE_COLOR: Record<Grade, string> = {
  correct: "var(--success)",
  partial: "var(--warning)",
  incorrect: "var(--danger)",
};

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

/** A trainer's round display before the first round (and after Stop): an empty ring (the same
    faint circle as Find the Root's) with a muted "?" in it, so the display reads as "waiting"
    rather than as something missing. `IDLE_RING` is an aria-hidden span inside the display. */
export const IDLE_RING = "pointer-events-none absolute inset-0 rounded-full border-[3px] border-foreground/10";
export const IDLE_MARK = "relative z-10 text-4xl font-bold leading-none text-muted";

/** The "Press Start, …" line, under the idle ring. */
export const IDLE_HINT = "max-w-xs text-center text-sm leading-snug text-muted";

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

/** A quiet text-only action ("I don't know"), with a 44px-tall hit area so it's easy to tap. */
export const TEXT_BUTTON = "inline-flex min-h-11 items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50";
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

/** "Stop to change these." at the top of an options popover whose controls are locked while a
    round runs, so the greyed-out controls have a reason next to them. */
export const LOCKED_NOTE = "text-xs font-medium text-muted";

/** A one-line feedback slot under a quiz's round display ("You picked …", the revealed notes).
    Always there while a round runs, empty or not, so answering never moves the buttons below. */
export const FEEDBACK_LINE = "h-5 max-w-full truncate text-sm font-medium leading-5";

/** The typed-answer field in Guess the Chord / Progression: a lighter fill than the keypad keys
    around it plus a faint inset edge (an accent one when focused), so it reads as the place to
    type rather than another key. Read-only (dimmed) once the round is answered. */
export const ANSWER_INPUT =
  "h-11 w-full rounded-md bg-surface px-3 text-center text-lg text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,transparent)] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--accent)] read-only:opacity-70";

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
