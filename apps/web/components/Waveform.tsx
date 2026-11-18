"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Peaks } from "@/lib/audioFile";
import type { Marker } from "@/lib/markers";
import { getServerThemeState, getThemeState, subscribeTheme } from "@/lib/theme";

export type LoopRegion = { start: number; end: number };
export type View = { start: number; span: number };
/** The part of a track's audio that plays, and where the timeline stops repeating it. */
export type ClipShape = { trimStart: number; trimEnd: number; end: number };
export type GridShape = { bpm: number; beatsPerBar: number; origin: number };
/** One piece of audio drawn on a multitrack lane. */
export type LaneClip = {
  id: string;
  peaks: Peaks;
  /** Timeline position of the start of the played part, in seconds. */
  offset: number;
  shape: ClipShape;
  label: string;
  selected: boolean;
};

const DEFAULT_HEIGHT = 128;
const MIN_LOOP = 0.05;
const DRAG_THRESHOLD_PX = 4;
const REGION_HEADER = 15;
/** Space kept clear above and below a coloured clip so it reads as a block on the lane. */
const REGION_MARGIN = 5;

type Drag =
  | { kind: "repeat"; id: string }
  | { kind: "cropStart"; id: string }
  | { kind: "cropEnd"; id: string }
  | { kind: "scrub" }
  | {
      kind: "pan";
      lastX: number;
      lastY: number;
      startX: number;
      moved: boolean;
      seek: boolean;
    }
  | {
      kind: "move";
      id: string;
      startX: number;
      anchorTime: number;
      startOffset: number;
      /** Length of the clip on the timeline, so its end can snap too. */
      length: number;
      moved: boolean;
    }
  | { kind: "tap"; startX: number; lastX: number; lastY: number; moved: boolean }
  /** A loop edge: grabbed once the pointer moves past `threshold` px; a short tap seeks instead. */
  | { kind: "handle"; edge: "start" | "end"; startX: number; threshold: number; moved: boolean }
  | { kind: "select"; anchorX: number; anchorTime: number; moved: boolean };

/**
 * Waveform with a playhead. Drag to pan, click to seek, Shift+drag to select a loop,
 * drag a loop's edges to adjust it, scroll to zoom, right-click for markers. On a touch screen
 * (no Shift key) a drag selects a loop instead of panning; a tap still moves the playhead.
 */
