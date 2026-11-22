import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import {
  describeRepeat,
  formatLongDate,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  nextOccurrences,
  parseTime,
  progressOf,
  routinesOn,
  totalMinutes,
  type Occurrence,
  type Routine as RoutineData,
} from '@jam-practice/core/practiceLog';
import { targetKey } from '@jam-practice/core/shedNotes';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { PencilIcon, ShareIcon } from '@/components/icons';
import { useRecordingPlayer } from '@/components/recordings/RecordingParts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { HistoryRow, PageHeader, PageNotes, Quiet, RecordingList, Rows } from '@/components/shedLog/pageParts';
import { Muted, Panel, Section, SmallButton, routineColor } from '@/components/shedLog/parts';
import { RoutineCard } from '@/components/shedLog/RoutineCard';
import { RoutineShareSheet } from '@/components/shedLog/RoutineShareSheet';
import { ShedLogGate } from '@/components/shedLog/ShedLogGate';
import { IconButton } from '@/components/ui';
import { useDeviceUrls } from '@/lib/deviceFiles';
import { recordingsApi, type Recording } from '@/lib/recordings';
import { taskRoute } from '@/lib/shedLogPages';
import { useToday } from '@/lib/useClock';
import { usePracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

const ROUTE = 'tool/shed-log-routine';

/** Minutes logged for a routine on a day: timer time, or a checked task's planned minutes. */
function minutesFor(routine: RoutineData, occ: Occurrence): number {
  let ms = 0;
  const spent = occ.spentMs ?? {};
  for (const v of Object.values(spent)) ms += v;
  for (const id of occ.done ?? []) {
    if (spent[id] !== undefined) continue;
    const t = routine.tasks.find((x) => x.id === id);
    if (t) ms += t.minutes * 60000;
  }
  return ms / 60000;
}

/**
 * One routine's screen (the website's `/shed-log/routine`), `?id=…&date=…` (the Shed Log day it was
 * opened from, else today). The header has its name and one line of facts ("Every Sunday · 20 min
 * · 2 tasks") with Share and Edit. Then that day: its card from the Shed Log (progress, Start, the
 * running timer, the tasks to tick — each opens its own screen — its clips and notes for the day),
 * or "It isn't on today" with Add. Then its **Notes** (a Shed Note of the routine's own, linking each
 * task's notes), when it's **Coming up**, the **recordings from other days**, and its **History**.
 * The tasks and that day's recordings aren't repeated: the card has them.
 */
function RoutineScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const log = usePracticeLog();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedLogGate />;
  if (!log.ready) return <ScreenSpinner />;
  return <Routine log={log} />;
}

export default withScreenLoader(RoutineScreen);

