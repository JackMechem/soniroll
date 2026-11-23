"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, StarIcon } from "@/components/tools";
import {
  type PracticeLogData,
  HOUR_MILESTONES,
  STREAK_MILESTONES,
  dayProgress,
  lifetimeMinutes,
  minutesOn,
  progressOf,
  streak,
  todayKey, goalOn
} from "@/lib/practiceLog";
import { playNote } from "@/lib/tones";

/**
 * The Shed Log's rewards: a little burst and a rising note for every task checked off (the
 * note climbs with each one you do that day), and confetti + a fanfare + a toast for the big
 * moments — a routine finished, the daily goal reached, everything done, a streak kept alive or a
 * streak / hours milestone. `useCelebrations` watches the log for those moments (so the timer
 * checking a task off counts too); `burstAt` is the click-point sparkle.
 */

type ToastKind = "routine" | "goal" | "day" | "streak" | "hours";
type Toast = { id: number; kind: ToastKind; title: string; detail?: string; color?: string; share?: "streak" | "hours" | "day"; celebrate?: boolean };

/** Asks the Shed Log to open "Share your progress" on a card (`detail` = the card kind). */
export const SHARE_PROGRESS_EVENT = "practice-log-share-progress";
type Burst = { id: number; x: number; y: number; color: string };
type State = { toasts: Toast[]; bursts: Burst[]; rain: number | null };

let state: State = { toasts: [], bursts: [], rain: null };
const SERVER: State = state;
const listeners = new Set<() => void>();
let nextId = 1;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

// Settings → "Confetti and sparkles" (set by `SiteSettingsEffects`).
let effectsOn = true;
export function setCelebrationEffects(on: boolean) {
  effectsOn = on;
}

/** A sparkle of particles from an element (the checkbox just ticked). */
export function burstAt(el: Element, color: string) {
  if (!effectsOn) return;
  const r = el.getBoundingClientRect();
  const id = nextId++;
  set({ bursts: [...state.bursts, { id, x: r.left + r.width / 2, y: r.top + r.height / 2, color }] });
  setTimeout(() => set({ bursts: state.bursts.filter((b) => b.id !== id) }), 800);
}

function toast(t: Omit<Toast, "id">) {
  const id = nextId++;
  set({ toasts: [...state.toasts.slice(-2), { ...t, id }] });
  // A toast with a Share button stays a little longer, to give you time to press it.
  setTimeout(() => set({ toasts: state.toasts.filter((x) => x.id !== id) }), t.share ? 8000 : 4200);
}

/* Each big moment is celebrated once a day: unticking a task and ticking it again (or a reload in
   between) doesn't set the confetti and toasts off again. Remembered on this device. */
const CELEBRATED_KEY = "jam-practice-celebrated";
let celebrated: { date: string; keys: string[] } | null = null;

/** True the first time `key` happens on `date` (and remembers it); false after that. */
function firstTime(date: string, key: string): boolean {
  if (!celebrated) {
    try {
      const raw = window.localStorage.getItem(CELEBRATED_KEY);
      const saved = raw ? (JSON.parse(raw) as { date?: unknown; keys?: unknown }) : null;
      if (saved && typeof saved.date === "string" && Array.isArray(saved.keys)) celebrated = { date: saved.date, keys: saved.keys.filter((k): k is string => typeof k === "string") };
    } catch {
      // storage unavailable: remember for this visit only
    }
  }
  if (!celebrated || celebrated.date !== date) celebrated = { date, keys: [] };
  if (celebrated.keys.includes(key)) return false;
  celebrated = { date, keys: [...celebrated.keys, key] };
  try {
    window.localStorage.setItem(CELEBRATED_KEY, JSON.stringify(celebrated));
  } catch {
    // storage unavailable
  }
  return true;
}

function dismiss(id: number) {
  set({ toasts: state.toasts.filter((x) => x.id !== id) });
}

function rain() {
  if (!effectsOn) return;
  const id = nextId++;
  set({ rain: id });
  setTimeout(() => state.rain === id && set({ rain: null }), 4200);
}

// A pentatonic ladder: each task done today plays the next step up.
const LADDER = ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6", "G6", "A6", "C7"];

/** The check-off note for the nth task done (exported for the landing page's demo). */
export function playTaskNote(n: number) {
  taskNote(n);
}

/** A big moment outside the log itself (the landing page's demo): toast, confetti, fanfare. */
export function celebrateNow(title: string, detail: string, sound = true) {
  toast({ kind: "routine", title, detail });
  rain();
  if (sound) fanfare(true);
}

/** A small win outside the log (a tool's time just logged): a toast and a two-note chime. */
export function toastNow(title: string, detail: string) {
  toast({ kind: "day", title, detail });
  taskNote(5);
  setTimeout(() => taskNote(6), 110);
}

