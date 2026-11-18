"use client";

import { useAction } from "convex/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CloseIcon, findToolLink, PlusIcon } from "@/components/tools";

// ---------------------------------------------------------------- metrics

type Agg = "sum" | "avg";
type MetricDef = { label: string; group: string; agg: Agg; unit?: string; round?: boolean };

const METRICS: Record<string, MetricDef> = {
  visits: { label: "Visits", group: "Usage", agg: "sum" },
  visitsAccount: { label: "Visits (signed in)", group: "Usage", agg: "sum" },
  visitsGuest: { label: "Visits (no account)", group: "Usage", agg: "sum" },
  pageViews: { label: "Page views", group: "Usage", agg: "sum" },
  toolStarts: { label: "Tools started", group: "Usage", agg: "sum" },
  toolMinutes: { label: "Minutes in tools", group: "Usage", agg: "sum", unit: "min", round: true },
  signups: { label: "Sign-ups", group: "Accounts", agg: "sum" },
  signins: { label: "Sign-ins", group: "Accounts", agg: "sum" },
  activeAccounts: { label: "Active accounts", group: "Accounts", agg: "avg" },
  practiceMinutes: { label: "Minutes practised", group: "Practice", agg: "sum", unit: "min", round: true },
  practicers: { label: "People practising", group: "Practice", agg: "avg" },
  posts: { label: "Posts", group: "Community", agg: "sum" },
  likes: { label: "Likes", group: "Community", agg: "sum" },
  follows: { label: "Follows", group: "Community", agg: "sum" },
  sharedSetlists: { label: "Setlists shared", group: "Community", agg: "sum" },
  recordings: { label: "Recordings", group: "Content", agg: "sum" },
  recordingMinutes: { label: "Minutes recorded", group: "Content", agg: "sum", unit: "min", round: true },
  charts: { label: "Chord charts added", group: "Content", agg: "sum" },
  students: { label: "Students added", group: "Lessons", agg: "sum" },
  lessonItems: { label: "Lesson items", group: "Lessons", agg: "sum" },
  bookings: { label: "Lessons booked", group: "Lessons", agg: "sum" },
  feedback: { label: "Feedback", group: "Inbox", agg: "sum" },
};
const GROUPS = ["Usage", "Accounts", "Practice", "Community", "Content", "Lessons", "Inbox"];
// Series colours come from the theme: the accent turned around the colour wheel (see globals.css).
const PALETTE = ["var(--cat-0)", "var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)", "var(--muted)"];

type ChartType = "line" | "area" | "bar" | "stacked";
type Bucket = "day" | "week" | "month";
type ChartCfg = { id: string; title: string; metrics: string[]; type: ChartType; bucket: Bucket; cumulative: boolean; wide?: boolean };

const DEFAULT_CHARTS: ChartCfg[] = [
  { id: "visitors", title: "Visitors", metrics: ["visitsAccount", "visitsGuest"], type: "stacked", bucket: "day", cumulative: false, wide: true },
  { id: "growth", title: "Accounts over time", metrics: ["signups"], type: "area", bucket: "day", cumulative: true },
  { id: "practice", title: "Practice", metrics: ["practiceMinutes", "toolMinutes"], type: "bar", bucket: "week", cumulative: false },
  { id: "community", title: "Community", metrics: ["posts", "likes", "follows"], type: "line", bucket: "week", cumulative: false },
  { id: "active", title: "Active accounts a day", metrics: ["activeAccounts", "practicers"], type: "line", bucket: "day", cumulative: false },
];
const CHARTS_KEY = "jam-practice-admin-charts";
const RANGES = [7, 30, 90, 180, 365];

type Data = {
  since: string;
  today: string;
  series: Record<string, Record<string, number>>;
  totals: { accounts: number; profiles: number; publicProfiles: number };
  tools: { href: string; starts: number; minutes: number; practiceMinutes: number }[];
  pages: { path: string; views: number }[];
  providers: Record<string, number>;
  instruments: Record<string, number>;
  postKinds: Record<string, number>;
  feedbackKinds: Record<string, number>;
};

