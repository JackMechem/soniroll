import {
  HOUR_MILESTONES,
  STREAK_MILESTONES,
  dayProgress,
  goalOn,
  lifetimeMinutes,
  minutesOn,
  progressOf,
  streak,
  todayKey,
  type PracticeLogData,
} from '@jam-practice/core/practiceLog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { getAudioContext } from '@/lib/audioContext';

/**
 * The Shed Log's rewards on the phone — the website's `components/practicelog/Celebrations.tsx`
 * logic: a rising note for every task checked off (it climbs with each one you do that day), and
 * a toast + confetti + a fanfare for the big moments (a routine finished, the daily goal reached,
 * everything done, a streak kept alive or a streak / hours milestone). `useCelebrations` watches the
 * log (so the timer checking a task off counts too), never on first load; each big moment is
 * celebrated once a day per device (`jam-practice-celebrated`). The overlay that shows them is
 * `components/shedLog/Celebrations.tsx` (confetti is left out under reduced motion).
 */

export type ToastKind = 'routine' | 'goal' | 'day' | 'streak' | 'hours';
/** `share`: the toast has a Share button that opens that progress card (`celebrate`: the sheet
    opens as "Day complete!"). */
export type Toast = { id: number; kind: ToastKind; title: string; detail?: string; share?: 'streak' | 'hours' | 'day'; celebrate?: boolean };
type State = { toasts: Toast[]; rain: number | null };

let state: State = { toasts: [], rain: null };
const listeners = new Set<() => void>();
let nextId = 1;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** What's showing: the toasts and whether confetti is falling (its id). */
export function useCelebrationState(): State {
  return useSyncExternalStore(subscribe, () => state);
}

/** Toasts waiting their turn: one shows at a time (several at once stacked up over the screen). */
let waiting: Toast[] = [];

function show(t: Toast) {
  set({ toasts: [t] });
  // One you can share stays long enough to reach its button.
  setTimeout(() => dismissToast(t.id), t.share ? 6000 : 3500);
}

export function dismissToast(id: number) {
  if (!state.toasts.some((x) => x.id === id)) {
    waiting = waiting.filter((x) => x.id !== id);
    return;
  }
  const next = waiting.shift();
  if (next) show(next);
  else set({ toasts: [] });
}

function toast(t: Omit<Toast, 'id'>) {
  const item = { ...t, id: nextId++ };
  if (state.toasts.length) waiting = [...waiting, item].slice(-2);
  else show(item);
}

function rain() {
  const id = nextId++;
  set({ rain: id });
  setTimeout(() => state.rain === id && set({ rain: null }), 4200);
}

/** A small win outside the log (a tool's time just logged): a toast and a two-note chime. */
export function toastNow(title: string, detail: string, sound = true) {
  toast({ kind: 'day', title, detail });
  if (sound) {
    taskNote(5);
    setTimeout(() => taskNote(6), 110);
  }
}

// ---------------------------------------------------------------- once a day

const CELEBRATED_KEY = 'jam-practice-celebrated';
let celebrated: { date: string; keys: string[] } | null = null;
AsyncStorage.getItem(CELEBRATED_KEY)
  .then((raw) => {
    const saved = raw ? (JSON.parse(raw) as { date?: unknown; keys?: unknown }) : null;
    if (!celebrated && saved && typeof saved.date === 'string' && Array.isArray(saved.keys)) {
      celebrated = { date: saved.date, keys: saved.keys.filter((k): k is string => typeof k === 'string') };
    }
  })
  .catch(() => {});

/** True the first time `key` happens on `date` (and remembers it); false after that. */
function firstTime(date: string, key: string): boolean {
  if (!celebrated || celebrated.date !== date) celebrated = { date, keys: [] };
  if (celebrated.keys.includes(key)) return false;
  celebrated = { date, keys: [...celebrated.keys, key] };
  void AsyncStorage.setItem(CELEBRATED_KEY, JSON.stringify(celebrated)).catch(() => {});
  return true;
}

// ---------------------------------------------------------------- sounds

