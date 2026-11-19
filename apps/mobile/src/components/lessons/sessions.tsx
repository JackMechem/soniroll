import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { LESSON_LENGTHS } from '@jam-practice/core/lessonSchedule';
import { formatShortDate, toDateKey } from '@jam-practice/core/practiceLog';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChevronRightIcon, ChordChartIcon, PlusIcon, type IconProps } from '@/components/icons';
import {
  AssignmentIcon,
  Badge,
  DateTile,
  EmptyBox,
  ErrorLine,
  FieldLabel,
  FileIcon,
  NotesIcon,
  errorText,
  isTimed,
  monthLabel,
  plural,
  relWhen,
  timeRange,
} from '@/components/lessons/parts';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { DateInput, TimeInput } from '@/components/shedLog/inputs';
import { ChoicePill, Field, Section, SmallButton } from '@/components/shedLog/parts';
import { SwitchRow } from '@/components/SwitchRow';
import { ToolSheet } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { LessonsIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A student's lessons (the website's `components/lessons/sessions.tsx`): coming up first, then past
 * ones by month, each opening its lesson; making and editing a lesson; and the Lessons screen's
 * "Coming up" across every student and teacher.
 */

type Counts = { notes: number; assignments: number; files: number; charts: number; open: number; toReview: number };

export const lessonRoute = (pair: string, id: string) => ({ pathname: '/tool/lessons-lesson' as const, params: { pair, id } });
/** A lesson's notes (`session` an id, or "earlier"), or one note in them. */
export const notesRoute = (lesson: string, session: string, note?: string) =>
  note
    ? { pathname: '/tool/lessons-note' as const, params: { lesson, session, note } }
    : { pathname: '/tool/lessons-notes' as const, params: { lesson, session } };
export const materialsRoute = (pair: string) => ({ pathname: '/tool/lessons-materials' as const, params: { pair } });

/** What's in a lesson, as small icon + count pairs. */
function Contents({ c }: { c: Counts }) {
  const { colors } = useAppTheme();
  const parts: { n: number; Icon: (p: IconProps) => React.ReactNode; label: string }[] = [
    { n: c.notes, Icon: NotesIcon, label: 'note' },
    { n: c.assignments, Icon: AssignmentIcon, label: 'assignment' },
    { n: c.files, Icon: FileIcon, label: 'file' },
    { n: c.charts, Icon: ChordChartIcon, label: 'chart' },
  ].filter((p) => p.n > 0);
  if (!parts.length)
    return (
      <Text className="font-ui text-xs italic" style={{ color: colors.muted }}>
        Nothing added yet
      </Text>
    );
  return (
    <View className="flex-row flex-wrap gap-x-3 gap-y-0.5">
      {parts.map(({ n, Icon, label }) => (
        <View key={label} className="flex-row items-center gap-1">
          <Icon color={colors.muted} size={13} />
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {plural(n, label)}
          </Text>
        </View>
      ))}
    </View>
  );
}

type Row = { id: Id<'lessonSessions'>; title: string; start: number; end: number | null; booked: boolean; cancelled: boolean; hiddenUntil: number | null; counts: Counts };

function ListHeading({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui-semibold px-4 pb-1 pt-3 text-xs font-semibold" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

function SessionRow({ s, pair, teacher, now, upcoming }: { s: Row; pair: string; teacher: boolean; now: number; upcoming?: boolean }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(lessonRoute(pair, s.id))} android_ripple={{ color: colors['surface-hover'] }} className="flex-row items-center gap-3 px-4 py-3">
      <DateTile ms={s.start} tone={s.cancelled ? 'muted' : upcoming ? 'accent' : 'plain'} />
      <View className="flex-1 gap-0.5">
        <Text
          numberOfLines={1}
          className="font-ui-semibold text-[15px] font-semibold"
          style={{ color: s.cancelled ? colors.muted : colors.foreground, textDecorationLine: s.cancelled ? 'line-through' : 'none' }}
        >
          {s.title}
        </Text>
        <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
          <Text style={{ color: colors.foreground }}>{relWhen(s.start, now)}</Text>
          {isTimed(s.start, s.end) ? ` · ${timeRange(s.start, s.end)}` : ''}
        </Text>
        <Contents c={s.counts} />
        {s.cancelled || s.booked || (teacher && s.hiddenUntil) || (teacher && s.counts.toReview > 0) || (!teacher && s.counts.open > 0) ? (
          <View className="mt-1 flex-row flex-wrap gap-1.5">
            {s.cancelled ? <Badge>Cancelled</Badge> : null}
            {s.booked && !s.cancelled ? <Badge tone="accent">Booked</Badge> : null}
            {teacher && s.hiddenUntil ? <Badge>Hidden until it starts</Badge> : null}
            {teacher && s.counts.toReview > 0 ? <Badge tone="accent">{`${s.counts.toReview} to review`}</Badge> : null}
            {!teacher && s.counts.open > 0 ? <Badge tone="warn">{`${s.counts.open} to do`}</Badge> : null}
          </View>
        ) : null}
      </View>
      <ChevronRightIcon color={colors.muted} size={18} />
    </Pressable>
  );
}

