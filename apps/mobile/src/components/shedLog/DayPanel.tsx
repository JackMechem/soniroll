import { NAV_LINKS_DATA, currentToolHref, hrefToSlug } from '@jam-practice/core/navLinks';
import { formatPracticed } from '@jam-practice/core/practiceMinutes';
import {
  addDays,
  clearDayTime,
  dayProgress,
  formatLongDate,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  minutesOn,
  progressOf,
  routinesOn,
  type Attachment,
} from '@jam-practice/core/practiceLog';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  NAV_LINK_ICONS,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  StopwatchIcon,
} from '@/components/icons';
import { DayTasks } from '@/components/shedLog/DayTasks';
import { DayTimerCard, useDayTimerMs } from '@/components/shedLog/DayTimer';
import { Bar, ChecklistIcon, GhostIcon, Muted, Panel, RoutineIcon, Section, SmallButton, useSuccess } from '@/components/shedLog/parts';
import { RoutineCard } from '@/components/shedLog/RoutineCard';
import { LogTimeSheet } from '@/components/shedLog/sheets';
import { ToolTimeCard } from '@/components/shedLog/ToolTimeCard';
import { useToday } from '@/lib/useClock';
import type { PracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

const QUICK_LOG = [5, 10, 15, 30, 45, 60];

/**
 * Everything on one day (the website's `DayPanel`): the day's progress and the day timer, its
 * routines, extra tasks, time in tools to log (today), timed practice, logging time by hand, and
 * notes and attachments made on the website. Arrows step a day.
 */
export function DayPanel({ date, log, onDateChange }: { date: string; log: PracticeLog; onDateChange: (date: string) => void }) {
  const { colors } = useAppTheme();
  const success = useSuccess();
  const router = useRouter();
  const { data } = log;
  const day = data.days[date] ?? {};
  const items = routinesOn(data, date);
  const watch = useDayTimerMs(data, date);
  const minutes = minutesOn(data, date, watch.liveMs);
  const progress = dayProgress(data, date);
  const today = useToday();
  const isToday = date === today;
  const past = date < today;
  const progressParts = items.filter((i) => !i.occurrence.skipped && progressOf(i.routine, i.occurrence).total > 0).length + ((day.tasks?.length ?? 0) > 0 ? 1 : 0);
  const showProgress = progress.total > 0 && progressParts > 1;
  const hasProgress = showProgress || isToday || watch.ms > 0;
  const [addMenu, setAddMenu] = useState(false);
  const [logging, setLogging] = useState(false);
  const icon = (Icon: typeof CheckIcon) => <Icon color={colors.muted} size={16} />;
  const newRoutine = () => router.push({ pathname: '/tool/shed-log-routine-edit', params: { date } });
  const others = data.routines.filter((r) => !items.some((i) => i.routine.id === r.id));
  const openAdd = () => (others.length ? setAddMenu(true) : newRoutine());

  const logTime = (
    <Section icon={icon(StopwatchIcon)} title="Log time">
      <LogTimeCard date={date} log={log} minutes={minutes} onMore={() => setLogging(true)} />
    </Section>
  );

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-1">
        <GhostIcon Icon={ChevronLeftIcon} label="Previous day" onPress={() => onDateChange(addDays(date, -1))} color={colors.foreground} size={22} />
        <View className="flex-1 items-center">
          <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
            {formatLongDate(date)}
          </Text>
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {isToday ? 'Today · ' : ''}
            {minutes > 0 ? `${formatPracticed(minutes)} practiced` : 'Nothing logged yet'}
          </Text>
        </View>
        <GhostIcon Icon={ChevronRightIcon} label="Next day" onPress={() => onDateChange(addDays(date, 1))} color={colors.foreground} size={22} />
      </View>

      {hasProgress ? (
        <Section icon={icon(CheckIcon)} title="Progress">
          {showProgress ? (
            <View className="flex-row items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: colors.surface }}>
              <View className="flex-1">
                <Bar frac={progress.done / progress.total} color={progress.done === progress.total ? success : undefined} />
              </View>
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
                {progress.done === progress.total ? 'All done!' : `${progress.done} of ${progress.total} done`}
              </Text>
            </View>
          ) : null}
          <DayTimerCard data={data} date={date} onClear={() => log.updateDay(date, clearDayTime)} />
        </Section>
      ) : null}

      {past ? logTime : null}

      <Section icon={icon(RepeatIcon)} title="Routines" count={items.length || undefined} action={<SmallButton label="Add routine" Icon={PlusIcon} onPress={openAdd} />}>
        {items.length === 0 ? (
          <Pressable onPress={openAdd} accessibilityRole="button" className="rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
            <Muted>{data.routines.length === 0 ? 'No routines yet. Make one to plan what to practice and when.' : 'No routines on this day. Add one?'}</Muted>
          </Pressable>
        ) : (
          items.map((item) => <RoutineCard key={item.routine.id} date={date} item={item} log={log} />)
        )}
      </Section>

      <DayTasks date={date} log={log} icon={icon(ChecklistIcon)} />

      {isToday ? <ToolTimeCard icon={icon(StopwatchIcon)} sounds={data.prefs.sounds} /> : null}

      {(day.sessions?.length ?? 0) > 0 ? (
        <Section icon={icon(StopwatchIcon)} title="Timed practice" count={day.sessions!.length}>
          <Panel>
            {day.sessions!.map((s, i) => {
              const tool = s.tool ? NAV_LINKS_DATA.find((l) => l.href === currentToolHref(s.tool!)) : undefined;
              const Icon = (tool && NAV_LINK_ICONS[tool.href]) || StopwatchIcon;
              const at = new Date(s.at);
              return (
                <Pressable
                  key={i}
                  disabled={!tool}
                  onPress={() => tool && router.push(`/tool/${hrefToSlug(tool.href)}`)}
                  className="flex-row items-center gap-2"
                >
                  <Icon color={colors.muted} size={16} />
                  <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
                    {s.title}
                    {s.session !== s.title ? <Text style={{ color: colors.muted }}>{` · ${s.session}`}</Text> : null}
                  </Text>
                  <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                    {formatTime(at.getHours() * 60 + at.getMinutes())} · {formatPracticed(s.ms / 60000)}
                  </Text>
                </Pressable>
              );
            })}
          </Panel>
        </Section>
      ) : null}

      {!past ? logTime : null}

      {day.notes || (day.attachments?.length ?? 0) > 0 ? (
        <Section icon={icon(PencilIcon)} title="Notes">
          <Panel>
            {day.notes ? (
              <Text className="font-ui text-sm" style={{ color: colors.foreground }}>
                {day.notes}
              </Text>
            ) : null}
            {(day.attachments ?? []).map((a, i) => (
              <AttachmentRow key={i} item={a} />
            ))}
          </Panel>
        </Section>
      ) : null}

      <ActionSheet
        visible={addMenu}
        title="Add a routine"
        subtitle={formatShortDate(date)}
        onClose={() => setAddMenu(false)}
        actions={[
          { key: 'new', icon: <PlusIcon color={colors.muted} size={20} />, label: 'New routine', onPress: newRoutine },
          ...others.map((r) => ({
            key: r.id,
            icon: <RoutineIcon icon={r.icon} color={r.color} size={26} />,
            label: `Add ${r.name || 'Untitled routine'} to this day`,
            onPress: () => log.addToDay(date, r.id),
          })),
        ]}
      />
      <LogTimeSheet log={log} date={date} visible={logging} onClose={() => setLogging(false)} />
    </View>
  );
}

