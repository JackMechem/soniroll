"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useEffect, useRef, useState } from "react";
import { DisclosureSummary } from "@/components/Disclosure";
import ContextMenu, { MenuItem, MenuState } from "@/components/ContextMenu";
import Hint from "@/components/Hint";
import { AUDIO_OR_VIDEO, OpenFileButton, useFilePicker } from "@/components/files/FilePicker";
import { OptionSection, OptionsCard } from "@/components/OptionsCard";
import KeyHint from "@/components/KeyHint";
import PromptDialog from "@/components/PromptDialog";
import SwitchRow from "@/components/SwitchRow";
import ToolLayout from "@/components/ToolLayout";
import { ChipsModeContext, SettingsBar } from "@/components/SettingsBar";
import { toolPresets } from "@/lib/toolPresets";
import WaveScrollbar from "@/components/WaveScrollbar";
import Waveform, { LoopRegion, View } from "@/components/Waveform";
import {
  CloseIcon,
  DotsVerticalIcon,
  ExpandHeightIcon,
  FlagIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  ShrinkHeightIcon,
  SkipForwardIcon,
  SpeakerIcon,
  StopwatchIcon,
  UploadIcon,
} from "@/components/tools";
import { Peaks, analyzeAudio, formatTime } from "@/lib/audioFile";
import { LibraryEntry, deleteFile, getFile, listFiles, saveFile } from "@/lib/fileLibrary";
import { Marker, SavedLoop, fileKeyOf, loadLoops, loadMarkers, saveLoops, saveMarkers } from "@/lib/markers";
import { makeId } from "@/lib/types";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useToolActivity } from "@/lib/toolTime";
import { usePaneKeyGuard } from "@/lib/paneContext";

const SETTINGS_KEY = "jam-practice-slow-downer";
const DEFAULT_SETTINGS = { speed: 100, preservePitch: true, volume: 1, maximized: false };

const MIN_SPEED = 25;
const MAX_SPEED = 150;
const SPEED_PRESETS = [50, 60, 70, 80, 90, 100];
const SKIP_SECONDS = 5;
const MIN_SPAN = 2;

