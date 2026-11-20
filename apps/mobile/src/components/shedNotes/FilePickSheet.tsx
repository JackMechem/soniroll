import { api } from '@jam-practice/convex/_generated/api';
import { formatBytes } from '@jam-practice/core/files';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MicrophoneIcon } from '@/components/icons';
import { FileIcon, ImageIcon, PdfIcon } from '@/components/shedNotes/icons';
import { ToolSheet } from '@/components/tool/SettingChip';
import { SearchField } from '@/components/ui';
import { useDeviceUrls } from '@/lib/deviceFiles';
import { type StoredEntry, errorText, isMovable, useStorageMoves, useStoragePlan } from '@/lib/files';
import { useAppTheme } from '@/theme/ThemeProvider';

/** The ref a stored item goes into a note by: an upload's id, or `<kind>/<id>` for the rest (a
    recording, a tune's song, a lesson file…) — the website's `refOf`. */
const refOf = (item: { kind: string; id: string }) => (item.kind === 'file' ? item.id : `${item.kind}/${item.id}`);

/**
 * Pick something from your Files to put in a note (the website's file picker): everything on the
 * Files page but profile pictures, newest first, searchable (upload new ones in Library → Files).
 * Everyone who can open the note sees what's in it, so a file kept on this phone goes online first
 * and stays online (marked as being in a note), as on the website; one kept on another device has
 * to be added from there.
 */
export function FilePickSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (name: string, ref: string) => void }) {
  const { colors, derived } = useAppTheme();
  const storage = useQuery(api.files.storage, visible ? {} : 'skip');
  const stored = useDeviceUrls(storage?.items);
  const plan = useStoragePlan();
  const { moveOnline } = useStorageMoves(plan?.userId);
  const keepOnline = useMutation(api.files.keepOnline);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const items = (stored ?? [])
    .filter((i) => i.kind !== 'profile' && (!query || i.name.toLowerCase().includes(query)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60);

  async function pick(item: StoredEntry) {
    setError(null);
    try {
      if (isMovable(item)) {
        if (item.device) {
          setBusy(`Putting "${item.name}" online…`);
          await moveOnline(item, 'note');
        }
        await keepOnline({ kind: item.kind, id: item.id });
      }
      onClose();
      onPick(item.name, refOf(item));
    } catch (e) {
      setError(errorText(e, `Couldn’t add "${item.name}".`));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ToolSheet visible={visible} onClose={onClose} title="Put a file in the note">
      <SearchField value={q} onChangeText={setQ} placeholder="Find a file" />
      {busy || error ? (
        <Text className="font-ui text-sm" style={{ color: error ? colors.danger : colors.muted }}>
          {error ?? busy}
        </Text>
      ) : null}
      {storage === undefined ? (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          Loading…
        </Text>
      ) : items.length === 0 ? (
        <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
          {query ? 'No files match.' : 'No files yet. Upload pictures, PDFs and recordings in Library → Files, then put them in notes here.'}
        </Text>
      ) : (
        <View className="gap-1.5">
          {items.map((item) => {
            const lower = item.name.toLowerCase();
            const Icon = item.mimeType.startsWith('image/') ? ImageIcon : item.mimeType === 'application/pdf' || lower.endsWith('.pdf') ? PdfIcon : item.mimeType.startsWith('audio/') || item.kind === 'recording' ? MicrophoneIcon : FileIcon;
            return (
              <Pressable
                key={`${item.kind}:${item.id}`}
                onPress={() => void pick(item)}
                disabled={!!busy}
                android_ripple={{ color: colors['surface-hover'] }}
                className="min-h-[48px] flex-row items-center gap-3 overflow-hidden rounded-lg px-3 py-2"
                style={{ backgroundColor: derived.fill }}
              >
                <Icon color={colors.muted} size={20} />
                <View className="flex-1">
                  <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                    {item.name}
                  </Text>
                  <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                    {formatBytes(item.size)}
                    {item.device ? (item.url ? ' · on this phone — goes online when added' : ` · on ${item.device.label}`) : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ToolSheet>
  );
}
