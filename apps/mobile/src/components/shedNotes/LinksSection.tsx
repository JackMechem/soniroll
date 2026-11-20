import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { findWikiLinks, parseTargetKey, titleKey } from '@jam-practice/core/shedNotes';
import { useMutation } from 'convex/react';
import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CalendarCheckIcon, CloseIcon, LessonsIcon, LinkIcon, MusicNoteIcon } from '@/components/icons';
import { NoteDocIcon } from '@/components/shedNotes/icons';
import type { NoteMeta } from '@/lib/useShedNotes';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Where an attachment lives in the app (lessons aren't on the phone yet). */
export function targetRoute(target: string): Href | null {
  const t = parseTargetKey(target);
  if (!t) return null;
  if (t.kind === 'tune') return { pathname: '/library/tune', params: { id: t.tuneId } };
  if (t.kind === 'lesson') return null;
  return { pathname: '/tool/shed-log', params: { date: t.date } };
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2">
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
        {title}
        {count !== undefined ? ` · ${count}` : ''}
      </Text>
      {children}
    </View>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui text-xs leading-5" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

/**
 * Under a note (the website's links panel): what it's attached to in the Shed Log and your tunes
 * (× takes it off), the notes that link here (backlinks), the notes it links to (one that doesn't
 * exist yet is made when you open it), and its #tags.
 */
export function LinksSection({
  note,
  body,
  notes,
  onOpen,
  onOpenTitle,
  onTag,
}: {
  note: { id: string; title: string; tags: string[]; attached: { target: string; label: string }[] };
  body: string;
  notes: NoteMeta[];
  onOpen: (id: string) => void;
  onOpenTitle: (title: string) => void;
  onTag: (tag: string) => void;
}) {
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const detach = useMutation(api.shedNotes.detachNote);
  const key = titleKey(note.title);
  const backlinks = notes.filter((n) => n.id !== note.id && n.links.includes(key));
  const byKey = new Map(notes.map((n) => [titleKey(n.title), n]));
  const seen = new Set<string>();
  const forward = findWikiLinks(body).flatMap((l) => {
    const k = titleKey(l.target);
    if (seen.has(k) || k === key) return [];
    seen.add(k);
    return [{ title: l.target, note: byKey.get(k) ?? null }];
  });

  const row = (opts: { key: string; icon: ReactNode; title: string; detail?: string; muted?: boolean; onPress?: () => void; right?: ReactNode }) => (
    <Pressable
      key={opts.key}
      onPress={opts.onPress}
      disabled={!opts.onPress}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[44px] flex-row items-center gap-2.5 overflow-hidden rounded-lg px-3 py-2"
      style={{ backgroundColor: derived.fill }}
    >
      {opts.icon}
      <View className="flex-1">
        <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: opts.muted ? colors.muted : colors.foreground }}>
          {opts.title}
        </Text>
        {opts.detail ? (
          <Text numberOfLines={2} className="font-ui text-xs" style={{ color: colors.muted }}>
            {opts.detail}
          </Text>
        ) : null}
      </View>
      {opts.right}
    </Pressable>
  );

  return (
    <View className="gap-5">
      <Section title="Attached to" count={note.attached.length}>
        {note.attached.length === 0 ? (
          <Quiet>Attach this note to a routine or a day in the Shed Log (Add notes), or to a tune.</Quiet>
        ) : (
          <View className="gap-1.5">
            {note.attached.map((a) => {
              const route = targetRoute(a.target);
              const Icon = a.target.startsWith('tune:') ? MusicNoteIcon : a.target.startsWith('lesson:') ? LessonsIcon : CalendarCheckIcon;
              return row({
                key: a.target,
                icon: <Icon color={colors.muted} size={18} />,
                title: a.label,
                // The Shed Log is a tab: switch to it (with the day) rather than stacking a second one.
                onPress: route ? () => (a.target.startsWith('day:') ? router.navigate(route) : router.push(route)) : undefined,
                right: (
                  <Pressable
                    onPress={() => void detach({ noteId: note.id as Id<'shedNotes'>, target: a.target })}
                    accessibilityRole="button"
                    accessibilityLabel={`Take off ${a.label}`}
                    hitSlop={8}
                    className="h-8 w-8 items-center justify-center rounded-full"
                  >
                    <CloseIcon color={colors.muted} size={16} />
                  </Pressable>
                ),
              });
            })}
          </View>
        )}
      </Section>

      <Section title="Backlinks" count={backlinks.length}>
        {backlinks.length === 0 ? (
          <Quiet>No notes link here yet. Link to it from another note with [[{note.title}]].</Quiet>
        ) : (
          <View className="gap-1.5">
            {backlinks.map((n) => row({ key: n.id, icon: <NoteDocIcon color={colors.muted} size={18} />, title: n.title, detail: n.snippet || undefined, onPress: () => onOpen(n.id) }))}
          </View>
        )}
      </Section>

      <Section title="Links" count={forward.length}>
        {forward.length === 0 ? (
          <Quiet>Type [[ in the note to link another one.</Quiet>
        ) : (
          <View className="gap-1.5">
            {forward.map((f) =>
              row({
                key: f.title,
                icon: <LinkIcon color={colors.muted} size={18} />,
                title: f.note?.title ?? f.title,
                detail: f.note ? undefined : 'No note with this name yet — open it to make it',
                muted: !f.note,
                onPress: () => (f.note ? onOpen(f.note.id) : onOpenTitle(f.title)),
              }),
            )}
          </View>
        )}
      </Section>

      {note.tags.length > 0 ? (
        <Section title="Tags">
          <View className="flex-row flex-wrap gap-1.5">
            {note.tags.map((t) => (
              <Pressable key={t} onPress={() => onTag(t)} accessibilityRole="button" className="rounded-md px-2 py-1" style={{ backgroundColor: derived.fill }}>
                <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
                  #{t}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}
    </View>
  );
}
