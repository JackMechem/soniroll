import type { Analysis, Hit } from '@jam-practice/core/timeTestAnalysis';
import { describeMs, fmtTime, signedMs, statusOf, whereLabel, type Status } from '@jam-practice/core/timeTestTiming';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { TextButton } from '@/components/tool/ear';
import { useStatusColors } from '@/components/timeTest/parts';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * The Time Test's results charts on the phone (the website's `Analytics.tsx` charts), drawn with
 * `react-native-svg`: every stroke across the take, how many strokes landed at each offset, and
 * the average offset per beat or per note. A tap picks a stroke or a bar and says what it is under
 * the chart (the website shows it on hover).
 */

const STATUSES: Status[] = ['good', 'warning', 'critical'];
const FONT = 'Geist_400Regular';

/** A small round dot as a path segment, so hundreds of dots are one SVG element per colour. */
export function dotPath(cx: number, cy: number, r: number) {
  return `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

export function useWidth() {
  const [width, setWidth] = useState(0);
  return [width, (w: number) => setWidth(Math.max(0, Math.floor(w)))] as const;
}

function Caption({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

/** What a tapped stroke was, with a way to look at it in the waveform. */
function HitLine({ h, a, onShow }: { h: Hit; a: Analysis; onShow: () => void }) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  return (
    <View className="flex-row items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: colors.background }}>
      <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor[statusOf(h.errorMs, a.toleranceMs)] }} />
      <View className="flex-1">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          {describeMs(h.errorMs, a.toleranceMs)}
        </Text>
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          {whereLabel(h.bar, h.beat, h.pos, h.n)} · {fmtTime(h.t)}
        </Text>
      </View>
      <TextButton label="Show" onPress={onShow} />
    </View>
  );
}

/** Every stroke's offset across the take, with the per-bar average drawn through it. */
export function TimelineChart({ a, range, onJump }: { a: Analysis; range: number; onJump: (t: number) => void }) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  const [width, setWidth] = useWidth();
  const [picked, setPicked] = useState<Hit | null>(null);
  const H = 200;
  const pad = { l: 34, r: 6, t: 10, b: 22 };
  const t0 = Math.max(0, a.countInEnd);
  const t1 = Math.max(t0 + 0.1, a.duration);
  const plotW = Math.max(1, width - pad.l - pad.r);
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * plotW;
  const y = (ms: number) => pad.t + (1 - (Math.max(-range, Math.min(range, ms)) + range) / (2 * range)) * (H - pad.t - pad.b);
  const on = useMemo(() => a.hits.filter((h) => h.kind === 'on'), [a]);
  const bars = a.byBar.filter((b) => b.count > 0);
  const barLen = a.byBar.length > 1 ? a.byBar[1].t - a.byBar[0].t : 0;
  const every = Math.max(1, Math.ceil(a.byBar.length / Math.max(1, Math.floor((width - 50) / 30))));
  const ticks = [-range, -a.toleranceMs, 0, a.toleranceMs, range];

  const dots: Record<Status, string> = { good: '', warning: '', critical: '' };
  if (width) for (const h of on) dots[statusOf(h.errorMs, a.toleranceMs)] += dotPath(x(h.t), y(h.errorMs), 3.2);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      let best: Hit | null = null;
      let bd = 24;
      for (const h of on) {
        const d = Math.hypot(x(h.t) - e.x, (y(h.errorMs) - e.y) * 0.5);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      setPicked(best);
    });

  return (
    <View className="gap-2">
      <GestureDetector gesture={tap}>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H }}>
          {width > 0 ? (
            <Svg width={width} height={H}>
              <Rect x={pad.l} y={y(a.toleranceMs)} width={plotW} height={y(-a.toleranceMs) - y(a.toleranceMs)} fill={statusColor.good} opacity={0.12} />
              {ticks.map((v) => (
                <Line key={`l${v}`} x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? colors.muted : colors['surface-hover']} strokeWidth={1} opacity={v === 0 ? 0.7 : 1} />
              ))}
              {ticks.map((v) => (
                <SvgText key={`t${v}`} x={pad.l - 5} y={y(v) + 3.5} textAnchor="end" fontSize={10} fontFamily={FONT} fill={colors.muted}>
                  {v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}`}
                </SvgText>
              ))}
              {a.byBar.map((b, i) =>
                i % every === 0 ? (
                  <SvgText key={b.label} x={x(b.t)} y={H - 6} textAnchor="middle" fontSize={10} fontFamily={FONT} fill={colors.muted}>
                    {b.label}
                  </SvgText>
                ) : null,
              )}
              <SvgText x={pad.l + 5} y={pad.t + 10} fontSize={10} fontFamily={FONT} fill={colors.muted}>
                late ↑
              </SvgText>
              <SvgText x={pad.l + 5} y={H - pad.b - 4} fontSize={10} fontFamily={FONT} fill={colors.muted}>
                early ↓
              </SvgText>
              {STATUSES.map((s) => (dots[s] ? <Path key={s} d={dots[s]} fill={statusColor[s]} stroke={colors.surface} strokeWidth={1.2} /> : null))}
              {bars.length > 1 ? (
                <Polyline
                  points={bars.map((b) => `${x(b.t + barLen / 2).toFixed(1)},${y(b.meanMs).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={colors.foreground}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {picked ? <Circle cx={x(picked.t)} cy={y(picked.errorMs)} r={6.5} fill="none" stroke={colors.foreground} strokeWidth={2} /> : null}
            </Svg>
          ) : null}
        </View>
      </GestureDetector>
      {picked ? (
        <HitLine h={picked} a={a} onShow={() => onJump(picked.t)} />
      ) : (
        <Caption>Bar number · each dot is a stroke · the line is each bar&apos;s average · tap a dot to look closer</Caption>
      )}
    </View>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, h));
  return `M${x.toFixed(1)},${(y + h).toFixed(1)}V${(y + rr).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x + rr).toFixed(1)},${y.toFixed(1)}H${(x + w - rr).toFixed(1)}Q${(x + w).toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${(y + rr).toFixed(1)}V${(y + h).toFixed(1)}Z`;
}

/** How many strokes landed at each offset. */
export function Histogram({ a, range }: { a: Analysis; range: number }) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  const [width, setWidth] = useWidth();
  const [picked, setPicked] = useState<number | null>(null);
  const H = 160;
  const pad = { l: 6, r: 6, t: 10, b: 20 };
  const errors = a.hits.filter((h) => h.kind === 'on').map((h) => h.errorMs);
  const bin = a.toleranceMs <= 10 ? 2 : Math.max(2, Math.round(a.toleranceMs / 5));
  const nb = Math.ceil(range / bin);
  const counts = new Array<number>(nb * 2).fill(0);
  for (const e of errors) counts[Math.min(nb * 2 - 1, Math.max(0, Math.floor(e / bin) + nb))]++;
  const max = Math.max(1, ...counts);
  const plotW = Math.max(1, width - pad.l - pad.r);
  const bw = plotW / counts.length;
  const x = (ms: number) => pad.l + ((ms + nb * bin) / (2 * nb * bin)) * plotW;
  const ybase = H - pad.b;
  const paths: Record<Status, string> = { good: '', warning: '', critical: '' };
  counts.forEach((c, i) => {
    if (c === 0) return;
    const lo = (i - nb) * bin;
    const h = (c / max) * (H - pad.t - pad.b);
    paths[statusOf(lo + bin / 2, a.toleranceMs)] += roundedTop(pad.l + i * bw + 0.5, ybase - h, Math.max(1, bw - 1), h, Math.min(3, (bw - 1) / 2));
  });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      const i = Math.floor((e.x - pad.l) / bw);
      setPicked(i >= 0 && i < counts.length && counts[i] > 0 ? i : null);
    });

  const pickedText = (() => {
    if (picked === null) return null;
    const lo = (picked - nb) * bin;
    const c = counts[picked];
    const where = picked === 0 ? `≤ ${signedMs(lo + bin, 0)}` : picked === counts.length - 1 ? `≥ ${signedMs(lo, 0)}` : `${signedMs(lo, 0)} to ${signedMs(lo + bin, 0)}`;
    return `${c} stroke${c === 1 ? '' : 's'} · ${where}`;
  })();

  return (
    <View className="gap-2">
      <GestureDetector gesture={tap}>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H }}>
          {width > 0 ? (
            <Svg width={width} height={H}>
              {picked !== null ? <Rect x={pad.l + picked * bw} y={pad.t} width={bw} height={ybase - pad.t} fill={colors.foreground} opacity={0.06} /> : null}
              {STATUSES.map((s) => (paths[s] ? <Path key={s} d={paths[s]} fill={statusColor[s]} /> : null))}
              <Line x1={pad.l} x2={width - pad.r} y1={ybase + 0.5} y2={ybase + 0.5} stroke={colors['surface-hover']} />
              <Line x1={x(0)} x2={x(0)} y1={pad.t} y2={ybase} stroke={colors.muted} strokeDasharray="3 3" />
              {errors.length > 0 ? <Line x1={x(a.stats.meanMs)} x2={x(a.stats.meanMs)} y1={pad.t} y2={ybase} stroke={colors.foreground} strokeWidth={2} /> : null}
              {[-range, -range / 2, 0, range / 2, range].map((v) => (
                <SvgText
                  key={v}
                  x={Math.min(width - pad.r - 10, Math.max(pad.l + 10, x(v)))}
                  y={H - 5}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily={FONT}
                  fill={colors.muted}
                >
                  {v === 0 ? 'click' : `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}`}
                </SvgText>
              ))}
            </Svg>
          ) : null}
        </View>
      </GestureDetector>
      <Caption>{pickedText ?? `Dashed line: the click · solid line: your average (${signedMs(a.stats.meanMs)})`}</Caption>
    </View>
  );
}

/** Average offset per group (beat of the bar, or note within the beat), centred on the click. */
export function Breakdown({ rows, tol, range }: { rows: { label: string; meanMs: number; stdMs: number; count: number }[]; tol: number; range: number }) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  const pct = (ms: number) => 50 + (Math.max(-range, Math.min(range, ms)) / range) * 50;
  return (
    <View className="gap-2">
      {rows.map((r) => (
        <View key={r.label} className="flex-row items-center gap-2.5">
          <Text numberOfLines={1} className="font-ui-semibold w-12 text-sm font-semibold" style={{ color: colors.foreground }}>
            {r.label}
          </Text>
          <View className="h-6 flex-1 rounded-md" style={{ backgroundColor: colors.background }}>
            <View className="absolute" style={{ top: 4, bottom: 4, left: `${pct(-tol)}%`, width: `${pct(tol) - pct(-tol)}%`, backgroundColor: withAlpha(statusColor.good, 0.15) }} />
            <View className="absolute" style={{ top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: colors.muted }} />
            {r.count > 0 ? (
              <>
                <View
                  className="absolute"
                  style={{
                    top: 11.5,
                    height: 1,
                    left: `${pct(r.meanMs - r.stdMs)}%`,
                    width: `${pct(r.meanMs + r.stdMs) - pct(r.meanMs - r.stdMs)}%`,
                    backgroundColor: colors.foreground,
                    opacity: 0.6,
                  }}
                />
                <View
                  className="absolute"
                  style={{
                    top: 6,
                    bottom: 6,
                    left: `${Math.min(50, pct(r.meanMs))}%`,
                    width: `${Math.max(0.8, Math.abs(pct(r.meanMs) - 50))}%`,
                    backgroundColor: statusColor[statusOf(r.meanMs, tol)],
                    borderTopLeftRadius: r.meanMs < 0 ? 4 : 0,
                    borderBottomLeftRadius: r.meanMs < 0 ? 4 : 0,
                    borderTopRightRadius: r.meanMs < 0 ? 0 : 4,
                    borderBottomRightRadius: r.meanMs < 0 ? 0 : 4,
                  }}
                />
              </>
            ) : null}
          </View>
          <Text className="font-ui w-[84px] text-right text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
            {r.count > 0 ? `${signedMs(r.meanMs)} ±${r.stdMs.toFixed(0)}` : 'No strokes'}
          </Text>
        </View>
      ))}
      <View className="flex-row gap-2.5">
        <View className="w-12" />
        <View className="flex-1 flex-row justify-between">
          <Text className="font-ui text-[11px]" style={{ color: colors.muted }}>
            ← early
          </Text>
          <Text className="font-ui text-[11px]" style={{ color: colors.muted }}>
            late →
          </Text>
        </View>
        <View className="w-[84px]" />
      </View>
    </View>
  );
}
