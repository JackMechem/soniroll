import { useConvexAuth } from '@convex-dev/auth/react';
import {
  formatMinutesShort,
  formatTime,
  newDayTask,
  progressOf,
  routineSpan,
  routinesOn,
  tasksOf,
} from '@jam-practice/core/practiceLog';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CheckIcon, PlayIcon, PlusIcon } from '@/components/icons';
import { DayTimerCard } from '@/components/shedLog/DayTimer';
import { Bar, CheckBox, Field, Muted, RoutineIcon, SmallButton, routineColor, useSuccess } from '@/components/shedLog/parts';
import { TodaySummary } from '@/components/shedLog/Stats';
import { Card } from '@/components/ui';
import { useToday } from '@/lib/useClock';
import { usePracticeLog, useRoutineTimer } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Home's "Today's practice" (the website's dashboard `TodayPractice`), signed in only: today against
 * the goal and the streak, the day timer, what's on today (routines with their progress and Start /
 * Continue on the timer, the day's own tasks to tick off) and a box to add a task for today. Rows
 * sit straight on the card (no fill of their own).
 */
export function TodayPracticeCard() {
  const { isAuthenticated } = useConvexAuth();
  const log = usePracticeLog();
  const router = useRouter();
  if (!isAuthenticated || !log.ready) return null;
  return (
    <Card title="Today's practice" action={{ label: 'Shed Log', onPress: () => router.navigate('/tool/shed-log') }}>
      <TodayBody log={log} />
    </Card>
  );
}

function TodayBody({ log }: { log: ReturnType<typeof usePracticeLog> }) {
  const { colors } = useAppTheme();
  const success = useSuccess();
  const router = useRouter();
  const today = useToday();
  const { startRoutine, runningTask } = useRoutineTimer();
  const [title, setTitle] = useState('');
  const { data } = log;
  const items = routinesOn(data, today).filter((i) => !i.occurrence.skipped);
  const tasks = data.days[today]?.tasks ?? [];
  const add = () => {
    if (!title.trim()) return;
    log.saveDayTask(today, newDayTask(title.trim()));
    setTitle('');
  };
  return (
    <>
      <TodaySummary data={data} today={today} onGoal={() => router.navigate('/tool/shed-log')} />
      <DayTimerCard data={data} date={today} compact />
      {items.length === 0 && tasks.length === 0 ? (
        <View className="gap-3">
          <Muted>Nothing planned yet. A routine repeats on the days you pick — or just add a task for today.</Muted>
          <View className="flex-row">
            <SmallButton label="Make a routine" Icon={PlusIcon} primary onPress={() => router.push({ pathname: '/tool/shed-log-routine-edit', params: { date: today } })} />
          </View>
        </View>
      ) : null}
      {items.map(({ routine, occurrence }) => {
        const p = progressOf(routine, occurrence);
        const complete = p.total > 0 && p.done === p.total;
        const span = routineSpan(routine, occurrence);
        const doneSet = new Set(occurrence.done ?? []);
        const next = tasksOf(routine, occurrence).find((t) => !doneSet.has(t.id) && t.minutes > 0);
        const running = runningTask(routine.id, today);
        return (
          <View key={routine.id} className="flex-row items-center gap-3 py-1">
            <RoutineIcon icon={routine.icon} color={routine.color} size={32} />
            <Pressable onPress={() => router.navigate({ pathname: '/tool/shed-log', params: { date: today } })} className="flex-1 gap-1">
              <View className="flex-row items-center gap-1.5">
                <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground, flexShrink: 1 }}>
                  {routine.name || 'Routine'}
                </Text>
                {complete ? <CheckIcon color={success} size={16} /> : null}
              </View>
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                {span ? `${formatTime(span.start)} · ` : ''}
                {p.done}/{p.total} tasks{running ? ' · on the timer now' : ''}
              </Text>
              <Bar frac={p.total ? p.done / p.total : 0} color={complete ? success : routineColor(routine.color)} height={4} />
            </Pressable>
            {!complete && next && !running ? (
              <SmallButton label={p.done > 0 ? 'Continue' : 'Start'} Icon={PlayIcon} tint onPress={() => startRoutine(routine, today, p.done > 0 ? next.id : undefined, false, occurrence)} />
            ) : null}
          </View>
        );
      })}
      {tasks.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => log.toggleDayTask(today, t.id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: t.done }}
          accessibilityLabel={t.title}
          android_ripple={{ color: colors['surface-hover'] }}
          className="-mx-2 min-h-11 flex-row items-center gap-3 overflow-hidden rounded-lg px-2 py-2"
        >
          <CheckBox checked={t.done} color={colors.accent} mark={colors['accent-foreground']} size={20} />
          <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: t.done ? colors.muted : colors.foreground, textDecorationLine: t.done ? 'line-through' : 'none' }}>
            {t.title}
          </Text>
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {formatMinutesShort(t.minutes)}
          </Text>
        </Pressable>
      ))}
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Field value={title} onChangeText={setTitle} placeholder="Add a task for today" onSubmit={add} />
        </View>
        {title.trim() ? <SmallButton label="Add" primary onPress={add} /> : null}
      </View>
    </>
  );
}
