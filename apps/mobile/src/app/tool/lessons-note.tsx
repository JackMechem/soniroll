import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { formatLongDate, formatShortDate, toDateKey } from '@jam-practice/core/practiceLog';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TrashIcon } from '@/components/icons';
import { MarkdownView, NoteTextEditor } from '@/components/lessons/Markdown';
import { LessonsGate, LessonsScroll, NotFound } from '@/components/lessons/parts';
import { SAVE_LABEL, useAutosave } from '@/components/notation/autosave';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { GhostIcon } from '@/components/shedLog/parts';
import { Segmented } from '@/components/tool/reward';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * One lesson note (`?lesson=&session=&note=`, the note half of the website's `/lessons/notes`).
 * The teacher writes it — the title, and the Markdown text with a formatting toolbar, saved as you
 * type — and can flip to Preview; the student reads it rendered.
 */
function NoteScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <LessonsGate />;
  return <NoteLoader />;
}

export default withScreenLoader(NoteScreen);

function NoteLoader() {
  const { lesson, session, note } = useLocalSearchParams<{ lesson: string; session?: string; note: string }>();
  const sessionArg = session === 'earlier' ? null : session ? (session as Id<'lessonSessions'>) : undefined;
  const data = useQuery(api.lessons.notes, lesson ? { lessonId: lesson as Id<'lessonStudents'>, ...(sessionArg !== undefined ? { sessionId: sessionArg } : {}) } : 'skip');
  if (data === undefined) return <ScreenSpinner />;
  const found = data?.notes.find((n) => n.id === note);
  if (!data || !found) return <NotFound title="Note not found" body="It may have been deleted." />;
  return <NoteView key={found.id} lessonId={lesson} note={found} teacher={data.role === 'teacher'} />;
}

type Note = { id: Id<'lessonItems'>; title: string; body: string; createdAt: number; updatedAt: number };

function NoteView({ lessonId, note, teacher }: { lessonId: string; note: Note; teacher: boolean }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const update = useMutation(api.lessons.updateItem);
  const remove = useMutation(api.lessons.removeItem);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [mode, setMode] = useState<'write' | 'read'>(teacher && !note.body.trim() ? 'write' : 'read');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { change, flush, saveState } = useAutosave((v: { title: string; body: string }) => update({ itemId: note.id, title: v.title, body: v.body }).then(() => undefined));
  const created = formatLongDate(toDateKey(new Date(note.createdAt)));
  const edited = note.updatedAt > note.createdAt + 60000 ? ` · edited ${formatShortDate(toDateKey(new Date(note.updatedAt)))}` : '';

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* The note's own title is the big heading below; the header just says what this is. */}
      <Stack.Screen options={{ title: 'Lesson note' }} />
      <LessonsScroll gap={12}>
        <View className="flex-row items-start gap-2">
          <View className="flex-1">
            {teacher ? (
              <TextInput
                value={title}
                onChangeText={(t) => {
                  setTitle(t);
                  change({ title: t, body });
                }}
                onBlur={flush}
                placeholder="Title"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Note title"
                className="font-ui-extrabold text-2xl font-extrabold"
                style={{ color: colors.foreground, paddingVertical: 4 }}
              />
            ) : (
              <Text className="font-ui-extrabold text-2xl font-extrabold leading-tight" style={{ color: colors.foreground }}>
                {note.title || 'Untitled'}
              </Text>
            )}
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              {created}
              {edited}
              {teacher ? ` · ${SAVE_LABEL[saveState]}` : ''}
            </Text>
          </View>
          {teacher ? <GhostIcon Icon={TrashIcon} label="Delete note" onPress={() => setConfirmDelete(true)} /> : null}
        </View>
        {teacher ? (
          <Segmented
            label="Write or preview"
            onPage
            value={mode}
            onChange={(m) => {
              flush();
              setMode(m);
            }}
            options={[
              { value: 'write', label: 'Write' },
              { value: 'read', label: 'Preview' },
            ]}
          />
        ) : null}
        {teacher && mode === 'write' ? (
          <NoteTextEditor
            value={body}
            onChange={(t) => {
              setBody(t);
              change({ title, body: t });
            }}
            placeholder="What you worked on, what to practice next… Use the buttons above for headings, lists and checklists."
          />
        ) : body.trim() ? (
          <View className="rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
            <MarkdownView body={body} lessonId={lessonId} />
          </View>
        ) : (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            This note is empty.
          </Text>
        )}
      </LessonsScroll>
      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete “${note.title || 'Untitled'}”?`}
        message="Your student won't see it anymore. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          void remove({ itemId: note.id });
          router.back();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}
