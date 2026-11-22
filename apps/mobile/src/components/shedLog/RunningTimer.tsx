import { formatClock } from '@jam-practice/core/practiceTimer';
import { Text, View } from 'react-native';

import { PauseIcon, PlayIcon, SkipForwardIcon, StopIcon } from '@/components/icons';
import { GhostIcon } from '@/components/shedLog/parts';
import { pause, resume, skip, stop, type EngineState } from '@/lib/practiceTimerEngine';
import { useNow } from '@/lib/useClock';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** What the Practice Timer is running for a routine (or one of its tasks): the time left, the task
    now and next, and pause / skip / stop (the website's `RunningTimer`). On a routine's card while
    it runs, and in a task's day panel in place of Start. */
export function RunningTimer({ engine }: { engine: EngineState }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-3 rounded-lg p-3" style={{ backgroundColor: colors.background }}>
      <RunClock engine={engine} />
      <View className="flex-1">
        <Text className="font-ui-semibold text-xs font-semibold" style={{ color: engine.alarming ? colors.danger : colors.muted }}>
          {engine.alarming ? "Time's up" : engine.paused ? 'Paused' : 'Now'}
        </Text>
        <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
          {engine.current.title}
        </Text>
        <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
          {engine.next ? `Next: ${engine.next.title}` : 'Last task'}
        </Text>
      </View>
      {engine.alarming ? (
        <GhostIcon Icon={PlayIcon} label="Continue" onPress={skip} color={colors.accent} size={22} />
      ) : engine.paused ? (
        <GhostIcon Icon={PlayIcon} label="Resume" onPress={resume} color={colors.accent} size={22} />
      ) : (
        <GhostIcon Icon={PauseIcon} label="Pause" onPress={pause} color={colors.foreground} size={22} />
      )}
      {!engine.alarming ? <GhostIcon Icon={SkipForwardIcon} label="Skip — don't check it off" onPress={skip} color={colors.foreground} size={22} /> : null}
      <GhostIcon Icon={StopIcon} label="Stop" onPress={stop} color={colors.danger} size={22} />
    </View>
  );
}

/** The running task's time left, ticking. */
function RunClock({ engine }: { engine: EngineState }) {
  const { colors } = useAppTheme();
  const now = useNow(!engine.paused && !engine.alarming);
  const left = engine.alarming ? 0 : engine.paused ? (engine.remainingMsAtPause ?? 0) : Math.max(0, engine.durationMs - (now - engine.startedAt));
  return (
    <View className="h-12 min-w-[60px] items-center justify-center rounded-lg px-2" style={{ backgroundColor: engine.alarming ? withAlpha(colors.danger, 0.14) : withAlpha(colors.accent, 0.12) }}>
      <Text className="font-ui-bold text-lg font-bold" style={{ color: engine.alarming ? colors.danger : colors.accent, fontVariant: ['tabular-nums'] }}>
        {formatClock(left)}
      </Text>
    </View>
  );
}
