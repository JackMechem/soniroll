"use client";

import { useEffect, useRef } from "react";

/** A ticking "2 s" readout that counts down to zero as a timer runs out — the mirror image of
    ElapsedTimer. Writes straight to the DOM via rAF, like CountdownRing and ElapsedTimer, so it
    doesn't force the whole page to re-render every frame. Shared by the drill-style trainers. */
export default function CountdownLabel({
  active,
  timerRef,
}: {
  active: boolean;
  timerRef: React.RefObject<{ startedAt: number; durationMs: number }>;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const { startedAt, durationMs } = timerRef.current;
      const remainingMs = Math.max(
        0,
        durationMs - (performance.now() - startedAt),
      );
      if (spanRef.current) {
        spanRef.current.textContent = `${Math.ceil(remainingMs / 1000)} s`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, timerRef]);

  if (!active) return null;

  return <span className="tabular-nums" ref={spanRef} />;
}
