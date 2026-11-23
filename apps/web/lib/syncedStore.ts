/**
 * The shared machinery behind `lib/useSyncedSettings.ts` and `lib/useSyncedTunes.ts` — a
 * module-level, per-key in-memory cache of "the current value while signed in", updated
 * *synchronously* on every local edit and only written to Convex after a short quiet period.
 * Fixes two real problems the first version of the sync hooks had:
 *
 * 1. **A stale-closure race that silently dropped rapid edits.** The original hooks derived
 *    "current value" from the `useQuery` result each render and closed over it in `update()`. Two
 *    edits fired before the first mutation's result round-tripped back through the query both read
 *    the *same* pre-edit snapshot, so the second write clobbered the first instead of building on
 *    it — reported as "jam practice only lets me add one tune at a time" (adding several standards
 *    quickly each read the same stale tune list). Keeping the current value in this synchronous,
 *    always-up-to-date module-level cache — not a value closed over from a stale render — means
 *    every `set` call starts from whatever the *last* call actually left behind, whether or not
 *    Convex has echoed it back yet.
 * 2. **A live network round-trip on every single keystroke/slider-tick/click.** The original
 *    hooks fired a `useMutation` call immediately on every `update()`. Dragging a tempo slider or
 *    typing into a name field could fire dozens of writes a second — reported as the whole site
 *    feeling slow. Now a local edit updates the in-memory cache (and re-renders every subscribed
 *    component) instantly, and only the *last* value in a burst of edits actually gets sent to
 *    Convex, `DEBOUNCE_MS` after the burst goes quiet — one write per pause in editing, not one
 *    per edit.
 */

const DEBOUNCE_MS = 600;
/** How long after sending a write we ignore server values that aren't that write — the query can
    still answer with the value from before it while the mutation is on its way. */
const ECHO_WAIT_MS = 5000;

type Entry<T> = {
  value: T;
  /** Whether `value` holds a real value yet — either seeded from the server or set by a local
      edit. Before that, callers should show `defaults`, not this (unset) entry. */
  seeded: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** The last write sent (as JSON) and when, until the server echoes it back. */
  sent: { json: string; at: number } | null;
  listeners: Set<() => void>;
};

const entries = new Map<string, Entry<unknown>>();

function getEntry<T>(key: string): Entry<T> {
  let entry = entries.get(key);
  if (!entry) {
    entry = { value: undefined as T, seeded: false, timer: null, sent: null, listeners: new Set() };
    entries.set(key, entry as Entry<unknown>);
  }
  return entry as Entry<T>;
}

function notify(key: string) {
  for (const listener of getEntry(key).listeners) listener();
}

export function subscribeSynced(key: string, listener: () => void): () => void {
  const entry = getEntry(key);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

/** The current in-memory value for `key`, or `fallback` if nothing's been seeded/set yet
    (still loading, or signed out and this key was never touched while signed in this session). */
export function getSyncedValue<T>(key: string, fallback: T): T {
  const entry = getEntry<T>(key);
  return entry.seeded ? entry.value : fallback;
}

/** Takes a server value for `key`. The first one seeds the cache. After that, a newer server value
    (another device or tab saved this key) replaces the cache — but never while a local edit is
    waiting to be written, or while our own last write hasn't come back yet, so a late or stale
    query result can't stomp a local edit. Without this, a page kept open on one device wrote its
    old copy back over changes made elsewhere (a Shed Log tick on the phone vanished the next time
    the website saved). Call from a `useEffect` keyed on the query result, not during render. */
export function seedSynced<T>(key: string, value: T) {
  const entry = getEntry<T>(key);
  if (!entry.seeded) {
    entry.value = value;
    entry.seeded = true;
    notify(key);
    return;
  }
  if (entry.timer) return;
  const json = JSON.stringify(value);
  if (entry.sent) {
    if (json === entry.sent.json) {
      entry.sent = null;
      return;
    }
    if (Date.now() - entry.sent.at < ECHO_WAIT_MS) return;
    entry.sent = null;
  }
  if (json === JSON.stringify(entry.value)) return;
  entry.value = value;
  notify(key);
}

/** Applies a local edit immediately (synchronous — every subscribed component re-renders with it
    right away) and (re)schedules a single debounced `write`, replacing whatever call was already
    pending. `write` always sees the *latest* accumulated value at the moment it actually fires,
    not whatever `value` was when this particular call scheduled it. */
export function setSyncedValue<T>(key: string, value: T, write: (value: T) => void) {
  const entry = getEntry<T>(key);
  entry.value = value;
  entry.seeded = true;
  notify(key);

  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    entry.timer = null;
    entry.sent = { json: JSON.stringify(entry.value), at: Date.now() };
    write(entry.value);
  }, DEBOUNCE_MS);
}

/** Clears a key's cache on sign-out, so a subsequent sign-in (even back-to-back, same tab, a
    different account) re-seeds fresh from that account's own data instead of quietly continuing
    to show whatever the previous session last had cached. Cancels any not-yet-fired debounced
    write rather than losing it silently: if one was pending, `write` fires immediately with
    whatever the last local edit was, so a real edit made just before signing out still lands. */
export function resetSynced<T>(key: string, write: (value: T) => void) {
  const entry = getEntry<T>(key);
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
    if (entry.seeded) write(entry.value);
  }
  entry.seeded = false;
  entry.sent = null;
}

/** Whether `key` holds a real value yet (seeded from the server or set locally) — "loaded", for
    code that must not act on the empty fallback (e.g. writing a list built from it). */
export function isSyncedSeeded(key: string): boolean {
  return getEntry(key).seeded;
}
