import { formatClock } from '@jam-practice/core/practiceTimer';
import {
  describeRepeat,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  newSubtask,
  newTask,
  progressOf,
  routineSpan,
  routineStatus,
  scheduleTasks,
  tasksOf,
  type DayRoutine,
  type RoutineTask,
} from '@jam-practice/core/practiceLog';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  CheckIcon,
  CloseIcon,
  DotsVerticalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  SkipForwardIcon,
  StopIcon,
  StopwatchIcon,
} from '@/components/icons';
import { Bar, Field, GhostIcon, RoutineIcon, SmallButton, TaskCheck, routineColor, useSuccess } from '@/components/shedLog/parts';
import { LogTimeSheet, RoutineTimeSheet, type LogTarget } from '@/components/shedLog/sheets';
import { Subtasks } from '@/components/shedLog/Subtasks';
import { pause, resume, skip, stop, type EngineState } from '@/lib/practiceTimerEngine';
import { useNow, useNowCoarse, useToday } from '@/lib/useClock';
import { useRoutineTimer, type PracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** One routine on one day (the website's `RoutineCard`): its tasks to check off (with when each
    one is), Start (runs it on the Practice Timer), a task just for that day, and ⋮ (open, edit,
    set a time, skip, check every task, remove). On a day that's gone, Log time instead of Start. */
export function RoutineCard({ date, item, log }: { date: string; item: DayRoutine; log: PracticeLog }) {
  const { colors } = useAppTheme();
  const success = useSuccess();
  const router = useRouter();
  const { routine, occurrence, added } = item;
  const { engine, startRoutine, runningTask } = useRoutineTimer();
  const today = useToday();
  const past = date < today;
  const color = routineColor(routine.color);
  const { done, total } = progressOf(routine, occurrence);
  const complete = total > 0 && done === total;
  const schedule = scheduleTasks(routine, occurrence);
  const span = routineSpan(routine, occurrence);
  const running = runningTask(routine.id, date);
  const doneSet = new Set(occurrence.done ?? []);
  const allTasks = tasksOf(routine, occurrence);
  const extraIds = new Set((occurrence.extraTasks ?? []).map((t) => t.id));
  const subDone = new Set(occurrence.subDone ?? []);
  const firstOpen = allTasks.find((t) => !doneSet.has(t.id) && t.minutes > 0);
  const skipped = !!occurrence.skipped;
  const timeOverride = occurrence.startTime !== undefined;
  const status = routineStatus(item, date, today);
  const now = useNowCoarse();
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const timeIsNow = !!span && date === today && !skipped && span.start <= nowMin && nowMin < span.end;

  const [menu, setMenu] = useState(false);
  const [timeSheet, setTimeSheet] = useState(false);
  const [logging, setLogging] = useState<{ target: LogTarget; minutes?: number } | null>(null);
  const [confirming, setConfirming] = useState<{ title: string; message: string; label: string; run: () => void } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const setExtra = (fn: (list: RoutineTask[]) => RoutineTask[]) => log.updateOccurrence(date, routine.id, (o) => ({ ...o, extraTasks: fn(o.extraTasks ?? []) }));
  const logTask = (task: RoutineTask) => setLogging({ target: { kind: 'routine', routineId: routine.id, taskId: task.id }, minutes: task.minutes || undefined });
  const open = () => router.push({ pathname: '/tool/shed-log-routine', params: { id: routine.id } });

  const actions: SheetAction[] = [
    { key: 'open', icon: <RepeatIcon color={colors.muted} size={20} />, label: 'Open routine', onPress: open },
    ...(!routine.assigned
      ? [{ key: 'edit', icon: <PencilIcon color={colors.muted} size={20} />, label: 'Edit routine', onPress: () => router.push({ pathname: '/tool/shed-log-routine-edit', params: { id: routine.id } }) }]
      : []),
    { key: 'time', icon: <StopwatchIcon color={colors.muted} size={20} />, label: span ? 'Change the time' : 'Set a time', onPress: () => setTimeSheet(true) },
    ...(timeOverride
      ? [
          {
            key: 'own',
            icon: <StopwatchIcon color={colors.muted} size={20} />,
            label: "Use the routine's own time",
            onPress: () =>
              log.updateOccurrence(date, routine.id, (o) => {
                const n = { ...o };
                delete n.startTime;
                return n;
              }),
          },
        ]
      : []),
    complete
      ? { key: 'all', icon: <CheckIcon color={colors.muted} size={20} />, label: 'Uncheck every task', onPress: () => log.setAllTasks(date, routine.id, false) }
      : { key: 'all', icon: <CheckIcon color={colors.muted} size={20} />, label: 'Check every task', onPress: () => log.setAllTasks(date, routine.id, true) },
    added
      ? {
          key: 'remove',
          icon: <CloseIcon color={colors.danger} size={20} />,
          label: 'Remove from this day',
          danger: true,
          onPress: () => {
            const o = occurrence;
            const hasWork = (o.done?.length ?? 0) > 0 || (o.subDone?.length ?? 0) > 0 || Object.values(o.spentMs ?? {}).some((ms) => ms > 0) || !!o.notes?.trim() || (o.extraTasks?.length ?? 0) > 0;
            const remove = () => log.removeFromDay(date, routine.id);
            if (!hasWork) return remove();
            setConfirming({
              title: 'Remove it from this day?',
              message: `${routine.name || 'This routine'} comes off ${formatShortDate(date)}, with what you checked off, timed and noted for it there.`,
              label: 'Remove',
              run: remove,
            });
          },
        }
      : skipped
        ? { key: 'skip', icon: <SkipForwardIcon color={colors.muted} size={20} />, label: "Don't skip this day", onPress: () => log.updateOccurrence(date, routine.id, (o) => ({ ...o, skipped: false })) }
        : { key: 'skip', icon: <SkipForwardIcon color={colors.muted} size={20} />, label: 'Skip this day', onPress: () => log.updateOccurrence(date, routine.id, (o) => ({ ...o, skipped: true })) },
  ];

  const details = [
    span ? `${formatTime(span.start)} – ${formatTime(span.end)}` : 'Any time',
    formatMinutesShort(allTasks.reduce((s, t) => s + t.minutes, 0)),
    added ? 'Added to this day' : describeRepeat(routine.repeat),
  ];
  const statusText = skipped ? 'Skipped' : status === 'missed' ? 'Missed' : status === 'partial' ? 'Partly done' : null;

  return (
    <View
      className="gap-3 overflow-hidden rounded-xl p-4 pl-5"
      style={{ backgroundColor: colors.surface, opacity: skipped ? 0.6 : 1, borderWidth: timeIsNow ? 2 : 0, borderColor: color }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: color }} />
      <View className="flex-row items-start gap-3">
        <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={`Open ${routine.name || 'routine'}`}>
          <RoutineIcon icon={routine.icon} color={routine.color} size={34} />
        </Pressable>
        <Pressable onPress={open} className="flex-1">
          <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground, textDecorationLine: skipped ? 'line-through' : 'none' }}>
            {routine.name || 'Untitled routine'}
          </Text>
          {routine.assigned ? (
            <Text className="font-ui text-[11px]" style={{ color: colors.muted }}>
              From {routine.assigned.teacher}
            </Text>
          ) : null}
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {details.join(' · ')}
          </Text>
          {statusText ? (
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: status === 'partial' ? colors.foreground : colors.muted }}>
              {statusText}
            </Text>
          ) : null}
        </Pressable>
        <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: complete ? color : 'transparent' }}>
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: complete ? '#ffffff' : colors.muted, fontVariant: ['tabular-nums'] }}>
            {done}/{total}
          </Text>
        </View>
        <View style={{ marginRight: -8, marginTop: -6 }}>
          <GhostIcon Icon={DotsVerticalIcon} label="Routine options" onPress={() => setMenu(true)} />
        </View>
      </View>

      {total > 0 ? <Bar frac={done / total} color={complete ? success : color} height={4} /> : null}

      {!span && !skipped ? (
        <View className="flex-row">
          <SmallButton label="Set a time" Icon={StopwatchIcon} onPress={() => setTimeSheet(true)} />
        </View>
      ) : null}

      {engine && running ? (
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
      ) : !skipped && firstOpen ? (
        <View className="flex-row">
          {past ? (
            <SmallButton label="Log time" Icon={StopwatchIcon} primary onPress={() => logTask(firstOpen)} />
          ) : (
            <SmallButton
              label={done > 0 ? `Continue from ${firstOpen.title || 'the next task'}` : 'Start routine'}
              Icon={PlayIcon}
              tint
              onPress={() => startRoutine(routine, date, done > 0 ? firstOpen.id : undefined, false, occurrence)}
            />
          )}
        </View>
      ) : null}

      {allTasks.length > 0 ? (
        <View>
          {schedule.map(({ task, start }) => {
            const checked = doneSet.has(task.id);
            const spent = occurrence.spentMs?.[task.id];
            const isNow = running === task.id;
            const extra = extraIds.has(task.id);
            return (
              <View key={task.id} className="flex-row items-start gap-1 rounded-lg px-1 py-1" style={{ backgroundColor: isNow ? withAlpha(colors.accent, 0.1) : 'transparent' }}>
                <View className="flex-1">
                  <TaskCheck
                    checked={checked}
                    label={task.title}
                    color={color}
                    badge={extra ? 'Today only' : undefined}
                    onToggle={() => log.toggleTask(date, routine.id, task.id)}
                    meta={[start !== null && formatTime(start), formatMinutesShort(task.minutes), !!spent && `${formatMinutesShort(spent / 60000)} logged`]}
                  />
                  <View style={{ paddingLeft: 36 }}>
                    {checked && !spent && task.minutes > 0 ? (
                      <View className="mt-1 flex-row">
                        <SmallButton
                          label={`+ Log ${formatMinutesShort(task.minutes)}`}
                          onPress={() => log.updateOccurrence(date, routine.id, (o) => ({ ...o, spentMs: { ...(o.spentMs ?? {}), [task.id]: task.minutes * 60000 } }))}
                        />
                      </View>
                    ) : null}
                    <Subtasks
                      items={task.subtasks ?? []}
                      color={color}
                      isDone={(id) => subDone.has(id)}
                      onToggle={(id) =>
                        log.updateOccurrence(date, routine.id, (o) => {
                          const list = o.subDone ?? [];
                          return { ...o, subDone: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
                        })
                      }
                      onAdd={extra ? (title) => setExtra((list) => list.map((t) => (t.id === task.id ? { ...t, subtasks: [...(t.subtasks ?? []), newSubtask(title)] } : t))) : undefined}
                      onRemove={extra ? (id) => setExtra((list) => list.map((t) => (t.id === task.id ? { ...t, subtasks: (t.subtasks ?? []).filter((x) => x.id !== id) } : t))) : undefined}
                    />
                    {task.notes ? (
                      <Text className="font-ui mt-0.5 text-xs" style={{ color: colors.muted }}>
                        {task.notes}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {!skipped && past && !checked ? <GhostIcon Icon={StopwatchIcon} label={`Log time on ${task.title || 'this task'}`} onPress={() => logTask(task)} /> : null}
                {!skipped && !past && task.minutes > 0 && !isNow ? (
                  <GhostIcon Icon={PlayIcon} label={`Time just ${task.title || 'this task'}`} onPress={() => startRoutine(routine, date, task.id, true, occurrence)} />
                ) : null}
                {extra ? (
                  <GhostIcon
                    Icon={CloseIcon}
                    label={`Remove ${task.title || 'this task'} from this day`}
                    onPress={() => {
                      const remove = () => setExtra((list) => list.filter((t) => t.id !== task.id));
                      if (!(occurrence.done ?? []).includes(task.id) && !((occurrence.spentMs ?? {})[task.id] > 0)) return remove();
                      setConfirming({
                        title: 'Remove this task?',
                        message: `"${task.title || 'Task'}" comes off ${routine.name || 'this routine'} for ${formatShortDate(date)}, with the time logged on it.`,
                        label: 'Remove',
                        run: remove,
                      });
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {!skipped ? (
        adding ? (
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Field
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
                placeholder={`A task just for ${date === today ? 'today' : formatShortDate(date)}`}
                onSubmit={() => {
                  if (!newTitle.trim()) return setAdding(false);
                  setExtra((list) => [...list, newTask(newTitle.trim())]);
                  setNewTitle('');
                }}
              />
            </View>
            {newTitle.trim() ? (
              <SmallButton
                label="Add"
                primary
                onPress={() => {
                  setExtra((list) => [...list, newTask(newTitle.trim())]);
                  setNewTitle('');
                }}
              />
            ) : (
              <GhostIcon Icon={CloseIcon} label="Cancel" onPress={() => setAdding(false)} />
            )}
          </View>
        ) : (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" hitSlop={6} className="flex-row items-center gap-1 self-start py-1">
            <PlusIcon color={colors.muted} size={16} />
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
              Task {date === today ? 'just for today' : `just for ${formatShortDate(date)}`}
            </Text>
          </Pressable>
        )
      ) : null}

      {occurrence.notes ? (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          {occurrence.notes}
        </Text>
      ) : null}

      <ActionSheet visible={menu} title={routine.name || 'Untitled routine'} subtitle={formatShortDate(date)} actions={actions} onClose={() => setMenu(false)} />
      <RoutineTimeSheet log={log} date={date} routine={routine} occurrence={occurrence} visible={timeSheet} onClose={() => setTimeSheet(false)} />
      <LogTimeSheet log={log} date={date} initial={logging?.target} initialMinutes={logging?.minutes} visible={!!logging} onClose={() => setLogging(null)} />
      <ConfirmDialog
        visible={!!confirming}
        title={confirming?.title ?? ''}
        message={confirming?.message ?? ''}
        confirmLabel={confirming?.label ?? 'Remove'}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          confirming?.run();
          setConfirming(null);
        }}
      />
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
