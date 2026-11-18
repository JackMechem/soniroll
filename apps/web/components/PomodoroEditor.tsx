"use client";

import NumberField from "@/components/NumberField";
import { OptionGroup, Segmented } from "@/components/metronome/MetronomeOptions";
import type { PomodoroConfig } from "@/lib/practiceTimer";

const MAX_CYCLES = 24;

/** How many cycle names there are slots for: one per work cycle, or, when it keeps going, one per
    cycle in a round (names repeat after each long break). */
export function nameSlots(config: PomodoroConfig) {
  return config.totalCycles ?? config.cyclesBeforeLongBreak;
}

/** Keeps `workTitles` to exactly the cycles that exist (no names beyond the last cycle) and drops
    trailing blanks. */
export function normalizePomodoro(config: PomodoroConfig): PomodoroConfig {
  const titles = config.workTitles.slice(0, nameSlots(config));
  while (titles.length && !titles[titles.length - 1].trim()) titles.pop();
  return { ...config, workTitles: titles };
}

function formatTotal(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/** A small "label, then − number +" card, three of which sit side by side. */
function MinutesCard({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const step = "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30";
  return (
    <div className="flex flex-col items-center gap-1 rounded-md bg-background px-1.5 py-2.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex items-center">
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} className={step} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </button>
        <NumberField
          label={`${label} minutes`}
          value={value}
          min={min}
          max={max}
          onChange={onChange}
          className="w-10 rounded-md bg-transparent text-center text-xl font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <button type="button" aria-label={`More ${label.toLowerCase()}`} className={step} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
      </div>
      <span className="text-[11px] text-muted">min</span>
    </div>
  );
}

function CountRow({ label, value, min, max, onChange, suffix }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; suffix: string }) {
  const step = "flex h-8 w-8 items-center justify-center rounded-md bg-background text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Fewer: ${label}`} className={step} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </button>
        <span className="w-16 text-center font-medium tabular-nums">
          {value} {suffix}
        </span>
        <button type="button" aria-label={`More: ${label}`} className={step} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

/**
 * The Pomodoro session editor. Everything follows from the cycles: three timing cards, how many
 * cycles (or keep going) and how often the long break comes, then exactly one optional name per
 * cycle (so there can't be more names than cycles), and a preview of the run in order.
 */
export default function PomodoroEditor({ config, onChange }: { config: PomodoroConfig; onChange: (config: PomodoroConfig) => void }) {
  const update = (patch: Partial<PomodoroConfig>) => onChange(normalizePomodoro({ ...config, ...patch }));
  const forever = config.totalCycles === null;
  const slots = nameSlots(config);
  const every = config.cyclesBeforeLongBreak;

  function setName(i: number, name: string) {
    const titles = Array.from({ length: slots }, (_, j) => (j === i ? name : (config.workTitles[j] ?? "")));
    update({ workTitles: titles });
  }

  // The run, in order: every cycle (or one round, when it keeps going), with the breaks between.
  const cycles = forever ? every : (config.totalCycles ?? 0);
  const steps: { kind: "work" | "short" | "long"; label: string; minutes: number }[] = [];
  for (let i = 0; i < cycles; i++) {
    steps.push({ kind: "work", label: config.workTitles[i]?.trim() || "Work", minutes: config.workMinutes });
    const last = i === cycles - 1;
    if (last && !forever) break;
    const long = (i + 1) % every === 0;
    steps.push({ kind: long ? "long" : "short", label: long ? "Long break" : "Break", minutes: long ? config.longBreakMinutes : config.shortBreakMinutes });
  }
  const total = steps.reduce((sum, s) => sum + s.minutes, 0);

  return (
    <div className="flex flex-col gap-5">
      <OptionGroup title="Timing">
        <div className="grid grid-cols-3 gap-2">
          <MinutesCard label="Work" value={config.workMinutes} min={1} max={180} onChange={(workMinutes) => update({ workMinutes })} />
          <MinutesCard label="Break" value={config.shortBreakMinutes} min={1} max={60} onChange={(shortBreakMinutes) => update({ shortBreakMinutes })} />
          <MinutesCard label="Long break" value={config.longBreakMinutes} min={1} max={60} onChange={(longBreakMinutes) => update({ longBreakMinutes })} />
        </div>
      </OptionGroup>

      <OptionGroup title="Cycles">
        <Segmented
          label="Length"
          value={forever ? "forever" : "set"}
          onChange={(v) => update({ totalCycles: v === "forever" ? null : Math.max(every, 4) })}
          options={[
            { value: "set", label: "Set number" },
            { value: "forever", label: "Keep going" },
          ]}
        />
        {!forever && (
          <CountRow label="Work cycles" value={config.totalCycles ?? 1} min={1} max={MAX_CYCLES} suffix={config.totalCycles === 1 ? "cycle" : "cycles"} onChange={(totalCycles) => update({ totalCycles })} />
        )}
        <CountRow label="Long break every" value={every} min={1} max={12} suffix={every === 1 ? "cycle" : "cycles"} onChange={(cyclesBeforeLongBreak) => update({ cyclesBeforeLongBreak })} />
      </OptionGroup>

      <OptionGroup title={forever ? `Cycle names (repeat every ${every})` : "Cycle names"} aside={<span className="text-xs text-muted">Optional</span>}>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: slots }, (_, i) => (
            <label key={i} className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted">{i + 1}</span>
              <input
                type="text"
                value={config.workTitles[i] ?? ""}
                onChange={(e) => setName(i, e.target.value)}
                placeholder="Work"
                aria-label={`Name for work cycle ${i + 1}`}
                className="h-9 min-w-0 flex-1 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
              />
            </label>
          ))}
        </div>
      </OptionGroup>

      <OptionGroup title="Preview" aside={<span className="text-xs font-medium tabular-nums">{forever ? `${formatTotal(total)} per round` : formatTotal(total)}</span>}>
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={i}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                s.kind === "work" ? "border-accent/40 text-accent" : s.kind === "long" ? "border-foreground/25 text-foreground" : "border-foreground/10 text-muted"
              }`}
            >
              {s.label} <span className="font-normal opacity-80">{s.minutes}m</span>
            </span>
          ))}
          {forever && <span className="text-xs font-medium text-muted">↻ then repeats</span>}
        </div>
      </OptionGroup>
    </div>
  );
}
