import { formatPracticed, practicedMinutes } from '@jam-practice/core/practiceMinutes';
import {
  MONTH_NAMES,
  WEEKDAY_LETTER,
  addDays,
  bestStreak,
  dayLevel,
  dayProgress,
  formatMinutesShort,
  fromDateKey,
  goalOn,
  hourMilestone,
  lifetimeMinutes,
  minutesOn,
  startOfWeek,
  streak,
  type PracticeLogData,
} from '@jam-practice/core/practiceLog';
import { isDarkColors } from '@jam-practice/core/themes';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useDayTimerMs } from '@/components/shedLog/DayTimer';
import { Bar, FLAME, FlameIcon, useSuccess } from '@/components/shedLog/parts';
import { ToolSheet } from '@/components/tool/SettingChip';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * The Shed Log's numbers on the phone: the line under the title (today against the goal, the
 * streak), the four stat cards (the website's `Momentum`: today's goal, the streak, this week,
 * in total), the last 18 weeks as a grid of days (`HeatGrid`) and the Stats sheet with all of them.
 */

/** Today's minutes against the goal (a thin bar; tap to change the goal) and the streak. */
export function TodaySummary({ data, today, onGoal }: { data: PracticeLogData; today: string; onGoal: () => void }) {
  const { colors } = useAppTheme();
  const success = useSuccess();
  const watch = useDayTimerMs(data, today);
  const minutes = minutesOn(data, today, watch.liveMs);
  const goal = goalOn(data, today);
  const met = goal > 0 && minutes >= goal;
  const s = streak(data, today);
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      <Pressable onPress={onGoal} accessibilityRole="button" accessibilityLabel="Today's goal — change it" hitSlop={6} className="flex-row items-center gap-2">
        {goal > 0 ? (
          <View style={{ width: 56 }}>
            <Bar frac={minutes / goal} color={met ? success : undefined} height={4} />
          </View>
        ) : null}
        <Text className="font-ui text-sm" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {goal > 0 ? `${practicedMinutes(minutes)} of ${goal} min today` : `${practicedMinutes(minutes)} min today`}
          {met ? ' · goal met' : ''}
        </Text>
      </Pressable>
      <View className="flex-row items-center gap-1">
        <FlameIcon color={minutes > 0 && s > 0 ? FLAME : colors.muted} size={15} />
        <Text className="font-ui text-sm" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {s}-day streak
        </Text>
      </View>
    </View>
  );
}

function StatCard({ label, action, value, aside, children }: { label: string; action?: ReactNode; value: ReactNode; aside?: ReactNode; children?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
      <View className="min-h-5 flex-row items-center justify-between gap-2">
        <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
          {label}
        </Text>
        {action}
      </View>
      <View className="flex-row items-baseline justify-between gap-2">
        {value}
        {aside}
      </View>
      {children}
    </View>
  );
}

/** The big number; words in it ("1 h 24 min") and the unit small and muted. */
function Value({ value, unit }: { value: string | number; unit?: string }) {
  const { colors } = useAppTheme();
  const parts = String(value).split(/(<?[\d.:]+)/).filter(Boolean);
  return (
    <Text className="font-ui-semibold text-2xl font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
      {parts.map((p, i) =>
        /^<?[\d.:]+$/.test(p) ? (
          <Text key={i}>{p}</Text>
        ) : (
          <Text key={i} className="font-ui text-sm" style={{ color: colors.muted }}>
            {p}
          </Text>
        ),
      )}
      {unit ? (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          {` ${unit}`}
        </Text>
      ) : null}
    </Text>
  );
}

function Note({ children, tone }: { children: ReactNode; tone?: 'warn' | 'good' }) {
  const { colors } = useAppTheme();
  const success = useSuccess();
  return (
    <Text className="font-ui text-xs" style={{ color: tone === 'warn' ? FLAME : tone === 'good' ? success : colors.muted }}>
      {children}
    </Text>
  );
}

function hoursNote(hours: number, to: number): string {
  if (hours <= 0) return 'Your first hour starts with one session';
  const left = Math.max(1, Math.round((to - hours) * 60));
  if (to === 1) return left >= 60 ? 'Your first hour is under way' : `${formatMinutesShort(left)} to your first hour`;
  return `${formatMinutesShort(left)} to ${to} hours`;
}

