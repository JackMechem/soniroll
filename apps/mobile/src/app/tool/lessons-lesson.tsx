import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { formatShortDate, toDateKey } from '@jam-practice/core/practiceLog';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ChevronLeftIcon, ChevronRightIcon, ChordChartIcon, DotsVerticalIcon, EyeOffIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { ChartPickerModal } from '@/components/library/ChartPickerModal';
import { ItemCard, ItemSheet, type ItemEdit } from '@/components/lessons/items';
import {
  AssignmentIcon,
  EmptyBox,
  FileIcon,
  KindFilter,
  LessonsGate,
  LessonsScroll,
  NotFound,
  NotesIcon,
  PersonHead,
  errorText,
  sessionWhen,
  sortItems,
  type LessonKind,
} from '@/components/lessons/parts';
import { NewLessonSheet, lessonRoute, notesRoute } from '@/components/lessons/sessions';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { GhostIcon, SmallButton } from '@/components/shedLog/parts';
import { useNowCoarse, useToday } from '@/lib/useClock';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * One lesson (`?pair=<student id>&id=<lesson id | earlier>`, the website's `/lessons/lesson`): its
 * notes, assignments, files and chord charts. The teacher adds and edits them, renames or re-dates
 * the lesson and decides when the student sees it; the student reads, ticks off and hands in.
 */
function LessonScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <LessonsGate />;
  return <Lesson />;
}

export default withScreenLoader(LessonScreen);

