import { formatPracticed } from '@jam-practice/core/practiceMinutes';
import { minutesOn, type PracticeLogData } from '@jam-practice/core/practiceLog';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DotsVerticalIcon, PauseIcon, PlayIcon, StopwatchIcon, TrashIcon } from '@/components/icons';
import { GhostIcon, SmallButton, formatStopwatch } from '@/components/shedLog/parts';
import { discardDayTimer, pauseDayTimer, startDayTimer, useDayTimer } from '@/lib/dayStopwatch';
import { getSnapshot as engineState, pause as pauseEngine } from '@/lib/practiceTimerEngine';
import { useNow, useToday } from '@/lib/useClock';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** Pausing the day's practice pauses a routine or task the Practice Timer is running for the Shed
    Log too (otherwise its timing kept going); resuming that run restarts the day timer
    (`ShedLogGlobal`). */
export function pauseDayPractice() {
  pauseDayTimer();
  const run = engineState();
  if (run && !run.paused && run.session.type === 'custom' && run.session.link) pauseEngine();
}

/** A day's whole practice time, ticking while the day timer runs for it. */
export function useDayTimerMs(data: PracticeLogData, date: string): { ms: number; running: boolean; liveMs: number } {
  const timer = useDayTimer();
  const live = timer.running && timer.date === date;
  const now = useNow(live);
  const liveMs = live ? Math.max(0, now - timer.since) : 0;
  return { ms: Math.round(minutesOn(data, date, liveMs) * 60000), running: live, liveMs };
}

/**
 * The day timer card (the website's `DayTimer`): a stopwatch for the day's practice — start it when
 * you sit down to play; starting a routine starts it too, and it keeps going until you pause it.
 * Today's can be started; another day's just shows its time. ⋮ clears a day's time.
 */
export function DayTimerCard({ data, date, compact, onClear }: { data: PracticeLogData; date: string; compact?: boolean; onClear?: () => void }) {
  const { colors, derived } = useAppTheme();
  const { ms, running } = useDayTimerMs(data, date);
  const today = useToday();
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isToday = date === today;
  if (!isToday && ms === 0) return null;
  return (
    <View
      className={`flex-row items-center gap-3 ${compact ? 'rounded-lg px-3 py-2.5' : 'rounded-xl px-4 py-3'}`}
      style={{ backgroundColor: running ? withAlpha(colors.accent, 0.12) : compact ? derived.fill : colors.surface }}
    >
      <StopwatchIcon color={running ? colors.accent : colors.muted} size={20} />
      <View className="flex-1">
        <Text className={`font-ui-semibold font-semibold ${compact ? 'text-lg' : 'text-xl'}`} style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
          {running ? formatStopwatch(ms) : ms ? formatPracticed(ms / 60000) : formatStopwatch(0)}
        </Text>
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          {running ? 'Practiced today · timer running' : isToday ? (ms ? 'Practiced today' : 'Day timer — start it when you sit down to play') : 'Practiced this day'}
        </Text>
      </View>
      {isToday ? (
        running ? (
          <SmallButton label="Pause" Icon={PauseIcon} onPress={pauseDayPractice} />
        ) : (
          <SmallButton label="Start timer" Icon={PlayIcon} primary onPress={startDayTimer} />
        )
      ) : null}
      {onClear && ms > 0 ? <GhostIcon Icon={DotsVerticalIcon} label="Day timer options" onPress={() => setMenu(true)} /> : null}
      <ActionSheet
        visible={menu}
        title="Day timer"
        onClose={() => setMenu(false)}
        actions={[{ key: 'clear', icon: <TrashIcon color={colors.danger} size={20} />, label: "Clear this day's time", danger: true, onPress: () => setConfirming(true) }]}
      />
      <ConfirmDialog
        visible={confirming}
        title="Clear this day's time?"
        message="All the time logged for this day goes: the day timer, time logged by hand, time on tasks and in tools. Tasks you checked off stay checked."
        confirmLabel="Clear time"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          if (running) discardDayTimer();
          onClear?.();
        }}
      />
    </View>
  );
}
