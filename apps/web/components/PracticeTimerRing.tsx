"use client";

import { useEffect, useRef } from "react";
import { formatClock } from "@/lib/practiceTimer";

const RING_RADIUS = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * The Practice Timer tool page's own countdown ring + "M:SS" label, driven directly off the
 * engine's wall-clock (`Date.now()`) `startedAt`/`durationMs` — deliberately **not** built on the
 * shared `CountdownRing`/`CountdownLabel` (hardcoded to `performance.now()`, the page-load-
 * relative clock every other timer in this app uses). Practice Timer is the one timer here that
 * has to keep counting correctly across an actual page reload, and computing directly off
 * `Date.now()` here — the exact same clock `lib/practiceTimerEngine.ts` itself and
 * `PracticeTimerWidget.tsx`'s sidebar/mobile readout use, via the same `formatClock` — means this
 * display and that one can never show two different numbers for the same running step, the way an
 * separate `performance.timeOrigin` conversion (this component's first version) turned out to.
 */
export default function PracticeTimerRing({
  startedAt,
  durationMs,
  paused,
  remainingMsAtPause,
  alarming,
  size = "lg",
}: {
  startedAt: number;
  durationMs: number;
  paused: boolean;
  remainingMsAtPause: number | null;
  /** The step's time is fully up and `alarmMode` is holding here instead of having auto-advanced
      (`lib/practiceTimerEngine.ts`) — paints the ring fully drained (there's nothing left to count
      down) and pulses it in the danger color instead of ticking, the same "something needs your
      attention" treatment as the rest of the alarm UI. */
  alarming?: boolean;
  /** "sm": a small ring, for a running routine on the Shed Log. */
  size?: "lg" | "sm";
}) {
  const circleRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function paint(remainingMs: number) {
      const fraction = Math.min(1, Math.max(0, 1 - remainingMs / durationMs));
      circleRef.current?.style.setProperty(
        "stroke-dashoffset",
        String(RING_CIRCUMFERENCE * fraction),
      );
      if (labelRef.current) labelRef.current.textContent = formatClock(remainingMs);
    }

    if (alarming) {
      paint(0);
      return;
    }
    if (paused) {
      paint(remainingMsAtPause ?? 0);
      return;
    }
    let frame = 0;
    const tick = () => {
      paint(Math.max(0, durationMs - (Date.now() - startedAt)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startedAt, durationMs, paused, remainingMsAtPause, alarming]);

  return (
    <div className={`relative flex shrink-0 items-center justify-center ${size === "sm" ? "h-20 w-20" : "h-48 w-48"}`}>
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className={`pointer-events-none absolute inset-0 h-full w-full -rotate-90 ${alarming ? "animate-pulse" : ""}`}
      >
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="4"
          className="stroke-surface-hover"
        />
        <circle
          ref={circleRef}
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className={alarming ? "stroke-danger" : "stroke-accent"}
          style={{
            strokeDasharray: RING_CIRCUMFERENCE,
            strokeDashoffset: 0,
            transition: "stroke-dashoffset 0.1s linear",
          }}
        />
      </svg>
      <span
        ref={labelRef}
        className={`${size === "sm" ? "text-lg font-semibold" : "text-4xl font-semibold tracking-tight"} tabular-nums ${alarming ? "text-danger animate-pulse" : ""}`}
      />
    </div>
  );
}
