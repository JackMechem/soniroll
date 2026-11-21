import { api } from '@jam-practice/convex/_generated/api';
import type { Tune } from '@jam-practice/core/types';
import { LIBRARY_TUNES_KEY } from '@jam-practice/core/tuneLibrary';
import { TUNES_TO_LEARN_KEY } from '@jam-practice/core/tunesToLearn';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * The tune-list sibling of `useSyncedSettings.ts` — same offline-first precedence (AsyncStorage's
 * own cached value shows immediately; the account's own synced list overrides it once, the first
 * time it arrives; a real local edit wins from then on and blocks any later server overwrite this
 * session), just specialized for a plain `Tune[]` instead of a settings object merged against
 * defaults. `createSyncedTuneListHook` is the one engine behind both exports below — `"tunes"` and
 * `"jam-practice-tunes-to-learn"` are the exact same fixed `syncedSettings` keys
 * `apps/web/lib/useSyncedTunes.ts`/`useTunesToLearn.ts` already use, so a tune added here shows up
 * in the web app's own lists too (and vice versa), not a second, mobile-only copy of either.
 */

const DEBOUNCE_MS = 600;
const EMPTY: Tune[] = [];

type Entry = {
  value: Tune[];
  hasValue: boolean;
  localEdited: boolean;
  serverApplied: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  localLoaded: boolean;
  listeners: Set<() => void>;
};

function makeEntry(): Entry {
  return {
    value: EMPTY,
    hasValue: false,
    localEdited: false,
    serverApplied: false,
    timer: null,
    localLoaded: false,
    listeners: new Set(),
  };
}

