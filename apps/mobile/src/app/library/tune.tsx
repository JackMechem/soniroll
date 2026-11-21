import { useConvexAuth } from '@convex-dev/auth/react';
import { addChartsToTune, tuneChartIds } from '@jam-practice/core/tuneLibrary';
import { KEY_NAMES, keyPitchClass, transposeSong } from '@jam-practice/core/iRealPro';
import { makeId, type Tune } from '@jam-practice/core/types';
import { useMutation, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useChordChartBrowser } from '@/components/ChordChartList';
import ChordChartView from '@/components/ChordChartView';
import { Dropdown } from '@/components/Dropdown';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { ChordChartIcon, DotsVerticalIcon, LinkIcon, MicrophoneIcon, PencilIcon, PlusIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import { ChartPickerModal } from '@/components/library/ChartPickerModal';
import { TuneFiles } from '@/components/library/TuneFiles';
import { newChartParams, useTuneMenu } from '@/components/library/useTuneMenu';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { RecordingRow, RecordingSelectModal, useRecordingPlayer } from '@/components/recordings/RecordingParts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { TuneShedNotes } from '@/components/shedNotes/AttachedNotes';
import { recordRecentTune } from '@/lib/chordChartRecents';
import { useDeviceUrls } from '@/lib/deviceFiles';
import { recordingsApi } from '@/lib/recordings';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { findTune, TUNE_LIST_LABEL, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { IconButton } from '@/components/ui';
import { isMinorKey, prettyKeyName } from '@/lib/keyNames';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Loose title match for "is there already a chart for this tune": case, punctuation and a
    leading or trailing article are ignored (iReal titles are often "Man I Love, The"). Plain string
    work only — no `.normalize()`, which is a slow native call per string on Android. */
function titleKey(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
    .replace(/ (the|a|an)$/, '');
}

/**
 * A tune's hub — what opens when you tap a tune in the Library: a place for *learning* it rather
 * than a form. Shows its chord chart right on the page (transposable, and tapping a key you know
 * previews it there), a 12-key grid of the keys you know it in (tap to mark / unmark — that's the
 * tune's own key list, the same one Jam Practice picks from), and your notes (tap to write them on
 * their own page, `tune-notes.tsx`, so the keyboard never covers them). The edit icon opens the full form (`tune-edit.tsx`) for name, tempos,
 * time signature and list; ⋮ has the rest of the tune menu.
 */
function TuneHubScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id, list: preferList } = useLocalSearchParams<{ id?: string; list?: string }>();
  const { lists, ready } = useTuneLists();
  // The chart shown, when the tune has several (main first by default).
  const [pickedChart, setPickedChart] = useState<string | null>(null);
  const { openTuneMenu, tuneMenu } = useTuneMenu({ onChartLinked: setPickedChart });

  // Look in every list — moving a tune changes which one it's in.
  const found = findTune(lists, id, preferList);

  // Opening a tune's page puts it in the Library's "Recently opened".
  useEffect(() => {
    if (id) recordRecentTune(id);
  }, [id]);

  // Deleted (or moved away) from under us, e.g. via the edit page — leave rather than show a husk.
  const everFound = useRef(false);
  useEffect(() => {
    if (found) everFound.current = true;
    else if (ready && everFound.current) router.back();
  }, [found, ready, router]);

  if (!ready) return <ScreenSpinner />;
  if (!found) {
    return (
      <View className="flex-1 items-center justify-center px-10" style={{ backgroundColor: colors.background }}>
        <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
          That tune isn&apos;t in your library.
        </Text>
      </View>
    );
  }
  return (
    <Hub
      list={found.list}
      tune={found.tune}
      setTunes={lists[found.list].setTunes}
      pickedChart={pickedChart}
      onPickChart={setPickedChart}
      openMenu={(chartId) => openTuneMenu(found.list, found.tune, chartId)}
      menu={tuneMenu}
    />
  );
}