function Routine({ log }: { log: ReturnType<typeof usePracticeLog> }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const id = params.id ?? '';
  const today = useToday();
  const [sharing, setSharing] = useState(false);
  const bottom = useTabBarSpace(96);
  const player = useRecordingPlayer();
  const create = useMutation(api.shedNotes.create);
  const routine = log.data.routines.find((r) => r.id === id);

  // `useDeviceUrls`: a clip kept on this phone (no storage plan) plays here too.
  const recordings = useDeviceUrls(useQuery(recordingsApi.listForRoutine, id ? { routineId: id } : 'skip'));
  // The routine's notes and its tasks' notes (`routine:<id>` and `routine:<id>/task:<task>`).
  const routineKey = targetKey({ kind: 'routineNotes', routineId: id });
  const notesUnder = useQuery(api.shedNotes.attachedTo, id ? { prefix: routineKey } : 'skip');

  const history = useMemo(
    () =>
      Object.entries(log.data.days)
        .filter(([, day]) => day.routines?.[id])
        .map(([d, day]) => ({ date: d, occ: day.routines![id] }))
        .filter(({ occ }) => (occ.done?.length ?? 0) > 0 || Object.keys(occ.spentMs ?? {}).length > 0 || occ.notes || occ.skipped)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [log.data.days, id],
  );

  const byDate = useMemo(() => {
    const m = new Map<string, Recording[]>();
    for (const r of recordings ?? []) {
      const key = r.logDate ?? '';
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [recordings]);

  if (!routine) {
    return (
      <View className="flex-1 p-4" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Routine' }} />
        <Quiet>That routine doesn&apos;t exist anymore.</Quiet>
      </View>
    );
  }

  const name = routine.name || 'Untitled routine';
  const color = routineColor(routine.color);
  const upcoming = nextOccurrences(routine.repeat, today, 6);
  const start = parseTime(routine.startTime);
  const openDay = (d: string) => router.dismissTo({ pathname: '/tool/shed-log', params: { date: d } });

  // A new routine note starts with a link to each of its tasks' notes there already.
  const taskNotes = (notesUnder ?? []).filter((n) => n.target.startsWith(`${routineKey}/task:`));
  const routineNoteBody = () => {
    const ordered = routine.tasks.flatMap((t) => taskNotes.filter((n) => n.target === `${routineKey}/task:${t.id}`));
    return ordered.length ? `## Tasks\n${ordered.map((n) => `- [[${n.title}]]`).join('\n')}\n\n` : '';
  };

  // The day it's looked at for (the Shed Log's day it was opened from; else today): its card.
  const day = params.date || today;
  const dayName = day === today ? 'today' : formatShortDate(day);
  const dayItem = routinesOn(log.data, day).find((r) => r.routine.id === routine.id);
  const otherDays = byDate.filter(([d]) => d !== day);
  const facts = [
    describeRepeat(routine.repeat),
    start !== null ? formatTime(start) : null,
    formatMinutesShort(totalMinutes(routine)),
    `${routine.tasks.length} task${routine.tasks.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <PageHeader
        title={name}
        facts={facts}
        routeName={ROUTE}
        actions={
          <>
            <IconButton Icon={ShareIcon} label="Share this routine" onPress={() => setSharing(true)} />
            {/* A teacher's routine is theirs to change (edits here would be overwritten by theirs). */}
            {!routine.assigned ? (
              <IconButton Icon={PencilIcon} label="Edit this routine" onPress={() => router.push({ pathname: '/tool/shed-log-routine-edit', params: { id: routine.id } })} />
            ) : null}
          </>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottom, gap: 24 }}>
        {routine.assigned || routine.description ? (
          <View className="gap-1.5">
            {routine.assigned ? (
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                From {routine.assigned.teacher} · they see how it goes
              </Text>
            ) : null}
            {routine.description ? (
              <Text className="font-ui text-[15px] leading-6" style={{ color: colors.foreground }}>
                {routine.description}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Section title={day === today ? 'Today' : formatLongDate(day)}>
          {dayItem ? (
            <RoutineCard
              date={day}
              item={dayItem}
              log={log}
              embedded
              recordings={recordings?.filter((r) => r.logDate === day)}
              player={player}
              onOpenTask={(taskId) => router.push(taskRoute({ routineId: routine.id, taskId, date: day }, 'routine'))}
            />
          ) : (
            <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View className="flex-1">
                <Muted>It isn&apos;t on {dayName}.</Muted>
              </View>
              <SmallButton label={`Add it to ${dayName}`} primary onPress={() => log.addToDay(day, routine.id)} />
            </Panel>
          )}
        </Section>

        <Section title="Notes">
          <PageNotes
            target={{ kind: 'routineNotes', routineId: routine.id }}
            start={() => create({ title: name, body: routineNoteBody(), attach: { target: routineKey, label: name } })}
          />
        </Section>

        <Section title="Coming up">
          {upcoming.length === 0 ? (
            <Quiet>Nothing coming up{routine.repeat.end ? `. It ended ${formatShortDate(routine.repeat.end)}` : ''}.</Quiet>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {upcoming.map((d) => (
                <SmallButton key={d} label={d === today ? 'Today' : formatShortDate(d)} onPress={() => openDay(d)} />
              ))}
            </View>
          )}
        </Section>

        {/* That day's clips are on its card; here, the other days', newest day first. */}
        {otherDays.length > 0 ? (
          <Section title="Recordings on other days" count={otherDays.reduce((n, [, list]) => n + list.length, 0)}>
            <View className="gap-4">
              {otherDays.map(([d, list]) => (
                <View key={d || 'none'} className="gap-2">
                  <Pressable onPress={() => openDay(d || today)} accessibilityRole="link" hitSlop={6} className="self-start px-1">
                    <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                      {d ? formatLongDate(d) : 'No day'}
                    </Text>
                  </Pressable>
                  <RecordingList
                    recordings={list}
                    player={player}
                    placeWithin={routine.id}
                    onOpen={(rid) => router.push({ pathname: '/recordings/[id]', params: { id: rid } })}
                  />
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="History" count={history.length || undefined}>
          {history.length === 0 ? (
            <Quiet>Nothing logged yet.</Quiet>
          ) : (
            <Rows>
              {history.slice(0, 30).map(({ date: d, occ }, i) => {
                const p = progressOf(routine, occ);
                const complete = p.total > 0 && p.done === p.total;
                const m = minutesFor(routine, occ);
                return (
                  <HistoryRow
                    key={d}
                    first={i === 0}
                    date={d}
                    done={complete}
                    color={color}
                    note={occ.notes || undefined}
                    right={occ.skipped ? 'Skipped' : `${p.done}/${p.total}${m > 0 ? ` · ${formatMinutesShort(Math.round(m))}` : ''}`}
                    onPress={() => openDay(d)}
                  />
                );
              })}
            </Rows>
          )}
        </Section>
      </ScrollView>
      <RoutineShareSheet routine={routine} visible={sharing} onClose={() => setSharing(false)} />
    </View>
  );
}
