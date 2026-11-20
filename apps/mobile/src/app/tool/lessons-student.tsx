import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { formatShortDate, toDateKey, type Routine } from '@jam-practice/core/practiceLog';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DotsVerticalIcon, LinkIcon, PencilIcon, PlusIcon, RepeatIcon, ShareIcon, SlidersIcon, TrashIcon } from '@/components/icons';
import { EmptyBox, ErrorLine, LessonsGate, errorText, LessonsScroll, NotFound, PersonHead, inviteUrl, shareLink, type LessonItem } from '@/components/lessons/parts';
import { RoutinePickSheet, RoutineRow } from '@/components/lessons/routines';
import { ScheduleCard } from '@/components/lessons/schedule';
import { SessionList } from '@/components/lessons/sessions';
import { InviteCard } from '@/components/lessons/students';
import { NameDialog } from '@/components/NameDialog';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { GhostIcon, Section, SmallButton } from '@/components/shedLog/parts';
import { useNowCoarse, useToday } from '@/lib/useClock';
import { usePracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A teacher's screen for one student (`?id=`, the website's `/lessons/student`): their invite until
 * they join, their lessons (each holds its notes, assignments, files and charts), the Shed Log
 * routines you assigned (with each one's practice report), booking, and their practice stats.
 */
function StudentScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <LessonsGate />;
  return <Student />;
}

export default withScreenLoader(StudentScreen);

