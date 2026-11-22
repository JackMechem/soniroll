"use client";

import { useEffect, useState } from "react";
import { getTunerHistory } from "@/lib/tunerEngine";
import { type PitchTrack, CLOSE_CENTS, IN_TUNE_CENTS, centsColor, centsOfFrame, frameAt, timeOfFrame } from "@/lib/pitchTrack";

/** Seconds of pitch the graph shows. */
const WINDOW_SEC = 5;
/** Where "now" sits across the graph (0–100), so the newest point isn't lost in the circle's edge. */
const NOW_X = 86;
/** A longer gap than this between points breaks the line. */
const GAP_SEC = 0.12;

type Point = { t: number; target: number; cents: number };

const yOf = (cents: number) => 50 - Math.max(-50, Math.min(50, cents));

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The last few seconds of pitch, drawn inside the Tuner's ring of notes (the "Pitch graph in the
 * dial" option). Cents sharp go up, flat go down, with the in-tune band shaded; each note's line
 * is coloured like the needle. Live it follows the mic; with a take open it follows the take up to
 * the playhead. The parent clips it to the circle.
 */
export default function DialGraph(props: { kind: "live"; listening: boolean } | { kind: "take"; track: PitchTrack | null; pos: number; refA: number; minRms: number }) {
  const live = useLivePoints(props.kind === "live" && props.listening);
  const { now, points } = props.kind === "take" ? takePoints(props.track, props.pos, props.refA, props.minRms) : live;

  // Runs of points on one note without a gap, each drawn as its own line.
  const runs: { points: Point[]; color: string }[] = [];
  let cur: Point[] = [];
  const close = () => {
    if (cur.length > 1) runs.push({ points: cur, color: centsColor(median(cur.map((p) => p.cents))) });
    cur = [];
  };
  for (const p of points) {
    const last = cur[cur.length - 1];
    if (last && (last.target !== p.target || p.t - last.t > GAP_SEC)) close();
    cur.push(p);
  }
  close();

  const xOf = (t: number) => NOW_X - ((now - t) / WINDOW_SEC) * NOW_X;
  const newest = points[points.length - 1];
  const dot = newest && now - newest.t <= GAP_SEC ? newest : null;

  return (
    <div className="relative h-full w-full bg-foreground/[0.03]" aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <rect x={0} y={yOf(IN_TUNE_CENTS)} width={100} height={IN_TUNE_CENTS * 2} fill="var(--tune-in)" opacity={0.14} />
        {[CLOSE_CENTS, -CLOSE_CENTS].map((c) => (
          <line key={c} x1={0} x2={100} y1={yOf(c)} y2={yOf(c)} stroke="var(--muted)" strokeOpacity={0.3} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={0} x2={100} y1={50} y2={50} stroke="var(--muted)" strokeOpacity={0.45} vectorEffect="non-scaling-stroke" />
        <line x1={NOW_X} x2={NOW_X} y1={0} y2={100} stroke="var(--muted)" strokeOpacity={0.2} vectorEffect="non-scaling-stroke" />
        {runs.map((run) => (
          <polyline
            key={run.points[0].t}
            points={run.points.map((p) => `${xOf(p.t).toFixed(2)},${yOf(p.cents).toFixed(2)}`).join(" ")}
            fill="none"
            stroke={run.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {/* A dot, not an SVG circle: the SVG stretches to the box. */}
      {dot && (
        <span
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
          style={{ left: `${xOf(dot.t)}%`, top: `${yOf(dot.cents)}%`, background: centsColor(dot.cents) }}
        />
      )}
    </div>
  );
}

/** The mic's recent pitch from the tuner engine, redrawn every animation frame while listening.
    When listening stops the graph holds what it last showed. */
function useLivePoints(running: boolean): { now: number; points: Point[] } {
  const [view, setView] = useState<{ now: number; points: Point[] }>({ now: 0, points: [] });
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const nowMs = performance.now();
      const from = nowMs - WINDOW_SEC * 1000 - 200;
      const points = getTunerHistory()
        .filter((p) => p.t >= from)
        .map((p) => ({ t: p.t / 1000, target: p.target, cents: p.cents }));
      setView({ now: nowMs / 1000, points });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return view;
}

/** A take's frames over the few seconds up to the playhead. */
function takePoints(track: PitchTrack | null, pos: number, refA: number, minRms: number): { now: number; points: Point[] } {
  const points: Point[] = [];
  if (!track || track.done === 0) return { now: pos, points };
  const first = frameAt(track, pos - WINDOW_SEC - 0.2);
  const last = frameAt(track, pos);
  for (let f = first; f <= last; f++) {
    const c = centsOfFrame(track, f, refA, minRms);
    if (c) points.push({ t: timeOfFrame(track, f), target: c.target, cents: c.cents });
  }
  return { now: pos, points };
}
