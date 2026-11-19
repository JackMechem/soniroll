import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CloseIcon } from '@/components/icons';
import { AudioIcon, FileIcon, ImageIcon, OpenIcon, VideoIcon } from '@/components/lessons/parts';
import { PlayButton, SeekBar } from '@/components/recordings/RecordingParts';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Files in Lessons: picking one from the phone, uploading it to Convex storage, and showing one —
 * pictures inline (tap for full screen), audio with a player, anything else (PDFs, video, documents)
 * opened in the browser. The website previews PDFs in the page; the phone hands them to the
 * browser, which shows or downloads them.
 */

export type PickedFile = { uri: string; name: string; type: string; size: number };

/** Opens the system file picker. `types` are MIME patterns ("application/pdf", "image/*"); an
    empty list takes anything. Empty when cancelled. */
export async function pickFiles(types: string[], multiple = false): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: types.length ? types : '*/*', copyToCacheDirectory: true, multiple });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? guessType(a.name), size: a.size ?? 0 }));
}

/** A MIME type from a file name, for pickers that don't say. */
function guessType(name: string) {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    txt: 'text/plain',
    mid: 'audio/midi',
    midi: 'audio/midi',
  };
  return map[ext] ?? '';
}

/** Uploads a picked file to Convex storage (the URL from `generate`), streamed from disk — reading
    it through `fetch(file://…).blob()` first arrived empty on Android. Returns the storage id. */
export async function uploadFile(file: PickedFile, generate: () => Promise<string>): Promise<Id<'_storage'>> {
  const url = await generate();
  const res = await uploadAsync(url, file.uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`${file.name} didn't upload — try again.`);
  return (JSON.parse(res.body) as { storageId: Id<'_storage'> }).storageId;
}

export function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function openUrl(url: string) {
  void openBrowserAsync(url).catch(() => {});
}

/** A file a teacher gave or a student handed in. */
export function FileView({ url, name, type }: { url: string; name: string; type: string }) {
  if (type.startsWith('image/')) return <ImageFile url={url} name={name} />;
  if (type.startsWith('audio/')) return <AudioFile url={url} name={name} />;
  const Icon = type.startsWith('video/') ? VideoIcon : FileIcon;
  return <FileRow Icon={Icon} name={name} onOpen={() => openUrl(url)} />;
}

function FileRow({ Icon, name, onOpen }: { Icon: typeof FileIcon; name: string; onOpen: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-11 flex-row items-center gap-2.5 overflow-hidden rounded-lg px-3 py-2"
      style={{ backgroundColor: colors.background }}
    >
      <Icon color={colors.muted} size={18} />
      <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
        {name}
      </Text>
      <View className="flex-row items-center gap-1">
        <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
          Open
        </Text>
        <OpenIcon color={colors.accent} size={14} />
      </View>
    </Pressable>
  );
}

function ImageFile({ url, name }: { url: string; name: string }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel={`${name}, full screen`} className="overflow-hidden rounded-lg" style={{ backgroundColor: colors.background }}>
        <Image source={{ uri: url }} style={{ width: '100%', height: 260 }} contentFit="contain" />
      </Pressable>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View className="flex-1" style={{ backgroundColor: '#000000' }}>
          <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
            <View className="flex-row items-center gap-2 px-4 py-2">
              <ImageIcon color="#ffffff" size={18} />
              <Text numberOfLines={1} className="font-ui-semibold flex-1 text-[15px] font-semibold" style={{ color: '#ffffff' }}>
                {name}
              </Text>
              <Pressable onPress={() => setOpen(false)} accessibilityLabel="Close" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <CloseIcon color="#ffffff" size={20} />
              </Pressable>
            </View>
            <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

/** An audio file: a play button that makes its player only once it's first tapped (a lesson can
    hold many files). */
function AudioFile({ url, name }: { url: string; name: string }) {
  const { colors } = useAppTheme();
  const [started, setStarted] = useState(false);
  return (
    <View className="gap-1.5 rounded-lg px-3 py-2.5" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center gap-2">
        <AudioIcon color={colors.muted} size={18} />
        <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
          {name}
        </Text>
      </View>
      {started ? <AudioPlayer url={url} /> : <PlayButton playing={false} onPress={() => setStarted(true)} size={36} />}
    </View>
  );
}

function AudioPlayer({ url }: { url: string }) {
  const player = useAudioPlayer({ uri: url }, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  // It was tapped to play: start as soon as it has loaded.
  const begun = useRef(false);
  useEffect(() => {
    if (status.isLoaded && !begun.current) {
      begun.current = true;
      player.play();
    }
  }, [status.isLoaded, player]);
  return (
    <View className="flex-row items-center gap-3">
      <PlayButton
        playing={status.playing}
        size={36}
        onPress={() => {
          if (status.playing) player.pause();
          else {
            if (status.duration > 0 && status.currentTime >= status.duration - 0.05) void player.seekTo(0);
            player.play();
          }
        }}
      />
      <View className="flex-1">
        <SeekBar currentTime={status.currentTime} duration={status.duration} onSeek={(s) => void player.seekTo(s)} />
      </View>
    </View>
  );
}
