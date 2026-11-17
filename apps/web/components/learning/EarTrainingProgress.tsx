import Link from "next/link";
import { LEARNING_TRACKS, LearningTrack, TrackSummary } from "@/lib/learningPath";
import { NAV_LINKS } from "@/components/tools";

/** The three ear-training learning paths at a glance — levels passed, stars, and what's next —
    for the dashboard and public profiles. `links` makes each one open its tool. */
export default function EarTrainingProgress({
  summaries,
  links = false,
}: {
  summaries: Record<LearningTrack, TrackSummary>;
  links?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {LEARNING_TRACKS.map((track) => {
        const s = summaries[track.id];
        const Icon = NAV_LINKS.find((l) => l.href === track.href)?.icon;
        const pct = Math.round((s.passed / s.total) * 100);
        const done = s.passed === s.total;
        const body = (
          <>
            <span className="flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{track.label}</span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-amber-500">★ {s.stars}</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, s.passed ? 6 : 0)}%` }} />
            </span>
            <span className="flex items-baseline justify-between gap-2 text-xs text-muted">
              <span className="truncate">
                {done ? "Every level passed 🎉" : s.passed ? `Next: ${s.current}` : `Starts with ${s.current}`}
              </span>
              <span className="shrink-0 tabular-nums">
                {s.passed}/{s.total} levels
              </span>
            </span>
          </>
        );
        const className = "flex flex-col gap-2 rounded-md bg-foreground/[0.05] p-3 text-left";
        return links ? (
          <Link key={track.id} href={track.href} className={`${className} transition-colors hover:bg-surface-hover`}>
            {body}
          </Link>
        ) : (
          <div key={track.id} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
