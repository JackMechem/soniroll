import { peaks as takePeaks, type Analysis, type Hit, type Take } from '@jam-practice/core/timeTestAnalysis';
import { STATUS_LABEL, describeMs, statusOf, whereLabel, type Status } from '@jam-practice/core/timeTestTiming';
import { memo, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { dotPath } from '@/components/timeTest/Charts';
import { useStatusColors } from '@/components/timeTest/parts';
import type { Detail } from '@/lib/timeTestPeaks';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A take's waveform on the phone (the website's `timetest/Waveform.tsx`, drawn with
 * `react-native-svg` instead of a canvas): the click grid with bar numbers, the recording, each
 * stroke as a line in its status colour shaded back to where it should have landed, an early ↔
 * late lane under it, missed notes as hollow circles, extra strokes dashed, and the playhead. Under
 * it, the whole take as a strip with the part in view boxed.
 *
 * Touch instead of a mouse: **drag** to move along the take, **pinch** to zoom, **tap** to put the
 * playhead there (and see what the stroke under your finger was), **drag the playhead** to move it.
 * Tapping or dragging on the strip jumps there.
 */

export type WaveView = { start: number; end: number };

const WAVE_H = 140;
const LANE_H = 64;
const HEIGHT = WAVE_H + LANE_H;
const OVERVIEW_H = 40;
const MIN_SPAN = 0.08;
/** How close (px) a drag has to start to the playhead to move it rather than the view. */
const GRAB = 18;
const FONT = 'Geist_600SemiBold';
const STATUSES: Status[] = ['good', 'warning', 'critical'];

export function clampView(v: WaveView, duration: number): WaveView {
  const span = Math.min(duration, Math.max(MIN_SPAN, v.end - v.start));
  const start = Math.min(Math.max(0, v.start), Math.max(0, duration - span));
  return { start, end: start + span };
}

/** The waveform's columns for a view as one path ("M x top V bottom" per column). */
function wavePath(take: Take, detail: Detail, view: WaveView, width: number, amp: number): string {
  const mid = WAVE_H / 2;
  const span = view.end - view.start;
  const perPx = span / width;
  let d = '';
  // Zoomed right in: from the samples themselves.
  if (perPx < detail.bucketSec * 2) {
    const cols = takePeaks(take.samples, take.sr, view.start, view.end, width);
    for (let x = 0; x < width; x++) {
      const y0 = mid - cols[x * 2 + 1] * amp * (mid - 4);
      const y1 = mid - cols[x * 2] * amp * (mid - 4);
      d += `M${x + 0.5} ${y0.toFixed(1)}V${Math.max(y0 + 1, y1).toFixed(1)}`;
    }
    return d;
  }
  for (let x = 0; x < width; x++) {
    const a = Math.max(0, Math.floor((view.start + x * perPx) / detail.bucketSec));
    const b = Math.min(detail.min.length, Math.max(a + 1, Math.ceil((view.start + (x + 1) * perPx) / detail.bucketSec)));
    let lo = 0;
    let hi = 0;
    for (let i = a; i < b; i++) {
      if (detail.min[i] < lo) lo = detail.min[i];
      if (detail.max[i] > hi) hi = detail.max[i];
    }
    const y0 = mid - hi * amp * (mid - 4);
    const y1 = mid - lo * amp * (mid - 4);
    d += `M${x + 0.5} ${y0.toFixed(1)}V${Math.max(y0 + 1, y1).toFixed(1)}`;
  }
  return d;
}

type LayerProps = { take: Take; analysis: Analysis; detail: Detail; view: WaveView; width: number; amp: number };

