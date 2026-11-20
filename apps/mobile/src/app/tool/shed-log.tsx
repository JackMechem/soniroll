import { useConvexAuth } from '@convex-dev/auth/react';
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  addDays,
  addMonths,
  formatShortDate,
  fromDateKey,
  isDateKey,
  startOfWeek,
} from '@jam-practice/core/practiceLog';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { ChevronLeftIcon, ChevronRightIcon, DotsVerticalIcon, SpeakerIcon, TargetIcon } from '@/components/icons';
import { MonthView, WeekList, weekSummary } from '@/components/shedLog/Calendar';
import { DayPanel } from '@/components/shedLog/DayPanel';
import { GhostIcon, RoutinesIcon, SoundOffIcon, StatsIcon } from '@/components/shedLog/parts';
import { ShedLogGate } from '@/components/shedLog/ShedLogGate';
import { GoalSheet } from '@/components/shedLog/sheets';
import { StatsSheet, TodaySummary } from '@/components/shedLog/Stats';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { TabHeader } from '@/components/TabHeader';
import { Segmented } from '@/components/tool/reward';
import { IconButton, useScrolled } from '@/components/ui';
import { useToday } from '@/lib/useClock';
import { usePracticeLog } from '@/lib/usePracticeLog';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';

/** The calendar's last view — the website's key, so the two remember the same one. */
const VIEW_KEY = 'jam-practice-practice-log-view';
const VIEW_DEFAULTS = { view: 'month' };

/**
 * The Shed Log on the phone — one of the five main screens (a tab, so no back button), the native
 * port of the website's `/shed-log` (`apps/web/components/PracticeLog.tsx`): the header (Stats, and
 * ⋮ for your routines, the daily goal and sounds), today against the goal and the streak, then
 * two tabs — the day (routines to check off and run on the timer, tasks for the day, the day timer,
 * time in tools to log, logging time) and the calendar (month or week; a day opens it). Adding is
 * done where it happens (Add routine, the task box), not from a header button. For account
 * holders: signed out, it shows what it is and Sign in.
 *
 * Left out from the website: the time-grid week and day views (drag to schedule) — the phone's
 * week is the website's phone list; recordings and clips on a day; Shed Notes and attaching
 * tunes / charts (shown when made on the website); progress cards and the day report; the tour.
 */
function ShedLogScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const log = usePracticeLog();
  if (isLoading) return <Frame><ScreenSpinner /></Frame>;
  if (!isAuthenticated) return <Frame><ShedLogGate /></Frame>;
  if (!log.ready) return <Frame><ScreenSpinner label="Loading your Shed Log" /></Frame>;
  return <ShedLog log={log} />;
}

/** The main-screen frame: the safe area at the top and the tab header. */
function Frame({ children, right, scrolled }: { children: ReactNode; right?: ReactNode; scrolled?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <TabHeader title="Shed Log" right={right} scrolled={scrolled} />
        {children}
      </SafeAreaView>
    </View>
  );
}

export default withScreenLoader(ShedLogScreen);

function ShedLog({ log }: { log: ReturnType<typeof usePracticeLog> }) {
  const { colors, derived } = useAppTheme();
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
  const scroll = useRef<ScrollView>(null);
  const { scrolled, onScroll, scrollEventThrottle } = useScrolled();
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
    <Frame
      scrolled={scrolled}
      right={
        <>
          <IconButton Icon={StatsIcon} label="Stats" onPress={() => setStatsOpen(true)} />
          <IconButton Icon={DotsVerticalIcon} label="More: routines, daily goal, sounds" onPress={() => setSettingsOpen(true)} />
        </>
      }
    >
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottom, gap: 16 }}
      >
        <TodaySummary data={data} today={today} onGoal={() => setGoalOpen(true)} />

        <View className="flex-row gap-5" style={{ borderBottomWidth: 1, borderColor: derived.hairline }} accessibilityRole="tablist">
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
              style={{ borderBottomWidth: 3, borderColor: pane === id ? colors.accent : 'transparent', marginBottom: -1 }}
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
        title="Shed Log"
        onClose={() => setSettingsOpen(false)}
        actions={[
          {
            key: 'routines',
            icon: <RoutinesIcon color={colors.muted} size={20} />,
            label: data.routines.length ? `Your routines (${data.routines.length})` : 'Your routines',
            onPress: () => router.push('/tool/shed-log-routines'),
          },
          { key: 'goal', icon: <TargetIcon color={colors.muted} size={20} />, label: 'Daily goal…', onPress: () => setGoalOpen(true) },
          {
            key: 'sounds',
            icon: data.prefs.sounds ? <SpeakerIcon color={colors.foreground} size={20} /> : <SoundOffIcon color={colors.muted} size={20} />,
            label: data.prefs.sounds ? 'Sounds: on' : 'Sounds: off',
            onPress: () => log.setPrefs({ sounds: !data.prefs.sounds }),
          },
        ]}
      />
    </Frame>
  );
}
