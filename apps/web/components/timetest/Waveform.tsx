"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { peaks as takePeaks, type Analysis, type GridPoint, type Hit, type Take } from "@/lib/timeTest/analysis";
import { STATUS_COLOR, STATUS_LABEL, describeMs, statusOf, whereLabel } from "@/lib/timeTest/timing";

export type View = { start: number; end: number };

const WAVE_H = 160;
const LANE_H = 76;
const HEIGHT = WAVE_H + LANE_H;
const OVERVIEW_H = 44;
const MIN_SPAN = 0.08;
/** Above this many samples on screen, the waveform is drawn from the overview instead. */
const MAX_EXACT_SAMPLES = 4_000_000;

type Palette = Record<"foreground" | "muted" | "accent" | "grid" | "background" | "surface" | "font", string>;

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(`--${n}`).trim();
  return {
    foreground: v("foreground"),
    muted: v("muted"),
    accent: v("accent"),
    grid: v("surface-hover"),
    background: v("background"),
    surface: v("surface"),
    font: getComputedStyle(document.body).fontFamily,
  };
}

/** Re-renders when the theme changes (the canvas reads its colours when it draws). */
function useThemeKey() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setKey((k) => k + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => obs.disconnect();
  }, []);
  return key;
}

function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

export function clampView(v: View, duration: number): View {
  const span = Math.min(duration, Math.max(MIN_SPAN, v.end - v.start));
  const start = Math.min(Math.max(0, v.start), Math.max(0, duration - span));
  return { start, end: start + span };
}

