"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { midiToNote } from "@/lib/noteRange";
import { type PitchTrack, type TrackNote, CLOSE_CENTS, IN_TUNE_CENTS, centsColor, centsOfFrame, frameAt, timeOfFrame } from "@/lib/pitchTrack";

const HEIGHT = 176;
const LABEL_ROW = 30;
const AXIS_ROW = 18;
const PLOT_TOP = LABEL_ROW;
const PLOT_H = HEIGHT - LABEL_ROW - AXIS_ROW;
const OVERVIEW_H = 26;
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
/** Zoom levels: how many seconds the graph shows at once. */
export const ZOOMS = [3, 6, 12, 24, 48];

const yOf = (cents: number) => PLOT_TOP + ((50 - Math.max(-50, Math.min(50, cents))) / 100) * PLOT_H;

function clock(t: number, precise = false) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return precise ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
}

function signed(cents: number) {
  const r = Math.round(cents);
  return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : "0";
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Seeks from a pointer drag over an element: `timeAt` maps a clientX to seconds. */
function usePointerSeek(onSeek: (t: number) => void, onEnd?: (viewStart: number) => void) {
  const [dragging, setDragging] = useState<{ start: number } | null>(null);
  const end = () => {
    if (dragging) onEnd?.(dragging.start);
    setDragging(null);
  };
  return {
    dragging,
    handlers: (timeAt: (clientX: number, rect: DOMRect, viewStart: number) => number, viewStart: number) => ({
      onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging({ start: viewStart });
        onSeek(timeAt(e.clientX, e.currentTarget.getBoundingClientRect(), viewStart));
      },
      onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
        if (!dragging || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        onSeek(timeAt(e.clientX, e.currentTarget.getBoundingClientRect(), dragging.start));
      },
      onPointerUp: end,
      onPointerCancel: end,
    }),
  };
}

/**
 * A take's pitch over time: each note's line, how many cents sharp or flat it was (above the line,
 * coloured like the needle), the in-tune band in the middle, and the playhead. Click or drag to
 * seek; the strip underneath shows the whole take. While playing, the view turns the page when the
 * playhead gets to the edge.
 */
