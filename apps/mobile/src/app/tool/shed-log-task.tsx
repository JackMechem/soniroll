import { useConvexAuth } from '@convex-dev/auth/react';
import {
  DAY_TASKS_ID,
  describeRepeat,
  formatLongDate,
  formatMinutesShort,
  formatShortDate,
  occursOn,
  type Attachment,
  type DayTask,
  type RoutineTask,
} from '@jam-practice/core/practiceLog';
import { useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { ChevronRightIcon, PencilIcon, PlayIcon, StopwatchIcon } from '@/components/icons';
import { useRecordingPlayer } from '@/components/recordings/RecordingParts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { AttachmentChips } from '@/components/shedLog/Attachments';
import { type FileGroup, LinkedFiles, fileAttachmentsOf } from '@/components/shedLog/LinkedFiles';
import { HistoryRow, PageHeader, PageNotes, Quiet, RecordingList, Rows } from '@/components/shedLog/pageParts';
import { Bar, CalendarIcon, CheckBox, Label, Panel, RoutineIcon, Section, SmallButton, routineColor } from '@/components/shedLog/parts';
import { RecordClip } from '@/components/shedLog/RecordClip';
import { RunningTimer } from '@/components/shedLog/RunningTimer';
import { ShedLogGate } from '@/components/shedLog/ShedLogGate';
import { LogTimeSheet } from '@/components/shedLog/sheets';
import { Subtasks } from '@/components/shedLog/Subtasks';
import { IconButton } from '@/components/ui';
import { useDeviceUrls } from '@/lib/deviceFiles';
import { recordingsApi } from '@/lib/recordings';
import { routineRoute } from '@/lib/shedLogPages';
import { taskNoteTarget, useTaskNoteActions, type TaskPlace } from '@/lib/taskNotes';
import { useToday } from '@/lib/useClock';
import { usePracticeLog, useRoutineTimer } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

const ROUTE = 'tool/shed-log-task';

/**
 * One task's screen (the website's `/shed-log/task`): `?routine=…&task=…` (a task in a routine,
 * `&date=` the Shed Log day it was opened from, else today) or `?date=…&task=…` (a day's own
 * task). The header has its name and one line of facts ("10 min · Every Sunday"), and Edit (the
 * routine's editor). Under it, the routine it belongs to (or its day), which opens it. Then the
 * **day panel** — done or not, the time on it against what's planned, one Start (or the running
 * timer in its place) and Log time, its checklist, and what's attached (the task's own, then ones
 * just for that day) — then its **Notes** (a Shed Note, linked from the routine's notes), the
 * **Recordings** made for it (Record here saves the clip on the task and puts it in the notes), and
 * its **History** (days it was checked off or timed). Opening it doesn't tick it off.
 */
function TaskScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const log = usePracticeLog();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedLogGate header="Shed Log" />;
  if (!log.ready) return <ScreenSpinner />;
  return <Task log={log} />;
}

export default withScreenLoader(TaskScreen);