/** Everything but the playhead (redrawn only when the view changes, not 60 times a second). */
const WaveLayer = memo(function WaveLayer({ take, analysis, detail, view, width, amp }: LayerProps) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  const tol = analysis.toleranceMs;
  const span = view.end - view.start;
  const xOf = (t: number) => ((t - view.start) / span) * width;
  const laneRange = Math.min(120, Math.max(30, tol * 4));
  const laneY = (ms: number) => WAVE_H + LANE_H / 2 - (Math.max(-laneRange, Math.min(laneRange, ms)) / laneRange) * (LANE_H / 2 - 8);

  const wave = wavePath(take, detail, view, width, amp);

  // Grid: bar lines, beats, subdivisions when there's room for them.
  const beats = analysis.grid.filter((g) => g.pos === 0);
  const beatPx = beats.length > 1 ? ((beats[1].t - beats[0].t) / span) * width : 99;
  let barLines = '';
  let beatLines = '';
  let subLines = '';
  const barLabels: { x: number; bar: number }[] = [];
  for (const g of analysis.grid) {
    if (g.t < view.start - 0.01 || g.t > view.end + 0.01) continue;
    const isBar = g.beat === 0 && g.pos === 0;
    const isBeat = g.pos === 0;
    if (!isBeat && beatPx / g.n < 7) continue;
    if (isBeat && !isBar && beatPx < 3) continue;
    const x = Math.round(xOf(g.t)) + 0.5;
    const seg = `M${x} 0V${HEIGHT}`;
    if (isBar) {
      barLines += seg;
      if (beatPx > 22) barLabels.push({ x, bar: g.bar });
    } else if (isBeat) beatLines += seg;
    else subLines += seg;
  }

  // Missed notes, strokes and lane dots, one path per colour.
  let missed = '';
  for (const g of analysis.grid) {
    if (g.hit || g.t < view.start || g.t > view.end || beatPx / g.n < 5) continue;
    missed += dotPath(xOf(g.t), WAVE_H - 8, 3.5);
  }
  const shade: Record<Status, string> = { good: '', warning: '', critical: '' };
  const lines: Record<Status, string> = { good: '', warning: '', critical: '' };
  const dots: Record<Status, string> = { good: '', warning: '', critical: '' };
  let extra = '';
  const labels: { x: number; text: string }[] = [];
  const showLabels = (span > 0 ? width / span : 0) > 260;
  for (const h of analysis.hits) {
    if (h.t < view.start - 0.05 || h.t > view.end + 0.05) continue;
    const x = xOf(h.t);
    if (h.kind !== 'on') {
      extra += `M${x.toFixed(1)} 18V${WAVE_H}`;
      continue;
    }
    const s = statusOf(h.errorMs, tol);
    const gx = xOf(h.gridT);
    const x0 = Math.min(x, gx);
    const w = Math.max(2, Math.abs(x - gx));
    shade[s] += `M${x0.toFixed(1)} 18h${w.toFixed(1)}V${WAVE_H}h${(-w).toFixed(1)}Z`;
    lines[s] += `M${x.toFixed(1)} 18V${WAVE_H}M${x0.toFixed(1)} 18h${w.toFixed(1)}v4h${(-w).toFixed(1)}Z`;
    dots[s] += dotPath(x, laneY(h.errorMs), 4.5);
    if (showLabels) labels.push({ x, text: `${h.errorMs > 0 ? '+' : h.errorMs < 0 ? '−' : ''}${Math.abs(h.errorMs).toFixed(1)}` });
  }

  const countInX = Math.min(width, xOf(analysis.countInEnd));
  return (
    <Svg width={width} height={HEIGHT} style={{ position: 'absolute', top: 0, left: 0 }}>
      {analysis.countInEnd > view.start ? (
        <>
          <Rect x={0} y={0} width={countInX} height={HEIGHT} fill={colors.surface} />
          {countInX > 70 ? (
            <SvgText x={8} y={13} fontSize={11} fontFamily={FONT} fill={colors.muted}>
              Count-in
            </SvgText>
          ) : null}
        </>
      ) : null}
      {subLines ? <Path d={subLines} stroke={colors['surface-hover']} strokeWidth={1} opacity={0.55} /> : null}
      {beatLines ? <Path d={beatLines} stroke={colors['surface-hover']} strokeWidth={1} /> : null}
      {barLines ? <Path d={barLines} stroke={colors.muted} strokeWidth={1.5} opacity={0.7} /> : null}
      {barLabels.map((b) => (
        <SvgText key={b.bar} x={b.x + 4} y={13} fontSize={11} fontFamily={FONT} fill={colors.muted}>
          {b.bar}
        </SvgText>
      ))}
      <Path d={wave} stroke={colors.foreground} strokeWidth={1} opacity={0.55} />

      <Rect x={0} y={laneY(tol)} width={width} height={laneY(-tol) - laneY(tol)} fill={statusColor.good} opacity={0.12} />
      <Line x1={0} x2={width} y1={WAVE_H + 0.5} y2={WAVE_H + 0.5} stroke={colors['surface-hover']} strokeWidth={1} />
      <Line x1={0} x2={width} y1={laneY(0) + 0.5} y2={laneY(0) + 0.5} stroke={colors.muted} strokeWidth={1} opacity={0.6} />

      {missed ? <Path d={missed} fill="none" stroke={colors.muted} strokeWidth={1.5} /> : null}
      {extra ? <Path d={extra} stroke={colors.muted} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} /> : null}
      {STATUSES.map((s) => (shade[s] ? <Path key={`s${s}`} d={shade[s]} fill={statusColor[s]} opacity={0.22} /> : null))}
      {STATUSES.map((s) => (lines[s] ? <Path key={`l${s}`} d={lines[s]} stroke={statusColor[s]} strokeWidth={2} fill={statusColor[s]} /> : null))}
      {labels.map((l, i) => (
        <SvgText key={i} x={l.x + 4} y={34} fontSize={11} fontFamily={FONT} fill={colors.foreground}>
          {l.text}
        </SvgText>
      ))}
      {STATUSES.map((s) => (dots[s] ? <Path key={`d${s}`} d={dots[s]} fill={statusColor[s]} stroke={colors.background} strokeWidth={2} /> : null))}

      <SvgText x={6} y={WAVE_H + 12} fontSize={10} fontFamily="Geist_400Regular" fill={colors.muted}>
        {`late +${laneRange} ms`}
      </SvgText>
      <SvgText x={6} y={HEIGHT - 4} fontSize={10} fontFamily="Geist_400Regular" fill={colors.muted}>
        {`early −${laneRange} ms`}
      </SvgText>
    </Svg>
  );
});

