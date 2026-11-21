import { useConvexAuth } from '@convex-dev/auth/react';
import { currentToolHref } from '@jam-practice/core/navLinks';
import {
  describePublicRepeat,
  formatMinutesShort,
  formatTime,
  parseTime,
  routineFromPublic,
  todayKey,
  type PublicAttachment,
  type PublicRoutine,
} from '@jam-practice/core/practiceLog';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChordChartIcon, CheckIcon, NAV_LINK_ICONS, NoteIcon, PlusIcon, RepeatIcon, SetlistIcon, type IconProps } from '@/components/icons';
import { RoutineIcon, SmallButton, routineColor } from '@/components/shedLog/parts';
import { toolRoute } from '@/components/ToolGrid';
import { usePracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Is this a routine post's payload (a `PublicRoutine`)? */
export function asPublicRoutine(payload: unknown): PublicRoutine | null {
  return payload && typeof payload === 'object' && Array.isArray((payload as PublicRoutine).tasks) ? (payload as PublicRoutine) : null;
}

function Glyph({ Icon, color }: { Icon: ComponentType<IconProps>; color: string }) {
  return <Icon color={color} size={14} />;
}

/** Each task with when it starts: its own time, or straight after the one before. */
function scheduleOf(routine: PublicRoutine) {
  const out: { t: PublicRoutine['tasks'][number]; at: number | null }[] = [];
  let cursor = parseTime(routine.startTime);
  for (const t of routine.tasks) {
    const at = parseTime(t.time) ?? cursor;
    cursor = at === null ? null : at + t.minutes;
    out.push({ t, at });
  }
  return out;
}

/** What's attached to a task or the routine: a tool opens it; a chart, setlist or note is a label. */
function AttachmentChip({ a }: { a: PublicAttachment }) {
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const href = a.kind === 'tool' && a.href ? currentToolHref(a.href) : null;
  const Icon = (href && NAV_LINK_ICONS[href]) || (a.kind === 'setlist' ? SetlistIcon : a.kind === 'chart' ? ChordChartIcon : NoteIcon);
  const body = (
    <>
      <Glyph Icon={Icon} color={colors.muted} />
      <Text numberOfLines={1} className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground, flexShrink: 1 }}>
        {a.label}
      </Text>
    </>
  );
  const cls = 'h-7 max-w-full flex-row items-center gap-1.5 overflow-hidden rounded-md px-2';
  return href ? (
    <Pressable onPress={() => router.push(toolRoute(href))} accessibilityRole="link" android_ripple={{ color: colors['surface-hover'] }} className={cls} style={{ backgroundColor: derived.fill }}>
      {body}
    </Pressable>
  ) : (
    <View className={cls} style={{ backgroundColor: derived.fill }}>
      {body}
    </View>
  );
}

/** A shared routine, read-only (the website's `RoutinePreview`): when it runs, its tasks with their
    times and minutes, notes and what's attached. */
export function PublicRoutineView({ routine }: { routine: PublicRoutine }) {
  const { colors } = useAppTheme();
  const color = routineColor(routine.color);
  const total = routine.tasks.reduce((s, t) => s + t.minutes, 0);
  const start = parseTime(routine.startTime);
  const tasks = scheduleOf(routine);
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <RoutineIcon icon={routine.icon} color={routine.color} size={28} />
        <View className="flex-row items-center gap-1">
          <RepeatIcon color={colors.muted} size={14} />
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            {describePublicRepeat(routine.repeat)}
            {start !== null ? ` at ${formatTime(start)}` : ''}
          </Text>
        </View>
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          {routine.tasks.length} task{routine.tasks.length === 1 ? '' : 's'} · {formatMinutesShort(total)}
        </Text>
      </View>
      {routine.description ? (
        <Text className="font-ui text-sm leading-5" style={{ color: colors.foreground }}>
          {routine.description}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
        {tasks.map(({ t, at }, i) => (
          <View key={i} className="flex-row gap-3 px-4 py-3" style={i ? { borderTopWidth: 1, borderTopColor: colors.background } : undefined}>
            <Text className="font-ui-bold w-5 text-center text-sm font-bold" style={{ color }}>
              {i + 1}
            </Text>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                {t.title || 'Task'}
              </Text>
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                {at !== null ? `${formatTime(at)} · ` : ''}
                {formatMinutesShort(t.minutes)}
              </Text>
              {t.subtasks?.length ? (
                <Text className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
                  {t.subtasks.join(' · ')}
                </Text>
              ) : null}
              {t.notes ? (
                <Text className="font-ui mt-0.5 text-xs leading-4" style={{ color: colors.muted }}>
                  {t.notes}
                </Text>
              ) : null}
              {t.attachments.length ? (
                <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                  {t.attachments.map((a, j) => (
                    <AttachmentChip key={j} a={a} />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
      {routine.attachments.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {routine.attachments.map((a, j) => (
            <AttachmentChip key={j} a={a} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Adds a shared routine to your own Shed Log (starting today) and opens it there. Signed out, it
    says the Shed Log needs an account. */
export function AddRoutineButton({ routine }: { routine: PublicRoutine }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const log = usePracticeLog();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [added, setAdded] = useState(false);
  if (!isLoading && !isAuthenticated) {
    return (
      <View className="flex-row flex-wrap items-center gap-3">
        <Text className="font-ui flex-1 text-sm" style={{ color: colors.muted }}>
          Sign in to add this routine to your Shed Log.
        </Text>
        <SmallButton label="Sign in" onPress={() => router.push('/profile')} />
      </View>
    );
  }
  return (
    <View className="flex-row">
      <SmallButton
        primary
        label={added ? 'Added' : 'Add to my Shed Log'}
        Icon={added ? CheckIcon : PlusIcon}
        disabled={!log.ready || added}
        onPress={() => {
          const mine = routineFromPublic(routine, todayKey());
          log.saveRoutine(mine);
          setAdded(true);
          router.push({ pathname: '/tool/shed-log-routine', params: { id: mine.id } });
        }}
      />
    </View>
  );
}
