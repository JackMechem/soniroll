"use client";

import { useEffect, useRef, useState } from "react";
import ContextMenu, { MenuItem, MenuState } from "@/components/ContextMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import Hint from "@/components/Hint";
import Select from "@/components/Select";
import { OptionSection, OptionsCard } from "@/components/OptionsCard";
import KeyHint from "@/components/KeyHint";
import SwitchRow from "@/components/SwitchRow";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import WaveScrollbar from "@/components/WaveScrollbar";
import Waveform, { LoopRegion, View } from "@/components/Waveform";
import {
  ExpandHeightIcon,
  FlagIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  ShrinkHeightIcon,
  SkipForwardIcon,
  SpeakerIcon,
  StopwatchIcon,
} from "@/components/tools";
import { Peaks, analyzeAudio, formatTime } from "@/lib/audioFile";
import { LibraryEntry, deleteFile, fileId, getFile, listFiles, saveFile } from "@/lib/fileLibrary";
import { Marker, fileKeyOf, loadMarkers, saveMarkers } from "@/lib/markers";
import { makeId } from "@/lib/types";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useToolActivity } from "@/lib/toolTime";
import { PoolPill } from "@/components/reward/Reward";

const ADD_FILE_VALUE = "__add-new-file__";
const SETTINGS_KEY = "jam-practice-slow-downer";
const DEFAULT_SETTINGS = { speed: 100, preservePitch: true, volume: 1, maximized: false };

