import { DEFAULT_TIME_SIGNATURE, makeId, type Key, type Tempo, type Tune } from '@jam-practice/core/types';
import { mainChartId, removeChartFromTune, replaceMainChart } from '@jam-practice/core/tuneLibrary';
import { useRouter } from 'expo-router';
import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  ChordChartIcon,
  CloseIcon,
  LinkIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  type IconProps,
} from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import { StandardsPicker } from '@/components/StandardsPicker';
import { useChordChartsLibrary, type LibrarySongMeta } from '@/lib/useChordChartsLibrary';
import { sheetEdge } from '@/components/sheetStyle';
import { useAppTheme } from '@/theme/ThemeProvider';

function blankTune(name = ''): Tune {
  return { id: makeId(), name, tempos: [], keys: [], timeSignature: DEFAULT_TIME_SIGNATURE, notes: '' };
}

function summary(tune: Tune): string {
  const keys = tune.keys.filter((k) => k.enabled).map((k) => k.value);
  const tempos = tune.tempos.filter((t) => t.enabled).map((t) => t.value);
  return [
    keys.length ? keys.join(', ') : 'no keys',
    tempos.length ? `${tempos.join(', ')} BPM` : 'no tempos',
    tune.timeSignature,
  ].join(' · ');
}

function parseTempos(raw: string): Tempo[] {
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((value) => ({ id: makeId(), value, enabled: true }));
}

function parseKeys(raw: string): Key[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => ({ id: makeId(), value, enabled: true }));
}

function temposToText(tempos: Tempo[]): string {
  return tempos.map((t) => t.value).join(', ');
}

function keysToText(keys: Key[]): string {
  return keys.map((k) => k.value).join(', ');
}

type Editing = { tune: Tune; isNew: boolean };

/**
 * The native sibling of `apps/web/components/TuneListManager.tsx` — shared by the account page's
 * own Tunes and Tunes to Learn tabs, same reasoning: one UI, two mounts, so the lists stay visually
 * identical rather than drifting apart. `allowStandards` (both tabs pass `true`, matching web's own
 * choice to offer the standards picker on both) opens the same full-screen `StandardsPicker` Jam
 * Practice's own tune list uses, passing this component's own `tunes`/`setTunes` through so a
 * picked standard (or a created custom tune) lands in whichever list is actually being managed.
 * **Still deliberately scoped down from the web version in one way**: no CSV import/export, no
 * multi-select/bulk-delete — both exist on web mainly to support each other (select some, export
 * just those), and without CSV (a desktop-shaped feature; there's no obvious native-share-sheet
 * equivalent attempted here yet), bulk selection had little left to do, so it's cut too rather than
 * kept half-functional.
 *
 * A tune edited here is the *same* `Tune` shape (multiple possibly-enabled tempos/keys) web's own
 * editor produces — `TempoPicker`/`KeyPicker`'s own per-entry enable/disable chip UI is simplified
 * to one comma-separated text field each (`parseTempos`/`parseKeys`, always-enabled on save), so
 * existing multi-tempo/multi-key data from web still round-trips, just through a plainer input.
 */
