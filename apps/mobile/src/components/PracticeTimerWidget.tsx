import { NAV_LINKS_DATA } from '@jam-practice/core/navLinks';
import { formatClock } from '@jam-practice/core/practiceTimer';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PauseIcon, PlayIcon, SkipForwardIcon, StopIcon, StopwatchIcon } from '@/components/icons';
import { ToolIcon } from '@/components/ui';
import { getSnapshot, pause, resume, skip, stop, subscribe, type EngineState } from '@/lib/practiceTimerEngine';
import { useAppTheme } from '@/theme/ThemeProvider';

const TICK_MS = 250;
const TIMER_LINK = NAV_LINKS_DATA.find((l) => l.href === '/practice-timer');
const TIMER_ROUTE = 'tool/practice-timer';

/**
 * The running Practice Timer, visible everywhere ("I want the time to display its value somewhere
 * fixed on the screen, maybe where the nav bar on the bottom is"), in the two places the playing
 * tools use (`NowPlaying.tsx`):
 *
 * - `PracticeTimerStrip`: on the main screens, a strip docked on top of the tab bar (above the
 *   now-playing strip): the step's name, what's next, the time left, Pause / Skip / Stop. Tap it to
 *   open the timer. Its height is part of `useTabBarHeight`, so pages scroll clear of it. (It
 *   floated as a pill over the page at first, which covered tools' setting chips and looked like a
 *   stray copy of the cards behind it.)
 * - `PracticeTimerHeaderButton`: on every other screen, a small clock in the header, so it never
 *   covers a tool's footer. Not on the Practice Timer's own screen.
 */

/** The strip's height, on top of the tab bar. */
export const PRACTICE_TIMER_STRIP_HEIGHT = 56;

/** Whether a Practice Timer session is running (or paused, or ringing). */
export function usePracticeTimerRunning() {
  return useSyncExternalStore(subscribe, () => getSnapshot() !== null);
}

/** The current step's time left, ticking. */
function useRemainingMs(state: EngineState | null) {
  const [remainingMs, setRemainingMs] = useState(0);
  useEffect(() => {
    // `Date.now()` is only read inside this effect, never during render (React Compiler's purity
    // rule; `PracticeTimerRing.tsx` does the same).
    if (!state) return;
    function tick() {
      if (!state) return;
      if (state.alarming) setRemainingMs(0);
      else if (state.paused) setRemainingMs(state.remainingMsAtPause ?? 0);
      else setRemainingMs(Math.max(0, state.durationMs - (Date.now() - state.startedAt)));
    }
    tick();
    if (state.paused || state.alarming) return;
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [state]);
  return remainingMs;
}

/** On the main screens, docked on top of the tab bar (`FloatingTabBar` renders it). */
export function PracticeTimerStrip() {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const remainingMs = useRemainingMs(state);
  if (!state) return null;
  const tone = state.alarming ? colors.danger : colors.foreground;
  return (
    <Pressable
      onPress={() => router.push('/tool/practice-timer')}
      accessibilityRole="button"
      accessibilityLabel={`Practice Timer: ${state.alarming ? "time's up" : state.current.title}. Open it.`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="flex-row items-center gap-3 pl-4 pr-2"
      style={{ height: PRACTICE_TIMER_STRIP_HEIGHT, borderBottomWidth: 1, borderBottomColor: derived.hairline }}
    >
      {TIMER_LINK ? <ToolIcon tool={TIMER_LINK} size={34} /> : null}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: tone }}>
          {state.alarming ? "Time's up" : state.current.title}
        </Text>
        <Text numberOfLines={1} className="font-ui text-xs" style={{ color: state.paused ? colors.muted : colors.accent }}>
          {state.alarming ? state.current.title : state.paused ? 'Paused' : state.next ? `Next: ${state.next.title}` : state.index > 0 ? 'Last step' : 'Practice Timer'}
        </Text>
      </View>
      <Text className="font-ui-semibold shrink-0 text-base font-semibold tabular-nums" style={{ color: tone }}>
        {formatClock(remainingMs)}
      </Text>
      <View className="flex-row items-center gap-0.5">
        {state.alarming ? (
          <StripButton onPress={skip} label="Continue to the next step">
            <PlayIcon color={colors.foreground} size={16} />
          </StripButton>
        ) : (
          <>
            <StripButton onPress={state.paused ? resume : pause} label={state.paused ? 'Resume' : 'Pause'}>
              {state.paused ? <PlayIcon color={colors.foreground} size={16} /> : <PauseIcon color={colors.foreground} size={16} />}
            </StripButton>
            <StripButton onPress={skip} label="Skip to the next step">
              <SkipForwardIcon color={colors.foreground} size={16} />
            </StripButton>
          </>
        )}
        <StripButton onPress={stop} label="Stop">
          <StopIcon color={colors.danger} size={16} />
        </StripButton>
      </View>
    </Pressable>
  );
}

/** A small round button in the strip. Its own `Pressable`, so a tap here doesn't also open the
    timer. */
function StripButton({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityLabel={label}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-10 w-10 items-center justify-center overflow-hidden rounded-full"
    >
      {children}
    </Pressable>
  );
}

/** In a screen's header (not the Practice Timer's own): the time left, to go back to the timer. */
export function PracticeTimerHeaderButton({ routeName }: { routeName: string }) {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const remainingMs = useRemainingMs(state);
  if (!state || routeName === TIMER_ROUTE) return null;
  const tone = state.alarming ? colors.danger : state.paused ? colors.muted : colors.foreground;
  return (
    <Pressable
      onPress={() => router.push('/tool/practice-timer')}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`Practice Timer: ${state.alarming ? "time's up" : `${formatClock(remainingMs)} left of ${state.current.title}`}. Open it.`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 flex-row items-center gap-1.5 overflow-hidden rounded-full pl-2.5 pr-3"
      style={{ backgroundColor: derived.fill }}
    >
      {state.paused ? (
        <PauseIcon color={colors.muted} size={14} />
      ) : (
        <StopwatchIcon color={state.alarming ? colors.danger : colors.accent} size={16} />
      )}
      <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: tone }}>
        {formatClock(remainingMs)}
      </Text>
    </Pressable>
  );
}
