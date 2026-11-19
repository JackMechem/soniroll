import { useConvexAuth } from '@convex-dev/auth/react';
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  addDays,
  addMonths,
  formatShortDate,
  fromDateKey,
  isDateKey,
  newDayTask,
  startOfWeek,
  type DayTask,
} from '@jam-practice/core/practiceLog';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentType } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RepeatIcon, SlidersIcon, SpeakerIcon, TargetIcon, type IconProps } from '@/components/icons';
import { MonthView, WeekList, weekSummary } from '@/components/shedLog/Calendar';
import { DayPanel } from '@/components/shedLog/DayPanel';
import { GhostIcon, RoutinesIcon, SoundOffIcon, StatsIcon } from '@/components/shedLog/parts';
import { ShedLogGate } from '@/components/shedLog/ShedLogGate';
import { GoalSheet, TaskSheet } from '@/components/shedLog/sheets';
import { StatsSheet, TodaySummary } from '@/components/shedLog/Stats';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { Segmented } from '@/components/tool/reward';
import { useToday } from '@/lib/useClock';
import { usePracticeLog } from '@/lib/usePracticeLog';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';

/** The calendar's last view — the website's key, so the two remember the same one. */
const VIEW_KEY = 'jam-practice-practice-log-view';
const VIEW_DEFAULTS = { view: 'month' };

/**
 * The Shed Log on the phone — the native port of the website's `/shed-log`
 * (`apps/web/components/PracticeLog.tsx`), laid out like the website's phone layout: the title line
 * (today against the goal and the streak), labelled buttons (Stats, Routines, Settings, New), then
 * two tabs — the day (routines to check off and run on the timer, extra tasks, the day timer, time
 * in tools to log, logging time) and the calendar (month or week; a day opens it). For account
 * holders: signed out, it shows what it is and Sign in.
 *
 * Left out from the website: the time-grid week and day views (drag to schedule) — the phone's
 * week is the website's phone list; recordings and clips on a day; Shed Notes and attaching
 * tunes / charts (shown when made on the website); progress cards and the day report; the tour.
 */
function ShedLogScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const log = usePracticeLog();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedLogGate />;
  if (!log.ready) return <ScreenSpinner label="Loading your Shed Log" />;
  return <ShedLog log={log} />;
}

export default withScreenLoader(ShedLogScreen);

