import type { Grade } from '@jam-practice/core/noteGrade';
import { GRADE_LABEL } from '@jam-practice/core/noteGrade';
import { CUSTOM_INSTRUMENT_ID, INSTRUMENTS } from '@jam-practice/core/instruments';
import { attempts, type GradeCounts } from '@jam-practice/core/struggleStats';
import { isDarkColors } from '@jam-practice/core/themes';
import { formatDuration } from '@jam-practice/core/trainerUtils';
import { Stack } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { CheckIcon, FlagIcon, HistoryIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import { SettingChip, TOOL_CONTENT } from '@/components/tool/SettingChip';
import { Slider } from '@/components/tool/Slider';
import { Button } from '@/components/ui';
import { EAR_TRAINING_TONES } from '@/lib/sampledTones';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * The pitch and ear-training tools' shared pieces (Tuner, Slow Downer, the Note/Scale/Interval
 * Trainers, Guess the Interval/Chord/Progression), after the website's `learning/quizUi.ts`: the
 * round display (an empty ring with a "?" before round one, a draining ring while a round runs),
 * the "Press Start, …" line, answer buttons, the results panel, the History and Struggles chips
 * above the display, and the controls that go inside a chip's sheet (a labelled field with its
 * description behind an ⓘ, a slider with its value, pill choices, pool pills).
 */

// ── Colours and words ─────────────────────────────────────────────────────────────────────────

/** Right / half / wrong colours that read on every theme, like the web's `--success` / `--warning`
    / `--danger`: a darker green and amber on light themes (so text on pale fills stays readable),
    the bright ones on dark themes, and the theme's own danger colour for wrong. */
export function useGradeColors(): Record<Grade, string> {
  const { colors } = useAppTheme();
  const dark = isDarkColors(colors);
  return {
    correct: dark ? '#22c55e' : '#147236',
    partial: dark ? '#eab308' : '#ca8a04',
    incorrect: colors.danger,
  };
}

/** A tone's name for a chip ("Piano"). */
export function toneLabel(id: string): string {
  return EAR_TRAINING_TONES.find((t) => t.id === id)?.label ?? 'Piano';
}

const SHORT_NAMES: Record<string, string> = { bass4: 'Bass', bass5: '5-string bass' };

