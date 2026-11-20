import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { Tune } from "./types";
import { TUNES_TO_LEARN_KEY } from "./tunesToLearn";
import { getSyncedValue, isSyncedSeeded, resetSynced, seedSynced, setSyncedValue, subscribeSynced } from "./syncedStore";

const EMPTY: Tune[] = [];

/**
 * A personal "Tunes to Learn" list — a bookmark list of tunes seen on other people's public
 * profiles (`components/PublicTuneList.tsx`'s "Learn" action), kept separate from the owner's own
 * Jam Practice tune list (`lib/useSyncedTunes.ts`) even though both are shaped the same
 * (`Tune[]`). Rides the same generic `syncedSettings` table under its own fixed key
 * (`TUNES_TO_LEARN_KEY`) and the same `lib/syncedStore.ts` debounce/stale-closure-race fix
 * `useSyncedTunes` uses — but, unlike that hook, this is **account-only**, the same call Jack made
 * for Favorites (`lib/useFavorites.ts`): there's no signed-out local-storage fallback, since the
 * only way to ever add something to this list is visiting another account's public profile, which
 * already requires being signed in. Signed out, this is always an empty, read-only list rather
 * than a second local store to keep separate from Jam Practice's own (`lib/tunesStore.ts` is
 * hardcoded to a single localStorage key already used for that list; reusing it here under a
 * different in-memory key would still be a second real store to maintain for a feature that isn't
 * reachable signed out anyway).
 */
export function useTunesToLearn(): [Tune[], (update: Tune[] | ((prev: Tune[]) => Tune[])) => void, boolean] {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const remote = useQuery(
    api.syncedSettings.get,
    isAuthenticated ? { key: TUNES_TO_LEARN_KEY } : "skip",
  );
  const setRemote = useMutation(api.syncedSettings.set);

  const synced = useSyncExternalStore(
    useCallback((listener) => subscribeSynced(TUNES_TO_LEARN_KEY, listener), []),
    useCallback(() => getSyncedValue(TUNES_TO_LEARN_KEY, EMPTY), []),
    useCallback(() => EMPTY, []),
  );

  const seeded = useSyncExternalStore(
    useCallback((listener) => subscribeSynced(TUNES_TO_LEARN_KEY, listener), []),
    useCallback(() => isSyncedSeeded(TUNES_TO_LEARN_KEY), []),
    useCallback(() => false, []),
  );

  useEffect(() => {
    if (!isAuthenticated) {
      // Flushes a not-yet-fired debounced write (a real edit made just before signing out)
      // before clearing the cache, same as `useSyncedTunes` — see `resetSynced`'s own comment.
      resetSynced<Tune[]>(TUNES_TO_LEARN_KEY, (value) => {
        setRemote({ key: TUNES_TO_LEARN_KEY, value: JSON.stringify(value) });
      });
      return;
    }
    if (remote !== undefined) {
      seedSynced(TUNES_TO_LEARN_KEY, remote?.value ? safeParseTunes(remote.value) : EMPTY);
    }
  }, [isAuthenticated, remote, setRemote]);

  const setTunesToLearn = useCallback(
    (update: Tune[] | ((prev: Tune[]) => Tune[])) => {
      if (!isAuthenticated) return; // account-only — nothing to write while signed out.
      const prev = getSyncedValue(TUNES_TO_LEARN_KEY, EMPTY);
      const next = typeof update === "function" ? update(prev) : update;
      setSyncedValue(TUNES_TO_LEARN_KEY, next, (value) => {
        setRemote({ key: TUNES_TO_LEARN_KEY, value: JSON.stringify(value) });
      });
    },
    [isAuthenticated, setRemote],
  );

  // Signed out there's no list to load (it's account-only), so it's ready at once.
  return [isAuthenticated ? synced : EMPTY, setTunesToLearn, !isLoading && (!isAuthenticated || seeded)];
}

/** Tunes to Learn as they are right now (outside render). Empty signed out. */
export function readTunesToLearn(signedIn: boolean): Tune[] {
  return signedIn ? getSyncedValue(TUNES_TO_LEARN_KEY, EMPTY) : EMPTY;
}

function safeParseTunes(raw: string): Tune[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}
