import { api } from '@jam-practice/convex/_generated/api';
import { cleanScore } from '@jam-practice/core/bassTranscription';
import { fileKind, formatBytes } from '@jam-practice/core/files';
import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useFileViewer } from '@/components/files/FileViewer';
import { MicrophoneIcon, NAV_LINK_ICONS } from '@/components/icons';
import Score from '@/components/notation/Score';
import { MONO } from '@/components/shedNotes/NoteMarkdown';
import { FileIcon, ImageIcon, OpenIcon, PdfIcon } from '@/components/shedNotes/icons';
import { useDeviceUrl } from '@/lib/deviceFiles';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Someone else's scores and files are readable through a note shared with you (`noteId`), or
    files through a lesson's notes (`lessonId`). */
export type EmbedContext = { noteId?: string; lessonId?: string };

const ScoreIcon = NAV_LINK_ICONS['/score-writer'];

/** A ```score block: its title, Edit (the notation editor, for your own scores) and the music,
    read-only. */
export function ScoreBlock({ id, context, onEdit }: { id: string; context?: EmbedContext; onEdit?: (id: string) => void }) {
  const { colors, derived } = useAppTheme();
  const row = useQuery(api.scores.get, id ? { id, ...(context ?? {}) } : 'skip');
  const data = row?.data;
  const score = useMemo(() => (data ? cleanScore(data) : row === null ? null : undefined), [data, row]);
  const canEdit = !!row && !row.readOnly && !!onEdit;
  return (
    <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: derived.fill }}>
      <View className="flex-row items-center gap-2">
        {ScoreIcon ? <ScoreIcon color={colors.muted} size={16} /> : null}
        <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
          {score ? score.title : score === null ? 'Score not found' : 'Loading…'}
        </Text>
        {score && canEdit ? (
          <Pressable
            onPress={() => onEdit?.(id)}
            accessibilityRole="button"
            android_ripple={{ color: colors['surface-hover'] }}
            className="h-8 justify-center overflow-hidden rounded-lg px-3"
            style={{ backgroundColor: colors.surface }}
          >
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
              Edit
            </Text>
          </Pressable>
        ) : null}
      </View>
      {score === null ? (
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          This score was deleted from Score Writer.
        </Text>
      ) : score ? (
        <Score transcription={score} />
      ) : (
        <View style={{ height: 120 }} />
      )}
    </View>
  );
}

/** An older ```abc block. The phone has no ABC renderer (abcjs needs a web page), so the source
    shows as text and the website draws it. */
export function AbcBlock({ abc }: { abc: string }) {
  const { colors, derived } = useAppTheme();
  const title = /^T:\s*(.+)$/m.exec(abc)?.[1]?.trim();
  return (
    <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: derived.fill }}>
      <View className="flex-row items-center gap-2">
        {ScoreIcon ? <ScoreIcon color={colors.muted} size={16} /> : null}
        <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
          {title || 'Notation (ABC)'}
        </Text>
      </View>
      <Text className="font-ui text-xs" style={{ fontFamily: MONO, color: colors.muted, lineHeight: 18 }}>
        {abc.trim()}
      </Text>
      <Text className="font-ui text-xs" style={{ color: colors.muted }}>
        Older notation, written as ABC. It&apos;s drawn on the website; the phone shows its text.
      </Text>
    </View>
  );
}

/**
 * A file in a note (`![name](file:<ref>)`, or a picture from the web): a picture as itself, anything
 * else as a card; tapping either opens it full screen in the file viewer (PDFs, pictures, audio,
 * video, text). A file kept on a device (a free account's) opens only there, as on the website —
 * on the phone that saved it, it opens from the phone.
 */
export function FileBlock({ fileRef, name, width, context }: { fileRef: string; name: string; width?: number; context?: EmbedContext }) {
  const { colors, derived } = useAppTheme();
  const web = fileRef.startsWith('https://');
  const row = useQuery(api.files.embed, web ? 'skip' : { ref: fileRef, ...(context ?? {}) });
  const local = useDeviceUrl(row);
  const [ratio, setRatio] = useState<number | null>(null);
  const { open, viewer } = useFileViewer();
  const file = web ? { name: name || 'Picture', mimeType: 'image/*', size: 0, url: fileRef as string | null, device: null } : local;

  if (file === undefined) return <View className="h-24 rounded-xl" style={{ backgroundColor: derived.fill }} />;
  const url = file?.url ?? null;
  if (!file || !url) {
    const onDevice = !!file?.device;
    return (
      <View className="flex-row items-center gap-3 rounded-xl p-3" style={{ backgroundColor: derived.fill }}>
        <FileIcon color={colors.muted} size={22} />
        <Text className="font-ui flex-1 text-sm" style={{ color: colors.muted }}>
          <Text className="font-ui-semibold font-semibold" style={{ color: colors.foreground }}>
            {file?.name || name || 'A file'}
          </Text>
          {onDevice ? ` is kept on ${file?.device?.label ?? 'the device it was saved on'} — open it there.` : ' isn’t available — it was deleted, or it isn’t shared with you.'}
        </Text>
      </View>
    );
  }
  const kind = fileKind(file.mimeType, file.name);
  const show = () => open({ name: file.name, mimeType: file.mimeType, size: file.size || undefined, url, device: file.device });
  if (kind === 'image') {
    return (
      <>
        <Pressable onPress={show} accessibilityRole="imagebutton" accessibilityLabel={`${name || file.name}, tap for full size`} style={{ maxWidth: width ?? '100%', width: '100%' }}>
          <Image
            source={{ uri: url }}
            contentFit="contain"
            onLoad={(e) => {
              const { width: w, height: h } = e.source;
              if (w && h) setRatio(w / h);
            }}
            style={{ width: '100%', aspectRatio: ratio ?? 4 / 3, maxHeight: 520, borderRadius: 10, backgroundColor: derived.fill }}
            accessibilityLabel={name || file.name}
          />
        </Pressable>
        {viewer}
      </>
    );
  }
  const Icon = kind === 'pdf' ? PdfIcon : kind === 'audio' ? MicrophoneIcon : kind === 'video' ? ImageIcon : FileIcon;
  const action = kind === 'audio' || kind === 'video' ? 'Play' : 'Open';
  return (
    <>
      <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={`${action} ${file.name}`} android_ripple={{ color: colors['surface-hover'] }} className="flex-row items-center gap-3 overflow-hidden rounded-xl p-3" style={{ backgroundColor: derived.fill }}>
        <Icon color={colors.accent} size={24} />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {file.name}
          </Text>
          {file.size ? (
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              {formatBytes(file.size)}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
            {action}
          </Text>
          <OpenIcon color={colors.muted} size={16} />
        </View>
      </Pressable>
      {viewer}
    </>
  );
}
