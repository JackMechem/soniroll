import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';

import { CLOSE_CENTS, IN_TUNE, IN_TUNE_CENTS, centsColor } from '@/components/TunerDial';
import { getTunerHistory } from '@/lib/tunerEngine';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** Seconds of pitch the graph shows. */
const WINDOW_SEC = 5;
/** Where "now" sits across the graph (0–1), so the newest point isn't lost in the circle's edge. */
const NOW_X = 0.86;
/** A longer gap than this between points breaks the line. */
const GAP_SEC = 0.12;
/** Redraws at most this often (about 30 a second): smooth enough, and kinder to a slow phone. */
const FRAME_MS = 33;

type Point = { t: number; target: number; cents: number };
type GraphView = { now: number; points: Point[] };

const EMPTY: GraphView = { now: 0, points: [] };

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The last few seconds of pitch, drawn inside the Tuner's ring of notes (the "Pitch graph in the
 * dial" option) — the phone's version of the website's `components/tuner/DialGraph.tsx`. Cents sharp
 * go up, flat go down (±50, clamped), the ±8 in-tune band shaded, ±25 dashed, "now" at 86% across
 * with a dot on the newest point. Each run of frames on one note (broken by a gap over 0.12 s) is
 * one line, coloured by its median like the needle. It reads `getTunerHistory()` on its own
 * animation frames while listening (so the Tuner screen doesn't re-render for it) and holds what
 * it last showed after Stop. The dial clips it to the circle (`TunerDial`'s `tight`).
 */
export function TunerDialGraph({ listening }: { listening: boolean }) {
  const { colors } = useAppTheme();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const { now, points } = useLivePoints(listening);
  const { w, h } = box;

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

  const xOf = (t: number) => w * (NOW_X - ((now - t) / WINDOW_SEC) * NOW_X);
  const yOf = (cents: number) => (h * (50 - Math.max(-50, Math.min(50, cents)))) / 100;
  const newest = points[points.length - 1];
  const dot = newest && now - newest.t <= GAP_SEC ? newest : null;
  const guide = withAlpha(colors.muted, 0.35);

  return (
    <View
      className="w-full flex-1"
      style={{ minHeight: 0, backgroundColor: withAlpha(colors.foreground, 0.03) }}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {w > 0 && h > 0 ? (
        <Svg width={w} height={h}>
          <Rect x={0} y={yOf(IN_TUNE_CENTS)} width={w} height={yOf(-IN_TUNE_CENTS) - yOf(IN_TUNE_CENTS)} fill={IN_TUNE} opacity={0.14} />
          {[CLOSE_CENTS, -CLOSE_CENTS].map((c) => (
            <Line key={c} x1={0} x2={w} y1={yOf(c)} y2={yOf(c)} stroke={guide} strokeWidth={1} strokeDasharray="3 4" />
          ))}
          <Line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke={withAlpha(colors.muted, 0.5)} strokeWidth={1} />
          <Line x1={w * NOW_X} x2={w * NOW_X} y1={0} y2={h} stroke={withAlpha(colors.muted, 0.22)} strokeWidth={1} />
          {runs.map((run) => (
            <Polyline
              key={run.points[0].t}
              points={run.points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.cents).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={run.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {dot ? <Circle cx={xOf(dot.t)} cy={yOf(dot.cents)} r={4} fill={centsColor(dot.cents)} stroke={colors.background} strokeWidth={2} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}

/** The mic's recent pitch from the tuner engine, redrawn on animation frames while listening (at
    most every `FRAME_MS`). When listening stops the graph holds what it last showed. */
function useLivePoints(running: boolean): GraphView {
  const [view, setView] = useState<GraphView>(EMPTY);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    let wasEmpty = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const nowMs = Date.now();
      if (nowMs - last < FRAME_MS) return;
      last = nowMs;
      const from = nowMs - WINDOW_SEC * 1000 - 200;
      const points = getTunerHistory()
        .filter((p) => p.t >= from)
        .map((p) => ({ t: p.t / 1000, target: p.target, cents: p.cents }));
      // Nothing heard in the window: one empty draw, then no more re-renders until there is.
      if (!points.length && wasEmpty) return;
      wasEmpty = !points.length;
      setView({ now: nowMs / 1000, points });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return view;
}
