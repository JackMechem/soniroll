import { formatClock } from '@jam-practice/core/practiceTimer';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_CONTENT_HEIGHT, useTabBarVisible } from '@/components/FloatingTabBar';
import { PauseIcon, PlayIcon, SkipForwardIcon, StopIcon, StopwatchIcon } from '@/components/icons';
import { getSnapshot, pause, resume, skip, stop, subscribe } from '@/lib/practiceTimerEngine';
import { useAppTheme } from '@/theme/ThemeProvider';

const TICK_MS = 250;

/**
 * "I want the time to display its value somewhere fixed on the screen, maybe where the nav bar on
 * the bottom is" — a floating pill mounted once in `_layout.tsx` (a sibling of `FloatingTabBar`,
 * not inside any one screen), directly above that bar, so it's visible on every page while a
 * Practice Timer session is running — the native sibling of web's own sidebar/mobile-header
 * `PracticeTimerWidget.tsx`, just anchored to this app's own bottom tab bar instead, since that's
 * this app's one piece of chrome that's already visible everywhere. Renders nothing while no
 * session is running.
 */
export function PracticeTimerWidget() {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const tabBarVisible = useTabBarVisible();
  const router = useRouter();
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    // `Date.now()` is only ever read inside this effect, never during render — keeps the
    // component itself pure (a real React-Compiler rule, not just style); see
    // `PracticeTimerRing.tsx`'s own identical reasoning.
    if (!state) return;
    function tick() {
      if (!state) return;
      if (state.alarming) {
        setRemainingMs(0);
        return;
      }
      if (state.paused) {
        setRemainingMs(state.remainingMsAtPause ?? 0);
        return;
      }
      setRemainingMs(Math.max(0, state.durationMs - (Date.now() - state.startedAt)));
    }
    tick();
    if (state.paused || state.alarming) return;
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [state]);

  if (!state) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 24,
        right: 24,
        bottom: insets.bottom + (tabBarVisible ? TAB_BAR_CONTENT_HEIGHT : 0) + 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 5,
      }}
    >
      <Pressable
        onPress={() => router.push('/tool/practice-timer')}
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-row items-center gap-2 overflow-hidden rounded-full py-2 pl-4 pr-2"
        style={{ backgroundColor: colors.surface }}
      >
        <StopwatchIcon color={state.alarming ? colors.danger : colors.accent} size={18} />
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className="font-ui-semibold text-sm font-semibold"
            style={{ color: state.alarming ? colors.danger : colors.foreground }}
          >
            {state.alarming ? "Time's up" : state.current.title}
          </Text>
          {!state.alarming && state.next ? (
            <Text numberOfLines={1} className="text-xs font-ui" style={{ color: colors.muted }}>
              Next: {state.next.title}
            </Text>
          ) : null}
        </View>
        <Text
          className="font-ui-semibold shrink-0 text-base font-semibold tabular-nums"
          style={{ color: state.alarming ? colors.danger : colors.foreground }}
        >
          {formatClock(remainingMs)}
        </Text>
        <View className="flex-row items-center gap-0.5">
          {state.alarming ? (
            <WidgetButton onPress={skip} label="Continue to next segment">
              <PlayIcon color={colors.foreground} size={16} />
            </WidgetButton>
          ) : (
            <>
              <WidgetButton onPress={state.paused ? resume : pause} label={state.paused ? 'Resume' : 'Pause'}>
                {state.paused ? (
                  <PlayIcon color={colors.foreground} size={16} />
                ) : (
                  <PauseIcon color={colors.foreground} size={16} />
                )}
              </WidgetButton>
              <WidgetButton onPress={skip} label="Skip to next segment">
                <SkipForwardIcon color={colors.foreground} size={16} />
              </WidgetButton>
            </>
          )}
          <WidgetButton onPress={stop} label="Stop">
            <StopIcon color={colors.danger} size={16} />
          </WidgetButton>
        </View>
      </Pressable>
    </View>
  );
}

/** A small round control button inside the widget — a sibling `Pressable`, not nested inside the
    outer one, with its own `hitSlop` so a tap here never also triggers the pill's own "open the
    tool" navigation. `onStartShouldSetResponder`-style bubbling isn't a concern in RN the way click
    bubbling is on the web. */
function WidgetButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 w-9 items-center justify-center overflow-hidden rounded-full"
    >
      {children}
    </Pressable>
  );
}
