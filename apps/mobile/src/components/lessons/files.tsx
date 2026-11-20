import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { fileKind } from '@jam-practice/core/files';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useFileViewer } from '@/components/files/FileViewer';
import { AudioIcon, FileIcon, OpenIcon, VideoIcon } from '@/components/lessons/parts';
import { PlayButton, SeekBar } from '@/components/recordings/RecordingParts';
import { type PickedFile, pickFiles as pickPhoneFiles, uploadLocalFile } from '@/lib/files';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Files in Lessons: picking one from the phone, uploading it to Convex storage, and showing one —
 * pictures inline, audio with a player, anything else as a row — each opening full screen in the
 * app's file viewer (`components/files/FileViewer.tsx`: PDFs, pictures, video, text…). Lesson files
 * and hand-ins are always online (the other person sees them).
 */

export type { PickedFile };

/** Opens the system file picker. `types` are MIME patterns ("application/pdf", "image/*"); an
    empty list takes anything. Empty when cancelled. */
export function pickFiles(types: string[], multiple = false): Promise<PickedFile[]> {
  return pickPhoneFiles(types, multiple);
}

/** Uploads a picked file to Convex storage (the URL from `generate`), streamed from disk. Returns
    the storage id. */
export function uploadFile(file: PickedFile, generate: () => Promise<string>): Promise<Id<'_storage'>> {
  return uploadLocalFile(file.uri, file.type, file.name, generate);
}

export function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function openUrl(url: string) {
  void openBrowserAsync(url).catch(() => {});
}

/** A file a teacher gave or a student handed in: a picture inline, audio with a player, anything
    else as a row; tapping opens it full screen in the viewer (PDFs, pictures, video, text…). */
export function FileView({ url, name, type }: { url: string; name: string; type: string }) {
  const kind = fileKind(type, name);
  if (kind === 'image') return <ImageFile url={url} name={name} type={type} />;
  if (kind === 'audio') return <AudioFile url={url} name={name} />;
  return <FileRow url={url} name={name} type={type} />;
}

function FileRow({ url, name, type }: { url: string; name: string; type: string }) {
  const { colors } = useAppTheme();
  const { open, viewer } = useFileViewer();
  const Icon = fileKind(type, name) === 'video' ? VideoIcon : FileIcon;
  return (
    <>
      <Pressable
        onPress={() => open({ url, name, mimeType: type })}
        accessibilityRole="button"
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
      {viewer}
    </>
  );
}

function ImageFile({ url, name, type }: { url: string; name: string; type: string }) {
  const { colors } = useAppTheme();
  const { open, viewer } = useFileViewer();
  return (
    <>
      <Pressable onPress={() => open({ url, name, mimeType: type })} accessibilityRole="imagebutton" accessibilityLabel={`${name}, full screen`} className="overflow-hidden rounded-lg" style={{ backgroundColor: colors.background }}>
        <Image source={{ uri: url }} style={{ width: '100%', height: 260 }} contentFit="contain" />
      </Pressable>
      {viewer}
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