/** A pair's lessons: coming up (soonest first), then past ones by month, then "Before lessons". */
export function SessionList({ lessonId, otherName, now }: { lessonId: Id<'lessonStudents'>; otherName: string; now: number }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const data = useQuery(api.lessons.sessions, { lessonId });
  const [creating, setCreating] = useState(false);
  if (data === undefined)
    return (
      <View className="items-center rounded-xl p-8" style={{ backgroundColor: colors.surface }}>
        <LoadingSpinner />
      </View>
    );
  if (!data) return null;
  const teacher = data.role === 'teacher';
  const upcoming = data.sessions.filter((s) => (s.end ?? s.start) > now && !s.cancelled).reverse();
  const past = data.sessions.filter((s) => !((s.end ?? s.start) > now && !s.cancelled));
  const months: { key: string; label: string; rows: Row[] }[] = [];
  for (const s of past) {
    const d = new Date(s.start);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (months[months.length - 1]?.key !== key) months.push({ key, label: monthLabel(s.start), rows: [] });
    months[months.length - 1].rows.push(s);
  }
  const empty = data.sessions.length === 0 && !data.earlier;
  const detail = data.sessions.length ? `${plural(data.sessions.length, 'lesson')}${upcoming.length ? ` · next ${relWhen(upcoming[0].start, now).toLowerCase()}` : ''}` : undefined;

  return (
    <Section
      icon={<LessonsIcon color={colors.muted} size={16} />}
      title="Lessons"
      count={detail}
      action={teacher ? <SmallButton primary Icon={PlusIcon} label="New lesson" onPress={() => setCreating(true)} /> : undefined}
    >
      {empty ? (
        <EmptyBox
          title="No lessons yet"
          body={
            teacher
              ? `Make a lesson for ${otherName}, then put its notes, assignments, files and charts in it. Booked lessons get one automatically.`
              : `When ${otherName} adds a lesson, its notes and assignments show up here.`
          }
        />
      ) : (
        <>
          <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
            {upcoming.length > 0 ? (
              <>
                <ListHeading>Coming up</ListHeading>
                {upcoming.map((s) => (
                  <SessionRow key={s.id} s={s} pair={lessonId} teacher={teacher} now={now} upcoming />
                ))}
              </>
            ) : null}
            {months.map((m) => (
              <View key={m.key}>
                <ListHeading>{m.label}</ListHeading>
                {m.rows.map((s) => (
                  <SessionRow key={s.id} s={s} pair={lessonId} teacher={teacher} now={now} />
                ))}
              </View>
            ))}
            {data.earlier ? (
              <>
                <ListHeading>Before lessons</ListHeading>
                <Pressable onPress={() => router.push(lessonRoute(lessonId, 'earlier'))} android_ripple={{ color: colors['surface-hover'] }} className="flex-row items-center gap-3 px-4 py-3">
                  <View className="w-11 items-center">
                    <LessonsIcon color={colors.muted} size={18} />
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                      Added before lessons
                    </Text>
                    <Contents c={data.earlier} />
                  </View>
                  <ChevronRightIcon color={colors.muted} size={18} />
                </Pressable>
              </>
            ) : null}
          </View>
          <View className="self-start">
            <SmallButton label="All materials" onPress={() => router.push(materialsRoute(lessonId))} />
          </View>
        </>
      )}
      <NewLessonSheet visible={creating} lessonId={lessonId} otherName={otherName} now={now} onClose={() => setCreating(false)} />
    </Section>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const startOf = (date: string, time: string | null) => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time ?? '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
};

/** A new lesson (or editing one): a title, a day, a time if you like, and whether the student sees
    it before it starts. */
export function NewLessonSheet({
  visible,
  lessonId,
  otherName,
  now,
  onClose,
  initial,
  sessionId,
}: {
  visible: boolean;
  lessonId: Id<'lessonStudents'>;
  otherName: string;
  now: number;
  onClose: () => void;
  initial?: { title: string; start: number; end: number | null; hidden: boolean };
  sessionId?: Id<'lessonSessions'>;
}) {
  return (
    <ToolSheet visible={visible} onClose={onClose} title={sessionId ? 'Edit lesson' : `New lesson with ${otherName}`}>
      {visible ? <LessonForm lessonId={lessonId} otherName={otherName} now={now} onClose={onClose} initial={initial} sessionId={sessionId} /> : null}
    </ToolSheet>
  );
}

function LessonForm({
  lessonId,
  otherName,
  now,
  onClose,
  initial,
  sessionId,
}: {
  lessonId: Id<'lessonStudents'>;
  otherName: string;
  now: number;
  onClose: () => void;
  initial?: { title: string; start: number; end: number | null; hidden: boolean };
  sessionId?: Id<'lessonSessions'>;
}) {
  const router = useRouter();
  const create = useMutation(api.lessons.createSession);
  const update = useMutation(api.lessons.updateSession);
  const startAt = initial?.start ?? now;
  const startDate = new Date(startAt);
  const timed = !!initial && (startDate.getHours() !== 0 || startDate.getMinutes() !== 0);
  const [date, setDate] = useState(toDateKey(startDate));
  const [time, setTime] = useState<string | null>(timed ? `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}` : null);
  const [length, setLength] = useState(initial?.end ? Math.round((initial.end - initial.start) / 60000) : 60);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [hidden, setHidden] = useState(initial?.hidden ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = startOf(date, time);
  const future = start > now;
  const autoTitle = `Lesson — ${formatShortDate(date)}`;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const end = time ? start + length * 60000 : undefined;
      if (sessionId) {
        await update({ sessionId, title: title.trim() || autoTitle, start, end: end ?? null, hidden: hidden && future });
        onClose();
      } else {
        const id = await create({ lessonId, title: title.trim() || autoTitle, start, ...(end ? { end } : {}), hidden: hidden && future });
        onClose();
        router.push(lessonRoute(lessonId, id));
      }
    } catch (e) {
      setError(errorText(e, "Couldn't save the lesson."));
      setBusy(false);
    }
  }

  return (
    <>
      <View className="gap-1.5">
        <FieldLabel>Title</FieldLabel>
        <Field value={title} onChangeText={setTitle} placeholder={autoTitle} />
      </View>
      <View className="gap-1.5">
        <FieldLabel>Day</FieldLabel>
        <DateInput value={date} onChange={setDate} />
      </View>
      <View className="gap-1.5">
        <FieldLabel aside="(optional)">Time</FieldLabel>
        <TimeInput value={time} onChange={setTime} allowNone noneLabel="No time" />
      </View>
      {time ? (
        <View className="gap-1.5">
          <FieldLabel>Length</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {LESSON_LENGTHS.map((m) => (
              <ChoicePill key={m} label={`${m} min`} on={length === m} onPress={() => setLength(m)} />
            ))}
          </View>
        </View>
      ) : null}
      {future ? (
        <SwitchRow
          label={`Hide it from ${otherName} until it starts`}
          checked={hidden}
          onChange={setHidden}
          hint="Get the lesson ready ahead of time; it opens for them when it starts."
        />
      ) : null}
      <ErrorLine>{error}</ErrorLine>
      <View className="flex-row justify-end gap-2">
        <Button label="Cancel" kind="secondary" onPress={onClose} />
        <Button label={busy ? 'Saving…' : sessionId ? 'Save' : 'Make the lesson'} disabled={busy || !Number.isFinite(start)} onPress={() => void save()} />
      </View>
    </>
  );
}

