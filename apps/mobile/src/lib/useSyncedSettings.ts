import { api } from '@jam-practice/convex/_generated/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useSyncExternalStore } from 'react';

import { currentStoreMode, onStoreModeChange, scopedKey, useStoreMode } from './accountScope';

/**
 * The native sibling of `apps/web/lib/useSyncedSettings.ts` — same `[settings, update]` contract
 * as `useDeviceSettings.ts` (a drop-in replacement for it, same "stable module-level defaults
 * object" rule), but synced to the signed-in account's `syncedSettings` Convex table when
 * reachable. Per a direct request ("the options for metronome shuld be pulled from the account...
 * along with all the other tools. i also want the tools to work if offline so if the account data
 * is not available resort to using whatever is stored on the device"), this is **not** a straight
 * port of the web hook — web has no offline story at all (signed in, it reads *only* the in-memory/
 * Convex cache, nothing persists locally); this one always keeps `AsyncStorage` as a real local
 * cache, signed in or not, specifically so a cold app launch with no network still has something
 * to show immediately, and an edit made offline isn't lost.
 *
 * Which copy: signed out, the phone's own (`<key>`); signed in, the account's, kept on the phone as
 * `<key>:account` and deleted on sign-out (`lib/accountScope.ts`). No merge, and another account
 * never sees it — signing in or out drops everything held here and loads the other copy.
 *
 * Precedence, per `key`, across the lifetime of one signed-in session (reset on sign-out, see
 * below):
 * 1. `AsyncStorage`'s own stored value, applied the moment it loads (fast, no network needed) —
 *    this alone is enough for a fully offline cold start.
 * 2. The account's own synced value, applied **once**, the first time a real (non-`"skip"`) query
 *    result arrives — this is allowed to override #1 (a signed-in device's local cache might be
 *    stale relative to the account), but only up until #3 happens.
 * 3. A real local edit (`update()`), which always wins from that point on and blocks #2 from ever
 *    overriding it later in this same session — the exact same "last touch wins, no merge" rule
 *    `apps/web/lib/syncedStore.ts` already documents, just extended with a local-storage read
 *    ahead of the server one instead of starting every session from nothing.
 *
 * A module-level cache (keyed by settings `key`, shared across every component reading the same
 * key — same shape as web's `syncedStore.ts`) is what makes a rapid burst of edits collapse into
 * one debounced Convex write instead of one per keystroke, and what keeps two call sites reading
 * the same key from fighting over which one's stale closure is "current."
 */

const DEBOUNCE_MS = 600;

type Entry = {
  value: unknown;
  hasValue: boolean;
  /** A real local edit happened this signed-in session — blocks the one-time server seed below. */
  localEdited: boolean;
  /** The one-time "apply the server's value, if any" step has already run (or been skipped
      because signed out) for this session. */
  serverApplied: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** This device's AsyncStorage copy has been read (whether or not there was one). */
  localLoaded: boolean;
  /** A local read is on its way (for the current mode). */
  localLoading: boolean;
  /** Sends a value to the account (the last mounted hook's mutation), for an edit still waiting
      when the account signs out. */
  send: ((value: string) => Promise<unknown>) | null;
  listeners: Set<() => void>;
};

// Bumped on every sign-in/out, so a slow read from before it is ignored.
let generation = 0;

const entries = new Map<string, Entry>();

function getEntry(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      value: undefined,
      hasValue: false,
      localEdited: false,
      serverApplied: false,
      timer: null,
      localLoaded: false,
      localLoading: false,
      send: null,
      listeners: new Set(),
    };
    entries.set(key, entry);
  }
  return entry;
}

/** The cache holds the *whole* stored object for a key, never one caller's filtered copy: several
    screens can read the same key with different defaults (Home and the profile read the shared
    ear-training progress; tools read their own full settings), and caching whichever caller's
    trimmed copy loaded first used to hand the others an object missing their fields — and then
    write that trimmed copy back, dropping fields this app (or the website, which shares these
    keys) doesn't know about. Each caller sees it through `viewOf`. */
