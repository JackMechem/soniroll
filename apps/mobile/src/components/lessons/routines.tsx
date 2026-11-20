import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { describeRepeat, formatMinutesShort, lessonRoutineId, totalMinutes, type Routine } from '@jam-practice/core/practiceLog';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CheckIcon, ChevronRightIcon, MicrophoneIcon, PencilIcon, TrashIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge, EmptyBox, ago, dateKeyLabel, plural, useToneColor, type LessonItem, type Tone } from '@/components/lessons/parts';
import { PlayButton, SeekBar, useRecordingPlayer } from '@/components/recordings/RecordingParts';
import { GhostIcon, RoutineIcon, SmallButton } from '@/components/shedLog/parts';
import { ToolSheet } from '@/components/tool/SettingChip';
import { useNowCoarse, useToday } from '@/lib/useClock';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * Assigned Shed Log routines on the Lessons screens (the website's `components/lessons/routines.tsx`
 * and the report in `parts.tsx`): a compact row per routine that opens to its tasks — and, for the
 * teacher, the day-by-day practice report from the student's Shed Log; the student gets "Open in
 * your Shed Log". The routines themselves come into the student's Shed Log through
 * `ShedLogGlobal` (`reconcileAssigned`), as on the website.
 */

type Summary = { recent: { date: string; status: string | null }[]; totals: { done: number } | null } | undefined;

const STATUS_TONE: Record<string, Tone> = { done: 'success', partial: 'warn', missed: 'danger' };
const STATUS_MARK: Record<string, string> = { done: '✓', partial: '–', missed: '✕' };

function StatusDot({ status }: { status: string | null }) {
  const { colors, derived } = useAppTheme();
  const tone = useToneColor();
  const bg = status && STATUS_TONE[status] ? tone(STATUS_TONE[status]) : derived.fill;
  return (
    <View className="h-5 min-w-5 items-center justify-center rounded px-1" style={{ backgroundColor: bg }}>
      <Text className="font-ui-bold text-[10px] font-bold" style={{ color: status && STATUS_TONE[status] ? '#ffffff' : colors.muted }}>
        {status ? STATUS_MARK[status] : '•'}
      </Text>
    </View>
  );
}

/** A routine's last two weeks at a glance, oldest on the left. */
export function RecentStrip({ recent }: { recent: { date: string; status: string | null }[] }) {
  const { colors } = useAppTheme();
  if (!recent.length)
    return (
      <Text className="font-ui text-xs" style={{ color: colors.muted }}>
        No days yet
      </Text>
    );
  return (
    <View className="flex-row flex-wrap gap-1">
      {[...recent].reverse().map((d) => (
        <StatusDot key={d.date} status={d.status} />
      ))}
    </View>
  );
}