export function TuneListManager({
  title,
  icon: Icon,
  tunes,
  setTunes,
  searchPlaceholder,
  emptyMessage,
  infoBlurb,
  allowStandards,
  countOnly,
}: {
  title: string;
  icon: ComponentType<IconProps>;
  tunes: Tune[];
  setTunes: (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;
  searchPlaceholder: string;
  emptyMessage: string;
  infoBlurb?: string;
  /** Opens the shared jazz-standards picker from `+` instead of jumping straight to a blank
      editor — see this file's own doc comment. */
  allowStandards?: boolean;
  /** On a page whose header already names the list ("Tunes"), show just the count ("10 tunes")
      instead of repeating the title. */
  countOnly?: boolean;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Tune | null>(null);
  const [showStandards, setShowStandards] = useState(false);

  const trimmedQuery = query.trim();
  const shown = useMemo(() => {
    const words = trimmedQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return tunes;
    return tunes.filter((t) => {
      const haystack = `${t.name} ${summary(t)}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [tunes, trimmedQuery]);

  function saveTune(tune: Tune) {
    setTunes((prev) =>
      prev.some((t) => t.id === tune.id) ? prev.map((t) => (t.id === tune.id ? tune : t)) : [...prev, tune],
    );
    setEditing(null);
  }

  function confirmDelete() {
    if (!deleting) return;
    setTunes((prev) => prev.filter((t) => t.id !== deleting.id));
    setDeleting(null);
  }

  return (
    <View className="gap-4 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <Icon color={colors.muted} size={18} />
          <Text className="text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
            {countOnly
              ? `${tunes.length} tune${tunes.length === 1 ? '' : 's'}`
              : `${title}${tunes.length ? ` (${tunes.length})` : ''}`}
          </Text>
          {infoBlurb ? <InfoButton title={title} text={infoBlurb} size={16} /> : null}
        </View>
        <Pressable
          onPress={() => (allowStandards ? setShowStandards(true) : setEditing({ tune: blankTune(), isNew: true }))}
          accessibilityLabel="New tune"
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.accent }}
        >
          <PlusIcon color={colors['accent-foreground']} size={16} />
        </Pressable>
      </View>


      <View
        className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
        style={{ backgroundColor: colors.background }}
      >
        <SearchIcon color={colors.muted} size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.muted}
          className="min-w-0 flex-1 text-sm font-ui"
          style={{ color: colors.foreground }}
        />
      </View>

      {tunes.length === 0 ? (
        <Text className="text-sm font-ui" style={{ color: colors.muted }}>
          {emptyMessage}
        </Text>
      ) : shown.length === 0 ? (
        <Text className="text-sm font-ui" style={{ color: colors.muted }}>
          No tunes match &ldquo;{trimmedQuery}&rdquo;.
        </Text>
      ) : (
        <View className="gap-1.5" style={{ maxHeight: 420 }}>
          <ScrollView>
            {shown.map((tune) => (
              <Pressable
                key={tune.id}
                onPress={() => setEditing({ tune, isNew: false })}
                className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text numberOfLines={1} className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                    {tune.name}
                  </Text>
                  <Text numberOfLines={1} className="text-xs font-ui" style={{ color: colors.muted }}>
                    {summary(tune)}
                  </Text>
                  {tune.chordChartId ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push({ pathname: '/tool/chord-charts-view', params: { id: tune.chordChartId! } });
                      }}
                      className="mt-0.5 flex-row items-center gap-1 self-start"
                    >
                      <LinkIcon color={colors.accent} size={11} />
                      <Text className="text-xs font-ui-semibold" style={{ color: colors.accent }}>
                        Linked chart
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => setDeleting(tune)}
                  accessibilityLabel={`Delete ${tune.name}`}
                  className="h-8 w-8 items-center justify-center rounded-lg"
                >
                  <TrashIcon color={colors.muted} size={16} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ConfirmDialog
        visible={deleting !== null}
        title={`Delete "${deleting?.name ?? ''}"?`}
        message="This tune will be removed from this list. This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      {editing ? (
        <TuneEditorModal
          key={editing.tune.id}
          initial={editing.tune}
          isNew={editing.isNew}
          onSave={saveTune}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {showStandards ? (
        <StandardsPicker
          tunes={tunes}
          setTunes={setTunes}
          onClose={() => setShowStandards(false)}
          onCreateCustom={(name) => {
            setShowStandards(false);
            setEditing({ tune: blankTune(name), isNew: true });
          }}
        />
      ) : null}
    </View>
  );
}

function TuneEditorModal({
  initial,
  isNew,
  onSave,
  onClose,
}: {
  initial: Tune;
  isNew: boolean;
  onSave: (tune: Tune) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { allSongs: allCharts } = useChordChartsLibrary(null);
  const [name, setName] = useState(initial.name);
  const [timeSignature, setTimeSignature] = useState(initial.timeSignature);
  const [temposText, setTemposText] = useState(temposToText(initial.tempos));
  const [keysText, setKeysText] = useState(keysToText(initial.keys));
  const [notes, setNotes] = useState(initial.notes);
  const [chordChartId, setChordChartId] = useState(initial.chordChartId);
  const [showChartPicker, setShowChartPicker] = useState(false);

  const linkedSong = useMemo(() => {
    if (!chordChartId) return null;
    return allCharts.find((s) => s.id === chordChartId) ?? null;
  }, [chordChartId, allCharts]);

  function save() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    // Built on the tune as it was, so what this form doesn't show (tags, other charts) is kept.
    const base: Tune = {
      ...initial,
      name: trimmedName,
      timeSignature: timeSignature.trim() || DEFAULT_TIME_SIGNATURE,
      tempos: parseTempos(temposText),
      keys: parseKeys(keysText),
      notes,
    };
    const main = mainChartId(base);
    onSave(chordChartId ? replaceMainChart(base, chordChartId) : main ? removeChartFromTune(base, main) : base);
  }

  const inputStyle = { backgroundColor: colors.background, color: colors.foreground };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          className="gap-4 rounded-t-3xl p-5"
          style={{ ...sheetEdge(colors), backgroundColor: colors.surface, maxHeight: '85%' }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
              {isNew ? 'New tune' : 'Edit tune'}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.background }}
            >
              <CloseIcon color={colors.muted} size={16} />
            </Pressable>
          </View>

          <ScrollView className="gap-4">
            <View className="gap-3">
              <Field label="Name">
                <TextInput
                  autoFocus
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Autumn Leaves"
                  placeholderTextColor={colors.muted}
                  className="rounded-xl px-3 py-2.5 text-base font-ui"
                  style={inputStyle}
                />
              </Field>
              <Field label="Time signature">
                <TextInput
                  value={timeSignature}
                  onChangeText={setTimeSignature}
                  placeholder="4/4"
                  placeholderTextColor={colors.muted}
                  className="rounded-xl px-3 py-2.5 text-base font-ui"
                  style={inputStyle}
                />
              </Field>
              <Field label="Tempos (BPM, comma-separated)">
                <TextInput
                  value={temposText}
                  onChangeText={setTemposText}
                  placeholder="e.g. 120, 160"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  className="rounded-xl px-3 py-2.5 text-base font-ui"
                  style={inputStyle}
                />
              </Field>
              <Field label="Keys (comma-separated)">
                <TextInput
                  value={keysText}
                  onChangeText={setKeysText}
                  placeholder="e.g. Bb, Eb"
                  placeholderTextColor={colors.muted}
                  className="rounded-xl px-3 py-2.5 text-base font-ui"
                  style={inputStyle}
                />
              </Field>
              <Field label="Notes">
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. watch the bridge modulation"
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  className="rounded-xl px-3 py-2.5 text-base font-ui"
                  style={[inputStyle, { minHeight: 72, textAlignVertical: 'top' }]}
                />
              </Field>
              <Field label="Linked chord chart">
                <Pressable
                  onPress={() => setShowChartPicker(true)}
                  className="flex-row items-center gap-2 rounded-xl px-3 py-2.5"
                  style={inputStyle}
                >
                  <ChordChartIcon color={linkedSong ? colors.accent : colors.muted} size={16} />
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-ui" style={{ color: linkedSong ? colors.foreground : colors.muted }}>
                    {linkedSong ? linkedSong.title : 'None'}
                  </Text>
                  {chordChartId ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        setChordChartId(undefined);
                      }}
                      accessibilityLabel="Remove linked chart"
                      className="h-7 w-7 items-center justify-center rounded-full"
                    >
                      <CloseIcon color={colors.muted} size={14} />
                    </Pressable>
                  ) : null}
                </Pressable>
              </Field>
            </View>
          </ScrollView>

          {showChartPicker ? (
            <ChordChartPickerModal
              songs={allCharts}
              onPick={(song) => {
                setChordChartId(song.id);
                setShowChartPicker(false);
              }}
              onClose={() => setShowChartPicker(false)}
            />
          ) : null}

          <View className="flex-row gap-2">
            <Pressable
              onPress={save}
              disabled={!name.trim()}
              className="flex-1 items-center rounded-xl py-3"
              style={{ backgroundColor: colors.accent, opacity: name.trim() ? 1 : 0.5 }}
            >
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors['accent-foreground'] }}>
                {isNew ? 'Add tune' : 'Save changes'}
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="items-center rounded-xl px-5 py-3"
              style={{ backgroundColor: colors.background }}
            >
              <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * A flat, searchable "pick one of my own chord charts" list, grouped by playlist name as a small
 * caption above each run of songs — reached from `TuneEditorModal`'s "Linked chord chart" field.
 * Only ever offers songs from the *signed-in* library: a tune's `chordChartId` only ever resolves
 * server-side against the owner's own `chordChartSongs` rows (`packages/convex/lib/chordCharts.ts`'s
 * `resolveLinkedChart`), so linking to a signed-out/local-only song (whose id never reaches Convex
 * at all) would silently never resolve for anyone, including yourself once signed in elsewhere —
 * `chartPlaylists` is empty while signed out, so this picker reads as "no charts yet" rather than
 * a confusing dead-end link in that case.
 */
function ChordChartPickerModal({
  songs,
  onPick,
  onClose,
}: {
  songs: LibrarySongMeta[];
  onPick: (song: LibrarySongMeta) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim().toLowerCase();

  const rows = useMemo(() => {
    const result: { playlistName: string; song: LibrarySongMeta }[] = [];
    for (const song of songs) {
      if (trimmedQuery && !`${song.title} ${song.composer}`.toLowerCase().includes(trimmedQuery)) continue;
      result.push({ playlistName: song.playlistNames, song });
    }
    return result;
  }, [songs, trimmedQuery]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-4 pt-14">
          <Text className="text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
            Link a chord chart
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close"
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surface }}
          >
            <CloseIcon color={colors.muted} size={16} />
          </Pressable>
        </View>
        <View className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 mx-4 mt-3" style={{ backgroundColor: colors.surface }}>
          <SearchIcon color={colors.muted} size={16} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your chord charts"
            placeholderTextColor={colors.muted}
            autoFocus
            className="min-w-0 flex-1 text-sm font-ui"
            style={{ color: colors.foreground }}
          />
        </View>
        {rows.length === 0 ? (
          <View className="flex-1 items-center justify-center p-8">
            <Text className="text-center text-sm font-ui" style={{ color: colors.muted }}>
              {songs.length === 0
                ? "You don't have any chord charts yet — add some from the Chord Charts tool first."
                : `No charts match "${trimmedQuery}".`}
            </Text>
          </View>
        ) : (
          <ScrollView className="mt-2 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
            {rows.map(({ playlistName, song }) => (
              <Pressable
                key={song.id}
                onPress={() => onPick(song)}
                className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
              >
                <ChordChartIcon color={colors.muted} size={16} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} className="text-xs font-ui" style={{ color: colors.muted }}>
                    {song.composer ? `${song.composer} · ` : ''}
                    {playlistName}
                  </Text>
                </View>
                <LinkIcon color={colors.muted} size={14} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
