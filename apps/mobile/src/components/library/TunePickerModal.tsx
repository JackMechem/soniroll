import { nameId, searchStandards, standardToTune, type Standard } from '@jam-practice/core/standards';
import { sortByText } from '@jam-practice/core/sortText';
import { DEFAULT_TIME_SIGNATURE, makeId, type Tune } from '@jam-practice/core/types';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchField } from '@/components/ChordChartList';
import { CheckIcon, CloseIcon, PlusIcon } from '@/components/icons';
import { NameDialog } from '@/components/NameDialog';
import { TUNE_LIST_LABEL, tuneSummary, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

const ROW_H = 60;
const HEADER_H = 44;

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'tune'; key: string; tune: Tune; list: TuneListId }
  | { kind: 'standard'; key: string; standard: Standard }
  | { kind: 'create'; key: string; name: string }
  | { kind: 'new'; key: string; name: string };

/**
 * Pick several tunes at once — adding tunes to a setlist (or a Community post). Two sections: your
 * tunes (Tunes I Know and Tunes to Learn), then the jazz standards you don't have yet. The top row
 * creates a tune of your own: "Create “…”" for whatever's typed (when nothing has that exact name),
 * or "Create a new tune" (asks for a name) with an empty search; it's ticked like any other row and
 * made in Tunes I Know on Add. Tunes already
 * in it (`exclude`) aren't offered again. Picking a standard adds it to Tunes I Know on Add (same
 * as "Save as my setlist" does for tunes you don't have), so the setlist can point at it. Full
 * screen with its own search; the Add button sits in the header so the keyboard never covers it.
 */
