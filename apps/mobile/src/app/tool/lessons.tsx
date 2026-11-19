import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { formatShortDate } from '@jam-practice/core/practiceLog';
import { useQuery } from 'convex/react';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChevronRightIcon, LessonsIcon, PlusIcon, SlidersIcon } from '@/components/icons';
import { EmptyBox, JoinIcon, dayLabel, LessonsGate, LessonsScroll, PersonBadge, plural } from '@/components/lessons/parts';
import { ScheduleOverview } from '@/components/lessons/schedule';
import { UpcomingLessons } from '@/components/lessons/sessions';
import { AddStudentSheet, JoinCodeSheet } from '@/components/lessons/students';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { Section, SmallButton } from '@/components/shedLog/parts';
import { useNowCoarse, useToday } from '@/lib/useClock';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Lessons on the phone — the native port of the website's `/lessons` (`components/lessons/
 * LessonsPage.tsx`): your students (as a teacher) and your teachers (as a student) on one screen,
 * since anyone can be either. "Needs you" (lesson requests, times you've been offered), Coming up,
 * Your teachers, Your students; Add a student, Settings, and Join with an invite (the app doesn't
 * open https links, so a student pastes the link their teacher sent). Account only, like the
 * website: signed out it explains itself and offers Sign in.
 *
 * The rest of Lessons is in the `lessons-*` screens beside this one: a student (`lessons-student`)
 * and a teacher (`lessons-teacher`), a lesson (`lessons-lesson`), its notes (`lessons-notes`,
 * `lessons-note`), all materials (`lessons-materials`), settings and teaching hours
 * (`lessons-settings`), joining (`lessons-join`) and picking an offered time (`lessons-book`).
 */
function LessonsScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <LessonsGate />;
  return <Lessons />;
}

export default withScreenLoader(LessonsScreen);

function Lessons() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const today = useToday();
  const now = useNowCoarse();
  const students = useQuery(api.lessons.students, { today });
  const teachers = useQuery(api.lessons.myTeachers, {});
  const [adding, setAdding] = useState(false);
  const [joining, setJoining] = useState(false);

  if (students === undefined || teachers === undefined) return <ScreenSpinner label="Loading your lessons" />;

  const openTotal = teachers.reduce((n, t) => n + t.items.filter((i) => i.kind === 'assignment' && !i.done).length, 0);
  const summary = [students.length ? plural(students.length, 'student') : null, teachers.length ? plural(teachers.length, 'teacher') : null].filter(Boolean).join(' · ') || 'Teach, or learn from a teacher';

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Lessons' }} />
      <LessonsScroll>
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          {summary}
        </Text>
        <View className="flex-row gap-2">
          <HeadButton Icon={SlidersIcon} label="Settings" onPress={() => router.push('/tool/lessons-settings')} />
          <HeadButton Icon={JoinIcon} label="Join" onPress={() => setJoining(true)} />
          <HeadButton Icon={PlusIcon} label="Add a student" primary onPress={() => setAdding(true)} />
        </View>

        <ScheduleOverview now={now} />
        <UpcomingLessons now={now} />

        {teachers.length > 0 ? (
          <Section icon={<LessonsIcon color={colors.muted} size={16} />} title="Your teachers" count={openTotal ? `${plural(openTotal, 'assignment')} to do` : undefined}>
            <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
              {teachers.map((t, i) => {
                const open = t.items.filter((x) => x.kind === 'assignment' && !x.done).length;
                const latest = [...t.items].sort((a, b) => b.createdAt - a.createdAt)[0];
                return (
                  <PersonRow
                    key={t.id}
                    first={i === 0}
                    url={t.teacher.avatarUrl}
                    name={t.teacher.name}
                    detail={`${open ? `${plural(open, 'assignment')} to do` : `${plural(t.items.length, 'thing')} from them`}${latest ? ` · latest: ${latest.title}` : ''}`}
                    onPress={() => router.push({ pathname: '/tool/lessons-teacher', params: { id: t.id } })}
                  />
                );
              })}
            </View>
          </Section>
        ) : null}

        <Section title="Your students" count={students.length || undefined}>
          {students.length === 0 ? (
            <EmptyBox
              title="Teach with soniroll"
              body={`Add a student to get their invite link. Give them lesson notes, PDFs and images, chord charts, assignments and Shed Log routines — and see how their practice goes.${
                teachers.length === 0 ? '\n\nLearning from a teacher? Tap Join and paste the link they sent you.' : ''
              }`}
              action={<SmallButton primary Icon={PlusIcon} label="Add your first student" onPress={() => setAdding(true)} />}
            />
          ) : (
            <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
              {students.map((s, i) => {
                const facts = [
                  s.counts.toReview > 0 ? `${s.counts.toReview} to review` : null,
                  s.counts.assignmentsDue > 0 ? `${s.counts.assignmentsDue} overdue` : null,
                  s.joined ? `${Math.round(s.hoursThisWeek * 10) / 10} h this week` : null,
                  s.joined && s.streak > 0 ? `${plural(s.streak, 'day')} streak` : null,
                  `last practiced ${s.lastPracticed ? (s.lastPracticed === today ? 'today' : formatShortDate(s.lastPracticed)) : '—'}`,
                  `${s.counts.assignmentsOpen} to do`,
                  `${plural(s.lessons, 'lesson')}${s.nextLesson ? ` · next ${dayLabel(s.nextLesson)}` : ''}`,
                ].filter(Boolean);
                return (
                  <PersonRow
                    key={s.id}
                    first={i === 0}
                    url={s.student?.avatarUrl}
                    name={s.name}
                    detail={s.joined ? s.student?.name : s.inviteEmail ? `Invited · ${s.inviteEmail}` : "Hasn't joined yet — send their invite link"}
                    facts={facts.join(' · ')}
                    alert={s.counts.toReview > 0 || s.counts.assignmentsDue > 0}
                    onPress={() => router.push({ pathname: '/tool/lessons-student', params: { id: s.id } })}
                  />
                );
              })}
            </View>
          )}
        </Section>
      </LessonsScroll>

      <AddStudentSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onAdded={(id) => {
          setAdding(false);
          router.push({ pathname: '/tool/lessons-student', params: { id } });
        }}
      />
      <JoinCodeSheet
        visible={joining}
        onClose={() => setJoining(false)}
        onCode={(invite) => {
          setJoining(false);
          router.push({ pathname: '/tool/lessons-join', params: { invite } });
        }}
      />
    </View>
  );
}

function PersonRow({
  url,
  name,
  detail,
  facts,
  alert,
  first,
  onPress,
}: {
  url: string | null | undefined;
  name: string;
  detail?: string;
  facts?: string;
  alert?: boolean;
  first: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors['surface-hover'] }}
      className="flex-row items-center gap-3 px-4 py-3"
      style={first ? undefined : { borderTopWidth: 1, borderColor: colors['surface-hover'] }}
    >
      <PersonBadge url={url} name={name} size="sm" />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
          {name}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            {detail}
          </Text>
        ) : null}
        {facts ? (
          <Text numberOfLines={2} className="font-ui text-xs" style={{ color: alert ? colors.accent : colors.muted }}>
            {facts}
          </Text>
        ) : null}
      </View>
      <ChevronRightIcon color={colors.muted} size={18} />
    </Pressable>
  );
}

/** A header button: an icon over a short label, sharing the row (like the Shed Log's). */
function HeadButton({ Icon, label, onPress, primary }: { Icon: typeof PlusIcon; label: string; onPress: () => void; primary?: boolean }) {
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
