import { formatDuration } from '@jam-practice/core/trainerUtils';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

const TICK_MS = 100;

/**
 * The native sibling of `apps/web/components/CountdownLabel.tsx` — a ticking "2s" readout counting
 * down to zero. Re-renders via `setState` on an interval rather than the web version's direct-DOM
 * rAF write, same tradeoff as `CountdownRing.tsx`. `textClassName`/`color` default to a small muted
 * caption but can be overridden — added after two independent trainer ports (Note/Scale Trainer)
 * both tried wrapping this in a styled parent `<Text>` expecting it to inherit size/color, which
 * doesn't work in React Native (a nested `<Text>` with its own explicit `className`/`style` always
 * wins over an ancestor's) — passing the real desired look straight through is the actual fix.
 */
export function CountdownLabel({
  active,
  startedAt,
  durationMs,
  textClassName,
  color,
}: {
  active: boolean;
  startedAt: number;
  durationMs: number;
  textClassName?: string;
  color?: string;
}) {
  const { colors } = useAppTheme();
  const [remainingMs, setRemainingMs] = useState(durationMs);

  useEffect(() => {
    // `Date.now()` is only ever read here, inside the effect — never during render. See
    // `CountdownRing.tsx`'s own comment on the same pattern.
    if (!active) return;
    function tick() {
      setRemainingMs(Math.max(0, durationMs - (Date.now() - startedAt)));
    }
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [active, startedAt, durationMs]);

  if (!active) return null;

  return (
    <Text className={textClassName ?? 'text-sm font-ui tabular-nums'} style={{ color: color ?? colors.muted }}>
      {Math.ceil(remainingMs / 1000)}s
    </Text>
  );
}

/** The native sibling of `apps/web/components/ElapsedTimer.tsx` — a ticking "0:07.3" readout while
    a session runs, same `formatDuration` the web version uses. Same `textClassName`/`color`
    override shape as `CountdownLabel`, for the same reason. */
export function ElapsedTimer({
  active,
  startedAt,
  textClassName,
  color,
}: {
  active: boolean;
  startedAt: number | null;
  textClassName?: string;
  color?: string;
}) {
  const { colors } = useAppTheme();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active || startedAt === null) return;
    function tick() {
      setElapsedMs(Date.now() - (startedAt as number));
    }
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [active, startedAt]);

  if (!active || startedAt === null) return null;

  return (
    <Text className={textClassName ?? 'text-sm font-ui tabular-nums'} style={{ color: color ?? colors.muted }}>
      {formatDuration(elapsedMs)}
    </Text>
  );
}
