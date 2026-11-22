import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { formatLongDate } from '@jam-practice/core/practiceLog';
import { targetKey, type NoteTarget } from '@jam-practice/core/shedNotes';
import { useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CheckIcon, ChevronRightIcon, PlusIcon } from '@/components/icons';
import { PracticeTimerHeaderButton } from '@/components/PracticeTimerWidget';
import { RecordingRow, type RecordingPlayer } from '@/components/recordings/RecordingParts';
import { Muted, Panel } from '@/components/shedLog/parts';
import { useOpenNote } from '@/components/shedNotes/AttachedNotes';
import { NoteDocIcon } from '@/components/shedNotes/icons';
import type { Recording } from '@/lib/recordings';
import { errorText } from '@/lib/useShedNotes';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * The pieces the routine and task screens are built from, so both read as one thing (the
 * website's `components/practicelog/pageParts.tsx` for a phone): the title with its one line of
 * facts in the header, sections with the Shed Log's one heading style (`Section`), content on the
 * card fill (`Panel`), quiet empty states, the note as a preview to open, recordings one per row,
 * and history rows.
 */

/** The screen's header: the title, one line of facts under it, and its quiet buttons (Edit, Share)
    after the running Practice Timer's pill. */
export function PageHeader({ title, facts, actions, routeName }: { title: string; facts?: string; actions?: ReactNode; routeName: string }) {
  const { colors } = useAppTheme();
  return (
    <Stack.Screen
      options={{
        title,
        headerTitle: () => (
          <View style={{ flexShrink: 1 }}>
            <Text numberOfLines={1} className="font-ui-bold text-lg font-bold tracking-tight" style={{ color: colors.foreground }}>
              {title}
            </Text>
            {facts ? (
              <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                {facts}
              </Text>
            ) : null}
          </View>
        ),
        headerRight: () => (
          <View className="flex-row items-center gap-2">
            <PracticeTimerHeaderButton routeName={routeName} />
            {actions}
          </View>
        ),
      }}
    />
  );
}

/** Nothing here yet: one quiet line, on the same fill as content. */
export function Quiet({ children }: { children: ReactNode }) {
  return (
    <Panel>
      <Muted>{children}</Muted>
    </Panel>
  );
}

/** A screen's recordings, newest first, one under the other (the player needs the width). */
export function RecordingList({
  recordings,
  player,
  empty,
  hidePlace,
  placeWithin,
  onOpen,
}: {
  recordings: Recording[];
  player: RecordingPlayer;
  empty?: string;
  hidePlace?: boolean;
  placeWithin?: string;
  onOpen: (id: string) => void;
}) {
  if (recordings.length === 0) return empty ? <Quiet>{empty}</Quiet> : null;
  return (
    <View className="gap-2">
      {[...recordings]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => (
          <RecordingRow key={r._id} recording={r} player={player} hidePlace={hidePlace} placeWithin={placeWithin} onOpen={() => onOpen(r._id)} />
        ))}
    </View>
  );
}