function ShedLog({ log }: { log: ReturnType<typeof usePracticeLog> }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const today = useToday();
  const [picked, setPicked] = useState<string | null>(isDateKey(dateParam) ? dateParam : null);
  const selected = picked ?? today;
  const [pane, setPane] = useState<'day' | 'calendar'>('day');
  // Opened again with another day (a routine's "Coming up", Home): show that day.
  const [seenParam, setSeenParam] = useState(dateParam);
  if (dateParam !== seenParam) {
    setSeenParam(dateParam);
    if (isDateKey(dateParam)) {
      setPicked(dateParam);
      setPane('day');
    }
  }
  const [{ view: savedView }, setView] = useSyncedSettings(VIEW_KEY, VIEW_DEFAULTS);
  const view: 'month' | 'week' = savedView === 'week' ? 'week' : 'month';
  const [statsOpen, setStatsOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newTask, setNewTask] = useState<DayTask | null>(null);
  const scroll = useRef<ScrollView>(null);
  const bottom = useTabBarSpace(96);
  const { data } = log;

  const showPane = (p: 'day' | 'calendar') => {
    setPane(p);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const openDay = (date: string) => {
    setPicked(date);
    showPane('day');
  };

  const d = fromDateKey(selected);
  const thisYear = fromDateKey(today).getFullYear();
  const weekFrom = startOfWeek(selected);
  const weekTo = addDays(weekFrom, 6);
  const calTitle =
    view === 'month'
      ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      : `${formatShortDate(weekFrom)} – ${fromDateKey(weekFrom).getMonth() === fromDateKey(weekTo).getMonth() ? fromDateKey(weekTo).getDate() : formatShortDate(weekTo)}${fromDateKey(weekTo).getFullYear() !== thisYear ? `, ${fromDateKey(weekTo).getFullYear()}` : ''}`;
  const summary = view === 'week' ? weekSummary(data, selected, today) : null;
  const step = (n: number) => setPicked(view === 'month' ? addMonths(selected, n) : addDays(selected, 7 * n));
  const dayLabel = selected === today ? 'Today' : `${WEEKDAY_SHORT[d.getDay()]}, ${formatShortDate(selected)}`;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Shed Log' }} />
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottom, gap: 16 }}
      >
        <TodaySummary data={data} today={today} onGoal={() => setGoalOpen(true)} />

        <View className="flex-row gap-2">
          <HeaderButton Icon={StatsIcon} label="Stats" onPress={() => setStatsOpen(true)} />
          <HeaderButton Icon={RoutinesIcon} label={data.routines.length ? `Routines ${data.routines.length}` : 'Routines'} onPress={() => router.push('/tool/shed-log-routines')} />
          <HeaderButton Icon={SlidersIcon} label="Settings" onPress={() => setSettingsOpen(true)} />
          <HeaderButton Icon={PlusIcon} label="New" primary onPress={() => setNewOpen(true)} />
        </View>

        <View className="flex-row gap-5" style={{ borderBottomWidth: 1, borderColor: colors['surface-hover'] }} accessibilityRole="tablist">
          {(
            [
              ['day', dayLabel],
              ['calendar', 'Calendar'],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => showPane(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: pane === id }}
              className="h-11 justify-center"
              style={{ borderBottomWidth: 2, borderColor: pane === id ? colors.foreground : 'transparent', marginBottom: -1 }}
            >
              <Text className={pane === id ? 'font-ui-semibold text-[15px] font-semibold' : 'font-ui text-[15px]'} style={{ color: pane === id ? colors.foreground : colors.muted }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {pane === 'day' ? (
          <DayPanel date={selected} log={log} onDateChange={setPicked} />
        ) : (
          <View className="gap-3">
            <View className="flex-row items-center gap-1">
              <GhostIcon Icon={ChevronLeftIcon} label={`Previous ${view}`} onPress={() => step(-1)} color={colors.foreground} size={22} />
              <GhostIcon Icon={ChevronRightIcon} label={`Next ${view}`} onPress={() => step(1)} color={colors.foreground} size={22} />
              <View className="flex-1">
                <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                  {calTitle}
                </Text>
                {summary ? (
                  <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                    {summary}
                  </Text>
                ) : null}
              </View>
              {selected !== today ? (
                <Pressable onPress={() => setPicked(today)} accessibilityRole="button" hitSlop={6} className="rounded-lg px-3 py-1.5" style={{ backgroundColor: colors.surface }}>
                  <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                    Today
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Segmented
              label="Calendar view"
              onPage
              value={view}
              onChange={(v) => setView({ view: v })}
              options={[
                { value: 'month', label: 'Month' },
                { value: 'week', label: 'Week' },
              ]}
            />
            {view === 'month' ? (
              <MonthView year={d.getFullYear()} month={d.getMonth()} data={data} selected={selected} today={today} onSelect={openDay} />
            ) : (
              <WeekList data={data} selected={selected} today={today} onSelect={openDay} />
            )}
          </View>
        )}
      </ScrollView>

      <StatsSheet
        data={data}
        today={today}
        visible={statsOpen}
        onClose={() => setStatsOpen(false)}
        onGoal={() => {
          setStatsOpen(false);
          setGoalOpen(true);
        }}
        onOpenDay={(date) => {
          setStatsOpen(false);
          openDay(date);
        }}
      />
      <GoalSheet log={log} visible={goalOpen} onClose={() => setGoalOpen(false)} />
      <ActionSheet
        visible={settingsOpen}
        title="Shed Log settings"
        onClose={() => setSettingsOpen(false)}
        actions={[
          { key: 'goal', icon: <TargetIcon color={colors.muted} size={20} />, label: 'Daily goal…', onPress: () => setGoalOpen(true) },
          {
            key: 'sounds',
            icon: data.prefs.sounds ? <SpeakerIcon color={colors.foreground} size={20} /> : <SoundOffIcon color={colors.muted} size={20} />,
            label: data.prefs.sounds ? 'Sounds: on' : 'Sounds: off',
            onPress: () => log.setPrefs({ sounds: !data.prefs.sounds }),
          },
        ]}
      />
      <ActionSheet
        visible={newOpen}
        title="New"
        onClose={() => setNewOpen(false)}
        actions={[
          { key: 'task', icon: <PlusIcon color={colors.muted} size={20} />, label: `Task on ${selected === today ? 'today' : formatShortDate(selected)}`, onPress: () => setNewTask(newDayTask()) },
          { key: 'routine', icon: <RepeatIcon color={colors.muted} size={20} />, label: 'Routine', onPress: () => router.push({ pathname: '/tool/shed-log-routine-edit', params: { date: selected } }) },
        ]}
      />
      <TaskSheet
        initial={newTask}
        date={selected}
        isNew
        visible={!!newTask}
        onSave={(task, to) => {
          log.saveDayTask(to, task);
          setPicked(to);
          showPane('day');
        }}
        onClose={() => setNewTask(null)}
      />
    </View>
  );
}

/** A header button: an icon over a short label, sharing the row (the website's phone header). */
function HeaderButton({ Icon, label, onPress, primary }: { Icon: ComponentType<IconProps>; label: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useAppTheme();
  const fg = primary ? colors['accent-foreground'] : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
      className="h-14 flex-1 items-center justify-center gap-0.5 overflow-hidden rounded-xl"
      style={{ backgroundColor: primary ? colors.accent : colors.surface }}
    >
      <Icon color={primary ? fg : colors.muted} size={20} />
      <Text numberOfLines={1} className="font-ui-semibold text-[13px] font-semibold" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}