/** Time practiced without the timer: one tap adds it to the day's total (with Undo); "Other…"
    opens the sheet for any amount, or to put it on a particular task. */
function LogTimeCard({ date, log, minutes, onMore }: { date: string; log: PracticeLog; minutes: number; onMore: () => void }) {
  const { colors } = useAppTheme();
  const today = useToday();
  const [last, setLast] = useState<{ date: string; mins: number } | null>(null);
  const added = last?.date === date ? last.mins : 0;
  if (date > today) {
    return (
      <Panel>
        <Muted>You can log time once this day comes.</Muted>
      </Panel>
    );
  }
  return (
    <Panel>
      <View className="flex-row items-baseline gap-3">
        <View className="flex-1">
          <Muted>{date < today ? `Practiced on ${formatShortDate(date)}? Add the time to that day.` : 'Practiced without the timer? Add it to the day.'}</Muted>
        </View>
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
          {formatPracticed(minutes)}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {QUICK_LOG.map((m) => (
          <SmallButton
            key={m}
            label={`+${formatMinutesShort(m)}`}
            onPress={() => {
              log.addDayTime(date, m * 60000);
              setLast({ date, mins: added + m });
            }}
          />
        ))}
        <SmallButton label="Other…" onPress={onMore} />
      </View>
      {added > 0 ? (
        <View className="flex-row items-center justify-between gap-2 rounded-lg px-3 py-1.5" style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center gap-1.5">
            <CheckIcon color={colors.accent} size={16} />
            <Text className="font-ui text-sm" style={{ color: colors.foreground }}>
              Added {formatMinutesShort(added)}
            </Text>
          </View>
          <SmallButton
            label="Undo"
            onPress={() => {
              log.addDayTime(date, -added * 60000);
              setLast(null);
            }}
          />
        </View>
      ) : null}
    </Panel>
  );
}

/** Something attached on the website (a tune, setlist, chart or tool) — tools open; the rest show their name. */
function AttachmentRow({ item }: { item: Attachment }) {
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const href = item.kind === 'tool' ? currentToolHref(item.href) : null;
  const tool = href ? NAV_LINKS_DATA.find((l) => l.href === href) : undefined;
  const Icon = href ? NAV_LINK_ICONS[href] : undefined;
  const kind = item.kind === 'tune' ? 'Tune' : item.kind === 'setlist' ? 'Setlist' : item.kind === 'chart' ? 'Chart' : 'Tool';
  return (
    <Pressable
      disabled={!tool && item.kind !== 'chart'}
      onPress={() => {
        if (tool) router.push(`/tool/${hrefToSlug(tool.href)}`);
        else if (item.kind === 'chart') router.push({ pathname: '/tool/chord-charts-view', params: { id: item.id } });
      }}
      className="min-h-10 flex-row items-center gap-2 rounded-lg px-3"
      style={{ backgroundColor: derived.fill }}
    >
      {Icon ? <Icon color={colors.muted} size={16} /> : null}
      <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
        {item.label}
      </Text>
      <Text className="font-ui text-xs" style={{ color: colors.muted }}>
        {kind}
      </Text>
    </Pressable>
  );
}
