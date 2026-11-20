import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Line, Path, Polygon, Rect } from 'react-native-svg';

import { trace, type LoopRegion, type Peaks } from '@/lib/slowDownerEngine';
import type { Marker } from '@/lib/slowDownerFiles';
import { useAppTheme } from '@/theme/ThemeProvider';

export type WaveView = { start: number; span: number };

/**
 * The Slow Downer's waveform — the touch counterpart of web's `Waveform.tsx`: the visible slice of
 * the file (`view`) drawn as peak columns, played part in accent, with the A–B loop shaded, markers
 * as flagged lines, and the playhead. Gestures replace web's mouse/keyboard controls:
 * **tap** to seek, **drag** to pan, **pinch** to zoom (around your fingers), **long-press** for the
 * menu web puts on right-click (add a marker / play from here / set loop start or end, or — on a
 * marker — go to / delete it).
 */
export function SlowDownerWaveform({
  peaks,
  duration,
  view,
  time,
  loop,
  loopActive,
  markers,
  height,
  onSeek,
  onPan,
  onZoomAt,
  onLongPress,
}: {
  peaks: Peaks | null;
  duration: number;
  view: WaveView;
  time: number;
  loop: LoopRegion | null;
  loopActive: boolean;
  markers: Marker[];
  height: number;
  onSeek: (t: number) => void;
  onPan: (seconds: number) => void;
  onZoomAt: (factor: number, anchor: number) => void;
  onLongPress: (t: number, markerId: string | null) => void;
}) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);

  const span = Math.max(0.001, view.span);
  const timeAt = (x: number) => Math.max(0, Math.min(duration, view.start + (x / Math.max(1, width)) * span));
  const xAt = (t: number) => ((t - view.start) / span) * width;

  // Peak columns for the visible slice, split at the playhead into "played" and "to come".
  const { played, upcoming } = useMemo(() => {
    if (!peaks || !width) return { played: '', upcoming: '' };
    const mid = height / 2;
    const step = 2;
    let a = '';
    let b = '';
    const playX = ((time - view.start) / span) * width;
    for (let x = 0; x < width; x += step) {
      const t0 = view.start + (x / width) * span;
      const t1 = view.start + ((x + step) / width) * span;
      const from = Math.max(0, Math.floor(t0 / peaks.bucketSeconds));
      const to = Math.min(peaks.min.length, Math.max(from + 1, Math.ceil(t1 / peaks.bucketSeconds)));
      let lo = 0;
      let hi = 0;
      for (let i = from; i < to; i++) {
        if (peaks.min[i] < lo) lo = peaks.min[i];
        if (peaks.max[i] > hi) hi = peaks.max[i];
      }
      const y1 = mid - Math.max(0.5, hi * mid * 0.95);
      const y2 = mid - Math.min(-0.5, lo * mid * 0.95);
      const seg = `M${x + 0.5} ${y1.toFixed(1)}V${y2.toFixed(1)}`;
      if (x < playX) a += seg;
      else b += seg;
    }
    return { played: a, upcoming: b };
  }, [peaks, width, height, view.start, span, time]);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      trace('tap');
      onSeek(timeAt(e.x));
    });
  // `changeX`/`scaleChange` are each event's change since the last one.
  // Sideways drags only, so an up-and-down drag still scrolls the page around the waveform.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart(() => trace('pan start'))
    .onChange((e) => onPan((-e.changeX / Math.max(1, width)) * span));
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => trace('pinch start'))
    .onChange((e) => {
      if (e.scaleChange > 0) onZoomAt(1 / e.scaleChange, timeAt(e.focalX));
    });
  const longPress = Gesture.LongPress()
    .runOnJS(true)
    .minDuration(450)
    .onStart((e) => {
      trace('longpress');
      const near = markers.find((m) => Math.abs(xAt(m.time) - e.x) < 18);
      onLongPress(timeAt(e.x), near?.id ?? null);
    });
  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), longPress, tap);

  const inView = (t: number) => t >= view.start && t <= view.start + span;

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface }}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {loop ? (
              <Rect
                x={xAt(loop.start)}
                y={0}
                width={Math.max(1, xAt(loop.end) - xAt(loop.start))}
                height={height}
                fill={colors.accent}
                opacity={loopActive ? 0.18 : 0.07}
              />
            ) : null}
            <Line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke={colors.muted} strokeWidth={1} opacity={0.4} />
            <Path d={upcoming} stroke={colors.muted} strokeWidth={1.4} opacity={0.6} />
            <Path d={played} stroke={colors.accent} strokeWidth={1.4} />
            {loop
              ? [loop.start, loop.end].map((t, i) =>
                  inView(t) ? <Line key={i} x1={xAt(t)} x2={xAt(t)} y1={0} y2={height} stroke={colors.accent} strokeWidth={2} opacity={loopActive ? 1 : 0.45} /> : null,
                )
              : null}
            {markers.map((m) =>
              inView(m.time) ? (
                <Line key={m.id} x1={xAt(m.time)} x2={xAt(m.time)} y1={0} y2={height} stroke={colors.accent} strokeWidth={1} />
              ) : null,
            )}
            {markers.map((m) =>
              inView(m.time) ? (
                <Polygon key={`f${m.id}`} points={`${xAt(m.time)},0 ${xAt(m.time) + 10},5 ${xAt(m.time)},10`} fill={colors.accent} />
              ) : null,
            )}
            {inView(time) ? <Line x1={xAt(time)} x2={xAt(time)} y1={0} y2={height} stroke={colors.foreground} strokeWidth={2} /> : null}
          </Svg>
        ) : null}
      </View>
    </GestureDetector>
  );
}