/** The whole take as a strip, with each stroke's colour along the bottom and the view boxed. */
const OverviewLayer = memo(function OverviewLayer({ analysis, width, amp }: { analysis: Analysis; width: number; amp: number }) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  const n = analysis.overview.length / 2;
  const mid = (OVERVIEW_H - 8) / 2;
  const { duration, toleranceMs: tol } = analysis;
  let wave = '';
  for (let i = 0; i < n; i++) {
    const lo = analysis.overview[i * 2] * amp;
    const hi = analysis.overview[i * 2 + 1] * amp;
    const x = (i / n) * width;
    wave += `M${x.toFixed(1)} ${(mid - hi * mid).toFixed(1)}V${(mid - lo * mid + 1).toFixed(1)}`;
  }
  const ticks: Record<Status, string> = { good: '', warning: '', critical: '' };
  for (const h of analysis.hits) {
    if (h.kind !== 'on') continue;
    ticks[statusOf(h.errorMs, tol)] += `M${((h.t / duration) * width).toFixed(1)} ${OVERVIEW_H - 7}V${OVERVIEW_H}`;
  }
  return (
    <Svg width={width} height={OVERVIEW_H} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Path d={wave} stroke={colors.foreground} strokeWidth={Math.max(1, width / n)} opacity={0.35} />
      {STATUSES.map((s) => (ticks[s] ? <Path key={s} d={ticks[s]} stroke={statusColor[s]} strokeWidth={2} /> : null))}
    </Svg>
  );
});