function Student() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const now = useNowCoarse();
  const data = useQuery(api.lessons.student, id ? { id: id as Id<'lessonStudents'>, today } : 'skip');
  const removeItem = useMutation(api.lessons.removeItem);
  const updateItem = useMutation(api.lessons.updateItem);
  const addItem = useMutation(api.lessons.addItem);
  const rename = useMutation(api.lessons.renameStudent);
  const newLink = useMutation(api.lessons.newInviteLink);
  const removeStudent = useMutation(api.lessons.removeStudent);
  const log = usePracticeLog();
  const [picking, setPicking] = useState<{ replace?: LessonItem } | null>(null);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'student' } | { kind: 'item'; item: LessonItem } | null>(null);

  if (data === undefined) return <ScreenSpinner />;
  if (!data) return <NotFound title="Student not found" body="They may have been removed." />;

  const lessonId = data.id;
  const routineItems = data.items.filter((i) => i.kind === 'routine');
  const summaries = new Map(data.routines.map((r) => [r.itemId, r]));
  const p = data.practice;
  const url = inviteUrl(data.code);

  async function assign(routine: Routine, replace?: LessonItem) {
    try {
      if (replace) await updateItem({ itemId: replace.id, title: routine.name, routine });
      else await addItem({ lessonId, kind: 'routine', title: routine.name, routine });
    } catch (e) {
      setError(errorText(e, "Couldn't assign that routine."));
    }
    setPicking(null);
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Lessons' }} />
      <LessonsScroll gap={20}>
        <PersonHead
          url={data.student?.avatarUrl}
          name={data.name}
          title={data.name}
          detail={data.joined ? `${data.student?.name ?? ''}${data.joinedAt ? ` · student since ${formatShortDate(toDateKey(new Date(data.joinedAt)))}` : ''}` : "Hasn't joined yet"}
          right={<GhostIcon Icon={DotsVerticalIcon} label={`Options for ${data.name}`} onPress={() => setMenu(true)} color={colors.foreground} size={22} />}
        />

        {!data.joined ? <InviteCard lessonId={lessonId} name={data.name} code={data.code} inviteEmail={data.inviteEmail} invitedAt={data.invitedAt} now={now} /> : null}

        <SessionList lessonId={lessonId} otherName={data.name} now={now} />

        {data.features.routines ? (
          <Section
            icon={<RepeatIcon color={colors.muted} size={16} />}
            title="Practice routines"
            action={<SmallButton Icon={PlusIcon} label="Assign" onPress={() => setPicking({})} />}
          >
            <Text className="font-ui -mt-1 px-0.5 text-xs" style={{ color: colors.muted }}>
              In {data.name}&apos;s Shed Log, not tied to one lesson. Open one for its practice report.
            </Text>
            <ErrorLine>{error}</ErrorLine>
            {routineItems.length === 0 ? (
              <EmptyBox body="No routines yet. Assign one of yours and see every day of it here." />
            ) : (
              <View className="gap-2">
                {routineItems.map((item) => (
                  <RoutineRow
                    key={item.id}
                    item={item}
                    teacher
                    summary={summaries.get(item.id)}
                    onEdit={() => setPicking({ replace: item })}
                    onRemove={() => setConfirm({ kind: 'item', item })}
                  />
                ))}
              </View>
            )}
          </Section>
        ) : null}

        <ScheduleCard lessonId={lessonId} now={now} />

        <Section title="Practice">
          <View className="rounded-xl px-4 py-2" style={{ backgroundColor: colors.surface }}>
            {!data.joined ? (
              <Text className="font-ui py-2 text-sm" style={{ color: colors.muted }}>
                You&apos;ll see their Shed Log once they join.
              </Text>
            ) : !p ? (
              <Text className="font-ui py-2 text-sm" style={{ color: colors.muted }}>
                No practice logged yet.
              </Text>
            ) : (
              <>
                <Fact label="Day streak" value={String(p.streak)} />
                <Fact label="Best streak" value={String(p.best)} />
                <Fact label="This week" value={`${Math.round(p.weekHours * 10) / 10} h`} />
                <Fact label="All time" value={`${Math.round(p.hours)} h`} />
                <Fact label="Days, last year" value={String(p.days)} />
                <Fact label="Goal days, last 30" value={String(p.goalDays)} />
                <Text className="font-ui py-2 text-xs" style={{ color: colors.muted }}>
                  Last practiced {data.lastPracticed ? (data.lastPracticed === today ? 'today' : formatShortDate(data.lastPracticed)) : '—'}.
                </Text>
              </>
            )}
          </View>
        </Section>
        {data.joined ? (
          <View className="self-start">
            <SmallButton Icon={LinkIcon} label="Share their invite link" onPress={() => void shareLink('Lessons with me on soniroll', url)} />
          </View>
        ) : null}
      </LessonsScroll>

      <ActionSheet
        visible={menu}
        title={data.name}
        onClose={() => setMenu(false)}
        actions={[
          { key: 'rename', icon: <PencilIcon color={colors.muted} size={20} />, label: 'Rename', onPress: () => setRenaming(true) },
          { key: 'share', icon: <ShareIcon color={colors.muted} size={20} />, label: 'Share invite link', onPress: () => void shareLink('Lessons with me on soniroll', url) },
          { key: 'new', icon: <LinkIcon color={colors.muted} size={20} />, label: 'Make a new invite link', onPress: () => void newLink({ id: lessonId }) },
          { key: 'settings', icon: <SlidersIcon color={colors.muted} size={20} />, label: 'Lesson settings', onPress: () => router.push('/tool/lessons-settings') },
          { key: 'remove', icon: <TrashIcon color={colors.danger} size={20} />, label: 'Remove student', danger: true, onPress: () => setConfirm({ kind: 'student' }) },
        ]}
      />
      <RoutinePickSheet
        visible={!!picking}
        routines={log.data.routines.filter((r) => !r.assigned)}
        title={picking?.replace ? `Replace "${picking.replace.title}"` : 'Assign a routine'}
        onPick={(r) => void assign(r, picking?.replace)}
        onClose={() => setPicking(null)}
      />
      <NameDialog
        visible={renaming}
        title="Rename student"
        initialValue={data.name}
        onSubmit={(name) => void rename({ id: lessonId, name })}
        onClose={() => setRenaming(false)}
      />
      <ConfirmDialog
        visible={confirm?.kind === 'student'}
        title={`Remove ${data.name}?`}
        message="Everything you gave them goes too, and you stop seeing their practice. The routines you assigned leave their Shed Log; their own practice stays theirs."
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirm(null);
          void removeStudent({ id: lessonId });
          router.back();
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm?.kind === 'item'}
        title={confirm?.kind === 'item' ? `Remove "${confirm.item.title}"?` : ''}
        message="It leaves their Shed Log too (the days they already logged stay in their log)."
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirm?.kind === 'item') void removeItem({ itemId: confirm.item.id });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center justify-between py-2" style={{ borderBottomWidth: 1, borderColor: colors['surface-hover'] }}>
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        {label}
      </Text>
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

