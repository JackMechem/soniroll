import { formatPracticed } from '@jam-practice/core/practiceMinutes';
import {
  WEEKDAY_SHORT,
  addDays,
  dayStatus,
  formatTime,
  fromDateKey,
  goalOn,
  minutesOn,
  monthGrid,
  progressOf,
  routineSpan,
  routinesOn,
  startOfWeek,
  type DayRoutine,
  type DayStatus,
  type PracticeLogData,
} from '@jam-practice/core/practiceLog';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text, View } from 'react-native';

import { CheckIcon, CloseIcon } from '@/components/icons';
import { Bar, RoutineIcon, routineColor, useSuccess } from '@/components/shedLog/parts';
import { useGradeColors } from '@/components/tool/ear';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** The colour the day's own tasks show in (the website's slate). */
const TASK_COLOR = '#64748b';

function useStatusColors(): Record<DayStatus, string> {
  const g = useGradeColors();
  const { colors } = useAppTheme();
  return { done: g.correct, partial: g.partial, missed: colors.muted };
}

/**
 * The month (the website's `MonthView`, as it looks on a phone): each day tinted by its practice
 * against the goal (a heat map), green with a check when everything was done, a dot per routine,
 * a star on goal days. Tapping a day opens it.
 */
export function MonthView({ year, month, data, selected, today, onSelect }: { year: number; month: number; data: PracticeLogData; selected: string; today: string; onSelect: (date: string) => void }) {
  const { colors } = useAppTheme();
  const status = useStatusColors();
  const days = monthGrid(year, month);
  return (
    <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row" style={{ borderBottomWidth: 1, borderColor: withAlpha(colors.foreground, 0.08) }}>
        {WEEKDAY_SHORT.map((d) => (
          <Text key={d} className="font-ui flex-1 py-2 text-center text-xs" style={{ color: colors.muted }}>
            {d}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {days.map((key, i) => {
          const d = fromDateKey(key);
          const inMonth = d.getMonth() === month;
          const items = routinesOn(data, key);
          const tasks = data.days[key]?.tasks ?? [];
          const minutes = minutesOn(data, key);
          const goal = goalOn(data, key);
          const goalMet = goal > 0 && minutes >= goal;
          const heat = minutes > 0 ? 0.06 + 0.16 * Math.min(1, goal > 0 ? minutes / goal : 1) : 0;
          const past = key < today;
          const st = dayStatus(data, key, today);
          const tint = st && st !== 'missed' ? st : null;
          const isSel = key === selected;
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              accessibilityRole="button"
              accessibilityLabel={`${d.toDateString()}${minutes > 0 ? `, ${formatPracticed(minutes)} practiced` : ''}`}
              accessibilityState={{ selected: isSel }}
              style={{
                width: `${100 / 7}%`,
                minHeight: 64,
                padding: 3,
                gap: 3,
                borderLeftWidth: i % 7 ? 1 : 0,
                borderTopWidth: i >= 7 ? 1 : 0,
                borderColor: withAlpha(colors.foreground, 0.08),
                backgroundColor: tint ? withAlpha(status[tint], tint === 'partial' ? 0.14 : 0.16) : heat ? withAlpha(colors.accent, heat) : 'transparent',
                opacity: inMonth ? 1 : 0.55,
              }}
            >
              {isSel ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: colors.accent }} /> : null}
              <View className="flex-row items-center justify-between">
                <View className="h-6 min-w-6 items-center justify-center rounded-full px-1" style={{ backgroundColor: key === today ? colors.accent : 'transparent' }}>
                  <Text
                    className="font-ui-semibold text-xs font-semibold"
                    style={{ color: key === today ? colors['accent-foreground'] : inMonth && st !== 'missed' ? colors.foreground : colors.muted, fontVariant: ['tabular-nums'] }}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                {goalMet ? <MaterialCommunityIcons name="star" size={12} color="#fbbf24" /> : st && st !== 'missed' ? <StatusBadge status={st} /> : null}
              </View>
              <View className="flex-row flex-wrap px-0.5" style={{ gap: 2 }}>
                {items.map((it) => (
                  <RoutineDot key={it.routine.id} item={it} past={past} />
                ))}
                {tasks.length > 0 ? (
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      ...(tasks.every((t) => t.done) ? { backgroundColor: TASK_COLOR } : { borderWidth: 1.5, borderColor: TASK_COLOR, opacity: past ? 0.45 : 1 }),
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function RoutineDot({ item, past }: { item: DayRoutine; past: boolean }) {
  const { done, total } = progressOf(item.routine, item.occurrence);
  const complete = total > 0 && done === total && !item.occurrence.skipped;
  const color = routineColor(item.routine.color);
  return (
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        ...(complete ? { backgroundColor: color } : { borderWidth: 1.5, borderColor: color, opacity: item.occurrence.skipped ? 0.3 : past ? 0.45 : 1 }),
      }}
    />
  );
}

function StatusBadge({ status }: { status: DayStatus }) {
  const colors = useStatusColors();
  return (
    <View className="h-3.5 w-3.5 items-center justify-center rounded-full" style={{ backgroundColor: colors[status] }}>
      {status === 'done' ? <CheckIcon color="#ffffff" size={10} /> : <View style={{ width: 6, height: 2, borderRadius: 1, backgroundColor: '#ffffff' }} />}
    </View>
  );
}

/**
 * The week as a list of days (the website's phone week view): the date in its status colour, the
 * minutes and a bar toward the day's goal, each routine as a pill (icon, name, time, its progress)
 * and the day's own tasks as one pill. Tapping a day opens it.
 */
export function WeekList({ data, selected, today, onSelect }: { data: PracticeLogData; selected: string; today: string; onSelect: (date: string) => void }) {
  const { colors, derived } = useAppTheme();
  const success = useSuccess();
  const status = useStatusColors();
  const from = startOfWeek(selected);
  return (
    <View className="gap-2">
      {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((key) => {
        const d = fromDateKey(key);
        const items = routinesOn(data, key);
        const tasks = data.days[key]?.tasks ?? [];
        const minutes = minutesOn(data, key);
        const goal = goalOn(data, key);
        const st = dayStatus(data, key, today);
        const future = key > today;
        const isToday = key === today;
        const isSel = key === selected;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            accessibilityRole="button"
            accessibilityLabel={d.toDateString()}
            className="flex-row gap-3 rounded-xl p-3"
            style={{ backgroundColor: colors.surface, borderWidth: isSel ? 2 : 0, borderColor: colors.accent }}
          >
            <View className="w-[64px] gap-1">
              <Text className="font-ui text-xs" style={{ color: isToday ? colors.accent : colors.muted }}>
                {WEEKDAY_SHORT[d.getDay()]}
              </Text>
              <Text
                className="font-ui-bold text-xl font-bold"
                style={{ color: isToday ? colors.accent : st && st !== 'missed' ? status[st] : colors.foreground, fontVariant: ['tabular-nums'] }}
              >
                {d.getDate()}
              </Text>
              {!future ? (
                <>
                  <Text className="font-ui text-[11px]" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                    {minutes > 0 ? formatPracticed(minutes) : '–'}
                  </Text>
                  {goal > 0 ? <Bar frac={minutes / goal} color={minutes >= goal ? success : undefined} height={3} /> : null}
                </>
              ) : null}
            </View>
            <View className="flex-1 flex-row flex-wrap content-start gap-1.5">
              {items.length === 0 && tasks.length === 0 ? (
                <Text className="font-ui self-center text-sm" style={{ color: colors.muted }}>
                  {future || isToday ? 'Nothing planned' : minutes > 0 ? 'Practiced' : 'Rest day'}
                </Text>
              ) : null}
              {items.map((it) => {
                const p = progressOf(it.routine, it.occurrence);
                const span = routineSpan(it.routine, it.occurrence);
                const complete = p.total > 0 && p.done === p.total;
                const missed = !future && !isToday && !complete && !it.occurrence.skipped && p.total > 0;
                return (
                  <View key={it.routine.id} className="max-w-full flex-row items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5" style={{ backgroundColor: derived.fill, opacity: it.occurrence.skipped ? 0.5 : 1 }}>
                    <RoutineIcon icon={it.routine.icon} color={it.routine.color} size={20} />
                    <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.foreground, flexShrink: 1, textDecorationLine: it.occurrence.skipped ? 'line-through' : 'none' }}>
                      {it.routine.name || 'Routine'}
                      {span ? <Text style={{ color: colors.muted }}>{` ${formatTime(span.start)}`}</Text> : null}
                    </Text>
                    {complete ? (
                      <CheckIcon color={success} size={14} />
                    ) : missed ? (
                      <CloseIcon color={colors.muted} size={13} />
                    ) : p.total ? (
                      <Text className="font-ui text-[11px]" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                        {p.done}/{p.total}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              {tasks.length > 0 ? (
                <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: derived.fill }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TASK_COLOR }} />
                  <Text className="font-ui text-xs" style={{ color: colors.foreground }}>
                    {tasks.length === 1 ? tasks[0].title || 'Task' : `${tasks.length} tasks`}
                  </Text>
                  <Text className="font-ui text-[11px]" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                    {tasks.filter((t) => t.done).length}/{tasks.length}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The week's total and how many days met the goal. */
export function weekSummary(data: PracticeLogData, selected: string, today: string): string | null {
  const from = startOfWeek(selected);
  if (from > today) return null;
  let total = 0;
  let goalDays = 0;
  let hit = 0;
  for (let i = 0; i < 7; i++) {
    const key = addDays(from, i);
    const mins = minutesOn(data, key);
    const goal = goalOn(data, key);
    total += mins;
    if (goal > 0) {
      goalDays++;
      if (mins >= goal) hit++;
    }
  }
  return `${formatPracticed(total)}${goalDays > 0 ? ` · goal met ${hit} of ${goalDays} days` : ''}`;
}

