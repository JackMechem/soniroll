import { DAY_STOPWATCH_ID, toDateKey, type PendingTimerEntry } from '@jam-practice/core/practiceLog';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Practice waiting to go into the Shed Log — the native sibling of the queue in the website's
 * `lib/practiceTimerEngine.ts`: the Practice Timer's finished steps (a routine's tasks, or a plain
 * session), the day timer's time and a tool's time logged with its Log button. Kept on the phone
 * (`jam-practice-log-pending`) so nothing is lost if the app closes first; the Shed Log takes them
 * in (`takePendingLogEntries`) once it has loaded, signed in (`components/shedLog/ShedLogGlobal.tsx`).
 */

const KEY = 'jam-practice-log-pending';
const MAX = 500;

let queue: PendingTimerEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

// What was waiting when the app last closed comes first.
AsyncStorage.getItem(KEY)
  .then((raw) => {
    const saved = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(saved)) queue = [...(saved as PendingTimerEntry[]), ...queue].slice(-MAX);
  })
  .catch(() => {})
  .finally(() => {
    loaded = true;
    if (queue.length) notify();
  });

function notify() {
  for (const l of listeners) l();
}

function save() {
  void (queue.length ? AsyncStorage.setItem(KEY, JSON.stringify(queue)) : AsyncStorage.removeItem(KEY)).catch(() => {});
}

/** Whether the day timer is running for a day — set by `dayStopwatch.ts` (it imports this file,
    so it registers itself rather than being imported here). */
let dayTimerCovers: ((date: string) => boolean) | null = null;
export function setDayTimerCoverage(fn: (date: string) => boolean) {
  dayTimerCovers = fn;
}

/** Adds practice to the queue. Each entry notes whether the day timer was running for its day
    (`covered`): if it wasn't, the time is added to the day timer too, so the day timer is the
    day's whole practice time (`applyTimerEntries`). */
export function queueLogEntry(entry: PendingTimerEntry) {
  if (entry.segmentId !== DAY_STOPWATCH_ID && entry.covered === undefined) {
    entry = { ...entry, covered: dayTimerCovers?.(entry.link?.date ?? toDateKey(new Date(entry.at))) ?? false };
  }
  queue = [...queue, entry].slice(-MAX);
  save();
  notify();
}

/** Takes (and clears) what's waiting. Empty until the saved queue has been read. */
export function takePendingLogEntries(): PendingTimerEntry[] {
  if (!loaded || !queue.length) return [];
  const out = queue;
  queue = [];
  save();
  return out;
}

/** Called whenever something is queued (and once the saved queue has loaded). */
export function onPendingLogEntries(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
