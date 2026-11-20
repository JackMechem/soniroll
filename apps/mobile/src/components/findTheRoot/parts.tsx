import type { Grade } from '@jam-practice/core/noteGrade';
import { formatDuration } from '@jam-practice/core/trainerUtils';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { HistoryIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import { SheetText, TextButton, formatShortDate, useGradeColors } from '@/components/tool/ear';
import { mix } from '@/components/tool/reward';
import { SettingChip } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * Find the Root's own pieces around the shared ear-training kit (`components/tool/ear.tsx`): its
 * History chip (runs scored in half points, sung or picked, best as a percentage, like the
 * website's), its results panel (every round with the chord, its voicing and notes), and a couple
 * of sheet controls.
 */

/** A score with half points as a fraction ("1½", "½"), not "1.5": a root found on a retry counts
    half. */
export function formatScore(score: number): string {
  const whole = Math.floor(score);
  const half = score - whole >= 0.5;
  return half ? `${whole > 0 ? whole : ''}½` : String(whole);
}

const percent = (score: number, total: number) => (total ? Math.round((score / total) * 100) : 0);

export type RunEntry = { at: number; elapsedMs: number; score: number; total: number; mode: 'sing' | 'pick' };

/** The History chip: every finished run, newest first (score, how it was answered, when, how long),
    the best percentage on the chip, and Clear history. */
export function RunHistoryChip({ entries, running, onClear }: { entries: RunEntry[]; running: boolean; onClear: () => void }) {
  const { colors, derived } = useAppTheme();
  const gradeColor = useGradeColors();
  const best = entries.length ? Math.max(...entries.map((e) => percent(e.score, e.total))) : null;
  return (
    <SettingChip Icon={HistoryIcon} label="History" value={best !== null ? `Best ${best}%` : 'None yet'}>
      {entries.length === 0 ? (
        <SheetText>No finished runs yet.</SheetText>
      ) : (
        <View>
          {[...entries]
            .sort((a, b) => b.at - a.at)
            .map((entry, i) => (
              <View key={i} className="flex-row items-center justify-between gap-3 py-2" style={i > 0 ? { borderTopWidth: 1, borderColor: derived.hairline } : null}>
                <View className="flex-1">
                  <Text
                    className="font-ui-semibold text-sm font-semibold tabular-nums"
                    style={{ color: entry.score === entry.total ? gradeColor.correct : colors.foreground }}
                  >
                    {formatScore(entry.score)}/{entry.total} · {percent(entry.score, entry.total)}%
                  </Text>
                  <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                    {entry.mode === 'pick' ? 'Picked' : 'Sung or played'} · {formatShortDate(entry.at)}
                  </Text>
                </View>
                <Text className="font-ui text-xs tabular-nums" style={{ color: colors.muted }}>
                  {formatDuration(entry.elapsedMs)}
                </Text>
              </View>
            ))}
        </View>
      )}
      {entries.length > 0 ? (
        <View className="items-start">
          <TextButton label="Clear history" danger disabled={running} onPress={onClear} />
        </View>
      ) : null}
    </SettingChip>
  );
}

/** The end-of-run results: the score and percentage, a count per grade, every round (the chord in
    its grade colour; its voicing's own name and notes beside it), Try again / Close. */
export function RunResults({
  score,
  grades,
  rows,
  onAgain,
  onClose,
}: {
  score: number;
  grades: Grade[];
  rows: { chord: string; detail: string }[];
  onAgain: () => void;
  onClose: () => void;
}) {
  const { colors, derived } = useAppTheme();
  const gradeColor = useGradeColors();
  const tally = (grade: Grade) => grades.filter((g) => g === grade).length;
  const names: Record<Grade, string> = { correct: 'Correct', partial: 'Half', incorrect: 'Incorrect' };
  return (
    <View className="w-full gap-4 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
            Results
          </Text>
          <Text className="font-ui-bold text-3xl font-bold tabular-nums" style={{ color: colors.foreground }}>
            {formatScore(score)}
            <Text className="font-ui-semibold text-lg font-semibold" style={{ color: colors.muted }}>
              {' '}/ {grades.length}
            </Text>
          </Text>
        </View>
        <Text className="font-ui-semibold text-xl font-semibold tabular-nums" style={{ color: colors.muted }}>
          {percent(score, grades.length)}%
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-x-5 gap-y-1">
        {(['correct', 'partial', 'incorrect'] as const).map((grade) => (
          <Text key={grade} className="font-ui text-sm" style={{ color: colors.muted }}>
            <Text className="font-ui-semibold font-semibold tabular-nums" style={{ color: gradeColor[grade] }}>
              {tally(grade)}
            </Text>{' '}
            {names[grade]}
          </Text>
        ))}
      </View>
      <View className="overflow-hidden rounded-md" style={{ backgroundColor: derived.fill }}>
        {rows.map((row, i) => (
          <View
            key={i}
            className="flex-row items-center justify-between gap-3 px-3 py-2"
            style={i > 0 ? { borderTopWidth: 1, borderColor: derived.hairline } : null}
          >
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: gradeColor[grades[i]] }}>
              {row.chord}
            </Text>
            <Text numberOfLines={1} className="font-ui flex-shrink text-xs" style={{ color: colors.muted }}>
              {row.detail}
            </Text>
          </View>
        ))}
      </View>
      <View className="flex-row gap-2">
        <Button label="Try again" onPress={onAgain} style={{ flex: 1 }} />
        <Button label="Close" kind="secondary" onPress={onClose} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** "7 of 12 in play" with small buttons on the right (All, Reset), above a pool of pills. */
export function PoolCount({ text, hint, children }: { text: string; hint?: string; children?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="min-h-8 flex-row items-center gap-1.5">
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
        {text}
      </Text>
      {hint ? <InfoButton text={hint} size={16} /> : null}
      <View className="flex-1" />
      {children}
    </View>
  );
}

/** A small pill button for a pool's header ("All", "Reset"). */
export function PoolButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-8 items-center justify-center overflow-hidden rounded-full px-3"
      style={{ backgroundColor: colors.background }}
    >
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** One choice out of a few whose labels are too long for pills: full-width cards that wrap, one
    per line, the picked one outlined in the accent (like `RewardCard`). */
export function ChoiceList<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on }}
            android_ripple={{ color: colors['surface-hover'] }}
            className="min-h-11 justify-center overflow-hidden rounded-md border px-3 py-2.5"
            style={
              on
                ? { borderColor: colors.accent, backgroundColor: mix(colors.accent, colors.background, 0.12) }
                : { borderColor: withAlpha(colors.foreground, 0.15), backgroundColor: colors.background }
            }
          >
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