const MIN_SPEED = 25;
const MAX_SPEED = 150;
const SPEED_PRESETS = [50, 60, 70, 80, 90, 100];
const SKIP_SECONDS = 5;
const MIN_SPAN = 2;

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function sliderStyle(value: number, min: number, max: number) {
  return { "--progress": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties;
}

const zoomButton =
  "flex h-8 min-w-8 items-center justify-center rounded-md bg-foreground/[0.05] px-2 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-40";

const CONTROL_HINTS: [string, string][] = [
  ["Drag", "pan"],
  ["Click", "seek"],
  ["Shift + drag", "select loop"],
  ["Scroll", "zoom"],
  ["Shift + scroll", "pan"],
  ["Right-click", "markers"],
  ["Space", "play / pause"],
  ["B", "back to loop start"],
];

function TransportButton({
  label,
  onClick,
  children,
  primary,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center transition-colors ${
        primary
          ? "h-14 w-14 rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
          : "h-11 min-w-11 rounded-md px-3 text-sm font-medium tabular-nums hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}

export default function SlowDowner() {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, settings.speed));
  const { preservePitch, volume, maximized } = settings;

  const [file, setFile] = useState<{ id: string; name: string; url: string } | null>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/slow-downer", playing);
  const [error, setError] = useState<string | null>(null);
  const [loop, setLoop] = useState<LoopRegion | null>(null);
  const [loopOn, setLoopOn] = useState(false);
  const [view, setView] = useState<View>({ start: 0, span: 1 });
  const [dragOver, setDragOver] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [pendingDelete, setPendingDelete] = useState<LibraryEntry | null>(null);

  const mediaRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loopRef = useRef({ loop, loopOn });
  const fileTokenRef = useRef(0);
  const fileKeyRef = useRef<string | null>(null);

  useEffect(() => {
    loopRef.current = { loop, loopOn };
  }, [loop, loopOn]);

  // Apply speed, pitch and volume to the media element.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.defaultPlaybackRate = speed / 100;
    el.playbackRate = speed / 100;
    el.preservesPitch = preservePitch;
    el.volume = volume;
  }, [speed, preservePitch, volume, file]);

  // Files saved from earlier visits.
  useEffect(() => {
    let cancelled = false;
    void listFiles().then((entries) => {
      if (!cancelled) setLibrary(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Remember markers per file.
  useEffect(() => {
    if (fileKeyRef.current) saveMarkers(fileKeyRef.current, markers);
  }, [markers]);

  // Release the object URL when the file changes or the page closes.
  useEffect(() => {
    return () => {
      if (file) URL.revokeObjectURL(file.url);
    };
  }, [file]);

  // Keep the playhead moving and enforce the loop while playing.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const el = mediaRef.current;
      if (el) {
        let t = el.currentTime;
        const { loop: region, loopOn: on } = loopRef.current;
        if (on && region && t >= region.end) {
          el.currentTime = region.start;
          t = region.start;
        }
        setTime(t);
        setView((v) => {
          if (v.span >= el.duration || (t >= v.start && t <= v.start + v.span)) return v;
          return { ...v, start: Math.max(0, Math.min(el.duration - v.span, t - v.span * 0.1)) };
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function loadFile(next: File, remember = true) {
    const token = ++fileTokenRef.current;
    mediaRef.current?.pause();
    setPlaying(false);
    setError(null);
    setPeaks(null);
    setLoop(null);
    setLoopOn(false);
    setTime(0);
    setDuration(0);
    setView({ start: 0, span: 1 });
    fileKeyRef.current = fileKeyOf(next);
    setMarkers(loadMarkers(fileKeyRef.current));
    setMenu(null);
    setFile({ id: fileId(next), name: next.name, url: URL.createObjectURL(next) });

    if (remember) {
      void saveFile(next)
        .then(() => listFiles())
        .then(setLibrary);
    }

    setAnalyzing(true);
    analyzeAudio(next)
      .then((result) => {
        if (token === fileTokenRef.current) setPeaks(result);
      })
      .catch(() => {
        // The file can still play; we just can't draw its waveform.
      })
      .finally(() => {
        if (token === fileTokenRef.current) setAnalyzing(false);
      });
  }

  function closeFile() {
    fileTokenRef.current++;
    mediaRef.current?.pause();
    fileKeyRef.current = null;
    setPlaying(false);
    setFile(null);
    setPeaks(null);
    setAnalyzing(false);
    setLoop(null);
    setLoopOn(false);
    setMarkers([]);
    setMenu(null);
    setTime(0);
    setDuration(0);
    setError(null);
  }

  async function confirmDelete(entry: LibraryEntry) {
    setPendingDelete(null);
    await deleteFile(entry.id);
    saveMarkers(entry.id, []);
    if (file?.id === entry.id) closeFile();
    setLibrary(await listFiles());
  }

  async function openSaved(entry: LibraryEntry) {
    const saved = await getFile(entry.id);
    if (saved) loadFile(saved, false);
    else {
      setError("That file is no longer stored in this browser.");
      setLibrary(await listFiles());
    }
  }

  async function removeSaved(entry: LibraryEntry) {
    await deleteFile(entry.id);
    setLibrary(await listFiles());
  }

  function seek(t: number) {
    const el = mediaRef.current;
    if (!el || !duration) return;
    const clamped = Math.min(duration, Math.max(0, t));
    el.currentTime = clamped;
    setTime(clamped);
  }

  function togglePlay() {
    const el = mediaRef.current;
    if (!el || !file) return;
    if (el.paused) {
      if (loopOn && loop && (el.currentTime < loop.start || el.currentTime >= loop.end)) {
        el.currentTime = loop.start;
      }
      void el.play().catch(() => setError("Couldn't play this file."));
    } else {
      el.pause();
    }
  }

  useSpaceToggle(togglePlay, file !== null);

  /** Back to the start of the loop (or of the file, with no loop on); keeps playing if it was. */
  function toLoopStart() {
    seek(loopOn && loop ? loop.start : 0);
  }

  const toLoopStartRef = useRef(toLoopStart);
  useEffect(() => {
    toLoopStartRef.current = toLoopStart;
  });
  useEffect(() => {
    if (!file) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "b" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog']")) return;
      e.preventDefault();
      toLoopStartRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [file]);

  function updateLoop(region: LoopRegion) {
    setLoop(region);
    setLoopOn(true);
  }

  function setEdge(edge: "start" | "end", t: number) {
    const clamped = Math.min(duration, Math.max(0, t));
    setLoop((prev) => {
      const base = prev ?? { start: clamped, end: Math.min(duration, clamped + 5) };
      const next = { ...base, [edge]: clamped };
      if (next.end - next.start < 0.05) {
        if (edge === "start") next.start = Math.max(0, next.end - 0.05);
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

  /** Zoom around the playhead when it's on screen, otherwise around the middle of the view. */
  function zoom(factor: number) {
    const centre = view.start + view.span / 2;
    zoomAt(factor, time >= view.start && time <= view.start + view.span ? time : centre);
  }

  function panBy(seconds: number) {
    setView((v) => ({
      ...v,
      start: Math.max(0, Math.min(Math.max(0, duration - v.span), v.start + seconds)),
    }));
  }

  function zoomToLoop() {
    if (!loop) return;
    const length = loop.end - loop.start;
    const span = Math.min(duration, Math.max(MIN_SPAN, length * 1.3));
    const start = Math.max(0, Math.min(duration - span, loop.start - (span - length) / 2));
    setView({ start, span });
  }

  function updateMarker(id: string, patch: Partial<Marker>) {
    setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function addMarker(t: number) {
    setMarkers((prev) =>
      [
        ...prev,
        {
          id: makeId(),
          time: Math.min(duration, Math.max(0, t)),
          label: `Marker ${prev.length + 1}`,
          note: "",
        },
      ].sort((a, b) => a.time - b.time),
    );
  }

  function playFrom(t: number) {
    seek(t);
    const el = mediaRef.current;
    if (el?.paused) void el.play().catch(() => setError("Couldn't play this file."));
  }

  function openMenu(info: { time: number; x: number; y: number; markerId: string | null }) {
    const marker = markers.find((m) => m.id === info.markerId);
    const t = marker ? marker.time : info.time;
    const common: MenuItem[] = [
      { label: "Set loop start here", onSelect: () => setEdge("start", t) },
      { label: "Set loop end here", onSelect: () => setEdge("end", t) },
      ...(loop
        ? [
            { label: "Zoom to loop", onSelect: zoomToLoop },
            {
              label: "Clear loop",
              onSelect: () => {
                setLoop(null);
                setLoopOn(false);
              },
            },
          ]
        : []),
    ];
    setMenu({
      x: info.x,
      y: info.y,
      items: marker
        ? [
            { label: "Go to marker", onSelect: () => seek(marker.time) },
            ...common,
            {
              label: "Delete marker",
              danger: true,
              onSelect: () => setMarkers((prev) => prev.filter((m) => m.id !== marker.id)),
            },
          ]
        : [
            { label: "Add marker here", onSelect: () => addMarker(t) },
            { label: "Play from here", onSelect: () => playFrom(t) },
            ...common,
          ],
    });
  }

  const zoomed = duration > 0 && view.span < duration - 0.01;

  return (
    <ToolLayout
      title="Slow Downer"
      presets={toolPresets("slow-downer", settings, updateSettings, ["maximized"])}
      layout="stacked"
      options={
        <OptionsCard id="slow-downer">
          <OptionSection title="Speed" icon={StopwatchIcon} summary={`${speed}%`}>
            <label className="flex flex-col gap-2 text-sm">
              <span className="flex items-center justify-between font-medium text-muted">
                Playback speed
                <span className="tabular-nums text-foreground">{speed}%</span>
              </span>
              <input
                type="range"
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={5}
                value={speed}
                onChange={(e) => updateSettings({ speed: Number(e.target.value) })}
                style={sliderStyle(speed, MIN_SPEED, MAX_SPEED)}
                className="slider h-6 w-full cursor-pointer"
              />
            </label>
            <Hint>How fast the file plays back, as a percentage of its original speed.</Hint>
            <div className="flex flex-wrap gap-2">
              {SPEED_PRESETS.map((preset) => (
                <PoolPill key={preset} on={speed === preset} onClick={() => updateSettings({ speed: preset })} plainClassName="rounded-md px-3 py-1.5 text-sm font-medium tabular-nums">
                  {preset}%
                </PoolPill>
              ))}
            </div>
            <SwitchRow
              label="Keep original pitch"
              checked={preservePitch}
              onChange={(checked) => updateSettings({ preservePitch: checked })}
              hint="Corrects the pitch so slowing down doesn't also drop it (or speeding up raise it)."
            />
          </OptionSection>

          <OptionSection title="Volume" icon={SpeakerIcon} summary={`${Math.round(volume * 100)}%`}>
            <label className="flex flex-col gap-2 text-sm">
              <span className="flex items-center justify-between font-medium text-muted">
                Volume
                <span className="tabular-nums text-foreground">{Math.round(volume * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
                style={sliderStyle(volume, 0, 1)}
                className="slider h-6 w-full cursor-pointer"
              />
            </label>
            <Hint>Playback volume for this file.</Hint>
          </OptionSection>

          <OptionSection title="Markers" icon={FlagIcon} summary={markers.length ? `${markers.length}` : "None"}>
            {markers.length === 0 ? (
              <p className="text-sm text-muted">
                No markers yet. Right-click the waveform to add one at that spot.
              </p>
            ) : (
              <ul className="flex max-h-96 flex-col divide-y divide-foreground/10 overflow-y-auto pr-1">
                {markers.map((marker) => (
                  <li
                    key={marker.id}
                    className="flex flex-col gap-1.5 py-2 text-sm first:pt-0"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => seek(marker.time)}
                        title="Jump to marker"
                        className="h-8 w-16 shrink-0 rounded-md bg-foreground/[0.05] px-2 text-left tabular-nums transition-colors hover:bg-surface-hover"
                      >
                        {formatTime(marker.time)}
                      </button>
                      <input
                        value={marker.label}
                        onChange={(e) => updateMarker(marker.id, { label: e.target.value })}
                        aria-label="Marker name"
                        className="h-8 min-w-0 flex-1 rounded-md bg-foreground/[0.05] px-2 outline-none focus:ring-2 focus:ring-accent/40"
                      />
                      <button
                        type="button"
                        onClick={() => setMarkers((prev) => prev.filter((m) => m.id !== marker.id))}
                        aria-label={`Delete ${marker.label}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                      >
                        ✕
                      </button>
                    </div>
                    <textarea
                      value={marker.note}
                      onChange={(e) => updateMarker(marker.id, { note: e.target.value })}
                      placeholder="Add notes…"
                      aria-label={`Notes for ${marker.label}`}
                      rows={2}
                      className="w-full resize-y rounded-md bg-foreground/[0.05] px-2 py-1.5 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/40"
                    />
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => addMarker(time)}
              disabled={!file}
              className="inline-flex h-8 items-center justify-center self-start rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              Add marker at playhead
            </button>
          </OptionSection>
        </OptionsCard>
      }
    >
      <video
        ref={mediaRef}
        src={file?.url}
        playsInline
        preload="auto"
        className="hidden"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(d);
          setView({ start: 0, span: d });
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          const el = mediaRef.current;
          if (el && loopRef.current.loopOn && loopRef.current.loop) {
            el.currentTime = loopRef.current.loop.start;
            void el.play();
          } else {
            setPlaying(false);
          }
        }}
        onError={() => file && setError("This file couldn't be played by your browser.")}
      />

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (chosen) loadFile(chosen);
          e.target.value = "";
        }}
      />

      {!file ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) loadFile(dropped);
            }}
            className={`flex w-full flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 transition-colors ${
              dragOver ? "border-accent bg-accent/10" : "border-foreground/15"
            }`}
          >
            <p className="text-base font-medium">Drop an audio or video file here</p>
            <p className="max-w-xs text-sm text-muted">
              MP3, WAV, M4A, FLAC, MP4 and more. For video files only the audio is used. Nothing is
              uploaded — files are saved in this browser so they&apos;re here next time.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-1 inline-flex h-12 items-center rounded-full bg-accent px-8 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              Choose a file
            </button>
          </div>
          {library.length > 0 && (
            <section
              aria-label="Saved files"
              className="flex w-full max-w-2xl flex-col gap-2 text-left"
            >
              <h2 className="text-sm font-medium">Saved in this browser</h2>
              <ul className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
                {library.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-surface-hover"
                  >
                    <button
                      type="button"
                      onClick={() => void openSaved(entry)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate font-medium">{entry.name}</span>
                      <span className="text-xs text-muted">{formatSize(entry.size)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeSaved(entry)}
                      aria-label={`Remove ${entry.name}`}
                      title="Remove from this browser"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-danger"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <div className="flex w-full justify-start">
            <Select
              value={file.id}
              onChange={(id) => {
                if (id === ADD_FILE_VALUE) inputRef.current?.click();
                else if (id !== file.id) {
                  const entry = library.find((e) => e.id === id);
                  if (entry) void openSaved(entry);
                }
              }}
              options={[
                ...(library.some((e) => e.id === file.id)
                  ? []
                  : [{ value: file.id, label: file.name }]),
                ...library.map((e) => ({
                  value: e.id,
                  label: e.name,
                  onDelete: () => setPendingDelete(e),
                })),
                {
                  value: ADD_FILE_VALUE,
                  label: "Add new file…",
                  icon: <PlusIcon className="h-4 w-4" />,
                },
              ]}
              className="w-full max-w-md font-medium"
            />
          </div>

          <p className="text-5xl font-semibold tabular-nums tracking-tight">
            {formatTime(time)}
            <span className="text-xl font-medium text-muted"> / {formatTime(duration)}</span>
          </p>

          <div className={`relative w-full ${maximized ? "min-h-64 flex-1" : ""}`}>
            <Waveform
              peaks={peaks}
              duration={duration}
              view={view}
              time={time}
              loop={loop}
              loopActive={loopOn}
              onSeek={seek}
              onLoopChange={updateLoop}
              onLoopCommit={(region) => {
                if (playing) seek(region.start);
              }}
              markers={markers}
              fill={maximized}
              onContextMenu={openMenu}
              onZoomAt={zoomAt}
              onPanBy={panBy}
            />
            {loop && (
              <button
                type="button"
                onClick={() => setLoopOn((on) => !on)}
                aria-pressed={loopOn}
                aria-label={loopOn ? "Looping — click to turn off" : "Loop off — click to turn on"}
                title={loopOn ? "Looping — click to turn off" : "Loop off — click to turn on"}
                className={`absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                  loopOn
                    ? "border-accent bg-accent text-accent-foreground hover:bg-accent-hover"
                    : "border-foreground/15 bg-surface text-muted hover:text-foreground"
                }`}
              >
                <RepeatIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex w-full items-center justify-between text-xs text-muted">
            <span>
              {analyzing ? "Analyzing audio…" : peaks ? "" : "Waveform unavailable for this file"}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => panBy(-view.span * 0.25)}
                disabled={!zoomed}
                aria-label="Pan left"
                title="Pan left"
                className={zoomButton}
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => panBy(view.span * 0.25)}
                disabled={!zoomed}
                aria-label="Pan right"
                title="Pan right"
                className={zoomButton}
              >
                ▶
              </button>
              <span className="mx-1 h-5 w-px bg-foreground/10" />
              <button
                type="button"
                onClick={() => zoom(1.5)}
                aria-label="Zoom out"
                title="Zoom out"
                className={zoomButton}
              >
                −
              </button>
              <span className="w-12 text-center tabular-nums">
                {duration > 0 ? `${(duration / view.span).toFixed(1)}×` : ""}
              </span>
              <button
                type="button"
                onClick={() => zoom(1 / 1.5)}
                aria-label="Zoom in"
                title="Zoom in"
                className={zoomButton}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setView({ start: 0, span: duration })}
                disabled={!zoomed}
                className={`${zoomButton} px-3`}
              >
                Fit
              </button>
              <span className="mx-1 h-5 w-px bg-foreground/10" />
              <button
                type="button"
                onClick={() => updateSettings({ maximized: !maximized })}
                aria-pressed={maximized}
                aria-label={maximized ? "Shrink waveform" : "Maximise waveform height"}
                title={maximized ? "Shrink waveform" : "Maximise waveform height"}
                className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                  maximized
                    ? "border-accent bg-accent text-accent-foreground hover:bg-accent-hover"
                    : "border-foreground/15 hover:bg-surface-hover"
                }`}
              >
                {maximized ? (
                  <ShrinkHeightIcon className="h-4 w-4" />
                ) : (
                  <ExpandHeightIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <WaveScrollbar
            view={view}
            duration={duration}
            onChange={(start) => setView((v) => ({ ...v, start }))}
          />

          <div className="flex items-center gap-3">
            <TransportButton label={loopOn && loop ? "Back to loop start (B)" : "Back to the start (B)"} onClick={toLoopStart}>
              <SkipForwardIcon className="h-5 w-5 -scale-x-100" />
            </TransportButton>
            <TransportButton
              label={`Back ${SKIP_SECONDS} seconds`}
              onClick={() => seek(time - SKIP_SECONDS)}
            >
              −{SKIP_SECONDS}s
            </TransportButton>
            <TransportButton label={playing ? "Pause" : "Play"} onClick={togglePlay} primary>
              {playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
            </TransportButton>
            <TransportButton
              label={`Forward ${SKIP_SECONDS} seconds`}
              onClick={() => seek(time + SKIP_SECONDS)}
            >
              +{SKIP_SECONDS}s
            </TransportButton>
          </div>

          <ul
            aria-label="Controls"
            className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-xs text-muted"
          >
            {CONTROL_HINTS.map(([keys, action]) => (
              <li key={keys}>
                <KeyHint.Key>{keys}</KeyHint.Key> {action}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {pendingDelete && (
        <ConfirmDialog
          title="Delete this file?"
          message={`"${pendingDelete.name}" will be removed from this browser, along with its markers and notes. You can add the file again later.`}
          confirmLabel="Delete"
          onConfirm={() => void confirmDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </ToolLayout>
  );
}
