import { makeId } from '@jam-practice/core/types';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  ChevronDownIcon,
  ExpandHeightIcon,
  FileMusicIcon,
  FlagIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  ShrinkHeightIcon,
  SpeakerIcon,
  StopwatchIcon,
  TrashIcon,
} from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SlowDownerWaveform, type WaveView } from '@/components/SlowDownerWaveform';
import { SwitchRow } from '@/components/SwitchRow';
import { OptionsArea, SheetButton, SheetText, SliderField } from '@/components/tool/ear';
import { BigButton } from '@/components/tool/meter';
import { GradientFill } from '@/components/tool/reward';
import { SettingChip, ToolSheet } from '@/components/tool/SettingChip';
import { Button, Card } from '@/components/ui';
import { SlowDownerPlayer, formatTime, type LoopRegion, type Peaks } from '@/lib/slowDownerEngine';
import { deleteFile, formatSize, listFiles, loadMarkers, pickAndSaveFile, saveMarkers, type LibraryEntry, type Marker } from '@/lib/slowDownerFiles';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useToolActivity } from '@/lib/toolTime';

/**
 * Native port of `apps/web/components/SlowDowner.tsx` — same features: open an audio or video file
 * (the system picker; a copy is kept in the app so it's here next time, with a list of saved
 * files), slow it down or speed it up (25–150%, presets, optionally keeping the original pitch),
 * volume, an A–B loop, markers with names and notes, and a zoomable/pannable waveform. Speed, pitch,
 * volume and the waveform size share web's synced settings key.
 *
 * Touch replaces web's mouse/keyboard: tap the waveform to seek, drag to pan, pinch to zoom, and
 * long-press for web's right-click menu (add marker, play from here, set loop start/end, zoom to /
 * clear the loop; on a marker: go to / delete). Laid out like the website's: the file button (it
 * opens the saved files), the time, the waveform with its loop switch, zoom, −5s / Play / +5s, Loop
 * start / Loop end / Clear loop / Add marker at the playhead, then the Speed, Volume and Markers
 * chips.
 */
const SETTINGS_KEY = 'jam-practice-slow-downer';
const DEFAULT_SETTINGS = { speed: 100, preservePitch: true, volume: 1, maximized: false };

const MIN_SPEED = 25;
const MAX_SPEED = 150;
const SPEED_PRESETS = [50, 60, 70, 80, 90, 100];
const SKIP_SECONDS = 5;
const MIN_SPAN = 2;

