"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CloseIcon, MaximizeIcon, MinimizeIcon, PauseIcon, PlayIcon } from "@/components/tools";
import { type LoadedAudio, type Peaks, TimelinePlayer, loadAudio } from "@/lib/recordingPlayback";
import { type Recording, type RecordingMix, DEFAULT_MIX, recordingsApi } from "@/lib/recordings";
import { getServerThemeState, getThemeState, subscribeTheme } from "@/lib/theme";

const SONG_COLOR = "#6366f1";
const TAKE_COLOR = "#ef4444";
const RULER_H = 22;

type View = { start: number; span: number };

/** "1:05.3" / "-0:02.0". */
function formatClock(sec: number, tenths = true) {
  const sign = sec < 0 ? "-" : "";
  const a = Math.abs(sec);
  const m = Math.floor(a / 60);
  const s = a - m * 60;
  return `${sign}${m}:${(tenths ? s.toFixed(1) : Math.floor(s).toString()).padStart(tenths ? 4 : 2, "0")}`;
}

/** "+0:12.3" / "−0:01.5": where in the song the take starts. */
function formatOffset(sec: number) {
  return `${sec < 0 ? "−" : "+"}${formatClock(Math.abs(sec))}`;
}

const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

/** The ruler's labelled step for this zoom (a line every ≥70 px); minor lines fall halfway. */
function tickStep(span: number, width: number) {
  return TICK_STEPS.find((s) => (s / span) * width >= 70) ?? 600;
}

/** How close (px) a region edge has to get to a line before it snaps onto it. */
const SNAP_PX = 10;

type DrawTrack = { peaks: Peaks; start: number; duration: number; color: string; name: string; dim: boolean };

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function draw(canvas: HTMLCanvasElement, width: number, laneH: number, view: View, tracks: DrawTrack[]) {
  const height = RULER_H + laneH * tracks.length;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);
  const muted = cssVar("--muted");
  const bg = cssVar("--background");
  const xOf = (t: number) => ((t - view.start) / view.span) * width;

  // Ruler and beat-less time grid.
  g.fillStyle = bg;
  g.fillRect(0, 0, width, RULER_H);
  const step = tickStep(view.span, width);
  g.font = "11px ui-sans-serif, system-ui, sans-serif";
  g.textBaseline = "middle";
  for (let t = Math.ceil(view.start / step) * step; t <= view.start + view.span; t += step) {
    const x = Math.round(xOf(t));
    g.fillStyle = muted;
    g.globalAlpha = 0.9;
    g.fillRect(x, RULER_H - 7, 1, 7);
    g.fillText(formatClock(t, step < 1), x + 3, RULER_H / 2 - 1);
    g.globalAlpha = 0.12;
    g.fillRect(x, RULER_H, 1, height - RULER_H);
  }
  // Half-step lines (snap targets too), fainter.
  for (let t = Math.ceil(view.start / (step / 2)) * (step / 2); t <= view.start + view.span; t += step / 2) {
    const x = Math.round(xOf(t));
    g.globalAlpha = 0.5;
    g.fillRect(x, RULER_H - 3, 1, 3);
    g.globalAlpha = 0.06;
    g.fillRect(x, RULER_H, 1, height - RULER_H);
  }
  g.globalAlpha = 1;
  // The take's start, 0:00.
  g.fillStyle = muted;
  g.globalAlpha = 0.35;
  g.fillRect(Math.round(xOf(0)), RULER_H, 1, height - RULER_H);
  g.globalAlpha = 1;

  tracks.forEach((track, i) => {
    const top = RULER_H + i * laneH;
    g.fillStyle = muted;
    g.globalAlpha = 0.18;
    g.fillRect(0, top + laneH - 1, width, 1);
    const x0 = xOf(track.start);
    const x1 = xOf(track.start + track.duration);
    if (x1 < 0 || x0 > width) return;
    const rx = Math.max(-4, x0);
    const rw = Math.min(width + 4, x1) - rx;
    const rTop = top + 3;
    const rH = laneH - 7;
    g.globalAlpha = track.dim ? 0.35 : 1;
    // The region, like a DAW clip: tinted body, name strip, waveform.
    g.fillStyle = track.color;
    g.save();
    g.globalAlpha *= 0.22;
    g.beginPath();
    g.roundRect(rx, rTop, rw, rH, 5);
    g.fill();
    g.restore();
    g.save();
    g.beginPath();
    g.roundRect(rx, rTop, rw, rH, 5);
    g.clip();
    g.globalAlpha = track.dim ? 0.35 : 0.85;
    g.fillRect(rx, rTop, rw, 14);
    g.fillStyle = "#fff";
    g.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    g.fillText(track.name, Math.max(rx, 0) + 5, rTop + 7.5);
    g.fillStyle = track.color;
    g.globalAlpha = track.dim ? 0.35 : 1;
    const waveTop = rTop + 16;
    const waveH = rH - 18;
    const mid = waveTop + waveH / 2;
    const amp = (waveH / 2) * track.peaks.scale;
    const { min, max, perSec } = track.peaks;
    const from = Math.max(0, Math.floor(x0));
    const to = Math.min(width, Math.ceil(x1));
    const secPerPx = view.span / width;
    for (let px = from; px < to; px++) {
      const t = view.start + px * secPerPx - track.start;
      let b0 = Math.floor(t * perSec);
      let b1 = Math.max(b0 + 1, Math.floor((t + secPerPx) * perSec));
      b0 = Math.max(0, b0);
      b1 = Math.min(min.length, b1);
      let lo = 0;
      let hi = 0;
      for (let b = b0; b < b1; b++) {
        if (min[b] < lo) lo = min[b];
        if (max[b] > hi) hi = max[b];
      }
      const yTop = mid - Math.min(waveH / 2, hi * amp);
      const yBot = mid - Math.max(-waveH / 2, lo * amp);
      g.fillRect(px, yTop, 1, Math.max(1, yBot - yTop));
    }
    g.restore();
    g.globalAlpha = 1;
  });
}

