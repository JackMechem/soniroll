import { useConvexAuth } from '@convex-dev/auth/react';
import { type FileKind, FILE_KIND_LABEL, fileDetail, fileKind, formatBytes } from '@jam-practice/core/files';
import { sortKey } from '@jam-practice/core/sortText';
import { useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Dropdown } from '@/components/Dropdown';
import { FileRow, useFileActions } from '@/components/files/FileParts';
import { CloudIcon, PhoneIcon, UploadIcon } from '@/components/files/icons';
import { FolderIcon } from '@/components/icons';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { InfoButton } from '@/components/InfoButton';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useTuneIndex } from '@/components/recordings/RecordingParts';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { LibraryHeader } from '@/components/TabHeader';
import { Segmented } from '@/components/tool/reward';
import { EmptyState, IconButton, SearchField, SignInGate, SortControl } from '@/components/ui';
import { tidyDeviceFiles, useDeviceUrls } from '@/lib/deviceFiles';
import { type StoredEntry, type StoredKind, filesApi, pickFiles, useFileUploader, useSaveTarget } from '@/lib/files';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

const SOURCE_LABEL: Record<StoredKind, string> = {
  file: 'Uploads',
  recording: 'Recordings',
  song: 'Tune songs',
  lesson: 'Lesson files',
  handin: 'Hand-ins',
  profile: 'Profile',
};

/** What a non-upload is, in its detail line. */
const SOURCE_SHORT: Record<StoredKind, string | null> = {
  file: null,
  recording: 'Recording',
  song: 'Tune song',
  lesson: 'Lesson file',
  handin: 'Hand-in',
  profile: 'Profile',
};

const KIND_FILTER_LABEL: Record<FileKind, string> = {
  pdf: 'PDFs',
  image: 'Images',
  audio: 'Audio',
  video: 'Videos',
  notation: 'Notation',
  document: 'Documents',
  other: 'Other',
};

/** The app's sort order (Recent, A–Z), plus Largest for freeing up space. */
type SortId = 'new' | 'name' | 'big';
const SORTS: { value: SortId; label: string }[] = [
  { value: 'new', label: 'Recent' },
  { value: 'name', label: 'A–Z' },
  { value: 'big', label: 'Largest' },
];

const keyOf = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;

/**
 * The Library's Files tab (the website's Files tab): everything stored with your account — files
 * you uploaded (on their own or on tunes), recordings, tunes' songs, lesson files, hand-ins and
 * profile images. Upload from the phone, search, filter by where it came from or what kind it is,
 * sort, and open anything in the viewer. Each has a ⋮ menu (also a long press): rename, share a
 * link, send the file, put it online or keep it on this phone, attach to a tune, delete.
 * Without a storage plan, new files are kept on this phone (`lib/deviceFiles.ts`).
 */
