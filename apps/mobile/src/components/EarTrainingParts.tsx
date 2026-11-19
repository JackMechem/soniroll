import { GRADE_COLOR, GRADE_LABEL, type Grade } from '@jam-practice/core/noteGrade';
import { attempts, type GradeCounts } from '@jam-practice/core/struggleStats';
import { formatDuration } from '@jam-practice/core/trainerUtils';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/** Pieces shared by the ear-training screens (Guess the Interval, Guess the Chord). */

/** The grade-coloured "Ns" countdown to the next round. */
export function CountdownText({ active, startedAt, durationMs, color }: { active: boolean; startedAt: number; durationMs: number; color: string }) {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  useEffect(() => {
    if (!active) return;
    const tick = () => setRemainingMs(Math.max(0, durationMs - (Date.now() - startedAt)));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [active, startedAt, durationMs]);
  if (!active) return null;
  return (
    <Text className="font-ui-bold text-3xl font-bold tabular-nums" style={{ color }}>
      {Math.ceil(remainingMs / 1000)}s
    </Text>
  );
}

/** The end-of-session card: score, time vs best, per-grade tallies, every round as a coloured chip. */
export function ResultsCard({
  score,
  total,
  elapsed,
  bestMs,
  isNewBest,
  tallies,
  chips,
  onAgain,
  onClose,
}: {
  score: number;
  total: number;
  elapsed: number | null;
  bestMs: number | null;
  isNewBest: boolean;
  tallies: { grade: Grade; count: number }[];
  chips: { label: string; grade: Grade }[];
  onAgain: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="max-h-full w-full gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
            Results
          </Text>
          <Text className="font-ui-extrabold text-3xl font-extrabold tabular-nums" style={{ color: colors.foreground }}>
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
        <Text className="font-ui text-xs tabular-nums" style={{ color: colors.muted }}>
          Time {formatDuration(elapsed)}
          {bestMs !== null ? ` · Best ${formatDuration(bestMs)}` : ''}
          {isNewBest ? (
            <Text className="font-ui-bold font-bold" style={{ color: GRADE_COLOR.correct }}>
              {' '}New best!
            </Text>
          ) : null}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        {tallies.map(({ grade, count }) => (
          <View key={grade} className="flex-1 items-center rounded-xl py-2.5" style={{ backgroundColor: colors.background }}>
            <Text className="font-ui-bold text-xl font-bold tabular-nums" style={{ color: GRADE_COLOR[grade] }}>
              {count}
            </Text>
            <Text className="font-ui text-[11px]" style={{ color: colors.muted }}>
              {GRADE_LABEL[grade]}
            </Text>
          </View>
        ))}
      </View>
      <ScrollView style={{ maxHeight: 150 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {chips.map((c, i) => (
          <View key={i} className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${GRADE_COLOR[c.grade]}26` }}>
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: GRADE_COLOR[c.grade] }}>
              {c.label}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View className="flex-row gap-2">
        <Pressable onPress={onAgain} className="flex-1 items-center rounded-xl py-2.5" style={{ backgroundColor: colors.accent }}>
          <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
            Try again
          </Text>
        </Pressable>
        <Pressable onPress={onClose} className="flex-1 items-center rounded-xl py-2.5" style={{ backgroundColor: colors.background }}>
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            Close
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The options sheet's Progress tab: History (times with these exact settings) and Struggles. */
export function ProgressTab({
  bestMs,
  history,
  onClearHistory,
  weak,
  weakNoun,
  running,
  onShedWeak,
  onClearStats,
}: {
  bestMs: number | null;
  history: { at: number; elapsedMs: number; score: number; total: number; config: { drillMode: boolean } }[];
  onClearHistory: () => void;
  weak: { key: string; label: string; counts: GradeCounts }[];
  weakNoun: string;
  running: boolean;
  onShedWeak: () => void;
  onClearStats: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <>
      <View className="gap-2">
        <Text className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
          History
        </Text>
        {bestMs !== null ? (
          <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: colors.foreground }}>
            Best {formatDuration(bestMs)}
          </Text>
        ) : null}
        {history.length === 0 ? (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            No attempts yet with these settings.
          </Text>
        ) : (
          <View className="gap-1">
            {[...history]
              .sort((a, b) => b.at - a.at)
              .map((entry, i) => (
                <View key={i} className="flex-row items-center justify-between gap-3 border-b py-2" style={{ borderColor: colors['surface-hover'] }}>
                  <View>
                    <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: colors.foreground }}>
                      {formatDuration(entry.elapsedMs)}
                    </Text>
                    <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                      {entry.config.drillMode ? 'Drill' : 'Quiz'} · {new Date(entry.at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text className="font-ui text-sm tabular-nums" style={{ color: entry.score === entry.total ? GRADE_COLOR.correct : colors.muted }}>
                    {entry.score % 1 === 0 ? entry.score : entry.score.toFixed(1)}/{entry.total}
                  </Text>
                </View>
              ))}
          </View>
        )}
        {history.length > 0 ? (
          <Pressable onPress={onClearHistory}>
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
              Clear these times
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
          Struggles
        </Text>
        {weak.length === 0 ? (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            No struggles tracked yet — a wrong answer adds it here.
          </Text>
        ) : (
          <View className="gap-1">
            {weak.map((entry) => (
              <View key={entry.key} className="flex-row items-center justify-between gap-3 border-b py-2" style={{ borderColor: colors['surface-hover'] }}>
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                  {entry.label}
                </Text>
                <View className="flex-row items-center gap-2">
                  {entry.counts.incorrect > 0 ? (
                    <Text className="font-ui text-xs tabular-nums" style={{ color: GRADE_COLOR.incorrect }}>
                      ✕{entry.counts.incorrect}
                    </Text>
                  ) : null}
                  <Text className="font-ui text-xs tabular-nums" style={{ color: colors.muted }}>
                    /{attempts(entry.counts)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        <Pressable
          disabled={running || weak.length === 0}
          onPress={onShedWeak}
          className="self-start rounded-lg px-3 py-1.5"
          style={{ backgroundColor: colors.accent, opacity: running || weak.length === 0 ? 0.5 : 1 }}
        >
          <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
            Shed weak {weakNoun}
            {weak.length > 0 ? ` (${weak.length})` : ''}
          </Text>
        </Pressable>
        {weak.length > 0 ? (
          <Pressable disabled={running} onPress={onClearStats}>
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.danger, opacity: running ? 0.6 : 1 }}>
              Clear stats
            </Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