function asRecord(parsed: unknown): Record<string, unknown> | null {
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

const views = new WeakMap<object, WeakMap<object, unknown>>();
/** `raw` filtered/defaulted for one caller's `defaults`, memoized on both identities so
    `useSyncExternalStore` gets the same reference until the stored value changes. */
function viewOf<T extends object>(raw: object, defaults: T): T {
  let byDefaults = views.get(raw);
  if (!byDefaults) {
    byDefaults = new WeakMap();
    views.set(raw, byDefaults);
  }
  let view = byDefaults.get(defaults) as T | undefined;
  if (!view) {
    view = mergeWithDefaults(raw, defaults);
    byDefaults.set(defaults, view);
  }
  return view;
}

function notify(key: string) {
  for (const listener of getEntry(key).listeners) listener();
}

/** Keeps only fields whose type matches the corresponding default field — same defensive shape as
    `useDeviceSettings.ts`'s own `mergeWithDefaults`, applied identically to a value loaded from
    `AsyncStorage` or one that arrived from the account. */
function mergeWithDefaults<T extends object>(parsed: unknown, defaults: T): T {
  if (typeof parsed !== 'object' || parsed === null) return defaults;
  const result = { ...defaults } as Record<string, unknown>;
  const defaultsRecord = defaults as Record<string, unknown>;
  for (const key of Object.keys(defaultsRecord)) {
    const value = (parsed as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const defaultValue = defaultsRecord[key];
    if (Array.isArray(defaultValue)) {
      if (Array.isArray(value)) result[key] = value;
    } else if (typeof value === typeof defaultValue) {
      result[key] = value;
    }
  }
  return result as T;
}

/** Reads this device's copy of `key` for the current mode — only applies if nothing (the server
    or a local edit) has claimed the entry by the time it resolves. */
function loadLocal(key: string) {
  const mode = currentStoreMode();
  const entry = getEntry(key);
  if (mode === 'loading' || entry.localLoaded || entry.localLoading) return;
  entry.localLoading = true;
  const gen = generation;
  AsyncStorage.getItem(scopedKey(key, mode))
    .then((raw) => {
      if (gen !== generation || !raw || entry.hasValue) return;
      try {
        const parsed = asRecord(JSON.parse(raw));
        if (!parsed) return;
        entry.value = parsed;
        entry.hasValue = true;
        notify(key);
      } catch {
        // corrupt local data — leave the entry unset, defaults still show
      }
    })
    .catch(() => {
      // storage unavailable — the in-memory/server path still works this session
    })
    .finally(() => {
      if (gen !== generation) return;
      entry.localLoading = false;
      entry.localLoaded = true;
      notify(key);
    });
}

// Signed in or out: everything held is the other copy's, so drop it and load the right one. An edit
// still waiting to reach the account is sent first rather than dropped with its timer.
onStoreModeChange((_next, was) => {
  generation++;
  for (const entry of entries.values()) {
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
      if (was === 'account' && entry.hasValue && entry.send) {
        entry.send(JSON.stringify(entry.value)).catch(() => {
          // offline at the exact moment of sign-out — the account's row stays one edit behind
        });
      }
    }
    entry.value = undefined;
    entry.hasValue = false;
    entry.localEdited = false;
    entry.serverApplied = false;
    entry.localLoaded = false;
    entry.localLoading = false;
  }
  for (const [key, entry] of entries) {
    if (entry.listeners.size) loadLocal(key);
    notify(key);
  }
});

export function useSyncedSettings<T extends object>(
  key: string,
  defaults: T,
): [T, (patch: Partial<T>) => void, boolean] {
  const mode = useStoreMode();
  const isAuthenticated = mode === 'account';

  // `useSyncExternalStore`, not a `useState`+`forceRender`+listener-effect combo — this entry's
  // value lives in a plain module-level mutable (`entries`, outside React's own state mechanism
  // entirely), and the React Compiler's auto-memoization doesn't recognize a value read that way
  // as a reactive source: a derived value computed from this hook's own return (e.g. `useMemo`
  // over `settings`, or an implicitly-memoized expression under the compiler) can silently freeze
  // at its first-computed result even while `forceRender` keeps this *component* re-rendering
  // correctly. Found and fixed after a parallel port of `useChordChartsLibrary.ts` hit exactly
  // this symptom for real (a derived count staying stale after an import, traced to the identical
  // pattern) — `useSyncExternalStore` is the React-blessed primitive for "a value that lives
  // outside React and can change between renders," which the compiler does correctly track.
  // Until the stores have switched to this render's sign-in state (an effect away), what's held
  // belongs to the other copy: show defaults rather than flash it.
  const settings = useSyncExternalStore(
    (callback) => {
      const entry = getEntry(key);
      entry.listeners.add(callback);
      return () => {
        entry.listeners.delete(callback);
      };
    },
    () =>
      currentStoreMode() === mode && getEntry(key).hasValue ? viewOf(getEntry(key).value as object, defaults) : defaults,
  );

  // `ready`: this device's saved copy has been read, so `settings` is the real value rather than
  // `defaults` standing in for it — screens show a loading spinner until then instead of
  // flashing default settings that then jump to the saved ones. Deliberately *not* waiting on the
  // account's copy too: that never arrives offline, and AsyncStorage already mirrors it.
  const ready = useSyncExternalStore(
    (callback) => {
      const entry = getEntry(key);
      entry.listeners.add(callback);
      return () => {
        entry.listeners.delete(callback);
      };
    },
    () => mode !== 'loading' && currentStoreMode() === mode && (getEntry(key).localLoaded || getEntry(key).hasValue),
  );

  // Load this device's copy once per key and sign-in state (`loadLocal` skips one already read).
  useEffect(() => {
    if (mode === currentStoreMode()) loadLocal(key);
  }, [key, mode]);

  const remote = useQuery(api.syncedSettings.get, isAuthenticated ? { key } : 'skip');
  const setRemote = useMutation(api.syncedSettings.set);

  useEffect(() => {
    getEntry(key).send = (value) => setRemote({ key, value });
  }, [key, setRemote]);

  // The one-time "apply the account's own value" step (the reset on sign-in/out is the
  // `onStoreModeChange` handler above).
  useEffect(() => {
    if (!isAuthenticated || currentStoreMode() !== 'account') return;
    if (remote === undefined) return; // still loading
    const entry = getEntry(key);
    if (entry.serverApplied) return;
    entry.serverApplied = true;
    if (!entry.localEdited && remote?.value) {
      try {
        const parsed = asRecord(JSON.parse(remote.value));
        if (parsed) {
          entry.value = parsed;
          entry.hasValue = true;
          notify(key);
          void AsyncStorage.setItem(scopedKey(key, 'account'), remote.value);
        }
      } catch {
        // corrupt server data — keep whatever's currently showing
      }
    }
  }, [isAuthenticated, remote, key]);

  function update(patch: Partial<T>) {
    // Before the stores have caught up with a sign-in or out, an edit would land in the wrong copy.
    if (mode === 'loading' || currentStoreMode() !== mode) return;
    const entry = getEntry(key);
    // Merged into the whole stored object, so fields other callers own are kept.
    const current = entry.hasValue ? (entry.value as Record<string, unknown>) : {};
    const next = { ...current, ...patch };
    entry.value = next;
    entry.hasValue = true;
    entry.localEdited = true;
    notify(key);
    void AsyncStorage.setItem(scopedKey(key, mode), JSON.stringify(next));

    if (isAuthenticated) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        entry.timer = null;
        setRemote({ key, value: JSON.stringify(getEntry(key).value) }).catch(() => {
          // offline, or the account write otherwise failed — the local edit already landed in
          // AsyncStorage above, so nothing is lost; it'll sync next time a write succeeds.
        });
      }, DEBOUNCE_MS);
    }
  }

  return [settings, update, ready];
}
