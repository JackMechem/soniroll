import {
  DEFAULT_POMODORO,
  newSegment,
  type PomodoroConfig,
  type PracticeSession,
  type Segment,
} from '@jam-practice/core/practiceTimer';
import { Fragment, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { OptionGroup, Segmented } from '@/components/tool/reward';
import { OptionLabel } from '@/components/tool/rhythm';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** The session editor's own working copy — always keeps both `segments` and `pomodoro` around
    regardless of `type`, so switching the type toggle back and forth doesn't throw away whichever
    half isn't currently shown. */
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

const MAX_CYCLES = 24;

/** How many cycle names there are slots for: one per work cycle, or, when it keeps going, one per
    cycle in a round (names repeat after each long break). Same as the website's `PomodoroEditor`. */
function nameSlots(config: PomodoroConfig) {
  return config.totalCycles ?? config.cyclesBeforeLongBreak;
}

/** Keeps `workTitles` to exactly the cycles that exist and drops trailing blanks (the website's
    `normalizePomodoro`). */
function normalizePomodoro(config: PomodoroConfig): PomodoroConfig {
  const titles = config.workTitles.slice(0, nameSlots(config));
  while (titles.length && !titles[titles.length - 1].trim()) titles.pop();
  return { ...config, workTitles: titles };
}

function formatTotal(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/**
 * The create/edit page for a saved session, like the website's session editor
 * (`apps/web/components/PracticeTimer.tsx` and `PomodoroEditor.tsx`): a name, Custom / Pomodoro,
 * then either the list of segments (each with its minutes, moved with ↑ ↓) or the Pomodoro's timing
 * cards, cycles, one optional name per cycle and a preview of the run; Save and Cancel at the end.
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
  const { colors, derived } = useAppTheme();

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

  const input = 'font-ui h-11 rounded-lg px-3 text-[15px]';

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
      <Text className="font-ui-bold text-xl font-bold" style={{ color: colors.foreground }}>
        {draft.id === null ? 'New session' : 'Edit session'}
      </Text>

      <OptionGroup title="Name">
        <TextInput
          value={draft.name}
          onChangeText={(name) => onChange({ ...draft, name })}
          placeholder="e.g. Morning warmup"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Session name"
          className={input}
          style={{ backgroundColor: derived.fill, color: colors.foreground }}
        />
      </OptionGroup>

      <View className="gap-2.5">
        <OptionLabel
          title="Type"
          hint="Custom chains named timers back to back, in order. Pomodoro alternates work intervals with breaks automatically, with a longer break every few cycles."
        />
        <Segmented
          onPage
          label="Session type"
          value={draft.type}
          onChange={(type) => onChange({ ...draft, type })}
          options={[
            { value: 'custom', label: 'Custom' },
            { value: 'pomodoro', label: 'Pomodoro' },
          ]}
        />
      </View>

      {draft.type === 'custom' ? (
        <OptionGroup title="Segments">
          {draft.segments.map((segment, i) => (
            <View key={segment.id} className="gap-2 rounded-xl p-2" style={{ backgroundColor: colors.surface }}>
              <TextInput
                value={segment.title}
                onChangeText={(title) => updateSegment(i, { title })}
                placeholder="e.g. Scales"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Segment name"
                className={input}
                style={{ backgroundColor: colors.background, color: colors.foreground }}
              />
              <View className="flex-row items-center gap-1">
                <MinutesStepper value={segment.minutes} min={1} max={180} label={`${segment.title || 'Segment'} minutes`} onChange={(minutes) => updateSegment(i, { minutes })} />
                <Text className="font-ui ml-1 text-xs" style={{ color: colors.muted }}>
                  min
                </Text>
                <View className="flex-1" />
                <RowButton onPress={() => moveSegment(i, -1)} disabled={i === 0} label="Move up">
                  <ArrowUpIcon color={colors.muted} size={18} />
                </RowButton>
                <RowButton onPress={() => moveSegment(i, 1)} disabled={i === draft.segments.length - 1} label="Move down">
                  <ArrowDownIcon color={colors.muted} size={18} />
                </RowButton>
                {/* Set apart, so it isn't hit by mistake. */}
                <View className="w-2" />
                <RowButton onPress={() => removeSegment(i)} label="Remove segment">
                  <TrashIcon color={colors.danger} size={18} />
                </RowButton>
              </View>
            </View>
          ))}
          <AddRowButton label="Add segment" onPress={() => onChange({ ...draft, segments: [...draft.segments, newSegment()] })} />
        </OptionGroup>
      ) : (
        <PomodoroFields config={draft.pomodoro} onChange={(pomodoro) => onChange({ ...draft, pomodoro })} />
      )}

      <View className="flex-row gap-2 pt-2">
        <EditorButton label={saving ? 'Saving…' : 'Save'} primary disabled={saving} onPress={onSave} />
        <EditorButton label="Cancel" disabled={saving} onPress={onCancel} />
      </View>
    </ScrollView>
  );
}

