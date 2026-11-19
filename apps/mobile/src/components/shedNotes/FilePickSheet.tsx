import { api } from '@jam-practice/convex/_generated/api';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MicrophoneIcon } from '@/components/icons';
import { formatBytes } from '@/components/shedNotes/NoteEmbeds';
import { FileIcon, ImageIcon, PdfIcon } from '@/components/shedNotes/icons';
import { ToolSheet } from '@/components/tool/SettingChip';
import { SearchField } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

/** The ref a stored item goes into a note by: an upload's id, or `<kind>/<id>` for the rest (a
    recording, a tune's song, a lesson file…) — the website's `refOf`. */
const refOf = (item: { kind: string; id: string }) => (item.kind === 'file' ? item.id : `${item.kind}/${item.id}`);

/**
 * Pick something from your Files to put in a note (the website's file picker): everything on the
 * Files page but profile pictures, newest first, searchable. Uploading a new file from the phone
 * isn't here yet — files are uploaded on the website.
 */
export function FilePickSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (name: string, ref: string) => void }) {
  const { colors, derived } = useAppTheme();
  const storage = useQuery(api.files.storage, visible ? {} : 'skip');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const items = (storage?.items ?? [])
    .filter((i) => i.kind !== 'profile' && (!query || i.name.toLowerCase().includes(query)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60);

  return (
    <ToolSheet visible={visible} onClose={onClose} title="Put a file in the note">
      <SearchField value={q} onChangeText={setQ} placeholder="Find a file" />
      {storage === undefined ? (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          Loading…
        </Text>
      ) : items.length === 0 ? (
        <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
          {query ? 'No files match.' : 'No files yet. Upload pictures, PDFs and recordings on the website (Files), then put them in notes here.'}
        </Text>
      ) : (
        <View className="gap-1.5">
          {items.map((item) => {
            const lower = item.name.toLowerCase();
            const Icon = item.mimeType.startsWith('image/') ? ImageIcon : item.mimeType === 'application/pdf' || lower.endsWith('.pdf') ? PdfIcon : item.mimeType.startsWith('audio/') || item.kind === 'recording' ? MicrophoneIcon : FileIcon;
            return (
              <Pressable
                key={`${item.kind}:${item.id}`}
                onPress={() => {
                  onClose();
                  onPick(item.name, refOf(item));
                }}
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
                    {item.device ? ' · on a device' : ''}
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
