import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { fileDetail, fileKind } from '@jam-practice/core/files';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FileShareSheet } from '@/components/files/FileShareSheet';
import { FileViewer, type ViewerFile } from '@/components/files/FileViewer';
import { CloudIcon, FileTypeIcon, PhoneIcon, SendIcon } from '@/components/files/icons';
import { ChevronRightIcon, DotsVerticalIcon, LinkIcon, MusicNoteIcon, PencilIcon, TrashIcon, UnlinkIcon, WaveIcon } from '@/components/icons';
import { NameDialog } from '@/components/NameDialog';
import { TuneSelectModal } from '@/components/recordings/RecordingParts';
import { deleteOnDevice } from '@/lib/deviceFiles';
import { type StoredEntry, errorText, filesApi, isMovable, localCopy, shareFile, useStorageMoves, useStoragePlan } from '@/lib/files';
import { saveLocalFile } from '@/lib/slowDownerFiles';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Managing what you store, on the phone (the website's `FileParts.tsx`): a file's row, where its
 * data is, and `useFileActions` — the viewer, the ⋮ menu (open, rename, share a link, send the file,
 * put it online / keep it on this phone, attach to a tune, go to where it lives, delete) and their
 * dialogs, for any `StoredEntry`.
 */

/** A `StoredEntry` as the viewer takes it. */
export function viewerFileOf(item: StoredEntry): ViewerFile {
  return { name: item.name, mimeType: item.mimeType, size: item.size, createdAt: item.createdAt, url: item.url, device: item.device, recording: item.kind === 'recording' };
}

/** What deleting does, by where the item came from. */
function deleteMessage(item: StoredEntry, tune: string | undefined) {
  switch (item.kind) {
    case 'recording':
      return 'The recording is deleted for good.';
    case 'song':
      return `The song behind your takes${tune ? ` on ${tune}` : ''} is deleted for good. Your takes stay.`;
    case 'lesson':
      return 'It’s taken out of your student’s lesson and deleted for good.';
    case 'handin':
      return 'It’s taken out of your hand-in, so your teacher won’t see it any more.';
    case 'profile':
      return 'It’s taken off your profile.';
    default:
      return 'The file is deleted from your account for good. If the tune it’s on is shared, it disappears from the link too.';
  }
}

/** Opens a dialog after the action sheet has gone (iOS won't show a modal while another one is
    still closing). */
function afterSheet(run: () => void) {
  setTimeout(run, Platform.OS === 'ios' ? 450 : 0);
}

/**
 * The viewer, ⋮ menu and dialogs for anything you store. `tuneName` names the tune a file is on.
 * Render `elements` once; call `openFile(item)` to view it and `openMenu(item)` for its menu.
 */
export function useFileActions({ tuneName }: { tuneName: (tuneId: string) => string | undefined }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const update = useMutation(filesApi.update);
  const rename = useMutation(filesApi.renameItem);
  const remove = useMutation(filesApi.removeItem);
  const storage = useStoragePlan();
  const moves = useStorageMoves(storage?.userId);
  const [open, setOpen] = useState<StoredEntry | null>(null);
  const [menu, setMenu] = useState<StoredEntry | null>(null);
  const [renaming, setRenaming] = useState<StoredEntry | null>(null);
  const [linking, setLinking] = useState<StoredEntry | null>(null);
  const [sharing, setSharing] = useState<StoredEntry | null>(null);
  const [deleting, setDeleting] = useState<StoredEntry | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A short "done" line after attaching a file to a tune (it otherwise happens out of sight).
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const same = (a: StoredEntry | null, b: StoredEntry) => !!a && a.kind === b.kind && a.id === b.id;

  /** Where an item is managed in the app, besides Files. */
  function goTo(item: StoredEntry): { label: string; go: () => void } | null {
    if (item.kind === 'recording') return { label: 'Open the recording', go: () => router.push({ pathname: '/recordings/[id]', params: { id: item.id } }) };
    if (item.kind === 'song' && item.tuneId) return { label: `Open ${tuneName(item.tuneId) ?? 'the tune'}`, go: () => router.push({ pathname: '/library/tune', params: { id: item.tuneId! } }) };
    if (item.kind === 'lesson' || item.kind === 'handin') return { label: 'Open Lessons', go: () => router.push('/tool/lessons') };
    if (item.kind === 'profile') return { label: 'Change it in your profile', go: () => router.push('/account/public-profile') };
    return null;
  }

  async function move(item: StoredEntry, to: 'online' | 'device') {
    setError(null);
    setStatus(to === 'online' ? `Putting "${item.name}" online…` : `Saving "${item.name}" on this phone…`);
    try {
      if (to === 'online') await moves.moveOnline(item);
      else await moves.moveToDevice(item);
      if (same(open, item)) setOpen(null);
    } catch (e) {
      setError(errorText(e, to === 'online' ? 'Couldn’t put it online.' : 'Couldn’t save it on this phone.'));
    } finally {
      setStatus(null);
    }
  }

  async function send(item: StoredEntry) {
    if (!item.url) return;
    setError(null);
    try {
      await shareFile({ url: item.url, name: item.name, mimeType: item.mimeType });
    } catch (e) {
      setError(errorText(e, 'Couldn’t share the file.'));
    }
  }

  /** Audio and video: a copy goes into the Slow Downer's files and opens there. */
  async function openInSlowDowner(item: StoredEntry) {
    if (!item.url) return;
    setError(null);
    setStatus(`Opening "${item.name}" in the Slow Downer…`);
    try {
      const uri = await localCopy({ url: item.url, name: item.name, mimeType: item.mimeType });
      const entry = await saveLocalFile(uri, item.name, item.size);
      setOpen(null);
      router.push({ pathname: '/tool/slow-downer', params: { open: entry.id } });
    } catch (e) {
      setError(errorText(e, 'Couldn’t open it in the Slow Downer.'));
    } finally {
      setStatus(null);
    }
  }

  async function confirmDelete(item: StoredEntry) {
    setDeleting(null);
    if (same(open, item)) setOpen(null);
    try {
      await remove({ kind: item.kind, id: item.id });
      if (item.device) deleteOnDevice(item.device.key);
      setError(null);
    } catch (e) {
      setError(errorText(e, `Couldn’t delete "${item.name}".`));
    }
  }

  function actions(item: StoredEntry): SheetAction[] {
    const icon = (Icon: typeof PencilIcon, danger = false) => <Icon color={danger ? colors.danger : colors.foreground} size={22} />;
    const where = goTo(item);
    const onTune = item.tuneId ? tuneName(item.tuneId) : undefined;
    const list: (SheetAction | false)[] = [
      !same(open, item) && { key: 'open', label: 'Open', icon: icon(ChevronRightIcon), onPress: () => afterSheet(() => setOpen(item)) },
      item.kind !== 'profile' && { key: 'rename', label: 'Rename', icon: icon(PencilIcon), onPress: () => afterSheet(() => setRenaming(item)) },
      item.kind !== 'profile' && { key: 'share', label: item.sharedId ? 'Shared — manage link' : 'Share a link', icon: icon(LinkIcon), onPress: () => afterSheet(() => setSharing(item)) },
      !!item.url &&
        ['audio', 'video'].includes(fileKind(item.mimeType, item.name)) && {
          key: 'slow',
          label: 'Open in Slow Downer',
          icon: icon(WaveIcon),
          onPress: () => afterSheet(() => void openInSlowDowner(item)),
        },
      !!item.url && { key: 'send', label: 'Send or open in another app', icon: icon(SendIcon), onPress: () => afterSheet(() => void send(item)) },
      // Kept here: put it online (with a plan). Online on the free plan: keep it on this phone
      // instead (frees the online space).
      isMovable(item) && !!item.device && !!item.url && !!storage?.hasPlan && { key: 'online', label: 'Put online', icon: icon(CloudIcon), onPress: () => void move(item, 'online') },
      isMovable(item) && !item.device && !item.keepOnline && !!item.url && !!storage && !storage.hasPlan && {
        key: 'device',
        label: 'Keep on this phone only',
        icon: icon(PhoneIcon),
        onPress: () => void move(item, 'device'),
      },
      item.kind === 'file' && { key: 'tune', label: item.tuneId ? 'Move to another tune' : 'Attach to a tune', icon: icon(MusicNoteIcon), onPress: () => afterSheet(() => setLinking(item)) },
      item.kind === 'file' && !!item.tuneId && {
        key: 'detach',
        label: `Detach from ${onTune ?? 'its tune'}`,
        icon: icon(UnlinkIcon),
        onPress: () => void update({ id: item.id as Id<'files'>, tuneId: null }).catch((e) => setError(errorText(e, 'Couldn’t detach it.'))),
      },
      !!where && {
        key: 'go',
        label: where.label,
        icon: icon(ChevronRightIcon),
        onPress: () => {
          setOpen(null);
          where.go();
        },
      },
      { key: 'delete', label: 'Delete', icon: icon(TrashIcon, true), danger: true, onPress: () => afterSheet(() => setDeleting(item)) },
    ];
    return list.filter((a): a is SheetAction => !!a);
  }

  const elements = (
    <>
      <FileViewer file={open ? viewerFileOf(open) : null} onClose={() => setOpen(null)} onMore={open ? () => setMenu(open) : undefined} />
      <ActionSheet visible={!!menu} title={menu?.name} subtitle={menu ? fileDetail(menu) : undefined} actions={menu ? actions(menu) : []} onClose={() => setMenu(null)} />
      <NameDialog
        visible={!!renaming}
        title="Rename"
        initialValue={renaming?.name ?? ''}
        confirmLabel="Rename"
        onSubmit={(name) => {
          if (!renaming) return;
          const clean = name.trim();
          if (!clean) return;
          rename({ kind: renaming.kind, id: renaming.id, name: clean }).catch((e) => setError(errorText(e, 'Couldn’t rename it.')));
          if (same(open, renaming)) setOpen({ ...renaming, name: clean });
        }}
        onClose={() => setRenaming(null)}
      />
      <TuneSelectModal
        visible={!!linking}
        title={linking?.tuneId ? 'Move to another tune' : 'Attach to a tune'}
        selectedId={linking?.tuneId}
        onPick={(tuneId) => {
          if (linking) {
            update({ id: linking.id as Id<'files'>, tuneId })
              .then(() => setNotice(`Attached “${linking.name}” to ${tuneName(tuneId) ?? 'the tune'}.`))
              .catch((e) => setError(errorText(e, 'Couldn’t attach it.')));
            if (same(open, linking)) setOpen({ ...linking, tuneId });
          }
          setLinking(null);
        }}
        onClose={() => setLinking(null)}
      />
      <ConfirmDialog
        visible={!!deleting}
        title={deleting ? `Delete “${deleting.name}”?` : ''}
        message={deleting ? deleteMessage(deleting, deleting.tuneId ? tuneName(deleting.tuneId) : undefined) : ''}
        confirmLabel="Delete"
        onConfirm={() => deleting && void confirmDelete(deleting)}
        onCancel={() => setDeleting(null)}
      />
      <FileShareSheet item={sharing} onClose={() => setSharing(null)} />
    </>
  );

  return { openFile: setOpen, openMenu: setMenu, elements, status, error, notice, clearError: () => setError(null) };
}

/** Where an item's data is, beside its name: this phone, another device (it won't open here), or
    online — shown for online items only on the free plan, where new things stay on devices. */
export function PlaceBadge({ item, paid }: { item: StoredEntry; paid: boolean }) {
  const { colors, derived } = useAppTheme();
  let Icon: typeof CloudIcon | null = null;
  let label = '';
  if (item.device) {
    Icon = PhoneIcon;
    label = item.url ? 'This phone' : item.device.label;
  } else if (!paid && isMovable(item) && !item.keepOnline && !item.sharedId) {
    Icon = CloudIcon;
    label = 'Online';
  }
  if (!Icon) return null;
  return (
    <View className="flex-row items-center gap-1 rounded-md px-1.5 py-0.5" style={{ backgroundColor: derived.fill, maxWidth: 170 }}>
      <Icon color={colors.muted} size={12} />
      <Text numberOfLines={1} className="font-ui-semibold text-[11px] font-semibold" style={{ color: colors.muted, flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  );
}

/** One stored item in a list: its type, name (with a Shared and a where-it-is badge), a detail
    line, and ⋮. Tapping it opens it. */
export function FileRow({
  item,
  detail,
  tune,
  paid,
  onOpen,
  onMenu,
  right,
}: {
  item: StoredEntry;
  detail: string;
  /** The tune it's on, on a line of its own (it was cut off at the end of the detail line). */
  tune?: string;
  paid: boolean;
  onOpen: () => void;
  onMenu: () => void;
  right?: ReactNode;
}) {
  const { colors } = useAppTheme();
  const elsewhere = !!item.device && !item.url;
  return (
    <View className="flex-row items-center overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
      <Pressable
        onPress={onOpen}
        onLongPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name}`}
        android_ripple={{ color: colors['surface-hover'] }}
        className="min-h-[60px] flex-1 flex-row items-center gap-3 py-2.5 pl-3"
      >
        <View style={{ opacity: elsewhere ? 0.55 : 1 }}>
          <FileTypeIcon kind={fileKind(item.mimeType, item.name)} recording={item.kind === 'recording'} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
            {item.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {item.sharedId ? (
              <View className="flex-row items-center gap-1 rounded-md px-1.5 py-0.5" style={{ backgroundColor: colors.background }}>
                <LinkIcon color={colors.muted} size={12} />
                <Text className="font-ui-semibold text-[11px] font-semibold" style={{ color: colors.muted }}>
                  Shared
                </Text>
              </View>
            ) : null}
            <PlaceBadge item={item} paid={paid} />
            <Text numberOfLines={1} className="font-ui flex-1 text-xs" style={{ color: colors.muted }}>
              {detail}
            </Text>
          </View>
          {tune ? (
            <View className="flex-row items-center gap-1">
              <MusicNoteIcon color={colors.muted} size={12} />
              <Text numberOfLines={1} className="font-ui flex-1 text-xs" style={{ color: colors.muted }}>
                {tune}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      {right}
      <Pressable
        onPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${item.name}`}
        android_ripple={{ color: colors['surface-hover'] }}
        className="h-[60px] w-12 items-center justify-center"
      >
        <DotsVerticalIcon color={colors.muted} size={22} />
      </Pressable>
    </View>
  );
}
