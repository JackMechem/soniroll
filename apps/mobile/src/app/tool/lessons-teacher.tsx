import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RepeatIcon } from '@/components/icons';
import { LeaveIcon, LessonsGate, LessonsScroll, NotFound, PersonHead, plural } from '@/components/lessons/parts';
import { RoutineRow } from '@/components/lessons/routines';
import { ScheduleCard } from '@/components/lessons/schedule';
import { SessionList } from '@/components/lessons/sessions';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { Section, SmallButton } from '@/components/shedLog/parts';
import { useNowCoarse } from '@/lib/useClock';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A student's screen for one of their teachers (`?id=`, the website's `/lessons/teacher`): booking,
 * their lessons (each opens its notes, assignments, files and charts), and the routines they gave
 * you (already in your Shed Log). Leave at the top.
 */
function TeacherScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <LessonsGate />;
  return <Teacher />;
}

export default withScreenLoader(TeacherScreen);

function Teacher() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNowCoarse();
  const teachers = useQuery(api.lessons.myTeachers, {});
  const leave = useMutation(api.lessons.leave);
  const [leaving, setLeaving] = useState(false);

  if (teachers === undefined) return <ScreenSpinner />;
  const lesson = teachers.find((t) => t.id === id);
  if (!lesson) return <NotFound title="Not found" body="You're not this teacher's student (anymore)." />;

  const routineItems = lesson.items.filter((i) => i.kind === 'routine');
  const open = lesson.items.filter((i) => i.kind === 'assignment' && !i.done).length;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Lessons' }} />
      <LessonsScroll gap={20}>
        <PersonHead
          url={lesson.teacher.avatarUrl}
          name={lesson.teacher.name}
          title={lesson.teacher.name}
          detail={`Your teacher · ${open ? `${plural(open, 'assignment')} to do` : 'nothing due'}${routineItems.length ? ` · ${plural(routineItems.length, 'routine')} in your Shed Log` : ''}`}
          right={<SmallButton Icon={LeaveIcon} label="Leave" onPress={() => setLeaving(true)} />}
        />
        <ScheduleCard lessonId={lesson.id} now={now} />
        <SessionList lessonId={lesson.id} otherName={lesson.teacher.name} now={now} />
        {routineItems.length > 0 ? (
          <Section icon={<RepeatIcon color={colors.muted} size={16} />} title="Practice routines">
            <Text className="font-ui -mt-1 px-0.5 text-xs" style={{ color: colors.muted }}>
              From {lesson.teacher.name} — already in your Shed Log.
            </Text>
            <View className="gap-2">
              {routineItems.map((item) => (
                <RoutineRow key={item.id} item={item} teacher={false} />
              ))}
            </View>
          </Section>
        ) : null}
      </LessonsScroll>
      <ConfirmDialog
        visible={leaving}
        title={`Leave ${lesson.teacher.name}'s lessons?`}
        message="They stop seeing your practice, their things go from your Lessons, and their routines leave your Shed Log (the days you logged stay). They'd have to send you a new link to rejoin."
        confirmLabel="Leave"
        onConfirm={() => {
          setLeaving(false);
          void leave({ id: lesson.id });
          router.back();
        }}
        onCancel={() => setLeaving(false)}
      />
    </View>
  );
}