export default function PitchGraph({
  track,
  notes,
  duration,
  pos,
  zoom,
  refA,
  minRms,
  transpose,
  onSeek,
}: {
  track: PitchTrack | null;
  notes: TrackNote[];
  duration: number;
  pos: number;
  /** Seconds shown at once. */
  zoom: number;
  refA: number;
  minRms: number;
  transpose: number;
  onSeek: (t: number) => void;
}) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  // After a drag on the graph, the view stays where it was for as long as the playhead is in it.
  const [pinned, setPinned] = useState<{ start: number; span: number } | null>(null);
  const span = Math.max(0.5, Math.min(zoom, duration || zoom));
  const main = usePointerSeek(onSeek, (start) => setPinned({ start, span }));
  const overview = usePointerSeek(onSeek);
  // Otherwise it turns the page: pages overlap by a tenth, so the playhead isn't right on an edge.
  const step = span * 0.9;
  const lastStart = Math.max(0, duration - span);
  const paged = Math.min(lastStart, Math.floor(Math.max(0, pos) / step) * step);
  const keep = pinned && pinned.span === span && pos >= pinned.start && pos <= pinned.start + span ? pinned.start : null;
  const viewStart = main.dragging ? main.dragging.start : (keep ?? paged);
  const viewEnd = viewStart + span;
  const xOf = (t: number) => ((t - viewStart) / span) * width;
  const timeAt = (clientX: number, rect: DOMRect, start: number) => start + ((clientX - rect.left) / Math.max(1, rect.width)) * span;
  const overviewTimeAt = (clientX: number, rect: DOMRect) => ((clientX - rect.left) / Math.max(1, rect.width)) * duration;

  // Each note's line, in seconds and cents (frames in a little gap are skipped, which breaks it).
  const lines = useMemo(() => {
    if (!track) return [];
    return notes.map((note) => {
      const points: { t: number; cents: number }[] = [];
      // The very first and last frames straddle the attack and the release, so they read wild;
      // a note's line leaves them out (its cents, the median, barely notices them anyway).
      const trim = note.last - note.first >= 4 ? 1 : 0;
      for (let f = note.first + trim; f <= note.last - trim; f++) {
        const c = centsOfFrame(track, f, refA, minRms);
        if (c && c.target === note.target) points.push({ t: timeOfFrame(track, f), cents: c.cents });
      }
      return { note, start: timeOfFrame(track, note.first), end: timeOfFrame(track, note.last), points };
    });
  }, [track, notes, refA, minRms]);

  const visible = width > 0 ? lines.filter((l) => l.end >= viewStart - 0.1 && l.start <= viewEnd + 0.1) : [];
  const tickStep = TICK_STEPS.find((s) => (s / span) * width >= 64) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: number[] = [];
  for (let t = Math.ceil(viewStart / tickStep) * tickStep; t <= viewEnd && width > 0; t += tickStep) ticks.push(t);

  // Labels where there's room: the note's name and its cents off.
  const labels: { note: TrackNote; x: number }[] = [];
  for (const { note, start } of visible) {
    if (note.short) continue;
    const x = Math.max(2, xOf(start));
    const prev = labels[labels.length - 1];
    if ((prev && x < prev.x + 34) || x > width - 16) continue;
    labels.push({ note, x });
  }

  const playX = xOf(pos);
  const shownFrame = track && track.done > 0 ? frameAt(track, pos) : -1;
  const keyStep = (e: React.KeyboardEvent) => {
    const by = e.shiftKey ? 5 : 1;
    const to = e.key === "ArrowLeft" ? pos - by : e.key === "ArrowRight" ? pos + by : e.key === "Home" ? 0 : e.key === "End" ? duration : null;
    if (to === null) return;
    e.preventDefault();
    onSeek(Math.min(Math.max(0, to), duration));
  };

  return (
    <div ref={boxRef} className="flex w-full flex-col gap-1.5">
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${Math.max(1, width)} ${HEIGHT}`}
        className="block w-full cursor-pointer touch-pan-y select-none rounded-xl bg-background outline-none focus-visible:ring-2 focus-visible:ring-accent"
        role="slider"
        tabIndex={0}
        aria-label="Pitch over time. Drag to move the playhead"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={Math.round(pos * 10) / 10}
        aria-valuetext={`${clock(pos)} of ${clock(duration)}`}
        onKeyDown={keyStep}
        {...main.handlers(timeAt, viewStart)}
      >
        {width > 0 && (
          <>
            {/* In tune, close, and the centre line. */}
            <rect x={0} y={yOf(IN_TUNE_CENTS)} width={width} height={yOf(-IN_TUNE_CENTS) - yOf(IN_TUNE_CENTS)} fill="var(--tune-in)" opacity={0.14} />
            {[CLOSE_CENTS, -CLOSE_CENTS].map((c) => (
              <line key={c} x1={0} x2={width} y1={yOf(c)} y2={yOf(c)} stroke="var(--muted)" strokeOpacity={0.3} strokeDasharray="3 4" />
            ))}
            <line x1={0} x2={width} y1={yOf(0)} y2={yOf(0)} stroke="var(--muted)" strokeOpacity={0.5} />
            <text x={4} y={PLOT_TOP + 9} className="fill-muted text-[10px]">♯ sharp</text>
            <text x={4} y={PLOT_TOP + PLOT_H - 4} className="fill-muted text-[10px]">♭ flat</text>
            <text x={width - 4} y={yOf(CLOSE_CENTS) - 3} textAnchor="end" className="fill-muted text-[10px]">+{CLOSE_CENTS}</text>
            <text x={width - 4} y={yOf(-CLOSE_CENTS) + 11} textAnchor="end" className="fill-muted text-[10px]">−{CLOSE_CENTS}</text>

            {/* Time axis. */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={xOf(t)} x2={xOf(t)} y1={PLOT_TOP} y2={PLOT_TOP + PLOT_H} stroke="var(--muted)" strokeOpacity={0.12} />
                <text
                  x={xOf(t)}
                  y={HEIGHT - 5}
                  textAnchor={xOf(t) < 14 ? "start" : xOf(t) > width - 14 ? "end" : "middle"}
                  className="fill-muted text-[10px] tabular-nums"
                >
                  {clock(t)}
                </text>
              </g>
            ))}

            {/* The notes. */}
            {visible.map(({ note, points }) => (
              <polyline
                key={note.first}
                points={points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.cents).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={note.short ? "var(--muted)" : centsColor(note.cents)}
                strokeOpacity={note.short ? 0.5 : 1}
                strokeWidth={note.short ? 1.5 : 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {labels.map(({ note, x }) => (
              <g key={note.first}>
                <text x={x} y={12} className="fill-foreground text-[11px] font-semibold">
                  {midiToNote(note.target + transpose)}
                </text>
                <text x={x} y={25} className="text-[10px] font-semibold tabular-nums" style={{ fill: centsColor(note.cents) }}>
                  {signed(note.cents)}
                </text>
              </g>
            ))}

            {/* The playhead, with the frame it's on. */}
            {shownFrame >= 0 && (() => {
              const c = track ? centsOfFrame(track, shownFrame, refA, minRms) : null;
              return c && playX >= 0 && playX <= width ? (
                <circle cx={playX} cy={yOf(c.cents)} r={4} fill={centsColor(c.cents)} stroke="var(--background)" strokeWidth={1.5} />
              ) : null;
            })()}
            {playX >= 0 && playX <= width && (
              <line x1={playX} x2={playX} y1={PLOT_TOP - 4} y2={PLOT_TOP + PLOT_H} stroke="var(--accent)" strokeWidth={2} />
            )}
          </>
        )}
      </svg>

      {/* The whole take: its notes, the part shown above, and the playhead. */}
      {duration > span && (
        <svg
          width="100%"
          height={OVERVIEW_H}
          viewBox={`0 0 ${Math.max(1, width)} ${OVERVIEW_H}`}
          className="block w-full cursor-pointer touch-pan-y select-none rounded-lg bg-background"
          aria-hidden
          {...overview.handlers((clientX, rect) => overviewTimeAt(clientX, rect), 0)}
        >
          {width > 0 && duration > 0 && (
            <>
              {lines.map(({ note, start, end }) =>
                note.short ? null : (
                  <rect
                    key={note.first}
                    x={(start / duration) * width}
                    width={Math.max(1.5, ((end - start) / duration) * width)}
                    y={OVERVIEW_H / 2 - 4 - (Math.max(-50, Math.min(50, note.cents)) / 50) * 6}
                    height={8}
                    rx={2}
                    fill={centsColor(note.cents)}
                  />
                ),
              )}
              <rect
                x={(viewStart / duration) * width}
                y={1}
                width={(span / duration) * width}
                height={OVERVIEW_H - 2}
                rx={4}
                fill="var(--accent)"
                fillOpacity={0.1}
                stroke="var(--accent)"
                strokeOpacity={0.6}
              />
              <line x1={(pos / duration) * width} x2={(pos / duration) * width} y1={0} y2={OVERVIEW_H} stroke="var(--accent)" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
    </div>
  );
}

export { clock as formatClock };
