import { makeId } from '@jam-practice/core/types';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Hint } from '@/components/Hint';
import {
  ChevronRightIcon,
  ExpandHeightIcon,
  FileMusicIcon,
  FlagIcon,
  Forward5Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  Rewind5Icon,
  ShrinkHeightIcon,
  SlidersIcon,
  TrashIcon,
} from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { NumberStepper } from '@/components/NumberStepper';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SlowDownerWaveform, type WaveView } from '@/components/SlowDownerWaveform';
import { SwitchRow } from '@/components/SwitchRow';
import { ToolOptionsSheet } from '@/components/ToolOptionsSheet';
import { SlowDownerPlayer, formatTime, type LoopRegion, type Peaks } from '@/lib/slowDownerEngine';
import { deleteFile, formatSize, listFiles, loadMarkers, pickAndSaveFile, saveMarkers, type LibraryEntry, type Marker } from '@/lib/slowDownerFiles';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Native port of `apps/web/components/SlowDowner.tsx` — same features: open an audio or video file
 * (the system picker; a copy is kept in the app so it's here next time, with a list of saved
 * files), slow it down or speed it up (25–150%, presets, optionally keeping the original pitch),
 * volume, an A–B loop, markers with names and notes, and a zoomable/pannable waveform. Speed, pitch,
 * volume and the waveform size share web's synced settings key.
 *
 * Touch replaces web's mouse/keyboard: tap the waveform to seek, drag to pan, pinch to zoom, and
 * long-press for web's right-click menu (add marker, play from here, set loop start/end, zoom to /
 * clear the loop; on a marker: go to / delete). Web's shift-drag loop selection becomes **A** / **B**
 * buttons that set the loop's start/end at the playhead. The main screen keeps the essentials —
 * file, time, waveform, loop, speed presets, transport — and the full speed controls, marker list
 * and saved files are in the Options sheet.
 */
const SETTINGS_KEY = 'jam-practice-slow-downer';
const DEFAULT_SETTINGS = { speed: 100, preservePitch: true, volume: 1, maximized: false };

const MIN_SPEED = 25;
const MAX_SPEED = 150;
const SPEED_PRESETS = [50, 60, 70, 80, 90, 100];
const SKIP_SECONDS = 5;
const MIN_SPAN = 2;

