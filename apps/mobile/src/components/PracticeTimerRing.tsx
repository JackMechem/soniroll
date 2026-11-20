import { formatClock } from '@jam-practice/core/practiceTimer';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '@/theme/ThemeProvider';

const RING_SIZE = 192;
const RING_RADIUS = 86;
const RING_STROKE = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** Re-renders the ring/label a few times a second — not a real 60fps animation loop. Unlike the
    web version (which mutates an SVG circle's own `style.strokeDashoffset` directly via a ref,
    completely bypassing React), `react-native-svg`'s `Circle` only re-paints through a normal prop
    change, so this uses plain `setState` on an interval instead. A countdown ring doesn't need
    60fps precision to read as smooth — a quarter-second tick is indistinguishable by eye here and
    far cheaper than re-rendering a whole component tree 60 times a second on a phone. */
const TICK_MS = 250;

/**
 * The Practice Timer tool screen's own countdown ring + "M:SS" label, driven directly off the
 * engine's wall-clock (`Date.now()`) `startedAt`/`durationMs` — same `formatClock` the persistent
 * bottom widget (`PracticeTimerWidget.tsx`) uses, so the two can never show different numbers for
 * the same running step.
 */
export function PracticeTimerRing({
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
  const { colors } = useAppTheme();
  const [remainingMs, setRemainingMs] = useState(durationMs);

  useEffect(() => {
    // `Date.now()` is only ever read inside this effect (on mount/dep-change, and on each tick),
    // never during render — the render body below only reads the `remainingMs` state this sets,
    // keeping the component itself pure (a real React-Compiler rule, not just style).
    function tick() {
      if (alarming) {
        setRemainingMs(0);
        return;
      }
      if (paused) {
        setRemainingMs(remainingMsAtPause ?? 0);
        return;
      }
      setRemainingMs(Math.max(0, durationMs - (Date.now() - startedAt)));
    }
    tick();
    if (paused || alarming) return;
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [paused, alarming, startedAt, durationMs, remainingMsAtPause]);

  const fraction = Math.min(1, Math.max(0, 1 - remainingMs / durationMs));
  const dashOffset = RING_CIRCUMFERENCE * fraction;

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }} className="items-center justify-center">
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={colors['surface-hover']}
          strokeWidth={RING_STROKE}
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={alarming ? colors.danger : colors.accent}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
        />
      </Svg>
      <Text
        className="font-ui-semibold text-4xl font-semibold tracking-tight tabular-nums"
        style={{ color: alarming ? colors.danger : colors.foreground }}
      >
        {formatClock(remainingMs)}
      </Text>
    </View>
  );
}
