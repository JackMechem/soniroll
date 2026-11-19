import {
  DEFAULT_POMODORO,
  newSegment,
  type PomodoroConfig,
  type PracticeSession,
  type Segment,
} from '@jam-practice/core/practiceTimer';
import { Fragment } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { PlusIcon, TrashIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/** The session editor's own working copy — always keeps both `segments` and `pomodoro` around
    regardless of `type`, so switching the type toggle back and forth doesn't throw away whichever
    half isn't currently shown. Native sibling of the `Draft` type `apps/web/components/
    PracticeTimer.tsx` keeps inline — pulled into its own exported type here since the mobile
    screen and this editor are two separate files. */
export type Draft = {
  /** `null` means this is a brand-new, never-saved session — Save creates instead of updates. */
  id: string | null;
  name: string;
  type: 'custom' | 'pomodoro';
  segments: Segment[];
  pomodoro: PomodoroConfig;
};

export function draftFromSession(session: PracticeSession): Draft {
  return {
    id: session.id,
    name: session.name,
    type: session.type,
    segments: session.type === 'custom' ? session.segments : [newSegment()],
    pomodoro: session.type === 'pomodoro' ? session.pomodoro : { ...DEFAULT_POMODORO },
  };
}

export function blankDraft(): Draft {
  return { id: null, name: '', type: 'custom', segments: [newSegment()], pomodoro: { ...DEFAULT_POMODORO } };
}

/**
 * The create/edit form for a saved session — a native port of `apps/web/components/
 * PracticeTimer.tsx`'s own inline editor, pulled into its own file (the same "a tool's secondary
 * editor gets its own component" split `StructureEditor.tsx` already established for Metronome).
 * Reorder buttons (↑/↓) instead of drag-to-reorder — simplest to get right reliably without a real
 * device to iterate drag-gesture math against, same reasoning as the web version's own original
 * (pre-drag) segment list.
 */
export function PracticeSessionEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const { colors } = useAppTheme();

  function updateSegment(index: number, patch: Partial<Segment>) {
    onChange({ ...draft, segments: draft.segments.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  }

  function moveSegment(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= draft.segments.length) return;
    const segments = [...draft.segments];
    [segments[index], segments[target]] = [segments[target], segments[index]];
    onChange({ ...draft, segments });
  }

  function removeSegment(index: number) {
    const segments = draft.segments.filter((_, i) => i !== index);
    onChange({ ...draft, segments: segments.length > 0 ? segments : [newSegment()] });
  }

  function updatePomodoro(patch: Partial<PomodoroConfig>) {
    onChange({ ...draft, pomodoro: { ...draft.pomodoro, ...patch } });
  }

  function updateWorkTitle(index: number, title: string) {
    const workTitles = draft.pomodoro.workTitles.map((t, i) => (i === index ? title : t));
    updatePomodoro({ workTitles });
  }

  function moveWorkTitle(index: number, dir: -1 | 1) {
    const titles = draft.pomodoro.workTitles;
    const target = index + dir;
    if (target < 0 || target >= titles.length) return;
    const workTitles = [...titles];
    [workTitles[index], workTitles[target]] = [workTitles[target], workTitles[index]];
    updatePomodoro({ workTitles });
  }

  function removeWorkTitle(index: number) {
    updatePomodoro({ workTitles: draft.pomodoro.workTitles.filter((_, i) => i !== index) });
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text className="text-lg font-extrabold font-ui-extrabold" style={{ color: colors.foreground }}>
        {draft.id === null ? 'New session' : 'Edit session'}
      </Text>

      <Field label="Name">
        <TextInput
          value={draft.name}
          onChangeText={(name) => onChange({ ...draft, name })}
          placeholder="e.g. Morning warmup"
          placeholderTextColor={colors.muted}
          className="rounded-xl px-3 py-2.5 text-base font-ui"
          style={{ backgroundColor: colors.surface, color: colors.foreground }}
        />
      </Field>

      <View className="flex-row gap-2">
        {(['custom', 'pomodoro'] as const).map((type) => {
          const selected = draft.type === type;
          return (
            <Pressable
              key={type}
              onPress={() => onChange({ ...draft, type })}
              className="flex-1 items-center rounded-xl py-2.5"
              style={{ backgroundColor: selected ? colors.accent : colors.surface }}
            >
              <Text
                className="text-sm font-bold font-ui-bold"
                style={{ color: selected ? colors['accent-foreground'] : colors.foreground }}
              >
                {type === 'custom' ? 'Custom' : 'Pomodoro'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs leading-4 font-ui" style={{ color: colors.muted }}>
        Custom chains named timers back to back, in order. Pomodoro alternates work intervals with
        breaks automatically, with a longer break every few cycles.
      </Text>

      {draft.type === 'custom' ? (
        <View className="gap-2">
          {draft.segments.map((segment, i) => (
            <View key={segment.id} className="flex-row items-center gap-1.5">
              <TextInput
                value={segment.title}
                onChangeText={(title) => updateSegment(i, { title })}
                placeholder="e.g. Scales"
                placeholderTextColor={colors.muted}
                className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-ui"
                style={{ backgroundColor: colors.surface, color: colors.foreground }}
              />
              <MinutesStepper
                value={segment.minutes}
                min={1}
                max={180}
                onChange={(minutes) => updateSegment(i, { minutes })}
              />
              <RowButton onPress={() => moveSegment(i, -1)} disabled={i === 0} label="Move up">
                ↑
              </RowButton>
              <RowButton onPress={() => moveSegment(i, 1)} disabled={i === draft.segments.length - 1} label="Move down">
                ↓
              </RowButton>
              <RowButton onPress={() => removeSegment(i)} label="Remove segment" danger>
                <TrashIcon color={colors.danger} size={14} />
              </RowButton>
            </View>
          ))}
          <AddRowButton label="Add segment" onPress={() => onChange({ ...draft, segments: [...draft.segments, newSegment()] })} />
        </View>
      ) : (
        <View className="gap-3">
          <LabeledStepper label="Work minutes" value={draft.pomodoro.workMinutes} min={1} max={180} onChange={(workMinutes) => updatePomodoro({ workMinutes })} />

          <View className="gap-1.5 border-t pt-3" style={{ borderColor: colors['surface-hover'] }}>
            <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
              Cycle names (optional)
            </Text>
            <Text className="text-xs leading-4 font-ui" style={{ color: colors.muted }}>
              Names each work cycle in order — e.g. &quot;Scales&quot;, &quot;Chords&quot;,
              &quot;Improv&quot; — repeating if there are more cycles than names. Leave empty to
              just show &quot;Work&quot; every cycle. Breaks aren&apos;t individually nameable.
            </Text>
            {draft.pomodoro.workTitles.map((title, i) => (
              <View key={i} className="flex-row items-center gap-1.5">
                <TextInput
                  value={title}
                  onChangeText={(t) => updateWorkTitle(i, t)}
                  placeholder={`Cycle ${i + 1}`}
                  placeholderTextColor={colors.muted}
                  className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-ui"
                  style={{ backgroundColor: colors.surface, color: colors.foreground }}
                />
                <RowButton onPress={() => moveWorkTitle(i, -1)} disabled={i === 0} label="Move up">
                  ↑
                </RowButton>
                <RowButton onPress={() => moveWorkTitle(i, 1)} disabled={i === draft.pomodoro.workTitles.length - 1} label="Move down">
                  ↓
                </RowButton>
                <RowButton onPress={() => removeWorkTitle(i)} label="Remove cycle name" danger>
                  <TrashIcon color={colors.danger} size={14} />
                </RowButton>
              </View>
            ))}
            <AddRowButton
              label="Add cycle name"
              onPress={() => updatePomodoro({ workTitles: [...draft.pomodoro.workTitles, ''] })}
            />
          </View>

          <LabeledStepper
            label="Short break minutes"
            value={draft.pomodoro.shortBreakMinutes}
            min={1}
            max={60}
            onChange={(shortBreakMinutes) => updatePomodoro({ shortBreakMinutes })}
          />
          <LabeledStepper
            label="Long break minutes"
            value={draft.pomodoro.longBreakMinutes}
            min={1}
            max={60}
            onChange={(longBreakMinutes) => updatePomodoro({ longBreakMinutes })}
          />
          <LabeledStepper
            label="Cycles before long break"
            value={draft.pomodoro.cyclesBeforeLongBreak}
            min={1}
            max={12}
            onChange={(cyclesBeforeLongBreak) => updatePomodoro({ cyclesBeforeLongBreak })}
          />
          <View className="flex-row items-center justify-between gap-2 border-t pt-3" style={{ borderColor: colors['surface-hover'] }}>
            <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
              Keep going indefinitely
            </Text>
            <Switch
              value={draft.pomodoro.totalCycles === null}
              onValueChange={(checked) => updatePomodoro({ totalCycles: checked ? null : DEFAULT_POMODORO.totalCycles })}
              trackColor={{ false: colors.background, true: colors.accent }}
            />
          </View>
          {draft.pomodoro.totalCycles !== null ? (
            <LabeledStepper
              label="Total work cycles"
              value={draft.pomodoro.totalCycles}
              min={1}
              max={99}
              onChange={(totalCycles) => updatePomodoro({ totalCycles })}
            />
          ) : null}
        </View>
      )}

      <View className="flex-row gap-2 pt-2">
        <Pressable
          onPress={onSave}
          disabled={saving}
          className="flex-1 items-center rounded-full py-3"
          style={{ backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}
        >
          <Text className="text-sm font-bold font-ui-bold" style={{ color: colors['accent-foreground'] }}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          className="flex-1 items-center rounded-full py-3"
          style={{ backgroundColor: colors.surface, opacity: saving ? 0.6 : 1 }}
        >
          <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function LabeledStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      <MinutesStepper value={value} min={min} max={max} onChange={onChange} />
    </View>
  );
}

function MinutesStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-1.5">
      <RowButton onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} label="Decrease">
        −
      </RowButton>
      <Text className="min-w-[32px] text-center text-sm font-bold font-ui-bold tabular-nums" style={{ color: colors.foreground }}>
        {value}
      </Text>
      <RowButton onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} label="Increase">
        +
      </RowButton>
    </View>
  );
}

function RowButton({
  onPress,
  disabled,
  label,
  danger,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={label}
      className="h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: colors.surface, opacity: disabled ? 0.4 : 1 }}
    >
      {typeof children === 'string' ? (
        <Text className="text-sm font-bold font-ui-bold" style={{ color: danger ? colors.danger : colors.foreground }}>
          {children}
        </Text>
      ) : (
        <Fragment>{children}</Fragment>
      )}
    </Pressable>
  );
}

function AddRowButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-center gap-1.5 rounded-xl py-2.5"
      style={{ backgroundColor: colors.surface }}
    >
      <PlusIcon color={colors.muted} size={16} />
      <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}
