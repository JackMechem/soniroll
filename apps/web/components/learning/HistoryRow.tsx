import type { ReactNode } from "react";
import { GRADE_COLOR, PANEL_ROW } from "@/components/learning/quizUi";
import { formatDuration } from "@/lib/trainerUtils";

/** One finished run in a trainer's History list. The score leads ("12/15 · 80%", green when
    perfect), with what kind of run and when under it; the time sits small on the right. */
export default function HistoryRow({
  score,
  total,
  elapsedMs,
  children,
}: {
  score: number;
  total: number;
  elapsedMs: number;
  /** The small line under the score: "Quiz · 18 Nov". */
  children: ReactNode;
}) {
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  return (
    <div className={PANEL_ROW}>
      <div className="flex min-w-0 flex-col">
        <span
          className="font-semibold tabular-nums"
          style={score === total ? { color: GRADE_COLOR.correct } : undefined}
        >
          {score % 1 === 0 ? score : score.toFixed(1)}/{total} · {percent}%
        </span>
        <span className="text-xs text-muted">{children}</span>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted">{formatDuration(elapsedMs)}</span>
    </div>
  );
}