function Lesson() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { pair, id } = useLocalSearchParams<{ pair: string; id: string }>();
  const lessonId = pair as Id<'lessonStudents'>;
  const sessionId = id && id !== 'earlier' ? (id as Id<'lessonSessions'>) : undefined;
  const today = useToday();
  const now = useNowCoarse();
  const data = useQuery(api.lessons.session, pair ? { lessonId, ...(sessionId ? { sessionId } : {}) } : 'skip');
  const list = useQuery(api.lessons.sessions, pair ? { lessonId } : 'skip');
  const addItem = useMutation(api.lessons.addItem);
  const addChart = useMutation(api.lessons.addChart);
  const removeItem = useMutation(api.lessons.removeItem);
  const setDone = useMutation(api.lessons.setDone);
  const updateSession = useMutation(api.lessons.updateSession);
  const removeSession = useMutation(api.lessons.removeSession);
  const [filter, setFilter] = useState<LessonKind | 'all'>('all');
  const [edit, setEdit] = useState<ItemEdit | null>(null);
  const [pickingChart, setPickingChart] = useState(false);
  const [menu, setMenu] = useState<'add' | 'more' | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'lesson' } | { kind: 'item'; id: Id<'lessonItems'>; title: string; assignment: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) return <ScreenSpinner />;
  if (!data) return <NotFound title="Lesson not found" body="It may have been deleted, or it isn't open to you yet." />;

  const teacher = data.role === 'teacher';
  const f = data.features;
  const s = data.session;
  const otherName = teacher ? data.studentName : (data.other?.name ?? 'Your teacher');
  const sessionKey = s ? s.id : 'earlier';
  const items = sortItems(data.items.filter((i) => filter === 'all' || i.kind === filter));
  const hasNotes = f.notes && data.items.some((i) => i.kind === 'note');

  async function newNote() {
    try {
      const title = s ? `Notes — ${s.title}` : `Lesson — ${formatShortDate(toDateKey(new Date(now)))}`;
      const noteId = await addItem({ lessonId, kind: 'note', title, body: '', ...(sessionId ? { sessionId } : {}) });
      router.push(notesRoute(lessonId, sessionKey, noteId));
    } catch (e) {
      setError(errorText(e, "Couldn't make the note."));
    }
  }

  const addActions: SheetAction[] = [
    ...(f.assignments ? [{ key: 'assignment', icon: <AssignmentIcon color={colors.muted} size={20} />, label: 'Assignment', onPress: () => setEdit({ kind: 'assignment' }) }] : []),
    ...(f.notes ? [{ key: 'note', icon: <NotesIcon color={colors.muted} size={20} />, label: 'Lesson notes', onPress: () => void newNote() }] : []),
    ...(f.files ? [{ key: 'file', icon: <FileIcon color={colors.muted} size={20} />, label: 'PDF, image or audio', onPress: () => setEdit({ kind: 'file' }) }] : []),
    ...(f.charts ? [{ key: 'chart', icon: <ChordChartIcon color={colors.muted} size={20} />, label: 'Chord chart', onPress: () => setPickingChart(true) }] : []),
  ];
  const moreActions: SheetAction[] = s
    ? [
        { key: 'edit', icon: <PencilIcon color={colors.muted} size={20} />, label: 'Edit title and time', onPress: () => setEditing(true) },
        ...(s.hiddenUntil
          ? [{ key: 'show', icon: <EyeOffIcon color={colors.muted} size={20} />, label: `Show it to ${otherName} now`, onPress: () => void updateSession({ sessionId: s.id, hidden: false }) }]
          : s.start > now
            ? [{ key: 'hide', icon: <EyeOffIcon color={colors.muted} size={20} />, label: `Hide it from ${otherName} until it starts`, onPress: () => void updateSession({ sessionId: s.id, hidden: true }) }]
            : []),
        { key: 'delete', icon: <TrashIcon color={colors.danger} size={20} />, label: 'Delete lesson', danger: true, onPress: () => setConfirm({ kind: 'lesson' }) },
      ]
    : [];

  // The lessons before and after this one, by date (`list` is newest first).
  const at = s && list ? list.sessions.findIndex((x) => x.id === s.id) : -1;
  const newer = at > 0 ? list!.sessions[at - 1] : undefined;
  const older = at >= 0 && list ? list.sessions[at + 1] : undefined;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: otherName }} />
      <LessonsScroll>
        <PersonHead
          url={data.other?.avatarUrl}
          name={otherName}
          title={s ? s.title : 'Before lessons'}
          detail={`${s ? sessionWhen(s.start, s.end) : 'Things added before lessons had their own pages'} · with ${teacher ? data.studentName : otherName}${s?.booked ? ' · booked' : ''}${s?.cancelled ? ' · cancelled' : ''}`}
          right={teacher && s ? <GhostIcon Icon={DotsVerticalIcon} label="Lesson options" onPress={() => setMenu('more')} color={colors.foreground} size={22} /> : undefined}
        />
        {teacher || hasNotes ? (
          <View className="flex-row gap-2">
            {hasNotes ? <SmallButton Icon={NotesIcon} label="Notes" onPress={() => router.push(notesRoute(lessonId, sessionKey))} /> : null}
            {teacher && addActions.length ? <SmallButton primary Icon={PlusIcon} label="Add" onPress={() => setMenu('add')} /> : null}
          </View>
        ) : null}
        {error ? (
          <Text className="font-ui text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
        {teacher && s?.hiddenUntil ? (
          <View className="gap-2 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
            <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
              <Text className="font-ui-semibold font-semibold" style={{ color: colors.foreground }}>
                {data.studentName} can&apos;t see this yet.
              </Text>{' '}
              It opens for them when the lesson starts — get it ready now.
            </Text>
            <View className="self-start">
              <SmallButton label="Show it now" onPress={() => void updateSession({ sessionId: s.id, hidden: false })} />
            </View>
          </View>
        ) : null}
        {newer || older ? (
          <View className="flex-row items-center justify-between gap-2">
            {older ? <StepLink dir="prev" title={older.title} start={older.start} onPress={() => router.replace(lessonRoute(lessonId, older.id))} /> : <View />}
            {newer ? <StepLink dir="next" title={newer.title} start={newer.start} onPress={() => router.replace(lessonRoute(lessonId, newer.id))} /> : null}
          </View>
        ) : null}
        {data.items.length > 0 ? <KindFilter items={data.items} value={filter} onChange={setFilter} /> : null}
        {items.length === 0 ? (
          <EmptyBox
            title={filter === 'all' ? 'Nothing in this lesson yet' : 'Nothing here'}
            body={teacher ? 'Add lesson notes, an assignment, a file or a chord chart.' : `When ${otherName} adds notes or assignments to this lesson, they show up here.`}
            action={teacher && addActions.length ? <SmallButton primary Icon={PlusIcon} label="Add" onPress={() => setMenu('add')} /> : undefined}
          />
        ) : (
          items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              teacher={teacher}
              today={today}
              now={now}
              studentName={data.studentName}
              saveChartsAs={teacher ? undefined : `From ${otherName}`}
              onOpenNotes={item.kind === 'note' ? () => router.push(notesRoute(lessonId, sessionKey, item.id)) : undefined}
              onToggleDone={!teacher && item.kind === 'assignment' && !item.submit ? (done) => void setDone({ itemId: item.id, done }) : undefined}
              onEdit={
                !teacher
                  ? undefined
                  : item.kind === 'note'
                    ? () => router.push(notesRoute(lessonId, sessionKey, item.id))
                    : item.kind === 'assignment' || item.kind === 'file'
                      ? () => setEdit({ kind: item.kind as 'assignment' | 'file', item })
                      : undefined
              }
              onRemove={teacher ? () => setConfirm({ kind: 'item', id: item.id, title: item.title, assignment: item.kind === 'assignment' }) : undefined}
            />
          ))
        )}
      </LessonsScroll>

      <ActionSheet visible={menu === 'add'} title="Add to this lesson" onClose={() => setMenu(null)} actions={addActions} />
      <ActionSheet visible={menu === 'more'} title={s?.title} onClose={() => setMenu(null)} actions={moreActions} />
      {teacher ? <ItemSheet lessonId={lessonId} sessionId={sessionId} edit={edit} today={today} onClose={() => setEdit(null)} /> : null}
      {teacher ? (
        <ChartPickerModal
          visible={pickingChart}
          title="Give them a chord chart"
          onPick={(song) => {
            setPickingChart(false);
            void addChart({ lessonId, songId: song.id as Id<'chordChartSongs'>, ...(sessionId ? { sessionId } : {}) }).catch((e) => setError(errorText(e, "Couldn't add the chart.")));
          }}
          onClose={() => setPickingChart(false)}
        />
      ) : null}
      {s ? (
        <NewLessonSheet
          visible={editing}
          lessonId={lessonId}
          otherName={otherName}
          now={now}
          sessionId={s.id}
          initial={{ title: s.title, start: s.start, end: s.end, hidden: !!s.hiddenUntil }}
          onClose={() => setEditing(false)}
        />
      ) : null}
      <ConfirmDialog
        visible={confirm?.kind === 'lesson'}
        title={`Delete “${s?.title ?? ''}”?`}
        message={`Its notes, assignments (and what ${data.studentName} handed in), files and charts are deleted too.${s?.booked && !s.cancelled ? " The booked time stays booked — cancel it from the Booking card if it's off." : ''}`}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirm(null);
          if (s) void removeSession({ sessionId: s.id });
          router.back();
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm?.kind === 'item'}
        title={confirm?.kind === 'item' ? `Remove "${confirm.title}"?` : ''}
        message={confirm?.kind === 'item' && confirm.assignment ? 'What they handed in for it goes too.' : "Your student won't see it anymore."}
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirm?.kind === 'item') void removeItem({ itemId: confirm.id });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}

function StepLink({ dir, title, start, onPress }: { dir: 'prev' | 'next'; title: string; start: number; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" className="max-w-[48%] flex-row items-center gap-0.5 py-1.5">
      {dir === 'prev' ? <ChevronLeftIcon color={colors.muted} size={18} /> : null}
      <View className={dir === 'next' ? 'items-end' : ''}>
        <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
          {dir === 'prev' ? 'Previous' : 'Next'} · {formatShortDate(toDateKey(new Date(start)))}
        </Text>
        <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
          {title}
        </Text>
      </View>
      {dir === 'next' ? <ChevronRightIcon color={colors.muted} size={18} /> : null}
    </Pressable>
  );
}
