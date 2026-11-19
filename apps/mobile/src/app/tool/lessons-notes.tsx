import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { formatShortDate, toDateKey } from '@jam-practice/core/practiceLog';
import { noteSnippet } from '@jam-practice/core/shedNotes';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PlusIcon } from '@/components/icons';
import { EmptyBox, ErrorLine, LessonsGate, LessonsScroll, NotFound, PersonHead, errorText, monthLabel, plural } from '@/components/lessons/parts';
import { notesRoute } from '@/components/lessons/sessions';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SmallButton } from '@/components/shedLog/parts';
import { SearchField } from '@/components/ui';
import { useNowCoarse } from '@/lib/useClock';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A lesson's notes (`?lesson=<student id>&session=<lesson id | earlier>`, the list half of the
 * website's `/lessons/notes` — on a phone the list and the note are separate screens there too):
 * newest first by month, with search; the teacher starts a new one. A note opens in `lessons-note`.
 * Left out: "Your own notes" (private Shed Notes attached to the lesson) — Shed Notes has its own
 * port.
 */
function NotesScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <LessonsGate />;
  return <Notes />;
}

export default withScreenLoader(NotesScreen);

function Notes() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const now = useNowCoarse();
  const { lesson, session } = useLocalSearchParams<{ lesson: string; session?: string }>();
  const sessionArg = session === 'earlier' ? null : session ? (session as Id<'lessonSessions'>) : undefined;
  const data = useQuery(api.lessons.notes, lesson ? { lessonId: lesson as Id<'lessonStudents'>, ...(sessionArg !== undefined ? { sessionId: sessionArg } : {}) } : 'skip');
  const addItem = useMutation(api.lessons.addItem);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notes = useMemo(() => data?.notes ?? [], [data]);
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const out: { month: string; notes: typeof notes }[] = [];
    for (const n of q ? notes.filter((x) => `${x.title} ${x.body}`.toLowerCase().includes(q)) : notes) {
      const month = monthLabel(n.createdAt);
      const last = out[out.length - 1];
      if (last?.month === month) last.notes.push(n);
      else out.push({ month, notes: [n] });
    }
    return out;
  }, [notes, q]);

  if (data === undefined) return <ScreenSpinner />;
  if (!data) return <NotFound title="Notes not found" body="These aren't your lesson notes (or notes are switched off)." />;

  const teacher = data.role === 'teacher';
  const heading = teacher ? data.studentName : (data.other?.name ?? 'Your teacher');
  const sessionKey = session ?? 'earlier';

  async function newNote() {
    setCreating(true);
    setError(null);
    try {
      const title = `Lesson — ${formatShortDate(toDateKey(new Date(now)))}`;
      const id = await addItem({ lessonId: lesson as Id<'lessonStudents'>, kind: 'note', title, body: '', ...(sessionArg ? { sessionId: sessionArg } : {}) });
      setQuery('');
      router.push(notesRoute(lesson, sessionKey, id));
    } catch (e) {
      setError(errorText(e, "Couldn't make the note."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Lesson notes' }} />
      <LessonsScroll>
        <PersonHead
          url={data.other?.avatarUrl}
          name={heading}
          title={data.session ? data.session.title : 'Lesson notes'}
          detail={`${data.session ? `${formatShortDate(toDateKey(new Date(data.session.start)))} · ` : session === 'earlier' ? 'Earlier · ' : ''}${teacher ? `For ${data.studentName}` : `From ${heading}`} · ${plural(notes.length, 'note')}`}
        />
        {teacher ? <SmallButton primary Icon={PlusIcon} label={creating ? 'Starting…' : 'New note'} disabled={creating} onPress={() => void newNote()} /> : null}
        <ErrorLine>{error}</ErrorLine>
        {notes.length > 3 ? <SearchField value={query} onChangeText={setQuery} placeholder="Search notes" /> : null}
        {notes.length === 0 ? (
          <EmptyBox
            title="No notes yet"
            body={teacher ? 'Write what you worked on and what to practice next.' : `Notes ${heading} writes for you show up here.`}
          />
        ) : groups.length === 0 ? (
          <EmptyBox body={`No notes match “${query}”.`} />
        ) : (
          groups.map((g) => (
            <View key={g.month} className="gap-1.5">
              <Text className="font-ui-semibold px-0.5 text-xs font-semibold" style={{ color: colors.muted }}>
                {g.month}
              </Text>
              <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
                {g.notes.map((n, i) => {
                  const snippet = noteSnippet(n.body, 90);
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => router.push(notesRoute(lesson, sessionKey, n.id))}
                      android_ripple={{ color: colors['surface-hover'] }}
                      className="gap-0.5 px-4 py-3"
                      style={i ? { borderTopWidth: 1, borderColor: colors['surface-hover'] } : undefined}
                    >
                      <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                        {n.title || 'Untitled'}
                      </Text>
                      <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                        {formatShortDate(toDateKey(new Date(n.createdAt)))}
                        {snippet ? ` · ${snippet}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </LessonsScroll>
    </View>
  );
}