/** The Pomodoro half of the editor (the website's `PomodoroEditor`): everything follows from the
    cycles — three timing cards, how many cycles (or keep going) and how often the long break comes,
    then one optional name per cycle, and a preview of the run in order. */
function PomodoroFields({ config, onChange }: { config: PomodoroConfig; onChange: (config: PomodoroConfig) => void }) {
  const { colors } = useAppTheme();
  const update = (patch: Partial<PomodoroConfig>) => onChange(normalizePomodoro({ ...config, ...patch }));
  const forever = config.totalCycles === null;
  const slots = nameSlots(config);
  const every = config.cyclesBeforeLongBreak;

  function setName(i: number, name: string) {
    const titles = Array.from({ length: slots }, (_, j) => (j === i ? name : (config.workTitles[j] ?? '')));
    update({ workTitles: titles });
  }

  const cycles = forever ? every : (config.totalCycles ?? 0);
  const steps: { kind: 'work' | 'short' | 'long'; label: string; minutes: number }[] = [];
  for (let i = 0; i < cycles; i++) {
    steps.push({ kind: 'work', label: config.workTitles[i]?.trim() || 'Work', minutes: config.workMinutes });
    const last = i === cycles - 1;
    if (last && !forever) break;
    const long = (i + 1) % every === 0;
    steps.push({
      kind: long ? 'long' : 'short',
      label: long ? 'Long break' : 'Break',
      minutes: long ? config.longBreakMinutes : config.shortBreakMinutes,
    });
  }
  const total = steps.reduce((sum, s) => sum + s.minutes, 0);

  return (
    <>
      <OptionGroup title="Timing">
        <View className="flex-row gap-2">
          <MinutesCard label="Work" value={config.workMinutes} min={1} max={180} onChange={(workMinutes) => update({ workMinutes })} />
          <MinutesCard label="Break" value={config.shortBreakMinutes} min={1} max={60} onChange={(shortBreakMinutes) => update({ shortBreakMinutes })} />
          <MinutesCard label="Long break" value={config.longBreakMinutes} min={1} max={60} onChange={(longBreakMinutes) => update({ longBreakMinutes })} />
        </View>
      </OptionGroup>

      <OptionGroup title="Cycles">
        <Segmented
          onPage
          label="Length"
          value={forever ? 'forever' : 'set'}
          onChange={(v) => update({ totalCycles: v === 'forever' ? null : Math.max(every, 4) })}
          options={[
            { value: 'set', label: 'Set number' },
            { value: 'forever', label: 'Keep going' },
          ]}
        />
        {!forever ? (
          <CountRow
            label="Work cycles"
            value={config.totalCycles ?? 1}
            min={1}
            max={MAX_CYCLES}
            suffix={config.totalCycles === 1 ? 'cycle' : 'cycles'}
            onChange={(totalCycles) => update({ totalCycles })}
          />
        ) : null}
        <CountRow
          label="Long break every"
          value={every}
          min={1}
          max={12}
          suffix={every === 1 ? 'cycle' : 'cycles'}
          onChange={(cyclesBeforeLongBreak) => update({ cyclesBeforeLongBreak })}
        />
      </OptionGroup>

      <OptionGroup
        title={forever ? `Cycle names (repeat every ${every})` : 'Cycle names'}
        aside={
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            Optional
          </Text>
        }
      >
        {Array.from({ length: slots }, (_, i) => (
          <View key={i} className="flex-row items-center gap-3">
            <Text className="font-ui w-6 text-right text-sm" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
              {i + 1}
            </Text>
            <TextInput
              value={config.workTitles[i] ?? ''}
              onChangeText={(t) => setName(i, t)}
              placeholder="Work"
              placeholderTextColor={colors.muted}
              accessibilityLabel={`Name for work cycle ${i + 1}`}
              className="font-ui h-11 min-w-0 flex-1 rounded-lg px-3 text-[15px]"
              style={{ backgroundColor: colors.surface, color: colors.foreground }}
            />
          </View>
        ))}
      </OptionGroup>

      <OptionGroup
        title="Preview"
        aside={
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
            {forever ? `${formatTotal(total)} per round` : formatTotal(total)}
          </Text>
        }
      >
        <View className="flex-row flex-wrap items-center gap-1.5">
          {steps.map((s, i) => (
            <View
              key={i}
              className="flex-row items-baseline gap-1 rounded-md px-2 py-1"
              style={{ backgroundColor: s.kind === 'work' ? withAlpha(colors.accent, 0.15) : colors.surface }}
            >
              <Text
                className="font-ui-semibold text-xs font-semibold"
                style={{ color: s.kind === 'work' ? colors.accent : s.kind === 'long' ? colors.foreground : colors.muted }}
              >
                {s.label}
              </Text>
              <Text className="font-ui text-xs" style={{ color: s.kind === 'work' ? colors.accent : colors.muted }}>
                {s.minutes}m
              </Text>
            </View>
          ))}
          {forever ? (
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
              ↻ then repeats
            </Text>
          ) : null}
        </View>
      </OptionGroup>
    </>
  );
}

