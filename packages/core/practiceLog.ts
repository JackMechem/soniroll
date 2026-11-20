/**
 * The Shed Log's data and calendar math — pure, shared by the web app (and the mobile app
 * later). One synced object holds everything: your routines and a log entry per day.
 *
 * - A **routine** is a named list of tasks (each with minutes and, optionally, its own time of
 *   day), an optional start time, a repeat rule, and attachments (tunes, setlists, charts, tools).
 * - A **day** (keyed `YYYY-MM-DD`, local time) holds what happened: per routine scheduled that
 *   day, the tasks checked off, time spent on each and notes; routines added to just that day;
 *   time from the Practice Timer that wasn't a routine; extra minutes logged by hand; the day's
 *   own notes and attachments. Recordings live in Convex (`recordings.logDate`/`routineId`).
 *
 * Dates are always the plain `YYYY-MM-DD` string of a local calendar day — never a `Date` with a
 * time zone attached — so a routine on "Tuesday" is Tuesday wherever you open it.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type Attachment =
  | { kind: "tune"; id: string; list: "tunes" | "learn" | "library"; label: string }
  | { kind: "setlist"; id: string; label: string }
  | { kind: "chart"; id: string; label: string }
  | { kind: "tool"; href: string; label: string };

export type RoutineTask = {
  id: string;
  title: string;
  /** Decimal minutes, like the Practice Timer's segments. */
  minutes: number;
  /** "HH:MM" — a fixed time of day for this task. Without one, a task follows the one before it
      (from the routine's start time, when there is one). */
  time: string | null;
  notes: string;
  attachments: Attachment[];
  /** A checklist inside the task (no time of their own). */
  subtasks?: Subtask[];
};

/** A checklist item inside a task. `done` is only used on a day's own tasks; a routine's
    subtasks are ticked per day in `Occurrence.subDone`. */
export type Subtask = { id: string; title: string; done?: boolean };

export type RepeatFreq = "once" | "daily" | "weekly" | "monthly";

export type Repeat = {
  freq: RepeatFreq;
  /** Every N days / weeks / months. */
  interval: number;
  /** For weekly: which days. Empty = the start date's weekday. */
  weekdays: Weekday[];
  /** The first day (and, for "once", the only day). */
  start: string;
  /** The last day it can fall on, or null for no end. */
  end: string | null;
};

export type Routine = {
  id: string;
  name: string;
  description: string;
  /** Index into `ROUTINE_COLORS`. */
  color: number;
  /** The routine's icon (an id from the web app's `ROUTINE_ICONS`), shown wherever it appears.
      Missing on routines made before icons — those show the default. */
  icon?: string;
  /** "HH:MM", or null for "any time". */
  startTime: string | null;
  repeat: Repeat;
  tasks: RoutineTask[];
  attachments: Attachment[];
  createdAt: number;
  updatedAt: number;
  /** Set on a routine a teacher assigned (Lessons): who, which lesson item, and the version of it
      this copy was made from. The app keeps it in step with the teacher's version. */
  assigned?: { teacher: string; itemId: string; version: number };
};

/** What happened with one routine on one day. */
export type Occurrence = {
  /** Ids of the tasks checked off. */
  done?: string[];
  /** Time spent per task, in ms (from the timer). */
  spentMs?: Record<string, number>;
  notes?: string;
  /** Skipped for this day (stays on the calendar, struck through). */
  skipped?: boolean;
  /** A start time just for this day ("HH:MM"), instead of the routine's. */
  startTime?: string | null;
  /** Ids of the subtasks ticked off this day. */
  subDone?: string[];
  /** Tasks added to the routine for just this day (after its own). */
  extraTasks?: RoutineTask[];
  /** Time logged by checking a task off (its planned minutes), per task — taken back off
      `spentMs` if it's unchecked. */
  autoMs?: Record<string, number>;
};

/** A one-off task on a day, not part of any routine. */
export type DayTask = {
  id: string;
  title: string;
  minutes: number;
  /** "HH:MM", or null for any time. */
  time: string | null;
  done: boolean;
  notes?: string;
  spentMs?: number;
  attachments?: Attachment[];
  subtasks?: Subtask[];
  /** Time logged by checking it off (its planned minutes) — taken back off if unchecked. */
  autoMs?: number;
};

/** The pending-entry `segmentId` for time from the day timer (`link.date` = the day). */
export const DAY_STOPWATCH_ID = "day-stopwatch";

/** The timer `link.routineId` used when running a day's own tasks. */
export const DAY_TASKS_ID = "day";

/** Practice Timer time that wasn't part of a routine. */
export type TimerEntry = {
  session: string;
  title: string;
  ms: number;
  at: number;
  /** Set for time spent in a tool (its href) rather than on the Practice Timer. */
  tool?: string;
};

export type DayLog = {
  notes?: string;
  attachments?: Attachment[];
  /** Routines added to just this day (not on their own schedule). */
  added?: string[];
  routines?: Record<string, Occurrence>;
  /** One-off tasks for just this day. */
  tasks?: DayTask[];
  sessions?: TimerEntry[];
  /** Practice logged by hand, in minutes. */
  extraMinutes?: number;
  /** The day timer — a stopwatch for the whole day's practice, in ms. */
  stopwatchMs?: number;
};

export type PracticeLogPrefs = {
  /** Minutes a day to aim for. */
  dailyGoal: number;
  /** A goal per weekday (Sunday first; 0 = a rest day), used instead of `dailyGoal` when set. */
  goalByWeekday?: number[] | null;
  /** The little sounds when you check things off. */
  sounds: boolean;
  /** Count the time you spend using tools (Metronome, ear trainers, …) as practice. */
  trackTools: boolean;
};

export const DEFAULT_PREFS: PracticeLogPrefs = { dailyGoal: 30, sounds: true, trackTools: true };

/** The goal (minutes) for one day: that weekday's when goals are set per weekday, else the daily
    goal. 0 means no goal (a rest day). */
export function goalOn(data: PracticeLogData, key: string): number {
  const by = data.prefs?.goalByWeekday;
  if (Array.isArray(by) && by.length === 7) return Math.max(0, by[weekdayOf(key)] ?? 0);
  return data.prefs?.dailyGoal ?? 30;
}

export type PracticeLogData = {
  routines: Routine[];
  days: Record<string, DayLog>;
  prefs: PracticeLogPrefs;
};

