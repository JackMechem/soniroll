"use client";

import { useEffect, useRef } from "react";
import { formatClock } from "@/lib/practiceTimer";

/** A ticking "M:SS" readout for a running (or frozen-while-paused/alarming) Practice Timer step.
    Writes straight to the DOM via rAF rather than React state, same reasoning as CountdownLabel —
    a once-a-second-or-faster text update shouldn't re-render the whole sidebar. Computes off
    Date.now() directly, and formats via the same `formatClock` the tool page's own
    `PracticeTimerRing` uses, so the two can never show different numbers for the same step. */
export function RemainingLabel({
  startedAt,
  durationMs,
  paused,
  remainingMsAtPause,
  alarming,
}: {
  startedAt: number;
  durationMs: number;
  paused: boolean;
  remainingMsAtPause: number | null;
  alarming: boolean;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (alarming) {
      if (spanRef.current) spanRef.current.textContent = formatClock(0);
      return;
    }
    if (paused) {
      if (spanRef.current) spanRef.current.textContent = formatClock(remainingMsAtPause ?? 0);
      return;
    }
    let frame = 0;
    const tick = () => {
      const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
      if (spanRef.current) spanRef.current.textContent = formatClock(remaining);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startedAt, durationMs, paused, remainingMsAtPause, alarming]);

  return <span className="shrink-0 tabular-nums" ref={spanRef} />;
}