export function Waveform({
  take,
  analysis,
  detail,
  view,
  setView,
  playhead: shownPlayhead,
  playing,
  onSeek,
  onScrub,
}: {
  take: Take;
  analysis: Analysis;
  detail: Detail;
  view: WaveView;
  setView: (update: (v: WaveView) => WaveView) => void;
  /** Where playback is, or where it will start from when stopped. */
  playhead: number;
  playing: boolean;
  onSeek: (t: number) => void;
  /** Where the playhead is while it's being dragged (null when let go). */
  onScrub?: (t: number | null) => void;
}) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [scrub, setScrubState] = useState<number | null>(null);
  const setScrub = (t: number | null) => {
    setScrubState(t);
    onScrub?.(t);
  };
  const playhead = scrub ?? shownPlayhead;
  const { duration, toleranceMs: tol } = analysis;
  const amp = useMemo(() => {
    let m = 0;
    for (const v of analysis.overview) m = Math.max(m, Math.abs(v));
    return m > 0 ? 0.92 / m : 1;
  }, [analysis]);

  const span = view.end - view.start;
  const w = Math.max(1, width);
  const xOf = (t: number) => ((t - view.start) / span) * w;
  const tOf = (x: number) => Math.max(0, Math.min(duration, view.start + (x / w) * span));

  const nearestHit = (x: number) => {
    let best: Hit | null = null;
    let bestD = 16;
    for (const h of analysis.hits) {
      if (h.kind !== 'on' && h.kind !== 'extra') continue;
      const d = Math.abs(xOf(h.t) - x);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  };

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      setPicked(nearestHit(e.x));
      onSeek(tOf(e.x));
    });
  // Sideways drags only, so an up-and-down drag still scrolls the page.
  // Whether the drag going on started on the playhead (a shared value: the gesture's callbacks
  // aren't render, but the compiler can't tell that about a ref passed into them).
  const scrubbing = useSharedValue(false);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .maxPointers(1)
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart((e) => {
      const grab = Math.abs(e.x - e.translationX - xOf(playhead)) <= GRAB;
      scrubbing.set(grab);
      if (grab) setScrub(tOf(e.x));
    })
    .onChange((e) => {
      if (scrubbing.get()) {
        setScrub(tOf(e.x));
        return;
      }
      const dt = (-e.changeX / w) * span;
      setView((v) => clampView({ start: v.start + dt, end: v.end + dt }, duration));
    })
    .onEnd((e) => {
      if (scrubbing.get()) onSeek(tOf(e.x));
    })
    .onFinalize(() => {
      if (scrubbing.get()) setScrub(null);
      scrubbing.set(false);
    });
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onChange((e) => {
      if (!(e.scaleChange > 0)) return;
      const at = tOf(e.focalX);
      setView((v) => {
        const s = v.end - v.start;
        const ns = Math.min(duration, Math.max(MIN_SPAN, s / e.scaleChange));
        const frac = (at - v.start) / s;
        return clampView({ start: at - frac * ns, end: at - frac * ns + ns }, duration);
      });
    });
  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);

  const overviewAt = (x: number) => Math.max(0, Math.min(duration, (x / w) * duration));
  const centerOn = (t: number) => setView((v) => clampView({ start: t - (v.end - v.start) / 2, end: t + (v.end - v.start) / 2 }, duration));
  const overviewTap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      const t = overviewAt(e.x);
      centerOn(t);
      onSeek(t);
    });
  const overviewPan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onChange((e) => {
      const t = overviewAt(e.x);
      centerOn(t);
      setScrub(t);
    })
    .onEnd((e) => onSeek(overviewAt(e.x)))
    .onFinalize(() => setScrub(null));
  const overviewGesture = Gesture.Race(overviewPan, overviewTap);

  const px = xOf(playhead);
  const vx = (view.start / duration) * w;
  const vw = Math.max(4, (span / duration) * w);

  return (
    <View className="gap-2">
      <GestureDetector gesture={gesture}>
        <View
          onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
          className="overflow-hidden rounded-md"
          style={{ height: HEIGHT, backgroundColor: colors.background }}
          accessibilityLabel="Recording waveform with each stroke coloured by how far it was from the click"
        >
          {width > 0 ? (
            <>
              <WaveLayer take={take} analysis={analysis} detail={detail} view={view} width={width} amp={amp} />
              <Svg width={width} height={HEIGHT} style={{ position: 'absolute', top: 0, left: 0 }}>
                {picked && picked.t >= view.start && picked.t <= view.end ? (
                  <Line x1={xOf(picked.t)} x2={xOf(picked.t)} y1={0} y2={HEIGHT} stroke={colors.foreground} strokeWidth={1} opacity={0.5} />
                ) : null}
                {px >= 0 && px <= width ? (
                  <>
                    <Line x1={px} x2={px} y1={0} y2={HEIGHT} stroke={colors.accent} strokeWidth={2} opacity={playing || scrub !== null ? 1 : 0.7} />
                    <Path d={`M${px - 7} 0H${px + 7}L${px} 10Z`} fill={colors.accent} opacity={playing || scrub !== null ? 1 : 0.7} />
                  </>
                ) : null}
              </Svg>
            </>
          ) : null}
        </View>
      </GestureDetector>

      {picked ? (
        <View className="flex-row items-start gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: colors.background }}>
          {picked.kind === 'on' ? (
            <>
              <View className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor[statusOf(picked.errorMs, tol)] }} />
              <View className="flex-1">
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                  {STATUS_LABEL[statusOf(picked.errorMs, tol)]}: {describeMs(picked.errorMs, tol)}
                </Text>
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  {whereLabel(picked.bar, picked.beat, picked.pos, picked.n)} · {picked.peakDb.toFixed(0)} dB
                </Text>
              </View>
            </>
          ) : (
            <View className="flex-1">
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                Extra stroke
              </Text>
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                A second stroke on {whereLabel(picked.bar, picked.beat, picked.pos, picked.n)} (a flam or a bounce). Not graded.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      <GestureDetector gesture={overviewGesture}>
        <View className="overflow-hidden rounded-md" style={{ height: OVERVIEW_H, backgroundColor: colors.background }} accessibilityLabel="Whole take overview; tap to jump there">
          {width > 0 ? (
            <>
              <OverviewLayer analysis={analysis} width={width} amp={amp} />
              <Svg width={width} height={OVERVIEW_H} style={{ position: 'absolute', top: 0, left: 0 }}>
                <Rect x={vx} y={0} width={vw} height={OVERVIEW_H} fill={colors.accent} opacity={0.14} />
                <Rect x={vx + 1} y={1} width={Math.max(1, vw - 2)} height={OVERVIEW_H - 2} fill="none" stroke={colors.accent} strokeWidth={2} />
                <Rect x={(playhead / duration) * w - 1} y={0} width={2} height={OVERVIEW_H} fill={colors.accent} />
              </Svg>
            </>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}
