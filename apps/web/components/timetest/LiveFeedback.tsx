"use client";

import type { LiveHit } from "@/lib/timeTest/session";
import { STATUS_COLOR, STATUS_LABEL, signedMs, statusOf } from "@/lib/timeTest/timing";

const RANGE_MS = 60;

/** While recording: the last stroke's offset, big, and the last dozen on an early ↔ late strip. */
export default function LiveFeedback({
  hits,
  toleranceMs,
  countInLeft,
}: {
  hits: LiveHit[];
  toleranceMs: number;
  /** Clicks left in the count-in, or null once it's over. */
  countInLeft: number | null;
}) {
  const last = hits[hits.length - 1];
  const recent = hits.slice(-12);
  const within = hits.filter((h) => Math.abs(h.errorMs) <= toleranceMs).length;
  const x = (ms: number) => 50 + (Math.max(-RANGE_MS, Math.min(RANGE_MS, ms)) / RANGE_MS) * 50;
  const tolPct = (toleranceMs / RANGE_MS) * 50;

  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-3xl bg-surface p-4" aria-live="polite">
      {countInLeft !== null ? (
        <div className="flex h-[4.5rem] flex-col items-center justify-center">
          <span className="text-sm font-medium text-muted">Count-in</span>
          <span className="text-4xl font-bold tabular-nums">{countInLeft}</span>
        </div>
      ) : last ? (
        <div className="flex h-[4.5rem] flex-col items-center justify-center">
          <span className="text-4xl font-bold tabular-nums" style={{ color: STATUS_COLOR[statusOf(last.errorMs, toleranceMs)] }}>
            {signedMs(last.errorMs)}
          </span>
          <span className="text-sm font-medium text-muted">
            {STATUS_LABEL[statusOf(last.errorMs, toleranceMs)]}
            {Math.abs(last.errorMs) > toleranceMs ? ` · ${last.errorMs > 0 ? "late" : "early"}` : ""}
          </span>
        </div>
      ) : (
        <div className="flex h-[4.5rem] items-center text-sm font-medium text-muted">Start playing…</div>
      )}

      <div className="w-full">
        <div className="relative h-8 w-full rounded-full bg-background">
          <div
            className="absolute inset-y-1 rounded-full"
            style={{ left: `${50 - tolPct}%`, width: `${tolPct * 2}%`, background: `color-mix(in srgb, ${STATUS_COLOR.good} 20%, transparent)` }}
          />
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-muted" />
          {recent.map((h, i) => (
            <span
              key={h.id}
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
              style={{ left: `${x(h.errorMs)}%`, background: STATUS_COLOR[statusOf(h.errorMs, toleranceMs)], opacity: 0.25 + (0.75 * (i + 1)) / recent.length }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] font-medium text-muted">
          <span>← early</span>
          <span>click</span>
          <span>late →</span>
        </div>
      </div>
      {hits.length > 0 && (
        <p className="text-xs tabular-nums text-muted">
          {hits.length} strokes · {Math.round((within / hits.length) * 100)}% within ±{toleranceMs} ms
        </p>
      )}
    </div>
  );
}