/** The four stat cards (the website's `Momentum`). */
export function Momentum({ data, today, onGoal }: { data: PracticeLogData; today: string; onGoal: () => void }) {
  const { colors } = useAppTheme();
  const success = useSuccess();
  const goal = goalOn(data, today);
  const watch = useDayTimerMs(data, today);
  const minutes = minutesOn(data, today, watch.liveMs);
  const progress = dayProgress(data, today);
  const s = streak(data, today);
  const best = Math.max(s, bestStreak(data));
  const practicedToday = minutes > 0;
  const frac = goal > 0 ? Math.min(1, minutes / goal) : 0;
  const met = goal > 0 && minutes >= goal;
  const left = Math.max(0, Math.ceil(goal - minutes));
  const goalMessage =
    goal <= 0
      ? minutes > 0
        ? 'Practicing on a rest day — nice'
        : 'A rest day, no goal today'
      : met
        ? minutes - goal >= 1
          ? `Goal smashed! +${formatMinutesShort(Math.round(minutes - goal))} bonus`
          : 'Goal reached!'
        : minutes > 0
          ? `${formatMinutesShort(left)} to go — you've got this`
          : "Let's get some practice in";

  const weekStart = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(weekStart, i);
    return { key, minutes: minutesOn(data, key), goal: goalOn(data, key) };
  });
  const weekTotal = week.reduce((a, d) => a + d.minutes, 0);
  const lastWeek = Array.from({ length: 7 }, (_, i) => minutesOn(data, addDays(weekStart, i - 7))).reduce((a, b) => a + b, 0);
  const daysHit = week.filter((d) => d.goal > 0 && d.minutes >= d.goal).length;
  const goalDays = week.filter((d) => d.goal > 0).length;
  const weekChange = lastWeek > 0 ? Math.round(((weekTotal - lastWeek) / lastWeek) * 100) : null;
  const weekMax = Math.max(1, ...week.map((d) => Math.max(d.minutes, d.goal)));

  const hours = lifetimeMinutes(data) / 60;
  const ms = hourMilestone(hours);

  return (
    <View className="gap-3">
      <StatCard
        label={goal > 0 ? "Today's goal" : 'Today · rest day'}
        action={
          <Pressable onPress={onGoal} hitSlop={8} accessibilityRole="button">
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              {goal > 0 ? 'Change' : 'Set a goal'}
            </Text>
          </Pressable>
        }
        value={<Value value={practicedMinutes(minutes)} unit={goal > 0 ? `/ ${goal} min` : 'min'} />}
        aside={
          goal > 0 ? (
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              {Math.round(frac * 100)}%
            </Text>
          ) : undefined
        }
      >
        {goal > 0 ? <Bar frac={frac} color={met ? success : undefined} /> : null}
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
          <Note tone={met ? 'good' : undefined}>{goalMessage}</Note>
          {progress.total > 0 ? <Note>{`${progress.done}/${progress.total} tasks`}</Note> : null}
        </View>
      </StatCard>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <StatCard
            label="Streak"
            value={
              <View className="flex-row items-center gap-1.5">
                <Value value={s} unit={s === 1 ? 'day' : 'days'} />
                <FlameIcon color={practicedToday ? FLAME : s > 0 ? withAlpha(FLAME, 0.6) : colors.muted} size={20} />
              </View>
            }
          >
            <Note tone={!practicedToday && s > 0 ? 'warn' : undefined}>
              {practicedToday
                ? s >= best && s > 1
                  ? 'Your best streak ever. Keep it rolling.'
                  : `Best: ${best} day${best === 1 ? '' : 's'}`
                : s > 0
                  ? `Practice today to keep your ${s}-day streak alive.`
                  : 'Practice today to start a streak.'}
            </Note>
          </StatCard>
        </View>
        <View className="flex-1">
          <StatCard
            label="In total"
            value={hours < 1 ? <Value value={formatPracticed(hours * 60)} /> : <Value value={hours < 10 ? hours.toFixed(1) : Math.floor(hours)} unit="h" />}
          >
            <Bar frac={Math.max(0.03, Math.min(1, (hours - ms.from) / (ms.to - ms.from)))} />
            <Note>{hoursNote(hours, ms.to)}</Note>
          </StatCard>
        </View>
      </View>

      <StatCard
        label="This week"
        action={
          weekChange !== null ? (
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: weekChange >= 0 ? success : colors.muted }}>
              {weekChange >= 0 ? '▲' : '▼'} {Math.abs(weekChange)}%
            </Text>
          ) : undefined
        }
        value={<Value value={formatPracticed(weekTotal)} />}
      >
        <View className="h-14 flex-row items-end gap-1.5">
          {week.map((d) => {
            const hit = d.goal > 0 && d.minutes >= d.goal;
            return (
              <View key={d.key} className="flex-1 items-center gap-1">
                <View className="h-10 w-full justify-end overflow-hidden rounded" style={{ backgroundColor: withAlpha(colors.foreground, 0.06) }}>
                  <View style={{ height: `${Math.min(100, (d.minutes / weekMax) * 100)}%`, backgroundColor: hit ? success : colors.accent, borderRadius: 3 }} />
                </View>
                <Text className="font-ui text-[10px]" style={{ color: d.key === today ? colors.foreground : colors.muted }}>
                  {WEEKDAY_LETTER[fromDateKey(d.key).getDay()]}
                </Text>
              </View>
            );
          })}
        </View>
        <Note>{goalDays > 0 ? `Goal hit ${daysHit} of ${goalDays} days` : 'Set a daily goal to track your week'}</Note>
      </StatCard>
    </View>
  );
}

