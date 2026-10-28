"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SUB_LABELS } from "@/components/metronome/MetronomeOptions";
import { PlayIcon, StopIcon } from "@/components/tools";
import type { Analysis, Hit, Take } from "@/lib/timeTest/analysis";
import { playbackPosition } from "@/lib/timeTest/session";
import { STATUS_COLOR, STATUS_LABEL, describeMs, fmtTime, signedMs, statusOf, whereLabel, type Status } from "@/lib/timeTest/timing";
import Waveform, { clampView, type View } from "./Waveform";

const GRID_LINE = "var(--surface-hover)";
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function Card({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="flex min-w-0 flex-col gap-3 rounded-3xl bg-surface p-4 sm:p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Tile({ label, value, sub, status }: { label: string; value: ReactNode; sub?: ReactNode; status?: Status }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-surface px-4 py-3">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="flex items-center gap-2 text-2xl font-bold leading-tight tabular-nums">
        {status && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} aria-label={STATUS_LABEL[status]} />}
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

function StatusLegend({ tol }: { tol: number }) {
  const items: [Status, string][] = [
    ["good", `within ±${tol} ms`],
    ["warning", `up to ±${(tol * 2.5).toFixed(0)} ms`],
    ["critical", "further off"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([s, d]) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
          <span className="font-semibold text-foreground">{STATUS_LABEL[s]}</span> {d}
        </span>
      ))}
    </div>
  );
}

/** A few plain sentences on what the take shows. */
function verdict(a: Analysis, bpm: number): string {
  const s = a.stats;
  if (s.hits === 0) {
    return "No strokes were picked up after the count-in. Check the mic's sensitivity (hit the pad and watch the level in the Mic options), then try again.";
  }
  const tol = a.toleranceMs;
  const parts: string[] = [];
  const bias = Math.max(2, tol * 0.3);
  if (Math.abs(s.meanMs) < bias) parts.push(`No real push or pull: on average you're ${Math.abs(s.meanMs).toFixed(1)} ms from the click.`);
  else if (s.meanMs < 0) parts.push(`You're rushing: on average ${Math.abs(s.meanMs).toFixed(1)} ms ahead of the click.`);
  else parts.push(`You're dragging: on average ${s.meanMs.toFixed(1)} ms behind the click.`);

  const sd = s.stdMs;
  parts.push(
    sd < 5
      ? `Very consistent stroke to stroke (±${sd.toFixed(1)} ms).`
      : sd < 10
        ? `Fairly consistent (±${sd.toFixed(1)} ms stroke to stroke).`
        : sd < 20
          ? `Your placement wanders quite a bit (±${sd.toFixed(1)} ms).`
          : `Your placement is all over the place (±${sd.toFixed(1)} ms). Try a slower tempo.`,
  );

  if (s.tempoRatio && Math.abs(s.tempoRatio - 1) > 0.004) {
    parts.push(`Over the take you ${s.tempoRatio > 1 ? "sped up" : "slowed down"} to about ${(bpm * s.tempoRatio).toFixed(1)} BPM.`);
  }
  const worst = a.byPosition.filter((p) => p.count >= 3).sort((x, y) => Math.abs(y.meanMs) - Math.abs(x.meanMs))[0];
  if (a.byPosition.length > 1 && worst && Math.abs(worst.meanMs) > Math.max(tol / 2, Math.abs(s.meanMs) + 3)) {
    parts.push(`Watch the "${worst.label}"s: they land ${Math.abs(worst.meanMs).toFixed(1)} ms ${worst.meanMs < 0 ? "early" : "late"} on average.`);
  }
  return parts.join(" ");
}

type Tip = { x: number; y: number; content: ReactNode } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-60 -translate-x-1/2 -translate-y-full rounded-xl bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-foreground/10"
      style={{ left: tip.x, top: tip.y - 10 }}
    >
      {tip.content}
    </div>
  );
}

function HitTip({ h, a }: { h: Hit; a: Analysis }) {
  return (
    <>
      <div className="flex items-center gap-1.5 font-semibold">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[statusOf(h.errorMs, a.toleranceMs)] }} />
        {describeMs(h.errorMs, a.toleranceMs)}
      </div>
      <div className="text-muted">
        {whereLabel(h.bar, h.beat, h.pos, h.n)} · {fmtTime(h.t)}
      </div>
    </>
  );
}