export default function Waveform({
  take,
  analysis,
  view,
  setView,
  playhead,
  onSeek,
}: {
  take: Take;
  analysis: Analysis;
  view: View;
  setView: (v: View) => void;
  playhead: number | null;
  onSeek: (t: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overviewRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ x: number; hit: Hit } | null>(null);
  const themeKey = useThemeKey();
  const { duration, toleranceMs: tol } = analysis;

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Exact peaks for the visible window, unless it's so long the overview is just as good.
  const peaks = useMemo(() => {
    if ((view.end - view.start) * take.sr > MAX_EXACT_SAMPLES) return null;
    return { start: view.start, end: view.end, data: takePeaks(take.samples, take.sr, view.start, view.end, width) };
  }, [take, view.start, view.end, width]);

  const amp = useMemo(() => {
    let m = 0;
    for (const v of analysis.overview) m = Math.max(m, Math.abs(v));
    return m > 0 ? 0.92 / m : 1;
  }, [analysis]);

  const laneRange = Math.min(120, Math.max(30, tol * 4));
  const span = view.end - view.start;
  const xOf = useCallback((t: number) => ((t - view.start) / span) * width, [view.start, span, width]);
  const tOf = useCallback((x: number) => view.start + (x / width) * span, [view.start, span, width]);

  // ---- main canvas ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = setupCanvas(canvas, width, HEIGHT);
    const c = readPalette();
    const font = (weight: number, size: number) => `${weight} ${size}px ${c.font}`;
    const laneY = (ms: number) => WAVE_H + LANE_H / 2 - (Math.max(-laneRange, Math.min(laneRange, ms)) / laneRange) * (LANE_H / 2 - 8);
    const mid = WAVE_H / 2;
    void themeKey;

    // Count-in, shaded out.
    if (analysis.countInEnd > view.start) {
      ctx.fillStyle = c.surface;
      ctx.fillRect(0, 0, Math.min(width, xOf(analysis.countInEnd)), HEIGHT);
      ctx.fillStyle = c.muted;
      ctx.font = font(600, 11);
      if (xOf(analysis.countInEnd) > 70) ctx.fillText("Count-in", 8, 12);
    }

    // Grid: bar lines, beats, subdivisions (when there's room for them).
    const beats = analysis.grid.filter((g) => g.pos === 0);
    const beatPx = beats.length > 1 ? ((beats[1].t - beats[0].t) / span) * width : 99;
    const notePx = (g: GridPoint) => beatPx / g.n;
    ctx.font = font(600, 11);
    for (const g of analysis.grid) {
      if (g.t < view.start - 0.01 || g.t > view.end + 0.01) continue;
      const x = Math.round(xOf(g.t)) + 0.5;
      const isBar = g.beat === 0 && g.pos === 0;
      const isBeat = g.pos === 0;
      if (!isBeat && notePx(g) < 7) continue;
      ctx.strokeStyle = isBar ? c.muted : c.grid;
      ctx.globalAlpha = isBar ? 0.7 : isBeat ? 1 : 0.55;
      ctx.lineWidth = isBar ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (isBar && beatPx > 22) {
        ctx.fillStyle = c.muted;
        ctx.fillText(String(g.bar), x + 4, 12);
      }
    }

    // Waveform.
    ctx.fillStyle = c.foreground;
    ctx.globalAlpha = 0.55;
    if (peaks) {
      const n = peaks.data.length / 2;
      const colSpan = (peaks.end - peaks.start) / n;
      for (let i = 0; i < n; i++) {
        const x0 = xOf(peaks.start + i * colSpan);
        const x1 = xOf(peaks.start + (i + 1) * colSpan);
        if (x1 < 0 || x0 > width) continue;
        const y0 = mid - peaks.data[i * 2 + 1] * amp * (mid - 4);
        const y1 = mid - peaks.data[i * 2] * amp * (mid - 4);
        ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      }
    } else {
      const n = analysis.overview.length / 2;
      for (let i = 0; i < n; i++) {
        const x0 = xOf((i / n) * duration);
        const x1 = xOf(((i + 1) / n) * duration);
        if (x1 < 0 || x0 > width) continue;
        const y0 = mid - analysis.overview[i * 2 + 1] * amp * (mid - 4);
        const y1 = mid - analysis.overview[i * 2] * amp * (mid - 4);
        ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      }
    }
    ctx.globalAlpha = 1;

    // Lane: zero line and the on-time band.
    ctx.fillStyle = STATUS_COLOR.good;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, laneY(tol), width, laneY(-tol) - laneY(tol));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, WAVE_H + 0.5);
    ctx.lineTo(width, WAVE_H + 0.5);
    ctx.stroke();
    ctx.strokeStyle = c.muted;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, laneY(0) + 0.5);
    ctx.lineTo(width, laneY(0) + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Missed notes: hollow markers at the foot of the waveform.
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1.5;
    for (const g of analysis.grid) {
      if (g.hit || g.t < view.start || g.t > view.end || notePx(g) < 5) continue;
      ctx.beginPath();
      ctx.arc(xOf(g.t), WAVE_H - 8, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Strokes.
    const showLabels = (span > 0 ? width / span : 0) > 260;
    for (const h of analysis.hits) {
      if (h.t < view.start - 0.05 || h.t > view.end + 0.05) continue;
      const x = xOf(h.t);
      if (h.kind !== "on") {
        ctx.strokeStyle = c.muted;
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 18);
        ctx.lineTo(x, WAVE_H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        continue;
      }
      const col = STATUS_COLOR[statusOf(h.errorMs, tol)];
      const gx = xOf(h.gridT);
      // The gap between where it should have been and where it landed.
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(Math.min(x, gx), 18, Math.max(2, Math.abs(x - gx)), WAVE_H - 18);
      ctx.globalAlpha = 1;
      ctx.fillRect(Math.min(x, gx), 18, Math.max(2, Math.abs(x - gx)), 4);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, WAVE_H);
      ctx.stroke();
      if (showLabels) {
        ctx.fillStyle = c.foreground;
        ctx.font = font(600, 11);
        ctx.fillText(`${h.errorMs > 0 ? "+" : h.errorMs < 0 ? "−" : ""}${Math.abs(h.errorMs).toFixed(1)}`, x + 4, 34);
      }
      // Lane dot, with a ring so overlapping dots stay distinct.
      ctx.beginPath();
      ctx.arc(x, laneY(h.errorMs), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = c.background;
      ctx.stroke();
    }

    ctx.fillStyle = c.muted;
    ctx.font = font(500, 10);
    ctx.fillText(`late +${laneRange} ms`, 6, WAVE_H + 12);
    ctx.fillText(`early −${laneRange} ms`, 6, HEIGHT - 4);

    if (hover) {
      ctx.strokeStyle = c.foreground;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.round(hover.x) + 0.5, 0);
      ctx.lineTo(Math.round(hover.x) + 0.5, HEIGHT);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (playhead !== null && playhead >= view.start && playhead <= view.end) {
      const x = Math.round(xOf(playhead)) + 0.5;
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
  }, [peaks, view, width, analysis, playhead, hover, themeKey, amp, xOf, laneRange, tol, span, duration]);

  // ---- overview ----
  useEffect(() => {
    const canvas = overviewRef.current;
    if (!canvas) return;
    const ctx = setupCanvas(canvas, width, OVERVIEW_H);
    const c = readPalette();
    void themeKey;
    const n = analysis.overview.length / 2;
    const mid = (OVERVIEW_H - 8) / 2;
    ctx.fillStyle = c.foreground;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < n; i++) {
      const lo = analysis.overview[i * 2] * amp;
      const hi = analysis.overview[i * 2 + 1] * amp;
      ctx.fillRect((i / n) * width, mid - hi * mid, Math.max(1, width / n), Math.max(1, (hi - lo) * mid));
    }
    ctx.globalAlpha = 1;
    for (const h of analysis.hits) {
      if (h.kind !== "on") continue;
      ctx.fillStyle = STATUS_COLOR[statusOf(h.errorMs, tol)];
      ctx.fillRect((h.t / duration) * width - 1, OVERVIEW_H - 7, 2, 7);
    }
    const vx = (view.start / duration) * width;
    const vw = Math.max(4, ((view.end - view.start) / duration) * width);
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(vx, 0, vw, OVERVIEW_H);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(vx + 1, 1, vw - 2, OVERVIEW_H - 2);
    if (playhead !== null) {
      ctx.fillStyle = c.accent;
      ctx.fillRect((playhead / duration) * width - 1, 0, 2, OVERVIEW_H);
    }
  }, [analysis, view, width, playhead, themeKey, amp, duration, tol]);

  // ---- interaction ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const s = v.end - v.start;
      const rect = canvas.getBoundingClientRect();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const d = ((e.shiftKey ? e.deltaY : e.deltaX) / rect.width) * s;
        setView(clampView({ start: v.start + d, end: v.end + d }, duration));
        return;
      }
      const at = v.start + ((e.clientX - rect.left) / rect.width) * s;
      const ns = Math.min(duration, Math.max(MIN_SPAN, s * Math.exp(e.deltaY * 0.0015)));
      const frac = (at - v.start) / s;
      setView(clampView({ start: at - frac * ns, end: at - frac * ns + ns }, duration));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [duration, setView]);

  const drag = useRef<{ x: number; start: View; moved: boolean } | null>(null);

  const nearestHit = (x: number) => {
    let best: Hit | null = null;
    let bestD = 10;
    for (const h of analysis.hits) {
      if (h.kind !== "on" && h.kind !== "extra") continue;
      const d = Math.abs(xOf(h.t) - x);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  };

  const onOverview = (clientX: number) => {
    const rect = overviewRef.current!.getBoundingClientRect();
    const t = ((clientX - rect.left) / rect.width) * duration;
    const s = view.end - view.start;
    setView(clampView({ start: t - s / 2, end: t + s / 2 }, duration));
  };

  const hoverHit = hover?.hit;
  return (
    <div ref={wrapRef} className="relative w-full touch-pan-y select-none">
      <canvas
        ref={canvasRef}
        style={{ width, height: HEIGHT }}
        className="block cursor-crosshair rounded-xl bg-background"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, start: view, moved: false };
        }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x;
            if (Math.abs(dx) > 3) d.moved = true;
            if (d.moved) {
              const s = d.start.end - d.start.start;
              const dt = (-dx / rect.width) * s;
              setView(clampView({ start: d.start.start + dt, end: d.start.end + dt }, duration));
              setHover(null);
              return;
            }
          }
          const h = nearestHit(x);
          setHover(h ? { x: xOf(h.t), hit: h } : null);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const rect = e.currentTarget.getBoundingClientRect();
            onSeek(Math.max(0, Math.min(duration, tOf(e.clientX - rect.left))));
          }
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Recording waveform with each stroke coloured by how far it was from the click"
      />
      {hoverHit && hover && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-max max-w-64 rounded-xl bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-foreground/10"
          style={{ left: Math.min(width - 200, Math.max(0, hover.x + 10)) }}
        >
          {hoverHit.kind === "on" ? (
            <>
              <div className="flex items-center gap-1.5 font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[statusOf(hoverHit.errorMs, tol)] }} />
                {STATUS_LABEL[statusOf(hoverHit.errorMs, tol)]}
              </div>
              <div className="text-foreground">{describeMs(hoverHit.errorMs, tol)}</div>
              <div className="text-muted">
                {whereLabel(hoverHit.bar, hoverHit.beat, hoverHit.pos, hoverHit.n)} · {hoverHit.peakDb.toFixed(0)} dB
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">Extra stroke</div>
              <div className="text-muted">
                A second stroke on {whereLabel(hoverHit.bar, hoverHit.beat, hoverHit.pos, hoverHit.n)} (a flam or a bounce). Not graded.
              </div>
            </>
          )}
        </div>
      )}
      <canvas
        ref={overviewRef}
        style={{ width, height: OVERVIEW_H }}
        className="mt-2 block cursor-pointer rounded-lg bg-background"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          onOverview(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) onOverview(e.clientX);
        }}
        role="img"
        aria-label="Whole take overview; click to jump"
      />
    </div>
  );
}