/** An assigned routine as one row; tap to open its tasks (and the teacher's report). */
export function RoutineRow({ item, teacher, summary, onEdit, onRemove }: { item: LessonItem; teacher: boolean; summary?: Summary; onEdit?: () => void; onRemove?: () => void }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const r = item.routine;
  if (!r) return null;
  return (
    <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-center gap-1 pr-1">
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          android_ripple={{ color: colors['surface-hover'] }}
          className="flex-1 flex-row items-center gap-3 py-3 pl-3"
        >
          <RoutineIcon icon={r.icon} color={r.color} size={36} />
          <View className="flex-1 gap-0.5">
            <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
              {r.name}
            </Text>
            <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
              {describeRepeat(r.repeat)} · {plural(r.tasks.length, 'task')} · {formatMinutesShort(totalMinutes(r))}
            </Text>
            {teacher ? (
              <Text className="font-ui text-[11px]" style={{ color: colors.muted }}>
                {summary?.totals ? `${plural(summary.totals.done, 'day')} done` : 'Not started'}
              </Text>
            ) : null}
          </View>
          <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
            <ChevronRightIcon color={colors.muted} size={18} />
          </View>
        </Pressable>
        {teacher && onEdit ? <GhostIcon Icon={PencilIcon} label={`Replace ${r.name}`} onPress={onEdit} /> : null}
        {teacher && onRemove ? <GhostIcon Icon={TrashIcon} label={`Remove ${r.name}`} onPress={onRemove} /> : null}
      </View>
      {teacher && summary?.recent.length ? (
        <View className="px-3 pb-3">
          <RecentStrip recent={summary.recent} />
        </View>
      ) : null}
      {open ? (
        <View className="gap-3 p-3" style={{ borderTopWidth: 1, borderColor: colors['surface-hover'] }}>
          {r.tasks.map((t, i) => (
            <View key={t.id} className="flex-row items-center gap-2">
              <Text className="font-ui w-4 text-right text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                {i + 1}
              </Text>
              <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
                {t.title}
              </Text>
              <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                {formatMinutesShort(t.minutes)}
              </Text>
            </View>
          ))}
          {teacher ? (
            <RoutineReportView itemId={item.id} />
          ) : (
            <View className="self-start">
              <SmallButton primary label="Open in your Shed Log" onPress={() => router.push({ pathname: '/tool/shed-log-routine', params: { id: lessonRoutineId(item.id) } })} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  const { colors } = useAppTheme();
  const color = useToneColor();
  return (
    <View style={{ width: '50%' }} className="py-1">
      <Text className="font-ui text-xs" style={{ color: colors.muted }}>
        {label}
      </Text>
      <Text className="font-ui-bold text-base font-bold" style={{ color: tone ? color(tone) : colors.foreground, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

/** Every day of an assigned routine in the student's Shed Log: totals, each day (status, tasks
    with minutes, subtasks, notes) and the recordings they made on it. */
export function RoutineReportView({ itemId }: { itemId: Id<'lessonItems'> }) {
  const { colors } = useAppTheme();
  const today = useToday();
  const now = useNowCoarse();
  const data = useQuery(api.lessons.routineReportFor, { itemId, today });
  const [showAll, setShowAll] = useState(false);
  const player = useRecordingPlayer();
  const success = useToneColor()('success');
  if (data === undefined) return <LoadingSpinner />;
  if (!data) return null;
  if (!data.joined) return <EmptyBox body="Once your student joins, you'll see how each day of this routine goes." />;
  const report = data.report;
  if (!report) return <EmptyBox body="It's on its way to their Shed Log — it appears the next time they open soniroll." />;
  const t = report.totals;
  const days = showAll ? report.days : report.days.slice(0, 7);
  const rate = t.tasksTotal ? Math.round((t.tasksDone / t.tasksTotal) * 100) : null;
  return (
    <View className="gap-3 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
      <View className="flex-row flex-wrap">
        <Stat label="Days done" value={String(t.done)} tone="success" />
        <Stat label="Partly done" value={String(t.partial)} tone="warn" />
        <Stat label="Missed" value={String(t.missed)} tone="danger" />
        <Stat label={rate != null ? `Practiced · ${rate}% of tasks` : 'Practiced'} value={formatMinutesShort(t.minutes)} />
      </View>
      {report.days.length === 0 ? (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          No days for it yet.
        </Text>
      ) : (
        days.map((d) => (
          <View key={d.date} className="gap-1.5 pt-3" style={{ borderTopWidth: 1, borderColor: colors['surface-hover'] }}>
            <View className="flex-row flex-wrap items-center gap-2">
              <StatusDot status={d.status} />
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {dateKeyLabel(d.date)}
              </Text>
              {d.status === null ? <Badge>Today</Badge> : null}
              {d.skipped ? <Badge>Skipped</Badge> : null}
              {d.added ? <Badge>Added that day</Badge> : null}
              <View className="flex-1" />
              <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                {d.minutes ? formatMinutesShort(d.minutes) : 'No time logged'}
              </Text>
            </View>
            {d.tasks.map((task) => (
              <View key={task.id} className="gap-0.5">
                <View className="flex-row items-center gap-2">
                  <View className="h-4 w-4 items-center justify-center rounded" style={{ backgroundColor: task.done ? success : 'transparent', borderWidth: task.done ? 0 : 1, borderColor: withAlpha(colors.foreground, 0.25) }}>
                    {task.done ? <CheckIcon color="#ffffff" size={12} /> : null}
                  </View>
                  <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: task.done ? colors.foreground : colors.muted }}>
                    {task.title}
                  </Text>
                  <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                    {task.minutes ? formatMinutesShort(task.minutes) : '—'} / {formatMinutesShort(task.planned)}
                  </Text>
                </View>
                {task.subtasks.length > 0 ? (
                  <Text className="font-ui ml-6 text-xs" style={{ color: colors.muted }}>
                    {task.subtasks.filter((s) => s.done).length} of {task.subtasks.length} steps: {task.subtasks.map((s) => (s.done ? `✓ ${s.title}` : s.title)).join(' · ')}
                  </Text>
                ) : null}
              </View>
            ))}
            {d.notes ? (
              <Text className="font-ui pl-2 text-xs italic" style={{ color: colors.foreground, borderLeftWidth: 2, borderColor: colors['surface-hover'] }}>
                “{d.notes}”
              </Text>
            ) : null}
          </View>
        ))
      )}
      {report.days.length > 7 ? (
        <Pressable onPress={() => setShowAll((s) => !s)} className="self-start py-1">
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
            {showAll ? 'Show the last week only' : `Show all ${report.days.length} days`}
          </Text>
        </Pressable>
      ) : null}
      {data.recordings.length > 0 ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-1.5">
            <MicrophoneIcon color={colors.muted} size={16} />
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              Recordings
            </Text>
          </View>
          {data.recordings.map((rec) => {
            const active = player.activeKey === rec.id;
            return (
              <View key={rec.id} className="gap-1.5 rounded-lg p-2.5" style={{ backgroundColor: colors.surface }}>
                <View className="flex-row items-center gap-2.5">
                  {rec.url ? <PlayButton playing={active && player.playing} size={32} onPress={() => player.toggle(rec.id, rec.url)} /> : null}
                  <Text numberOfLines={1} className="font-ui-semibold flex-1 text-xs font-semibold" style={{ color: colors.foreground }}>
                    {rec.name}
                    <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                      {` · ${rec.date ? dateKeyLabel(rec.date) : ago(rec.createdAt, now)}`}
                    </Text>
                  </Text>
                </View>
                {!rec.url ? (
                  <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                    Kept on their device — it can&apos;t be played here.
                  </Text>
                ) : active ? (
                  <SeekBar currentTime={player.currentTime} duration={player.duration || rec.durationSec} onSeek={player.seek} />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Pick one of your own Shed Log routines to assign (or to replace an assigned one with). */
export function RoutinePickSheet({
  visible,
  routines,
  title,
  onPick,
  onClose,
}: {
  visible: boolean;
  routines: Routine[];
  title: string;
  onPick: (r: Routine) => void;
  onClose: () => void;
}) {
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  return (
    <ToolSheet visible={visible} onClose={onClose} title={title}>
      <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
        Your student gets a copy in their Shed Log, and you&apos;ll see how each day of it goes. Changing it here later updates theirs.
      </Text>
      {routines.length === 0 ? (
        <EmptyBox body="You don't have any routines yet." />
      ) : (
        <View className="gap-1.5">
          {routines.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => onPick(r)}
              android_ripple={{ color: colors['surface-hover'] }}
              className="flex-row items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5"
              style={{ backgroundColor: derived.fill }}
            >
              <RoutineIcon icon={r.icon} color={r.color} size={34} />
              <View className="flex-1">
                <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                  {r.name}
                </Text>
                <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                  {plural(r.tasks.length, 'task')} · {formatMinutesShort(totalMinutes(r))} · {describeRepeat(r.repeat)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      <Pressable
        onPress={() => {
          onClose();
          router.push('/tool/shed-log-routine-edit');
        }}
        className="self-start py-1"
      >
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.accent }}>
          Make a new routine in your Shed Log →
        </Text>
      </Pressable>
    </ToolSheet>
  );
}