function taskNote(n: number) {
  playNote(LADDER[Math.min(LADDER.length - 1, Math.max(0, n - 1))], 0.35, "pluck");
}

function fanfare(big = false) {
  const notes = big ? ["C5", "E5", "G5", "C6", "E6", "G6"] : ["G5", "C6", "E6"];
  notes.forEach((n, i) => setTimeout(() => playNote(n, i === notes.length - 1 ? 1.2 : 0.3, "pluck"), 90 * i + 120));
}

type Snapshot = {
  today: string;
  doneTotal: number;
  todayDone: number;
  todayTotal: number;
  todayMinutes: number;
  complete: Set<string>;
  hours: number;
};

function snapshotOf(data: PracticeLogData, today: string): Snapshot {
  let doneTotal = 0;
  const complete = new Set<string>();
  for (const [key, day] of Object.entries(data.days)) {
    for (const [rid, occ] of Object.entries(day.routines ?? {})) {
      doneTotal += occ.done?.length ?? 0;
      const routine = data.routines.find((r) => r.id === rid);
      if (routine) {
        const p = progressOf(routine, occ);
        if (p.total > 0 && p.done === p.total) complete.add(`${key}:${rid}`);
      }
    }
    for (const t of day.tasks ?? []) if (t.done) doneTotal++;
  }
  const p = dayProgress(data, today);
  return { today, doneTotal, todayDone: p.done, todayTotal: p.total, todayMinutes: minutesOn(data, today), complete, hours: lifetimeMinutes(data) / 60 };
}

/** Watches the log and celebrates what just happened (never on first load). */
export function useCelebrations(data: PracticeLogData, ready: boolean) {
  const prev = useRef<Snapshot | null>(null);
  useEffect(() => {
    if (!ready) return;
    const now = snapshotOf(data, todayKey());
    const was = prev.current;
    prev.current = now;
    if (!was || was.today !== now.today) return;
    const sounds = data.prefs.sounds;
    let big = false;

    if (now.doneTotal > was.doneTotal && sounds) taskNote(Math.max(1, now.todayDone));

    // Held back until the "everything done today" check below: when the last routine also
    // finishes the day, that one toast says both (two stacked toasts covered the page).
    const routineToasts: Omit<Toast, "id">[] = [];
    for (const key of now.complete) {
      if (was.complete.has(key)) continue;
      const [, rid] = key.split(":");
      const routine = data.routines.find((r) => r.id === rid);
      if (!routine || !firstTime(now.today, `routine:${key}`)) continue;
      routineToasts.push({ kind: "routine", title: `${routine.name || "Routine"} complete!`, detail: `All ${routine.tasks.length} task${routine.tasks.length === 1 ? "" : "s"} done.` });
      big = true;
    }
    let dayDone = false;

    const goal = goalOn(data, now.today);
    const goalMet = goal <= 0 || now.todayMinutes >= goal;
    if (goal > 0 && was.todayMinutes < goal && now.todayMinutes >= goal && firstTime(now.today, "goal")) {
      toast({ kind: "goal", title: "Daily goal reached!", detail: `${goal} minutes today. Anything more is a bonus.`, share: "day" });
      big = true;
    }

    // Every task ticked off: a toast with Share (today's report), never a dialog that opens by
    // itself. "A full day" only once the daily goal is met too.
    if (now.todayTotal > 0 && now.todayDone === now.todayTotal && was.todayDone < was.todayTotal && firstTime(now.today, "day")) {
      const tasks = `${now.todayTotal} of ${now.todayTotal} task${now.todayTotal === 1 ? "" : "s"}`;
      dayDone = true;
      toast(
        goalMet
          ? { kind: "day", title: "Everything done today", detail: `${tasks}. That's a full day.`, share: "day", celebrate: true }
          : { kind: "day", title: "All tasks done", detail: `${tasks} ticked off. Nice work.`, share: "day", celebrate: true },
      );
      big = true;
    }
    if (!dayDone) routineToasts.forEach((t) => toast(t));

    if (was.todayMinutes === 0 && now.todayMinutes > 0 && firstTime(now.today, "streak")) {
      const s = streak(data, now.today);
      if (STREAK_MILESTONES.includes(s)) {
        toast({ kind: "streak", title: `${s}-day streak!`, detail: "You've practiced every day. Keep the chain going.", share: "streak" });
        big = true;
      } else if (s >= 2) {
        toast({ kind: "streak", title: `Streak: ${s} days`, detail: "Today counts — the streak lives on." });
      } else {
        toast({ kind: "streak", title: "Day 1", detail: "Every streak starts with one day." });
      }
    }

    const hit = HOUR_MILESTONES.find((h) => was.hours < h && now.hours >= h);
    if (hit && firstTime(now.today, `hours:${hit}`)) {
      toast({ kind: "hours", title: `${hit} hour${hit === 1 ? "" : "s"} of practice!`, detail: "All logged here, one session at a time.", share: "hours" });
      big = true;
    }

    if (big) {
      rain();
      if (sounds) fanfare(true);
    }
  }, [data, ready]);
}