type TrackUi = { mute: boolean; solo: boolean };

function TrackHeader({
  name,
  detail,
  color,
  volume,
  onVolume,
  ui,
  onUi,
  meterRef,
  height,
  hint,
}: {
  name: string;
  detail?: string;
  color: string;
  volume: number;
  onVolume: (v: number) => void;
  ui: TrackUi;
  onUi: (ui: TrackUi) => void;
  meterRef: (el: HTMLDivElement | null) => void;
  height: number;
  hint?: string;
}) {
  const button = "flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold";
  return (
    <div className="flex flex-col justify-center gap-1 border-b border-surface-hover/60 px-2 last:border-b-0" style={{ height }} title={hint}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="h-3 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={detail ?? name}>
          {name}
        </span>
        <span className="basis-full sm:hidden" />
        <button
          type="button"
          onClick={() => onUi({ ...ui, mute: !ui.mute })}
          aria-pressed={ui.mute}
          title="Mute"
          className={`${button} ${ui.mute ? "bg-danger text-white" : "bg-background text-muted hover:text-foreground"}`}
        >
          M
        </button>
        <button
          type="button"
          onClick={() => onUi({ ...ui, solo: !ui.solo })}
          aria-pressed={ui.solo}
          title="Solo"
          className={`${button} ${ui.solo ? "bg-accent text-accent-foreground" : "bg-background text-muted hover:text-foreground"}`}
        >
          S
        </button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-background">
        <div ref={meterRef} className="h-full w-0 rounded-full bg-[#22c55e]" />
      </div>
      <div className="hidden items-center gap-1.5 sm:flex">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => onVolume(Number(e.target.value) / 100)}
          aria-label={`${name} volume`}
          style={{ "--progress": `${Math.round(volume * 100)}%` } as React.CSSProperties}
          className="slider h-4 min-w-0 flex-1 cursor-pointer"
        />
        <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted">{Math.round(volume * 100)}%</span>
      </div>
    </div>
  );
}

/**
 * A take over its tune's song as a little DAW: a Song track and a Take track, each with a
 * header (mute, solo, level meter, volume fader) and its region drawn as a waveform on a shared
 * timeline (0:00 = the take's start) with a ruler and a playhead. Click or drag the ruler/lanes to
 * move the playhead; drag the Song region sideways to line it up with the take (or nudge it);
 * Ctrl/⌘+wheel or the − / + buttons zoom, the wheel scrolls sideways. Space plays/pauses (not
 * `compact`). Both files are decoded first (`lib/recordingPlayback.ts`), so seeking always
 * works. `mix` is controlled; every change goes to `onMixChange`.
 */