function Hub({
  list,
  tune,
  setTunes,
  pickedChart,
  onPickChart,
  openMenu,
  menu,
}: {
  list: TuneListId;
  tune: Tune;
  setTunes: (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;
  pickedChart: string | null;
  onPickChart: (id: string | null) => void;
  openMenu: (chartId?: string) => void;
  menu: React.ReactNode;
}) {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  // The tune's charts, main first; charts deleted since are left out once the library has loaded.
  const { allSongs, loading: allLoading } = useChordChartsLibrary(null);
  const linkedIds = tuneChartIds(tune);
  const chartIds = allLoading ? linkedIds : linkedIds.filter((cid) => allSongs.some((s) => s.id === cid));
  const shownChartId = pickedChart && chartIds.includes(pickedChart) ? pickedChart : (chartIds[0] ?? linkedIds[0] ?? null);
  const { selectedSong: chart, selectedSongLoading, loading: libraryLoading } = useChordChartsLibrary(shownChartId);
  const [previewKey, setPreviewKey] = useState('');
  const [picking, setPicking] = useState(false);

  function patch(update: Partial<Tune>) {
    setTunes((prev) => prev.map((t) => (t.id === tune.id ? { ...t, ...update } : t)));
  }

  // --- keys you know it in ---
  const minor = tune.keys.length > 0 ? tune.keys.every((k) => isMinorKey(k.value)) : !!chart && isMinorKey(chart.key);
  const chartMinor = !!chart && isMinorKey(chart.key);
  const suffix = minor ? 'm' : '';
  const knownPcs = new Set(tune.keys.map((k) => keyPitchClass(k.value)));
  function toggleKey(pc: number) {
    if (knownPcs.has(pc)) {
      patch({ keys: tune.keys.filter((k) => keyPitchClass(k.value) !== pc) });
      if (previewKey === KEY_NAMES[pc]) setPreviewKey('');
    } else {
      patch({ keys: [...tune.keys, { id: makeId(), value: `${KEY_NAMES[pc]}${suffix}`, enabled: true }] });
    }
  }

  // Charts whose title matches the tune's name — offered as a one-tap link when none is linked.
  const { allCharts } = useChordChartBrowser();
  const hasChart = tune.chordChartId !== undefined;
  const matches = useMemo(() => {
    if (hasChart) return [];
    const want = titleKey(tune.name);
    if (!want) return [];
    const out: { id: string; title: string; detail: string }[] = [];
    for (const s of allCharts.songs) {
      if (titleKey(s.title) === want) out.push({ id: s.id, title: s.title, detail: [s.key ? prettyKeyName(s.key) : null, s.playlistNames].filter(Boolean).join(' · ') });
    }
    return out.slice(0, 3);
  }, [hasChart, tune.name, allCharts]);
  const linkChart = (chartId: string) => {
    setTunes((prev) => prev.map((t) => (t.id === tune.id ? addChartsToTune(t, [chartId]) : t)));
    onPickChart(chartId);
  };
  const chartLabel = (cid: string, i: number) => {
    const s = allSongs.find((x) => x.id === cid);
    return [s?.title ?? 'Chart', s?.key ? prettyKeyName(s.key) : null, i === 0 ? 'main' : null].filter(Boolean).join(' · ');
  };

  const shownChart = useMemo(() => {
    if (!chart || !previewKey) return chart;
    const semis = (KEY_NAMES.indexOf(previewKey) - keyPitchClass(chart.key) + 12) % 12;
    return semis ? transposeSong(chart, semis) : chart;
  }, [chart, previewKey]);

  const tempos = tune.tempos.map((t) => t.value);
  const subtitle = [TUNE_LIST_LABEL[list], tune.timeSignature, tempos.length ? `${tempos.join(', ')} BPM` : null].filter(Boolean).join(' · ');

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: tune.name,
          headerTitle: () => (
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} className="font-ui-bold text-lg font-bold tracking-tight" style={{ color: colors.foreground }}>
                {tune.name}
              </Text>
              <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                {subtitle}
              </Text>
            </View>
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-2">
              <IconButton Icon={PencilIcon} label="Edit tune" onPress={() => router.push({ pathname: '/library/tune-edit', params: { list, id: tune.id } })} />
              <IconButton Icon={DotsVerticalIcon} label="More options" onPress={() => openMenu(shownChartId ?? undefined)} />
            </View>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: bottomSpace }}>
        {/* Chord chart */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
              Chord chart
            </Text>
            {chart ? (
              <View className="flex-row items-center gap-2">
                <Dropdown
                  value={previewKey}
                  onChange={setPreviewKey}
                  triggerLabel={previewKey ? `${prettyKeyName(previewKey)}${chartMinor ? 'm' : ''}` : chart.key ? prettyKeyName(chart.key) : 'Key'}
                  highlighted={!!previewKey}
                  options={[
                    { value: '', label: `Original (${chart.key ? prettyKeyName(chart.key) : '—'})` },
                    ...KEY_NAMES.map((k) => ({ value: k, label: `${prettyKeyName(k)}${chartMinor ? 'm' : ''}` })),
                  ]}
                />
                <Pressable
                  onPress={() => router.push({ pathname: '/tool/chord-charts-view', params: { id: shownChartId! } })}
                  className="min-h-10 justify-center rounded-lg px-4 py-2"
                  style={{ backgroundColor: colors.surface }}
                >
                  <Text className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
                    Open
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {chartIds.length > 1 ? (
            <View className="flex-row items-center gap-2 px-1">
              <Dropdown
                value={shownChartId ?? ''}
                onChange={(v) => {
                  onPickChart(v);
                  setPreviewKey('');
                }}
                triggerLabel={`Chart ${Math.max(1, chartIds.indexOf(shownChartId ?? '') + 1)} of ${chartIds.length}`}
                options={chartIds.map((cid, i) => ({ value: cid, label: chartLabel(cid, i) }))}
              />
              {shownChartId === chartIds[0] ? (
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  The main chart
                </Text>
              ) : null}
            </View>
          ) : null}
          {shownChartId && (selectedSongLoading || libraryLoading) ? (
            <View className="items-center py-10">
              <LoadingSpinner />
            </View>
          ) : shownChart ? (
            <Pressable onPress={() => router.push({ pathname: '/tool/chord-charts-view', params: { id: shownChartId! } })}>
              <View className="rounded-2xl px-1 py-2" style={{ backgroundColor: colors.surface }}>
                <ChordChartView song={shownChart} hideHeader />
              </View>
            </Pressable>
          ) : (
            <View className="gap-3 rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
              <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                {shownChartId ? "The linked chart isn't in your chord charts anymore." : 'No chord chart yet.'}
              </Text>
              {matches.map((m) => (
                <View key={m.id} className="flex-row items-center gap-3 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
                  <ChordChartIcon color={colors.accent} size={22} />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                      {m.title}
                    </Text>
                    <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                      {m.detail}
                    </Text>
                  </View>
                  <Pressable onPress={() => linkChart(m.id)} className="min-h-10 justify-center rounded-lg px-4 py-2" style={{ backgroundColor: colors.accent }}>
                    <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                      Link it
                    </Text>
                  </Pressable>
                </View>
              ))}
              <View className="flex-row gap-2">
                <HubButton label="Link a chart" icon={<LinkIcon color={colors.foreground} size={16} />} onPress={() => setPicking(true)} />
                <HubButton
                  label="Create one"
                  icon={<PlusIcon color={colors.foreground} size={16} />}
                  onPress={() => router.push({ pathname: '/tool/chord-charts-new', params: newChartParams(list, tune) })}
                />
              </View>
            </View>
          )}
        </View>

        {/* Keys */}
        <View className="gap-2">
          <View className="flex-row items-center gap-2 px-1">
            <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
              Keys I know it in
            </Text>
            <InfoButton
              title="Keys I know it in"
              text="Tap a key to mark that you can play the tune in it (tap again to unmark). Jam Practice picks from these keys. Long-press a known key to preview the chart in it."
              size={16}
            />
            <Text className="font-ui ml-auto text-sm tabular-nums" style={{ color: colors.muted }}>
              {knownPcs.size} of 12
            </Text>
          </View>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {KEY_NAMES.map((name, pc) => {
              const known = knownPcs.has(pc);
              const previewing = previewKey === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => toggleKey(pc)}
                  onLongPress={() => chart && setPreviewKey(previewing ? '' : name)}
                  accessibilityLabel={`${name}${suffix}: ${known ? 'known' : 'not yet'}`}
                  accessibilityState={{ selected: known }}
                  className="items-center justify-center rounded-xl"
                  style={{
                    // Four to a row that fill it exactly (a fixed width left a gap on the right).
                    flexBasis: '22%',
                    flexGrow: 1,
                    height: 48,
                    backgroundColor: known ? colors.accent : colors.surface,
                    borderWidth: previewing ? 2 : 0,
                    borderColor: colors.foreground,
                  }}
                >
                  {/* The ♭/♯ from the charts' font (Geist has none, and the fallback sat low). */}
                  <Text className="font-ui-bold text-base font-bold" style={{ color: known ? colors['accent-foreground'] : colors.muted, lineHeight: 22 }}>
                    {name[0]}
                    {name.length > 1 ? (
                      <Text style={{ fontFamily: 'PetalumaScript', fontWeight: 'normal', fontSize: 17 }}>{name[1] === 'b' ? '♭' : '♯'}</Text>
                    ) : null}
                    {suffix}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TuneFiles tuneId={tune.id} />

        <TuneRecordings tuneId={tune.id} />

        {/* Notes — a preview; writing happens on its own page so the keyboard never covers it */}
        <View className="gap-2">
          <Text className="font-ui-bold px-1 text-lg font-bold" style={{ color: colors.foreground }}>
            Notes
          </Text>
          <Pressable
            onPress={() => router.push({ pathname: '/library/tune-notes', params: { id: tune.id } })}
            accessibilityLabel={tune.notes.trim() ? 'Edit notes' : 'Write notes'}
            className="flex-row gap-3 rounded-2xl p-4"
            style={{ backgroundColor: colors.surface, minHeight: 72 }}
          >
            <Text
              numberOfLines={8}
              className="font-ui flex-1 text-base"
              style={{ color: tune.notes.trim() ? colors.foreground : colors.muted, lineHeight: 22 }}
            >
              {tune.notes.trim() || 'Tap to write notes — form, tricky changes, voicings, recordings to check out…'}
            </Text>
            <PencilIcon color={colors.muted} size={18} />
          </Pressable>
        </View>

        <TuneShedNotes tuneId={tune.id} name={tune.name} />
      </ScrollView>

      {menu}
      <ChartPickerModal
        visible={picking}
        initialQuery={tune.name}
        exclude={chartIds}
        onClose={() => setPicking(false)}
        onPick={(song) => {
          linkChart(song.id);
          setPicking(false);
        }}
      />
    </View>
  );
}

/** The tune's recordings: play them right here, record a new take for it (the Recorder opens
    already linked to this tune, metronome at its tempo), or link one you already have. */
function TuneRecordings({ tuneId }: { tuneId: string }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const recordings = useDeviceUrls(useQuery(recordingsApi.listForTune, isAuthenticated ? { tuneId } : 'skip'));
  const [linking, setLinking] = useState(false);
  const all = useQuery(recordingsApi.list, isAuthenticated && linking ? {} : 'skip');
  const update = useMutation(recordingsApi.update);
  const player = useRecordingPlayer();

  return (
    <View className="gap-2">
      <View className="flex-row items-center px-1">
        <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
          Recordings
        </Text>
        {recordings && recordings.length > 0 ? (
          <Text className="font-ui ml-auto text-sm tabular-nums" style={{ color: colors.muted }}>
            {recordings.length}
          </Text>
        ) : null}
      </View>
      {!isAuthenticated ? (
        <View className="rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            Sign in to record takes of this tune — recordings are saved to your account.
          </Text>
        </View>
      ) : (
        <>
          {recordings === undefined ? (
            <View className="items-center py-6">
              <LoadingSpinner />
            </View>
          ) : (
            recordings.map((rec) => (
              <RecordingRow
                key={rec._id}
                recording={rec}
                player={player}
                onOpen={() => router.push({ pathname: '/recordings/[id]', params: { id: rec._id } })}
              />
            ))
          )}
          {/* Empty, it reads like the Chord chart section: a line saying so, then the buttons. */}
          <View
            className={recordings?.length ? 'rounded-2xl p-2' : 'gap-3 rounded-2xl p-4'}
            style={{ backgroundColor: colors.surface }}
          >
            {recordings?.length ? null : (
              <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                No takes yet.
              </Text>
            )}
            <View className="flex-row gap-2">
              <HubButton
                label="Record a take"
                icon={<MicrophoneIcon color={colors.foreground} size={16} />}
                onPress={() => router.push({ pathname: '/tool/recorder', params: { tuneId } })}
              />
              <HubButton label="Link existing" icon={<LinkIcon color={colors.foreground} size={16} />} onPress={() => setLinking(true)} />
            </View>
          </View>
        </>
      )}
      <RecordingSelectModal
        visible={linking}
        recordings={all}
        excludeTuneId={tuneId}
        onClose={() => setLinking(false)}
        onPick={(rec) => {
          setLinking(false);
          void update({ id: rec._id, tuneId });
        }}
      />
    </View>
  );
}

function HubButton({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5" style={{ backgroundColor: colors.background }}>
      {icon}
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default withScreenLoader(TuneHubScreen);