// ---------------------------------------------------------------- dates

const DAY = 86_400_000;
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const msOf = (key: string) => Date.parse(`${key}T00:00:00Z`);
function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let t = msOf(from); t <= msOf(to); t += DAY) out.push(keyOf(t));
  return out;
}
function bucketOf(day: string, b: Bucket) {
  if (b === "day") return day;
  if (b === "month") return day.slice(0, 7);
  const t = msOf(day);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return keyOf(t - dow * DAY);
}
function bucketLabel(k: string, b: Bucket, short = false) {
  const d = new Date(b === "month" ? `${k}-01T00:00:00Z` : `${k}T00:00:00Z`);
  if (b === "month") return d.toLocaleDateString(undefined, { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" });
  const s = d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return b === "week" && !short ? `Week of ${s}` : s;
}

const fmt = (n: number, round = false) => (round || Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString();

// ---------------------------------------------------------------- page

/** Admin → Analytics: KPIs against the period before, customizable charts, and breakdowns. */
export default function Analytics() {
  const run = useAction(api.adminAnalytics.analytics);
  const [range, setRange] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [loadedRange, setLoadedRange] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [charts, setCharts] = useState<ChartCfg[]>(() => {
    try {
      const raw = localStorage.getItem(CHARTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as ChartCfg[]) : null;
      return Array.isArray(parsed) && parsed.length ? parsed.map((c) => ({ ...c, metrics: c.metrics.filter((m) => METRICS[m]) })) : DEFAULT_CHARTS;
    } catch {
      return DEFAULT_CHARTS;
    }
  });
  const saveCharts = (next: ChartCfg[]) => {
    setCharts(next);
    try {
      localStorage.setItem(CHARTS_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    let live = true;
    run({ days: range * 2 })
      .then((d) => {
        if (!live) return;
        setData(d as Data);
        setLoadedRange(range);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [run, range, refresh]);

  const loading = loadedRange !== range;
  const days = useMemo(() => (data ? daysBetween(data.since, data.today) : []), [data]);
  const current = days.slice(-range);
  const previous = days.slice(-range * 2, -range);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Period" className="flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-surface p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              onClick={() => setRange(r)}
              className={`shrink-0 whitespace-nowrap rounded-sm px-2.5 py-1.5 text-sm font-medium transition-colors ${range === r ? "bg-surface-hover text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {r === 365 ? "1 year" : `${r} days`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRefresh((n) => n + 1)}
          className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover"
        >
          Refresh
        </button>
        {loading && data && <LoadingSpinner size="sm" />}
        <span className="w-full text-xs text-muted sm:ml-auto sm:w-auto">Usage counts are anonymous daily totals. Admins aren&apos;t counted. Days are UTC.</span>
      </div>
      {error && <p className="rounded-md border border-danger/30 px-3 py-2 text-sm text-danger">{error}</p>}
      {!data ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <Kpis data={data} current={current} previous={previous} />
          <div className="grid gap-4 xl:grid-cols-2">
            {charts.map((c, i) => (
              <ChartCard
                key={c.id}
                cfg={c}
                data={data}
                days={current}
                onChange={(next) => saveCharts(charts.map((x, j) => (j === i ? next : x)))}
                onRemove={() => saveCharts(charts.filter((_, j) => j !== i))}
                onMove={(dir) => {
                  const j = i + dir;
                  if (j < 0 || j >= charts.length) return;
                  const next = [...charts];
                  [next[i], next[j]] = [next[j], next[i]];
                  saveCharts(next);
                }}
              />
            ))}
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/15 p-6">
              <button
                type="button"
                onClick={() =>
                  saveCharts([...charts, { id: `c${Date.now()}`, title: "New chart", metrics: ["pageViews"], type: "line", bucket: "day", cumulative: false }])
                }
                className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover"
              >
                <PlusIcon className="h-4 w-4" /> Add a chart
              </button>
              <button type="button" onClick={() => saveCharts(DEFAULT_CHARTS)} className="text-xs text-muted hover:text-foreground hover:underline">
                Reset charts to the defaults
              </button>
            </div>
          </div>
          <Breakdowns data={data} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- KPIs

function sumOver(data: Data, metric: string, days: string[]) {
  const s = data.series[metric] ?? {};
  const total = days.reduce((a, d) => a + (s[d] ?? 0), 0);
  return METRICS[metric]?.agg === "avg" ? total / Math.max(1, days.length) : total;
}

function Kpis({ data, current, previous }: { data: Data; current: string[]; previous: string[] }) {
  const items: { metric: string; label?: string }[] = [
    { metric: "visits" },
    { metric: "pageViews" },
    { metric: "signups" },
    { metric: "activeAccounts", label: "Active accounts / day" },
    { metric: "practiceMinutes" },
    { metric: "toolStarts" },
    { metric: "posts" },
    { metric: "feedback" },
  ];
  return (
    <div className="flex flex-col gap-2">
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-foreground/[0.05] bg-foreground/10 md:grid-cols-4">
      {items.map(({ metric, label }) => {
        const m = METRICS[metric];
        const now = sumOver(data, metric, current);
        const before = sumOver(data, metric, previous);
        const change = before > 0 ? ((now - before) / before) * 100 : now > 0 ? 100 : 0;
        const s = data.series[metric] ?? {};
        return (
          <div key={metric} className="flex min-w-0 flex-col gap-1 bg-surface p-4">
            <span className="truncate text-xs text-muted">{label ?? m.label}</span>
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {fmt(now, m.round)}
              {m.unit && <span className="ml-1 text-sm font-normal text-muted">{m.unit}</span>}
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className={`truncate text-xs font-medium ${change > 0 ? "text-foreground" : change < 0 ? "text-danger" : "text-muted"}`}>
                {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(Math.round(change))}% <span className="font-normal text-muted">vs before</span>
              </span>
              <Sparkline values={current.map((d) => s[d] ?? 0)} />
            </div>
          </div>
        );
      })}
    </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
        <span>
          <span className="font-medium tabular-nums text-foreground">{data.totals.accounts}</span> accounts in all
        </span>
        <span>
          <span className="font-medium tabular-nums text-foreground">{data.totals.publicProfiles}</span> public profiles
        </span>
      </p>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 64;
  const h = 18;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible text-accent">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- charts

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A round step for 4 gridlines that fit `v` (1, 2, 2.5, 5 × 10ⁿ, never below 1). */
function niceStep(v: number) {
  const raw = Math.max(1, v / 4);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function buildSeries(cfg: ChartCfg, data: Data, days: string[]) {
  const buckets: string[] = [];
  for (const d of days) {
    const b = bucketOf(d, cfg.bucket);
    if (buckets[buckets.length - 1] !== b) buckets.push(b);
  }
  const lines = cfg.metrics.map((metric) => {
    const s = data.series[metric] ?? {};
    const def = METRICS[metric];
    const vals = new Map<string, { sum: number; n: number }>();
    for (const d of days) {
      const b = bucketOf(d, cfg.bucket);
      const cur = vals.get(b) ?? { sum: 0, n: 0 };
      cur.sum += s[d] ?? 0;
      cur.n += 1;
      vals.set(b, cur);
    }
    let run = 0;
    const values = buckets.map((b) => {
      const v = vals.get(b)!;
      const val = def.agg === "avg" ? v.sum / v.n : v.sum;
      run += val;
      return cfg.cumulative && def.agg === "sum" ? run : val;
    });
    return { metric, label: def.label, values, round: def.round };
  });
  return { buckets, lines };
}

function ChartCard({
  cfg,
  data,
  days,
  onChange,
  onRemove,
  onMove,
}: {
  cfg: ChartCfg;
  data: Data;
  days: string[];
  onChange: (c: ChartCfg) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const { buckets, lines } = useMemo(() => buildSeries(cfg, data, days), [cfg, data, days]);
  const shown = lines.filter((l) => !hidden.includes(l.metric));
  const colorOf = (metric: string) => PALETTE[cfg.metrics.indexOf(metric) % PALETTE.length];
  const total = (vals: number[], m: string) => (cfg.cumulative && METRICS[m].agg === "sum" ? (vals[vals.length - 1] ?? 0) : vals.reduce((a, b) => a + b, 0));

  return (
    <section className={`flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface ${cfg.wide ? "xl:col-span-2" : ""}`}>
      <div className="flex h-11 shrink-0 items-center gap-2 px-4">
        <h3 className="min-w-0 truncate text-sm font-medium">{cfg.title}</h3>
        <span className="hidden truncate text-xs text-muted sm:block">
          {{ day: "Per day", week: "Per week", month: "Per month" }[cfg.bucket]}
          {cfg.cumulative ? " · running total" : ""}
        </span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className={`ml-auto flex h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium transition-colors ${editing ? "bg-surface-hover text-foreground" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}
        >
          {editing ? "Done" : "Customize"}
        </button>
      </div>
      <div className="flex flex-col gap-3 p-4">

      {editing && <ChartEditor cfg={cfg} onChange={onChange} onRemove={onRemove} onMove={onMove} />}

      <div className="flex flex-wrap gap-1.5">
        {lines.map((l) => {
          const off = hidden.includes(l.metric);
          return (
            <button
              key={l.metric}
              type="button"
              onClick={() => setHidden((h) => (off ? h.filter((x) => x !== l.metric) : [...h, l.metric]))}
              aria-pressed={!off}
              className={`flex h-7 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2 text-xs font-medium transition-colors hover:bg-surface-hover ${off ? "opacity-40" : ""}`}
              title={off ? "Show" : "Hide"}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: colorOf(l.metric) }} />
              {l.label}
              <span className="tabular-nums text-muted">{fmt(total(l.values, l.metric), l.round)}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">Pick something to show.</p>
      ) : (
        <TimeChart type={cfg.type} bucket={cfg.bucket} buckets={buckets} lines={shown} colorOf={colorOf} />
      )}
      </div>
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-0.5 rounded-md bg-background p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-sm px-2 py-1 text-xs font-medium transition-colors ${value === v ? "bg-surface-hover text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ChartEditor({ cfg, onChange, onRemove, onMove }: { cfg: ChartCfg; onChange: (c: ChartCfg) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  const toggle = (m: string) => onChange({ ...cfg, metrics: cfg.metrics.includes(m) ? cfg.metrics.filter((x) => x !== m) : [...cfg.metrics, m].slice(0, 8) });
  return (
    <div className="flex flex-col gap-3 rounded-md bg-background p-3">
      <input
        value={cfg.title}
        onChange={(e) => onChange({ ...cfg, title: e.target.value.slice(0, 60) })}
        aria-label="Chart title"
        className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Seg
          value={cfg.type}
          onChange={(type) => onChange({ ...cfg, type })}
          options={[
            ["line", "Line"],
            ["area", "Area"],
            ["bar", "Bars"],
            ["stacked", "Stacked bars"],
          ]}
        />
        <Seg
          value={cfg.bucket}
          onChange={(bucket) => onChange({ ...cfg, bucket })}
          options={[
            ["day", "Daily"],
            ["week", "Weekly"],
            ["month", "Monthly"],
          ]}
        />
        <label className="flex items-center gap-2 text-xs font-medium">
          <input type="checkbox" checked={cfg.cumulative} onChange={(e) => onChange({ ...cfg, cumulative: e.target.checked })} className="accent-[var(--accent)]" />
          Running total
        </label>
        <label className="flex items-center gap-2 text-xs font-medium">
          <input type="checkbox" checked={!!cfg.wide} onChange={(e) => onChange({ ...cfg, wide: e.target.checked })} className="accent-[var(--accent)]" />
          Full width
        </label>
      </div>
      {GROUPS.map((g) => (
        <div key={g} className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 shrink-0 text-xs font-medium text-muted">{g}</span>
          {Object.entries(METRICS)
            .filter(([, m]) => m.group === g)
            .map(([id, m]) => {
              const on = cfg.metrics.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  aria-pressed={on}
                  className={`h-7 rounded-md border px-2 text-xs font-medium transition-colors ${on ? "border-foreground/40 bg-surface-hover text-foreground" : "border-foreground/10 text-muted hover:text-foreground"}`}
                >
                  {m.label}
                </button>
              );
            })}
        </div>
      ))}
      <div className="flex flex-wrap gap-2 border-t border-foreground/10 pt-3">
        <button type="button" onClick={() => onMove(-1)} className="h-8 rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover">
          ← Move earlier
        </button>
        <button type="button" onClick={() => onMove(1)} className="h-8 rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-surface-hover">
          Move later →
        </button>
        <button type="button" onClick={onRemove} className="ml-auto flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10">
          <CloseIcon className="h-3 w-3" /> Remove chart
        </button>
      </div>
    </div>
  );
}

const H = 220;
const PAD = { l: 40, r: 10, t: 10, b: 26 };

function TimeChart({
  type,
  bucket,
  buckets,
  lines,
  colorOf,
}: {
  type: ChartType;
  bucket: Bucket;
  buckets: string[];
  lines: { metric: string; label: string; values: number[]; round?: boolean }[];
  colorOf: (m: string) => string;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = buckets.length;
  const w = Math.max(200, width);
  const iw = w - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const stackedTotals = buckets.map((_, i) => lines.reduce((a, l) => a + l.values[i], 0));
  const rawMax = type === "stacked" ? Math.max(0, ...stackedTotals) : Math.max(0, ...lines.flatMap((l) => l.values));
  const step = niceStep(rawMax);
  const max = step * 4;
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const slot = iw / Math.max(1, n);
  const xc = (i: number) => PAD.l + slot * i + slot / 2;
  const ticks = [0, 1, 2, 3, 4].map((k) => k * step);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const gradId = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div ref={ref} className="relative w-full select-none">
      {width > 0 && (
        <svg width={w} height={H} onMouseLeave={() => setHover(null)} className="overflow-visible">
          <defs>
            {lines.map((l) => (
              <linearGradient key={l.metric} id={`${gradId}-${l.metric}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={colorOf(l.metric)} stopOpacity={0.35} />
                <stop offset="100%" stopColor={colorOf(l.metric)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} className="stroke-foreground/10" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={PAD.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[10px] tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          {buckets.map((b, i) =>
            i % labelEvery === 0 ? (
              <text key={b} x={xc(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[10px]">
                {bucketLabel(b, bucket, true)}
              </text>
            ) : null,
          )}
          {hover !== null && <rect x={PAD.l + slot * hover} y={PAD.t} width={slot} height={ih} className="fill-foreground/5" />}

          {type === "bar" &&
            lines.map((l, li) => {
              const bw = Math.max(1, (slot * 0.75) / lines.length);
              return l.values.map((v, i) => (
                <rect
                  key={`${l.metric}${i}`}
                  x={PAD.l + slot * i + slot * 0.125 + bw * li}
                  y={y(v)}
                  width={Math.max(1, bw - 1)}
                  height={Math.max(0, PAD.t + ih - y(v))}
                  rx={Math.min(4, bw / 3)}
                  fill={colorOf(l.metric)}
                />
              ));
            })}

          {type === "stacked" &&
            buckets.map((b, i) => {
              let acc = 0;
              const bw = Math.max(1, slot * 0.7);
              return lines.map((l, li) => {
                const v = l.values[i];
                const top = y(acc + v);
                const bottom = y(acc);
                acc += v;
                return (
                  <rect
                    key={`${b}${l.metric}`}
                    x={PAD.l + slot * i + (slot - bw) / 2}
                    y={top}
                    width={bw}
                    height={Math.max(0, bottom - top)}
                    rx={li === lines.length - 1 ? Math.min(4, bw / 3) : 0}
                    fill={colorOf(l.metric)}
                  />
                );
              });
            })}

          {(type === "line" || type === "area") &&
            lines.map((l) => {
              const pts = l.values.map((v, i) => [xc(i), y(v)] as const);
              const path = pts.map(([x, yy], i) => `${i ? "L" : "M"}${x},${yy}`).join(" ");
              return (
                <g key={l.metric}>
                  {type === "area" && pts.length > 0 && (
                    <path d={`${path} L${pts[pts.length - 1][0]},${PAD.t + ih} L${pts[0][0]},${PAD.t + ih} Z`} fill={`url(#${gradId}-${l.metric})`} />
                  )}
                  <path d={path} fill="none" stroke={colorOf(l.metric)} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
                  {hover !== null && pts[hover] && (
                    <circle cx={pts[hover][0]} cy={pts[hover][1]} r={4} fill={colorOf(l.metric)} className="stroke-surface" strokeWidth={2} />
                  )}
                  {n <= 31 && hover === null && pts.map(([x, yy], i) => <circle key={i} cx={x} cy={yy} r={2} fill={colorOf(l.metric)} />)}
                </g>
              );
            })}

          {buckets.map((b, i) => (
            <rect
              key={`h${b}`}
              x={PAD.l + slot * i}
              y={PAD.t}
              width={slot}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          ))}
        </svg>
      )}
      {hover !== null && buckets[hover] && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-lg"
          style={{ left: Math.min(Math.max(0, xc(hover) - 72), w - 150) }}
        >
          <p className="mb-1 font-medium">{bucketLabel(buckets[hover], bucket)}</p>
          {lines.map((l) => (
            <p key={l.metric} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: colorOf(l.metric) }} />
                {l.label}
              </span>
              <span className="font-medium tabular-nums">{fmt(l.values[hover], l.round)}</span>
            </p>
          ))}
          {type === "stacked" && lines.length > 1 && (
            <p className="mt-1 flex justify-between border-t border-background/20 pt-1">
              Total <span className="font-medium tabular-nums">{fmt(stackedTotals[hover])}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- breakdowns

const TOOL_LABEL = (href: string) => findToolLink(href)?.label ?? href;
const PRETTY: Record<string, string> = {
  google: "Google",
  password: "Email & password",
  tunes: "Tunes",
  setlist: "Setlist",
  routine: "Routine",
  milestone: "Milestone",
  bug: "Bug",
  feature: "Idea",
  other: "Other",
  report: "Report",
};

function Breakdowns({ data }: { data: Data }) {
  const [toolBy, setToolBy] = useState<"starts" | "minutes" | "practiceMinutes">("starts");
  const tools = data.tools.map((t) => ({ label: TOOL_LABEL(t.href), value: t[toolBy] })).filter((t) => t.value > 0);
  const toEntries = (r: Record<string, number>, cap = (s: string) => PRETTY[s] ?? s.charAt(0).toUpperCase() + s.slice(1)) =>
    Object.entries(r)
      .map(([k, v]) => ({ label: cap(k), value: v }))
      .filter((e) => e.value > 0);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <BreakdownCard
        title="Most used tools"
        subtitle={{ starts: "Times started", minutes: "Minutes running", practiceMinutes: "Minutes logged in Shed Logs" }[toolBy]}
        entries={tools}
        extra={
          <Seg
            value={toolBy}
            onChange={setToolBy}
            options={[
              ["starts", "Starts"],
              ["minutes", "Minutes"],
              ["practiceMinutes", "Shed Log"],
            ]}
          />
        }
        empty="No tool use counted yet."
      />
      <BreakdownCard
        title="Top pages"
        subtitle="Page views"
        entries={data.pages.map((p) => ({ label: p.path, value: p.views }))}
        empty="No page views counted yet."
        mono
      />
      <BreakdownCard title="Instruments people play" subtitle="From profiles" entries={toEntries(data.instruments)} empty="Nobody's listed an instrument yet." />
      <BreakdownCard title="Sign-in methods" subtitle="Linked to accounts" entries={toEntries(data.providers)} defaultKind="donut" />
      <BreakdownCard title="Posts by kind" subtitle="In this period" entries={toEntries(data.postKinds)} defaultKind="donut" empty="No posts in this period." />
      <BreakdownCard title="Feedback by kind" subtitle="In this period" entries={toEntries(data.feedbackKinds)} defaultKind="donut" empty="No feedback in this period." />
    </div>
  );
}

function BreakdownCard({
  title,
  subtitle,
  entries,
  extra,
  empty = "Nothing yet.",
  defaultKind = "bars",
  mono = false,
}: {
  title: string;
  subtitle: string;
  entries: { label: string; value: number }[];
  extra?: ReactNode;
  empty?: string;
  defaultKind?: "bars" | "donut";
  mono?: boolean;
}) {
  const [kind, setKind] = useState<"bars" | "donut">(defaultKind);
  const [all, setAll] = useState(false);
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const top = all ? sorted : sorted.slice(0, 8);
  const total = sorted.reduce((a, e) => a + e.value, 0);
  const max = Math.max(1, ...sorted.map((e) => e.value));
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface">
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 px-4 py-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        {extra}
        <Seg
          value={kind}
          onChange={setKind}
          options={[
            ["bars", "Bars"],
            ["donut", "Donut"],
          ]}
        />
      </div>
      <div className="flex flex-col gap-3 p-4">
      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{empty}</p>
      ) : kind === "bars" ? (
        <ul className="flex flex-col gap-2">
          {top.map((e) => (
            <li key={e.label} className="flex items-center gap-3 text-sm">
              <span className={`w-28 shrink-0 truncate sm:w-36 ${mono ? "font-mono text-xs" : ""}`} title={e.label}>
                {e.label}
              </span>
              <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
                <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(e.value / max) * 100}%` }} />
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums text-muted">{fmt(e.value, true)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Donut entries={top} total={total} />
      )}
      {sorted.length > 8 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="self-start text-xs text-muted transition-colors hover:text-foreground">
          {all ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      )}
      </div>
    </section>
  );
}

function Donut({ entries, total }: { entries: { label: string; value: number }[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const r = 60;
  const c = 2 * Math.PI * r;
  const shownTotal = entries.reduce((a, e) => a + e.value, 0);
  const lens = entries.map((e) => (e.value / Math.max(1, shownTotal)) * c);
  const offsets = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={160} height={160} viewBox="0 0 160 160" className="shrink-0 -rotate-90">
        <circle cx={80} cy={80} r={r} fill="none" className="stroke-background" strokeWidth={22} />
        {entries.map((e, i) => {
          const len = lens[i];
          return (
            <circle
              key={e.label}
              cx={80}
              cy={80}
              r={r}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={hover === i ? 28 : 22}
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
              strokeDashoffset={-offsets[i]}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="transition-[stroke-width]"
            />
          );
        })}
        <text x={80} y={80} textAnchor="middle" dominantBaseline="middle" transform="rotate(90 80 80)" className="fill-foreground text-xl font-semibold">
          {hover !== null ? fmt(entries[hover].value, true) : fmt(total, true)}
        </text>
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
        {entries.map((e, i) => (
          <li
            key={e.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 ${hover !== null && hover !== i ? "opacity-50" : ""}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate">{e.label}</span>
            <span className="tabular-nums text-muted">
              {fmt(e.value, true)} · {Math.round((e.value / Math.max(1, total)) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
