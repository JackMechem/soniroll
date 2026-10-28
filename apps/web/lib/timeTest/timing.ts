import { GRADE_COLOR } from "@/lib/noteGrade";

/** Shared wording and status colours for timing errors. The colours are the trainers' grade
    colours, so "on time" looks like "correct" everywhere on the site. */

export type Status = "good" | "warning" | "critical";

export const STATUS_COLOR: Record<Status, string> = {
  good: GRADE_COLOR.correct,
  warning: GRADE_COLOR.partial,
  critical: GRADE_COLOR.incorrect,
};

export const STATUS_LABEL: Record<Status, string> = {
  good: "On time",
  warning: "A little off",
  critical: "Off",
};

export function statusOf(errorMs: number, toleranceMs: number): Status {
  const a = Math.abs(errorMs);
  return a <= toleranceMs ? "good" : a <= toleranceMs * 2.5 ? "warning" : "critical";
}

/** "+12.4 ms" / "−3.0 ms". */
export function signedMs(ms: number, digits = 1) {
  const v = Math.abs(ms).toFixed(digits);
  return ms > 0 ? `+${v} ms` : ms < 0 ? `−${v} ms` : `${v} ms`;
}

/** "12.4 ms late" / "3.0 ms early" / "dead on". */
export function describeMs(ms: number, toleranceMs: number, digits = 1) {
  if (Math.abs(ms) < 0.05) return "dead on";
  const v = `${Math.abs(ms).toFixed(digits)} ms`;
  if (Math.abs(ms) <= toleranceMs) return `${v} ${ms > 0 ? "late" : "early"}, on time`;
  return `${v} ${ms > 0 ? "late" : "early"}`;
}

/** "1:04.2". */
export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}

/** The counting syllable for note `pos` of `notes` in a beat ("e", "&", "a", "trip", "let"); ""
    for the beat itself. */
export function syllable(pos: number, notes: number) {
  const names: Record<number, string> = { 0: "", 6: "e", 8: "trip", 12: "&", 16: "let", 18: "a" };
  const at = (pos * 24) / Math.max(1, notes);
  return names[at] ?? `(note ${pos + 1} of ${notes})`;
}

/** "bar 3, beat 2 &". */
export function whereLabel(bar: number, beat: number, pos: number, notes: number) {
  const syl = syllable(pos, notes);
  return `bar ${bar}, beat ${beat + 1}${syl ? ` ${syl}` : ""}`;
}