export default function MixPlayer({
  takeUrl,
  songUrl,
  takeName = "Take",
  songName = "Song",
  mix,
  onMixChange,
  compact = false,
  lazy = false,
}: {
  takeUrl: string;
  takeDurationSec?: number;
  songUrl: string;
  takeName?: string;
  songName?: string;
  mix: RecordingMix;
  onMixChange: (mix: RecordingMix) => void;
  compact?: boolean;
  lazy?: boolean;
}) {
  const [full, setFull] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [fullLaneH, setFullLaneH] = useState(160);
  const laneH = full ? fullLaneH : compact ? 58 : 84;
  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const [audio, setAudio] = useState<{ song: LoadedAudio; take: LoadedAudio } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<View>({ start: 0, span: 60 });
  const [width, setWidth] = useState(0);
  const [songUi, setSongUi] = useState<TrackUi>({ mute: false, solo: false });
  const [takeUi, setTakeUi] = useState<TrackUi>({ mute: false, solo: false });
  // While dragging the song region: its live offset (committed on release).
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [hoverSong, setHoverSong] = useState(false);
  // `lazy`: nothing downloads until Play is pressed (a list of takes stays light).
  const [active, setActive] = useState(!lazy);
  const autoplay = useRef(lazy);
  const theme = useSyncExternalStore(subscribeTheme, getThemeState, getServerThemeState);

  const player = useRef<TimelinePlayer | null>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const meters = useRef<(HTMLDivElement | null)[]>([null, null]);
  const viewRef = useRef(view);
  const endRef = useRef(0);
  const playingRef = useRef(false);

  const offset = dragOffset ?? mix.offsetSec;
  // Timeline: the take starts at 0, the song at -offset.
  const songStart = -offset;
  const songDur = audio?.song.buffer.duration ?? 0;
  const takeDur = audio?.take.buffer.duration ?? 0;
  const boundsStart = Math.min(0, songStart);
  const boundsEnd = Math.max(takeDur, songStart + songDur);

  // Load and decode both files.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.all([loadAudio(songUrl), loadAudio(takeUrl)])
      .then(([song, take]) => {
        if (cancelled) return;
        setAudio({ song, take });
        setView({ start: Math.min(0, -mix.offsetSec) - 0.5, span: Math.max(4, Math.max(take.buffer.duration, song.buffer.duration - mix.offsetSec) - Math.min(0, -mix.offsetSec) + 1) });
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the audio."));
    return () => {
      cancelled = true;
    };
    // The first fit uses the offset at load time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songUrl, takeUrl, active]);

  // One player per pair of files.
  useEffect(() => {
    if (!audio) return;
    const p = new TimelinePlayer([
      { buffer: audio.song.buffer, start: -mix.offsetSec },
      { buffer: audio.take.buffer, start: 0 },
    ]);
    player.current = p;
    if (autoplay.current) {
      autoplay.current = false;
      p.play(0);
    }
    return () => {
      p.dispose();
      if (player.current === p) player.current = null;
    };
    // The song's position is kept up to date by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);

  useEffect(() => {
    player.current?.setStart(0, songStart);
  }, [songStart, audio]);

  // Faders, mute and solo.
  useEffect(() => {
    const anySolo = songUi.solo || takeUi.solo;
    const gain = (vol: number, ui: TrackUi) => (ui.mute || (anySolo && !ui.solo) ? 0 : vol);
    player.current?.setGain(0, gain(mix.songVolume, songUi));
    player.current?.setGain(1, gain(mix.takeVolume, takeUi));
  }, [mix.songVolume, mix.takeVolume, songUi, takeUi, audio]);

  useEffect(() => {
    viewRef.current = view;
    endRef.current = boundsEnd;
  }, [view, boundsEnd]);

  // Width of the lanes column.
  useEffect(() => {
    const el = lanesRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [audio]);

  // Waveforms, ruler and regions.
  const anySolo = songUi.solo || takeUi.solo;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audio || width === 0) return;
    draw(canvas, width, laneH, view, [
      { peaks: audio.song.peaks, start: songStart, duration: songDur, color: SONG_COLOR, name: songName, dim: songUi.mute || (anySolo && !songUi.solo) },
      { peaks: audio.take.peaks, start: 0, duration: takeDur, color: TAKE_COLOR, name: takeName, dim: takeUi.mute || (anySolo && !takeUi.solo) },
    ]);
  }, [audio, width, view, songStart, songDur, takeDur, laneH, songName, takeName, songUi, takeUi, anySolo, theme]);

  // Playhead, clock, meters and follow-scrolling, every frame (no re-renders).
  useEffect(() => {
    if (!audio) return;
    let frame = 0;
    const tick = () => {
      const p = player.current;
      if (p) {
        let pos = p.position();
        if (p.playing && pos >= endRef.current) {
          p.pause();
          p.seek(endRef.current);
          pos = endRef.current;
        }
        if (p.playing !== playingRef.current) {
          playingRef.current = p.playing;
          setPlaying(p.playing);
        }
        const v = viewRef.current;
        const w = lanesRef.current?.clientWidth ?? 0;
        if (playheadRef.current) playheadRef.current.style.transform = `translateX(${((pos - v.start) / v.span) * w}px)`;
        if (clockRef.current) clockRef.current.textContent = formatClock(pos);
        meters.current.forEach((m, i) => {
          if (m) m.style.width = `${Math.round(Math.min(1, p.level(i) * 1.4) * 100)}%`;
        });
        if (p.playing && pos > v.start + v.span * 0.95) setView({ start: pos - v.span * 0.05, span: v.span });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audio]);

  function toggle() {
    const p = player.current;
    if (!p) return;
    if (p.playing) p.pause();
    else p.play(p.position() >= endRef.current - 0.05 ? Math.min(0, boundsStart) : p.position());
  }

  // Full screen: the two lanes share the height; Esc closes; the page behind doesn't scroll.
  useEffect(() => {
    if (!full) return;
    const el = tracksAreaRef.current;
    const ro = el ? new ResizeObserver(() => setFullLaneH(Math.min(window.innerWidth < 640 ? 190 : 340, Math.max(84, Math.floor((el.clientHeight - RULER_H - 2) / 2))))) : null;
    if (el) ro?.observe(el);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      ro?.disconnect();
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [full, audio]);

  // Space plays/pauses on the full view.
  useEffect(() => {
    if (compact && !full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable=true]") || t.tagName === "BUTTON")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Wheel: Ctrl/⌘ zooms at the pointer; otherwise sideways scroll pans.
  useEffect(() => {
    const el = lanesRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      const w = el.clientWidth || 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const at = v.start + ((e.clientX - el.getBoundingClientRect().left) / w) * v.span;
        const span = Math.min(3600, Math.max(0.5, v.span * Math.exp(e.deltaY * 0.002)));
        setView({ start: at - ((at - v.start) / v.span) * span, span });
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        e.preventDefault();
        const d = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        setView({ start: v.start + (d / w) * v.span, span: v.span });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [audio]);

  function zoom(factor: number) {
    const p = player.current;
    const center = p ? p.position() : view.start + view.span / 2;
    const span = Math.min(3600, Math.max(0.5, view.span * factor));
    const inView = center >= view.start && center <= view.start + view.span;
    const anchor = inView ? center : view.start + view.span / 2;
    setView({ start: anchor - ((anchor - view.start) / view.span) * span, span });
  }
  function fit() {
    setView({ start: boundsStart - 0.5, span: Math.max(4, boundsEnd - boundsStart + 1) });
  }

  // Pointer: drag the song region to line it up; anywhere else moves the playhead (and scrubs).
  // Touch waits to see which way the finger goes (a vertical swipe scrolls the page outside full
  // screen); two fingers pinch-zoom and scroll the timeline.
  type Drag =
    | { kind: "pending"; x: number; y: number; onSong: boolean }
    | { kind: "song"; x: number; offset: number }
    | { kind: "seek" }
    | { kind: "pinch"; dist: number; span: number; at: number };
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  function timeAt(clientX: number) {
    const el = lanesRef.current!;
    return view.start + ((clientX - el.getBoundingClientRect().left) / (el.clientWidth || 1)) * view.span;
  }
  function overSong(e: React.PointerEvent<HTMLDivElement>) {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const t = timeAt(e.clientX);
    return y >= RULER_H && y < RULER_H + laneH && t >= songStart && t <= songStart + songDur;
  }
  function pinchState() {
    const [a, b] = [...pointers.current.values()];
    return { mid: (a.x + b.x) / 2, dist: Math.max(10, Math.abs(a.x - b.x)) };
  }
  function startDrag(kind: "song" | "seek", e: React.PointerEvent<HTMLDivElement>, fromX: number) {
    if (kind === "song") {
      drag.current = { kind: "song", x: fromX, offset: mix.offsetSec };
      setDragOffset(mix.offsetSec);
    } else {
      drag.current = { kind: "seek" };
      player.current?.seek(Math.max(boundsStart, timeAt(e.clientX)));
    }
  }
  function cancelSongDrag() {
    setDragOffset(null);
    setSnapLine(null);
  }
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !audio) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      cancelSongDrag();
      const { mid, dist } = pinchState();
      drag.current = { kind: "pinch", dist, span: view.span, at: timeAt(mid) };
      return;
    }
    if (pointers.current.size > 2) return;
    if (e.pointerType === "touch") drag.current = { kind: "pending", x: e.clientX, y: e.clientY, onSong: overSong(e) };
    else startDrag(overSong(e) ? "song" : "seek", e, e.clientX);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) {
      const over = e.pointerType === "mouse" && overSong(e);
      if (over !== hoverSong) setHoverSong(over);
      return;
    }
    if (d.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const el = lanesRef.current!;
      const { mid, dist } = pinchState();
      const span = Math.min(3600, Math.max(0.5, (d.span * d.dist) / dist));
      setView({ start: d.at - ((mid - el.getBoundingClientRect().left) / (el.clientWidth || 1)) * span, span });
      return;
    }
    if (d.kind === "pending") {
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - d.y)) startDrag(d.onSong ? "song" : "seek", e, d.x);
      else return;
    }
    const cur = drag.current;
    if (cur?.kind === "seek") player.current?.seek(Math.max(boundsStart, timeAt(e.clientX)));
    else if (cur?.kind === "song") {
      const dt = ((e.clientX - cur.x) / (lanesRef.current?.clientWidth || 1)) * view.span;
      // Moving the song right means it starts later: a smaller offset.
      const snapped = snapOffset(Math.round((cur.offset - dt) * 1000) / 1000, e.altKey);
      setDragOffset(snapped.offset);
      setSnapLine(snapped.line);
    }
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === "pinch") {
      if (pointers.current.size === 0) drag.current = null;
      return;
    }
    drag.current = null;
    if (d?.kind === "pending") player.current?.seek(Math.max(boundsStart, timeAt(e.clientX)));
    if (d?.kind === "song" && dragOffset !== null) {
      onMixChange({ ...mix, offsetSec: dragOffset });
      cancelSongDrag();
    }
  }
  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    // The browser took the gesture (e.g. scrolling the page): undo, don't commit.
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) drag.current = null;
    cancelSongDrag();
  }

  /** Where a dragged song region lands: an edge within SNAP_PX of a line (the take's start or end,
      the playhead, or a ruler line) snaps onto it. Alt drags freely. */
  function snapOffset(raw: number, free: boolean): { offset: number; line: number | null } {
    if (!snapOn || free) return { offset: raw, line: null };
    const w = lanesRef.current?.clientWidth || 1;
    const tol = (SNAP_PX / w) * view.span;
    const minor = tickStep(view.span, w) / 2;
    const fixed = [0, takeDur, player.current?.position() ?? 0];
    let best = { score: Infinity, shift: 0, line: null as number | null };
    for (const edge of [-raw, -raw + songDur]) {
      const candidates = [...fixed.map((c) => [c, 0] as const), [Math.round(edge / minor) * minor, tol * 0.3] as const];
      for (const [line, penalty] of candidates) {
        const d = Math.abs(line - edge);
        // Clip edges and the playhead win over ruler lines when both are in reach.
        if (d <= tol && d + penalty < best.score) best = { score: d + penalty, shift: line - edge, line };
      }
    }
    if (best.line === null) return { offset: raw, line: null };
    return { offset: Math.round((raw - best.shift) * 1000) / 1000, line: best.line };
  }

  const nudge = (d: number) => onMixChange({ ...mix, offsetSec: Math.round((mix.offsetSec + d) * 1000) / 1000 });

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-danger">{error}</p>
        <audio controls src={takeUrl} className="w-full" />
      </div>
    );
  }
  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="inline-flex h-9 items-center gap-1.5 self-start rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
      >
        <PlayIcon className="h-4 w-4" />
        Play with the song
      </button>
    );
  }
  if (!audio) {
    return (
      <div className="flex h-24 items-center justify-center gap-2 rounded-md bg-foreground/[0.05] text-sm text-muted">
        <LoadingSpinner size="sm" inline /> Loading the waveforms…
      </div>
    );
  }

  const smallButton = "flex h-8 min-w-8 items-center justify-center rounded-md bg-foreground/[0.05] px-2 text-sm font-medium hover:bg-surface-hover";
  return (
    <div className={full ? "fixed inset-0 z-[80] flex flex-col gap-3 bg-background p-3 sm:p-5" : "flex flex-col gap-2"} role={full ? "dialog" : undefined} aria-label={full ? "Editor" : undefined}>
      {full && (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{takeName}</div>
            <div className="truncate text-sm text-muted">over {songName}</div>
          </div>
          <button type="button" onClick={() => setFull(false)} aria-label="Close the editor" title="Close (Esc)" className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Transport */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => player.current?.seek(Math.min(0, boundsStart))} title="Back to the start" aria-label="Back to the start" className={smallButton}>
          ⏮
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play with the song"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
        >
          {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>
        <span className="rounded-md bg-foreground/[0.05] px-3 py-1 font-mono text-sm tabular-nums">
          <span ref={clockRef}>0:00.0</span>
          <span className="text-muted"> / {formatClock(boundsEnd, false)}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => zoom(1.5)} title="Zoom out" aria-label="Zoom out" className={smallButton}>
            −
          </button>
          <button type="button" onClick={() => zoom(1 / 1.5)} title="Zoom in (or Ctrl/⌘ + scroll)" aria-label="Zoom in" className={smallButton}>
            +
          </button>
          <button type="button" onClick={fit} title="Show everything" className={smallButton}>
            Fit
          </button>
          <button
            type="button"
            onClick={() => setSnapOn((v) => !v)}
            aria-pressed={snapOn}
            title={snapOn ? "Snap on: dragged regions snap to the take, the playhead and the ruler lines (hold Alt to drag freely)" : "Snap off"}
            className={`${smallButton} ${snapOn ? "!border-transparent !bg-accent text-accent-foreground" : ""}`}
          >
            Snap
          </button>
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            title={full ? "Exit full screen (Esc)" : "Open the editor full screen"}
            aria-label={full ? "Exit full screen" : "Open the editor full screen"}
            className={smallButton}
          >
            {full ? <MinimizeIcon className="h-4 w-4" /> : <MaximizeIcon className="h-4 w-4" />}
            {!full && <span className="ml-1.5 hidden sm:inline">Editor</span>}
          </button>
        </div>
      </div>

      {/* Tracks */}
      <div ref={tracksAreaRef} className={full ? "min-h-0 flex-1" : ""}>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] overflow-hidden rounded-lg bg-surface sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="border-r border-surface-hover">
          <div className="flex items-center border-b border-surface-hover/60 bg-background px-2 text-[10px] font-semibold text-muted" style={{ height: RULER_H }}>
            Tracks
          </div>
          <TrackHeader
            name="Song"
            detail={songName}
            color={SONG_COLOR}
            volume={mix.songVolume}
            onVolume={(v) => onMixChange({ ...mix, songVolume: v })}
            ui={songUi}
            onUi={setSongUi}
            meterRef={(el) => {
              meters.current[0] = el;
            }}
            height={laneH}
            hint={songName}
          />
          <TrackHeader
            name="Take"
            detail={takeName}
            color={TAKE_COLOR}
            volume={mix.takeVolume}
            onVolume={(v) => onMixChange({ ...mix, takeVolume: v })}
            ui={takeUi}
            onUi={setTakeUi}
            meterRef={(el) => {
              meters.current[1] = el;
            }}
            height={laneH}
            hint={takeName}
          />
        </div>
        <div
          ref={lanesRef}
          className={`relative min-w-0 select-none ${full ? "touch-none" : "touch-pan-y"} ${dragOffset !== null ? "cursor-grabbing" : hoverSong ? "cursor-grab" : "cursor-text"}`}
          style={{ height: RULER_H + laneH * 2 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {snapLine !== null && width > 0 && (
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent"
              style={{ left: ((snapLine - view.start) / view.span) * width }}
            />
          )}
          <div ref={playheadRef} className="pointer-events-none absolute inset-y-0 left-0 w-px bg-foreground">
            <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-foreground" />
          </div>
        </div>
      </div>
      </div>

      {/* On phones the faders live here instead of in the narrow track headers. */}
      <div className="flex flex-col gap-1 sm:hidden">
        {(
          [
            ["Song", SONG_COLOR, mix.songVolume, (v: number) => onMixChange({ ...mix, songVolume: v })],
            ["Take", TAKE_COLOR, mix.takeVolume, (v: number) => onMixChange({ ...mix, takeVolume: v })],
          ] as const
        ).map(([label, color, value, set]) => (
          <label key={label} className="flex items-center gap-2 text-xs">
            <span className="h-3 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="w-9 shrink-0 font-semibold">{label}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(value * 100)}
              onChange={(e) => set(Number(e.target.value) / 100)}
              aria-label={`${label} volume`}
              style={{ "--progress": `${Math.round(value * 100)}%` } as React.CSSProperties}
              className="slider h-6 min-w-0 flex-1 cursor-pointer"
            />
            <span className="w-9 shrink-0 text-right tabular-nums text-muted">{Math.round(value * 100)}%</span>
          </label>
        ))}
      </div>

      {(!compact || full) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-foreground/[0.05] p-3">
          <span className="text-sm">
            <span className="font-medium">Line-up</span>{" "}
            <span className="font-mono tabular-nums">{formatOffset(offset)}</span>{" "}
            <span className="text-muted">
              {offset === 0 ? "· starting together" : offset > 0 ? "· the take starts that far into the song" : "· the song comes in that far into the take"}
            </span>
          </span>
          <div className="ml-auto flex flex-wrap gap-1">
            {(
              [
                [-1, "−1 s"],
                [-0.1, "−0.1"],
                [-0.01, "−0.01"],
                [0.01, "+0.01"],
                [0.1, "+0.1"],
                [1, "+1 s"],
              ] as const
            ).map(([d, label]) => (
              <button key={label} type="button" onClick={() => nudge(d)} className="rounded-lg bg-surface px-2 py-1 text-xs font-medium tabular-nums hover:bg-surface-hover">
                {label}
              </button>
            ))}
          </div>
          <p className="w-full text-xs text-muted">Drag the Song region sideways to line it up with your take — with Snap on its edges snap to the take, the playhead and the ruler lines <span className="hidden sm:inline">(hold Alt to drag freely)</span> — or nudge it. <span className="hidden sm:inline">Click the ruler or lanes to move the playhead; Ctrl/⌘ + scroll zooms.</span><span className="sm:hidden">Tap the lanes to move the playhead; pinch to zoom, two fingers to scroll.</span></p>
        </div>
      )}
    </div>
  );
}

/** A saved recording over its tune's song; mix changes save to the recording (debounced). */
export function SavedMixPlayer({
  recording,
  songUrl,
  songName,
  compact,
  lazy,
}: {
  recording: Recording;
  songUrl: string;
  songName?: string;
  compact?: boolean;
  lazy?: boolean;
}) {
  const update = useMutation(recordingsApi.update);
  const [mix, setMix] = useState<RecordingMix>(recording.mix ?? DEFAULT_MIX);
  const pending = useRef<RecordingMix | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = recording._id;

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pending.current) void update({ id, mix: pending.current });
    },
    [id, update],
  );

  function change(next: RecordingMix) {
    setMix(next);
    pending.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const p = pending.current;
      pending.current = null;
      if (p) void update({ id, mix: p });
    }, 600);
  }

  if (!recording.url) return null;
  return <MixPlayer takeUrl={recording.url} songUrl={songUrl} takeName={recording.name} songName={songName} mix={mix} onMixChange={change} compact={compact} lazy={lazy} />;
}
