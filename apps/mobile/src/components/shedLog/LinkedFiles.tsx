import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { fileDetail, type StoredKind } from '@jam-practice/core/files';
import { fileTagKey } from '@jam-practice/core/fileFolders';
import { type Attachment, type FileAttachment, isFileAttachment } from '@jam-practice/core/practiceLog';
import { useQuery } from 'convex/react';
import { Text, View } from 'react-native';

import { FileOpenRow, useFileViewer } from '@/components/files/FileViewer';
import { FolderIcon, TagIcon } from '@/components/icons';
import { useDeviceUrls } from '@/lib/deviceFiles';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A routine's or task's Files on the phone (the website's `LinkedFiles` in
 * `components/practicelog/FileAttachments.tsx`), read-only: the files attached one by one, then each
 * linked Files folder and tag with what's in it now. Tapping a file opens it in the phone's viewer
 * (PDFs page by page). Adding and taking off is on the website for now.
 */

/** A group of file attachments: the screen's own, one day's, or (on a routine) each task's. */
export type FileGroup = { key: string; title?: string; attachments: FileAttachment[] };

export function fileAttachmentsOf(list: Attachment[] | undefined): FileAttachment[] {
  return (list ?? []).filter(isFileAttachment);
}

export function LinkedFiles({ groups }: { groups: FileGroup[] }) {
  const { colors } = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const viewer = useFileViewer();
  const all = groups.flatMap((g) => g.attachments);
  const args = {
    items: all.flatMap((a) => (a.kind === 'file' ? [{ kind: a.itemKind as StoredKind, id: a.id }] : [])),
    folders: [...new Set(all.flatMap((a) => (a.kind === 'folder' ? [a.path] : [])))],
    tags: [...new Set(all.flatMap((a) => (a.kind === 'fileTag' ? [a.tag] : [])))],
  };
  const linked = useQuery(api.fileFolders.linked, isAuthenticated && all.length ? args : 'skip');
  // Files kept on this phone (no storage plan) play from here: their address on the device.
  const items = useDeviceUrls(linked?.items);
  const folderItems = useDeviceUrls(linked?.folders.flatMap((f) => f.items));
  const tagItems = useDeviceUrls(linked?.tags.flatMap((t) => t.items));
  if (!all.length) return null;

  type Item = NonNullable<typeof items>[number];
  const withUrl = (item: Item) => [...(items ?? []), ...(folderItems ?? []), ...(tagItems ?? [])].find((i) => i.kind === item.kind && i.id === item.id) ?? item;
  const row = (item: Item, detail: string) => {
    const f = withUrl(item);
    const file = { name: f.name, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt, url: f.url, device: f.device, recording: f.kind === 'recording' };
    return <FileOpenRow key={`${f.kind}:${f.id}`} file={file} detail={detail} onOpen={() => viewer.open(file)} />;
  };
  const muted = (text: string) => (
    <Text className="font-ui px-1 text-xs" style={{ color: colors.muted }}>
      {text}
    </Text>
  );

  return (
    <View className="gap-2">
      {linked === undefined ? <View className="h-14 rounded-xl" style={{ backgroundColor: colors.surface }} /> : null}
      {linked
        ? groups
            .filter((g) => g.attachments.length)
            .map((g) => (
              <View key={g.key} className="gap-2">
                {g.title ? (
                  <Text numberOfLines={1} className="font-ui-semibold px-1 pt-1 text-xs font-semibold" style={{ color: colors.muted }}>
                    {g.title}
                  </Text>
                ) : null}
                {g.attachments.map((a) => {
                  if (a.kind === 'file') {
                    const item = linked.items.find((i) => i.kind === a.itemKind && i.id === a.id);
                    return item ? row(item, fileDetail(item)) : <View key={`gone:${a.id}`}>{muted(`${a.label} isn’t in your Files any more.`)}</View>;
                  }
                  const list = a.kind === 'folder' ? linked.folders.find((f) => f.path === a.path)?.items : linked.tags.find((t) => fileTagKey(t.tag) === fileTagKey(a.tag))?.items;
                  const Icon = a.kind === 'folder' ? FolderIcon : TagIcon;
                  const name = a.kind === 'folder' ? a.path : a.tag;
                  return (
                    <View key={`${a.kind}:${name}`} className="gap-2">
                      <View className="flex-row items-center gap-2 px-1 pt-1">
                        <Icon color={colors.muted} size={16} />
                        <Text numberOfLines={1} className="font-ui-semibold shrink text-sm font-semibold" style={{ color: colors.foreground }}>
                          {name}
                        </Text>
                        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                          {a.kind === 'folder' ? 'Folder' : 'Tag'}
                          {list ? ` · ${list.length}` : ''}
                        </Text>
                      </View>
                      {list && list.length === 0 ? muted(a.kind === 'folder' ? 'Nothing in this folder yet.' : 'No files with this tag yet.') : null}
                      {(list ?? []).map((item) => row(item, fileDetail(item, item.folder && item.folder !== name ? `in ${item.folder}` : null)))}
                    </View>
                  );
                })}
              </View>
            ))
        : null}
      {viewer.viewer}
    </View>
  );
}
