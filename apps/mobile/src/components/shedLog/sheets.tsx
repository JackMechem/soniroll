import {
  WEEKDAY_LETTER,
  WEEKDAY_NAMES,
  addDays,
  formatLongDate,
  formatMinutesShort,
  minutesOn,
  newSubtask,
  parseTime,
  routineSpan,
  routinesOn,
  tasksOf,
  timeString,
  todayKey,
  weekdayOf,
  type DayTask,
  type Occurrence,
  type Routine,
} from '@jam-practice/core/practiceLog';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CloseIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { DateInput, MinutesInput, TimeInput } from '@/components/shedLog/inputs';
import { CheckBox, ChoicePill, Field, GhostIcon, Label, Muted, SmallButton, useSuccess } from '@/components/shedLog/parts';
import { Segmented } from '@/components/tool/reward';
import { ToolSheet } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import type { PracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * The Shed Log's dialogs as bottom sheets on the phone: the daily goal, logging time by hand, a
 * one-off task, and a routine's time for a day.
 */

// ---------------------------------------------------------------- the daily goal

const GOAL_PRESETS = [15, 30, 45, 60, 90, 120];
const GOAL_MAX = 240;
const HISTORY = 30;
const clamp = (m: number, min = 5) => Math.max(min, Math.min(GOAL_MAX, Math.round(m / 5) * 5));

/** "Your daily goal" (the website's `GoalDialog`): one goal for every day, or one per weekday
    (0 = a rest day), and the last 30 days drawn against it. Nothing changes until Save. */
export function GoalSheet({ log, visible, onClose }: { log: PracticeLog; visible: boolean; onClose: () => void }) {
  return (
    <ToolSheet visible={visible} onClose={onClose} title="Your daily goal">
      <GoalBody key={visible ? 'open' : 'closed'} log={log} onClose={onClose} />
    </ToolSheet>
  );
}

function GoalBody({ log, onClose }: { log: PracticeLog; onClose: () => void }) {
  const { colors } = useAppTheme();
  const success = useSuccess();
  const { data } = log;
  const byDay = data.prefs.goalByWeekday;
  const perDay = Array.isArray(byDay) && byDay.length === 7;
  const [mode, setMode] = useState<'same' | 'weekday'>(perDay ? 'weekday' : 'same');
  const [daily, setDaily] = useState(data.prefs.dailyGoal > 0 ? data.prefs.dailyGoal : 30);
  const [week, setWeek] = useState<number[]>(perDay ? byDay : Array(7).fill(data.prefs.dailyGoal > 0 ? data.prefs.dailyGoal : 30));
  const [today] = useState(todayKey);
  const [picked, setPicked] = useState<number>(() => weekdayOf(todayKey()));
  const goalFor = (key: string) => (mode === 'same' ? daily : week[weekdayOf(key)]);
  const history = Array.from({ length: HISTORY }, (_, i) => {
    const key = addDays(today, i - HISTORY);
    return { key, minutes: minutesOn(data, key) };
  });
  const withGoal = history.filter((d) => goalFor(d.key) > 0);
  const hits = withGoal.filter((d) => d.minutes >= goalFor(d.key)).length;
  const max = Math.max(60, ...history.map((d) => d.minutes), ...history.map((d) => goalFor(d.key)));
  const weekTotal = mode === 'same' ? daily * 7 : week.reduce((a, b) => a + b, 0);
  const current = mode === 'same' ? daily : week[picked];
  const setCurrent = (m: number) => {
    if (mode === 'same') setDaily(clamp(m));
    else setWeek((w) => w.map((v, i) => (i === picked ? clamp(m, 0) : v)));
  };

  return (
    <>
      <Segmented
        label="Goal"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'same', label: 'Same every day' },
          { value: 'weekday', label: 'By weekday' },
        ]}
      />
      {mode === 'weekday' ? (
        <View className="flex-row gap-1">
          {week.map((m, i) => (
            <Pressable
              key={i}
              onPress={() => setPicked(i)}
              accessibilityLabel={`${WEEKDAY_NAMES[i]}: ${m > 0 ? formatMinutesShort(m) : 'rest day'}`}
              accessibilityState={{ selected: picked === i }}
              className="flex-1 items-center rounded-lg py-1.5"
              style={{ backgroundColor: picked === i ? colors.accent : colors.background }}
            >
              <Text className="font-ui text-xs" style={{ color: picked === i ? colors['accent-foreground'] : colors.muted }}>
                {WEEKDAY_LETTER[i]}
              </Text>
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: picked === i ? colors['accent-foreground'] : colors.foreground, fontVariant: ['tabular-nums'] }}>
                {m > 0 ? (m >= 60 && m % 60 === 0 ? `${m / 60}h` : m) : '–'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className="items-center gap-1">
        {mode === 'weekday' ? <Muted>{WEEKDAY_NAMES[picked]}s</Muted> : null}
        <MinutesInput value={current} min={mode === 'same' ? 5 : 0} max={GOAL_MAX} onChange={setCurrent} />
        <Muted>{current > 0 ? 'a day' : 'a rest day, no goal'}</Muted>
      </View>
      <View className="flex-row flex-wrap justify-center gap-2">
        {mode === 'weekday' ? <ChoicePill label="Rest day" on={current === 0} onPress={() => setCurrent(0)} /> : null}
        {GOAL_PRESETS.map((m) => (
          <ChoicePill key={m} label={formatMinutesShort(m)} on={current === m} onPress={() => setCurrent(m)} />
        ))}
      </View>
      {mode === 'weekday' ? (
        <Pressable onPress={() => setWeek(Array(7).fill(current))} accessibilityRole="button" className="items-center py-1">
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            Use {current > 0 ? formatMinutesShort(current) : 'a rest day'} for every day
          </Text>
        </Pressable>
      ) : null}
      <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-baseline justify-between">
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            Last 30 days
          </Text>
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {formatMinutesShort(weekTotal)} a week
          </Text>
        </View>
        <View className="h-20 flex-row items-end" style={{ gap: 2 }}>
          {history.map((d) => {
            const g = goalFor(d.key);
            const hit = g > 0 && d.minutes >= g;
            return (
              <View key={d.key} className="h-full flex-1 justify-end">
                <View
                  style={{
                    height: `${Math.max(d.minutes > 0 ? 6 : 3, (d.minutes / max) * 100)}%`,
                    borderRadius: 2,
                    backgroundColor: hit ? success : d.minutes > 0 ? withAlpha(colors.accent, 0.5) : withAlpha(colors.foreground, 0.1),
                  }}
                />
                {g > 0 ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: `${(g / max) * 100}%`, height: 2, backgroundColor: withAlpha(colors.foreground, 0.35) }} /> : null}
              </View>
            );
          })}
        </View>
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          {withGoal.length ? `This goal was met on ${hits} of ${withGoal.length} days.` : 'No goal on these days.'}
        </Text>
      </View>
      <Button
        label="Save"
        onPress={() => {
          log.setPrefs(mode === 'same' ? { dailyGoal: daily, goalByWeekday: null } : { goalByWeekday: week, dailyGoal: week[weekdayOf(today)] || daily });
          onClose();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- log time

export type LogTarget = { kind: 'day' } | { kind: 'routine'; routineId: string; taskId: string } | { kind: 'task'; taskId: string };
const QUICK_LOG = [5, 10, 15, 20, 30, 45, 60, 90];
const targetKey = (t: LogTarget) => (t.kind === 'day' ? 'day' : t.kind === 'routine' ? `r:${t.routineId}:${t.taskId}` : `t:${t.taskId}`);

/** Log practice by hand (the website's `LogTimeDialog`) — for when you forgot the timer: how long,
    and on the day as a whole or on one of its tasks (which can be checked off at the same time). */
export function LogTimeSheet({
  log,
  date,
  initial,
  initialMinutes,
  visible,
  onClose,
}: {
  log: PracticeLog;
  date: string;
  initial?: LogTarget;
  initialMinutes?: number;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <ToolSheet visible={visible} onClose={onClose} title={`Log time · ${formatLongDate(date)}`}>
      <LogTimeBody key={visible ? `open:${initial ? targetKey(initial) : 'day'}` : 'closed'} log={log} date={date} initial={initial} initialMinutes={initialMinutes} onClose={onClose} />
    </ToolSheet>
  );
}

function LogTimeBody({ log, date, initial, initialMinutes = 15, onClose }: { log: PracticeLog; date: string; initial?: LogTarget; initialMinutes?: number; onClose: () => void }) {
  const { colors } = useAppTheme();
  const [minutes, setMinutes] = useState(Math.max(1, Math.min(23 * 60 + 59, Math.round(initialMinutes))));
  const [target, setTarget] = useState<LogTarget>(initial ?? { kind: 'day' });
  const [markDone, setMarkDone] = useState(true);
  const items = routinesOn(log.data, date);
  const dayTasks = log.data.days[date]?.tasks ?? [];
  const options: { target: LogTarget; label: string; group?: string }[] = [
    { target: { kind: 'day' }, label: 'The day (no particular task)' },
    ...items.flatMap(({ routine, occurrence }) =>
      tasksOf(routine, occurrence).map((t) => ({ target: { kind: 'routine', routineId: routine.id, taskId: t.id } as LogTarget, label: t.title || 'Task', group: routine.name || 'Routine' })),
    ),
    ...dayTasks.map((t) => ({ target: { kind: 'task', taskId: t.id } as LogTarget, label: t.title, group: 'Tasks for the day' })),
  ];

  function save() {
    if (!minutes) return;
    const ms = minutes * 60000;
    // Everything logged by hand goes on the day timer (the day's total); a task also gets it as its time.
    log.addDayTime(date, ms);
    if (target.kind === 'routine') {
      const { routineId, taskId } = target;
      log.updateOccurrence(date, routineId, (o) => ({
        ...o,
        spentMs: { ...(o.spentMs ?? {}), [taskId]: (o.spentMs?.[taskId] ?? 0) + ms },
        ...(markDone && !(o.done ?? []).includes(taskId) ? { done: [...(o.done ?? []), taskId] } : {}),
      }));
    } else if (target.kind === 'task') {
      const t = dayTasks.find((x) => x.id === target.taskId);
      if (t) log.saveDayTask(date, { ...t, spentMs: (t.spentMs ?? 0) + ms, done: t.done || markDone });
    }
    onClose();
  }

  let lastGroup: string | undefined;
  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        {QUICK_LOG.map((m) => (
          <ChoicePill key={m} label={formatMinutesShort(m)} on={minutes === m} onPress={() => setMinutes(m)} />
        ))}
      </View>
      <MinutesInput value={minutes} min={1} max={23 * 60 + 59} onChange={setMinutes} />
      <View className="gap-1">
        <Label>For</Label>
        <View className="rounded-xl p-1" style={{ backgroundColor: colors.background }}>
          {options.map((o) => {
            const on = targetKey(o.target) === targetKey(target);
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <View key={targetKey(o.target)}>
                {header ? (
                  <Text className="font-ui-semibold px-2 pb-0.5 pt-2 text-xs font-semibold" style={{ color: colors.muted }}>
                    {header}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => setTarget(o.target)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  className="min-h-11 flex-row items-center gap-2.5 rounded-lg px-2"
                  style={{ backgroundColor: on ? colors['surface-hover'] : 'transparent' }}
                >
                  <View
                    className="h-[18px] w-[18px] items-center justify-center rounded-full"
                    style={{ borderWidth: 2, borderColor: on ? colors.accent : withAlpha(colors.foreground, 0.3), backgroundColor: on ? colors.accent : 'transparent' }}
                  >
                    {on ? <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors['accent-foreground'] }} /> : null}
                  </View>
                  <Text numberOfLines={1} className="font-ui flex-1 text-[15px]" style={{ color: colors.foreground }}>
                    {o.label}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
      {target.kind !== 'day' ? (
        <Pressable onPress={() => setMarkDone((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: markDone }} className="flex-row items-center gap-2.5">
          <CheckBox checked={markDone} color={colors.accent} mark={colors['accent-foreground']} size={22} />
          <Text className="font-ui text-[15px]" style={{ color: colors.foreground }}>
            Check the task off too
          </Text>
        </Pressable>
      ) : null}
      <Button label={`Log ${minutes ? formatMinutesShort(minutes) : 'time'}`} onPress={save} disabled={!minutes} />
    </>
  );
}

// ---------------------------------------------------------------- a one-off task

/** Make or edit a one-off task (the website's `TaskDialog`): what, which day, how long, optionally
    when, notes and subtasks. */
export function TaskSheet({
  initial,
  date,
  isNew,
  visible,
  onSave,
  onDelete,
  onClose,
}: {
  initial: DayTask | null;
  date: string;
  isNew: boolean;
  visible: boolean;
  onSave: (task: DayTask, date: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  return (
    <ToolSheet visible={visible && !!initial} onClose={onClose} title={isNew ? 'New task' : 'Edit task'}>
      {initial ? <TaskBody key={initial.id} initial={initial} date={date} isNew={isNew} onSave={onSave} onDelete={onDelete} onClose={onClose} /> : null}
    </ToolSheet>
  );
}

function TaskBody({
  initial,
  date,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  initial: DayTask;
  date: string;
  isNew: boolean;
  onSave: (task: DayTask, date: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const [task, setTask] = useState(initial);
  const [day, setDay] = useState(date);
  const [sub, setSub] = useState('');
  const set = (patch: Partial<DayTask>) => setTask((t) => ({ ...t, ...patch }));
  function save() {
    onSave({ ...task, title: task.title.trim() || 'Practice', subtasks: (task.subtasks ?? []).filter((x) => x.title.trim()) }, day);
    onClose();
  }
  function addSub() {
    if (!sub.trim()) return;
    set({ subtasks: [...(task.subtasks ?? []), newSubtask(sub.trim())] });
    setSub('');
  }
  return (
    <>
      <View className="gap-1.5">
        <Label>What to practice</Label>
        <Field value={task.title} onChangeText={(title) => set({ title })} placeholder="e.g. Transcribe a chorus" autoFocus={isNew && !task.title} />
      </View>
      <View className="gap-1.5">
        <Label>Day</Label>
        <DateInput value={day} onChange={setDay} />
      </View>
      <View className="gap-1.5">
        <Label>How long</Label>
        <MinutesInput value={task.minutes} onChange={(minutes) => set({ minutes })} />
      </View>
      <View className="gap-1.5">
        <Label>When</Label>
        <TimeInput value={task.time} onChange={(time) => set({ time })} allowNone />
      </View>
      <View className="gap-1.5">
        <Label>Subtasks</Label>
        {(task.subtasks ?? []).map((x) => (
          <View key={x.id} className="flex-row items-center gap-2">
            <Text className="font-ui flex-1 text-[15px]" style={{ color: colors.foreground }}>
              {x.title}
            </Text>
            <GhostIcon Icon={CloseIcon} label={`Remove ${x.title}`} onPress={() => set({ subtasks: (task.subtasks ?? []).filter((y) => y.id !== x.id) })} />
          </View>
        ))}
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Field value={sub} onChangeText={setSub} placeholder="Add a subtask" onSubmit={addSub} />
          </View>
          <GhostIcon Icon={PlusIcon} label="Add the subtask" onPress={addSub} color={colors.foreground} />
        </View>
      </View>
      <View className="gap-1.5">
        <Label>Notes</Label>
        <Field value={task.notes ?? ''} onChangeText={(notes) => set({ notes })} placeholder="Notes (optional)" multiline />
      </View>
      <View className="flex-row items-center gap-2">
        {onDelete ? (
          <SmallButton
            label="Delete"
            Icon={TrashIcon}
            danger
            onPress={() => {
              onClose();
              onDelete();
            }}
          />
        ) : null}
        <View className="flex-1" />
        <Button label={isNew ? 'Add task' : 'Save'} onPress={save} />
      </View>
    </>
  );
}

// ---------------------------------------------------------------- a routine's time

/** Some of the routine's tasks have a clock time of their own, so moving its start doesn't move them. */
export function hasFixedTimes(routine: Routine, occurrence: Occurrence = {}): boolean {
  return tasksOf(routine, occurrence).some((t) => parseTime(t.time) !== null);
}

/** When a routine happens (the website's `RoutineTimePicker`): a time just for this day or every
    time it comes round, or any time. */
export function RoutineTimeSheet({
  log,
  date,
  routine,
  occurrence,
  visible,
  onClose,
}: {
  log: PracticeLog;
  date: string;
  routine: Routine;
  occurrence: Occurrence;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <ToolSheet visible={visible} onClose={onClose} title={routineSpan(routine, occurrence) ? 'Change the time' : 'Set a time'}>
      <RoutineTimeBody key={visible ? 'open' : 'closed'} log={log} date={date} routine={routine} occurrence={occurrence} onClose={onClose} />
    </ToolSheet>
  );
}

function RoutineTimeBody({ log, date, routine, occurrence, onClose }: { log: PracticeLog; date: string; routine: Routine; occurrence: Occurrence; onClose: () => void }) {
  const once = routine.repeat.freq === 'once';
  const span = routineSpan(routine, occurrence);
  const [scope, setScope] = useState<'day' | 'always'>('day');
  const [time, setTime] = useState<string | null>(span ? timeString(span.start) : '17:00');
  function apply(t: string | null) {
    if (scope === 'always' || once) {
      log.saveRoutine({ ...routine, startTime: t });
      // The day follows the routine's own time again.
      if (occurrence.startTime !== undefined)
        log.updateOccurrence(date, routine.id, (o) => {
          const n = { ...o };
          delete n.startTime;
          return n;
        });
    } else {
      log.updateOccurrence(date, routine.id, (o) => ({ ...o, startTime: t }));
    }
    onClose();
  }
  return (
    <>
      {!once ? (
        <Segmented
          label="Which days"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'day', label: 'Just this day' },
            { value: 'always', label: 'Every time' },
          ]}
        />
      ) : null}
      <TimeInput value={time} onChange={setTime} />
      <Button label="Save" onPress={() => apply(time)} disabled={time === null} />
      {span && !hasFixedTimes(routine, occurrence) ? <SmallButton label="Make it any time" onPress={() => apply(null)} /> : null}
    </>
  );
}
