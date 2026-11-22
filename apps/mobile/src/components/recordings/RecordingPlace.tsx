import { formatShortDate } from '@jam-practice/core/practiceLog';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { RepeatIcon } from '@/components/icons';
import { routineRoute, taskRoute } from '@/lib/shedLogPages';
import { usePracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Where in the Shed Log a recording was made, under its name (the website's `RecordingPlace`):
 * "Bass / Scales" (a routine's task), "Bass" (the routine), "Nov 22 / Transcribe a chorus" (a
 * day's own task). Tapping it opens that task's (or routine's) screen. Nothing for a recording
 * that isn't on a routine or task.
 *
 * `within`: shown inside that routine (its screen, its card), so the routine's name is left out —
 * just the task, or nothing for a clip on the routine itself.
 */
export function RecordingPlace({
  routineId,
  taskId,
  logDate,
  within,
}: {
  routineId?: string | null;
  taskId?: string | null;
  logDate?: string | null;
  within?: string;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const log = usePracticeLog();
  if (!routineId && !taskId) return null;
  if (within && routineId === within && !taskId) return null;
  const routine = routineId ? log.data.routines.find((r) => r.id === routineId) : undefined;
  const task = taskId
    ? routineId
      ? (routine?.tasks.find((t) => t.id === taskId) ??
        (logDate ? log.data.days[logDate]?.routines?.[routineId]?.extraTasks?.find((t) => t.id === taskId) : undefined))
      : logDate
        ? log.data.days[logDate]?.tasks?.find((t) => t.id === taskId)
        : undefined
    : undefined;
  const first = routineId ? routine?.name || 'A routine' : logDate ? formatShortDate(logDate) : 'A day';
  const taskName = taskId ? task?.title || 'a task' : null;
  const label = within && routineId === within ? (taskName ?? '') : [first, taskName].filter(Boolean).join(' / ');
  const canOpen = (taskId ? (routineId ? !!routine : !!logDate) : !!routine) && !!task === !!taskId;

  function open() {
    if (taskId) {
      router.push(routineId ? taskRoute({ routineId, taskId, ...(logDate ? { date: logDate } : {}) }) : taskRoute({ date: logDate ?? '', taskId }));
    } else if (routineId) {
      router.push(routineRoute(routineId, logDate ?? undefined));
    }
  }

  const body = (
    <View className="flex-row items-center gap-1">
      <RepeatIcon color={colors.muted} size={13} />
      <Text numberOfLines={1} className="font-ui-semibold shrink text-xs font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
    </View>
  );
  if (!canOpen) return <View className="self-start pt-0.5">{body}</View>;
  return (
    <Pressable onPress={open} hitSlop={8} accessibilityRole="link" accessibilityLabel={`Open ${label}`} className="self-start pt-0.5">
      {body}
    </Pressable>
  );
}