export default function Waveform({
  peaks,
  duration,
  view,
  time,
  loop,
  loopActive,
  markers,
  onSeek,
  onLoopChange,
  onLoopCommit,
  onZoomAt,
  onPanBy,
  onContextMenu,
  fill,
  height: fixedHeight = DEFAULT_HEIGHT,
  showMarkerFlags = true,
  grid,
  snap,
  snapEdit,
  color,
  flush = false,
  mode = "pan",
  clips,
  onSelect,
  onSelectClip,
  onMoveClip,
  onCropStart,
  onCropEnd,
  onRepeatEndChange,
  onPanY,
}: {
  /** The audio for a single waveform (leave out when passing `clips`). */
  peaks?: Peaks | null;
  duration: number;
  view: View;
  time: number;
  loop: LoopRegion | null;
  loopActive: boolean;
  markers: Marker[];
  onSeek: (time: number) => void;
  onLoopChange: (loop: LoopRegion) => void;
  onLoopCommit: (loop: LoopRegion) => void;
  /** Zoom by `factor` (<1 zooms in), keeping `anchor` (a time in seconds) in place. */
  onZoomAt: (factor: number, anchor: number) => void;
  /** Scroll the view by this many seconds. */
  onPanBy: (seconds: number) => void;
  /** Right-click at `time`; `markerId` / `clipId` are set when the click landed on one. */
  onContextMenu: (info: {
    time: number;
    x: number;
    y: number;
    markerId: string | null;
    clipId: string | null;
  }) => void;
  /** Stretch to the height of the parent instead of the default fixed height. */
  fill?: boolean;
  /** Height in pixels when not filling the parent. */
  height?: number;
  /** Draw the marker name flags (turn off on all but one lane of a multitrack view). */
  showMarkerFlags?: boolean;
  /** Beat lines drawn behind the waveform. */
  grid?: GridShape;
  /** Rounds times picked with the mouse, e.g. to the nearest beat. */
  snap?: (time: number) => number;
  /**
   * Magnetic version for editing audio: it should only pull a time onto the grid when it's
   * close (`pxPerSecond` tells it how many pixels a second is at the current zoom).
   */
  snapEdit?: (time: number, pxPerSecond: number) => number;
  /** Colour of the clips on this lane; drawn as coloured regions with a name bar. */
  color?: string;
  /** Draw without its own background and rounding, for lanes sharing one container. */
  flush?: boolean;
  /**
   * "pan": drag to pan, click to seek (a single waveform).
   * "tracks": clicking selects, dragging a clip moves it, and only the middle mouse button
   * pans (multitrack lanes).
   */
  mode?: "pan" | "tracks";
  /** The clips on this lane (multitrack). */
  clips?: LaneClip[];
  /** A press on the lane (tracks mode): selects the lane's track. */
  onSelect?: () => void;
  /** A press on a clip (its id) or on empty space (null). */
  onSelectClip?: (id: string | null) => void;
  /** Dragging a clip: its new timeline start, and where the pointer is (to pick another track). */
  onMoveClip?: (id: string, offset: number, final: boolean, clientY: number) => void;
  onCropStart?: (id: string, time: number, final: boolean) => void;
  onCropEnd?: (id: string, time: number, final: boolean) => void;
  onRepeatEndChange?: (id: string, time: number, final: boolean) => void;
  /** Dragging to pan also moves this many pixels vertically (the parent scrolls its lanes). */
  onPanY?: (dy: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [size, setSize] = useState({ width: 0, height: fixedHeight });
  const { width, height } = size;
  const [shift, setShift] = useState(false);
  // Only used to redraw when the theme colours change.
  const theme = useSyncExternalStore(subscribeTheme, getThemeState, getServerThemeState);

  // A lone waveform is one un-shaped entry; multitrack lanes pass their clips.
  const entries = useMemo<
    {
      id: string;
      peaks: Peaks;
      offset: number;
      shape?: ClipShape;
      label?: string;
      selected?: boolean;
    }[]
  >(() => (clips ? clips : peaks ? [{ id: "main", peaks, offset: 0 }] : []), [clips, peaks]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: box.clientWidth, height: box.clientHeight }),
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Track Shift so the cursor shows the loop-select crosshair while it's held.
  useEffect(() => {
    const update = (e: KeyboardEvent) => setShift(e.shiftKey);
    const clear = () => setShift(false);
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // Wheel: zoom around the pointer, or pan with Shift / sideways scrolling.
  const latest = useRef({ view, duration, onZoomAt, onPanBy, mode });
  useEffect(() => {
    latest.current = { view, duration, onZoomAt, onPanBy, mode };
  });
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      const { view: v, duration: d, onZoomAt: zoomAt, onPanBy: panBy, mode: m } = latest.current;
      // Multitrack lanes leave the wheel to the whole tracks area (see the Recorder).
      if (m === "tracks" || d <= 0) return;
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      const sideways = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (sideways && !(e.ctrlKey || e.metaKey)) {
        const delta = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
        panBy((delta / rect.width) * v.span);
      } else {
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        zoomAt(e.deltaY < 0 ? 0.8 : 1.25, v.start + ratio * v.span);
      }
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const plainColor = getComputedStyle(canvas).color;
    ctx.fillStyle = plainColor;

    // Beat lines: stronger on the first beat of each bar, dropped when too crowded to read.
    if (grid && grid.bpm > 0) {
      const beat = 60 / grid.bpm;
      const barBeats = Math.max(1, grid.beatsPerBar);
      const pxPerBeat = (beat / view.span) * width;
      const stride = pxPerBeat >= 8 ? 1 : pxPerBeat * barBeats >= 8 ? barBeats : 0;
      if (stride > 0) {
        const first = Math.ceil((view.start - grid.origin) / beat / stride) * stride;
        for (let k = first; ; k += stride) {
          const x = ((grid.origin + k * beat - view.start) / view.span) * width;
          if (x > width) break;
          const isBar = ((k % barBeats) + barBeats) % barBeats === 0;
          ctx.globalAlpha = isBar ? 0.4 : 0.15;
          ctx.fillRect(Math.round(x), 0, 1, height);
        }
        ctx.globalAlpha = 1;
      }
    }

    const headerHeight = color ? REGION_HEADER : 0;
    const regionTop = color ? REGION_MARGIN : 0;
    const regionHeight = height - regionTop * 2;
    const mid = regionTop + headerHeight + (regionHeight - headerHeight) / 2;

    for (const entry of entries) {
      const { peaks: p, offset, shape, label, selected } = entry;
      const bucketsPerSecond = p.sampleRate / p.bucket;
      const amp = ((regionHeight - headerHeight) / 2) * 0.92 * p.scale;
      const clipLength = shape ? Math.max(0.001, shape.trimEnd - shape.trimStart) : 0;

      // A coloured region (with a name bar) marks where the clip is, so empty space stands out.
      if (color && shape) {
        const x0 = ((offset - view.start) / view.span) * width;
        const x1 = ((shape.end - view.start) / view.span) * width;
        if (x1 < 0 || x0 > width) continue;
        if (x1 - x0 > 2) {
          const left = Math.max(0, x0);
          const right = Math.min(width, x1);
          const path = () => {
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
              ctx.roundRect(x0, regionTop, x1 - x0, regionHeight, 6);
            } else ctx.rect(x0, regionTop, x1 - x0, regionHeight);
          };
          ctx.save();
          path();
          ctx.clip();
          ctx.fillStyle = color + "40";
          ctx.fillRect(left, regionTop, right - left, regionHeight);
          ctx.fillStyle = color;
          ctx.fillRect(left, regionTop, right - left, headerHeight);
          if (label) {
            ctx.fillStyle = "#ffffff";
            ctx.font = "600 10px system-ui, sans-serif";
            ctx.textBaseline = "middle";
            ctx.fillText(
              label,
              Math.max(left, x0) + 6,
              regionTop + headerHeight / 2 + 0.5,
              Math.max(0, right - left - 8),
            );
          }
          ctx.restore();
          if (selected) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            path();
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = color ? "rgba(255,255,255,0.85)" : plainColor;
      for (let x = 0; x < width; x++) {
        const t0 = view.start + (x / width) * view.span;
        const t1 = view.start + ((x + 1) / width) * view.span;
        if (t1 <= offset) continue;
        let local0: number;
        let local1: number;
        if (shape) {
          if (t0 >= shape.end) break;
          const rel = Math.max(0, t0 - offset);
          local0 = shape.trimStart + (rel - Math.floor(rel / clipLength) * clipLength);
          local1 = Math.min(shape.trimEnd, local0 + (t1 - Math.max(t0, offset)));
        } else {
          local0 = Math.max(0, t0 - offset);
          local1 = t1 - offset;
        }
        const b0 = Math.max(0, Math.floor(local0 * bucketsPerSecond));
        const b1 = Math.min(p.min.length, Math.max(b0 + 1, Math.ceil(local1 * bucketsPerSecond)));
        if (b0 >= p.min.length) continue;
        let lo = Infinity;
        let hi = -Infinity;
        for (let b = b0; b < b1; b++) {
          if (p.min[b] < lo) lo = p.min[b];
          if (p.max[b] > hi) hi = p.max[b];
        }
        const top = mid - hi * amp;
        const bottom = mid - lo * amp;
        ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
      }
    }
  }, [entries, view, width, height, theme, grid, color]);

  const toX = (t: number) => ((t - view.start) / view.span) * 100;

  function timeAt(clientX: number) {
    const rect = boxRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = view.start + ratio * view.span;
    return Math.min(duration, Math.max(0, snap ? snap(raw) : raw));
  }

  /** The exact time under the pointer: not snapped and not limited to the timeline. */
  function rawTimeAt(clientX: number) {
    const rect = boxRef.current!.getBoundingClientRect();
    return view.start + ((clientX - rect.left) / rect.width) * view.span;
  }

  /** The clip (if any) under a timeline position; later clips are on top. */
  function clipAt(raw: number) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.shape && raw >= e.offset && raw <= e.shape.end) return e;
    }
    return null;
  }

  /** A time for crops and repeats: can pass the end of the timeline, with magnetic snapping. */
  function editTimeAt(clientX: number) {
    const rect = boxRef.current!.getBoundingClientRect();
    const ratio = Math.max(0, (clientX - rect.left) / rect.width);
    const raw = view.start + ratio * view.span;
    const snapped = snapEdit ? snapEdit(raw, rect.width / view.span) : snap ? snap(raw) : raw;
    return Math.max(0, snapped);
  }

  /** Where a dragged clip should land: its start or its end snaps onto a nearby grid line. */
  function movedOffset(
    drag: { startOffset: number; anchorTime: number; length: number },
    clientX: number,
  ) {
    const target = drag.startOffset + (rawTimeAt(clientX) - drag.anchorTime);
    if (!snapEdit) return snap ? snap(target) : target;
    const pps = (boxRef.current?.getBoundingClientRect().width ?? 1) / view.span;
    const byStart = snapEdit(target, pps);
    if (byStart !== target) return byStart;
    const byEnd = snapEdit(target + drag.length, pps) - drag.length;
    return byEnd;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (duration <= 0) return;
    if (e.button === 1) {
      // Middle mouse button pans.
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "pan",
        lastX: e.clientX,
        lastY: e.clientY,
        startX: e.clientX,
        moved: true,
        seek: false,
      };
      return;
    }
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-marker]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const handle = (name: string) =>
      (e.target as HTMLElement).closest<HTMLElement>(`[${name}]`)?.dataset.clipId;
    const repeatId = handle("data-repeat-handle");
    if (repeatId) {
      dragRef.current = { kind: "repeat", id: repeatId };
      return;
    }
    const cropStartId = handle("data-crop-start");
    if (cropStartId) {
      dragRef.current = { kind: "cropStart", id: cropStartId };
      return;
    }
    const cropEndId = handle("data-crop-end");
    if (cropEndId) {
      dragRef.current = { kind: "cropEnd", id: cropEndId };
      return;
    }
    if ((e.target as HTMLElement).closest("[data-playhead]")) {
      dragRef.current = { kind: "scrub" };
      onSeek(timeAt(e.clientX));
      return;
    }
    const edge = (e.target as HTMLElement).dataset.edge as "start" | "end" | undefined;
    // A finger wobbles more than a mouse, so it needs to travel further before it grabs the edge.
    if (edge)
      dragRef.current = {
        kind: "handle",
        edge,
        startX: e.clientX,
        threshold: e.pointerType === "touch" ? 10 : DRAG_THRESHOLD_PX,
        moved: false,
      };
    else if (e.shiftKey || (mode === "pan" && e.pointerType === "touch")) {
      dragRef.current = {
        kind: "select",
        anchorX: e.clientX,
        anchorTime: timeAt(e.clientX),
        moved: false,
      };
    } else if (mode === "tracks") {
      onSelect?.();
      const raw = rawTimeAt(e.clientX);
      const hit = clipAt(raw);
      onSelectClip?.(hit ? hit.id : null);
      dragRef.current =
        hit && onMoveClip
          ? {
              kind: "move",
              id: hit.id,
              startX: e.clientX,
              anchorTime: raw,
              startOffset: hit.offset,
              length: hit.shape ? hit.shape.end - hit.offset : 0,
              moved: false,
            }
          : { kind: "tap", startX: e.clientX, lastX: e.clientX, lastY: e.clientY, moved: false };
    } else {
      dragRef.current = {
        kind: "pan",
        lastX: e.clientX,
        lastY: e.clientY,
        startX: e.clientX,
        moved: false,
        seek: true,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "repeat") {
      onRepeatEndChange?.(drag.id, editTimeAt(e.clientX), false);
      return;
    }
    if (drag.kind === "cropStart") {
      onCropStart?.(drag.id, editTimeAt(e.clientX), false);
      return;
    }
    if (drag.kind === "cropEnd") {
      onCropEnd?.(drag.id, editTimeAt(e.clientX), false);
      return;
    }
    if (drag.kind === "scrub") {
      onSeek(timeAt(e.clientX));
      return;
    }
    if (drag.kind === "move") {
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      onMoveClip?.(drag.id, movedOffset(drag, e.clientX), false, e.clientY);
      return;
    }
    if (drag.kind === "tap") {
      // Dragging on empty space pans; a plain click still selects and moves the playhead.
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      const rect = boxRef.current!.getBoundingClientRect();
      onPanBy(-((e.clientX - drag.lastX) / rect.width) * view.span);
      onPanY?.(e.clientY - drag.lastY);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }
    if (drag.kind === "pan") {
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      const rect = boxRef.current!.getBoundingClientRect();
      onPanBy(-((e.clientX - drag.lastX) / rect.width) * view.span);
      onPanY?.(e.clientY - drag.lastY);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }
    const t = timeAt(e.clientX);
    if (drag.kind === "handle" && loop) {
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < drag.threshold) return;
      drag.moved = true;
      onLoopChange(
        drag.edge === "start"
          ? { start: Math.min(t, loop.end - MIN_LOOP), end: loop.end }
          : { start: loop.start, end: Math.max(t, loop.start + MIN_LOOP) },
      );
    } else if (drag.kind === "select") {
      if (!drag.moved && Math.abs(e.clientX - drag.anchorX) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      const a = drag.anchorTime;
      onLoopChange({ start: Math.min(a, t), end: Math.max(a, t + (a === t ? MIN_LOOP : 0)) });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind === "repeat") {
      onRepeatEndChange?.(drag.id, editTimeAt(e.clientX), true);
      return;
    }
    if (drag?.kind === "cropStart") {
      onCropStart?.(drag.id, editTimeAt(e.clientX), true);
      return;
    }
    if (drag?.kind === "cropEnd") {
      onCropEnd?.(drag.id, editTimeAt(e.clientX), true);
      return;
    }
    if (!drag || drag.kind === "scrub") return;
    if (drag.kind === "move") {
      if (drag.moved) {
        onMoveClip?.(drag.id, movedOffset(drag, e.clientX), true, e.clientY);
      } else onSeek(timeAt(e.clientX));
      return;
    }
    if (drag.kind === "tap") {
      if (!drag.moved) onSeek(timeAt(e.clientX));
      return;
    }
    if (drag.kind === "pan") {
      if (!drag.moved && drag.seek) onSeek(timeAt(e.clientX));
    } else if ((drag.kind === "select" || drag.kind === "handle") && !drag.moved) {
      // A tap (on empty wave, or on a loop edge) just moves the playhead.
      onSeek(timeAt(e.clientX));
    } else if (loop) {
      onLoopCommit(loop);
    }
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (duration <= 0) return;
    const markerId = (e.target as HTMLElement).closest<HTMLElement>("[data-marker]")?.dataset.id;
    onContextMenu({
      time: timeAt(e.clientX),
      x: e.clientX,
      y: e.clientY,
      markerId: markerId ?? null,
      clipId: markerId ? null : (clipAt(rawTimeAt(e.clientX))?.id ?? null),
    });
  }

  const playheadLeft = toX(time);
  const showPlayhead = playheadLeft >= 0 && playheadLeft <= 100;

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={handleContextMenu}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      role="slider"
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      className={`${fill ? "absolute inset-0" : "relative w-full"} touch-none select-none overflow-hidden ${flush ? "" : "rounded-lg bg-surface"} ${
        shift
          ? "cursor-crosshair"
          : mode === "tracks"
            ? "cursor-default"
            : "cursor-grab active:cursor-grabbing"
      }`}
      style={fill ? undefined : { height: fixedHeight }}
    >
      {entries.length > 0 || clips !== undefined ? (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full text-muted" />
      ) : (
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-muted/40" />
      )}

      {loop && (
        <div
          className={`absolute inset-y-0 border-x-2 ${
            loopActive ? "border-accent bg-accent/20" : "border-muted/50 bg-muted/10"
          }`}
          style={{
            left: `${toX(loop.start)}%`,
            width: `${toX(loop.end) - toX(loop.start)}%`,
          }}
        >
          {(["start", "end"] as const).map((edge) => (
            <div
              key={edge}
              data-edge={edge}
              className={`absolute inset-y-0 w-4 cursor-ew-resize ${
                edge === "start" ? "-left-2.5" : "-right-2.5"
              }`}
            />
          ))}
        </div>
      )}

      {markers.map((marker) => {
        const left = toX(marker.time);
        if (left < -1 || left > 101) return null;
        return (
          <div
            key={marker.id}
            data-marker
            data-id={marker.id}
            className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-pointer"
            style={{ left: `${left}%` }}
            onClick={() => onSeek(marker.time)}
            title={marker.note ? `${marker.label}\n${marker.note}` : marker.label}
          >
            <div className="absolute inset-y-0 left-1/2 w-px bg-accent" />
            {showMarkerFlags && (
              <div className="absolute left-1/2 top-0 max-w-28 truncate rounded-br-md bg-accent px-1.5 py-0.5 text-[0.65rem] font-medium leading-none text-accent-foreground">
                {marker.label}
              </div>
            )}
          </div>
        );
      })}

      {entries.map((entry) => {
        const { id, offset, shape } = entry;
        if (!shape || !Number.isFinite(shape.end)) return null;
        const clipLength = Math.max(0.001, shape.trimEnd - shape.trimStart);
        const firstBoundary = Math.max(1, Math.ceil((view.start - offset) / clipLength));
        return (
          <div key={id}>
            {Array.from({ length: repeatBoundaries(shape, offset, view) }, (_, i) => (
              <div
                key={i}
                className="pointer-events-none absolute inset-y-0 border-l border-dashed border-white/50"
                style={{ left: `${toX(offset + (firstBoundary + i) * clipLength)}%` }}
              />
            ))}
            {onRepeatEndChange && (
              <div
                data-repeat-handle
                data-clip-id={id}
                title="Drag to repeat this clip"
                className="absolute top-0 z-20 h-1/2 w-4 -translate-x-1/2 cursor-ew-resize"
                style={{ left: `${toX(shape.end)}%` }}
              >
                <div className="pointer-events-none absolute inset-y-1.5 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-white/90" />
              </div>
            )}
            {onCropStart && (
              <div
                data-crop-start
                data-clip-id={id}
                title="Drag to crop the start"
                className="absolute bottom-0 top-0 z-20 w-3 -translate-x-1/2 cursor-col-resize"
                style={{ left: `${toX(offset)}%` }}
              />
            )}
            {onCropEnd && (
              <div
                data-crop-end
                data-clip-id={id}
                title="Drag to crop the end"
                className="absolute bottom-0 z-20 h-1/2 w-3 -translate-x-1/2 cursor-col-resize"
                style={{ left: `${toX(offset + clipLength)}%` }}
              />
            )}
          </div>
        );
      })}

      {showPlayhead && (
        <div
          data-playhead
          title="Drag to scrub"
          className="absolute inset-y-0 z-20 w-5 -translate-x-1/2 cursor-ew-resize"
          style={{ left: `${playheadLeft}%` }}
        >
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-foreground" />
          <svg
            aria-hidden
            viewBox="0 0 14 12"
            className="pointer-events-none absolute left-1/2 top-0 h-3 w-3.5 -translate-x-1/2 text-foreground"
            fill="currentColor"
          >
            <path d="M0 0h14L7 12z" />
          </svg>
        </div>
      )}
    </div>
  );
}

/** How many repeat dividers fall inside the visible part of a repeated clip (capped). */
function repeatBoundaries(clip: ClipShape, offset: number, view: View): number {
  const clipLength = Math.max(0.001, clip.trimEnd - clip.trimStart);
  const first = Math.max(1, Math.ceil((view.start - offset) / clipLength));
  const last = Math.floor(
    (Math.min(clip.end, view.start + view.span) - offset - 1e-9) / clipLength,
  );
  return Math.max(0, Math.min(200, last - first + 1));
}