// GitHub's greens, as on the website (`--heat-1…4`, light and dark).
const HEAT_LIGHT = ['#9be9a8', '#40c463', '#30a14e', '#216e39'];
const HEAT_DARK = ['#0e4429', '#006d32', '#26a641', '#39d353'];

/** The last few months as a grid of days (a column per week), greener for more practice. Tapping a
    day opens it. */
export function HeatGrid({ data, today, weeks: count = 18, onOpenDay }: { data: PracticeLogData; today: string; weeks?: number; onOpenDay?: (date: string) => void }) {
  const { colors } = useAppTheme();
  const heat = isDarkColors(colors) ? HEAT_DARK : HEAT_LIGHT;
  const levels = [colors['surface-hover'], ...heat];
  const first = addDays(startOfWeek(today), -(count - 1) * 7);
  let practiced = 0;
  const weeks = Array.from({ length: count }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const key = addDays(first, w * 7 + d);
      const m = key > today ? -1 : minutesOn(data, key);
      if (m > 0) practiced++;
      return { key, m };
    }),
  );
  return (
    <View className="gap-2">
      <View className="flex-row justify-between">
        {weeks
          .filter((_, i) => i % 4 === 0)
          .map((wk) => (
            <Text key={wk[0].key} className="font-ui text-[10px]" style={{ color: colors.muted }}>
              {MONTH_NAMES[fromDateKey(wk[0].key).getMonth()].slice(0, 3)}
            </Text>
          ))}
      </View>
      <View className="flex-row" style={{ gap: 3 }}>
        {weeks.map((wk, w) => (
          <View key={w} className="flex-1" style={{ gap: 3 }}>
            {wk.map(({ key, m }) => (
              <Pressable
                key={key}
                disabled={m < 0 || !onOpenDay}
                onPress={() => onOpenDay?.(key)}
                accessibilityLabel={m < 0 ? undefined : `${fromDateKey(key).toDateString()}, ${m > 0 ? formatPracticed(m) : 'no practice'}`}
                style={{
                  aspectRatio: 1,
                  borderRadius: 3,
                  backgroundColor: m < 0 ? 'transparent' : levels[dayLevel(m, goalOn(data, key))],
                  borderWidth: key === today ? 2 : 0,
                  borderColor: colors.accent,
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          {practiced} day{practiced === 1 ? '' : 's'} in {count} weeks
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            Less
          </Text>
          {levels.map((c) => (
            <View key={c} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
          ))}
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            More
          </Text>
        </View>
      </View>
    </View>
  );
}

/** "Your stats" (the website's `StatsDialog`): the cards, the last 18 weeks and a summary. */
export function StatsSheet({ data, today, visible, onClose, onGoal, onOpenDay }: { data: PracticeLogData; today: string; visible: boolean; onClose: () => void; onGoal: () => void; onOpenDay: (date: string) => void }) {
  const { colors } = useAppTheme();
  const monthStart = `${today.slice(0, 8)}01`;
  let month = 0;
  for (let k = monthStart; k <= today; k = addDays(k, 1)) month += minutesOn(data, k);
  const practicedDays = Object.keys(data.days).filter((k) => minutesOn(data, k) > 0);
  const total = lifetimeMinutes(data);
  const best = bestStreak(data);
  const numbers: [string, string][] = [
    ['This month', formatPracticed(month)],
    ['Best streak', `${best} day${best === 1 ? '' : 's'}`],
    ['Days practiced', String(practicedDays.length)],
    ['Average practice day', practicedDays.length ? formatPracticed(total / practicedDays.length) : '—'],
  ];
  return (
    <ToolSheet visible={visible} onClose={onClose} title="Your stats">
      <Momentum data={data} today={today} onGoal={onGoal} />
      <View className="gap-2 rounded-xl p-4" style={{ backgroundColor: colors.background }}>
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          Your practice
        </Text>
        <HeatGrid data={data} today={today} onOpenDay={onOpenDay} />
      </View>
      <View className="rounded-xl px-4 py-1" style={{ backgroundColor: colors.background }}>
        {numbers.map(([label, value], i) => (
          <View key={label} className="flex-row items-center justify-between py-2.5" style={{ borderTopWidth: i ? 1 : 0, borderColor: withAlpha(colors.foreground, 0.08) }}>
            <Text className="font-ui text-sm" style={{ color: colors.muted }}>
              {label}
            </Text>
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </ToolSheet>
  );
}