// A pentatonic ladder: each task done today plays the next step up (C5 D5 E5 G5 A5 C6 …).
const LADDER = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];

/** A short plucked note, made on the spot (no samples to fetch). */
function pluck(freq: number, seconds: number, at = 0) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  } catch {
    // no audio right now — the celebration is silent
  }
}

function taskNote(n: number) {
  pluck(LADDER[Math.min(LADDER.length - 1, Math.max(0, n - 1))], 0.35);
}

function fanfare() {
  [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((f, i, all) => pluck(f, i === all.length - 1 ? 1.2 : 0.3, 0.12 + 0.09 * i));
}

// ---------------------------------------------------------------- watching the log

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

/** Watches the log and celebrates what just happened (never on first load). `effects`: confetti
    on (the website's "Confetti and sparkles" setting). */
export function useCelebrations(data: PracticeLogData, ready: boolean, effects: boolean) {
  const prev = useRef<Snapshot | null>(null);
  useEffect(() => {
    if (!ready) {
      prev.current = null;
      return;
    }
    const now = snapshotOf(data, todayKey());
    const was = prev.current;
    prev.current = now;
    if (!was || was.today !== now.today) return;
    const sounds = data.prefs.sounds;
    let big = false;

    if (now.doneTotal > was.doneTotal && sounds) taskNote(Math.max(1, now.todayDone));

    for (const key of now.complete) {
      if (was.complete.has(key)) continue;
      const [, rid] = key.split(':');
      const routine = data.routines.find((r) => r.id === rid);
      if (!routine || !firstTime(now.today, `routine:${key}`)) continue;
      toast({ kind: 'routine', title: `${routine.name || 'Routine'} complete!`, detail: `All ${routine.tasks.length} task${routine.tasks.length === 1 ? '' : 's'} done.` });
      big = true;
    }

    const goal = goalOn(data, now.today);
    const goalMet = goal <= 0 || now.todayMinutes >= goal;
    if (goal > 0 && was.todayMinutes < goal && now.todayMinutes >= goal && firstTime(now.today, 'goal')) {
      toast({ kind: 'goal', title: 'Daily goal reached!', detail: `${goal} minutes today. Anything more is a bonus.`, share: 'day' });
      big = true;
    }

    if (now.todayTotal > 0 && now.todayDone === now.todayTotal && was.todayDone < was.todayTotal && firstTime(now.today, 'day')) {
      const tasks = `${now.todayTotal} of ${now.todayTotal} task${now.todayTotal === 1 ? '' : 's'}`;
      toast(
        goalMet
          ? { kind: 'day', title: 'Everything done today', detail: `${tasks}. That's a full day.`, share: 'day', celebrate: true }
          : { kind: 'day', title: 'All tasks done', detail: `${tasks} ticked off. Nice work.`, share: 'day', celebrate: true },
      );
      big = true;
    }

    if (was.todayMinutes === 0 && now.todayMinutes > 0 && firstTime(now.today, 'streak')) {
      const s = streak(data, now.today);
      if (STREAK_MILESTONES.includes(s)) {
        toast({ kind: 'streak', title: `${s}-day streak!`, detail: "You've practiced every day. Keep the chain going.", share: 'streak' });
        big = true;
      } else if (s >= 2) {
        toast({ kind: 'streak', title: `Streak: ${s} days`, detail: 'Today counts — the streak lives on.' });
      } else {
        toast({ kind: 'streak', title: 'Day 1', detail: 'Every streak starts with one day.' });
      }
    }

    const hit = HOUR_MILESTONES.find((h) => was.hours < h && now.hours >= h);
    if (hit && firstTime(now.today, `hours:${hit}`)) {
      toast({ kind: 'hours', title: `${hit} hour${hit === 1 ? '' : 's'} of practice!`, detail: 'Every session adds up. Keep going.', share: 'hours' });
      big = true;
    }

    if (big) {
      if (effects) rain();
      if (sounds) fanfare();
    }
  }, [data, ready, effects]);
}