/** Every stroke's offset across the take, with the per-bar average drawn through it. */
function TimelineChart({ a, range, onJump }: { a: Analysis; range: number; onJump: (t: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const H = 220;
  const pad = { l: 40, r: 8, t: 10, b: 24 };
  const t0 = Math.max(0, a.countInEnd);
  const t1 = Math.max(t0 + 0.1, a.duration);
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (width - pad.l - pad.r);
  const y = (ms: number) => pad.t + (1 - (Math.max(-range, Math.min(range, ms)) + range) / (2 * range)) * (H - pad.t - pad.b);
  const on = a.hits.filter((h) => h.kind === "on");
  const bars = a.byBar.filter((b) => b.count > 0);
  const barLen = a.byBar.length > 1 ? a.byBar[1].t - a.byBar[0].t : 0;
  const every = Math.max(1, Math.ceil(a.byBar.length / Math.max(1, Math.floor((width - 60) / 36))));
  const ticks = [-range, -a.toleranceMs, 0, a.toleranceMs, range];

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={H} className="block" onMouseLeave={() => setTip(null)}>
        <rect x={pad.l} y={y(a.toleranceMs)} width={Math.max(0, width - pad.l - pad.r)} height={y(-a.toleranceMs) - y(a.toleranceMs)} fill={STATUS_COLOR.good} opacity={0.12} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--muted)" : GRID_LINE} strokeWidth={1} opacity={v === 0 ? 0.7 : 1} />
            <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)" className="tabular-nums">
              {v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}`}
            </text>
          </g>
        ))}
        {a.byBar.map((b, i) =>
          i % every === 0 ? (
            <text key={b.label} x={x(b.t)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
              {b.label}
            </text>
          ) : null,
        )}
        <text x={pad.l + 6} y={pad.t + 11} fontSize={10} fill="var(--muted)">
          late ↑
        </text>
        <text x={pad.l + 6} y={H - pad.b - 4} fontSize={10} fill="var(--muted)">
          early ↓
        </text>
        {on.map((h, i) => (
          <circle key={i} cx={x(h.t)} cy={y(h.errorMs)} r={3.5} fill={STATUS_COLOR[statusOf(h.errorMs, a.toleranceMs)]} stroke="var(--surface)" strokeWidth={1.5} />
        ))}
        {bars.length > 1 && (
          <polyline
            points={bars.map((b) => `${x(b.t + barLen / 2)},${y(b.meanMs)}`).join(" ")}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* Hover and click target over the whole plot. */}
        <rect
          x={pad.l}
          y={0}
          width={Math.max(0, width - pad.l - pad.r)}
          height={H}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseMove={(e) => {
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            const mx = e.clientX - r.left;
            const my = e.clientY - r.top;
            let best: Hit | null = null;
            let bd = 14;
            for (const h of on) {
              const d = Math.hypot(x(h.t) - mx, (y(h.errorMs) - my) * 0.5);
              if (d < bd) {
                bd = d;
                best = h;
              }
            }
            setTip(best ? { x: x(best.t), y: y(best.errorMs), content: <HitTip h={best} a={a} /> } : null);
          }}
          onClick={(e) => {
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            onJump(t0 + ((e.clientX - r.left - pad.l) / (width - pad.l - pad.r)) * (t1 - t0));
          }}
        />
      </svg>
      <Tooltip tip={tip} />
      <p className="mt-1 text-xs text-muted">Bar number · each dot is a stroke · the line is each bar&apos;s average · click to look closer</p>
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** How many strokes landed at each offset. */
function Histogram({ a, range }: { a: Analysis; range: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const H = 180;
  const pad = { l: 8, r: 8, t: 10, b: 22 };
  const errors = a.hits.filter((h) => h.kind === "on").map((h) => h.errorMs);
  const bin = a.toleranceMs <= 10 ? 2 : Math.max(2, Math.round(a.toleranceMs / 5));
  const nb = Math.ceil(range / bin);
  const counts = new Array<number>(nb * 2).fill(0);
  for (const e of errors) counts[Math.min(nb * 2 - 1, Math.max(0, Math.floor(e / bin) + nb))]++;
  const max = Math.max(1, ...counts);
  const bw = (width - pad.l - pad.r) / counts.length;
  const x = (ms: number) => pad.l + ((ms + nb * bin) / (2 * nb * bin)) * (width - pad.l - pad.r);
  const ybase = H - pad.b;

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={H} className="block" onMouseLeave={() => setTip(null)}>
        {counts.map((c, i) => {
          const lo = (i - nb) * bin;
          const h = (c / max) * (H - pad.t - pad.b);
          return (
            <g key={i}>
              {c > 0 && (
                <path
                  d={roundedTop(pad.l + i * bw + 1, ybase - h, Math.max(1, bw - 2), h, Math.min(4, (bw - 2) / 2))}
                  fill={STATUS_COLOR[statusOf(lo + bin / 2, a.toleranceMs)]}
                />
              )}
              <rect
                x={pad.l + i * bw}
                y={pad.t}
                width={bw}
                height={H - pad.t - pad.b}
                fill="transparent"
                onMouseMove={() =>
                  setTip({
                    x: pad.l + i * bw + bw / 2,
                    y: ybase - h,
                    content: (
                      <>
                        <div className="font-semibold">
                          {c} stroke{c === 1 ? "" : "s"}
                        </div>
                        <div className="text-muted">
                          {i === 0 ? `≤ ${signedMs(lo + bin, 0)}` : i === counts.length - 1 ? `≥ ${signedMs(lo, 0)}` : `${signedMs(lo, 0)} to ${signedMs(lo + bin, 0)}`}
                        </div>
                      </>
                    ),
                  })
                }
              />
            </g>
          );
        })}
        <line x1={pad.l} x2={width - pad.r} y1={ybase + 0.5} y2={ybase + 0.5} stroke={GRID_LINE} />
        <line x1={x(0)} x2={x(0)} y1={pad.t} y2={ybase} stroke="var(--muted)" strokeDasharray="3 3" />
        {errors.length > 0 && <line x1={x(a.stats.meanMs)} x2={x(a.stats.meanMs)} y1={pad.t} y2={ybase} stroke="var(--foreground)" strokeWidth={2} />}
        {[-range, -range / 2, 0, range / 2, range].map((v) => (
          <text key={v} x={x(v)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
            {v === 0 ? "click" : `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v))}`}
          </text>
        ))}
      </svg>
      <Tooltip tip={tip} />
      <p className="mt-1 text-xs text-muted">Dashed line: the click · solid line: your average ({signedMs(a.stats.meanMs)})</p>
    </div>
  );
}

/** Average offset per group (beat of the bar, or note within the beat), centred on the click. */
function Breakdown({ rows, tol, range }: { rows: { label: string; meanMs: number; stdMs: number; count: number }[]; tol: number; range: number }) {
  const pct = (ms: number) => 50 + (Math.max(-range, Math.min(range, ms)) / range) * 50;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[3.25rem_1fr_5.5rem] items-center gap-3 text-sm">
          <span className="truncate font-semibold">{r.label}</span>
          <div className="relative h-6 rounded-md bg-background">
            <div className="absolute inset-y-1" style={{ left: `${pct(-tol)}%`, width: `${pct(tol) - pct(-tol)}%`, background: tint(STATUS_COLOR.good, 15) }} />
            <div className="absolute inset-y-0 left-1/2 w-px bg-muted" />
            {r.count > 0 && (
              <>
                <div
                  className="absolute top-1/2 h-px bg-foreground opacity-60"
                  style={{ left: `${pct(r.meanMs - r.stdMs)}%`, width: `${pct(r.meanMs + r.stdMs) - pct(r.meanMs - r.stdMs)}%` }}
                />
                <div
                  className="absolute inset-y-1.5"
                  style={{
                    left: `${Math.min(50, pct(r.meanMs))}%`,
                    width: `${Math.max(0.8, Math.abs(pct(r.meanMs) - 50))}%`,
                    background: STATUS_COLOR[statusOf(r.meanMs, tol)],
                    borderRadius: r.meanMs < 0 ? "4px 0 0 4px" : "0 4px 4px 0",
                  }}
                />
              </>
            )}
          </div>
          <span className="text-right text-xs tabular-nums text-muted">{r.count > 0 ? `${signedMs(r.meanMs)} ±${r.stdMs.toFixed(0)}` : "No strokes"}</span>
        </div>
      ))}
      <div className="grid grid-cols-[3.25rem_1fr_5.5rem] gap-3 text-[11px] text-muted">
        <span />
        <span className="flex justify-between">
          <span>← early</span>
          <span>late →</span>
        </span>
        <span />
      </div>
    </div>
  );
}

const roundButton = "flex h-8 min-w-8 items-center justify-center rounded-full bg-background px-2 text-sm font-semibold text-muted hover:bg-surface-hover hover:text-foreground";

/** The results of one take. Give it a new `key` for each take: the view starts again then. */
export default function Analytics({
  take,
  analysis: a,
  bpm,
  beatsPerBar,
  playing,
  onPlay,
  onStopPlayback,
  playClick,
  setPlayClick,
}: {
  take: Take;
  analysis: Analysis;
  /** The tempo shown when the take was recorded. */
  bpm: number;
  beatsPerBar: number;
  playing: boolean;
  onPlay: (from: number) => void;
  onStopPlayback: () => void;
  playClick: boolean;
  setPlayClick: (v: boolean) => void;
}) {
  const s = a.stats;
  const tol = a.toleranceMs;
  const beatLen = 60 / bpm;
  // Start at the first graded bar, zoomed to four bars.
  const [view, setView] = useState<View>(() => {
    const start = Math.max(0, a.countInEnd - beatLen / 2);
    return clampView({ start, end: start + beatLen * beatsPerBar * 4 }, a.duration);
  });
  const [cursor, setCursor] = useState(() => Math.max(0, a.countInEnd));
  const [playhead, setPlayhead] = useState<number | null>(null);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Follow playback: move the playhead, and keep it in view.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const step = () => {
      const p = playbackPosition();
      setPlayhead(p);
      if (p !== null) {
        setCursor(p);
        const v = viewRef.current;
        if (p > v.end || p < v.start) {
          const sp = v.end - v.start;
          setView(clampView({ start: p - sp * 0.1, end: p + sp * 0.9 }, a.duration));
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      setTimeout(() => setPlayhead(null), 0);
    };
  }, [playing, a.duration]);

  const jump = (t: number) => {
    const sp = Math.max(0.6, beatLen * 2);
    setView(clampView({ start: t - sp / 2, end: t + sp / 2 }, a.duration));
    setCursor(Math.max(0, t - sp / 2));
    document.getElementById("time-test-waveform")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const zoom = (f: number) => {
    const mid = (view.start + view.end) / 2;
    const sp = (view.end - view.start) * f;
    setView(clampView({ start: mid - sp / 2, end: mid + sp / 2 }, a.duration));
  };

  const on = useMemo(() => a.hits.filter((h) => h.kind === "on"), [a]);
  const range = useMemo(() => {
    const sorted = on.map((h) => Math.abs(h.errorMs)).sort((x, y) => x - y);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    return Math.min(100, Math.max(tol * 3, Math.ceil((p95 * 1.2) / 5) * 5));
  }, [on, tol]);

  const byBeat = useMemo(
    () =>
      Array.from({ length: beatsPerBar }, (_, b) => {
        const e = on.filter((h) => h.beat === b && h.pos === 0).map((h) => h.errorMs);
        const m = e.reduce((x, y) => x + y, 0) / Math.max(1, e.length);
        const sd = Math.sqrt(e.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, e.length));
        return { label: `Beat ${b + 1}`, meanMs: m, stdMs: sd, count: e.length };
      }),
    [on, beatsPerBar],
  );

  const worst = useMemo(() => [...on].sort((x, y) => Math.abs(y.errorMs) - Math.abs(x.errorMs)).slice(0, 6), [on]);
  const measured = s.tempoRatio ? bpm * s.tempoRatio : null;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-extrabold tracking-tight">How you did</h2>
        <p className="max-w-3xl text-sm leading-relaxed">{verdict(a, bpm)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Score"
          value={
            <>
              {Math.round(s.score)}
              <span className="text-sm font-semibold text-muted">/100</span>
            </>
          }
          sub="Full marks within tolerance"
        />
        <Tile
          label={`On time (±${tol} ms)`}
          value={`${Math.round(s.withinPct)}%`}
          sub={`${s.onCount} of ${s.hits} strokes`}
          status={s.withinPct >= 80 ? "good" : s.withinPct >= 50 ? "warning" : "critical"}
        />
        <Tile label="Average" value={signedMs(s.meanMs)} sub={Math.abs(s.meanMs) < 1 ? "Centred on the click" : s.meanMs < 0 ? "Early (rushing)" : "Late (dragging)"} />
        <Tile label="Consistency" value={`±${s.stdMs.toFixed(1)} ms`} sub="Spread stroke to stroke" />
        <Tile
          label="Your tempo"
          value={measured ? measured.toFixed(1) : "–"}
          sub={measured ? `Click ${bpm} BPM (${measured >= bpm ? "+" : ""}${(measured - bpm).toFixed(1)})` : "Needs 8 or more strokes"}
        />
        <Tile label="Strokes" value={s.hits} sub={`${s.missed} missed · ${s.extra} extra`} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          {s.earlyCount} early · {s.onCount} on time · {s.lateCount} late
        </span>
        <span>
          Furthest early {signedMs(s.maxEarlyMs)} · furthest late {signedMs(s.maxLateMs)}
        </span>
        <span>
          {a.autoDetected ? "Heard as " : "Graded as "}
          {a.notesPerBeat === 0
            ? "a mix (beat by beat)"
            : a.notesPerBeat === 1
              ? "one note a beat"
              : (SUB_LABELS[a.notesPerBeat] ?? `${a.notesPerBeat} per beat`).toLowerCase()}
        </span>
        {a.bleedIgnored > 0 && (
          <span>
            Ignored {a.bleedIgnored} click{a.bleedIgnored === 1 ? "" : "s"} the mic picked up
          </span>
        )}
      </div>

      <section id="time-test-waveform" className="flex min-w-0 flex-col gap-3 rounded-3xl bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => (playing ? onStopPlayback() : onPlay(cursor))}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              playing ? "bg-background hover:bg-surface-hover" : "bg-accent text-accent-foreground hover:bg-accent-hover"
            }`}
          >
            {playing ? <StopIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
            {playing ? "Stop" : "Play"}
          </button>
          <button
            type="button"
            aria-pressed={playClick}
            onClick={() => setPlayClick(!playClick)}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition ${playClick ? "bg-background text-foreground" : "text-muted hover:bg-background"}`}
          >
            {playClick ? "With click" : "Without click"}
          </button>
          <span className="text-sm tabular-nums text-muted">
            {fmtTime(playhead ?? cursor)} / {fmtTime(a.duration)}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => zoom(2)} aria-label="Zoom out" title="Zoom out" className={roundButton}>
              −
            </button>
            <button type="button" onClick={() => zoom(0.5)} aria-label="Zoom in" title="Zoom in" className={roundButton}>
              +
            </button>
            <button type="button" onClick={() => setView({ start: 0, end: a.duration })} className={`${roundButton} px-3 text-xs`}>
              Whole take
            </button>
          </div>
        </div>
        <Waveform
          take={take}
          analysis={a}
          view={view}
          setView={setView}
          playhead={playhead}
          onSeek={(t) => {
            setCursor(t);
            if (playing) onPlay(t);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusLegend tol={tol} />
          <span className="text-xs text-muted">Scroll to zoom · drag to move · click to set where playback starts</span>
        </div>
        <p className="text-xs text-muted">
          Vertical lines are the click (bars numbered). Each stroke is a coloured line, shaded back to where it should have landed; the strip below shows how
          early or late it was. Dashed lines are extra strokes, and hollow circles are notes you didn&apos;t play.
        </p>
      </section>

      <Card title="Timing across the take">
        <TimelineChart a={a} range={range} onJump={jump} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Where your strokes land">
          <Histogram a={a} range={range} />
        </Card>
        <Card title="Worst moments">
          {worst.length === 0 ? (
            <p className="text-sm text-muted">Nothing to show.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {worst.map((h, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => jump(h.t)}
                    className="flex w-full items-center gap-3 rounded-xl bg-background px-3 py-2 text-left text-sm hover:bg-surface-hover"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[statusOf(h.errorMs, tol)] }} />
                    <span className="min-w-0 flex-1 truncate">{whereLabel(h.bar, h.beat, h.pos, h.n)}</span>
                    <span className="font-semibold tabular-nums">{describeMs(h.errorMs, tol).replace(", on time", "")}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-muted">{fmtTime(h.t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {beatsPerBar > 1 && (
          <Card title="By beat of the bar">
            <Breakdown rows={byBeat} tol={tol} range={range} />
          </Card>
        )}
        {a.byPosition.length > 1 && (
          <Card title="By note within the beat">
            <Breakdown rows={a.byPosition} tol={tol} range={range} />
          </Card>
        )}
      </div>
    </div>
  );
}
