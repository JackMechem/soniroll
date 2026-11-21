import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useEffect } from 'react';

/**
 * Which copy the phone's stores read: the website's rule is "no merge — signing in switches which
 * store is read", and here it also decides where the phone keeps its offline copy.
 *
 * - `device`: signed out. Each store's plain key (`<key>`), the phone's own data.
 * - `account`: signed in. The account's copy, kept on the phone as `<key>:account` so the app opens
 *   with it offline. Every `:account` copy is deleted whenever the app finds itself signed out, so
 *   the next account to sign in on this phone starts from its own data, never the last one's.
 * - `loading`: the sign-in token is still being read at launch (a moment); stores show nothing yet.
 *
 * Before 2026-11-20 the synced settings, tune lists and recents kept one copy for everyone, so a new
 * account signed in on this phone showed the previous account's favorites, recents and tool
 * options (and could write them into the new account).
 */
export type StoreMode = 'loading' | 'device' | 'account';

const ACCOUNT_SUFFIX = ':account';

let current: StoreMode = 'loading';
const listeners = new Set<(next: StoreMode, was: StoreMode) => void>();

export function storeModeFor(auth: { isLoading: boolean; isAuthenticated: boolean }): StoreMode {
  return auth.isLoading ? 'loading' : auth.isAuthenticated ? 'account' : 'device';
}

/** The mode every store is in right now. */
export function currentStoreMode(): StoreMode {
  return current;
}

/** Where `key` lives on the phone in `mode`. */
export function scopedKey(key: string, mode: StoreMode = current): string {
  return mode === 'account' ? key + ACCOUNT_SUFFIX : key;
}

/** Runs `fn` after every switch (stores drop what they hold and load the right copy). */
export function onStoreModeChange(fn: (next: StoreMode, was: StoreMode) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Deletes every account copy kept on this phone (its synced settings, tune lists, recents, the
    Shed Log's copy). */
export async function forgetAccountCopies(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.endsWith(ACCOUNT_SUFFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    // storage unavailable: nothing to remove
  }
}

/** Moves every store to `next` (a no-op when it's already there). */
export function setStoreMode(next: StoreMode) {
  if (next === current) return;
  const was = current;
  current = next;
  if (next === 'device') void forgetAccountCopies();
  for (const fn of listeners) fn(next, was);
}

/** The mode for this render, and keeps the stores in step with it. Any hook reading a scoped store
    calls it, so whichever notices a sign-in or sign-out first switches them all. */
export function useStoreMode(): StoreMode {
  const auth = useConvexAuth();
  const mode = storeModeFor(auth);
  useEffect(() => {
    setStoreMode(mode);
  }, [mode]);
  return mode;
}
