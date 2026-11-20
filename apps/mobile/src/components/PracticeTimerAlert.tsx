import { Text, View } from 'react-native';
import { useSyncExternalStore } from 'react';

import { PlayIcon, StopIcon, StopwatchIcon } from '@/components/icons';
import { PillButton } from '@/components/tool/rhythm';
import { getSnapshot, skip, stop, subscribe } from '@/lib/practiceTimerEngine';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * A full-screen "time's up" takeover, mounted once in `_layout.tsx` (a sibling of `Stack`,
 * absolutely covering everything) whenever the running Practice Timer session is `alarming` *and*
 * its `fullScreenAlert` setting is on — the whole point of that setting: interrupt whatever you're
 * doing elsewhere in the app, not just wherever you happen to already be looking. Native sibling
 * of `apps/web/components/PracticeTimerAlert.tsx`.
 *
 * Deliberately not dismissible by tapping the backdrop or a hardware back gesture, unlike
 * `ConfirmDialog`'s own convention — this is meant to be genuinely sticky, like a real alarm clock,
 * until an actual choice is made: Continue (dismiss and move to the next segment — the same thing
 * `skip()` already does everywhere else) or Stop (end the session). The repeating alarm vibration
 * itself is driven entirely by the engine (`lib/practiceTimerEngine.ts`) — this component only
 * reflects state.
 */
export function PracticeTimerAlert() {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const { colors } = useAppTheme();

  if (!state || !state.alarming || !state.fullScreenAlert) return null;

  return (
    <View
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: withAlpha(colors.background, 0.97),
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
      }}
    >
      <StopwatchIcon color={colors.danger} size={56} />
      <View className="items-center gap-1.5">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.danger }}>
          Time&apos;s up
        </Text>
        <Text className="font-ui-semibold text-center text-3xl font-semibold tracking-tight" style={{ color: colors.foreground }}>
          {state.current.title}
        </Text>
        {state.next ? (
          <Text className="text-lg font-ui" style={{ color: colors.muted }}>
            Next: {state.next.title}
          </Text>
        ) : (
          <Text className="text-lg font-ui" style={{ color: colors.muted }}>
            Last step of this session.
          </Text>
        )}
      </View>
      <View className="flex-row flex-wrap items-center justify-center gap-3">
        <PillButton primary label="Continue" Icon={PlayIcon} onPress={skip} />
        <PillButton danger label="Stop" Icon={StopIcon} onPress={stop} />
      </View>
    </View>
  );
}