function parseTunes(raw: string): Tune[] | null {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param accountOnly Matching `useTunesToLearn`'s own web-side restriction: this list only ever
 *   exists because of something done while signed in (bookmarking a tune from someone else's
 *   public profile — there's no "device-local" version of it the way a plain tune list has), so a
 *   signed-out device shows an empty, read-only list rather than whatever a *previous* signed-in
 *   session happened to cache locally. `false` (the plain Tunes list) behaves like every other
 *   synced-settings hook here: AsyncStorage's own cache still shows signed out.
 * @param waitForAccount Signed in, `ready` waits for the account's copy (like `accountOnly`), for a
 *   list this phone may never have cached (the Library list is made on the website) — so a write
 *   isn't built from an empty list and sent over the account's.
 */
function createSyncedTuneListHook(key: string, accountOnly: boolean, waitForAccount = false) {
  const entry = makeEntry();

  function notify() {
    for (const listener of entry.listeners) listener();
  }

  function useHook(): [Tune[], (update: Tune[] | ((prev: Tune[]) => Tune[])) => void, boolean] {
    const { isAuthenticated } = useConvexAuth();
    const wasAuthenticatedRef = useRef(isAuthenticated);

    // `useSyncExternalStore`, not `useState`+`forceRender` — see `useSyncedSettings.ts`'s own
    // comment on this exact pattern for why: `entry.value` lives outside React's state mechanism
    // entirely, and the React Compiler's auto-memoization doesn't reliably track a value read that
    // way as reactive, which can leave a derived value (e.g. a tune count computed from this
    // hook's return) frozen stale even while the component itself keeps re-rendering correctly.
    const value = useSyncExternalStore(
      (callback) => {
        entry.listeners.add(callback);
        return () => {
          entry.listeners.delete(callback);
        };
      },
      () => (accountOnly && !isAuthenticated ? EMPTY : entry.hasValue ? entry.value : EMPTY),
    );

    useEffect(() => {
      if (accountOnly) return; // nothing device-local to load — see the doc comment above.
      if (entry.localLoaded) return;
      let cancelled = false;
      AsyncStorage.getItem(key)
        .then((raw) => {
          if (cancelled || !raw || entry.hasValue) return;
          const parsed = parseTunes(raw);
          if (parsed) {
            entry.value = parsed;
            entry.hasValue = true;
            notify();
          }
        })
        .catch(() => {
          // storage unavailable — the in-memory/server path still works this session
        })
        .finally(() => {
          if (!entry.localLoaded) {
            entry.localLoaded = true;
            notify();
          }
        });
      return () => {
        cancelled = true;
      };
    }, []);

    const remote = useQuery(api.syncedSettings.get, isAuthenticated ? { key } : 'skip');

    // `ready`: the list shown is the real one, not an empty placeholder. The plain list is ready
    // once this device's saved copy is read (offline-first); the account-only list has no device
    // copy, so it waits for the account — but gives up after a moment so an offline device shows
    // an empty list rather than a spinner forever.
    const localLoaded = useSyncExternalStore(
      (callback) => {
        entry.listeners.add(callback);
        return () => {
          entry.listeners.delete(callback);
        };
      },
      () => entry.localLoaded || entry.hasValue,
    );
    const [gaveUp, setGaveUp] = useState(false);
    useEffect(() => {
      if (!accountOnly && !waitForAccount) return;
      const t = setTimeout(() => setGaveUp(true), 2500);
      return () => clearTimeout(t);
    }, []);
    const ready = accountOnly
      ? !isAuthenticated || remote !== undefined || entry.hasValue || gaveUp
      : waitForAccount && isAuthenticated
        ? localLoaded && (remote !== undefined || gaveUp)
        : localLoaded;
    const setRemote = useMutation(api.syncedSettings.set);

    useEffect(() => {
      if (!isAuthenticated) {
        if (wasAuthenticatedRef.current) {
          if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
            if (entry.hasValue) {
              setRemote({ key, value: JSON.stringify(entry.value) }).catch(() => {
                // offline right at sign-out — the account's row just stays one edit behind
              });
            }
          }
          entry.localEdited = false;
          entry.serverApplied = false;
          if (accountOnly) {
            entry.value = EMPTY;
            entry.hasValue = false;
            notify();
          }
        }
        wasAuthenticatedRef.current = false;
        return;
      }
      wasAuthenticatedRef.current = true;

      if (remote === undefined) return;
      if (entry.serverApplied) return;
      entry.serverApplied = true;
      if (!entry.localEdited && remote?.value) {
        const parsed = parseTunes(remote.value);
        if (parsed) {
          entry.value = parsed;
          entry.hasValue = true;
          notify();
          if (!accountOnly) void AsyncStorage.setItem(key, JSON.stringify(parsed));
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, remote]);

    function setTunes(update: Tune[] | ((prev: Tune[]) => Tune[])) {
      if (accountOnly && !isAuthenticated) return; // nothing to write while signed out.
      const prev = entry.hasValue ? entry.value : EMPTY;
      const next = typeof update === 'function' ? update(prev) : update;
      entry.value = next;
      entry.hasValue = true;
      entry.localEdited = true;
      notify();
      if (!accountOnly) void AsyncStorage.setItem(key, JSON.stringify(next));

      if (isAuthenticated) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          entry.timer = null;
          setRemote({ key, value: JSON.stringify(entry.value) }).catch(() => {
            // offline, or the write otherwise failed — already safe in AsyncStorage above
          });
        }, DEBOUNCE_MS);
      }
    }

    return [value, setTunes, ready];
  }

  /** The list right now, outside React (for writes that combine several lists, like linking
      charts), and whether it's the account's copy yet (`synced`; always true signed out). */
  function read(isAuthenticated: boolean): { tunes: Tune[]; synced: boolean } {
    if (accountOnly && !isAuthenticated) return { tunes: EMPTY, synced: true };
    return { tunes: entry.hasValue ? entry.value : EMPTY, synced: isAuthenticated ? entry.serverApplied : entry.localLoaded || accountOnly };
  }

  return Object.assign(useHook, { read });
}

/** Jam Practice's own tune list — the same `"tunes"` key, same data, as the web app's. */
export const useSyncedTunes = createSyncedTuneListHook('tunes', false);

/** A personal "Tunes to Learn" bookmark list — see `createSyncedTuneListHook`'s own `accountOnly`
    doc comment for why this one has no signed-out local fallback. */
export const useTunesToLearn = createSyncedTuneListHook(TUNES_TO_LEARN_KEY, true);

/** The Library list: tunes that came in with chord charts and aren't sorted into Tunes I Know or
    Tunes to Learn yet (the website makes most of them when it links charts to tunes). The same
    `jam-practice-library-tunes` key the website uses; on this phone signed out too. */
export const useLibraryTunes = createSyncedTuneListHook(LIBRARY_TUNES_KEY, false, true);
