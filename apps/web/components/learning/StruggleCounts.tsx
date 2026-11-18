import { GRADE_COLOR } from "@/lib/noteGrade";
import { GradeCounts, attempts } from "@/lib/struggleStats";

/** The right-hand side of a Struggles row, in words: "5 wrong out of 6", or "2 wrong, 1 partly
    right out of 6" when some answers were only partly right. `partialLabel` names the partial
    grade where "partly right" doesn't fit (Find the Root's "on a retry"). */
export default function StruggleCounts({
  counts,
  partialLabel = "partly right",
}: {
  counts: GradeCounts;
  partialLabel?: string;
}) {
  const { incorrect, partial } = counts;
  return (
    <span className="shrink-0 text-xs tabular-nums text-muted">
      {incorrect > 0 && <span style={{ color: GRADE_COLOR.incorrect }}>{incorrect} wrong</span>}
      {incorrect > 0 && partial > 0 && ", "}
      {partial > 0 && (
        <span style={{ color: GRADE_COLOR.partial }}>
          {partial} {partialLabel}
        </span>
      )}{" "}
      out of {attempts(counts)}
    </span>
  );
}
