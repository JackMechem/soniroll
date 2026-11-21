import { useConvexAuth } from '@convex-dev/auth/react';
import { displayKey, isMinorKey, setlistKey } from '@jam-practice/core/setlistKeys';
import type { Tune } from '@jam-practice/core/types';
import { api } from '@jam-practice/convex/_generated/api';
import { useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DraggableList } from '@/components/DraggableList';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChordChartIcon,
  CloseIcon,
  DotsVerticalIcon,
  DragIcon,
  LinkIcon,
  MusicNoteIcon,
  PencilIcon,
  PlusIcon,
  ShareIcon,
  SlidersIcon,
  SlidesIcon,
  ToTopIcon,
  TrashIcon,
  UsersIcon,
} from '@/components/icons';
import { SetlistTuneSheet } from '@/components/library/SetlistTuneSheet';
import { TunePickerModal } from '@/components/library/TunePickerModal';
import { NameDialog } from '@/components/NameDialog';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { EmptyState, IconButton } from '@/components/ui';
import { useShareSetlist } from '@/lib/shareSetlist';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useSetlists } from '@/lib/useSetlists';
import { TUNE_LIST_IDS, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';
import { prettyKeyName } from '@/lib/keyNames';
import { withAccidentals } from '@/components/Accidentals';

/**
 * One setlist: its tunes in order (numbered), each opening its tune page, with ⋮ per tune to move
 * it up/down/to the top or remove it; drag a row's grip to reorder. "View all charts" opens
 * `setlist-charts.tsx`, every tune's chart in order, swiped through one per page. The header has + (add tunes from your lists) and ⋮ for the
 * setlist: rename, edit description, share by link (`useShareSetlist` — anyone with the link can
 * open it, no account needed; sharing again updates the same link), post to Community, stop
 * sharing, delete.
 */
const ROW_H = 62;

function SetlistScreen() {
  const bottomSpace = useTabBarSpace();
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { setlists, ready, patch, remove } = useSetlists();
  const { lists, ready: tunesReady } = useTuneLists();
  const { share, unshare } = useShareSetlist();
  const { allSongs } = useChordChartsLibrary(null);
  const chartKeys = useMemo(() => {
    const m = new Map<string, string>();
    for (const song of allSongs) m.set(song.id, song.key);
    return m;
  }, [allSongs]);
  const [settingsFor, setSettingsFor] = useState<Tune | null>(null);
  const setlist = setlists.find((s) => s.id === id);
  // Already posted this setlist? Then "Post to Community" becomes "View post".
  const postId = useQuery(api.communityTunes.postForSetlist, isAuthenticated && id ? { setlistId: id } : 'skip') ?? null;

  const [menuOpen, setMenuOpen] = useState(false);
  const [tuneMenu, setTuneMenu] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Deleted from under us — leave.
  const everFound = useRef(false);
  useEffect(() => {
    if (setlist) everFound.current = true;
    else if (ready && everFound.current) router.back();
  }, [setlist, ready, router]);

  if (!ready || !tunesReady) return <ScreenSpinner />;
  if (!setlist) {
    return (
      <View className="flex-1 items-center justify-center px-10" style={{ backgroundColor: colors.background }}>
        <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
          That setlist isn&apos;t here anymore.
        </Text>
      </View>
    );
  }

  const found: { tune: Tune; list: TuneListId }[] = [];
  for (const tuneId of setlist.tuneIds) {
    for (const list of TUNE_LIST_IDS) {
      const tune = lists[list].tunes.find((t) => t.id === tuneId);
      if (tune) {
        found.push({ tune, list });
        break;
      }
    }
  }
  const tunes = found.map((f) => f.tune);

  // Each tune's key and tempo *in this setlist*: the setlist's own choice if it made one,
  // otherwise the chart's key (else the tune's first key) and the tune's first tempo.
  function playInfo(tune: Tune) {
    const o = setlist?.overrides?.[tune.id];
    const chartKey = tune.chordChartId ? chartKeys.get(tune.chordChartId) : undefined;
    const tuneKeys = tune.keys.filter((k) => k.enabled).map((k) => k.value);
    const base = chartKey || tuneKeys[0] || null;
    const defaultTempo = tune.tempos.find((t) => t.enabled)?.value ?? null;
    return {
      key: setlistKey({ overrideRoot: o?.key, chartKey, tuneKeys }),
      defaultKey: base ? displayKey(base) : null,
      minor: base ? isMinorKey(base) : false,
      keyChanged: !!o?.key,
      tempo: o?.tempo ?? defaultTempo,
      defaultTempo,
      tempoChanged: o?.tempo != null,
    };
  }

  async function doShare() {
    if (!setlist) return;
    if (!isAuthenticated) {
      setMessage('Sign in to share a setlist by link.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const shareId = await share(setlist, tunes);
      if (shareId !== setlist.shareId) patch(setlist.id, { shareId });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't share that.");
    } finally {
      setBusy(false);
    }
  }

  function move(from: number, to: number) {
    if (!setlist || to < 0 || to >= setlist.tuneIds.length) return;
    const next = [...setlist.tuneIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    patch(setlist.id, { tuneIds: next });
  }

  const icon = (I: typeof PencilIcon, danger = false) => <I color={danger ? colors.danger : colors.foreground} size={22} />;
  const actions: SheetAction[] = [
    { key: 'rename', icon: icon(PencilIcon), label: 'Rename', onPress: () => setRenaming(true) },
    { key: 'describe', icon: icon(PencilIcon), label: setlist.description ? 'Edit description' : 'Add a description', onPress: () => setDescribing(true) },
    { key: 'share', icon: icon(ShareIcon), label: 'Share link', onPress: () => void doShare() },
    postId
      ? { key: 'post', icon: icon(UsersIcon), label: 'View post', onPress: () => router.push({ pathname: '/post/[id]', params: { id: postId } }) }
      : { key: 'post', icon: icon(UsersIcon), label: 'Post to Community', onPress: () => router.push({ pathname: '/community/new', params: { setlist: setlist.id } }) },
    ...(setlist.shareId
      ? [
          {
            key: 'unshare',
            icon: icon(LinkIcon),
            label: 'Stop sharing link',
            onPress: () => {
              const shareId = setlist.shareId!;
              patch(setlist.id, { shareId: undefined });
              void unshare(shareId);
            },
          },
        ]
      : []),
    { key: 'delete', icon: icon(TrashIcon, true), label: 'Delete setlist', danger: true, onPress: () => setConfirmDelete(true) },
  ];

  const selected = tuneMenu !== null ? found[tuneMenu] : null;
  const tuneActions: SheetAction[] =
    tuneMenu === null || !selected
      ? []
      : [
          ...(tuneMenu > 0 ? [{ key: 'top', icon: icon(ToTopIcon), label: 'Move to top', onPress: () => move(tuneMenu, 0) }] : []),
          ...(tuneMenu > 0 ? [{ key: 'up', icon: icon(ArrowUpIcon), label: 'Move up', onPress: () => move(tuneMenu, tuneMenu - 1) }] : []),
          ...(tuneMenu < found.length - 1 ? [{ key: 'down', icon: icon(ArrowDownIcon), label: 'Move down', onPress: () => move(tuneMenu, tuneMenu + 1) }] : []),
          { key: 'keytempo', icon: icon(SlidersIcon), label: 'Key & tempo for this set', onPress: () => setSettingsFor(selected.tune) },
          ...(selected.tune.chordChartId
            ? [{ key: 'chart', icon: icon(ChordChartIcon), label: 'Open chord chart', onPress: () => router.push({ pathname: '/tool/chord-charts-view', params: { id: selected.tune.chordChartId! } }) }]
            : []),
          {
            key: 'remove',
            icon: icon(CloseIcon, true),
            label: 'Remove from setlist',
            danger: true,
            onPress: () => patch(setlist.id, { tuneIds: setlist.tuneIds.filter((x) => x !== selected.tune.id) }),
          },
        ];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: setlist.name,
          headerTitle: () => (
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} className="font-ui-bold text-lg font-bold tracking-tight" style={{ color: colors.foreground }}>
                {setlist.name}
              </Text>
              <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                {`Setlist · ${tunes.length} tune${tunes.length === 1 ? '' : 's'}${setlist.shareId ? ' · shared' : ''}`}
              </Text>
            </View>
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-2">
              <IconButton primary Icon={PlusIcon} label="Add tunes" onPress={() => setPicking(true)} />
              <IconButton Icon={DotsVerticalIcon} label="Setlist options" onPress={() => setMenuOpen(true)} />
            </View>
          ),
        }}
      />
      <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottomSpace }}>
        {setlist.description ? (
          <Text className="font-ui text-base" style={{ color: colors.foreground }}>
            {setlist.description}
          </Text>
        ) : null}

        {found.length > 0 ? (
          <Pressable
            onPress={() => router.push({ pathname: '/setlist-charts', params: { mine: setlist.id } })}
            className="flex-row items-center justify-center gap-2 rounded-xl py-3.5"
            style={{ backgroundColor: colors.accent }}
          >
            <SlidesIcon color={colors['accent-foreground']} size={20} />
            <Text className="font-ui-bold text-base font-bold" style={{ color: colors['accent-foreground'] }}>
              View all charts
            </Text>
          </Pressable>
        ) : null}
        <View className="flex-row gap-2">
          <Pressable onPress={() => void doShare()} disabled={busy} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: colors.surface, opacity: busy ? 0.5 : 1 }}>
            <ShareIcon color={colors.foreground} size={18} />
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              {busy ? 'Sharing…' : 'Share link'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              postId
                ? router.push({ pathname: '/post/[id]', params: { id: postId } })
                : router.push({ pathname: '/community/new', params: { setlist: setlist.id } })
            }
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3"
            style={{ backgroundColor: colors.surface }}
          >
            <UsersIcon color={colors.foreground} size={18} />
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              {postId ? 'View post' : 'Post to Community'}
            </Text>
          </Pressable>
        </View>
        {message ? (
          <Text className="font-ui text-sm" style={{ color: colors.danger }}>
            {message}
          </Text>
        ) : null}

        {found.length === 0 ? (
          <EmptyState
            Icon={MusicNoteIcon}
            title="No tunes in this setlist yet"
            body="Pick them from your tunes or the standards."
            action={{ label: 'Add tunes', Icon: PlusIcon, onPress: () => setPicking(true) }}
          />
        ) : (
          <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
            <DraggableList
              keys={found.map((f) => f.tune.id)}
              rowHeight={ROW_H}
              onDragChange={setDragging}
              onReorder={(order) => patch(setlist.id, { tuneIds: [...order, ...setlist.tuneIds.filter((x) => !order.includes(x))] })}
              renderRow={(key, i, handle) => {
                const { tune, list } = found.find((f) => f.tune.id === key)!;
                return (
                  <View className="flex-row items-center" style={{ height: ROW_H, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.background }}>
                    {handle(
                      <View accessibilityLabel={`Drag to reorder ${tune.name}`} className="h-full w-10 items-center justify-center">
                        <DragIcon color={colors.muted} size={22} />
                      </View>,
                    )}
                    <Pressable
                      onPress={() => router.push({ pathname: '/library/tune', params: { list, id: tune.id } })}
                      onLongPress={() => setTuneMenu(i)}
                      android_ripple={{ color: colors['surface-hover'] }}
                      className="h-full flex-1 flex-row items-center gap-3"
                    >
                      <Text className="font-ui-bold w-5 text-right text-base font-bold tabular-nums" style={{ color: colors.accent }}>
                        {i + 1}
                      </Text>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text numberOfLines={1} className="font-ui-semibold flex-shrink text-base font-semibold" style={{ color: colors.foreground }}>
                            {tune.name}
                          </Text>
                          {tune.chordChartId ? <ChordChartIcon color={colors.accent} size={15} /> : null}
                        </View>
                        <PlayInfoLine info={playInfo(tune)} timeSignature={tune.timeSignature} />
                      </View>
                    </Pressable>
                    <Pressable onPress={() => setTuneMenu(i)} accessibilityLabel={`Options for ${tune.name}`} className="h-11 w-11 items-center justify-center">
                      <DotsVerticalIcon color={colors.muted} size={22} />
                    </Pressable>
                  </View>
                );
              }}
            />
          </View>
        )}
        {found.length > 0 ? (
          <Pressable onPress={() => setPicking(true)} className="flex-row items-center justify-center gap-1.5 rounded-xl py-3" style={{ backgroundColor: colors.surface }}>
            <PlusIcon color={colors.foreground} size={18} />
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              Add tunes
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <ActionSheet visible={menuOpen} title={setlist.name} subtitle={`${tunes.length} tunes`} actions={actions} onClose={() => setMenuOpen(false)} />
      <ActionSheet visible={tuneMenu !== null} title={selected?.tune.name} subtitle={selected ? `#${(tuneMenu ?? 0) + 1} in ${setlist.name}` : undefined} actions={tuneActions} onClose={() => setTuneMenu(null)} />
      <SetlistTuneSheet
        visible={!!settingsFor}
        tuneName={settingsFor?.name ?? ''}
        {...(settingsFor ? (({ minor, defaultKey, defaultTempo }) => ({ minor, defaultKey, defaultTempo }))(playInfo(settingsFor)) : { minor: false, defaultKey: null, defaultTempo: null })}
        value={settingsFor ? setlist.overrides?.[settingsFor.id] : undefined}
        onSave={(next) => {
          if (!settingsFor) return;
          const overrides = { ...(setlist.overrides ?? {}) };
          if (next) overrides[settingsFor.id] = next;
          else delete overrides[settingsFor.id];
          patch(setlist.id, { overrides });
        }}
        onClose={() => setSettingsFor(null)}
      />
      <TunePickerModal
        visible={picking}
        exclude={setlist.tuneIds}
        onAdd={(ids) => patch(setlist.id, { tuneIds: [...setlist.tuneIds, ...ids] })}
        onClose={() => setPicking(false)}
      />
      <NameDialog visible={renaming} title="Rename setlist" initialValue={setlist.name} onSubmit={(name) => patch(setlist.id, { name })} onClose={() => setRenaming(false)} />
      <NameDialog
        visible={describing}
        title="Description"
        initialValue={setlist.description}
        placeholder="e.g. Friday at the Blue Room, 2 sets"
        onSubmit={(description) => patch(setlist.id, { description })}
        onClose={() => setDescribing(false)}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete “${setlist.name}”?`}
        message={`The setlist goes away; its tunes stay in your lists.${setlist.shareId ? ' Its shared link stops working.' : ''}`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (setlist.shareId) void unshare(setlist.shareId);
          remove(setlist.id);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

/** "Em · 140 BPM · 4/4" — with the key/tempo in accent when this setlist changed them. */
function PlayInfoLine({
  info,
  timeSignature,
}: {
  info: { key: string | null; keyChanged: boolean; tempo: number | null; tempoChanged: boolean };
  timeSignature: string;
}) {
  const { colors } = useAppTheme();
  const parts: { text: string; changed: boolean }[] = [];
  if (info.key) parts.push({ text: prettyKeyName(info.key), changed: info.keyChanged });
  if (info.tempo != null) parts.push({ text: `${info.tempo} BPM`, changed: info.tempoChanged });
  if (timeSignature) parts.push({ text: timeSignature, changed: false });
  return (
    <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
      {parts.map((p, i) => (
        <Text key={i} className={p.changed ? 'font-ui-bold font-bold' : 'font-ui'} style={p.changed ? { color: colors.accent } : undefined}>
          {i ? ' · ' : ''}
          {withAccidentals(p.text)}
        </Text>
      ))}
    </Text>
  );
}

export default withScreenLoader(SetlistScreen);