/** The text a note starts with, for its preview: headings, players and blank lines skipped. */
function previewOf(body: string): string {
  return body
    .split('\n')
    .filter((l) => l.trim() && !/^#{1,6}\s/.test(l) && !/^!\[[^\]\n]*\]\([^)]*\)\s*$/.test(l.trim()))
    .map((l) =>
      l
        .replace(/^\s*([-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)/, '')
        .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_m, t: string, _a, alias: string | undefined) => alias ?? t)
        .replace(/[*_`~]/g, ''),
    )
    .join(' ')
    .slice(0, 320);
}

/**
 * A screen's note as a preview to open (the website's `NotePreview`): the start of what's written
 * in it (the first lines, not its headings or players), how many recordings are in it, and Open.
 * With no note yet, "Start notes" makes one.
 */
function NotePreview({ noteId, onOpen, onStart, starting }: { noteId: string | null; onOpen: () => void; onStart: () => void; starting: boolean }) {
  const { colors } = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const note = useQuery(api.shedNotes.get, isAuthenticated && noteId ? { id: noteId } : 'skip');
  if (!noteId) {
    return (
      <Pressable
        onPress={onStart}
        disabled={starting}
        accessibilityRole="button"
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-row items-center gap-3 overflow-hidden rounded-xl p-4"
        style={{ backgroundColor: colors.surface, opacity: starting ? 0.6 : 1 }}
      >
        <View className="h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: withAlpha(colors.accent, 0.12) }}>
          <PlusIcon color={colors.accent} size={18} />
        </View>
        <View className="flex-1">
          <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
            Start notes
          </Text>
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            What you&apos;re working on, what went well, what to try next. Recordings go in too.
          </Text>
        </View>
      </Pressable>
    );
  }
  const text = note ? previewOf(note.body) : '';
  const takes = note ? (note.body.match(/\(file:recording\//g) ?? []).length : 0;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${note?.title ?? 'the note'}`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="gap-2.5 overflow-hidden rounded-xl p-4"
      style={{ backgroundColor: colors.surface }}
    >
      <Text numberOfLines={4} className="font-ui text-sm leading-5" style={{ color: text ? colors.foreground : colors.muted, minHeight: 20 }}>
        {note === undefined ? ' ' : text || 'Nothing written yet. Open the note to write.'}
      </Text>
      <View className="flex-row items-center gap-1.5">
        <NoteDocIcon color={colors.muted} size={14} />
        <Text numberOfLines={1} className="font-ui shrink text-xs" style={{ color: colors.muted }}>
          {note?.title ?? 'Note'}
          {takes > 0 ? ` · ${takes} recording${takes === 1 ? '' : 's'}` : ''}
        </Text>
        <View className="flex-1" />
        <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
          Open
        </Text>
        <ChevronRightIcon color={colors.muted} size={14} />
      </View>
    </Pressable>
  );
}

/**
 * A routine's or task's notes on its screen (the website's `PageNotes`): the notes attached to it
 * (Shed Notes, so they're in Shed Notes too, with links and backlinks): the main one as a preview,
 * any others as rows. They open in Shed Notes' note screen (Back comes here). With none yet,
 * "Start notes" makes one (`start`) and opens it to write in.
 */
export function PageNotes({ target, start }: { target: NoteTarget; start: () => Promise<{ id: string }> }) {
  const { colors } = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const key = targetKey(target);
  const rows = useQuery(api.shedNotes.attachedTo, isAuthenticated ? { prefix: key } : 'skip');
  const notes = rows?.filter((r) => r.target === key);
  const open = useOpenNote();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const made = await start();
      open(made.id, { edit: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (notes === undefined) return <View className="h-20 rounded-xl" style={{ backgroundColor: colors.surface }} />;
  const main = notes[0];
  const others = notes.slice(1);
  return (
    <View className="gap-2">
      <NotePreview noteId={main?.noteId ?? null} onOpen={() => main && open(main.noteId)} onStart={() => void begin()} starting={busy} />
      {error ? (
        <Text className="font-ui px-1 text-sm" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      {/* Other notes attached to it (from Shed Notes). */}
      {others.length > 0 ? (
        <Rows>
          {others.map((n, i) => (
            <Row key={n.noteId} first={i === 0} onPress={() => open(n.noteId)} label={`Open ${n.title}`}>
              <NoteDocIcon color={colors.muted} size={16} />
              <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
                {n.title}
              </Text>
              <ChevronRightIcon color={colors.muted} size={16} />
            </Row>
          ))}
        </Rows>
      ) : null}
    </View>
  );
}

/** Rows on the card fill, split by hairlines. */
export function Rows({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
      {children}
    </View>
  );
}

export function Row({ first, onPress, label, children }: { first: boolean; onPress: () => void; label?: string; children: ReactNode }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[48px] flex-row items-center gap-3 px-4 py-2.5"
      style={{ borderTopWidth: first ? 0 : 1, borderTopColor: derived.hairline }}
    >
      {children}
    </Pressable>
  );
}

/** One day in a History list: a round mark (filled in the routine's colour when it was done),
    the date (and an optional line under it), and what was done on the right. Opens the day. */
export function HistoryRow({ first, date, done, color, right, note, onPress }: { first: boolean; date: string; done: boolean; color: string; right: string; note?: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Row first={first} onPress={onPress} label={`${formatLongDate(date)}: ${right}`}>
      <View
        className="h-[18px] w-[18px] items-center justify-center rounded-full"
        style={{ backgroundColor: done ? color : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: withAlpha(colors.foreground, 0.25) }}
      >
        {done ? <CheckIcon color="#ffffff" size={12} /> : null}
      </View>
      <View className="flex-1">
        <Text className="font-ui text-sm" style={{ color: colors.foreground }}>
          {formatLongDate(date)}
        </Text>
        {note ? (
          <Text numberOfLines={2} className="font-ui text-xs" style={{ color: colors.muted }}>
            {note}
          </Text>
        ) : null}
      </View>
      <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
        {right}
      </Text>
    </Row>
  );
}