/** A small "label, then − number +" card; three sit side by side. */
function MinutesCard({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-1 items-center gap-1 rounded-xl px-1 py-2.5" style={{ backgroundColor: colors.surface }}>
      <Text numberOfLines={1} className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      <View className="flex-row items-center">
        <StepText label={`Less ${label.toLowerCase()}`} disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))}>
          −
        </StepText>
        <Text className="font-ui-semibold w-9 text-center text-xl font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
        <StepText label={`More ${label.toLowerCase()}`} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))}>
          +
        </StepText>
      </View>
      <Text className="font-ui text-[11px]" style={{ color: colors.muted }}>
        min
      </Text>
    </View>
  );
}

function CountRow({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  suffix: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        {label}
      </Text>
      <View className="flex-row items-center gap-1.5">
        <RowButton label={`Fewer: ${label}`} disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} filled>
          <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
            −
          </Text>
        </RowButton>
        <Text className="font-ui-semibold w-20 text-center text-sm font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
          {value} {suffix}
        </Text>
        <RowButton label={`More: ${label}`} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} filled>
          <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
            +
          </Text>
        </RowButton>
      </View>
    </View>
  );
}

/** − n + for a timer's minutes, inside a timer's card. */
function MinutesStepper({
  value,
  min,
  max,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center rounded-lg" style={{ backgroundColor: colors.background }} accessibilityLabel={label}>
      <StepText label="Fewer minutes" disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))}>
        −
      </StepText>
      <Text className="font-ui-semibold min-w-[32px] text-center text-base font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
        {Math.round(value)}
      </Text>
      <StepText label="More minutes" disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))}>
        +
      </StepText>
    </View>
  );
}

function StepText({ label, disabled, onPress, children }: { label: string; disabled?: boolean; onPress: () => void; children: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 w-9 items-center justify-center"
      style={{ opacity: disabled ? 0.3 : 1 }}
    >
      <Text className="font-ui-semibold text-lg font-semibold" style={{ color: colors.muted }}>
        {children}
      </Text>
    </Pressable>
  );
}

function RowButton({
  onPress,
  disabled,
  label,
  filled,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  label: string;
  /** On the surface colour (for rows sitting on the page). */
  filled?: boolean;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
      style={{ opacity: disabled ? 0.3 : 1, ...(filled ? { backgroundColor: colors.surface } : null) }}
    >
      <Fragment>{children}</Fragment>
    </Pressable>
  );
}

function AddRowButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-11 flex-row items-center justify-center gap-1.5 overflow-hidden rounded-lg"
      style={{ backgroundColor: derived.fill }}
    >
      <PlusIcon color={colors.muted} size={18} />
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

function EditorButton({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
      className="h-12 flex-1 items-center justify-center overflow-hidden rounded-full"
      style={{ backgroundColor: primary ? colors.accent : derived.fill, opacity: disabled ? 0.6 : 1 }}
    >
      <Text className="font-ui-semibold text-base font-semibold" style={{ color: primary ? colors['accent-foreground'] : colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}