function sliderStyle(value: number, min: number, max: number) {
  return { "--progress": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties;
}

/** Hidden on touch screens, which have no keyboard, Shift or right-click. */
const MOUSE_ONLY = "[@media(pointer:coarse)]:hidden";
const TOUCH_ONLY = "hidden [@media(pointer:coarse)]:inline";

/** The shortest loop the Loop start / Loop end buttons make, in seconds. */
const MIN_LOOP_SECONDS = 0.05;

const loopButton =
  "inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-40";

/** The waveform toolbar's buttons: full-contrast fills, 36px (40px on touch screens). */
const zoomButton =
  "flex h-9 min-w-9 items-center justify-center rounded-md bg-foreground/[0.05] px-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40 pointer-coarse:h-10 pointer-coarse:min-w-10";

const CONTROL_HINTS: [string, string][] = [
  ["Drag", "pan"],
  ["Click", "seek"],
  ["Shift + drag", "select loop"],
  ["Scroll", "zoom"],
  ["Shift + scroll", "pan"],
  ["Right-click", "markers and loops"],
  ["Drag a marker", "move it"],
  ["Space", "play / pause"],
  ["B", "back to loop start"],
  ["1–9, 0", "go to marker 1–10"],
];

/** Two loops this close (in seconds) at both ends count as the same loop. */
const SAME_LOOP = 0.01;
function sameLoop(a: { start: number; end: number }, b: { start: number; end: number }) {
  return Math.abs(a.start - b.start) < SAME_LOOP && Math.abs(a.end - b.end) < SAME_LOOP;
}

/** A marker counts as being at a loop's edge within this many seconds (for naming a saved loop). */
const AT_MARKER = 0.05;

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
          : "h-11 min-w-11 rounded-full bg-foreground/[0.05] px-3 text-sm font-medium tabular-nums hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}

/** `openStored`: a stored file to open straight away (`<kind>:<id>`, from "Open in" in Files). */
export default function SlowDowner({ openStored }: { openStored?: string }) {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, settings.speed));
  const { preservePitch, volume, maximized } = settings;

  const [file, setFile] = useState<{ name: string; type: string; url: string } | null>(null);
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
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [loops, setLoops] = useState<SavedLoop[]>([]);
  const [renaming, setRenaming] = useState<Marker | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loopNote, setLoopNote] = useState<string | null>(null);
  const loopNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mediaRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef({ loop, loopOn });
  const fileTokenRef = useRef(0);
  const fileKeyRef = useRef<string | null>(null);
  /** The saved loop the current loop is, if it's one. */
  const currentSaved = loop ? loops.find((l) => sameLoop(l, loop)) : undefined;

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

  // Remember markers and saved loops per file.
  useEffect(() => {
    if (fileKeyRef.current) saveMarkers(fileKeyRef.current, markers);
  }, [markers]);
  useEffect(() => {
    if (fileKeyRef.current) saveLoops(fileKeyRef.current, loops);
  }, [loops]);

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
    setLoops(loadLoops(fileKeyRef.current));
    setMenu(null);
    setFile({ name: next.name, type: next.type, url: URL.createObjectURL(next) });

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
    setLoops([]);
    setMenu(null);
    setTime(0);
    setDuration(0);
    setError(null);
  }

  /** Deletes a file kept in this browser (signed out), with its markers and saved loops. */
  async function confirmDelete(entry: LibraryEntry) {
    await deleteFile(entry.id);
    saveMarkers(entry.id, []);
    saveLoops(entry.id, []);
    if (fileKeyRef.current === entry.id) closeFile();
    setLibrary(await listFiles());
  }

  /** Opens a file kept in this browser. Signed in, it's saved to Files and the browser's copy goes
      (it was kept here from before files went to Files). */
  async function openSaved(entry: LibraryEntry) {
    const saved = await getFile(entry.id);
    if (!saved) {
      setError("That file is no longer stored in this browser.");
      setLibrary(await listFiles());
      return;
    }
    loadFile(saved, false);
    if (isAuthenticated && (await picker.save(saved))) await removeSaved(entry);
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

  // Opening a file: the dialog (your Files, or Upload), or a file dropped anywhere on the page.
  // Signed in, a file from this device is saved to Files (once); signed out it's kept in this
  // browser, as before.
  const { isAuthenticated } = useConvexAuth();
  const picker = useFilePicker({
    filter: AUDIO_OR_VIDEO,
    saveToFiles: true,
    dropInto: "Slow Downer",
    openStored,
    onFile: (next, from) => loadFile(next, !from && !isAuthenticated),
    local: {
      title: "Only in this browser",
      files: library,
      open: (id) => {
        const entry = library.find((e) => e.id === id);
        if (entry) void openSaved(entry);
      },
      remove: (id) => {
        const entry = library.find((e) => e.id === id);
        if (entry) void confirmDelete(entry);
      },
      removeMessage: "It's removed from this browser, along with its markers, notes and saved loops. You can add the file again later.",
    },
  });

  /** Back to the start of the loop (or of the file, with no loop on); keeps playing if it was. */
  function toLoopStart() {
    seek(loopOn && loop ? loop.start : 0);
  }

  /** Scrolls a zoomed-in view so `t` is on screen (playing does this itself as it goes). */
  function reveal(t: number) {
    setView((v) => {
      if (v.span >= duration || (t >= v.start && t <= v.start + v.span)) return v;
      return { ...v, start: Math.max(0, Math.min(duration - v.span, t - v.span * 0.1)) };
    });
  }

  /** Goes to a marker by its number in the list (1 is the first along the song); keeps playing if
      it was. */
  function goToMarker(n: number) {
    const marker = markers[n - 1];
    if (!marker) return;
    seek(marker.time);
    reveal(marker.time);
  }

  const keysRef = useRef({ toLoopStart, goToMarker });
  const forThisPane = usePaneKeyGuard();
  useEffect(() => {
    keysRef.current = { toLoopStart, goToMarker };
  });
  useEffect(() => {
    if (!file) return;
    function onKeyDown(e: KeyboardEvent) {
      // B: back to the loop start. 1–9 and 0: markers 1–10 (Shift allowed: some keyboards need it
      // for digits).
      const key = e.key.toLowerCase();
      const digit = /^[0-9]$/.test(key) ? (key === "0" ? 10 : Number(key)) : 0;
      if ((key !== "b" && !digit) || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !forThisPane(e)) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog']")) return;
      e.preventDefault();
      if (digit) keysRef.current.goToMarker(digit);
      else keysRef.current.toLoopStart();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [file, forThisPane]);

  function updateLoop(region: LoopRegion) {
    setLoop(region);
    setLoopOn(true);
  }

  /** Sets one end of the loop. With no loop yet, a new 5-second loop starts (or ends) there. A
      start past the loop's end starts a new 5-second loop there (moving on through the song); an
      end at or before the start is ignored, with a short note saying why (it used to make a new
      loop somewhere unexpected). */
  function setEdge(edge: "start" | "end", t: number) {
    const clamped = Math.min(duration, Math.max(0, t));
    let next: LoopRegion;
    if (edge === "start") {
      next = loop && clamped < loop.end - MIN_LOOP_SECONDS ? { ...loop, start: clamped } : { start: clamped, end: Math.min(duration, clamped + 5) };
      if (next.end - next.start < MIN_LOOP_SECONDS) next.start = Math.max(0, next.end - MIN_LOOP_SECONDS);
    } else {
      if (clamped <= (loop ? loop.start : 0) + MIN_LOOP_SECONDS) return showLoopNote("End must be after the start");
      next = loop ? { ...loop, end: clamped } : { start: Math.max(0, clamped - 5), end: clamped };
    }
    setLoopNote(null);
    setLoop(next);
    setLoopOn(true);
  }

  /** A short note under the loop buttons that clears itself. */
  function showLoopNote(text: string) {
    setLoopNote(text);
    if (loopNoteTimer.current) clearTimeout(loopNoteTimer.current);
    loopNoteTimer.current = setTimeout(() => setLoopNote(null), 3000);
  }

  function clearLoop() {
    setLoop(null);
    setLoopOn(false);
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

  /** Dragging a marker on the waveform; the list is put back in time order when it's let go. */
  function moveMarker(id: string, t: number, final: boolean) {
    setMarkers((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, time: Math.min(duration, Math.max(0, t)) } : m));
      return final ? next.sort((a, b) => a.time - b.time) : next;
    });
  }

  function deleteMarker(id: string) {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }

  /** Loops from `start` to `end` (both kept inside the file) and goes to the start. */
  function loopBetween(start: number, end: number) {
    const s = Math.max(0, start);
    const e = Math.min(duration, end);
    if (e - s < MIN_LOOP_SECONDS) return showLoopNote("Those markers are too close together to loop");
    setLoopNote(null);
    setLoop({ start: s, end: e });
    setLoopOn(true);
    seek(s);
    reveal(s);
  }

  /** The markers either side of a time (the file's start or end where there's none). */
  function markersAround(t: number) {
    const before = [...markers].reverse().find((m) => m.time <= t);
    const after = markers.find((m) => m.time > t);
    return { start: before?.time ?? 0, end: after?.time ?? duration };
  }

  /** What the ⋮ menu (in the Markers list) and a right-click on a marker offer. */
  function markerMenuItems(marker: Marker, withRename: boolean): MenuItem[] {
    const index = markers.findIndex((m) => m.id === marker.id);
    const next = markers[index + 1];
    return [
      { label: "Go to marker", hint: index >= 0 && index < 10 ? String((index + 1) % 10) : undefined, onSelect: () => goToMarker(index + 1) },
      { label: "Play from here", onSelect: () => playFrom(marker.time) },
      { label: "Loop from this marker", divider: true, onSelect: () => setEdge("start", marker.time) },
      { label: "Loop to this marker", onSelect: () => setEdge("end", marker.time) },
      {
        label: next ? "Loop to the next marker" : "Loop to the end",
        detail: next ? `To ${next.label || "the next marker"}` : undefined,
        onSelect: () => loopBetween(marker.time, next ? next.time : duration),
      },
      ...(withRename ? [{ label: "Rename marker", divider: true, onSelect: () => setRenaming(marker) }] : []),
      { label: "Delete marker", danger: true, divider: !withRename, onSelect: () => deleteMarker(marker.id) },
    ];
  }

  /** A sensible name for a new saved loop: the marker names at its ends, or "Loop 3". */
  function loopName(region: LoopRegion) {
    const at = (t: number) => markers.find((m) => Math.abs(m.time - t) < AT_MARKER)?.label.trim();
    const from = at(region.start);
    const to = at(region.end);
    if (from && to) return `${from} to ${to}`;
    if (from) return from;
    let n = 1;
    while (loops.some((l) => l.name === `Loop ${n}`)) n++;
    return `Loop ${n}`;
  }

  /** Saves the current loop to come back to (not twice). */
  function saveLoop() {
    if (!loop) return;
    const existing = loops.find((l) => sameLoop(l, loop));
    if (existing) return showLoopNote(`Already saved as ${existing.name}`);
    const name = loopName(loop);
    setLoops((prev) => [...prev, { id: makeId(), name, start: loop.start, end: loop.end }].sort((a, b) => a.start - b.start));
    showLoopNote(`Saved as ${name}`);
  }

  function updateSavedLoop(id: string, patch: Partial<SavedLoop>) {
    setLoops((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  /** Back to a saved loop: loop it and go to its start. */
  function openSavedLoop(saved: SavedLoop) {
    loopBetween(saved.start, saved.end);
  }

  function playFrom(t: number) {
    seek(t);
    const el = mediaRef.current;
    if (el?.paused) void el.play().catch(() => setError("Couldn't play this file."));
  }

  function openMenu(info: { time: number; x: number; y: number; markerId: string | null }) {
    const marker = markers.find((m) => m.id === info.markerId);
    const t = marker ? marker.time : info.time;
    const around = markersAround(t);
    // The current loop's own items, at the end of either menu.
    const loopItems: MenuItem[] = loop
      ? [
          ...(currentSaved ? [] : [{ label: "Save loop", divider: true, onSelect: saveLoop }]),
          { label: "Zoom to loop", divider: !!currentSaved, onSelect: zoomToLoop },
          { label: "Clear loop", onSelect: clearLoop },
        ]
      : [];
    setMenu({
      x: info.x,
      y: info.y,
      width: 232,
      items: marker
        ? [...markerMenuItems(marker, true), ...loopItems]
        : [
            { label: "Add marker here", onSelect: () => addMarker(t) },
            { label: "Play from here", onSelect: () => playFrom(t) },
            { label: "Set loop start here", divider: true, onSelect: () => setEdge("start", t) },
            { label: "Set loop end here", onSelect: () => setEdge("end", t) },
            ...(markers.length > 0
              ? [{ label: "Loop between markers", detail: `${formatTime(around.start)}–${formatTime(around.end)}`, onSelect: () => loopBetween(around.start, around.end) }]
              : []),
            ...loopItems,
          ],
    });
  }

  const zoomed = duration > 0 && view.span < duration - 0.01;

  // The options, as chips right under the main display (passing them to ToolLayout's `options`
  // would pin them to the bottom of the page, far below the drop zone on a big screen).
  const options = (
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
        {/* One choice, so one row of equal buttons (it fits a phone's sheet). */}
        <div className="grid grid-cols-6 gap-1.5">
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={speed === preset}
              onClick={() => updateSettings({ speed: preset })}
              className={`h-9 whitespace-nowrap rounded-full text-sm font-medium tabular-nums transition-colors ${
                speed === preset
                  ? "bg-accent text-accent-foreground"
                  : "bg-foreground/[0.05] text-foreground hover:bg-surface-hover"
              }`}
            >
              {preset}%
            </button>
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

      {/* Markers and loops belong to a file, so their chips wait until one is open. */}
      {file && (
      <OptionSection title="Markers" icon={FlagIcon} summary={markers.length ? `${markers.length}` : "None"}>
        {markers.length === 0 ? (
          <p className="text-sm text-muted">
            <span className={MOUSE_ONLY}>No markers yet. Right-click the waveform to add one at that spot, or add one at the playhead.</span>
            <span className={TOUCH_ONLY}>No markers yet. Move the playhead to a spot and tap Add marker.</span>
          </p>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y divide-foreground/10 overflow-y-auto pr-1">
            {markers.map((marker, i) => (
              <li
                key={marker.id}
                className="flex flex-col gap-1.5 py-2 text-sm first:pt-0"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToMarker(i + 1)}
                    title={i < 10 ? `Go to marker (${(i + 1) % 10})` : "Go to marker"}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2 text-left tabular-nums transition-colors hover:bg-surface-hover"
                  >
                    {/* The number key that goes to it (keyboards only). */}
                    {i < 10 && <span className={`w-2 text-xs text-muted ${MOUSE_ONLY}`}>{(i + 1) % 10}</span>}
                    <span className="w-12">{formatTime(marker.time)}</span>
                  </button>
                  <input
                    value={marker.label}
                    onChange={(e) => updateMarker(marker.id, { label: e.target.value })}
                    aria-label="Marker name"
                    className="h-8 min-w-0 flex-1 rounded-md bg-foreground/[0.05] px-2 outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenu({ x: r.right - 232, y: r.bottom + 4, width: 232, items: markerMenuItems(marker, false) });
                    }}
                    aria-label={`More for ${marker.label || "this marker"}`}
                    title="Loop from it, to it, or delete it"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  >
                    <DotsVerticalIcon className="h-4 w-4" />
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
        <Hint>
          Named points to jump between. Drag one along the waveform to move it. Its ⋮ menu loops from it, to it or to the next marker.
          With a keyboard, 1 to 9 go to the first nine markers and 0 to the tenth.
        </Hint>
      </OptionSection>
      )}

      {file && (
      <OptionSection title="Loops" icon={RepeatIcon} summary={loops.length ? `${loops.length} saved` : "None saved"}>
        {loops.length === 0 ? (
          <p className="text-sm text-muted">No saved loops yet. Make a loop, then save it to come back to it any time.</p>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y divide-foreground/10 overflow-y-auto pr-1">
            {loops.map((saved) => {
              const active = loopOn && currentSaved?.id === saved.id;
              return (
                <li key={saved.id} className="flex items-center gap-2 py-2 text-sm first:pt-0">
                  <button
                    type="button"
                    onClick={() => openSavedLoop(saved)}
                    aria-pressed={active}
                    title="Loop this"
                    className={`h-8 shrink-0 rounded-md px-2 tabular-nums transition-colors ${
                      active ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "bg-foreground/[0.05] hover:bg-surface-hover"
                    }`}
                  >
                    {formatTime(saved.start)}–{formatTime(saved.end)}
                  </button>
                  <input
                    value={saved.name}
                    onChange={(e) => updateSavedLoop(saved.id, { name: e.target.value })}
                    aria-label="Loop name"
                    className="h-8 min-w-0 flex-1 rounded-md bg-foreground/[0.05] px-2 outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button
                    type="button"
                    onClick={() => setLoops((prev) => prev.filter((l) => l.id !== saved.id))}
                    aria-label={`Delete ${saved.name || "this loop"}`}
                    title="Delete this saved loop"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={saveLoop}
          disabled={!loop || !!currentSaved}
          className="inline-flex h-8 items-center justify-center self-start rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {currentSaved ? `Saved as ${currentSaved.name || "a loop"}` : "Save current loop"}
        </button>
        <Hint>
          Loops you want to come back to, kept with this file in this browser. Pick one to loop it again; a new one is named after the
          markers at its ends, if it has any.
        </Hint>
      </OptionSection>
      )}
    </OptionsCard>
  );
  const optionChips = (
    <ChipsModeContext.Provider value={true}>
      <div className="flex w-full flex-col items-center gap-3 pt-2">
        <SettingsBar>{options}</SettingsBar>
      </div>
    </ChipsModeContext.Provider>
  );

  return (
    <ToolLayout
      title="Slow Downer"
      presets={toolPresets("slow-downer", settings, updateSettings, ["maximized"])}
      layout="stacked"
      // With a file open, from the top (centred, it left a blank band above the file picker).
      topAligned={!!file}
      options={null}
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

      {picker.elements}

      {!file ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-3 rounded-lg bg-foreground/[0.03] px-6 py-14">
          {/* Touch screens can't drop a file. */}
          <p className="text-base font-medium">
            <span className={MOUSE_ONLY}>Drop an audio or video file anywhere</span>
            <span className={TOUCH_ONLY}>Open an audio or video file</span>
          </p>
          <p className="max-w-sm text-sm text-muted">
            MP3, WAV, M4A, FLAC, MP4 and more. For video files only the audio is used.{" "}
            {isAuthenticated ? "Files you open are kept in your Files." : "Files are kept in this browser so they're here next time."}
          </p>
          <button
            type="button"
            onClick={picker.open}
            className="mt-1 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-8 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            <UploadIcon className="h-5 w-5" />
            Open a file
          </button>
          {picker.status}
        </div>
      ) : (
        <>
          <div className="flex w-full flex-col items-center gap-1">
            <OpenFileButton name={file.name} mimeType={file.type} onClick={picker.open} />
            {picker.status}
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
              numberMarkers
              onMarkerMove={moveMarker}
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

          <div className="flex w-full flex-wrap items-center justify-between gap-y-2 text-xs text-muted">
            {/* Touch screens have no Shift + drag, so say how to make a loop there (its own line). */}
            {peaks && !analyzing && (
              <p className="hidden basis-full text-center [@media(pointer:coarse)]:block">
                {loop ? "Drag the loop's edges to change it" : "Drag across the wave to loop a section"}
              </p>
            )}
            <span>{analyzing ? "Analyzing audio…" : peaks ? "" : "Waveform unavailable for this file"}</span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {/* Panning only means anything zoomed in, so the arrows only show then. */}
              {zoomed && (
                <>
                  <button
                    type="button"
                    onClick={() => panBy(-view.span * 0.25)}
                    aria-label="Pan left"
                    title="Pan left"
                    className={zoomButton}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => panBy(view.span * 0.25)}
                    aria-label="Pan right"
                    title="Pan right"
                    className={zoomButton}
                  >
                    ▶
                  </button>
                  <span className="mx-1 h-5 w-px bg-foreground/10" />
                </>
              )}
              <span className="mr-0.5 text-xs font-semibold text-muted">Zoom</span>
              <button
                type="button"
                onClick={() => zoom(1.5)}
                aria-label="Zoom out"
                title="Zoom out"
                className={zoomButton}
              >
                −
              </button>
              <span className="w-12 text-center tabular-nums text-foreground">
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
                title={maximized ? "Make the waveform shorter again" : "Make the waveform as tall as the page allows"}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors pointer-coarse:h-10 ${
                  maximized
                    ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                    : "bg-foreground/[0.05] text-foreground hover:bg-surface-hover"
                }`}
              >
                {maximized ? (
                  <ShrinkHeightIcon className="h-4 w-4" />
                ) : (
                  <ExpandHeightIcon className="h-4 w-4" />
                )}
                {maximized ? "Shorter" : "Taller"}
              </button>
            </div>
          </div>

          {/* Hidden (its space kept) until you zoom in: at 1.0× a full-width bar reads like progress. */}
          <WaveScrollbar
            hidden={!zoomed}
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

          {/* Loops and markers without Shift-drag or right-click (phones and tablets). */}
          <div role="group" aria-label="Loop and markers" className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => setEdge("start", time)} disabled={!duration} title="Start the loop at the playhead" className={loopButton}>
              <RepeatIcon className="h-4 w-4 text-muted" />
              Loop start
            </button>
            <button type="button" onClick={() => setEdge("end", time)} disabled={!duration} title="End the loop at the playhead" className={loopButton}>
              Loop end
            </button>
            {loop && (
              <span className={`flex min-w-0 items-baseline gap-1 text-sm tabular-nums ${loopOn ? "text-foreground" : "text-muted"}`} title={loopOn ? "The loop" : "The loop (off)"}>
                <span className="max-w-40 truncate">{currentSaved ? currentSaved.name || "Loop" : "Loop"}</span>
                {formatTime(loop.start)}–{formatTime(loop.end)}
              </span>
            )}
            {loop && !currentSaved && (
              <button type="button" onClick={saveLoop} title="Save this loop to come back to it" className={loopButton}>
                Save loop
              </button>
            )}
            <button type="button" onClick={clearLoop} disabled={!loop} className={loopButton}>
              Clear loop
            </button>
            <span className="mx-1 hidden h-5 w-px bg-foreground/10 sm:block" aria-hidden />
            <button type="button" onClick={() => addMarker(time)} disabled={!duration} title="Add a marker at the playhead" className={loopButton}>
              <FlagIcon className="h-4 w-4 text-muted" />
              Add marker
            </button>
          </div>
          <p role="status" aria-live="polite" className={`-mt-3 text-sm text-muted ${loopNote ? "" : "sr-only"}`}>
            {loopNote}
          </p>

          {/* Keyboard and mouse shortcuts, folded away (and not shown on touch screens). */}
          <details className={`w-full text-xs text-muted ${MOUSE_ONLY}`}>
            <DisclosureSummary className="mx-auto">Shortcuts</DisclosureSummary>
            <ul aria-label="Controls" className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
              {CONTROL_HINTS.map(([keys, action]) => (
                <li key={keys}>
                  <KeyHint.Key>{keys}</KeyHint.Key> {action}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {optionChips}

      {error && <p className="text-sm text-danger">{error}</p>}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {renaming && (
        <PromptDialog
          title="Rename marker"
          initialValue={renaming.label}
          onSubmit={(label) => {
            updateMarker(renaming.id, { label });
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
    </ToolLayout>
  );
}