function Task({ log }: { log: ReturnType<typeof usePracticeLog> }) {
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ routine?: string; task: string; date?: string; from?: string }>();
  const routineId = params.routine || undefined;
  const taskId = params.task ?? '';
  const date = params.date || undefined;
  const today = useToday();
  const bottom = useTabBarSpace(96);
  const { isAuthenticated } = useConvexAuth();
  const { engine, startRoutine, startDayTasks, runningTask } = useRoutineTimer();
  const [logging, setLogging] = useState(false);
  const taskNotes = useTaskNoteActions();
  const player = useRecordingPlayer();

  const routine = routineId ? log.data.routines.find((r) => r.id === routineId) : undefined;
  // A routine's task, or one added to it for a day; else a day's own task.
  const task: RoutineTask | DayTask | undefined = useMemo(() => {
    if (routineId) {
      const own = routine?.tasks.find((t) => t.id === taskId);
      if (own) return own;
      for (const day of Object.values(log.data.days)) {
        const extra = day.routines?.[routineId]?.extraTasks?.find((t) => t.id === taskId);
        if (extra) return extra;
      }
      return undefined;
    }
    return date ? log.data.days[date]?.tasks?.find((t) => t.id === taskId) : undefined;
  }, [routineId, routine, taskId, date, log.data.days]);

  // `useDeviceUrls`: a recording kept on this phone (no storage plan) plays here too.
  const routineRecs = useDeviceUrls(useQuery(recordingsApi.listForRoutine, isAuthenticated && routineId ? { routineId } : 'skip'));
  const dayRecs = useDeviceUrls(useQuery(recordingsApi.listForLogRange, isAuthenticated && !routineId && date ? { from: date, to: date } : 'skip'));
  const recordings = (routineId ? routineRecs : dayRecs)?.filter((r) => r.taskId === taskId);

  // The days it was practiced: checked off or timed.
  const history = useMemo(() => {
    if (!routineId) return [];
    return Object.entries(log.data.days)
      .map(([d, day]) => {
        const occ = day.routines?.[routineId];
        if (!occ) return null;
        const done = occ.done?.includes(taskId) ?? false;
        const ms = occ.spentMs?.[taskId] ?? 0;
        return done || ms > 0 ? { date: d, done, ms } : null;
      })
      .filter((x): x is { date: string; done: boolean; ms: number } => x !== null)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [log.data.days, routineId, taskId]);

  if (!task || (routineId && !routine)) {
    return (
      <View className="flex-1 p-4" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Task' }} />
        <Quiet>That task isn&apos;t there anymore.</Quiet>
      </View>
    );
  }

  const title = task.title || 'Untitled task';
  // The day it's looked at for (the Shed Log's day it was opened from; else today).
  const day = date ?? today;
  const past = day < today;
  const running = runningTask(routineId ?? DAY_TASKS_ID, day) === taskId;
  const occ = routineId ? log.data.days[day]?.routines?.[routineId] : undefined;
  const dayTask = routineId ? undefined : (task as DayTask);
  const checked = routineId ? (occ?.done ?? []).includes(taskId) : !!dayTask?.done;
  const spentMs = (routineId ? occ?.spentMs?.[taskId] : dayTask?.spentMs) ?? 0;
  const color = routine ? routineColor(routine.color) : colors.accent;
  const mark = routine ? '#ffffff' : colors['accent-foreground'];
  const place: TaskPlace = { routineId: routineId ?? null, taskId, date: day, routineName: routine?.name, taskTitle: task.title };
  const openDay = (d: string) => router.dismissTo({ pathname: '/tool/shed-log', params: { date: d } });

  function start() {
    if (routine) {
      if (!occursOn(routine.repeat, day) && !(log.data.days[day]?.added ?? []).includes(routine.id)) log.addToDay(day, routine.id);
      startRoutine(routine, day, taskId, true, occ);
    } else if (date) {
      startDayTasks(date, log.data.days[date]?.tasks ?? [], taskId);
    }
  }
  /** Back to the routine: back when it was opened from there, else its screen for this day. */
  function openRoutine() {
    if (!routineId) return;
    if (params.from === 'routine' && router.canGoBack()) router.back();
    else router.push(routineRoute(routineId, date));
  }

  const toggleDone = () => (routineId ? log.toggleTask(day, routineId, taskId) : log.toggleDayTask(day, taskId));
  const subDone = new Set(routineId ? (occ?.subDone ?? []) : (task.subtasks ?? []).filter((x) => x.done).map((x) => x.id));
  const toggleSub = (id: string) => {
    if (routineId) {
      log.updateOccurrence(day, routineId, (o) => {
        const list = o.subDone ?? [];
        return { ...o, subDone: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
      });
    } else if (dayTask) {
      log.saveDayTask(day, { ...dayTask, subtasks: (dayTask.subtasks ?? []).map((x) => (x.id === id ? { ...x, done: !x.done } : x)) });
    }
  };

  const planned = task.minutes;
  const loggedMin = spentMs / 60000;
  const dayLabel = day === today ? 'today' : `on ${formatShortDate(day)}`;
  const dayAttachments = routineId ? (occ?.taskAttachments?.[taskId] ?? []) : (dayTask?.attachments ?? []);
  const setDayAttachments = (items: Attachment[]) =>
    routineId
      ? log.updateOccurrence(day, routineId, (o) => ({ ...o, taskAttachments: { ...(o.taskAttachments ?? {}), [taskId]: items } }))
      : dayTask && log.saveDayTask(day, { ...dayTask, attachments: items });
  const everyTime = routineId ? (task.attachments ?? []) : [];
  // Files, folders and tags (added on the website): the task's own, then the day's.
  const fileGroups: FileGroup[] = [
    { key: 'own', attachments: fileAttachmentsOf(task.attachments) },
    ...(routineId ? [{ key: 'day', title: day === today ? 'Just for today' : `Just for ${formatShortDate(day)}`, attachments: fileAttachmentsOf(occ?.taskAttachments?.[taskId]) }] : []),
  ];
  const fileCount = fileGroups.reduce((n, g) => n + g.attachments.length, 0);
  const facts = [planned > 0 ? formatMinutesShort(planned) : null, routine ? describeRepeat(routine.repeat) : date ? formatLongDate(date) : null].filter(Boolean).join(' · ');

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <PageHeader
        title={title}
        facts={facts}
        routeName={ROUTE}
        actions={
          routine && !routine.assigned ? (
            <IconButton Icon={PencilIcon} label="Edit this routine and its tasks" onPress={() => router.push({ pathname: '/tool/shed-log-routine-edit', params: { id: routine.id } })} />
          ) : null
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottom, gap: 24 }}>
        <View className="gap-3">
          {/* Where it belongs: the routine (or the day, for a day's own task), which opens it. */}
          <Pressable
            onPress={routine ? openRoutine : () => openDay(day)}
            accessibilityRole="link"
            accessibilityLabel={routine ? `Open the routine ${routine.name || 'Untitled routine'}` : `Open ${formatLongDate(day)} in the Shed Log`}
            android_ripple={{ color: colors['surface-hover'] }}
            className="h-9 flex-row items-center gap-2 self-start overflow-hidden rounded-full pl-1 pr-2.5"
            style={{ backgroundColor: derived.fill, maxWidth: '100%' }}
          >
            {routine ? (
              <RoutineIcon icon={routine.icon} color={routine.color} size={28} />
            ) : (
              <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
                <CalendarIcon color={colors.muted} size={16} />
              </View>
            )}
            <Text numberOfLines={1} className="font-ui-semibold shrink text-sm font-semibold" style={{ color: colors.foreground }}>
              {routine ? routine.name || 'Untitled routine' : formatLongDate(day)}
            </Text>
            <ChevronRightIcon color={colors.muted} size={16} />
          </Pressable>
          {task.notes ? (
            <Text className="font-ui text-[15px] leading-6" style={{ color: colors.foreground }}>
              {task.notes}
            </Text>
          ) : null}
        </View>

        {/* The day: done or not, the time on it, the one way to start it (or the timer while it
            runs), its checklist and what's attached. Everything for practicing it now, in one place. */}
        <Panel style={{ gap: 16 }}>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={toggleDone}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${title} done`}
              hitSlop={8}
            >
              <CheckBox checked={checked} color={color} mark={mark} size={32} />
            </Pressable>
            <View className="flex-1">
              <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                {checked ? `Done ${dayLabel}` : `Not done ${dayLabel} yet`}
              </Text>
              <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                {loggedMin > 0 ? `${formatMinutesShort(Math.max(1, Math.round(loggedMin)))} logged` : 'No time logged'}
                {planned > 0 ? ` · ${formatMinutesShort(planned)} planned` : ''}
              </Text>
            </View>
          </View>
          {planned > 0 ? <Bar frac={loggedMin / planned} color={color} height={6} /> : null}
          {engine && running ? (
            <RunningTimer engine={engine} />
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {!past && planned > 0 ? <SmallButton label={`Start · ${formatMinutesShort(planned)}`} Icon={PlayIcon} primary onPress={start} /> : null}
              <SmallButton label="Log time" Icon={StopwatchIcon} onPress={() => setLogging(true)} />
            </View>
          )}
          {(task.subtasks?.length ?? 0) > 0 ? (
            <View className="gap-1 pt-3" style={{ borderTopWidth: 1, borderTopColor: derived.hairline }}>
              <Label>Checklist</Label>
              <Subtasks items={task.subtasks ?? []} color={color} isDone={(id) => subDone.has(id)} onToggle={toggleSub} />
            </View>
          ) : null}
          <View className="gap-2 pt-3" style={{ borderTopWidth: 1, borderTopColor: derived.hairline }}>
            <Label>Attached</Label>
            <AttachmentChips
              fixed={everyTime}
              items={dayAttachments}
              onChange={setDayAttachments}
              addLabel={routineId ? `Attach for ${day === today ? 'today' : formatShortDate(day)}` : 'Attach'}
            />
          </View>
        </Panel>

        {fileCount > 0 ? (
          <Section title="Files">
            <LinkedFiles groups={fileGroups} />
          </Section>
        ) : null}

        <Section title="Notes">
          <PageNotes target={taskNoteTarget(place)} start={() => taskNotes.startNote(place)} />
        </Section>

        <Section title="Recordings" count={recordings?.length || undefined} action={<RecordClip date={day} routineId={routineId ?? null} taskId={taskId} />}>
          {recordings === undefined ? (
            <View className="h-16 rounded-xl" style={{ backgroundColor: colors.surface }} />
          ) : (
            <RecordingList
              recordings={recordings}
              player={player}
              hidePlace
              empty="No recordings yet. Record one here and it goes in the task's notes too."
              onOpen={(id) => router.push({ pathname: '/recordings/[id]', params: { id } })}
            />
          )}
        </Section>

        {routineId ? (
          <Section title="History" count={history.length || undefined}>
            {history.length === 0 ? (
              <Quiet>Not practiced yet.</Quiet>
            ) : (
              <Rows>
                {history.slice(0, 30).map((h, i) => (
                  <HistoryRow
                    key={h.date}
                    first={i === 0}
                    date={h.date}
                    done={h.done}
                    color={color}
                    right={h.ms > 0 ? formatMinutesShort(Math.max(1, Math.round(h.ms / 60000))) : 'Checked off'}
                    onPress={() => openDay(h.date)}
                  />
                ))}
              </Rows>
            )}
          </Section>
        ) : null}
      </ScrollView>
      <LogTimeSheet
        log={log}
        date={day}
        initial={routineId ? { kind: 'routine', routineId, taskId } : { kind: 'task', taskId }}
        initialMinutes={task.minutes || undefined}
        visible={logging}
        onClose={() => setLogging(false)}
      />
    </View>
  );
}