/** A short instrument name for a chip ("Bass", "Guitar", "Custom"), like the web's. */
export function instrumentShortName(id: string): string {
  if (id === CUSTOM_INSTRUMENT_ID) return 'Custom';
  const label = INSTRUMENTS.find((i) => i.id === id)?.label ?? '';
  return SHORT_NAMES[id] ?? label.split(' (')[0].split(' — ')[0];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 18" (with the year when it isn't this one), like the web's `formatFileDate`. */
export function formatShortDate(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? '' : `, ${d.getFullYear()}`}`;
}

/** Shows a note name's accidentals as ♯ / ♭ ("G#3" → "G♯3"), display only. */
export function noteGlyphs(text: string): string {
  return text.replace(/([A-G])#/g, '$1♯').replace(/([A-G])b/g, '$1♭');
}

// ── The page ──────────────────────────────────────────────────────────────────────────────────

/**
 * A tool screen laid out like every tool on the phone (and the Metronome), top to bottom: the
 * History / Struggles chips, the mode switch (Practice / Learn … — it decides what the screen is),
 * the main display, the big button, then the setting chips. It starts a fixed step under the
 * header (it doesn't float in the middle) and scrolls on a short screen. `footer` is pinned under
 * it (an answer keyboard).
 */
export function ToolScreen({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={TOOL_SCROLL_CONTENT}
        >
          {children}
        </ScrollView>
        {footer}
      </SafeAreaView>
    </View>
  );
}

/** The scroll content of every tool screen: a 16dp gutter, starting 20dp under the header. */
export const TOOL_SCROLL_CONTENT = { ...TOOL_CONTENT, alignItems: 'center', gap: 20 } as const;

/** The setting chips under the big button. (The mode switch, if any, goes above the display.) */
export function OptionsArea({ children }: { children: ReactNode }) {
  return (
    <View className="w-full items-center pt-1">
      <View className="flex-row flex-wrap justify-center gap-2">{children}</View>
    </View>
  );
}

// ── The round display ─────────────────────────────────────────────────────────────────────────

const RING_R = 47;
const RING_C = 2 * Math.PI * RING_R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A trainer's round display (the web's `IDLE_RING` + `CountdownRing`): before round one (and after
 * Stop) an empty faint ring with a muted "?" — or `children` — in it; while a round runs, the ring
 * drains as its time runs out (`timer`, restarted whenever `startedAt` changes).
 */
export function QuizRing({
  size,
  running,
  timer,
  children,
}: {
  size: number;
  running: boolean;
  timer: { startedAt: number; durationMs: number } | null;
  children?: ReactNode;
}) {
  const { colors } = useAppTheme();
  const progress = useSharedValue(0);
  const startedAt = timer?.startedAt ?? 0;
  const durationMs = timer?.durationMs ?? 0;
  const counting = running && durationMs > 0;

  useEffect(() => {
    cancelAnimation(progress);
    if (!counting) {
      progress.value = 0;
      return;
    }
    const elapsed = Math.max(0, Date.now() - startedAt);
    progress.value = Math.min(1, elapsed / durationMs);
    progress.value = withTiming(1, { duration: Math.max(0, durationMs - elapsed), easing: Easing.linear });
  }, [counting, startedAt, durationMs, progress]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_C * progress.value }));

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={50} cy={50} r={RING_R} fill="none" stroke={withAlpha(colors.foreground, 0.1)} strokeWidth={running ? 4 : 3} />
        {counting ? (
          <AnimatedCircle
            cx={50}
            cy={50}
            r={RING_R}
            fill="none"
            stroke={colors.accent}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={RING_C}
            animatedProps={ringProps}
          />
        ) : null}
      </Svg>
      <View className="items-center justify-center px-3" style={{ maxWidth: size }}>
        {children ?? (running ? null : <IdleMark />)}
      </View>
    </View>
  );
}

/** The muted "?" in an idle round display. Prefer `IdleSummary`, which says what's coming. */
export function IdleMark() {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui-bold text-4xl font-bold" style={{ color: colors.muted }}>
      ?
    </Text>
  );
}

/** What an idle round display holds before Start: what's about to be asked — a number or a short
    name big ("12", "C major"), what it counts under it ("intervals"), and a detail line ("Piano ·
    C3–C5"). */
export function IdleSummary({ value, label, detail }: { value: string; label: string; detail?: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="items-center">
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} className="font-ui-bold text-center text-4xl font-bold tabular-nums" style={{ color: colors.foreground }}>
        {value}
      </Text>
      <Text numberOfLines={1} className="font-ui-semibold text-center text-sm font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      {detail ? (
        <Text numberOfLines={2} className="font-ui mt-1 text-center text-xs" style={{ color: colors.muted }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/** "Press Start, …" under the idle display: what's about to happen. */
export function IdleHint({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted, maxWidth: 320 }}>
      {children}
    </Text>
  );
}

/** "Level 3 · Fourths and fifths" above the display while a learning-path level runs. */
export function LevelLabel({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui-semibold text-center text-xs font-semibold" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

/** A one-line slot under the round display ("You picked …", the revealed notes); always there while
    a round runs, so answering never moves the buttons below. */
export function FeedbackLine({ children }: { children?: ReactNode }) {
  return <View className="h-5 max-w-full flex-row items-center justify-center">{children}</View>;
}

/** Small muted text (progress lines, "Heard C4"). */
export function MutedText({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { colors } = useAppTheme();
  return (
    <Text className={`font-ui text-center text-sm ${className}`} style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────────────────────────

/** A quiet text-only action ("I don't know", "Clear stats"), with a 44px-tall hit area. */
export function TextButton({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" hitSlop={4} className="min-h-11 justify-center self-center px-4" style={{ opacity: disabled ? 0.5 : 1 }}>
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: danger ? colors.danger : colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** One answer in a quiz's grid of choices: a filled button, tinted in its grade colour once the
    round is answered (the right one and a wrong pick); the others fade. */
export function AnswerButton({
  label,
  onPress,
  color,
  answered,
  width,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  answered: boolean;
  width?: `${number}%`;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={answered}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-12 items-center justify-center overflow-hidden rounded-lg px-2 py-2"
      style={{
        ...(width ? { width } : null),
        backgroundColor: color ? withAlpha(color, 0.12) : colors.surface,
        borderWidth: 1.5,
        borderColor: color ?? 'transparent',
        opacity: answered && !color ? 0.5 : 1,
      }}
    >
      <Text numberOfLines={2} className="font-ui-semibold text-center text-sm font-semibold" style={{ color: color ?? colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────────────────────

/** The end-of-run results panel (the web's `RESULTS_PANEL`): the score and percentage, the time
    against the best, a count per grade, every round as a small graded tag, Try again / Close. */
export function ResultsPanel({
  score,
  total,
  elapsed,
  bestMs,
  isNewBest,
  grades,
  tags,
  onAgain,
  onClose,
}: {
  score: number;
  total: number;
  elapsed: number | null;
  bestMs: number | null;
  isNewBest: boolean;
  /** Which grades to count ("correct" and "incorrect", or all three). */
  grades: { grade: Grade; count: number }[];
  tags: { label: string; grade: Grade }[];
  onAgain: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const gradeColor = useGradeColors();
  return (
    <View className="w-full gap-4 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
            Results
          </Text>
          <Text className="font-ui-bold text-3xl font-bold tabular-nums" style={{ color: colors.foreground }}>
            {score % 1 === 0 ? score : score.toFixed(1)}
            <Text className="font-ui-semibold text-lg font-semibold" style={{ color: colors.muted }}>
              {' '}/ {total}
            </Text>
          </Text>
        </View>
        <Text className="font-ui-semibold text-xl font-semibold tabular-nums" style={{ color: colors.muted }}>
          {total ? Math.round((score / total) * 100) : 0}%
        </Text>
      </View>
      {elapsed !== null ? (
        <Text className="font-ui -mt-2 text-xs tabular-nums" style={{ color: colors.muted }}>
          Time {formatDuration(elapsed)}
          {bestMs !== null ? ` · Best ${formatDuration(bestMs)}` : ''}
          {isNewBest ? (
            <Text className="font-ui-semibold font-semibold" style={{ color: gradeColor.correct }}>
              {'  '}New best!
            </Text>
          ) : null}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-x-5 gap-y-1">
        {grades.map(({ grade, count }) => (
          <Text key={grade} className="font-ui text-sm" style={{ color: colors.muted }}>
            <Text className="font-ui-semibold font-semibold tabular-nums" style={{ color: gradeColor[grade] }}>
              {count}
            </Text>{' '}
            {GRADE_LABEL[grade]}
          </Text>
        ))}
      </View>
      <ScrollView style={{ maxHeight: 132 }} nestedScrollEnabled contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {tags.map((t, i) => (
          <View key={i} className="rounded-sm px-2 py-0.5" style={{ backgroundColor: withAlpha(gradeColor[t.grade], 0.15) }}>
            <Text className="font-ui-semibold text-xs font-semibold tabular-nums" style={{ color: gradeColor[t.grade] }}>
              {t.label}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View className="flex-row gap-2">
        <Button label="Try again" onPress={onAgain} style={{ flex: 1 }} />
        <Button label="Close" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

// ── History and Struggles (chips above the display) ───────────────────────────────────────────

type HistoryItem = { at: number; elapsedMs: number; score: number; total: number; config: { drillMode: boolean } };

/** The History chip: finished runs with these exact settings (the score first, green when perfect;
    what kind of run and when under it; the time on the right), the best time, and Clear. */
export function HistoryChip({ entries, bestMs, onClear }: { entries: HistoryItem[]; bestMs: number | null; onClear: () => void }) {
  const { colors, derived } = useAppTheme();
  const gradeColor = useGradeColors();
  return (
    <SettingChip
      Icon={HistoryIcon}
      label="History"
      value={bestMs !== null ? `Best ${formatDuration(bestMs)}` : entries.length ? `${entries.length} run${entries.length === 1 ? '' : 's'}` : 'None yet'}
    >
      {entries.length === 0 ? (
        <SheetText>No attempts yet with these settings.</SheetText>
      ) : (
        <View>
          {[...entries]
            .sort((a, b) => b.at - a.at)
            .map((entry, i) => {
              const percent = entry.total > 0 ? Math.round((entry.score / entry.total) * 100) : 0;
              return (
                <View key={i} className="flex-row items-center justify-between gap-3 py-2" style={i > 0 ? { borderTopWidth: 1, borderColor: derived.hairline } : undefined}>
                  <View className="flex-1">
                    <Text
                      className="font-ui-semibold text-sm font-semibold tabular-nums"
                      style={{ color: entry.score === entry.total ? gradeColor.correct : colors.foreground }}
                    >
                      {entry.score % 1 === 0 ? entry.score : entry.score.toFixed(1)}/{entry.total} · {percent}%
                    </Text>
                    <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                      {entry.config.drillMode ? 'Drill' : 'Quiz'} · {formatShortDate(entry.at)}
                    </Text>
                  </View>
                  <Text className="font-ui text-xs tabular-nums" style={{ color: colors.muted }}>
                    {formatDuration(entry.elapsedMs)}
                  </Text>
                </View>
              );
            })}
        </View>
      )}
      {entries.length > 0 ? (
        <View className="items-start">
          <TextButton label="Clear these times" danger onPress={onClear} />
        </View>
      ) : null}
    </SettingChip>
  );
}

/** The Struggles chip: what you get wrong most, worst first ("5 wrong out of 6"), a button to shed
    just those, and Clear stats. Shedding closes the sheet and starts. */
export function StrugglesChip({
  entries,
  shedLabel,
  shedCount,
  emptyText,
  running,
  onShed,
  onClear,
}: {
  entries: { key: string; label: string; counts: GradeCounts }[];
  /** "Shed weak intervals". */
  shedLabel: string;
  /** How many the shed session would cover (defaults to every entry). */
  shedCount?: number;
  emptyText: string;
  running: boolean;
  onShed: () => void;
  onClear: () => void;
}) {
  const { colors, derived } = useAppTheme();
  const gradeColor = useGradeColors();
  const [open, setOpen] = useState(false);
  const count = shedCount ?? entries.length;
  return (
    <SettingChip Icon={FlagIcon} label="Struggles" value={entries.length ? `${entries.length} weak` : 'None yet'} open={open} onOpenChange={setOpen}>
      {entries.length === 0 ? (
        <SheetText>{emptyText}</SheetText>
      ) : (
        <View>
          {entries.map((entry, i) => (
            <View key={entry.key} className="flex-row items-center justify-between gap-3 py-2" style={i > 0 ? { borderTopWidth: 1, borderColor: derived.hairline } : undefined}>
              <Text className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
                {entry.label}
              </Text>
              <Text className="font-ui text-xs tabular-nums" style={{ color: colors.muted }}>
                {entry.counts.incorrect > 0 ? <Text style={{ color: gradeColor.incorrect }}>{entry.counts.incorrect} wrong</Text> : null}
                {entry.counts.incorrect > 0 && entry.counts.partial > 0 ? ', ' : ''}
                {entry.counts.partial > 0 ? <Text style={{ color: gradeColor.partial }}>{entry.counts.partial} partly right</Text> : null} out of{' '}
                {attempts(entry.counts)}
              </Text>
            </View>
          ))}
        </View>
      )}
      <View className="flex-row items-center justify-between gap-2">
        <Button
          label={`${shedLabel}${count > 0 ? ` (${count})` : ''}`}
          disabled={running || count === 0}
          onPress={() => {
            setOpen(false);
            onShed();
          }}
        />
        {entries.length > 0 ? <TextButton label="Clear stats" danger disabled={running} onPress={onClear} /> : null}
      </View>
    </SettingChip>
  );
}

// ── Controls inside a chip's sheet ────────────────────────────────────────────────────────────

/** Plain text in a sheet. */
export function SheetText({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

/** A labelled control in a sheet; its description is behind an ⓘ. `aside` sits on the right of the
    label (a value, a Reset). */
export function Field({ label, hint, aside, children }: { label: string; hint?: string; aside?: ReactNode; children?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2">
      <View className="min-h-6 flex-row items-center gap-1.5">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
          {label}
        </Text>
        {hint ? <InfoButton title={label} text={hint} size={16} /> : null}
        <View className="flex-1" />
        {aside}
      </View>
      {children}
    </View>
  );
}

/** A small value badge for a field's label row ("8 s"). */
export function ValueBadge({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: colors.background }}>
      <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: colors.foreground }}>
        {children}
      </Text>
    </View>
  );
}

/** A number on a slider (the web's `AdvancedSlider`): the label and the value above, the slider
    under it, snapping to `step`. */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  hint,
  disabled,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const decimals = step.toString().split('.')[1]?.length ?? 0;
  const snap = (v: number) => Number(Math.min(max, Math.max(min, Math.round(v / step) * step)).toFixed(decimals));
  return (
    <Field label={label} hint={hint} aside={<ValueBadge>{format ? format(value) : `${value}${unit}`}</ValueBadge>}>
      <Slider
        label={label}
        value={(value - min) / (max - min)}
        disabled={disabled}
        onChange={(t) => {
          const next = snap(min + t * (max - min));
          if (next !== value) onChange(next);
        }}
      />
    </Field>
  );
}

/** One choice out of a few, as pills (instead of a dropdown): the picked one lit in the accent. */
export function PillChoice<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap gap-1.5">
      {options.map((o) => (
        <Pill key={String(o.value)} on={o.value === value} label={o.label} radio disabled={disabled} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

/** A pill: a toggle in a pool of choices (with a check when on), or one option of a `PillChoice`. */
export function Pill({
  on,
  label,
  onPress,
  disabled,
  radio,
  accessibilityLabel,
}: {
  on: boolean;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  radio?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: on, disabled }}
      hitSlop={{ top: 2, bottom: 2 }}
      className={`h-10 flex-row items-center gap-1 overflow-hidden rounded-full ${on && !radio ? 'pl-2.5 pr-3.5' : 'px-3.5'}`}
      style={{ backgroundColor: on ? colors.accent : colors.background, opacity: disabled ? 0.6 : 1 }}
    >
      {on && !radio ? <CheckIcon color={colors['accent-foreground']} size={15} /> : null}
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: on ? colors['accent-foreground'] : colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** "3 of 12 selected" with All / None, above a pool of pills. */
export function PoolHeader({ count, total, onAll, onNone, disabled, hint }: { count: number; total: number; onAll: () => void; onNone: () => void; disabled?: boolean; hint?: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
        {count} of {total} selected
      </Text>
      {hint ? <InfoButton text={hint} size={16} /> : null}
      <View className="flex-1" />
      <PoolButton label="All" onPress={onAll} disabled={disabled} />
      <PoolButton label="None" onPress={onNone} disabled={disabled} />
    </View>
  );
}

function PoolButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={{ top: 4, bottom: 4 }}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 items-center justify-center overflow-hidden rounded-full px-3.5"
      style={{ backgroundColor: colors.background, opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A small group label inside a pool ("Sevenths"). */
export function GroupLabel({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

/** A text field in a sheet (a custom range). */
export function SheetInput({
  value,
  onChangeText,
  placeholder,
  editable = true,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      autoCapitalize="characters"
      autoCorrect={false}
      className="font-ui h-11 rounded-lg px-3 text-base"
      style={{ backgroundColor: colors.background, color: colors.foreground, opacity: editable ? 1 : 0.6 }}
    />
  );
}

/** A small secondary button in a sheet ("Reset advanced settings", a string to shed). */
export function SheetButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-11 items-center justify-center self-start overflow-hidden rounded-lg px-3.5"
      style={{ backgroundColor: colors.background, opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A thin rule with a title between groups in a sheet ("Advanced"). */
export function SheetDivider({ title }: { title?: string }) {
  const { colors, derived } = useAppTheme();
  return (
    <View className="gap-3">
      <View className="h-px" style={{ backgroundColor: derived.hairline }} />
      {title ? (
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}