function SlowDownerScreen() {
  const { colors, derived } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, settings.speed));
  const { preservePitch, volume, maximized } = settings;

  // One player for the screen's lifetime.
  const [player] = useState(() => new SlowDownerPlayer());

  const [library, setLibrary] = useState<LibraryEntry[] | null>(null);
  const [file, setFile] = useState<LibraryEntry | null>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  useToolActivity('/slow-downer', playing);
  const [error, setError] = useState<string | null>(null);
  const [loop, setLoop] = useState<LoopRegion | null>(null);
  const [loopOn, setLoopOn] = useState(false);
  const [view, setView] = useState<WaveView>({ start: 0, span: 1 });
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [filesOpen, setFilesOpen] = useState(false);
  const [menu, setMenu] = useState<{ t: number; markerId: string | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LibraryEntry | null>(null);
  const fileTokenRef = useRef(0);

  useEffect(() => {
    void listFiles().then(setLibrary);
  }, []);

  // Speed, pitch, volume and the loop go straight to the player.
  useEffect(() => player.setSpeed(speed / 100), [player, speed]);
  useEffect(() => player.setPreservePitch(preservePitch), [player, preservePitch]);
  useEffect(() => player.setVolume(volume), [player, volume]);
  useEffect(() => player.setLoop(loopOn ? loop : null), [player, loop, loopOn]);

  useEffect(() => {
    player.setOnEnded(() => {
      setPlaying(false);
      setTime(player.duration);
    });
    return () => {
      player.setOnEnded(null);
      player.unload();
    };
  }, [player]);

  // While playing: move the playhead, and keep it on screen when zoomed in.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const t = player.tick();
      setTime(t);
      setView((v) => {
        const d = player.duration;
        if (v.span >= d || (t >= v.start && t <= v.start + v.span)) return v;
        return { ...v, start: Math.max(0, Math.min(d - v.span, t - v.span * 0.1)) };
      });
    }, 40);
    return () => clearInterval(id);
  }, [playing, player]);

  async function openEntry(entry: LibraryEntry) {
    const token = ++fileTokenRef.current;
    player.pause();
    setPlaying(false);
    setError(null);
    setPeaks(null);
    setLoop(null);
    setLoopOn(false);
    setTime(0);
    setDuration(0);
    setView({ start: 0, span: 1 });
    setFile(entry);
    setMarkers(await loadMarkers(entry.id));
    setLoading(true);
    try {
      const result = await player.load(entry.file);
      if (token !== fileTokenRef.current) return;
      setPeaks(result);
      setDuration(player.duration);
      setView({ start: 0, span: player.duration });
    } catch {
      if (token === fileTokenRef.current) setError("Couldn't read this file — try an MP3, WAV, M4A or FLAC.");
    } finally {
      if (token === fileTokenRef.current) setLoading(false);
    }
  }

  async function addFile() {
    try {
      const entry = await pickAndSaveFile();
      setLibrary(await listFiles());
      if (entry) await openEntry(entry);
    } catch {
      setError("Couldn't open that file.");
    }
  }

  function closeFile() {
    fileTokenRef.current++;
    player.unload();
    setPlaying(false);
    setFile(null);
    setPeaks(null);
    setLoop(null);
    setLoopOn(false);
    setMarkers([]);
    setTime(0);
    setDuration(0);
    setError(null);
  }

  async function confirmDelete(entry: LibraryEntry) {
    setPendingDelete(null);
    await deleteFile(entry);
    if (file?.id === entry.id) closeFile();
    setLibrary(await listFiles());
  }

  function changeMarkers(update: (prev: Marker[]) => Marker[]) {
    setMarkers((prev) => {
      const next = update(prev);
      if (file) void saveMarkers(file.id, next);
      return next;
    });
  }

  function seek(t: number) {
    if (!duration) return;
    const clamped = Math.min(duration, Math.max(0, t));
    player.seek(clamped);
    setTime(clamped);
  }

  function togglePlay() {
    if (!file || !duration) return;
    if (player.playing) {
      player.pause();
      setPlaying(false);
      setTime(player.position());
    } else {
      player.play();
      setPlaying(true);
    }
  }

  function playFrom(t: number) {
    seek(t);
    if (!player.playing) {
      player.play();
      setPlaying(true);
    }
  }

  function setEdge(edge: 'start' | 'end', t: number) {
    const clamped = Math.min(duration, Math.max(0, t));
    setLoop((prev) => {
      const base = prev ?? (edge === 'start' ? { start: clamped, end: Math.min(duration, clamped + 5) } : { start: Math.max(0, clamped - 5), end: clamped });
      const next = { ...base, [edge]: clamped };
      if (next.end - next.start < 0.05) {
        if (edge === 'start') next.start = Math.max(0, next.end - 0.05);
        else next.end = Math.min(duration, next.start + 0.05);
      }
      return next;
    });
    setLoopOn(true);
  }

  function zoomAt(factor: number, anchor: number) {
    setView((v) => {
      if (duration <= 0) return v;
      const span = Math.min(duration, Math.max(Math.min(MIN_SPAN, duration), v.span * factor));
      const ratio = v.span > 0 ? (anchor - v.start) / v.span : 0;
      const start = Math.max(0, Math.min(duration - span, anchor - ratio * span));
      return { start, span };
    });
  }

  function zoom(factor: number) {
    const centre = view.start + view.span / 2;
    zoomAt(factor, time >= view.start && time <= view.start + view.span ? time : centre);
  }

  function panBy(seconds: number) {
    setView((v) => ({ ...v, start: Math.max(0, Math.min(Math.max(0, duration - v.span), v.start + seconds)) }));
  }

  function zoomToLoop() {
    if (!loop) return;
    const length = loop.end - loop.start;
    const span = Math.min(duration, Math.max(MIN_SPAN, length * 1.3));
    setView({ start: Math.max(0, Math.min(duration - span, loop.start - (span - length) / 2)), span });
  }

  function addMarker(t: number) {
    changeMarkers((prev) =>
      [...prev, { id: makeId(), time: Math.min(duration, Math.max(0, t)), label: `Marker ${prev.length + 1}`, note: '' }].sort((a, b) => a.time - b.time),
    );
  }

  if (!settingsReady || library === null) return <ScreenSpinner />;

  const zoomed = duration > 0 && view.span < duration - 0.01;
  const icon = (I: typeof PlusIcon, danger = false) => <I color={danger ? colors.danger : colors.foreground} size={22} />;
  const loopActions: SheetAction[] = [
    { key: 'ls', icon: icon(RepeatIcon), label: 'Set loop start here', onPress: () => menu && setEdge('start', menu.t) },
    { key: 'le', icon: icon(RepeatIcon), label: 'Set loop end here', onPress: () => menu && setEdge('end', menu.t) },
    ...(loop
      ? [
          { key: 'lz', icon: icon(RepeatIcon), label: 'Zoom to loop', onPress: zoomToLoop },
          { key: 'lc', icon: icon(RepeatIcon), label: 'Clear loop', onPress: () => (setLoop(null), setLoopOn(false)) },
        ]
      : []),
  ];
  const menuMarker = menu?.markerId ? markers.find((m) => m.id === menu.markerId) : undefined;
  const menuActions: SheetAction[] = !menu
    ? []
    : menuMarker
      ? [
          { key: 'go', icon: icon(FlagIcon), label: 'Go to marker', onPress: () => seek(menuMarker.time) },
          ...loopActions,
          { key: 'del', icon: icon(TrashIcon, true), label: 'Delete marker', danger: true, onPress: () => changeMarkers((prev) => prev.filter((m) => m.id !== menuMarker.id)) },
        ]
      : [
          { key: 'add', icon: icon(FlagIcon), label: 'Add marker here', onPress: () => addMarker(menu.t) },
          { key: 'play', icon: icon(PlayIcon), label: 'Play from here', onPress: () => playFrom(menu.t) },
          ...loopActions,
        ];

  const optionChips = (
    <OptionsArea>
      <SettingChip Icon={StopwatchIcon} label="Speed" value={`${speed}%`}>
        <SliderField
          label="Playback speed"
          value={speed}
          unit="%"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={5}
          onChange={(v) => updateSettings({ speed: v })}
          hint="How fast the file plays back, as a percentage of its original speed."
        />
        {/* One choice, so one row of equal buttons. */}
        <View className="flex-row gap-1.5">
          {SPEED_PRESETS.map((p) => (
            <Pressable
              key={p}
              onPress={() => updateSettings({ speed: p })}
              accessibilityRole="radio"
              accessibilityState={{ checked: speed === p }}
              className="h-9 flex-1 items-center justify-center overflow-hidden rounded-full"
              style={{ backgroundColor: speed === p ? undefined : colors.background }}
            >
              {speed === p ? <GradientFill /> : null}
              <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: speed === p ? colors['accent-foreground'] : colors.foreground }}>
                {p}%
              </Text>
            </Pressable>
          ))}
        </View>
        <SwitchRow
          label="Keep original pitch"
          checked={preservePitch}
          onChange={(v) => updateSettings({ preservePitch: v })}
          hint="Corrects the pitch so slowing down doesn't also drop it (or speeding up raise it)."
        />
      </SettingChip>

      <SettingChip Icon={SpeakerIcon} label="Volume" value={`${Math.round(volume * 100)}%`}>
        <SliderField
          label="Volume"
          value={Math.round(volume * 100)}
          unit="%"
          min={0}
          max={100}
          step={5}
          onChange={(v) => updateSettings({ volume: v / 100 })}
          hint="Playback volume for this file."
        />
      </SettingChip>

      {/* Markers belong to a file, so the chip waits until one is open. */}
      {file ? (
        <SettingChip Icon={FlagIcon} label="Markers" value={markers.length ? `${markers.length}` : 'None'}>
          {markers.length === 0 ? (
            <SheetText>No markers yet. Long-press the waveform to add one at that spot, or add one at the playhead.</SheetText>
          ) : (
            <View>
              {markers.map((marker, i) => (
                <View key={marker.id} className="gap-1.5 py-2" style={i > 0 ? { borderTopWidth: 1, borderColor: derived.hairline } : undefined}>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => seek(marker.time)}
                      accessibilityLabel={`Go to ${marker.label}`}
                      className="h-9 w-16 justify-center rounded-md px-2"
                      style={{ backgroundColor: colors.background }}
                    >
                      <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: colors.foreground }}>
                        {formatTime(marker.time)}
                      </Text>
                    </Pressable>
                    <TextInput
                      value={marker.label}
                      onChangeText={(label) => changeMarkers((prev) => prev.map((m) => (m.id === marker.id ? { ...m, label } : m)))}
                      accessibilityLabel="Marker name"
                      className="font-ui h-9 flex-1 rounded-md px-2 text-sm"
                      style={{ backgroundColor: colors.background, color: colors.foreground, paddingVertical: 0 }}
                    />
                    <Pressable
                      onPress={() => changeMarkers((prev) => prev.filter((m) => m.id !== marker.id))}
                      accessibilityLabel={`Delete ${marker.label}`}
                      hitSlop={6}
                      className="h-9 w-9 items-center justify-center"
                    >
                      <TrashIcon color={colors.muted} size={20} />
                    </Pressable>
                  </View>
                  <TextInput
                    value={marker.note}
                    onChangeText={(note) => changeMarkers((prev) => prev.map((m) => (m.id === marker.id ? { ...m, note } : m)))}
                    placeholder="Add notes…"
                    placeholderTextColor={colors.muted}
                    multiline
                    accessibilityLabel={`Notes for ${marker.label}`}
                    className="font-ui rounded-md px-2 py-2 text-sm"
                    style={{ backgroundColor: colors.background, color: colors.foreground, minHeight: 44, textAlignVertical: 'top' }}
                  />
                </View>
              ))}
            </View>
          )}
          <SheetButton label="Add marker at playhead" onPress={() => addMarker(time)} />
        </SettingChip>
      ) : null}
    </OptionsArea>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Slow Downer' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        {!file ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20, paddingHorizontal: 16, paddingVertical: 16 }}>
            <View className="items-center gap-3 rounded-xl px-6 py-12" style={{ backgroundColor: derived.fill }}>
              <Text className="font-ui-semibold text-center text-base font-semibold" style={{ color: colors.foreground }}>
                Open an audio or video file
              </Text>
              <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
                MP3, WAV, M4A, FLAC and more. A copy is kept in the app, so it&apos;s here next time.
              </Text>
              <View className="mt-1">
                <BigButton label="Open a file" icon={<PlusIcon color={colors['accent-foreground']} size={20} />} onPress={() => void addFile()} />
              </View>
            </View>
            {library.length > 0 ? (
              <Card title="Saved files">
                <FileList entries={library} onOpen={(e) => void openEntry(e)} onDelete={setPendingDelete} />
              </Card>
            ) : null}
            {optionChips}
            {error ? (
              <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, gap: 16, paddingHorizontal: 16, paddingVertical: 16 }}
          >
            <View className="items-center">
              <Pressable
                onPress={() => setFilesOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${file.name} — change file`}
                android_ripple={{ color: colors['surface-hover'] }}
                className="h-10 max-w-full flex-row items-center gap-2 overflow-hidden rounded-full pl-3 pr-2.5"
                style={{ backgroundColor: derived.fill }}
              >
                <FileMusicIcon color={colors.accent} size={18} />
                <Text numberOfLines={1} className="font-ui-semibold shrink text-sm font-semibold" style={{ color: colors.foreground }}>
                  {file.name}
                </Text>
                <ChevronDownIcon color={colors.muted} size={18} />
              </Pressable>
            </View>

            <Text className="font-ui-semibold text-center text-5xl font-semibold tabular-nums" style={{ color: colors.foreground }}>
              {formatTime(time)}
              <Text className="font-ui text-xl" style={{ color: colors.muted }}>
                {' '}/ {formatTime(duration)}
              </Text>
            </Text>

            <View style={maximized ? { flex: 1 } : undefined}>
              {loading ? (
                <View className="items-center justify-center rounded-lg" style={{ height: 150, backgroundColor: colors.surface }}>
                  <LoadingSpinner showLabel label="Reading the file…" />
                </View>
              ) : (
                <WaveformFill maximized={maximized}>
                  {(height) => (
                    <SlowDownerWaveform
                      peaks={peaks}
                      duration={duration}
                      view={view}
                      time={time}
                      loop={loop}
                      loopActive={loopOn}
                      markers={markers}
                      height={height}
                      onSeek={seek}
                      onPan={panBy}
                      onZoomAt={zoomAt}
                      onLongPress={(t, markerId) => setMenu({ t, markerId })}
                    />
                  )}
                </WaveformFill>
              )}
              {/* The loop on/off switch, on the waveform once there's a loop. */}
              {loop && !loading ? (
                <Pressable
                  onPress={() => setLoopOn((on) => !on)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: loopOn }}
                  accessibilityLabel={loopOn ? 'Looping — tap to turn off' : 'Loop off — tap to turn on'}
                  className="absolute right-2 top-2 h-9 w-9 items-center justify-center overflow-hidden rounded-md"
                  style={{ backgroundColor: loopOn ? colors.accent : colors.background }}
                >
                  <RepeatIcon color={loopOn ? colors['accent-foreground'] : colors.muted} size={18} />
                </Pressable>
              ) : null}
            </View>

            {/* Zoom, pan and the waveform's size. Panning only means anything zoomed in. */}
            <View className="flex-row flex-wrap items-center justify-center gap-1.5">
              {zoomed ? (
                <>
                  <SmallButton label="◀" accessibilityLabel="Pan left" onPress={() => panBy(-view.span * 0.25)} />
                  <SmallButton label="▶" accessibilityLabel="Pan right" onPress={() => panBy(view.span * 0.25)} />
                  <View className="mx-1 h-5 w-px" style={{ backgroundColor: derived.hairline }} />
                </>
              ) : null}
              <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                Zoom
              </Text>
              <SmallButton label="−" accessibilityLabel="Zoom out" onPress={() => zoom(1.5)} />
              <Text className="font-ui w-11 text-center text-xs tabular-nums" style={{ color: colors.foreground }}>
                {duration > 0 ? `${(duration / view.span).toFixed(1)}×` : ''}
              </Text>
              <SmallButton label="+" accessibilityLabel="Zoom in" onPress={() => zoom(1 / 1.5)} />
              <SmallButton label="Fit" disabled={!zoomed} onPress={() => setView({ start: 0, span: duration })} />
              <View className="mx-1 h-5 w-px" style={{ backgroundColor: derived.hairline }} />
              <Pressable
                onPress={() => updateSettings({ maximized: !maximized })}
                accessibilityRole="button"
                accessibilityState={{ selected: maximized }}
                accessibilityLabel={maximized ? 'Make the waveform shorter again' : 'Make the waveform as tall as the screen allows'}
                className="h-9 flex-row items-center justify-center gap-1.5 overflow-hidden rounded-md px-3"
                style={{ backgroundColor: maximized ? colors.accent : derived.fill }}
              >
                {maximized ? <ShrinkHeightIcon color={colors['accent-foreground']} size={16} /> : <ExpandHeightIcon color={colors.foreground} size={16} />}
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: maximized ? colors['accent-foreground'] : colors.foreground }}>
                  {maximized ? 'Shorter' : 'Taller'}
                </Text>
              </Pressable>
            </View>

            {/* Transport. */}
            <View className="flex-row items-center justify-center gap-3">
              <TransportButton label={`Back ${SKIP_SECONDS} seconds`} onPress={() => seek(time - SKIP_SECONDS)}>
                <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: colors.foreground }}>
                  −{SKIP_SECONDS}s
                </Text>
              </TransportButton>
              <TransportButton label={playing ? 'Pause' : 'Play'} primary disabled={loading || !duration} onPress={togglePlay}>
                {playing ? <PauseIcon color={colors['accent-foreground']} size={28} /> : <PlayIcon color={colors['accent-foreground']} size={28} />}
              </TransportButton>
              <TransportButton label={`Forward ${SKIP_SECONDS} seconds`} onPress={() => seek(time + SKIP_SECONDS)}>
                <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: colors.foreground }}>
                  +{SKIP_SECONDS}s
                </Text>
              </TransportButton>
            </View>

            {/* Loops and markers at the playhead (the waveform's long-press menu does them too). */}
            <View className="flex-row flex-wrap items-center justify-center gap-2">
              <LoopButton label="Loop start" Icon={RepeatIcon} disabled={!duration} onPress={() => setEdge('start', time)} />
              <LoopButton label="Loop end" disabled={!duration} onPress={() => setEdge('end', time)} />
              {loop ? (
                <Text className="font-ui text-sm tabular-nums" style={{ color: loopOn ? colors.foreground : colors.muted }}>
                  Loop {formatTime(loop.start)}–{formatTime(loop.end)}
                </Text>
              ) : null}
              <LoopButton label="Clear loop" disabled={!loop} onPress={() => (setLoop(null), setLoopOn(false))} />
              <LoopButton label="Add marker" Icon={FlagIcon} disabled={!duration} onPress={() => addMarker(time)} />
            </View>

            {!maximized ? (
              <Text className="font-ui text-center text-xs" style={{ color: colors.muted }}>
                Tap to seek · drag to pan · pinch to zoom · long-press for markers & loop
              </Text>
            ) : null}

            {optionChips}

            {error ? (
              <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* The file button: every saved file (tap to open, the bin to remove it) and Add. */}
      <ToolSheet visible={filesOpen} onClose={() => setFilesOpen(false)} title="Files">
        <FileList
          entries={library}
          currentId={file?.id}
          onOpen={(e) => {
            setFilesOpen(false);
            void openEntry(e);
          }}
          onDelete={setPendingDelete}
        />
        <Button
          label="Add new file"
          Icon={PlusIcon}
          onPress={() => {
            setFilesOpen(false);
            void addFile();
          }}
        />
      </ToolSheet>
      <ActionSheet visible={!!menu} title={menu ? (menuMarker ? menuMarker.label : formatTime(menu.t)) : undefined} actions={menuActions} onClose={() => setMenu(null)} />
      <ConfirmDialog
        visible={!!pendingDelete}
        title="Delete this file?"
        message={`"${pendingDelete?.name ?? ''}" will be removed from the app, along with its markers and notes. You can add the file again later.`}
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && void confirmDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  );
}

/** The waveform at its normal height, or filling the space left when "maximised". */
function WaveformFill({ maximized, children }: { maximized: boolean; children: (height: number) => React.ReactNode }) {
  const [height, setHeight] = useState(0);
  if (!maximized) return <>{children(150)}</>;
  return (
    <View style={{ flex: 1, minHeight: 150 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 ? children(height) : null}
    </View>
  );
}

function SmallButton({ label, onPress, disabled, accessibilityLabel }: { label: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 min-w-9 items-center justify-center overflow-hidden rounded-md px-2.5"
      style={{ backgroundColor: derived.fill, opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** −5s / Play / +5s: round buttons, Play the big accent one. */
function TransportButton({ label, onPress, primary, disabled, children }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const { colors, derived } = useAppTheme();
  const size = primary ? 64 : 48;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
      className="items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, backgroundColor: primary ? colors.accent : derived.fill, opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </Pressable>
  );
}

/** Loop start / Loop end / Clear loop / Add marker under the transport. */
function LoopButton({ label, onPress, disabled, Icon }: { label: string; onPress: () => void; disabled?: boolean; Icon?: typeof PlusIcon }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-10 flex-row items-center justify-center gap-1.5 overflow-hidden rounded-lg px-3"
      style={{ backgroundColor: derived.fill, opacity: disabled ? 0.5 : 1 }}
    >
      {Icon ? <Icon color={colors.muted} size={16} /> : null}
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

function FileList({
  entries,
  currentId,
  onOpen,
  onDelete,
}: {
  entries: LibraryEntry[];
  currentId?: string;
  onOpen: (e: LibraryEntry) => void;
  onDelete: (e: LibraryEntry) => void;
}) {
  const { colors, derived } = useAppTheme();
  if (entries.length === 0) return <SheetText>No saved files yet.</SheetText>;
  return (
    <View className="gap-1.5">
      {entries.map((entry) => (
        <View key={entry.id} className="flex-row items-center overflow-hidden rounded-lg" style={{ backgroundColor: derived.fill }}>
          <Pressable onPress={() => onOpen(entry)} android_ripple={{ color: colors['surface-hover'] }} className="min-h-[52px] flex-1 flex-row items-center gap-3 px-3 py-2">
            <FileMusicIcon color={entry.id === currentId ? colors.accent : colors.muted} size={20} />
            <View className="flex-1">
              <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                {entry.name}
              </Text>
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                {formatSize(entry.size)}
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={() => onDelete(entry)} accessibilityLabel={`Remove ${entry.name}`} className="h-12 w-12 items-center justify-center">
            <TrashIcon color={colors.muted} size={20} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export default withScreenLoader(SlowDownerScreen);
