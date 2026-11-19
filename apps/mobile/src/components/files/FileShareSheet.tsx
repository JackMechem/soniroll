import { fileKind, formatBytes } from '@jam-practice/core/files';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';

import { FileTypeIcon } from '@/components/files/icons';
import { CheckIcon, LinkIcon, ShareIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ToolSheet } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import { type StoredEntry, errorText, filesApi, sharedFileUrl, useStorageMoves, useStoragePlan } from '@/lib/files';
import { useAppTheme } from '@/theme/ThemeProvider';

/** What the person you send it to sees, by where the file came from. */
const NOTE: Partial<Record<StoredEntry['kind'], string>> = {
  lesson: 'Only this file is shared, not the lesson it’s in.',
  handin: 'Only this file is shared, not the rest of your hand-in.',
  song: 'Only the song is shared, not your takes or the tune.',
};

/**
 * Share one file by link (the website's `FileShareDialog`, `soniroll.com/file/<id>`): make the
 * link, send or copy it, or stop sharing. Anyone with the link can open and download the file, no
 * account needed. A file kept on this phone goes online first (a link can't reach a phone); one
 * kept on another device has to be shared from there.
 */
export function FileShareSheet({ item, onClose }: { item: StoredEntry | null; onClose: () => void }) {
  const { colors, derived } = useAppTheme();
  const shareId = useQuery(filesApi.itemShare, item ? { kind: item.kind, id: item.id } : 'skip');
  const share = useMutation(filesApi.shareItem);
  const unshare = useMutation(filesApi.unshareItem);
  const storage = useStoragePlan();
  const { moveOnline } = useStorageMoves(storage?.userId);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDevice = !!item?.device;
  const elsewhere = onDevice && !item?.url;

  function close() {
    setStatus(null);
    setError(null);
    onClose();
  }

  async function send(id: string) {
    if (!item) return;
    try {
      await Share.share({ message: sharedFileUrl(id), url: sharedFileUrl(id), title: item.name });
    } catch {
      // closed without sending
    }
  }

  async function create() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      // A file kept on this phone goes online first; the link comes with it.
      const id = (onDevice ? await moveOnline(item, 'share') : null) ?? (await share({ kind: item.kind, id: item.id }));
      await send(id);
    } catch (e) {
      setError(errorText(e, 'Couldn’t share the file.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolSheet visible={!!item} onClose={close} title="Share a file">
      {item ? (
        <>
          <Text className="font-ui -mt-2 text-sm leading-5" style={{ color: colors.muted }}>
            Anyone with the link can open and download it, no account needed.
          </Text>
          <View className="flex-row items-center gap-3 rounded-lg p-3" style={{ backgroundColor: derived.fill }}>
            <FileTypeIcon kind={fileKind(item.mimeType, item.name)} recording={item.kind === 'recording'} size={32} />
            <View className="flex-1">
              <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {item.name}
              </Text>
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                {formatBytes(item.size)}
              </Text>
            </View>
          </View>
          {NOTE[item.kind] ? (
            <Text className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
              {NOTE[item.kind]}
            </Text>
          ) : null}
          {shareId === null && onDevice ? (
            <Text className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
              {elsewhere
                ? `It’s kept on ${item.device!.label}. Share it from there.`
                : storage?.hasPlan
                  ? 'It’s kept on this phone. Making a link puts it online first.'
                  : `It’s kept on this phone. Making a link puts it online first, using ${formatBytes(item.size)} of your ${formatBytes(storage?.quota ?? 0)} of online space for sharing.`}
            </Text>
          ) : null}

          {shareId === undefined ? (
            <LoadingSpinner />
          ) : shareId ? (
            <>
              <View className="min-h-11 flex-row items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: colors.background }}>
                <LinkIcon color={colors.muted} size={16} />
                <Text selectable numberOfLines={2} className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
                  {sharedFileUrl(shareId)}
                </Text>
              </View>
              <View className="flex-row gap-2">
                <Button label="Send link" Icon={ShareIcon} style={{ flex: 1 }} onPress={() => void send(shareId)} />
                <Button
                  label="Copy"
                  kind="secondary"
                  style={{ flex: 1 }}
                  onPress={() => {
                    void Clipboard.setStringAsync(sharedFileUrl(shareId)).then(() => setStatus('Link copied'));
                  }}
                />
              </View>
              <Button
                label="Stop sharing"
                kind="secondary"
                onPress={() => {
                  setStatus(null);
                  unshare({ kind: item.kind, id: item.id }).catch((e) => setError(errorText(e, 'Couldn’t stop sharing it.')));
                }}
              />
            </>
          ) : (
            <Button label={busy ? 'Making the link…' : 'Make a link'} Icon={LinkIcon} disabled={busy || elsewhere} onPress={() => void create()} />
          )}
          {status ? (
            <View className="flex-row items-center gap-1.5">
              <CheckIcon color={colors.accent} size={16} />
              <Text className="font-ui text-sm" style={{ color: colors.accent }}>
                {status}
              </Text>
            </View>
          ) : null}
          {error ? (
            <Text className="font-ui text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
        </>
      ) : null}
    </ToolSheet>
  );
}
