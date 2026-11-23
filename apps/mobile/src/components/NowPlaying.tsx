import { NAV_LINKS_DATA } from '@jam-practice/core/navLinks';
import { useRouter } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PlaybackNotificationManager } from 'react-native-audio-api';

import { StopIcon } from '@/components/icons';
import { toolName, toolRoute } from '@/components/ToolGrid';
import { ToolIcon } from '@/components/ui';
import { useNowPlaying, type Playing } from '@/lib/nowPlaying';
import { getRecorderSnapshot, saveTakeRoute, stopRecording, subscribeRecorder } from '@/lib/recorderEngine';
import { formatDuration } from '@/lib/recordings';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * "If a tool is playing in the background it should say what tool is playing with some way to get
 * back to it from anywhere" (Jack). Three parts, all fed by `useNowPlaying`:
 *
 * - `NowPlayingStrip`: on the main screens, a strip docked on top of the tab bar (like a music
 *   app's mini player): the tool's icon and name, "Playing", and Stop. Tap it to go back to it. (It
 *   floated as a pill over the page at first, which looked like a stray card.)
 * - `NowPlayingHeaderButton`: on every other screen, the playing tool's icon in the header (beside
 *   a tool's ?), so it never covers a tool's footer.
 * - `NowPlayingService`: the media notification while anything plays. It's what keeps Android from
 *   freezing the app in the background (the audio library's foreground service), so the Metronome
 *   keeps clicking when you switch apps; `lib/steadyTimer.ts` keeps its scheduler ticking.
 */

/** The strip's height, on top of the tab bar. */
export const NOW_PLAYING_HEIGHT = 56;

function linkOf(href: string) {
  return NAV_LINKS_DATA.find((l) => l.href === href);
}

/** Back to a playing tool. A tool whose engine runs on its own reads it again on a fresh screen; one
    that only runs while its screen is open is somewhere in the stack, so go back to that one. */
function useOpenPlaying() {
  const router = useRouter();
  return (item: Playing) => {
    const route = toolRoute(item.href);
    if (item.stop || item.href === '/recorder') router.push(route);
    else router.dismissTo(route);
  };
}

/** Stop from the strip. A Recorder take is stopped and goes straight to naming and saving it, as
    it would from the Recorder's own Stop. */
function useStopPlaying() {
  const router = useRouter();
  return (item: Playing) => {
    if (item.href !== '/recorder') return item.stop?.();
    void stopRecording().then((take) => {
      if (take) router.push(saveTakeRoute(take));
    });
  };
}

/** The Recorder's line in the strip: a red dot and "Recording 0:33" (or "Counting in"). */
function RecordingStatus({ others }: { others: number }) {
  const { colors } = useAppTheme();
  const rec = useSyncExternalStore(subscribeRecorder, getRecorderSnapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (rec.phase !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [rec.phase]);
  const label =
    rec.phase === 'countin'
      ? 'Counting in'
      : rec.phase === 'finishing'
        ? 'Saving…'
        : `Recording ${formatDuration(rec.startedAt ? Math.max(0, now - rec.startedAt) / 1000 : 0)}`;
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
      <Text numberOfLines={1} className="font-ui text-xs tabular-nums" style={{ color: colors.danger }}>
        {others > 0 ? `${label} · and ${others} more` : label}
      </Text>
    </View>
  );
}

/** The playing tool as a strip docked on top of the tab bar (`FloatingTabBar` renders it, and the
    pages leave room for it): its icon and name, "Playing" (or "Recording 0:33"), and Stop. Tap it
    to go back to it. */
export function NowPlayingStrip({ playing }: { playing: Playing[] }) {
  const { colors, derived } = useAppTheme();
  const open = useOpenPlaying();
  const stop = useStopPlaying();
  const first = playing[0];
  const link = first ? linkOf(first.href) : undefined;
  if (!first || !link) return null;
  const others = playing.length - 1;
  const recording = first.href === '/recorder';
  return (
    <Pressable
      onPress={() => open(first)}
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Recording. Open the Recorder.' : `${link.label} is playing. Open it.`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="flex-row items-center gap-3 pl-4 pr-2"
      style={{ height: NOW_PLAYING_HEIGHT, borderBottomWidth: 1, borderBottomColor: derived.hairline }}
    >
      <ToolIcon tool={link} size={34} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          {toolName(link)}
        </Text>
        {recording ? (
          <RecordingStatus others={others} />
        ) : (
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.accent }}>
            {others > 0 ? `Playing · and ${others} more` : 'Playing'}
          </Text>
        )}
      </View>
      {first.stop || recording ? (
        <Pressable
          onPress={() => stop(first)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Stop ${link.label}`}
          android_ripple={{ color: colors['surface-hover'] }}
          className="h-11 w-11 items-center justify-center overflow-hidden rounded-full"
          style={{ backgroundColor: derived.fill }}
        >
          <StopIcon color={recording ? colors.danger : colors.foreground} size={16} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** In a screen's header: the icon of a tool that's playing (not this screen's own), to go back to it. */
export function NowPlayingHeaderButton({ routeName }: { routeName: string }) {
  const playing = useNowPlaying();
  const open = useOpenPlaying();
  const here = `/${routeName}`;
  const other = playing.find((p) => toolRoute(p.href) !== here);
  const link = other ? linkOf(other.href) : undefined;
  if (!other || !link) return null;
  return (
    <Pressable
      onPress={() => open(other)}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`${link.label} is playing. Open it.`}
      className="h-10 w-10 items-center justify-center"
    >
      <ToolIcon tool={link} size={32} />
    </Pressable>
  );
}

/** The media notification while a tool plays (see above). Mounted once. */
export function NowPlayingService() {
  const playing = useNowPlaying();
  const title = playing
    .map((p) => linkOf(p.href)?.label)
    .filter(Boolean)
    .join(' · ');
  useEffect(() => {
    if (title) {
      PlaybackNotificationManager.show({ title, artist: 'Playing in soniroll', state: 'playing' }).catch(() => {});
    } else {
      PlaybackNotificationManager.hide().catch(() => {});
    }
  }, [title]);
  return null;
}