/** Colors a routine can be, as CSS — each reads on both light and dark themes. */
export const ROUTINE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#8b5cf6", "#84cc16"];

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---------------------------------------------------------------- dates

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** The local calendar day of a Date, as YYYY-MM-DD. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** A YYYY-MM-DD as a local Date at noon (noon so DST shifts never move it to another day). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function isDateKey(key: unknown): key is string {
  return typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

export function addDays(key: string, n: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function addMonths(key: string, n: number): string {
  const d = fromDateKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toDateKey(d);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function weekdayOf(key: string): Weekday {
  return fromDateKey(key).getDay() as Weekday;
}

/** The first day of the week containing `key` (weeks start on `weekStart`). */
export function startOfWeek(key: string, weekStart: Weekday = 0): string {
  const back = (weekdayOf(key) - weekStart + 7) % 7;
  return addDays(key, -back);
}

/** The 6×7 (or 5×7) grid of days a month view shows, starting on `weekStart`. */
export function monthGrid(year: number, month: number, weekStart: Weekday = 0): string[] {
  const first = toDateKey(new Date(year, month, 1, 12));
  const start = startOfWeek(first, weekStart);
  const last = toDateKey(new Date(year, month, daysInMonth(year, month), 12));
  const weeks = Math.ceil((daysBetween(start, last) + 1) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

/** "Tuesday, October 17". */
export function formatLongDate(key: string): string {
  const d = fromDateKey(key);
  return `${WEEKDAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

/** "Oct 17". */
export function formatShortDate(key: string): string {
  const d = fromDateKey(key);
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

// ---------------------------------------------------------------- times of day

/** "07:30" → 450 (minutes after midnight), or null. */
export function parseTime(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** 450 → "07:30" (wraps past midnight). */
export function timeString(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** 450 → "7:30 AM". */
let clock24 = false;
/** Show times on a 24-hour clock ("15:00") instead of "3:00 PM" (the website's Settings). */
export function setClock24(on: boolean) {
  clock24 = on;
}

export function formatTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  if (clock24) return `${pad(h)}:${pad(m % 60)}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m % 60)} ${h < 12 ? "AM" : "PM"}`;
}

/** 95 → "1 h 35 min", 30 → "30 min", 2.5 → "2:30" (a fraction only shows under 10 minutes). */
export function formatMinutesShort(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (Math.abs(minutes - Math.round(minutes)) > 0.001 && minutes < 10) {
    const s = Math.round(minutes * 60);
    return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  }
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---------------------------------------------------------------- repeating

/** Does the routine fall on this day by its own schedule? */
export function occursOn(repeat: Repeat, key: string): boolean {
  if (!isDateKey(repeat.start) || key < repeat.start) return false;
  if (repeat.end && key > repeat.end) return false;
  const every = Math.max(1, Math.round(repeat.interval) || 1);
  switch (repeat.freq) {
    case "once":
      return key === repeat.start;
    case "daily":
      return daysBetween(repeat.start, key) % every === 0;
    case "weekly": {
      const days = repeat.weekdays.length ? repeat.weekdays : [weekdayOf(repeat.start)];
      if (!days.includes(weekdayOf(key))) return false;
      const weeks = Math.floor(daysBetween(startOfWeek(repeat.start), startOfWeek(key)) / 7);
      return weeks % every === 0;
    }
    case "monthly": {
      const s = fromDateKey(repeat.start);
      const d = fromDateKey(key);
      const months = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
      if (months % every !== 0) return false;
      // The start's day of the month, or the month's last day when it's shorter.
      const want = Math.min(s.getDate(), daysInMonth(d.getFullYear(), d.getMonth()));
      return d.getDate() === want;
    }
  }
}

/** "Every Monday, Wednesday and Friday", "Every 2 days", "Once, on Oct 17". */
export function describeRepeat(repeat: Repeat): string {
  const every = Math.max(1, Math.round(repeat.interval) || 1);
  let text: string;
  switch (repeat.freq) {
    case "once":
      return `Once, on ${formatShortDate(repeat.start)}`;
    case "daily":
      text = every === 1 ? "Every day" : `Every ${every} days`;
      break;
    case "weekly": {
      const days = (repeat.weekdays.length ? repeat.weekdays : [weekdayOf(repeat.start)]).slice().sort();
      const names =
        days.length === 7
          ? "every day"
          : days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d as Weekday))
            ? "weekdays"
            : listJoin(days.map((d) => WEEKDAY_NAMES[d]));
      text =
        every === 1
          ? names === "every day"
            ? "Every day"
            : names === "weekdays"
              ? "Every weekday"
              : `Every ${names}`
          : `Every ${every} weeks on ${names}`;
      break;
    }
    case "monthly": {
      const day = fromDateKey(repeat.start).getDate();
      text = every === 1 ? `Monthly on the ${ordinal(day)}` : `Every ${every} months on the ${ordinal(day)}`;
      break;
    }
  }
  return repeat.end ? `${text}, until ${formatShortDate(repeat.end)}` : text;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/** The next `count` days (from `from`, inclusive) the routine falls on, looking up to a year ahead. */
export function nextOccurrences(repeat: Repeat, from: string, count: number): string[] {
  const out: string[] = [];
  let key = from < repeat.start ? repeat.start : from;
  for (let i = 0; i < 400 && out.length < count; i++, key = addDays(key, 1)) {
    if (repeat.end && key > repeat.end) break;
    if (occursOn(repeat, key)) out.push(key);
  }
  return out;
}

// ---------------------------------------------------------------- a day

/** A routine's tasks on one day: its own, then any added for just that day. */
export function tasksOf(routine: Routine, occ: Occurrence = {}): RoutineTask[] {
  return occ.extraTasks?.length ? [...routine.tasks, ...occ.extraTasks] : routine.tasks;
}

/** A routine on one day: scheduled by its repeat rule, or added just for the day. */
export type DayRoutine = { routine: Routine; occurrence: Occurrence; added: boolean };

/** The routines on a day, in start-time order (untimed ones last, by name). */
export function routinesOn(data: PracticeLogData, key: string): DayRoutine[] {
  const day = data.days[key];
  const added = new Set(day?.added ?? []);
  const out: DayRoutine[] = [];
  for (const routine of data.routines) {
    const scheduled = occursOn(routine.repeat, key);
    if (!scheduled && !added.has(routine.id)) continue;
    out.push({ routine, occurrence: day?.routines?.[routine.id] ?? {}, added: !scheduled });
  }
  return out.sort((a, b) => {
    const ta = startOf(a.routine, a.occurrence);
    const tb = startOf(b.routine, b.occurrence);
    if (ta !== null && tb !== null && ta !== tb) return ta - tb;
    if (ta !== null && tb === null) return -1;
    if (ta === null && tb !== null) return 1;
    return a.routine.name.localeCompare(b.routine.name);
  });
}

function startOf(routine: Routine, occ: Occurrence): number | null {
  const own = occ.startTime !== undefined ? parseTime(occ.startTime) : parseTime(routine.startTime);
  return own ?? parseTime(tasksOf(routine, occ).find((t) => t.time)?.time);
}

/** Where each task sits in the day: its own time, or straight after the task before it (from the
    routine's start time). `start` is null for a task with no time to go by. */
export type ScheduledTask = { task: RoutineTask; start: number | null; end: number | null };

export function scheduleTasks(routine: Routine, occ: Occurrence = {}): ScheduledTask[] {
  let cursor: number | null = occ.startTime !== undefined ? parseTime(occ.startTime) : parseTime(routine.startTime);
  return tasksOf(routine, occ).map((task) => {
    const own = parseTime(task.time);
    const start = own ?? cursor;
    const end = start === null ? null : start + task.minutes;
    cursor = end;
    return { task, start, end };
  });
}

/** When the routine starts and ends that day (from its scheduled tasks), or null when untimed. */
export function routineSpan(routine: Routine, occ: Occurrence = {}): { start: number; end: number } | null {
  const timed = scheduleTasks(routine, occ).filter((s) => s.start !== null);
  if (!timed.length) {
    const start = occ.startTime !== undefined ? parseTime(occ.startTime) : parseTime(routine.startTime);
    return start === null ? null : { start, end: start + totalMinutes(routine) };
  }
  return { start: Math.min(...timed.map((s) => s.start!)), end: Math.max(...timed.map((s) => s.end!)) };
}

/** Whether a routine's time that day covers `nowMin` (minutes into the day). Skipped ones don't. */
export function isRoutineNow(item: DayRoutine, nowMin: number): boolean {
  if (item.occurrence.skipped) return false;
  const span = routineSpan(item.routine, item.occurrence);
  return !!span && span.start <= nowMin && nowMin < span.end;
}

export function totalMinutes(routine: Routine): number {
  return routine.tasks.reduce((sum, t) => sum + t.minutes, 0);
}

/** Tasks checked off, of the tasks that still exist. */
export function progressOf(routine: Routine, occ: Occurrence): { done: number; total: number } {
  const done = new Set(occ.done ?? []);
  const tasks = tasksOf(routine, occ);
  return { done: tasks.filter((t) => done.has(t.id)).length, total: tasks.length };
}

/** Minutes practiced on a day — time that was actually logged: the day timer, or (whichever is
    more, since they run side by side) the time on tasks — from the timer or logged by hand on a
    task —, Practice Timer sessions and time in tools; plus minutes logged by hand for the day.
    Checking a task off without logging time doesn't add any. `liveStopwatchMs` is the day timer's
    running part not handed over yet. */
export function minutesOn(data: PracticeLogData, key: string, liveStopwatchMs = 0): number {
  const day = data.days[key];
  if (!day && !liveStopwatchMs) return 0;
  let timed = 0;
  for (const occ of Object.values(day?.routines ?? {})) for (const v of Object.values(occ.spentMs ?? {})) timed += v;
  for (const t of day?.tasks ?? []) timed += t.spentMs ?? 0;
  for (const s of day?.sessions ?? []) timed += s.ms;
  // The day timer is the day's total (everything not timed by it is added onto it); the larger of
  // the two only matters for days logged before that was so.
  const watch = (day?.stopwatchMs ?? 0) + liveStopwatchMs;
  return (Math.max(timed, watch) + (day?.extraMinutes ?? 0) * 60000) / 60000;
}

/** Tasks done / planned on a day — routine tasks (not on skipped routines) and the day's own. */
export function dayProgress(data: PracticeLogData, key: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const it of routinesOn(data, key)) {
    if (it.occurrence.skipped) continue;
    const p = progressOf(it.routine, it.occurrence);
    done += p.done;
    total += p.total;
  }
  for (const t of data.days[key]?.tasks ?? []) {
    total++;
    if (t.done) done++;
  }
  return { done, total };
}

/** The longest run of days in a row with any practice, ever. */
export function bestStreak(data: PracticeLogData): number {
  const keys = Object.keys(data.days).filter((k) => minutesOn(data, k) > 0).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of keys) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

/** Every minute ever logged. */
export function lifetimeMinutes(data: PracticeLogData): number {
  return Object.keys(data.days).reduce((sum, k) => sum + minutesOn(data, k), 0);
}

/** Hours of practice worth celebrating, and the streak lengths that get a fanfare. */
export const HOUR_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365, 500, 730, 1000];

/** The milestone before and after `hours` (for a progress bar). */
export function hourMilestone(hours: number): { from: number; to: number } {
  const to = HOUR_MILESTONES.find((h) => h > hours) ?? Math.ceil((hours + 1) / 1000) * 1000;
  const from = [...HOUR_MILESTONES].reverse().find((h) => h <= hours) ?? 0;
  return { from, to };
}

/** Days in a row, ending today (or yesterday, if today has nothing yet), with any practice. */
export function streak(data: PracticeLogData, today: string): number {
  let key = minutesOn(data, today) > 0 ? today : addDays(today, -1);
  let n = 0;
  while (minutesOn(data, key) > 0 && n < 3650) {
    n++;
    key = addDays(key, -1);
  }
  return n;
}

// ---------------------------------------------------------------- the timer

/** One finished (or cut-short) step of a Practice Timer run, as `practiceTimerEngine` records it.
    `link` ties it to a routine on a day; `segmentId` is then the task's id. */
export type PendingTimerEntry = {
  at: number;
  ms: number;
  done: boolean;
  session: string;
  title: string;
  segmentId: string;
  link?: { routineId: string; date: string };
  /** The day timer was running for that day when this happened (so it's already counted there);
      otherwise the time is added to the day timer. */
  covered?: boolean;
};

/** Folds the Practice Timer's recorded steps into the log: a routine's steps check off (and time)
    their tasks on that routine's day; anything else is a session entry on the day it ran. */
export function applyTimerEntries(data: PracticeLogData, entries: PendingTimerEntry[]): PracticeLogData {
  if (!entries.length) return data;
  const days = { ...data.days };
  for (const e of entries) {
    if (e.segmentId === DAY_STOPWATCH_ID) {
      const key = e.link?.date ?? toDateKey(new Date(e.at));
      days[key] = { ...(days[key] ?? {}), stopwatchMs: (days[key]?.stopwatchMs ?? 0) + e.ms };
      continue;
    }
    if (e.ms < 5000 && !e.done) continue; // a stray tap of Skip
    if (e.segmentId.startsWith("tool:") && e.ms < 1000) continue;
    const key = e.link?.date ?? toDateKey(new Date(e.at));
    const day: DayLog = { ...(days[key] ?? {}) };
    // Practice the day timer wasn't running for goes on it too: it's the day's total.
    if (!e.covered) day.stopwatchMs = (day.stopwatchMs ?? 0) + e.ms;
    if (e.link?.routineId === DAY_TASKS_ID && day.tasks?.some((t) => t.id === e.segmentId)) {
      day.tasks = day.tasks.map((t) => (t.id === e.segmentId ? { ...t, spentMs: (t.spentMs ?? 0) + e.ms, done: t.done || e.done } : t));
    } else if (e.link && data.routines.some((r) => r.id === e.link!.routineId)) {
      const rid = e.link.routineId;
      const occ: Occurrence = { ...(day.routines?.[rid] ?? {}) };
      occ.spentMs = { ...(occ.spentMs ?? {}), [e.segmentId]: (occ.spentMs?.[e.segmentId] ?? 0) + e.ms };
      if (e.done && !(occ.done ?? []).includes(e.segmentId)) occ.done = [...(occ.done ?? []), e.segmentId];
      day.routines = { ...(day.routines ?? {}), [rid]: occ };
    } else if (e.segmentId.startsWith("tool:")) {
      // Time in a tool: added to that tool's entry for the same sitting (within half an hour).
      const tool = e.segmentId.slice(5);
      const sessions = [...(day.sessions ?? [])];
      const i = sessions.findIndex((x) => x.tool === tool && e.at - x.at < 30 * 60000 && e.at >= x.at);
      if (i >= 0) sessions[i] = { ...sessions[i], ms: sessions[i].ms + e.ms, at: e.at };
      else sessions.push({ session: e.session, title: e.title, ms: e.ms, at: e.at, tool });
      day.sessions = sessions;
    } else {
      day.sessions = [...(day.sessions ?? []), { session: e.session, title: e.title, ms: e.ms, at: e.at }];
    }
    days[key] = day;
  }
  return { ...data, days };
}

// ---------------------------------------------------------------- making things

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function newTask(title = ""): RoutineTask {
  return { id: randomId(), title, minutes: 10, time: null, notes: "", attachments: [] };
}

export function newSubtask(title = ""): Subtask {
  return { id: randomId(), title };
}

export function newDayTask(title = ""): DayTask {
  return { id: randomId(), title, minutes: 15, time: null, done: false };
}

export function newRoutine(start: string, color = 0): Routine {
  const now = Date.now();
  return {
    id: randomId(),
    name: "",
    description: "",
    color,
    icon: "note",
    startTime: null,
    repeat: { freq: "weekly", interval: 1, weekdays: [weekdayOf(start)], start, end: null },
    tasks: [newTask()],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function attachmentKey(a: Attachment): string {
  return a.kind === "tool" ? `tool:${a.href}` : `${a.kind}:${a.id}`;
}

/** Drops days that hold nothing at all, so the stored object doesn't fill with empty entries. */
export function pruneDay(day: DayLog): DayLog | null {
  const occs = Object.entries(day.routines ?? {}).filter(
    ([, o]) =>
      (o.done?.length ?? 0) > 0 ||
      Object.keys(o.spentMs ?? {}).length > 0 ||
      !!o.notes ||
      o.skipped ||
      o.startTime !== undefined ||
      (o.subDone?.length ?? 0) > 0 ||
      (o.extraTasks?.length ?? 0) > 0,
  );
  const next: DayLog = {
    ...(day.notes ? { notes: day.notes } : {}),
    ...(day.attachments?.length ? { attachments: day.attachments } : {}),
    ...(day.added?.length ? { added: day.added } : {}),
    ...(occs.length ? { routines: Object.fromEntries(occs) } : {}),
    ...(day.tasks?.length ? { tasks: day.tasks } : {}),
    ...(day.sessions?.length ? { sessions: day.sessions } : {}),
    ...(day.extraMinutes ? { extraMinutes: day.extraMinutes } : {}),
    ...(day.stopwatchMs ? { stopwatchMs: day.stopwatchMs } : {}),
  };
  return Object.keys(next).length ? next : null;
}

// ---------------------------------------------------------------- sharing

/** A routine as others see it (a share link, a Community post): no ids, no dates, attachments as
    names only (a tune or chart of yours means nothing in someone else's library), tools kept. */
export type PublicRoutine = {
  name: string;
  description: string;
  color: number;
  icon?: string;
  startTime: string | null;
  repeat: { freq: RepeatFreq; interval: number; weekdays: Weekday[] };
  tasks: { title: string; minutes: number; time: string | null; notes: string; attachments: PublicAttachment[]; subtasks?: string[] }[];
  attachments: PublicAttachment[];
};

export type PublicAttachment = { kind: Attachment["kind"]; label: string; href?: string };

function publicAttachments(list: Attachment[] | undefined): PublicAttachment[] {
  return (list ?? []).map((a) => (a.kind === "tool" ? { kind: a.kind, label: a.label, href: a.href } : { kind: a.kind, label: a.label }));
}

export function toPublicRoutine(r: Routine): PublicRoutine {
  return {
    name: r.name,
    description: r.description,
    color: r.color,
    ...(r.icon ? { icon: r.icon } : {}),
    startTime: r.startTime,
    repeat: {
      freq: r.repeat.freq,
      interval: r.repeat.interval,
      // "No days picked" means the start date's weekday — the start date isn't shared, so say which.
      weekdays: r.repeat.freq === "weekly" && !r.repeat.weekdays.length ? [weekdayOf(r.repeat.start)] : r.repeat.weekdays,
    },
    tasks: r.tasks.map((t) => ({
      title: t.title,
      minutes: t.minutes,
      time: t.time,
      notes: t.notes,
      attachments: publicAttachments(t.attachments),
      ...(t.subtasks?.length ? { subtasks: t.subtasks.map((x) => x.title) } : {}),
    })),
    attachments: publicAttachments(r.attachments),
  };
}

/** Reads a `PublicRoutine` out of untrusted JSON (a shared link, a post), or null. */
export function cleanPublicRoutine(raw: unknown): PublicRoutine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (x: unknown, max = 500) => (typeof x === "string" ? x.slice(0, max) : "");
  const time = (x: unknown) => (typeof x === "string" && parseTime(x) !== null ? x : null);
  const atts = (x: unknown): PublicAttachment[] =>
    Array.isArray(x)
      ? x
          .filter((a) => a && typeof a === "object" && ["tune", "setlist", "chart", "tool"].includes((a as PublicAttachment).kind))
          .slice(0, 30)
          .map((a) => {
            const p = a as PublicAttachment;
            return { kind: p.kind, label: str(p.label, 200), ...(p.kind === "tool" && typeof p.href === "string" && p.href.startsWith("/") ? { href: p.href.slice(0, 100) } : {}) };
          })
      : [];
  const rep = (r.repeat ?? {}) as Record<string, unknown>;
  const freq: RepeatFreq = ["once", "daily", "weekly", "monthly"].includes(rep.freq as string) ? (rep.freq as RepeatFreq) : "weekly";
  const tasks = Array.isArray(r.tasks) ? r.tasks.slice(0, 100) : [];
  return {
    name: str(r.name, 120) || "Routine",
    description: str(r.description, 2000),
    color: typeof r.color === "number" && r.color >= 0 ? Math.floor(r.color) % ROUTINE_COLORS.length : 0,
    ...(typeof r.icon === "string" && /^[a-z0-9-]{1,30}$/.test(r.icon) ? { icon: r.icon } : {}),
    startTime: time(r.startTime),
    repeat: {
      freq,
      interval: typeof rep.interval === "number" ? Math.min(52, Math.max(1, Math.round(rep.interval))) : 1,
      weekdays: Array.isArray(rep.weekdays) ? (rep.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) as Weekday[]) : [],
    },
    tasks: tasks.map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      return {
        title: str(o.title, 200),
        minutes: typeof o.minutes === "number" && o.minutes >= 0 ? Math.min(600, o.minutes) : 0,
        time: time(o.time),
        notes: str(o.notes, 2000),
        attachments: atts(o.attachments),
        ...(Array.isArray(o.subtasks) ? { subtasks: o.subtasks.slice(0, 50).map((x) => str(x, 200)).filter(Boolean) } : {}),
      };
    }),
    attachments: atts(r.attachments),
  };
}

/** A shared routine made yours: new ids, starting `start`. Tunes, setlists and charts attached to
    it were someone else's, so they become a line in the task's notes; tools stay attached. */
export function routineFromPublic(p: PublicRoutine, start: string): Routine {
  const now = Date.now();
  const keep = (list: PublicAttachment[]): Attachment[] =>
    list.filter((a) => a.kind === "tool" && a.href).map((a) => ({ kind: "tool", href: a.href!, label: a.label }));
  const mention = (list: PublicAttachment[]) => {
    const names = list.filter((a) => a.kind !== "tool").map((a) => a.label);
    return names.length ? `With: ${names.join(", ")}` : "";
  };
  return {
    id: randomId(),
    name: p.name,
    description: [p.description, mention(p.attachments)].filter(Boolean).join("\n"),
    color: p.color,
    ...(p.icon ? { icon: p.icon } : {}),
    startTime: p.startTime,
    repeat: { ...p.repeat, start, end: null },
    tasks: p.tasks.map((t) => ({
      id: randomId(),
      title: t.title,
      minutes: t.minutes,
      time: t.time,
      notes: [t.notes, mention(t.attachments)].filter(Boolean).join("\n"),
      attachments: keep(t.attachments),
      ...(t.subtasks?.length ? { subtasks: t.subtasks.map((title) => ({ id: randomId(), title })) } : {}),
    })),
    attachments: keep(p.attachments),
    createdAt: now,
    updatedAt: now,
  };
}

/** "Every Monday and Wednesday" for a routine without dates. */
export function describePublicRepeat(p: PublicRoutine["repeat"]): string {
  if (p.freq === "once") return "One session";
  return describeRepeat({ ...p, start: "2026-01-04", end: null }).replace(/ on the \d+\w\w$/, "");
}

// ---------------------------------------------------------------- progress cards

export type ProgressCardKind = "streak" | "hours" | "year" | "day";
/** How much time the card's grid (and its Hours / Days numbers) covers. */
export type ProgressCardRange = "week" | "month" | "year";

/** What a shareable progress card shows — small enough to post: the headline numbers and the
    range's days as practice levels (`"0"`–`"4"`, oldest first, from `start`). Week and month
    cards also carry each day's minutes (`mins`). `kind: "year"` is the "Days" card. */
export type ProgressCard = {
  kind: ProgressCardKind;
  range: ProgressCardRange;
  streak: number;
  best: number;
  /** Lifetime hours. */
  hours: number;
  /** Days with any practice in the last 365. */
  days: number;
  /** Hours and days practiced in the range (for a year: the last 365 days). */
  rangeHours: number;
  rangeDays: number;
  /** The first day of the grid and the last day shown (YYYY-MM-DD). */
  start: string;
  end: string;
  levels: string;
  mins?: number[];
  /** `kind: "day"` only: one day's report. */
  report?: DayReport;
};

/** A day's report card: everything checked off (with its time), time in tools and on the Practice
    Timer, and what that day earned. */
export type DayReportItem = { title: string; detail: string; minutes: number; color: number | null };
export type DayAchievement = { kind: "goal" | "streak" | "hours" | "routine" | "all" | "best" | "first"; text: string };
export type DayReport = {
  date: string;
  minutes: number;
  goal: number;
  items: DayReportItem[];
  /** Items left off the card. */
  more: number;
  achievements: DayAchievement[];
};

export const REPORT_ITEMS = 12;

/** The report for one day (`key`). */
export function dayReport(data: PracticeLogData, key: string): DayReport {
  const goal = goalOn(data, key);
  const minutes = minutesOn(data, key);
  const day = data.days[key];
  const items: DayReportItem[] = [];
  const achievements: DayAchievement[] = [];
  const mins = (ms: number | undefined, planned: number) => Math.round(ms ? ms / 60000 : planned);
  const its = routinesOn(data, key);
  for (const it of its) {
    const done = new Set(it.occurrence.done ?? []);
    for (const t of tasksOf(it.routine, it.occurrence)) {
      if (done.has(t.id)) items.push({ title: t.title || "Untitled task", detail: it.routine.name || "Routine", minutes: mins(it.occurrence.spentMs?.[t.id], t.minutes), color: it.routine.color });
    }
    const p = progressOf(it.routine, it.occurrence);
    if (p.total > 0 && p.done === p.total && !it.occurrence.skipped) achievements.push({ kind: "routine", text: `Finished ${it.routine.name || "a routine"}` });
  }
  for (const t of day?.tasks ?? []) if (t.done) items.push({ title: t.title || "Untitled task", detail: "Task", minutes: mins(t.spentMs, t.minutes), color: null });
  for (const e of day?.sessions ?? []) {
    const m = Math.round(e.ms / 60000);
    if (m > 0) items.push({ title: e.title || e.session, detail: e.tool ? "Time in the tool" : "Practice Timer", minutes: m, color: null });
  }
  const prog = dayProgress(data, key);
  if (prog.total > 1 && prog.done === prog.total) achievements.unshift({ kind: "all", text: "Everything done" });
  if (goal > 0 && minutes >= goal) achievements.unshift({ kind: "goal", text: minutes >= goal * 2 ? "Daily goal, twice over" : "Hit the daily goal" });
  if (minutes > 0) {
    const s = streak(data, key);
    if (STREAK_MILESTONES.includes(s)) achievements.push({ kind: "streak", text: `${s}-day streak` });
    let before = 0;
    let bestBefore = 0;
    let anyBefore = false;
    for (const k of Object.keys(data.days)) {
      if (k >= key) continue;
      const m = minutesOn(data, k);
      before += m;
      bestBefore = Math.max(bestBefore, m);
      if (m > 0) anyBefore = true;
    }
    const passed = HOUR_MILESTONES.filter((h) => before < h * 60 && before + minutes >= h * 60).pop();
    if (passed) achievements.push({ kind: "hours", text: `Passed ${passed} ${passed === 1 ? "hour" : "hours"} in total` });
    if (!anyBefore) achievements.push({ kind: "first", text: "First day in the Shed Log" });
    else if (minutes > bestBefore) achievements.push({ kind: "best", text: "Longest practice day yet" });
  }
  return { date: key, minutes: Math.round(minutes), goal, items: items.slice(0, REPORT_ITEMS), more: Math.max(0, items.length - REPORT_ITEMS), achievements: achievements.slice(0, 6) };
}

/** A day-report card for `key`. */
export function dayReportCard(data: PracticeLogData, key: string): ProgressCard {
  const report = dayReport(data, key);
  const s = streak(data, key);
  let hours = 0;
  for (const k of Object.keys(data.days)) if (k <= key) hours += minutesOn(data, k);
  return {
    kind: "day",
    range: "week",
    streak: report.minutes > 0 ? s : 0,
    best: Math.max(s, bestStreak(data)),
    hours: hours / 60,
    days: 0,
    rangeHours: report.minutes / 60,
    rangeDays: report.minutes > 0 ? 1 : 0,
    start: key,
    end: key,
    levels: "",
    report,
  };
}

function cleanReport(raw: unknown, end: string): DayReport | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(100000, Math.round(x)) : 0);
  const str = (x: unknown, n = 80) => (typeof x === "string" ? x.slice(0, n) : "");
  const KINDS = ["goal", "streak", "hours", "routine", "all", "best", "first"];
  const items = Array.isArray(r.items)
    ? r.items.slice(0, REPORT_ITEMS).filter((i): i is Record<string, unknown> => !!i && typeof i === "object").map((i) => ({
        title: str(i.title),
        detail: str(i.detail, 40),
        minutes: num(i.minutes),
        color: typeof i.color === "number" ? Math.floor(Math.min(20, Math.max(0, i.color))) : null,
      }))
    : [];
  const achievements = Array.isArray(r.achievements)
    ? r.achievements.slice(0, 6).filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && KINDS.includes(a.kind as string)).map((a) => ({ kind: a.kind as DayAchievement["kind"], text: str(a.text, 60) }))
    : [];
  return { date: end, minutes: num(r.minutes), goal: num(r.goal), items, more: num(r.more), achievements };
}

/** How busy a day was, 0–4 (against the daily goal, or 15/30/60 min without one). */
export function dayLevel(minutes: number, goal: number): number {
  if (minutes <= 0) return 0;
  const g = goal > 0 ? goal : 30;
  if (minutes >= g * 1.5) return 4;
  if (minutes >= g) return 3;
  if (minutes >= g * 0.5) return 2;
  return 1;
}

export const CARD_WEEKS = 53;

/** The first day a card's grid shows: 53 weeks back (from a week start) for a year, the 1st of
    the month, or the start of the week. */
export function cardStart(range: ProgressCardRange, today: string): string {
  if (range === "week") return startOfWeek(today);
  if (range === "month") return `${today.slice(0, 8)}01`;
  return addDays(startOfWeek(today), -(CARD_WEEKS - 1) * 7);
}

export function progressCard(data: PracticeLogData, today: string, kind: ProgressCardKind, range: ProgressCardRange = "year"): ProgressCard {
  const first = cardStart(range, today);
  const n = daysBetween(first, today) + 1;
  let levels = "";
  const mins: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = addDays(first, i);
    const m = minutesOn(data, k);
    levels += String(dayLevel(m, goalOn(data, k)));
    if (range !== "year") mins.push(Math.round(m));
  }
  let days = 0;
  let yearMinutes = 0;
  for (let i = 0; i < 365; i++) {
    const m = minutesOn(data, addDays(today, -i));
    if (m > 0) days++;
    yearMinutes += m;
  }
  const rangeMinutes = range === "year" ? yearMinutes : mins.reduce((a, b) => a + b, 0);
  const rangeDays = range === "year" ? days : mins.filter((m) => m > 0).length;
  const s = streak(data, today);
  return {
    kind,
    range,
    streak: s,
    best: Math.max(s, bestStreak(data)),
    hours: lifetimeMinutes(data) / 60,
    days,
    rangeHours: rangeMinutes / 60,
    rangeDays,
    start: first,
    end: today,
    levels,
    ...(range !== "year" ? { mins } : {}),
  };
}

/** Reads a `ProgressCard` out of untrusted JSON (a post), or null. */
export function cleanProgressCard(raw: unknown): ProgressCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(1e6, x) : 0);
  if (!["streak", "hours", "year", "day"].includes(r.kind as string) || !isDateKey(r.end) || typeof r.levels !== "string") return null;
  const report = r.kind === "day" ? cleanReport(r.report, r.end) : undefined;
  if (r.kind === "day" && !report) return null;
  const range: ProgressCardRange = r.range === "week" || r.range === "month" ? r.range : "year";
  const days = Math.floor(Math.min(366, num(r.days)));
  return {
    kind: r.kind as ProgressCardKind,
    range,
    streak: Math.floor(num(r.streak)),
    best: Math.floor(num(r.best)),
    hours: num(r.hours),
    days,
    // Cards posted before ranges existed are year cards: lifetime hours, the last year's days.
    rangeHours: r.rangeHours === undefined ? num(r.hours) : num(r.rangeHours),
    rangeDays: r.rangeDays === undefined ? days : Math.floor(Math.min(366, num(r.rangeDays))),
    start: isDateKey(r.start) ? r.start : cardStart(range, r.end),
    end: r.end,
    levels: r.levels.replace(/[^0-4]/g, "").slice(0, CARD_WEEKS * 7),
    ...(Array.isArray(r.mins) ? { mins: r.mins.slice(0, 31).map((m) => Math.round(num(m))) } : {}),
    ...(report ? { report } : {}),
  };
}

/** A routine on a past day that wasn't finished (not skipped, and not before the routine existed). */
/** How a past day went, for a routine or the whole day: everything done, some of it, or nothing.
    Skipping counts as not doing it. `null` for today and the future (a routine's own start date
    already keeps it off earlier days). */
export type DayStatus = "done" | "partial" | "missed";

export function routineStatus(item: DayRoutine, key: string, today: string): DayStatus | null {
  if (key >= today) return null;
  const p = progressOf(item.routine, item.occurrence);
  if (p.total === 0) return null;
  if (!item.occurrence.skipped && p.done === p.total) return "done";
  return p.done > 0 ? "partial" : "missed";
}

/** A past routine left with nothing checked off (or skipped). */
export function isMissed(item: DayRoutine, key: string, today: string): boolean {
  return routineStatus(item, key, today) === "missed";
}

/** A past day: green when everything planned was done, yellow when some of it was (one routine
    finished and another not started counts), red when nothing was checked off — time logged
    without checking anything off doesn't change that. `null` when nothing was planned. */
export function dayStatus(data: PracticeLogData, key: string, today: string): DayStatus | null {
  if (key >= today) return null;
  const parts: DayStatus[] = [];
  for (const it of routinesOn(data, key)) {
    const s = routineStatus(it, key, today);
    if (s) parts.push(s);
  }
  for (const t of data.days[key]?.tasks ?? []) parts.push(t.done ? "done" : "missed");
  if (!parts.length) return null;
  if (parts.every((s) => s === "done")) return "done";
  if (parts.some((s) => s !== "missed")) return "partial";
  return "missed";
}

/** Checks a routine task off or on for a day. Checking off logs the task's planned minutes — on the
    task and on the day timer — when nothing's logged for it yet and the day timer isn't running
    (`addTime`; while it runs, that time is already being counted). `autoMs` remembers how much, so
    unchecking takes exactly that back off; time from the timer or logged by hand stays.
    `watch` is how much to change the day timer by. */
export function setTaskDone(occ: Occurrence, task: RoutineTask, done: boolean, addTime = true): { occ: Occurrence; watch: number } {
  const list = occ.done ?? [];
  const spent = { ...(occ.spentMs ?? {}) };
  const auto = { ...(occ.autoMs ?? {}) };
  if (done) {
    if (list.includes(task.id)) return { occ, watch: 0 };
    let watch = 0;
    if (addTime && !spent[task.id] && task.minutes > 0) {
      spent[task.id] = task.minutes * 60000;
      auto[task.id] = task.minutes * 60000;
      watch = task.minutes * 60000;
    }
    return { occ: { ...occ, done: [...list, task.id], spentMs: spent, autoMs: auto }, watch };
  }
  let watch = 0;
  if (auto[task.id]) {
    const left = (spent[task.id] ?? 0) - auto[task.id];
    if (left > 0) spent[task.id] = left;
    else delete spent[task.id];
    watch = -auto[task.id];
    delete auto[task.id];
  }
  return { occ: { ...occ, done: list.filter((id) => id !== task.id), spentMs: spent, autoMs: auto }, watch };
}

/** The same for a day's own task. */
export function setDayTaskDone(task: DayTask, done: boolean, addTime = true): { task: DayTask; watch: number } {
  if (done === task.done) return { task, watch: 0 };
  if (done) {
    if (addTime && !task.spentMs && task.minutes > 0) return { task: { ...task, done, spentMs: task.minutes * 60000, autoMs: task.minutes * 60000 }, watch: task.minutes * 60000 };
    return { task: { ...task, done }, watch: 0 };
  }
  if (task.autoMs) {
    const left = (task.spentMs ?? 0) - task.autoMs;
    const next: DayTask = { ...task, done };
    delete next.autoMs;
    if (left > 0) next.spentMs = left;
    else delete next.spentMs;
    return { task: next, watch: -task.autoMs };
  }
  return { task: { ...task, done }, watch: 0 };
}

/** A day with all its logged time removed — the day timer, minutes logged by hand, time on tasks,
    Practice Timer sessions and time in tools. What was checked off stays checked. */
export function clearDayTime(day: DayLog): DayLog {
  const routines: Record<string, Occurrence> = {};
  for (const [id, occ] of Object.entries(day.routines ?? {})) {
    const next = { ...occ };
    delete next.spentMs;
    delete next.autoMs;
    routines[id] = next;
  }
  const next: DayLog = {
    ...day,
    routines,
    tasks: (day.tasks ?? []).map((t) => {
      const c = { ...t };
      delete c.spentMs;
      delete c.autoMs;
      return c;
    }),
  };
  delete next.stopwatchMs;
  delete next.extraMinutes;
  delete next.sessions;
  return next;
}

// ---------------------------------------------------------------- public profile stats

/** What a public profile shows from someone's Shed Log: streaks, hours, days, the last 26 weeks as
    levels (like the cards), and the milestones reached. Nothing about routines or tasks. */
export type PublicPracticeStats = {
  streak: number;
  best: number;
  hours: number;
  weekHours: number;
  /** Days with practice in the last 365. */
  days: number;
  /** Days in the last 30 that hit that day's goal. */
  goalDays: number;
  /** The first day of `levels` (a Sunday) and one digit 0–4 per day up to `today`. */
  start: string;
  levels: string;
  /** Hour and streak milestones reached, biggest first. */
  achievements: { kind: "hours" | "streak"; value: number }[];
};

export const PROFILE_WEEKS = 26;

/** Reads a stored Shed Log blob defensively (it's untrusted JSON) into `PracticeLogData`. */
export function practiceLogFrom(raw: unknown): PracticeLogData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const days = r.days && typeof r.days === "object" ? (r.days as Record<string, DayLog>) : {};
  const routines = Array.isArray(r.routines) ? (r.routines as Routine[]) : [];
  const prefs = { ...DEFAULT_PREFS, ...(r.prefs && typeof r.prefs === "object" ? (r.prefs as Partial<PracticeLogPrefs>) : {}) };
  return { routines, days, prefs };
}

export function publicPracticeStats(data: PracticeLogData, today: string): PublicPracticeStats | null {
  const lifetime = lifetimeMinutes(data);
  if (lifetime <= 0) return null;
  const hours = lifetime / 60;
  const s = streak(data, today);
  const best = Math.max(s, bestStreak(data));
  let days = 0;
  for (let i = 0; i < 365; i++) if (minutesOn(data, addDays(today, -i)) > 0) days++;
  let goalDays = 0;
  for (let i = 0; i < 30; i++) {
    const k = addDays(today, -i);
    const g = goalOn(data, k);
    if (g > 0 && minutesOn(data, k) >= g) goalDays++;
  }
  const weekStart = startOfWeek(today);
  let week = 0;
  for (let k = weekStart; k <= today; k = addDays(k, 1)) week += minutesOn(data, k);
  const start = addDays(weekStart, -(PROFILE_WEEKS - 1) * 7);
  let levels = "";
  for (let k = start; k <= today; k = addDays(k, 1)) levels += String(dayLevel(minutesOn(data, k), goalOn(data, k)));
  const achievements: PublicPracticeStats["achievements"] = [
    ...HOUR_MILESTONES.filter((h) => hours >= h).map((value) => ({ kind: "hours" as const, value })),
    ...STREAK_MILESTONES.filter((n) => best >= n).map((value) => ({ kind: "streak" as const, value })),
  ].sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === "streak" ? -1 : 1));
  return { streak: s, best, hours: Math.round(hours * 10) / 10, weekHours: Math.round((week / 60) * 10) / 10, days, goalDays, start, levels, achievements };
}


// ---------------------------------------------------------------- lessons

/** The Shed Log id a lesson's assigned routine gets in the student's log. */
export const lessonRoutineId = (itemId: string) => `lesson-${itemId}`;

export type RoutineReportTask = { id: string; title: string; done: boolean; minutes: number; planned: number; subtasks: { title: string; done: boolean }[] };
export type RoutineReportDay = {
  date: string;
  /** null = today (not over yet). */
  status: DayStatus | null;
  skipped: boolean;
  added: boolean;
  tasks: RoutineReportTask[];
  minutes: number;
  notes: string;
};
export type RoutineReport = {
  days: RoutineReportDay[];
  totals: { done: number; partial: number; missed: number; minutes: number; tasksDone: number; tasksTotal: number };
};

/** How a student has done with one routine (Lessons → a routine's practice report): every day it
    was on, newest first, from `from` (or the routine's start) up to today — each day's status,
    tasks ticked with the minutes logged on each, subtasks and notes — plus totals. */
export function routineReport(data: PracticeLogData, routineId: string, today: string, from?: string): RoutineReport | null {
  const routine = data.routines.find((r) => r.id === routineId);
  if (!routine) return null;
  let start = routine.repeat.start;
  if (from && from > start) start = from;
  const days: RoutineReportDay[] = [];
  const totals = { done: 0, partial: 0, missed: 0, minutes: 0, tasksDone: 0, tasksTotal: 0 };
  // Days it was scheduled, or added by hand, between `start` and today (at most a year back).
  const keys = new Set<string>();
  for (let key = start, n = 0; key <= today && n < 400; key = addDays(key, 1), n++) {
    if (occursOn(routine.repeat, key)) keys.add(key);
  }
  for (const [key, day] of Object.entries(data.days)) if (key >= start && key <= today && day.added?.includes(routineId)) keys.add(key);
  for (const key of [...keys].sort().reverse()) {
    const day = data.days[key];
    const occurrence = day?.routines?.[routineId] ?? {};
    const added = !occursOn(routine.repeat, key);
    const status = routineStatus({ routine, occurrence, added }, key, today);
    const done = new Set(occurrence.done ?? []);
    const subDone = new Set(occurrence.subDone ?? []);
    const tasks = tasksOf(routine, occurrence).map((t) => ({
      id: t.id,
      title: t.title,
      done: done.has(t.id),
      minutes: Math.round(((occurrence.spentMs?.[t.id] ?? 0) / 60000) * 10) / 10,
      planned: t.minutes,
      subtasks: (t.subtasks ?? []).map((st) => ({ title: st.title, done: subDone.has(st.id) })),
    }));
    const minutes = tasks.reduce((sum, t) => sum + t.minutes, 0);
    days.push({ date: key, status, skipped: !!occurrence.skipped, added, tasks, minutes, notes: occurrence.notes ?? "" });
    if (status) totals[status]++;
    totals.minutes += minutes;
    if (key < today) {
      totals.tasksDone += tasks.filter((t) => t.done).length;
      totals.tasksTotal += tasks.length;
    }
  }
  totals.minutes = Math.round(totals.minutes);
  return { days, totals };
}

/** The last day with practice logged on it, or null. */
export function lastPracticed(data: PracticeLogData, today: string): string | null {
  const keys = Object.keys(data.days).filter((k) => k <= today).sort().reverse();
  for (const key of keys) if (minutesOn(data, key) > 0) return key;
  return null;
}

export type AssignedRoutine = { itemId: string; teacher: string; version: number; routine: Routine };

/**
 * Keeps the routines teachers assigned (Lessons) in step with a student's Shed Log: each one is
 * a routine with id `lesson-<item id>`, added when it's first seen (starting today if the
 * teacher's start date has passed), replaced when the teacher changes it (keeping its start, so
 * past days stay), and removed when the teacher deletes it or the student leaves. Past days'
 * entries are never touched. Returns `data` itself when nothing changed.
 */
export function reconcileAssigned(data: PracticeLogData, assigned: AssignedRoutine[], today: string): PracticeLogData {
  let changed = false;
  const wanted = new Map(assigned.map((a) => [lessonRoutineId(a.itemId), a]));
  const routines: Routine[] = [];
  for (const r of data.routines) {
    if (!r.id.startsWith("lesson-")) {
      routines.push(r);
      continue;
    }
    const a = wanted.get(r.id);
    if (!a) {
      changed = true;
      continue;
    }
    wanted.delete(r.id);
    if ((r.assigned?.version ?? 0) >= a.version) {
      routines.push(r);
      continue;
    }
    changed = true;
    routines.push({ ...a.routine, id: r.id, repeat: { ...a.routine.repeat, start: r.repeat.start }, createdAt: r.createdAt, updatedAt: Date.now(), assigned: { teacher: a.teacher, itemId: a.itemId, version: a.version } });
  }
  for (const [id, a] of wanted) {
    changed = true;
    const start = a.routine.repeat.start > today ? a.routine.repeat.start : today;
    routines.push({ ...a.routine, id, repeat: { ...a.routine.repeat, start }, createdAt: Date.now(), updatedAt: Date.now(), assigned: { teacher: a.teacher, itemId: a.itemId, version: a.version } });
  }
  return changed ? { ...data, routines } : data;
}
