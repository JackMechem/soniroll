import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { Tune } from "./types";
import { getServerSnapshot, getSnapshot, setTunes as setLocalTunes, subscribe } from "./tunesStore";
import { getSyncedValue, isSyncedSeeded, resetSynced, seedSynced, setSyncedValue, subscribeSynced } from "./syncedStore";

/** The fixed `syncedSettings` key Jam Practice's whole tune list syncs under — not itself a
    `usePersistedSettings` object (it's `lib/tunesStore.ts`'s own hand-rolled external store), but
    the exact same "one JSON blob per key" shape `useSyncedSettings` uses fits it too, so it rides
    the same generic table rather than needing one of its own. */
const TUNES_KEY = "tunes";
const EMPTY: Tune[] = [];

/**
 * Drop-in replacement for `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` +
 * `setTunes` (`lib/tunesStore.ts`) — same `[tunes, setTunes]` shape, so every one of this store's
 * four call sites (`JamPractice.tsx`, `TunesPanel.tsx`, `TunesManager.tsx`,
 * `StandardsPicker.tsx`) swaps to this with no other change. Signed out: pure passthrough to
 * `tunesStore.ts`, and the Convex query is skipped entirely rather than subscribed-and-ignored.
 * Signed in: reads/writes through `lib/syncedStore.ts`'s debounced in-memory cache — fixes a real
 * bug the first version had, where adding several tunes quickly (e.g. multiple standards in a
 * row) each read the same stale snapshot and silently dropped all but the last addition; see that
 * file for the full explanation. Same no-merge rule as `useSyncedSettings`/`usePracticeSessions`
 * throughout — signing in stops consulting local storage entirely, it doesn't merge it.
 */
export function useSyncedTunes(): [Tune[], (update: Tune[] | ((prev: Tune[]) => Tune[])) => void, boolean] {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const localTunes = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const remote = useQuery(api.syncedSettings.get, isAuthenticated ? { key: TUNES_KEY } : "skip");
  const setRemote = useMutation(api.syncedSettings.set);

  const synced = useSyncExternalStore(
    useCallback((listener) => subscribeSynced(TUNES_KEY, listener), []),
    useCallback(() => getSyncedValue(TUNES_KEY, EMPTY), []),
    useCallback(() => EMPTY, []),
  );

  // Loaded: signed in, once the account's list has arrived; signed out, once on the client.
  const seeded = useSyncExternalStore(
    useCallback((listener) => subscribeSynced(TUNES_KEY, listener), []),
    useCallback(() => isSyncedSeeded(TUNES_KEY), []),
    useCallback(() => false, []),
  );
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    if (!isAuthenticated) {
      resetSynced<Tune[]>(TUNES_KEY, (value) => {
        setRemote({ key: TUNES_KEY, value: JSON.stringify(value) });
      });
      return;
    }
    if (remote !== undefined) {
      seedSynced(TUNES_KEY, remote?.value ? safeParseTunes(remote.value) : EMPTY);
    }
  }, [isAuthenticated, remote, setRemote]);

  const setTunes = useCallback(
    (update: Tune[] | ((prev: Tune[]) => Tune[])) => {
      if (isAuthenticated) {
        const prev = getSyncedValue(TUNES_KEY, EMPTY);
        const next = typeof update === "function" ? update(prev) : update;
        setSyncedValue(TUNES_KEY, next, (value) => {
          setRemote({ key: TUNES_KEY, value: JSON.stringify(value) });
        });
        return;
      }
      setLocalTunes(update);
    },
    [isAuthenticated, setRemote],
  );

  return [isAuthenticated ? synced : localTunes, setTunes, !isLoading && (isAuthenticated ? seeded : mounted)];
}

const noopSubscribe = () => () => {};

/** Tunes I Know as they are right now (outside render, e.g. after an await). */
export function readTunes(signedIn: boolean): Tune[] {
  return signedIn ? getSyncedValue(TUNES_KEY, EMPTY) : getSnapshot();
}

function safeParseTunes(raw: string): Tune[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}