function FilesScreen() {
  const { colors } = useAppTheme();
  const bottomSpace = useTabBarSpace();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storage = useQuery(filesApi.storage, isAuthenticated ? {} : 'skip');
  const { byId } = useTuneIndex();
  const tuneName = (id: string) => byId.get(id)?.tune.name;
  const target = useSaveTarget();
  const uploader = useFileUploader(target);
  const actions = useFileActions({ tuneName });

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('source:all');
  const [sort, setSort] = useState<SortId>('new');

  const withUrls = useDeviceUrls(storage?.items);
  const items = useMemo<StoredEntry[]>(() => withUrls ?? [], [withUrls]);

  // Forget files on this phone that the account no longer lists (deleted or moved online, maybe
  // from another device).
  const owner = target.storage?.userId;
  const liveKeys = useMemo(() => (storage ? new Set(storage.items.flatMap((i) => (i.device ? [i.device.key] : []))) : null), [storage]);
  useEffect(() => {
    if (owner && liveKeys) tidyDeviceFiles(owner, liveKeys);
  }, [owner, liveKeys]);

  const counts = useMemo(() => {
    const bySource = new Map<string, number>();
    const byKind = new Map<string, number>();
    for (const item of items) {
      bySource.set(item.kind, (bySource.get(item.kind) ?? 0) + 1);
      const k = fileKind(item.mimeType, item.name);
      byKind.set(k, (byKind.get(k) ?? 0) + 1);
    }
    return { bySource, byKind };
  }, [items]);

  const filterOptions = useMemo(
    () => [
      { value: 'source:all', label: `Everything · ${items.length}` },
      ...(Object.keys(SOURCE_LABEL) as StoredKind[]).filter((s) => counts.bySource.get(s)).map((s) => ({ value: `source:${s}`, label: `${SOURCE_LABEL[s]} · ${counts.bySource.get(s)}` })),
      ...(Object.keys(FILE_KIND_LABEL) as FileKind[]).filter((k) => counts.byKind.get(k)).map((k) => ({ value: `kind:${k}`, label: `${KIND_FILTER_LABEL[k]} · ${counts.byKind.get(k)}` })),
    ],
    [items.length, counts],
  );

  /** What it is and which tune it's on. */
  const whereOf = (item: StoredEntry) => {
    const tune = item.tuneId ? tuneName(item.tuneId) : undefined;
    return [SOURCE_SHORT[item.kind], tune].filter(Boolean).join(' · ') || null;
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const [what, value] = filter.split(':');
    const out = items.filter((item) => {
      if (what === 'source' && value !== 'all' && item.kind !== value) return false;
      if (what === 'kind' && fileKind(item.mimeType, item.name) !== value) return false;
      if (!q) return true;
      const tune = item.tuneId ? (byId.get(item.tuneId)?.tune.name ?? '') : '';
      return [item.name, tune].some((t) => t.toLowerCase().includes(q));
    });
    // Names sort on plain lower-case keys (`localeCompare` is slow on Hermes).
    const names = new Map(out.map((i) => [keyOf(i), sortKey(i.name)]));
    const byName = (a: StoredEntry, b: StoredEntry) => {
      const x = names.get(keyOf(a))!;
      const y = names.get(keyOf(b))!;
      return x < y ? -1 : x > y ? 1 : 0;
    };
    const by: Record<SortId, (a: StoredEntry, b: StoredEntry) => number> = {
      new: (a, b) => b.createdAt - a.createdAt,
      name: byName,
      big: (a, b) => b.size - a.size,
    };
    return out.sort(by[sort]);
  }, [items, query, filter, sort, byId]);

  async function upload() {
    uploader.clearError();
    const files = await pickFiles([], true);
    if (files.length) await uploader.uploadAll(files);
  }

  const header = (
    <SafeAreaView edges={['top']}>
      <LibraryHeader right={isAuthenticated ? <IconButton primary Icon={UploadIcon} label="Upload" onPress={() => void upload()} /> : undefined} />
    </SafeAreaView>
  );

  if (isLoading || (isAuthenticated && storage === undefined)) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <ScreenSpinner />
      </View>
    );
  }

  if (!isAuthenticated || !storage) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View className="p-4">
          <SignInGate Icon={FolderIcon} title="Your files" body="PDFs, lead sheets, pictures, audio and video, on their own or on a tune, opened right here. Free with an account." />
        </View>
      </View>
    );
  }

  const paid = !!storage.hasPlan;
  const full = paid && storage.used >= storage.quota;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      <FlatList
        data={shown}
        keyExtractor={keyOf}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomSpace, gap: 8 }}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <StorageCard storage={storage} canChoose={target.canChoose} online={target.online} setOnline={target.setOnline} />
            {uploader.progress ? (
              <View className="flex-row items-center gap-2">
                <LoadingSpinner size="sm" />
                <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                  Saving {uploader.progress.total > 1 ? `${Math.min(uploader.progress.done + 1, uploader.progress.total)} of ${uploader.progress.total}` : 'your file'}…
                </Text>
              </View>
            ) : null}
            {actions.status ? (
              <View className="flex-row items-center gap-2">
                <LoadingSpinner size="sm" />
                <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                  {actions.status}
                </Text>
              </View>
            ) : null}
            {[full ? 'Your online storage is full. Delete something to add more.' : null, uploader.error, actions.error].filter(Boolean).map((text) => (
              <Text key={text} className="font-ui text-sm" style={{ color: colors.danger }}>
                {text}
              </Text>
            ))}
            {items.length > 0 ? (
              <>
                <SearchField value={query} onChangeText={setQuery} placeholder="Search files" />
                <View className="flex-row flex-wrap items-center gap-2">
                  <Dropdown value={filter} options={filterOptions} onChange={setFilter} />
                  <SortControl value={sort} options={SORTS} onChange={setSort} />
                </View>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          items.length ? (
            <View className="items-center gap-1 px-6 py-12">
              <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                Nothing matches
              </Text>
              <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
                Try another word, or show everything.
              </Text>
            </View>
          ) : (
            <EmptyState
              Icon={FolderIcon}
              title="No files yet"
              body="A PDF, a lead sheet, a photo of a chart, a recording: anything you want with your tunes."
              action={{ label: 'Upload', Icon: UploadIcon, onPress: () => void upload() }}
            />
          )
        }
        renderItem={({ item }) => (
          <FileRow item={item} paid={paid} detail={fileDetail(item, whereOf(item))} onOpen={() => actions.openFile(item)} onMenu={() => actions.openMenu(item)} />
        )}
      />
      {actions.elements}
    </View>
  );
}

