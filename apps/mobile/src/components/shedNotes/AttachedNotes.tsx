import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { targetKey, type NoteTarget } from '@jam-practice/core/shedNotes';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PlusIcon } from '@/components/icons';
import { NoteDocIcon, NotePlusIcon } from '@/components/shedNotes/icons';
import { ToolSheet } from '@/components/tool/SettingChip';
import { SearchField } from '@/components/ui';
import { errorText } from '@/lib/useShedNotes';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Opens a note in Shed Notes. */
export function useOpenNote() {
  const router = useRouter();
  return (id: string, opts: { edit?: boolean } = {}) => router.push({ pathname: '/tool/shed-notes-note', params: { id, ...(opts.edit ? { edit: '1' } : {}) } });
}

/**
 * Shed Notes attached to one thing — a routine on a day, a day, or a tune (the website's
 * `AttachedNotes`): each as a card (title and the start of its text) that opens it, and "Add notes",
 * which offers a new note (attached, and opened to write in) or one you already have. `label` names
 * the thing (a note's "Attached to" list shows it); `newTitle` is a new note's title. Account only:
 * nothing shows signed out. `button`: "Add notes" as a full soft button (and a line when there are
 * none), as on the tune page beside its other sections.
 */
export function AttachedNotes({
  target,
  label,
  newTitle,
  compact,
  button,
  addLabel = 'Add notes',
}: {
  target: NoteTarget;
  label: string;
  newTitle: string;
  compact?: boolean;
  button?: boolean;
  /** The add button's words (a routine's card says which day the note is for). */
  addLabel?: string;
}) {
  const { colors, derived } = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const key = targetKey(target);
  const rows = useQuery(api.shedNotes.attachedTo, isAuthenticated ? { prefix: key } : 'skip');
  const notes = rows?.filter((r) => r.target === key);
  const open = useOpenNote();
  const [adding, setAdding] = useState(false);
  if (!isAuthenticated) return null;

  return (
    <View className={button ? 'gap-3' : 'gap-1.5'}>
      {button && notes?.length === 0 ? (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          No Shed Notes yet. They&apos;re longer notes, with links, notation and search.
        </Text>
      ) : null}
      {notes?.map((n) => (
        <Pressable
          key={n.noteId}
          onPress={() => open(n.noteId)}
          android_ripple={{ color: colors['surface-hover'] }}
          className="flex-row items-start gap-2.5 overflow-hidden rounded-lg px-3 py-2"
          style={{ backgroundColor: derived.fill }}
        >
          <View className="pt-0.5">
            <NoteDocIcon color={colors.muted} size={16} />
          </View>
          <View className="flex-1">
            <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              {n.title}
            </Text>
            <Text numberOfLines={compact ? 1 : 2} className="font-ui text-xs" style={{ color: colors.muted }}>
              {n.snippet || 'Empty note'}
            </Text>
          </View>
        </Pressable>
      ))}
      {button ? (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          android_ripple={{ color: colors['surface-hover'] }}
          className="flex-row items-center justify-center gap-1.5 overflow-hidden rounded-xl py-2.5"
          style={{ backgroundColor: colors.background }}
        >
          <PlusIcon color={colors.foreground} size={16} />
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {addLabel}
          </Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => setAdding(true)} accessibilityRole="button" hitSlop={6} className="flex-row items-center gap-1 self-start py-1">
          <PlusIcon color={colors.muted} size={16} />
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
            {addLabel}
          </Text>
        </Pressable>
      )}
      <AddNotesSheet
        visible={adding}
        targetKey={key}
        label={label}
        newTitle={newTitle}
        attachedIds={new Set(notes?.map((n) => n.noteId) ?? [])}
        onClose={() => setAdding(false)}
        onMade={(id) => open(id, { edit: true })}
      />
    </View>
  );
}

/** "Add notes": a new note attached here (opened to write in), or one of yours to attach. */
function AddNotesSheet({
  visible,
  targetKey: key,
  label,
  newTitle,
  attachedIds,
  onClose,
  onMade,
}: {
  visible: boolean;
  targetKey: string;
  label: string;
  newTitle: string;
  attachedIds: Set<string>;
  onClose: () => void;
  onMade: (id: string) => void;
}) {
  const { colors, derived } = useAppTheme();
  // Only while the sheet is open (a day can show several routines, each with this sheet).
  const all = useQuery(api.shedNotes.list, visible ? {} : 'skip');
  const create = useMutation(api.shedNotes.create);
  const attach = useMutation(api.shedNotes.attachNote);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setQ('');
      setError(null);
    }
  }

  const query = q.trim().toLowerCase();
  const choices = (all ?? [])
    .filter((n) => !attachedIds.has(n.id) && (!query || n.title.toLowerCase().includes(query) || n.folder.toLowerCase().includes(query)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40);

  async function makeNew() {
    try {
      const made = await create({ title: q.trim() || newTitle, attach: { target: key, label } });
      onClose();
      onMade(made.id);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function pick(id: string) {
    try {
      await attach({ noteId: id as Id<'shedNotes'>, target: key, label });
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <ToolSheet visible={visible} onClose={onClose} title="Add notes">
      <Pressable
        onPress={() => void makeNew()}
        accessibilityRole="button"
        android_ripple={{ color: colors['accent-hover'] }}
        className="h-12 flex-row items-center gap-2 overflow-hidden rounded-lg px-4"
        style={{ backgroundColor: colors.accent }}
      >
        <NotePlusIcon color={colors['accent-foreground']} size={20} />
        <Text numberOfLines={1} className="font-ui-semibold flex-1 text-[15px] font-semibold" style={{ color: colors['accent-foreground'] }}>
          New note{q.trim() ? `: ${q.trim()}` : ''}
        </Text>
      </Pressable>
      <SearchField value={q} onChangeText={setQ} placeholder="Find a note you have" />
      {error ? (
        <Text className="font-ui text-sm" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <View className="gap-1.5">
        {all === undefined ? (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            Loading…
          </Text>
        ) : choices.length === 0 ? (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            {all.length ? 'No other notes match.' : "You don't have any notes yet."}
          </Text>
        ) : (
          choices.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => void pick(n.id)}
              android_ripple={{ color: colors['surface-hover'] }}
              className="min-h-[48px] flex-row items-center gap-2.5 overflow-hidden rounded-lg px-3 py-2"
              style={{ backgroundColor: derived.fill }}
            >
              <NoteDocIcon color={colors.muted} size={18} />
              <View className="flex-1">
                <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                  {n.title}
                </Text>
                {n.folder ? (
                  <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                    {n.folder}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ToolSheet>
  );
}

/** A tune's Shed Notes section (the website's tune page panel): signed in only. */
export function TuneShedNotes({ tuneId, name }: { tuneId: string; name: string }) {
  const { colors } = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  if (!isAuthenticated) return null;
  const label = name || 'Untitled tune';
  return (
    <View className="gap-2">
      <Text className="font-ui-bold px-1 text-lg font-bold" style={{ color: colors.foreground }}>
        Shed Notes
      </Text>
      <View className="rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
        <AttachedNotes target={{ kind: 'tune', tuneId }} label={label} newTitle={label} button />
      </View>
    </View>
  );
}
