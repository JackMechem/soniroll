import { DEFAULT_TIME_SIGNATURE, makeId, type Tempo, type Tune } from '@jam-practice/core/types';
import { useConvexAuth } from '@convex-dev/auth/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useChordChartBrowser } from '@/components/ChordChartList';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { ChordChartIcon, CloseIcon, LinkIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import { forgetRecentTune } from '@/lib/chordChartRecents';
import { ChartPickerModal } from '@/components/library/ChartPickerModal';
import { TimeSignaturePicker } from '@/components/library/TimeSignaturePicker';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { asTuneListId, TUNE_LIST_LABEL, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

function parseTempos(raw: string, previous: Tempo[]): Tempo[] {
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    // Keep an existing tempo's id/enabled state when it's still there, so editing here doesn't
    // silently re-enable a tempo that was switched off elsewhere (Jam Practice on web).
    .map((value) => previous.find((t) => t.value === value) ?? { id: makeId(), value, enabled: true });
}

/**
 * Editing a tune's details, as a full page (keys are marked on the tune's hub page instead) (not a bottom sheet — the keyboard comes up from the bottom, so the
 * fields sit at the top of a page instead): name, time signature, tempos, which list
 * it's in, and its linked chord chart — open it, edit it, change or unlink it, or link / create
 * one. Reached from the Library (`app/library/*`). `id` edits an existing tune; without it this is
 * a new tune (optionally pre-named via `name`), added to `list` on Save.
 */
function TuneEditScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const params = useLocalSearchParams<{ list?: string; id?: string; name?: string }>();
  const startList = asTuneListId(params.list);
  const { lists, ready } = useTuneLists();
  const { songIndex } = useChordChartBrowser();

  const existing = params.id ? lists[startList].tunes.find((t) => t.id === params.id) : undefined;

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [list, setList] = useState<TuneListId>(startList);
  const [name, setName] = useState(params.name ?? '');
  const [timeSignature, setTimeSignature] = useState(DEFAULT_TIME_SIGNATURE);
  const [temposText, setTemposText] = useState('');
  const [chordChartId, setChordChartId] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form from the tune once the lists have loaded (render-time, so no blank flash).
  if (existing && loadedFor !== existing.id) {
    setLoadedFor(existing.id);
    setName(existing.name);
    setTimeSignature(existing.timeSignature || DEFAULT_TIME_SIGNATURE);
    setTemposText(existing.tempos.map((t) => t.value).join(', '));
    setChordChartId(existing.chordChartId);
  }

  const linked = useMemo(() => (chordChartId ? songIndex.get(chordChartId) : undefined), [chordChartId, songIndex]);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the tune a name.');
      return;
    }
    const tune: Tune = {
      id: existing?.id ?? makeId(),
      name: trimmed,
      timeSignature: timeSignature.trim() || DEFAULT_TIME_SIGNATURE,
      tempos: parseTempos(temposText, existing?.tempos ?? []),
      keys: existing?.keys ?? [],
      notes: existing?.notes ?? '',
      ...(chordChartId ? { chordChartId } : {}),
    };
    if (existing && list === startList) {
      lists[list].setTunes((prev) => prev.map((t) => (t.id === tune.id ? tune : t)));
    } else {
      if (existing) lists[startList].setTunes((prev) => prev.filter((t) => t.id !== tune.id));
      lists[list].setTunes((prev) => [...prev, tune]);
    }
    router.back();
  }

  if (!ready) return <ScreenSpinner />;
  if (params.id && !existing) {
    return (
      <View className="flex-1 items-center justify-center px-10" style={{ backgroundColor: colors.background }}>
        <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
          That tune isn&apos;t in your library anymore.
        </Text>
      </View>
    );
  }

  const input = { backgroundColor: colors.surface, color: colors.foreground, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 };
  const canUseLearn = isAuthenticated;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: existing ? 'Edit tune' : 'New tune',
          headerRight: () => (
            <Pressable onPress={save} className="rounded-full px-5 py-2" style={{ backgroundColor: colors.accent }}>
              <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                Save
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: bottomSpace }}>
        <Field label="Name">
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Autumn Leaves" placeholderTextColor={colors.muted} autoFocus={!existing && !params.name} className="font-ui text-base" style={input} />
        </Field>
        <Field label="Time signature">
          <TimeSignaturePicker key={loadedFor ?? 'new'} value={timeSignature} onChange={setTimeSignature} />
        </Field>
        <Field label="Tempos (BPM)" info="Separate several with commas, e.g. 120, 160. Jam Practice picks one at random.">
          <TextInput value={temposText} onChangeText={setTemposText} placeholder="120, 160" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" className="font-ui text-base" style={input} />
        </Field>

        <Field label="List">
          <View className="flex-row gap-2">
            {(['tunes', 'learn'] as const).map((id) => {
              const on = list === id;
              const disabled = id === 'learn' && !canUseLearn;
              return (
                <Pressable
                  key={id}
                  onPress={() => setList(id)}
                  disabled={disabled}
                  className="flex-1 items-center rounded-xl py-2.5"
                  style={{ backgroundColor: on ? colors.accent : colors.surface, opacity: disabled ? 0.4 : 1 }}
                >
                  <Text className="font-ui-semibold text-sm font-semibold" style={{ color: on ? colors['accent-foreground'] : colors.foreground }}>
                    {TUNE_LIST_LABEL[id]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Chord chart">
          {chordChartId ? (
            <View className="gap-2 rounded-2xl p-3" style={{ backgroundColor: colors.surface }}>
              <View className="flex-row items-center gap-3">
                <ChordChartIcon color={colors.accent} size={24} />
                <View className="flex-1">
                  <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                    {linked?.song.title ?? 'Linked chart'}
                  </Text>
                  <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
                    {linked ? [linked.song.composer, linked.playlistName].filter(Boolean).join(' · ') : 'Not found in your chord charts'}
                  </Text>
                </View>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {linked ? (
                  <>
                    <ChipButton label="Open" icon={<ChordChartIcon color={colors.foreground} size={16} />} onPress={() => router.push({ pathname: '/tool/chord-charts-view', params: { id: chordChartId } })} />
                    <ChipButton label="Edit chart" icon={<PencilIcon color={colors.foreground} size={16} />} onPress={() => router.push({ pathname: '/tool/chord-charts-editor', params: { songId: chordChartId } })} />
                  </>
                ) : null}
                <ChipButton label="Change" icon={<LinkIcon color={colors.foreground} size={16} />} onPress={() => setPicking(true)} />
                <ChipButton label="Unlink" icon={<CloseIcon color={colors.foreground} size={16} />} onPress={() => setChordChartId(undefined)} />
              </View>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <ChipButton label="Link a chart" icon={<LinkIcon color={colors.foreground} size={16} />} onPress={() => setPicking(true)} grow />
              <ChipButton
                label="Create one"
                icon={<PlusIcon color={colors.foreground} size={16} />}
                onPress={() => router.push({ pathname: '/tool/chord-charts-new', params: { title: name.trim() } })}
                grow
              />
            </View>
          )}
        </Field>

        {error ? (
          <Text className="font-ui text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}

        {existing ? (
          <Pressable onPress={() => setConfirmDelete(true)} className="mt-2 flex-row items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: colors.surface }}>
            <TrashIcon color={colors.danger} size={18} />
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.danger }}>
              Delete tune
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <ChartPickerModal
        visible={picking}
        initialQuery={name.trim()}
        onClose={() => setPicking(false)}
        onPick={(song) => {
          setChordChartId(song.id);
          setPicking(false);
        }}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete "${existing?.name ?? ''}"?`}
        message={`This removes it from ${TUNE_LIST_LABEL[startList]}. Its chord chart (if any) is kept.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (existing) {
            lists[startList].setTunes((prev) => prev.filter((t) => t.id !== existing.id));
            forgetRecentTune(existing.id);
          }
          setConfirmDelete(false);
          router.back();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

function Field({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-1.5">
        <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
          {label}
        </Text>
        {info ? <InfoButton title={label} text={info} size={15} /> : null}
      </View>
      {children}
    </View>
  );
}

function ChipButton({ label, icon, onPress, grow }: { label: string; icon: React.ReactNode; onPress: () => void; grow?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-center gap-1.5 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: grow ? colors.surface : colors.background, flexGrow: grow ? 1 : 0 }}
    >
      {icon}
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default withScreenLoader(TuneEditScreen);
