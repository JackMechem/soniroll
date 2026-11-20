import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { getSyncedValue, isSyncedSeeded, resetSynced, seedSynced, setSyncedValue, subscribeSynced } from "./syncedStore";

/**
 * One JSON array kept under `key`: in the account (`syncedSettings`, through `syncedStore`'s
 * debounced, race-safe cache) when signed in, in this browser's localStorage (same key) when signed
 * out — no merge between the two, like every synced hook. The same shape `useSyncedTunes` uses,
 * for lists added later: the Library's tune list (`LIBRARY_TUNES_KEY`) and the chart ids already
 * linked to tunes (`CHARTS_LINKED_KEY`). Returns `[list, set, ready]`; `ready` is false until the
 * account's value has loaded (never build a write from the empty list before then).
 */
export function useSyncedList<T>(key: string): [T[], (update: T[] | ((prev: T[]) => T[])) => void, boolean] {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const local = useSyncExternalStore(
    useCallback((listener) => subscribeLocal(key, listener), [key]),
    useCallback(() => readLocal<T>(key), [key]),
    () => EMPTY as T[],
  );
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const remote = useQuery(api.syncedSettings.get, isAuthenticated ? { key } : "skip");
  const setRemote = useMutation(api.syncedSettings.set);
  const synced = useSyncExternalStore(
    useCallback((listener) => subscribeSynced(key, listener), [key]),
    useCallback(() => getSyncedValue(key, EMPTY as T[]), [key]),
    () => EMPTY as T[],
  );
  const seeded = useSyncExternalStore(
    useCallback((listener) => subscribeSynced(key, listener), [key]),
    useCallback(() => isSyncedSeeded(key), [key]),
    () => false,
  );

  useEffect(() => {
    if (!isAuthenticated) {
      resetSynced<T[]>(key, (value) => {
        setRemote({ key, value: JSON.stringify(value) });
      });
      return;
    }
    if (remote !== undefined) seedSynced(key, remote?.value ? parseList<T>(remote.value) : (EMPTY as T[]));
  }, [isAuthenticated, remote, setRemote, key]);

  const set = useCallback(
    (update: T[] | ((prev: T[]) => T[])) => {
      if (isAuthenticated) {
        // Nothing to build on until the account's list has loaded — writing now would replace it.
        if (!isSyncedSeeded(key)) return;
        const prev = getSyncedValue(key, EMPTY as T[]);
        const next = typeof update === "function" ? update(prev) : update;
        setSyncedValue(key, next, (value) => {
          setRemote({ key, value: JSON.stringify(value) });
        });
        return;
      }
      const prev = readLocal<T>(key);
      writeLocal(key, typeof update === "function" ? update(prev) : update);
    },
    [isAuthenticated, setRemote, key],
  );

  const ready = !isLoading && (isAuthenticated ? seeded : mounted);
  return [isAuthenticated ? synced : local, set, ready];
}

/** The list as it is right now (outside render, e.g. after an await). */
export function readSyncedList<T>(key: string, signedIn: boolean): T[] {
  return signedIn ? getSyncedValue(key, EMPTY as T[]) : readLocal<T>(key);
}

const EMPTY: unknown[] = [];
const noopSubscribe = () => () => {};

function parseList<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (EMPTY as T[]);
  } catch {
    return EMPTY as T[];
  }
}

// ---- signed out: localStorage, one cached snapshot per key ----

const localCache = new Map<string, unknown[]>();
const localListeners = new Map<string, Set<() => void>>();

function subscribeLocal(key: string, listener: () => void) {
  let set = localListeners.get(key);
  if (!set) localListeners.set(key, (set = new Set()));
  set.add(listener);
  return () => set.delete(listener);
}

function readLocal<T>(key: string): T[] {
  if (typeof window === "undefined") return EMPTY as T[];
  let value = localCache.get(key);
  if (!value) {
    try {
      value = parseList<T>(window.localStorage.getItem(key) ?? "[]");
    } catch {
      value = EMPTY;
    }
    localCache.set(key, value);
  }
  return value as T[];
}

function writeLocal<T>(key: string, value: T[]) {
  localCache.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the list still works for this visit.
  }
  for (const listener of localListeners.get(key) ?? []) listener();
}
