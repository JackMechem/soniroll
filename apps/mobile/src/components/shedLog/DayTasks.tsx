import {
  addDays,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  newDayTask,
  newSubtask,
  parseTime,
  type DayTask,
} from '@jam-practice/core/practiceLog';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ArrowDownIcon, DotsVerticalIcon, PencilIcon, PlayIcon, StopwatchIcon, TrashIcon } from '@/components/icons';
import { Field, GhostIcon, Muted, Panel, Section, SmallButton, TaskCheck } from '@/components/shedLog/parts';
import { LogTimeSheet, TaskSheet, type LogTarget } from '@/components/shedLog/sheets';
import { Subtasks } from '@/components/shedLog/Subtasks';
import { useToday } from '@/lib/useClock';
import { useRoutineTimer, type PracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** The day's own tasks, outside routines (the website's "Extra tasks"): a quick-add box, a
    checklist, the timer (one task or all), and ⋮ (edit, move to the next day, delete). */
export function DayTasks({ date, log, icon }: { date: string; log: PracticeLog; icon?: React.ReactNode }) {
  const { colors } = useAppTheme();
  const tasks = log.data.days[date]?.tasks ?? [];
  const { engine, startDayTasks, runningTask } = useRoutineTimer();
  const running = runningTask('day', date);
  const today = useToday();
  const past = date < today;
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<{ task: DayTask; isNew: boolean } | null>(null);
  const [menu, setMenu] = useState<DayTask | null>(null);
  const [deleting, setDeleting] = useState<DayTask | null>(null);
  const [logging, setLogging] = useState<{ target: LogTarget; minutes?: number } | null>(null);
  // A task with something on it asks before it goes; a bare one is deleted at once.
  const askDelete = (t: DayTask) => {
    const hasWork = t.done || (t.spentMs ?? 0) > 0 || !!t.notes?.trim() || (t.subtasks?.length ?? 0) > 0 || (t.attachments?.length ?? 0) > 0;
    if (hasWork) setDeleting(t);
    else log.removeDayTask(date, t.id);
  };
  const sorted = [...tasks].sort((a, b) => {
    const ta = parseTime(a.time);
    const tb = parseTime(b.time);
    if (ta !== null && tb !== null) return ta - tb;
    return ta !== null ? -1 : tb !== null ? 1 : 0;
  });
  const open = tasks.filter((t) => !t.done && t.minutes > 0);
  function quickAdd() {
    const t = title.trim();
    if (!t) return;
    log.saveDayTask(date, newDayTask(t));
    setTitle('');
  }

  return (
    <Section
      icon={icon}
      title="Extra tasks"
      count={tasks.length ? `${tasks.filter((t) => t.done).length}/${tasks.length}` : undefined}
      action={open.length > 1 && !running && !past ? <SmallButton label="Start all" Icon={PlayIcon} tint onPress={() => startDayTasks(date, tasks)} /> : undefined}
    >
      <Panel>
        {sorted.length === 0 ? <Muted>One-off things to practice on just this day, outside your routines.</Muted> : null}
        {sorted.map((t) => {
          const isNow = running === t.id;
          const time = parseTime(t.time);
          return (
            <View key={t.id} className="flex-row items-start gap-1 rounded-lg px-1 py-0.5" style={{ backgroundColor: isNow ? withAlpha(colors.accent, 0.1) : 'transparent' }}>
              <View className="flex-1">
                <TaskCheck
                  checked={t.done}
                  label={t.title}
                  color={colors.accent}
                  mark={colors['accent-foreground']}
                  onToggle={() => log.toggleDayTask(date, t.id)}
                  meta={[time !== null && formatTime(time), formatMinutesShort(t.minutes), !!t.spentMs && `${formatMinutesShort(t.spentMs / 60000)} logged`, isNow && engine ? (engine.paused ? 'Paused' : 'Timing') : null]}
                />
                <View style={{ paddingLeft: 36 }}>
                  {t.notes ? (
                    <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                      {t.notes}
                    </Text>
                  ) : null}
                  {t.done && !t.spentMs && t.minutes > 0 ? (
                    <View className="mt-1 flex-row">
                      <SmallButton label={`+ Log ${formatMinutesShort(t.minutes)}`} onPress={() => log.saveDayTask(date, { ...t, spentMs: t.minutes * 60000 })} />
                    </View>
                  ) : null}
                  <Subtasks
                    items={t.subtasks ?? []}
                    color={colors.accent}
                    isDone={(id) => !!t.subtasks?.find((x) => x.id === id)?.done}
                    onToggle={(id) => log.saveDayTask(date, { ...t, subtasks: (t.subtasks ?? []).map((x) => (x.id === id ? { ...x, done: !x.done } : x)) })}
                    onAdd={(sub) => log.saveDayTask(date, { ...t, subtasks: [...(t.subtasks ?? []), newSubtask(sub)] })}
                    onRemove={(id) => log.saveDayTask(date, { ...t, subtasks: (t.subtasks ?? []).filter((x) => x.id !== id) })}
                  />
                </View>
              </View>
              {!t.done && !isNow ? (
                past ? (
                  <GhostIcon Icon={StopwatchIcon} label={`Log time on ${t.title}`} onPress={() => setLogging({ target: { kind: 'task', taskId: t.id }, minutes: t.minutes || undefined })} />
                ) : t.minutes > 0 ? (
                  <GhostIcon Icon={PlayIcon} label={`Time ${t.title}`} onPress={() => startDayTasks(date, tasks, t.id)} />
                ) : null
              ) : null}
              <GhostIcon Icon={DotsVerticalIcon} label="Task options" onPress={() => setMenu(t)} />
            </View>
          );
        })}
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Field value={title} onChangeText={setTitle} placeholder="Add an extra task" onSubmit={quickAdd} />
          </View>
          {title.trim() ? (
            <SmallButton label="Add" primary onPress={quickAdd} />
          ) : (
            <SmallButton label="Details" onPress={() => setEditing({ task: newDayTask(''), isNew: true })} />
          )}
        </View>
      </Panel>
      <TaskSheet
        initial={editing?.task ?? null}
        date={date}
        isNew={!!editing?.isNew}
        visible={!!editing}
        onSave={(task, to) => log.moveDayTask(date, to, task)}
        onDelete={editing && !editing.isNew ? () => askDelete(editing.task) : undefined}
        onClose={() => setEditing(null)}
      />
      <ActionSheet
        visible={!!menu}
        title={menu?.title || 'Task'}
        onClose={() => setMenu(null)}
        actions={
          menu
            ? [
                { key: 'edit', icon: <PencilIcon color={colors.muted} size={20} />, label: 'Edit', onPress: () => setEditing({ task: menu, isNew: false }) },
                { key: 'move', icon: <ArrowDownIcon color={colors.muted} size={20} />, label: 'Move to the next day', onPress: () => log.moveDayTask(date, addDays(date, 1), { ...menu, done: false }) },
                { key: 'delete', icon: <TrashIcon color={colors.danger} size={20} />, label: 'Delete', danger: true, onPress: () => askDelete(menu) },
              ]
            : []
        }
      />
      <ConfirmDialog
        visible={!!deleting}
        title="Delete this task?"
        message={`"${deleting?.title || 'Task'}" comes off ${formatShortDate(date)}, along with anything logged or noted on it.`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) log.removeDayTask(date, deleting.id);
          setDeleting(null);
        }}
      />
      <LogTimeSheet log={log} date={date} initial={logging?.target} initialMinutes={logging?.minutes} visible={!!logging} onClose={() => setLogging(null)} />
    </Section>
  );
}
