import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ChevronRightIcon } from '@/components/icons';
import { ItemCard, ItemSheet, type ItemEdit } from '@/components/lessons/items';
import { Badge, EmptyBox, KindFilter, LessonsGate, LessonsScroll, NotFound, PersonHead, dayLabel, plural, sortItems, type LessonItem, type LessonKind } from '@/components/lessons/parts';
import { lessonRoute, notesRoute } from '@/components/lessons/sessions';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SearchField } from '@/components/ui';
import { useNowCoarse, useToday } from '@/lib/useClock';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Everything given across all of a pair's lessons (`?pair=`, the website's `/lessons/materials`):
 * notes, assignments, files and charts grouped by lesson (newest first), with a type filter and
 * search. The teacher edits and removes here; the student reads and hands in, as on a lesson.
 */
function MaterialsScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <LessonsGate />;
  return <Materials />;
}

export default withScreenLoader(MaterialsScreen);

function Materials() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { pair } = useLocalSearchParams<{ pair: string }>();
  const lessonId = pair as Id<'lessonStudents'>;
  const today = useToday();
  const now = useNowCoarse();
  const data = useQuery(api.lessons.materials, pair ? { lessonId } : 'skip');
  const removeItem = useMutation(api.lessons.removeItem);
  const setDone = useMutation(api.lessons.setDone);
  const [filter, setFilter] = useState<LessonKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<ItemEdit | null>(null);
  const [removing, setRemoving] = useState<LessonItem | null>(null);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const items = data.items.filter(
      (i) => (filter === 'all' || i.kind === filter) && (!q || `${i.title} ${i.body} ${i.fileName ?? ''} ${(i.chart as { title?: string } | null)?.title ?? ''}`.toLowerCase().includes(q)),
    );
    const bySession = new Map<string, LessonItem[]>();
    for (const i of items) {
      const k = i.sessionId ?? 'earlier';
      bySession.set(k, [...(bySession.get(k) ?? []), i]);
    }
    const out = data.sessions.filter((s) => bySession.has(s.id)).map((s) => ({ key: s.id as string, session: s as (typeof data.sessions)[number] | null, items: sortItems(bySession.get(s.id)!) }));
    if (bySession.has('earlier')) out.push({ key: 'earlier', session: null, items: sortItems(bySession.get('earlier')!) });
    return out;
  }, [data, filter, query]);

  if (data === undefined) return <ScreenSpinner />;
  if (!data) return <NotFound title="Not found" body="You're not part of these lessons." />;

  const teacher = data.role === 'teacher';
  const otherName = teacher ? data.studentName : (data.other?.name ?? 'Your teacher');
  const all = data.items;
  const open = all.filter((i) => i.kind === 'assignment' && !i.done).length;
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: otherName }} />
      <LessonsScroll>
        <PersonHead
          url={data.other?.avatarUrl}
          name={otherName}
          title="All materials"
          detail={`${teacher ? `Everything you've given ${data.studentName}` : `Everything from ${otherName}`} · ${plural(all.length, 'thing')} across ${plural(data.sessions.length, 'lesson')}${open ? ` · ${plural(open, 'assignment')} ${teacher ? 'open' : 'to do'}` : ''}`}
        />
        {all.length > 0 ? <SearchField value={query} onChangeText={setQuery} placeholder="Search notes, assignments, files and charts" /> : null}
        {all.length > 0 ? <KindFilter items={all} value={filter} onChange={setFilter} /> : null}
        {all.length === 0 ? (
          <EmptyBox
            title="Nothing yet"
            body={teacher ? 'Add notes, assignments, files and charts inside a lesson — they all show up here.' : `When ${otherName} adds things to your lessons, they all show up here.`}
          />
        ) : shown === 0 ? (
          <EmptyBox body="Nothing matches." />
        ) : (
          groups.map((g) => {
            const sessionKey = g.session ? g.session.id : 'earlier';
            return (
              <View key={g.key} className="gap-2">
                <Pressable onPress={() => router.push(lessonRoute(pair, sessionKey))} accessibilityRole="link" className="flex-row flex-wrap items-center gap-2 py-1">
                  <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                    {g.session ? g.session.title : 'Before lessons'}
                  </Text>
                  {g.session ? (
                    <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                      {dayLabel(g.session.start)}
                    </Text>
                  ) : null}
                  {teacher && g.session?.hidden ? <Badge>Hidden until it starts</Badge> : null}
                  <ChevronRightIcon color={colors.muted} size={15} />
                </Pressable>
                {g.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    teacher={teacher}
                    today={today}
                    now={now}
                    studentName={data.studentName}
                    saveChartsAs={teacher ? undefined : `From ${otherName}`}
                    onOpenNotes={item.kind === 'note' ? () => router.push(notesRoute(pair, sessionKey, item.id)) : undefined}
                    onToggleDone={!teacher && item.kind === 'assignment' && !item.submit ? (done) => void setDone({ itemId: item.id, done }) : undefined}
                    onEdit={
                      !teacher
                        ? undefined
                        : item.kind === 'note'
                          ? () => router.push(notesRoute(pair, sessionKey, item.id))
                          : item.kind === 'assignment' || item.kind === 'file'
                            ? () => setEdit({ kind: item.kind as 'assignment' | 'file', item })
                            : undefined
                    }
                    onRemove={teacher ? () => setRemoving(item) : undefined}
                  />
                ))}
              </View>
            );
          })
        )}
      </LessonsScroll>
      {teacher ? <ItemSheet lessonId={lessonId} edit={edit} today={today} onClose={() => setEdit(null)} /> : null}
      <ConfirmDialog
        visible={!!removing}
        title={`Remove "${removing?.title ?? ''}"?`}
        message={removing?.kind === 'assignment' ? 'What they handed in for it goes too.' : "Your student won't see it anymore."}
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) void removeItem({ itemId: removing.id });
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </View>
  );
}
