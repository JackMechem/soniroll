import { type FileKind, fileDetail, fileKind, formatBytes, FILE_KIND_LABEL, isTextFile } from '@jam-practice/core/files';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { FullScreenModal } from '@/components/FullScreenModal';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import PdfRendererView from 'react-native-pdf-renderer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FileTypeIcon, OpenElsewhereIcon, PhoneIcon, SendIcon } from '@/components/files/icons';
import { CloseIcon, DotsVerticalIcon, Forward5Icon, Rewind5Icon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PlayButton, SeekBar } from '@/components/recordings/RecordingParts';
import { Button, IconButton } from '@/components/ui';
import { errorText, localCopy, shareFile } from '@/lib/files';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The phone's media viewer: a file opened full screen, the native sibling of the website's
 * `FileViewer` / `FilePreviewDialog`. PDFs page by page (scroll, pinch to zoom; drawn natively from
 * a downloaded copy, so they open offline once seen), pictures (pinch, pan, double-tap to zoom),
 * audio (play, seek, skip 5 s), video (the system player: seek, full screen), text, Markdown and
 * MusicXML as text, and a card for anything else with "Open in another app" (the share sheet).
 * A file kept on another device says where it is. The top bar has Close, Send (the file itself,
 * through the share sheet) and, for your own files, ⋮ (`onMore`: rename, share a link, delete…).
 */

export type ViewerFile = {
  name: string;
  mimeType: string;
  size?: number;
  createdAt?: number;
  /** Online (`https:`), on this phone (`file:`), or null when it's elsewhere / gone. */
  url: string | null;
  /** Kept on a device; with `url` null it's on another one. */
  device?: { label: string } | null;
  /** A soniroll recording (the mic icon). */
  recording?: boolean;
};