const CONFETTI_COLORS = ["var(--accent)", "#f59e0b", "#22c55e", "#ec4899", "#38bdf8", "#a78bfa"];
const CONFETTI = Array.from({ length: 60 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    left: `${r(1) * 100}%`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    width: 6 + r(2) * 6,
    height: 8 + r(3) * 10,
    delay: `${r(4) * 0.5}s`,
    fall: `${2 + r(5) * 1.6}s`,
    drift: `${(r(6) - 0.5) * 30}vw`,
    spin: `${(r(7) - 0.5) * 1440}deg`,
    round: r(8) > 0.7,
  };
});
const BURST = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  const d = 26 + (i % 3) * 8;
  return { dx: `${Math.cos(a) * d}px`, dy: `${Math.sin(a) * d}px`, size: i % 2 ? 5 : 7 };
});

const TOAST_COLOR: Record<ToastKind, string> = {
  routine: "var(--success)",
  goal: "var(--accent)",
  day: "var(--success)",
  streak: "#f97316",
  hours: "#a78bfa",
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const noop = () => () => {};

/** `hideToasts`: while "Share your progress" is open, so a toast never covers it. */
export default function Celebrations({ hideToasts = false }: { hideToasts?: boolean }) {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[95] overflow-hidden">
        {s.bursts.map((b) =>
          BURST.map((p, i) => (
            <span
              key={`${b.id}-${i}`}
              className="log-burst absolute block rounded-full"
              style={{ left: b.x, top: b.y, width: p.size, height: p.size, background: b.color, "--dx": p.dx, "--dy": p.dy } as React.CSSProperties}
            />
          )),
        )}
        {s.rain !== null &&
          CONFETTI.map((c, i) => (
            <span
              key={`${s.rain}-${i}`}
              className="confetti-piece absolute top-0 block"
              style={
                {
                  left: c.left,
                  width: c.width,
                  height: c.height,
                  background: c.color,
                  borderRadius: c.round ? "9999px" : "2px",
                  "--delay": c.delay,
                  "--fall": c.fall,
                  "--drift": c.drift,
                  "--spin": c.spin,
                  opacity: 0,
                } as React.CSSProperties
              }
            />
          ))}
      </div>
      {/* At the bottom, so they don't cover the top bar and the page's own header (the Shed Log's
          goal line and buttons); on desktop in the bottom-right corner (the background tool dock
          is bottom-left). A tap on one puts it away. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[96] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:w-96 lg:px-0" aria-live="polite">
        {!hideToasts && s.toasts.map((t) => (
          <div
            key={t.id}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("button")) dismiss(t.id);
            }}
            className="log-toast pointer-events-auto flex w-full max-w-sm cursor-default items-center gap-3 rounded-2xl bg-surface p-3 pr-4 shadow-2xl ring-1 ring-surface-hover"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: TOAST_COLOR[t.kind] }}>
              {t.kind === "streak" ? <FlameIcon className="h-5 w-5" /> : t.kind === "routine" || t.kind === "day" ? <CheckIcon className="h-5 w-5" /> : <StarIcon className="h-5 w-5" filled />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold">{t.title}</div>
              {t.detail && <div className="text-sm text-muted">{t.detail}</div>}
            </div>
            {t.share && (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  window.dispatchEvent(new CustomEvent(SHARE_PROGRESS_EVENT, { detail: t.share === "day" ? { kind: "day", date: todayKey(), celebrate: t.celebrate } : t.share }));
                }}
                className="h-8 shrink-0 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
              >
                Share
              </button>
            )}
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}

/** A flame — the streak. */
export function FlameIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-4 w-4"}>
      <path d="M12 2c.6 3.2-1.2 5.1-2.7 6.8C7.8 10.5 6.5 12 6.5 14.6 6.5 18.2 9 21 12 21s5.5-2.8 5.5-6.2c0-2.3-1-3.9-2.2-5.2.1 1.6-.5 2.9-1.7 3.4.4-3.6-.6-7.4-1.6-10zM12 19c-1.5 0-2.6-1.2-2.6-2.8 0-1.5 1-2.4 1.8-3.4.2 1 .8 1.6 1.6 1.9.1-.9.5-1.6 1-2.2.6.9 1 1.8 1 2.8C14.8 17.6 13.6 19 12 19z" />
    </svg>
  );
}