export function TunePickerModal({
  visible,
  exclude,
  onAdd,
  onClose,
}: {
  visible: boolean;
  exclude: string[];
  onAdd: (tuneIds: string[]) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { lists } = useTuneLists();
  const addToKnown = lists.tunes.setTunes;
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [newNames, setNewNames] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setQuery('');
      setPicked([]);
      setNewNames([]);
    }
  }

  const { rows, offsets } = useMemo(() => {
    const skip = new Set(exclude);
    const mine: { tune: Tune; list: TuneListId }[] = [];
    const have = new Set<string>();
    for (const list of ['tunes', 'learn'] as TuneListId[])
      for (const tune of lists[list].tunes) {
        have.add(nameId(tune.name));
        if (!skip.has(tune.id)) mine.push({ tune, list });
      }
    const q = query.trim().toLowerCase();
    const myRows = sortByText(q ? mine.filter((r) => r.tune.name.toLowerCase().includes(q)) : mine, (r) => r.tune.name);
    const standards = searchStandards(query).filter((s) => !have.has(nameId(s.name)));

    const out: Row[] = [];
    const typed = query.trim();
    const taken = typed && (have.has(nameId(typed)) || standards.some((st) => nameId(st.name) === nameId(typed)) || newNames.some((n) => nameId(n) === nameId(typed)));
    if (!taken) out.push({ kind: 'create', key: 'create', name: typed });
    if (newNames.length) {
      out.push({ kind: 'header', key: 'h-new', label: 'New tunes' });
      for (const name of newNames) out.push({ kind: 'new', key: `new:${name}`, name });
    }
    if (myRows.length) {
      out.push({ kind: 'header', key: 'h-mine', label: 'Your tunes' });
      for (const r of myRows) out.push({ kind: 'tune', key: r.tune.id, ...r });
    }
    if (standards.length) {
      out.push({ kind: 'header', key: 'h-standards', label: 'Jazz standards' });
      for (const standard of standards) out.push({ kind: 'standard', key: `s:${standard.name}`, standard });
    }
    const offs: number[] = [];
    let y = 0;
    for (const r of out) {
      offs.push(y);
      y += r.kind === 'header' ? HEADER_H : ROW_H;
    }
    return { rows: out, offsets: offs };
  }, [lists, exclude, query, newNames]);

  function add() {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const ids: string[] = [];
    const created: Tune[] = [];
    for (const key of picked) {
      const row = byKey.get(key);
      if (!row || row.kind === 'header' || row.kind === 'create') continue;
      if (row.kind === 'tune') ids.push(row.tune.id);
      else if (row.kind === 'new') {
        const tune: Tune = { id: makeId(), name: row.name, tempos: [], keys: [], timeSignature: DEFAULT_TIME_SIGNATURE, notes: '' };
        created.push(tune);
        ids.push(tune.id);
      } else {
        const tune = standardToTune(row.standard);
        created.push(tune);
        ids.push(tune.id);
      }
    }
    if (created.length) addToKnown((prev) => [...prev, ...created]);
    onAdd(ids);
    onClose();
  }

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  /** A new tune of your own: listed (ticked) under "New tunes" until Add makes it. */
  function createTune(raw: string) {
    const name = raw.trim();
    if (!name) return;
    if (!newNames.some((n) => nameId(n) === nameId(name))) setNewNames((prev) => [...prev, name]);
    const key = `new:${name}`;
    setPicked((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setQuery('');
  }

  function untickNew(name: string) {
    setNewNames((prev) => prev.filter((n) => n !== name));
    setPicked((prev) => prev.filter((k) => k !== `new:${name}`));
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center gap-2 px-4 pb-2 pt-3">
          <Pressable onPress={onClose} accessibilityLabel="Close" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
            <CloseIcon color={colors.foreground} size={20} />
          </Pressable>
          <Text className="font-ui-bold flex-1 text-xl font-bold" style={{ color: colors.foreground }}>
            Add tunes
          </Text>
          <Pressable
            onPress={add}
            disabled={picked.length === 0}
            className="rounded-full px-5 py-2"
            style={{ backgroundColor: colors.accent, opacity: picked.length ? 1 : 0.4 }}
          >
            <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
              {picked.length ? `Add ${picked.length}` : 'Add'}
            </Text>
          </Pressable>
        </View>
        <View className="px-4 pb-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search your tunes and standards…" />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          getItemLayout={(_, index) => ({ length: rows[index]?.kind === 'header' ? HEADER_H : ROW_H, offset: offsets[index] ?? 0, index })}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListEmptyComponent={
            <Text className="font-ui py-8 text-center text-sm" style={{ color: colors.muted }}>
              {query.trim() ? `No tunes match “${query}”.` : 'Everything is already in here.'}
            </Text>
          }
          renderItem={({ item }) => {
            if (item.kind === 'header')
              return (
                <View style={{ height: HEADER_H }} className="justify-end px-1 pb-1.5">
                  <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
                    {item.label}
                  </Text>
                </View>
              );
            if (item.kind === 'create')
              return (
                <Pressable
                  onPress={() => (item.name ? createTune(item.name) : setNaming(true))}
                  android_ripple={{ color: colors['surface-hover'] }}
                  className="flex-row items-center gap-3 rounded-xl px-3"
                  style={{ height: ROW_H }}
                >
                  <View className="h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: colors.surface }}>
                    <PlusIcon color={colors.accent} size={16} />
                  </View>
                  <View className="flex-1">
                    <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.accent }}>
                      {item.name ? `Create “${item.name}”` : 'Create a new tune'}
                    </Text>
                    <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
                      A tune of your own, added to Tunes I Know
                    </Text>
                  </View>
                </Pressable>
              );
            const on = picked.includes(item.key);
            const title = item.kind === 'tune' ? item.tune.name : item.kind === 'new' ? item.name : item.standard.name;
            const subtitle =
              item.kind === 'tune'
                ? [TUNE_LIST_LABEL[item.list], tuneSummary(item.tune)].filter(Boolean).join(' · ')
                : item.kind === 'new'
                  ? 'New tune · added to Tunes I Know'
                  : [item.standard.composer, item.standard.key, `${item.standard.bpm} BPM`, item.standard.timeSignature].filter(Boolean).join(' · ');
            return (
              <Pressable
                onPress={() => (item.kind === 'new' ? untickNew(item.name) : toggle(item.key))}
                android_ripple={{ color: colors['surface-hover'] }}
                className="flex-row items-center gap-3 rounded-xl px-3"
                style={{ height: ROW_H }}
              >
                <View
                  className="h-6 w-6 items-center justify-center rounded-md"
                  style={{ backgroundColor: on ? colors.accent : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: colors.muted }}
                >
                  {on ? <CheckIcon color={colors['accent-foreground']} size={16} /> : null}
                </View>
                <View className="flex-1">
                  <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                    {title}
                  </Text>
                  <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
                    {subtitle}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
        <NameDialog
          visible={naming}
          title="New tune"
          placeholder="Tune name"
          confirmLabel="Create"
          onSubmit={createTune}
          onClose={() => setNaming(false)}
        />
      </SafeAreaView>
    </Modal>
  );
}