export function FileViewer({ file, onClose, onMore }: { file: ViewerFile | null; onClose: () => void; onMore?: () => void }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (!file) return null;
  const kind = fileKind(file.mimeType, file.name);
  const url = file.url;
  const detail = file.size != null && file.createdAt != null ? fileDetail({ ...file, size: file.size, createdAt: file.createdAt }) : FILE_KIND_LABEL[kind];
  const close = () => {
    setSendError(null);
    onClose();
  };

  async function send() {
    if (!url || !file) return;
    setSendError(null);
    setSending(true);
    try {
      await shareFile({ url, name: file.name, mimeType: file.mimeType });
    } catch (e) {
      setSendError(errorText(e, "Couldn't share the file."));
    } finally {
      setSending(false);
    }
  }

  return (
    <FullScreenModal visible animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      {/* A Modal is outside the app's own gesture root; zooming in here needs one of its own. */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-row items-center gap-2 px-3 pb-2" style={{ paddingTop: insets.top + 8, backgroundColor: colors.surface }}>
          <IconButton Icon={CloseIcon} label="Close" onPress={close} />
          <View className="flex-1 px-1">
            <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
              {file.name}
            </Text>
            <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
              {detail}
            </Text>
          </View>
          {url ? (sending ? <View className="h-10 w-10 items-center justify-center"><LoadingSpinner size="sm" /></View> : <IconButton Icon={SendIcon} label="Send or open in another app" onPress={() => void send()} />) : null}
          {onMore ? <IconButton Icon={DotsVerticalIcon} label={`Options for ${file.name}`} onPress={onMore} /> : null}
        </View>
        {sendError ? (
          <Text className="font-ui px-4 py-2 text-sm" style={{ color: colors.danger, backgroundColor: colors.surface }}>
            {sendError}
          </Text>
        ) : null}
        <View className="flex-1" style={{ paddingBottom: kind === 'pdf' || kind === 'image' || kind === 'video' ? 0 : insets.bottom }}>
          <ViewerBody key={url ?? file.name} file={file} kind={kind} bottomInset={insets.bottom} onSend={() => void send()} />
        </View>
      </GestureHandlerRootView>
    </FullScreenModal>
  );
}

function ViewerBody({ file, kind, bottomInset, onSend }: { file: ViewerFile; kind: FileKind; bottomInset: number; onSend: () => void }) {
  const url = file.url;
  if (!url) return <Elsewhere file={file} kind={kind} />;
  if (kind === 'pdf') return <PdfBody file={{ ...file, url }} bottomInset={bottomInset} onSend={onSend} />;
  if (kind === 'image') return <ZoomableImage url={url} name={file.name} />;
  if (kind === 'audio') return <AudioBody url={url} name={file.name} recording={file.recording} />;
  if (kind === 'video') return <VideoBody url={url} bottomInset={bottomInset} />;
  if (isTextFile(file.mimeType, file.name)) return <TextBody file={{ ...file, url }} onSend={onSend} />;
  return <Fallback file={file} kind={kind} onSend={onSend} />;
}

// ---------------------------------------------------------------- the cards

function CenterCard({ children }: { children: ReactNode }) {
  return <View className="flex-1 items-center justify-center gap-4 px-8">{children}</View>;
}

function Elsewhere({ file, kind }: { file: ViewerFile; kind: FileKind }) {
  const { colors } = useAppTheme();
  return (
    <CenterCard>
      {file.device ? <PhoneIcon color={colors.muted} size={40} /> : <FileTypeIcon kind={kind} recording={file.recording} size={56} />}
      <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
        {file.device
          ? `This file is kept on ${file.device.label}, so open it there. A storage plan keeps files on all your devices.`
          : 'This file isn’t available — it was deleted, or it isn’t shared with you.'}
      </Text>
    </CenterCard>
  );
}

function Fallback({ file, kind, onSend, message }: { file: ViewerFile; kind: FileKind; onSend: () => void; message?: string }) {
  const { colors } = useAppTheme();
  return (
    <CenterCard>
      <FileTypeIcon kind={kind} size={64} />
      <View className="items-center gap-1">
        <Text className="font-ui-semibold text-center text-base font-semibold" style={{ color: colors.foreground }}>
          {file.name}
        </Text>
        <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
          {[FILE_KIND_LABEL[kind], file.size ? formatBytes(file.size) : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
        {message ?? 'This kind of file can’t be shown here. Open it in another app on your phone.'}
      </Text>
      <Button label="Open in another app" Icon={OpenElsewhereIcon} onPress={onSend} />
    </CenterCard>
  );
}

/** A local copy of an online file (downloaded once, then kept in the cache): `{ uri }`, `{ error }`,
    or null while it downloads. */
function useLocalCopy(file: { url: string; name: string; mimeType: string }) {
  const [state, setState] = useState<{ url: string; uri?: string; error?: string } | null>(null);
  const { url, name, mimeType } = file;
  useEffect(() => {
    let live = true;
    localCopy({ url, name, mimeType })
      .then((uri) => live && setState({ url, uri }))
      .catch((e) => live && setState({ url, error: errorText(e, `Couldn't download "${name}".`) }));
    return () => {
      live = false;
    };
  }, [url, name, mimeType]);
  return state?.url === url ? state : null;
}

// ---------------------------------------------------------------- PDF

function PdfBody({ file, bottomInset, onSend }: { file: ViewerFile & { url: string }; bottomInset: number; onSend: () => void }) {
  const { colors } = useAppTheme();
  const copy = useLocalCopy(file);
  const [page, setPage] = useState<{ at: number; of: number } | null>(null);
  const [failed, setFailed] = useState(false);
  if (!copy) {
    return (
      <CenterCard>
        <LoadingSpinner />
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          Opening the PDF…
        </Text>
      </CenterCard>
    );
  }
  if (copy.error || !copy.uri) return <Fallback file={file} kind="pdf" onSend={onSend} message={copy.error} />;
  if (failed) return <Fallback file={file} kind="pdf" onSend={onSend} message="This PDF couldn’t be shown here (it may be locked with a password). Open it in another app instead." />;
  return (
    <View className="flex-1">
      <PdfRendererView
        source={pdfSource(copy.uri)}
        style={{ flex: 1, backgroundColor: colors.background }}
        distanceBetweenPages={12}
        maxZoom={6}
        onPageChange={(at, of) => setPage({ at, of })}
        onError={() => setFailed(true)}
      />
      {page && page.of > 1 ? (
        <View pointerEvents="none" className="absolute items-center" style={{ left: 0, right: 0, bottom: bottomInset + 16 }}>
          <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: colors.surface }}>
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
              {page.at + 1} of {page.of}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The PDF renderer opens a plain path on Android (it only strips `file://`, so a name with spaces,
    which the address spells `%20`, must be decoded) and a `file://` URL on iOS. */
function pdfSource(uri: string) {
  if (Platform.OS !== 'android') return uri;
  const path = uri.replace(/^file:\/\//, '');
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

// ---------------------------------------------------------------- images

const MAX_SCALE = 6;

/** A picture that fills the screen: pinch to zoom, drag to look around once zoomed, double-tap to
    zoom in on a spot (or back out). */
function ZoomableImage({ url, name }: { url: string; name: string }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const { w, h } = box;

  const gesture = useMemo(() => {
    // How far the zoomed picture can move before its edge leaves the screen's edge.
    const clampX = (value: number, s: number) => {
      'worklet';
      const max = (w * (s - 1)) / 2;
      return Math.max(-max, Math.min(max, value));
    };
    const clampY = (value: number, s: number) => {
      'worklet';
      const max = (h * (s - 1)) / 2;
      return Math.max(-max, Math.min(max, value));
    };
    const pinch = Gesture.Pinch()
      .onStart(() => {
        startScale.set(scale.get());
      })
      .onUpdate((e) => {
        const s = Math.max(1, Math.min(MAX_SCALE, startScale.get() * e.scale));
        scale.set(s);
        x.set(clampX(x.get(), s));
        y.set(clampY(y.get(), s));
      });
    const pan = Gesture.Pan()
      .averageTouches(true)
      .onStart(() => {
        startX.set(x.get());
        startY.set(y.get());
      })
      .onUpdate((e) => {
        if (scale.get() <= 1) return;
        x.set(clampX(startX.get() + e.translationX, scale.get()));
        y.set(clampY(startY.get() + e.translationY, scale.get()));
      });
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e) => {
        if (scale.get() > 1.05) {
          scale.set(withTiming(1));
          x.set(withTiming(0));
          y.set(withTiming(0));
        } else {
          const s = 2.5;
          scale.set(withTiming(s));
          // Keep the tapped spot under the finger.
          x.set(withTiming(clampX((w / 2 - e.x) * (s - 1), s)));
          y.set(withTiming(clampY((h / 2 - e.y) * (s - 1), s)));
        }
      });
    return Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));
  }, [w, h, scale, startScale, x, y, startX, startY]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View className="flex-1 overflow-hidden" onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} collapsable={false}>
        <Animated.View style={[{ flex: 1 }, style]}>
          <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel={name} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------- audio

function AudioBody({ url, name, recording }: { url: string; name: string; recording?: boolean }) {
  const { colors } = useAppTheme();
  const player = useAudioPlayer({ uri: url }, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const skip = (by: number) => void player.seekTo(Math.max(0, Math.min(status.duration || 0, status.currentTime + by)));
  return (
    <CenterCard>
      <FileTypeIcon kind="audio" recording={recording} size={72} />
      <Text numberOfLines={2} className="font-ui-semibold text-center text-base font-semibold" style={{ color: colors.foreground }}>
        {name}
      </Text>
      <View className="w-full gap-4 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
        <SeekBar currentTime={status.currentTime} duration={status.duration} onSeek={(s) => void player.seekTo(s)} />
        <View className="flex-row items-center justify-center gap-6">
          <IconButton Icon={Rewind5Icon} label="Back 5 seconds" onPress={() => skip(-5)} size={44} />
          {status.isLoaded ? (
            <PlayButton
              playing={status.playing}
              size={64}
              onPress={() => {
                if (status.playing) player.pause();
                else {
                  if (status.duration > 0 && status.currentTime >= status.duration - 0.05) void player.seekTo(0);
                  player.play();
                }
              }}
            />
          ) : (
            <View className="items-center justify-center" style={{ width: 64, height: 64 }}>
              <LoadingSpinner />
            </View>
          )}
          <IconButton Icon={Forward5Icon} label="Forward 5 seconds" onPress={() => skip(5)} size={44} />
        </View>
      </View>
    </CenterCard>
  );
}

// ---------------------------------------------------------------- video

function VideoBody({ url, bottomInset }: { url: string; bottomInset: number }) {
  const { colors } = useAppTheme();
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <View className="flex-1" style={{ paddingBottom: bottomInset, backgroundColor: colors.background }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls fullscreenOptions={{ enable: true }} allowsPictureInPicture={false} />
    </View>
  );
}

// ---------------------------------------------------------------- text

/** The most text shown (a huge MusicXML would make the screen crawl). */
const MAX_TEXT = 200_000;
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function TextBody({ file, onSend }: { file: ViewerFile & { url: string }; onSend: () => void }) {
  const { colors } = useAppTheme();
  const [state, setState] = useState<{ url: string; text?: string; error?: string } | null>(null);
  const url = file.url;
  useEffect(() => {
    let live = true;
    const read = url.startsWith('file:') ? new File(url).text() : fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
    read.then((text) => live && setState({ url, text })).catch(() => live && setState({ url, error: 'Couldn’t read this file.' }));
    return () => {
      live = false;
    };
  }, [url]);
  const current = state?.url === url ? state : null;
  if (!current) {
    return (
      <CenterCard>
        <LoadingSpinner />
      </CenterCard>
    );
  }
  if (current.error || current.text === undefined) return <Fallback file={file} kind={fileKind(file.mimeType, file.name)} onSend={onSend} message={current.error} />;
  const cut = current.text.length > MAX_TEXT;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text selectable className="font-ui text-[13px]" style={{ fontFamily: MONO, color: colors.foreground, lineHeight: 19 }}>
        {cut ? current.text.slice(0, MAX_TEXT) : current.text}
      </Text>
      {cut ? (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          That’s the first part. Open it in another app to see the rest.
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** Opens files in the viewer: `open(file)` and render `viewer`. */
export function useFileViewer() {
  const [file, setFile] = useState<ViewerFile | null>(null);
  return { open: setFile, close: () => setFile(null), viewer: <FileViewer file={file} onClose={() => setFile(null)} /> };
}

/** A file to open in the viewer, as a tappable row: its type, name and a detail line. */
export function FileOpenRow({ file, detail, onOpen, right }: { file: ViewerFile; detail?: string; onOpen: () => void; right?: ReactNode }) {
  const { colors, derived } = useAppTheme();
  const kind = fileKind(file.mimeType, file.name);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${file.name}`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[52px] flex-row items-center gap-3 overflow-hidden rounded-lg px-3 py-2"
      style={{ backgroundColor: derived.fill }}
    >
      <FileTypeIcon kind={kind} recording={file.recording} size={32} />
      <View className="flex-1">
        <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          {file.name}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}