/** The Lessons screen's "Coming up": every upcoming lesson across your students and teachers. A
    student's lesson that isn't open yet shows its time only. */
export function UpcomingLessons({ now }: { now: number }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const data = useQuery(api.lessons.upcomingLessons, {});
  if (!data || data.length === 0) return null;
  return (
    <Section title="Coming up">
      <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
        {data.slice(0, 8).map((l, i) => (
          <Pressable
            key={l.id}
            disabled={l.locked}
            onPress={() => router.push(lessonRoute(l.lessonId, l.id))}
            android_ripple={{ color: colors['surface-hover'] }}
            className="flex-row items-center gap-3 px-4 py-3"
            style={i ? { borderTopWidth: 1, borderColor: colors['surface-hover'] } : undefined}
          >
            <DateTile ms={l.start} tone="accent" />
            <View className="flex-1 gap-0.5">
              <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                {l.title}
              </Text>
              <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                <Text style={{ color: colors.foreground }}>{relWhen(l.start, now)}</Text>
                {isTimed(l.start, l.end) ? ` · ${timeRange(l.start, l.end)}` : ''}
                {` · ${l.role === 'teacher' ? 'with' : 'from'} ${l.with}`}
              </Text>
              {l.booked || (l.role === 'teacher' && l.hidden) || l.locked ? (
                <View className="mt-1 flex-row flex-wrap gap-1.5">
                  {l.booked ? <Badge tone="accent">Booked</Badge> : null}
                  {l.role === 'teacher' && l.hidden ? <Badge>Hidden until it starts</Badge> : null}
                  {l.locked ? <Badge>Opens when it starts</Badge> : null}
                </View>
              ) : null}
            </View>
            {!l.locked ? <ChevronRightIcon color={colors.muted} size={18} /> : null}
          </Pressable>
        ))}
      </View>
    </Section>
  );
}
