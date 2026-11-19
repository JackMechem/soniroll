import { useConvexAuth } from '@convex-dev/auth/react';
import {
  ROUTINE_COLORS,
  WEEKDAY_LETTER,
  WEEKDAY_NAMES,
  addMonths,
  describeRepeat,
  formatMinutesShort,
  formatTime,
  isDateKey,
  newRoutine,
  newSubtask,
  newTask,
  parseTime,
  scheduleTasks,
  todayKey,
  totalMinutes,
  weekdayOf,
  type Repeat,
  type RepeatFreq,
  type Routine,
  type RoutineTask,
  type Weekday,
} from '@jam-practice/core/practiceLog';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CloseIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { DateInput, MinutesInput, TimeInput } from '@/components/shedLog/inputs';
import { Field, GhostIcon, Label, Muted, ROUTINE_ICONS, RoutineGlyph, RoutineIcon, SmallButton, routineColor } from '@/components/shedLog/parts';
import { ShedLogGate } from '@/components/shedLog/ShedLogGate';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { Segmented } from '@/components/tool/reward';
import { ToolSheet } from '@/components/tool/SettingChip';
import { Button, Card } from '@/components/ui';
import { usePracticeLog, type PracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

const FREQS: { value: RepeatFreq; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];
const UNIT: Record<RepeatFreq, string> = { once: '', daily: 'day', weekly: 'week', monthly: 'month' };

/** The routine editor (the website's `/shed-log/routine/edit`): `?id=` edits one, `?date=` makes a
    new one starting that day. Name, icon, colour and what it's for; when it repeats, from when,
    until when and at what time; its tasks (minutes, an own time, notes, subtasks; reordered with the
    arrows). Leaving with unsaved changes asks first. */
function EditorScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const log = usePracticeLog();
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  // A new routine keeps one id while the screen is open (a sync mustn't remount the editor).
  const [draftId] = useState(() => newRoutine(todayKey(), 0).id);
  const { colors } = useAppTheme();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedLogGate />;
  if (!log.ready) return <ScreenSpinner />;
  const existing = id ? log.data.routines.find((r) => r.id === id) : undefined;
  if (id && !existing) {
    return (
      <View className="flex-1 p-4" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Edit routine' }} />
        <Muted>That routine doesn&apos;t exist anymore.</Muted>
      </View>
    );
  }
  const initial = existing ?? { ...newRoutine(isDateKey(date) ? date : todayKey(), log.data.routines.length % ROUTINE_COLORS.length), id: draftId };
  return <Editor key={initial.id} initial={initial} isNew={!existing} log={log} />;
}

export default withScreenLoader(EditorScreen);