/** Where new files go and how much is online: this phone (free), or online with the plan (and the
    choice for this upload). */
function StorageCard({
  storage,
  canChoose,
  online,
  setOnline,
}: {
  storage: { used: number; onDevices: number; quota: number; freeQuota: number; hasPlan: boolean; plan: { storageGb: number } | null; gift: { storageGb: number } | null };
  canChoose: boolean;
  online: boolean;
  setOnline: (online: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const fraction = storage.quota > 0 ? Math.min(1, storage.used / storage.quota) : 0;
  const gb = storage.plan?.storageGb ?? storage.gift?.storageGb;
  const Icon = storage.hasPlan ? CloudIcon : PhoneIcon;
  return (
    <View className="gap-3 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-start gap-2.5">
        <Icon color={colors.accent} size={20} />
        <Text className="font-ui flex-1 text-sm leading-5" style={{ color: colors.muted }}>
          {storage.hasPlan
            ? `Your ${gb} GB ${storage.plan ? 'plan' : 'gift'} keeps files online, on all your devices.`
            : 'New files are kept on this phone. Every feature works; to have them on all your devices, get a storage plan on soniroll.com.'}
        </Text>
        <InfoButton
          title="Where files are kept"
          text={
            'Online files open on every device. Files kept on a device open only there — on the others they show which device has them.\n\n' +
            `Without a storage plan you get ${formatBytes(storage.freeQuota)} online for what other people see (shared links, Lessons, notes, your profile); everything else stays on the device that saved it. Plans are on soniroll.com (Account → Storage plan).\n\n` +
            'Files kept on this phone are deleted if you uninstall the app.'
          }
        />
      </View>
      <View className="gap-1.5">
        <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: withAlpha(colors.foreground, 0.1) }}>
          <View className="h-full rounded-full" style={{ width: `${fraction * 100}%`, backgroundColor: fraction >= 1 ? colors.danger : colors.accent }} />
        </View>
        <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {formatBytes(storage.used)} of {formatBytes(storage.quota)} online{storage.onDevices ? ` · ${formatBytes(storage.onDevices)} kept on devices` : ''}
        </Text>
      </View>
      {canChoose ? (
        <Segmented
          label="New files go"
          value={online ? 'online' : 'phone'}
          options={[
            { value: 'online', label: 'Online' },
            { value: 'phone', label: 'This phone' },
          ]}
          onChange={(v) => setOnline(v === 'online')}
        />
      ) : null}
    </View>
  );
}

export default withScreenLoader(FilesScreen);
