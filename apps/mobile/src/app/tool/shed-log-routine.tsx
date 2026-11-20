import { useConvexAuth } from '@convex-dev/auth/react';
import { formatPracticed } from '@jam-practice/core/practiceMinutes';
import {
  describeRepeat,
  formatLongDate,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  nextOccurrences,
  occursOn,
  parseTime,
  progressOf,
  scheduleTasks,
  totalMinutes,
  type Occurrence,
} from '@jam-practice/core/practiceLog';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { PencilIcon, PlayIcon, ShareIcon } from '@/components/icons';
import { Muted, Panel, RoutineIcon, Section, SmallButton, useSuccess } from '@/components/shedLog/parts';
import { RoutineShareSheet } from '@/components/shedLog/RoutineShareSheet';
import { ShedLogGate } from '@/components/shedLog/ShedLogGate';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useToday } from '@/lib/useClock';
import { usePracticeLog, useRoutineTimer } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Time logged on a routine on one day: its tasks' time. */
function minutesFor(occ: Occurrence) {
  return Object.values(occ.spentMs ?? {}).reduce((a, b) => a + b, 0) / 60000;
}

/** One routine (the website's `/shed-log/routine`): what it is and when, Start today, Share and
    Edit, its tasks, the next days it's on, and its history day by day. */
function RoutineScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const log = usePracticeLog();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedLogGate />;
  if (!log.ready) return <ScreenSpinner />;
  return <Routine log={log} />;
}

export default withScreenLoader(RoutineScreen);

function Routine({ log }: { log: ReturnType<typeof usePracticeLog> }) {
  const { colors } = useAppTheme();
  const success = useSuccess();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const { startRoutine, runningTask } = useRoutineTimer();
  const [sharing, setSharing] = useState(false);
  const bottom = useTabBarSpace(96);
  const routine = log.data.routines.find((r) => r.id === id);
  if (!routine) {
    return (
      <View className="flex-1 p-4" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Routine' }} />
        <Panel>
          <Muted>That routine doesn&apos;t exist anymore.</Muted>
        </Panel>
      </View>
    );
  }
  const history = Object.entries(log.data.days)
    .filter(([, day]) => day.routines?.[routine.id])
    .map(([date, day]) => ({ date, occ: day.routines![routine.id] }))
    .filter(({ occ }) => (occ.done?.length ?? 0) > 0 || Object.keys(occ.spentMs ?? {}).length > 0 || occ.notes || occ.skipped)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const completed = history.filter(({ occ }) => {
    const p = progressOf(routine, occ);
    return p.total > 0 && p.done === p.total;
  }).length;
  const minutes = history.reduce((s, h) => s + minutesFor(h.occ), 0);
  const upcoming = nextOccurrences(routine.repeat, today, 6);
  const start = parseTime(routine.startTime);
  const schedule = scheduleTasks(routine);
  const running = runningTask(routine.id, today);
  const openDay = (date: string) => router.dismissTo({ pathname: '/tool/shed-log', params: { date } });

  function startToday() {
    if (!routine) return;
    if (!occursOn(routine.repeat, today) && !(log.data.days[today]?.added ?? []).includes(routine.id)) log.addToDay(today, routine.id);
    startRoutine(routine, today, undefined, false, log.data.days[today]?.routines?.[routine.id]);
    openDay(today);
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: routine.name || 'Untitled routine' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottom, gap: 20 }}>
        <View className="flex-row items-center gap-3">
          <RoutineIcon icon={routine.icon} color={routine.color} size={48} />
          <View className="flex-1 gap-0.5">
            <Text className="font-ui text-sm" style={{ color: colors.muted }}>
              {describeRepeat(routine.repeat)}
              {start !== null ? ` · ${formatTime(start)}` : ''} · {formatMinutesShort(totalMinutes(routine))}
            </Text>
            <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
              {completed} day{completed === 1 ? '' : 's'} completed · {formatPracticed(minutes)} practiced
            </Text>
            {routine.assigned ? (
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                From {routine.assigned.teacher} · they see how it goes
              </Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {!running && routine.tasks.some((t) => t.minutes > 0) ? <SmallButton label="Start today" Icon={PlayIcon} primary onPress={startToday} /> : null}
          <SmallButton label="Share" Icon={ShareIcon} onPress={() => setSharing(true)} />
          {/* A teacher's routine is theirs to change (edits here would be overwritten by theirs). */}
          {!routine.assigned ? <SmallButton label="Edit" Icon={PencilIcon} onPress={() => router.push({ pathname: '/tool/shed-log-routine-edit', params: { id: routine.id } })} /> : null}
        </View>
        {routine.description ? (
          <Text className="font-ui text-[15px] leading-6" style={{ color: colors.foreground }}>
            {routine.description}
          </Text>
        ) : null}

        <Section title="Tasks" count={routine.tasks.length || undefined}>
          <Panel>
            {routine.tasks.length === 0 ? <Muted>No tasks yet — Edit to add some.</Muted> : null}
            {schedule.map(({ task, start: at }, i) => (
              <View key={task.id} className="flex-row gap-3">
                <Text className="font-ui-semibold w-5 text-center text-sm font-semibold" style={{ color: colors.muted }}>
                  {i + 1}
                </Text>
                <View className="flex-1">
                  <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                    {task.title || 'Untitled task'}
                  </Text>
                  <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                    {at !== null ? `${formatTime(at)} · ` : ''}
                    {formatMinutesShort(task.minutes)}
                    {task.subtasks?.length ? ` · ${task.subtasks.length} subtask${task.subtasks.length === 1 ? '' : 's'}` : ''}
                  </Text>
                  {task.notes ? (
                    <Text className="font-ui mt-0.5 text-xs" style={{ color: colors.muted }}>
                      {task.notes}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Panel>
        </Section>

        <Section title="Coming up">
          {upcoming.length === 0 ? (
            <Muted>Nothing coming up{routine.repeat.end ? ` — it ended ${formatShortDate(routine.repeat.end)}` : ''}.</Muted>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {upcoming.map((date) => (
                <SmallButton key={date} label={date === today ? 'Today' : formatShortDate(date)} onPress={() => openDay(date)} />
              ))}
            </View>
          )}
        </Section>

        <Section title="History" count={history.length || undefined}>
          <Panel>
            {history.length === 0 ? <Muted>Nothing logged yet. Check its tasks off or run it on the timer.</Muted> : null}
            {history.slice(0, 60).map(({ date, occ }) => {
              const p = progressOf(routine, occ);
              const done = p.total > 0 && p.done === p.total;
              return (
                <Pressable key={date} onPress={() => openDay(date)} className="flex-row items-center gap-3 py-1">
                  <Text className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
                    {formatLongDate(date)}
                  </Text>
                  <Text className="font-ui text-xs" style={{ color: occ.skipped ? colors.muted : done ? success : colors.muted, fontVariant: ['tabular-nums'] }}>
                    {occ.skipped ? 'Skipped' : `${p.done}/${p.total}${minutesFor(occ) > 0 ? ` · ${formatPracticed(minutesFor(occ))}` : ''}`}
                  </Text>
                </Pressable>
              );
            })}
          </Panel>
        </Section>
      </ScrollView>
      <RoutineShareSheet routine={routine} visible={sharing} onClose={() => setSharing(false)} />
    </View>
  );
}