function SlowDownerScreen() {
  const { colors } = useAppTheme();
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
  const [error, setError] = useState<string | null>(null);
  const [loop, setLoop] = useState<LoopRegion | null>(null);
  const [loopOn, setLoopOn] = useState(false);
  const [view, setView] = useState<WaveView>({ start: 0, span: 1 });
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
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

  const pill = (on: boolean) => ({ backgroundColor: on ? colors.accent : colors.surface });
  const pillText = (on: boolean) => ({ color: on ? colors['accent-foreground'] : colors.foreground });

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Slow Downer' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <View className="flex-1 gap-3 px-4 py-3" style={{ paddingBottom: 12 }}>
          <View className="flex-row items-center gap-2">
            {file ? (
              <Pressable onPress={() => setFilesOpen(true)} className="flex-1 flex-row items-center gap-2 rounded-full px-4 py-2" style={{ backgroundColor: colors.surface }}>
                <FileMusicIcon color={colors.accent} size={18} />
                <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
                  {file.name}
                </Text>
                <Text style={{ color: colors.muted }}>▾</Text>
              </Pressable>
            ) : (
              <View className="flex-1" />
            )}
            <Pressable onPress={() => setOptionsOpen(true)} accessibilityLabel="Options" className="flex-row items-center gap-1.5 rounded-full px-4 py-2" style={{ backgroundColor: colors.surface }}>
              <SlidersIcon color={colors.foreground} size={18} />
              <Text className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
                Options
              </Text>
            </Pressable>
          </View>

          {!file ? (
            <ScrollView contentContainerStyle={{ gap: 16, paddingTop: 8 }}>
              <View className="items-center gap-3 rounded-2xl px-6 py-10" style={{ backgroundColor: colors.surface }}>
                <FileMusicIcon color={colors.accent} size={40} />
                <Text className="font-ui-bold text-center text-lg font-bold" style={{ color: colors.foreground }}>
                  Open a song to slow down
                </Text>
                <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
                  MP3, WAV, M4A, FLAC and more. A copy is kept in the app, so it&apos;s here next time.
                </Text>
                <Pressable onPress={() => void addFile()} className="rounded-full px-6 py-3" style={{ backgroundColor: colors.accent }}>
                  <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                    Choose a file
                  </Text>
                </Pressable>
              </View>
              {library.length > 0 ? (
                <View className="gap-2">
                  <Text className="font-ui-bold px-1 text-lg font-bold" style={{ color: colors.foreground }}>
                    Saved files
                  </Text>
                  <FileList entries={library} onOpen={(e) => void openEntry(e)} onDelete={setPendingDelete} />
                </View>
              ) : null}
            </ScrollView>
          ) : (
            <>
              <Text className="font-ui-extrabold text-center text-4xl font-extrabold tabular-nums" style={{ color: colors.foreground }}>
                {formatTime(time)}
                <Text className="font-ui-semibold text-lg font-semibold" style={{ color: colors.muted }}>
                  {' '}/ {formatTime(duration)}
                </Text>
              </Text>

              <View style={maximized ? { flex: 1 } : undefined}>
                {loading ? (
                  <View className="items-center justify-center rounded-2xl" style={{ height: 150, backgroundColor: colors.surface }}>
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
              </View>

              {/* Zoom, pan and the waveform's size. */}
              <View className="flex-row items-center justify-center gap-1.5">
                <SmallButton label="◀" disabled={!zoomed} onPress={() => panBy(-view.span * 0.25)} />
                <SmallButton label="▶" disabled={!zoomed} onPress={() => panBy(view.span * 0.25)} />
                <SmallButton label="−" onPress={() => zoom(1.5)} />
                <Text className="font-ui w-12 text-center text-xs tabular-nums" style={{ color: colors.muted }}>
                  {duration > 0 ? `${(duration / view.span).toFixed(1)}×` : ''}
                </Text>
                <SmallButton label="+" onPress={() => zoom(1 / 1.5)} />
                <SmallButton label="Fit" disabled={!zoomed} onPress={() => setView({ start: 0, span: duration })} />
                <Pressable
                  onPress={() => updateSettings({ maximized: !maximized })}
                  accessibilityLabel={maximized ? 'Shrink waveform' : 'Make the waveform taller'}
                  className="h-9 w-10 items-center justify-center rounded-lg"
                  style={pill(maximized)}
                >
                  {maximized ? <ShrinkHeightIcon color={colors['accent-foreground']} size={18} /> : <ExpandHeightIcon color={colors.foreground} size={18} />}
                </Pressable>
              </View>

              {/* A–B loop. */}
              <View className="flex-row items-center gap-2">
                <Pressable onPress={() => setEdge('start', time)} className="flex-1 items-center rounded-xl py-2.5" style={{ backgroundColor: colors.surface }}>
                  <Text className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
                    A {loop ? formatTime(loop.start) : ''}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setEdge('end', time)} className="flex-1 items-center rounded-xl py-2.5" style={{ backgroundColor: colors.surface }}>
                  <Text className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
                    B {loop ? formatTime(loop.end) : ''}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => loop && setLoopOn((on) => !on)}
                  disabled={!loop}
                  accessibilityLabel={loopOn ? 'Looping — tap to turn off' : 'Loop off — tap to turn on'}
                  className="h-11 w-12 items-center justify-center rounded-xl"
                  style={{ ...pill(loopOn && !!loop), opacity: loop ? 1 : 0.4 }}
                >
                  <RepeatIcon color={loopOn && loop ? colors['accent-foreground'] : colors.foreground} size={22} />
                </Pressable>
              </View>

              {/* Speed. */}
              <View className="flex-row flex-wrap justify-center gap-1.5">
                {SPEED_PRESETS.map((p) => (
                  <Pressable key={p} onPress={() => updateSettings({ speed: p })} className="rounded-lg px-3 py-1.5" style={pill(speed === p)}>
                    <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={pillText(speed === p)}>
                      {p}%
                    </Text>
                  </Pressable>
                ))}
                {!SPEED_PRESETS.includes(speed) ? (
                  <View className="rounded-lg px-3 py-1.5" style={pill(true)}>
                    <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={pillText(true)}>
                      {speed}%
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Transport. */}
              <View className="flex-row items-center justify-center gap-5">
                <Pressable onPress={() => seek(time - SKIP_SECONDS)} accessibilityLabel={`Back ${SKIP_SECONDS} seconds`} className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
                  <Rewind5Icon color={colors.foreground} size={24} />
                </Pressable>
                <Pressable onPress={togglePlay} disabled={loading || !duration} accessibilityLabel={playing ? 'Pause' : 'Play'} className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: colors.accent, opacity: loading || !duration ? 0.5 : 1 }}>
                  {playing ? <PauseIcon color={colors['accent-foreground']} size={32} /> : <PlayIcon color={colors['accent-foreground']} size={32} />}
                </Pressable>
                <Pressable onPress={() => seek(time + SKIP_SECONDS)} accessibilityLabel={`Forward ${SKIP_SECONDS} seconds`} className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
                  <Forward5Icon color={colors.foreground} size={24} />
                </Pressable>
              </View>
              {!maximized ? (
                <Text className="font-ui text-center text-xs" style={{ color: colors.muted }}>
                  Tap to seek · drag to pan · pinch to zoom · long-press for markers & loop
                </Text>
              ) : null}
            </>
          )}

          {error ? (
            <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>

      <ToolOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title="Slow Downer options"
        tabs={[
          {
            key: 'speed',
            label: 'Speed',
            content: () => (
              <>
                <NumberStepper
                  label="Playback speed"
                  value={speed}
                  unit="%"
                  min={MIN_SPEED}
                  max={MAX_SPEED}
                  step={5}
                  onChange={(v) => updateSettings({ speed: v })}
                  hint="How fast the file plays back, as a percentage of its original speed."
                />
                <View className="flex-row flex-wrap gap-1.5">
                  {SPEED_PRESETS.map((p) => (
                    <Pressable key={p} onPress={() => updateSettings({ speed: p })} className="rounded-lg px-3 py-1.5" style={pill(speed === p)}>
                      <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={pillText(speed === p)}>
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
                <NumberStepper
                  label="Volume"
                  value={Math.round(volume * 100)}
                  unit="%"
                  min={0}
                  max={100}
                  step={5}
                  onChange={(v) => updateSettings({ volume: v / 100 })}
                  hint="Playback volume for this file."
                />
              </>
            ),
          },
          {
            key: 'markers',
            label: 'Markers',
            content: () => (
              <>
                {markers.length === 0 ? (
                  <Hint>No markers yet. Long-press the waveform to add one at that spot, or add one at the playhead below.</Hint>
                ) : (
                  markers.map((marker) => (
                    <View key={marker.id} className="gap-1.5 rounded-xl p-2" style={{ backgroundColor: colors.surface }}>
                      <View className="flex-row items-center gap-2">
                        <Pressable onPress={() => seek(marker.time)} className="rounded-lg px-2 py-2" style={{ backgroundColor: colors.background }}>
                          <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: colors.accent }}>
                            {formatTime(marker.time)}
                          </Text>
                        </Pressable>
                        <TextInput
                          value={marker.label}
                          onChangeText={(label) => changeMarkers((prev) => prev.map((m) => (m.id === marker.id ? { ...m, label } : m)))}
                          accessibilityLabel="Marker name"
                          className="font-ui flex-1 rounded-lg px-2 py-2 text-sm"
                          style={{ backgroundColor: colors.background, color: colors.foreground }}
                        />
                        <Pressable onPress={() => changeMarkers((prev) => prev.filter((m) => m.id !== marker.id))} accessibilityLabel={`Delete ${marker.label}`} hitSlop={6} className="px-1">
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
                        className="font-ui rounded-lg px-2 py-2 text-sm"
                        style={{ backgroundColor: colors.background, color: colors.foreground, minHeight: 44, textAlignVertical: 'top' }}
                      />
                    </View>
                  ))
                )}
                <Pressable onPress={() => addMarker(time)} disabled={!file} className="flex-row items-center justify-center gap-1.5 rounded-xl py-2.5" style={{ backgroundColor: colors.surface, opacity: file ? 1 : 0.5 }}>
                  <PlusIcon color={colors.foreground} size={18} />
                  <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                    Add marker at playhead
                  </Text>
                </Pressable>
              </>
            ),
          },
          {
            key: 'files',
            label: 'Files',
            content: () => (
              <>
                <Pressable
                  onPress={() => {
                    setOptionsOpen(false);
                    void addFile();
                  }}
                  className="flex-row items-center justify-center gap-1.5 rounded-xl py-3"
                  style={{ backgroundColor: colors.accent }}
                >
                  <PlusIcon color={colors['accent-foreground']} size={18} />
                  <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                    Add new file
                  </Text>
                </Pressable>
                {library.length === 0 ? (
                  <Hint>No saved files yet.</Hint>
                ) : (
                  <FileList
                    entries={library}
                    currentId={file?.id}
                    onOpen={(e) => {
                      setOptionsOpen(false);
                      void openEntry(e);
                    }}
                    onDelete={setPendingDelete}
                  />
                )}
              </>
            ),
          },
        ]}
      />

      <ActionSheet
        visible={filesOpen}
        title="Files"
        onClose={() => setFilesOpen(false)}
        actions={[
          ...library.map((e) => ({
            key: e.id,
            icon: <FileMusicIcon color={e.id === file?.id ? colors.accent : colors.foreground} size={22} />,
            label: e.name,
            onPress: () => void openEntry(e),
          })),
          { key: 'add', icon: <PlusIcon color={colors.accent} size={22} />, label: 'Add new file…', onPress: () => void addFile() },
        ]}
      />
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

function SmallButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} className="h-9 min-w-[40px] items-center justify-center rounded-lg px-2.5" style={{ backgroundColor: colors.surface, opacity: disabled ? 0.4 : 1 }}>
      <Text className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
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
  const { colors } = useAppTheme();
  return (
    <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
      {entries.map((entry, i) => (
        <View key={entry.id} className="flex-row items-center" style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.background }}>
          <Pressable onPress={() => onOpen(entry)} android_ripple={{ color: colors['surface-hover'] }} className="flex-1 flex-row items-center gap-3 px-4 py-3">
            <FileMusicIcon color={entry.id === currentId ? colors.accent : colors.muted} size={20} />
            <View className="flex-1">
              <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {entry.name}
              </Text>
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                {formatSize(entry.size)}
              </Text>
            </View>
            <ChevronRightIcon color={colors.muted} size={18} />
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