function Editor({ initial, isNew, log }: { initial: Routine; isNew: boolean; log: PracticeLog }) {
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [r, setR] = useState<Routine>(initial);
  const [start] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [iconsOpen, setIconsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaving, setLeaving] = useState<null | (() => void)>(null);
  const [added, setAdded] = useState<string | null>(null);
  const saved = useRef(false);
  const dirty = JSON.stringify(r) !== JSON.stringify(start);
  const set = (patch: Partial<Routine>) => setR((prev) => ({ ...prev, ...patch }));
  const setRepeat = (patch: Partial<Repeat>) => setR((prev) => ({ ...prev, repeat: { ...prev.repeat, ...patch } }));
  const setTask = (i: number, patch: Partial<RoutineTask>) => setR((prev) => ({ ...prev, tasks: prev.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const moveTask = (i: number, dir: -1 | 1) =>
    setR((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.tasks.length) return prev;
      const tasks = [...prev.tasks];
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      return { ...prev, tasks };
    });

  // Leaving with unsaved changes (Back, the header's back, a swipe) asks first.
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirty || saved.current) return;
      e.preventDefault();
      setLeaving(() => () => navigation.dispatch(e.data.action));
    });
  }, [navigation, dirty]);

  function save() {
    if (!r.name.trim()) {
      setError('Give the routine a name.');
      return;
    }
    if (r.repeat.end && r.repeat.end < r.repeat.start) {
      setError('It ends before it starts.');
      return;
    }
    // A task row left empty is dropped, not saved as "Untitled task".
    const tasks = r.tasks
      .filter((t) => t.title.trim() || t.notes.trim() || (t.subtasks ?? []).some((x) => x.title.trim()) || t.attachments.length > 0)
      .map((t) => ({ ...t, title: t.title.trim(), subtasks: (t.subtasks ?? []).filter((x) => x.title.trim()).map((x) => ({ ...x, title: x.title.trim() })) }));
    log.saveRoutine({ ...r, name: r.name.trim(), tasks });
    saved.current = true;
    router.back();
  }

  const color = routineColor(r.color);
  const schedule = scheduleTasks(r);
  const weekdays = r.repeat.weekdays.length ? r.repeat.weekdays : [weekdayOf(r.repeat.start)];
  const startTime = parseTime(r.startTime);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: isNew ? 'New routine' : 'Edit routine' }} />
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}>
        {error ? (
          <View className="rounded-lg px-3 py-2" style={{ backgroundColor: derived.fill }}>
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.danger }}>
              {error}
            </Text>
          </View>
        ) : null}

        <Card title="Routine">
          <Label>Name</Label>
          <View className="flex-row items-center gap-2">
            <Pressable onPress={() => setIconsOpen(true)} accessibilityRole="button" accessibilityLabel="Pick an icon">
              <RoutineIcon icon={r.icon} color={r.color} size={44} />
            </Pressable>
            <View className="flex-1">
              <Field
                value={r.name}
                onChangeText={(name) => {
                  set({ name });
                  setError(null);
                }}
                placeholder="e.g. Morning warm-up"
                autoFocus={isNew}
              />
            </View>
          </View>
          <Label>What it&apos;s for (optional)</Label>
          <Field value={r.description} onChangeText={(description) => set({ description })} multiline label="What it's for" />
          <Label>Colour</Label>
          <View className="flex-row flex-wrap gap-2.5">
            {ROUTINE_COLORS.map((c, i) => (
              <Pressable
                key={c}
                onPress={() => set({ color: i })}
                accessibilityRole="radio"
                accessibilityLabel={`Colour ${i + 1}`}
                accessibilityState={{ checked: r.color === i }}
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: c }}
              >
                {r.color === i ? <CheckIcon color="#ffffff" size={18} /> : null}
              </Pressable>
            ))}
          </View>
        </Card>

        <Card title="When">
          <Segmented label="Repeats" value={r.repeat.freq} onChange={(freq) => setRepeat({ freq })} options={FREQS} />
          {r.repeat.freq !== 'once' ? (
            <View className="flex-row items-center gap-3">
              <Text className="font-ui text-[15px]" style={{ color: colors.muted }}>
                Every
              </Text>
              <View className="flex-row items-center gap-2">
                <SmallButton label="−" onPress={() => setRepeat({ interval: Math.max(1, r.repeat.interval - 1) })} />
                <Text className="font-ui-semibold min-w-6 text-center text-base font-semibold" style={{ color: colors.foreground }}>
                  {r.repeat.interval}
                </Text>
                <SmallButton label="+" onPress={() => setRepeat({ interval: Math.min(12, r.repeat.interval + 1) })} />
              </View>
              <Text className="font-ui text-[15px]" style={{ color: colors.muted }}>
                {UNIT[r.repeat.freq]}
                {r.repeat.interval === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}
          {r.repeat.freq === 'weekly' ? (
            <View className="flex-row justify-between">
              {WEEKDAY_LETTER.map((letter, i) => {
                const on = weekdays.includes(i as Weekday);
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      const next = on ? weekdays.filter((d) => d !== i) : [...weekdays, i as Weekday];
                      if (next.length) setRepeat({ weekdays: [...next].sort() as Weekday[] });
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={WEEKDAY_NAMES[i]}
                    className="h-10 w-10 items-center justify-center rounded-full"
                    style={{ backgroundColor: on ? color : derived.fill }}
                  >
                    <Text className="font-ui-semibold text-sm font-semibold" style={{ color: on ? '#ffffff' : colors.muted }}>
                      {letter}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Label>{r.repeat.freq === 'once' ? 'On' : 'Starts'}</Label>
          <DateInput value={r.repeat.start} onChange={(s) => setRepeat({ start: s })} />
          {r.repeat.freq !== 'once' ? (
            <>
              <Label>Ends</Label>
              <Segmented
                label="Ends"
                value={r.repeat.end ? 'date' : 'never'}
                onChange={(v) => setRepeat({ end: v === 'never' ? null : (r.repeat.end ?? addMonths(r.repeat.start, 1)) })}
                options={[
                  { value: 'never', label: 'Never' },
                  { value: 'date', label: 'On a date' },
                ]}
              />
              {r.repeat.end ? <DateInput value={r.repeat.end} min={r.repeat.start} onChange={(end) => setRepeat({ end })} /> : null}
            </>
          ) : null}
          <Label>Start time</Label>
          <TimeInput value={r.startTime} onChange={(startTime) => set({ startTime })} allowNone />
          <Muted>
            {describeRepeat(r.repeat)}
            {r.repeat.freq !== 'once' && !r.repeat.end ? ', until you delete it' : ''}
            {startTime !== null ? `, at ${formatTime(startTime)}` : ''}.
          </Muted>
        </Card>

        <Card title="Tasks" detail={r.tasks.length ? formatMinutesShort(totalMinutes(r)) : undefined}>
          {r.tasks.map((task, i) => (
            <TaskEditor
              key={task.id}
              index={i}
              count={r.tasks.length}
              task={task}
              start={schedule[i]?.start ?? null}
              autoFocus={task.id === added}
              onChange={(patch) => setTask(i, patch)}
              onMove={(dir) => moveTask(i, dir)}
              onRemove={() => set({ tasks: r.tasks.filter((_, j) => j !== i) })}
            />
          ))}
          <SmallButton
            label="Add a task"
            Icon={PlusIcon}
            onPress={() => {
              const t = newTask();
              setAdded(t.id);
              set({ tasks: [...r.tasks, t] });
            }}
          />
        </Card>

        {!isNew ? <SmallButton label="Delete routine" Icon={TrashIcon} danger onPress={() => setConfirmDelete(true)} /> : null}
      </ScrollView>

      <View className="flex-row gap-2 px-4 pt-3" style={{ paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopWidth: 1, borderColor: colors['surface-hover'] }}>
        <View className="flex-1">
          <Button label="Cancel" kind="secondary" onPress={() => router.back()} />
        </View>
        <View className="flex-1">
          <Button label={isNew ? 'Make routine' : 'Save'} onPress={save} />
        </View>
      </View>

      <ToolSheet visible={iconsOpen} onClose={() => setIconsOpen(false)} title="Icon">
        <View className="flex-row flex-wrap gap-2">
          {ROUTINE_ICONS.map(({ id, label }) => {
            const on = (r.icon ?? 'note') === id;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  set({ icon: id });
                  setIconsOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={label}
                className="h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: on ? color : colors.background }}
              >
                <RoutineGlyph id={id} color={on ? '#ffffff' : colors.muted} size={24} />
              </Pressable>
            );
          })}
        </View>
      </ToolSheet>
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this routine?"
        message={`${r.name || 'This routine'} and everything checked off, timed and noted for it on every day goes too.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          saved.current = true;
          log.deleteRoutine(r.id);
          router.dismissTo('/tool/shed-log');
        }}
      />
      <ConfirmDialog
        visible={!!leaving}
        title="Leave without saving?"
        message="Your changes to this routine haven't been saved."
        confirmLabel="Leave"
        onCancel={() => setLeaving(null)}
        onConfirm={() => {
          const go = leaving;
          setLeaving(null);
          saved.current = true;
          go?.();
        }}
      />
    </View>
  );
}

function TaskEditor({
  index,
  count,
  task,
  start,
  autoFocus,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  task: RoutineTask;
  start: number | null;
  autoFocus: boolean;
  onChange: (patch: Partial<RoutineTask>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { colors } = useAppTheme();
  const [more, setMore] = useState(!!task.time || !!task.notes || (task.subtasks?.length ?? 0) > 0);
  const [sub, setSub] = useState('');
  const addSub = () => {
    if (!sub.trim()) return;
    onChange({ subtasks: [...(task.subtasks ?? []), newSubtask(sub.trim())] });
    setSub('');
  };
  return (
    <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center gap-2">
        <Text className="font-ui-semibold w-5 text-center text-sm font-semibold" style={{ color: colors.muted }}>
          {index + 1}
        </Text>
        <View className="flex-1">
          <Field value={task.title} onChangeText={(title) => onChange({ title })} placeholder="e.g. Scales in all 12 keys" autoFocus={autoFocus} label={`Task ${index + 1}`} />
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        <View className="flex-1">
          <MinutesInput value={task.minutes} onChange={(minutes) => onChange({ minutes })} step={task.minutes < 5 ? 1 : 5} />
        </View>
        <GhostIcon Icon={ArrowUpIcon} label="Move up" onPress={() => index > 0 && onMove(-1)} color={index > 0 ? colors.foreground : colors['surface-hover']} />
        <GhostIcon Icon={ArrowDownIcon} label="Move down" onPress={() => index < count - 1 && onMove(1)} color={index < count - 1 ? colors.foreground : colors['surface-hover']} />
        <GhostIcon Icon={TrashIcon} label="Remove task" onPress={onRemove} />
      </View>
      {start !== null && !task.time ? <Muted>{`Starts at ${formatTime(start)}, after the task before`}</Muted> : null}
      {more ? (
        <>
          <Label>Its own time (optional)</Label>
          <TimeInput value={task.time} onChange={(time) => onChange({ time })} allowNone noneLabel="After the one before" />
          <Label>Subtasks</Label>
          {(task.subtasks ?? []).map((x) => (
            <View key={x.id} className="flex-row items-center gap-2">
              <Text className="font-ui flex-1 text-[15px]" style={{ color: colors.foreground }}>
                {x.title}
              </Text>
              <GhostIcon Icon={CloseIcon} label={`Remove ${x.title}`} onPress={() => onChange({ subtasks: (task.subtasks ?? []).filter((y) => y.id !== x.id) })} />
            </View>
          ))}
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Field value={sub} onChangeText={setSub} placeholder="Add a subtask" onSubmit={addSub} />
            </View>
            <GhostIcon Icon={PlusIcon} label="Add the subtask" onPress={addSub} color={colors.foreground} />
          </View>
          <Label>Notes</Label>
          <Field value={task.notes} onChangeText={(notes) => onChange({ notes })} placeholder="Notes (optional)" multiline />
        </>
      ) : (
        <Pressable onPress={() => setMore(true)} accessibilityRole="button" hitSlop={6} className="self-start py-1">
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
            Time, subtasks and notes
          </Text>
        </Pressable>
      )}
    </View>
  );
}
