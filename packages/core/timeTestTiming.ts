import { GRADE_COLOR } from "./noteGrade";
import type { Analysis } from "./timeTestAnalysis";

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

/** One take's results as kept in the Time Test's synced history (`jam-practice-time-test-history`,
    `{ takes: TakeSummary[] }`), on the website and in the app. */
export type TakeSummary = {
  at: number;
  bpm: number;
  meter: string;
  /** Notes per beat graded; 0 = it changed from beat to beat. */
  notes: number;
  seconds: number;
  score: number;
  withinPct: number;
  meanMs: number;
  stdMs: number;
  hits: number;
  toleranceMs: number;
};

/** How many takes the history keeps. */
export const HISTORY_LIMIT = 100;

/** A few plain sentences on what the take shows. */
export function verdict(a: Analysis, bpm: number): string {
  const s = a.stats;
  if (s.hits === 0) {
    return "No strokes were picked up after the count-in. Check the mic's sensitivity (hit the pad and watch the level under Microphone), then try again.";
  }
  const tol = a.toleranceMs;
  const parts: string[] = [];
  const bias = Math.max(2, tol * 0.3);
  if (Math.abs(s.meanMs) < bias) parts.push(`No real push or pull: on average you're ${Math.abs(s.meanMs).toFixed(1)} ms from the click.`);
  else if (s.meanMs < 0) parts.push(`You're rushing: on average ${Math.abs(s.meanMs).toFixed(1)} ms ahead of the click.`);
  else parts.push(`You're dragging: on average ${s.meanMs.toFixed(1)} ms behind the click.`);

  const sd = s.stdMs;
  parts.push(
    sd < 5
      ? `Very consistent stroke to stroke (±${sd.toFixed(1)} ms).`
      : sd < 10
        ? `Fairly consistent (±${sd.toFixed(1)} ms stroke to stroke).`
        : sd < 20
          ? `Your placement wanders quite a bit (±${sd.toFixed(1)} ms).`
          : `Your placement is all over the place (±${sd.toFixed(1)} ms). Try a slower tempo.`,
  );

  if (s.tempoRatio && Math.abs(s.tempoRatio - 1) > 0.004) {
    parts.push(`Over the take you ${s.tempoRatio > 1 ? "sped up" : "slowed down"} to about ${(bpm * s.tempoRatio).toFixed(1)} BPM.`);
  }
  const worst = a.byPosition.filter((p) => p.count >= 3).sort((x, y) => Math.abs(y.meanMs) - Math.abs(x.meanMs))[0];
  if (a.byPosition.length > 1 && worst && Math.abs(worst.meanMs) > Math.max(tol / 2, Math.abs(s.meanMs) + 3)) {
    parts.push(`Watch the "${worst.label}"s: they land ${Math.abs(worst.meanMs).toFixed(1)} ms ${worst.meanMs < 0 ? "early" : "late"} on average.`);
  }
  return parts.join(" ");
}
