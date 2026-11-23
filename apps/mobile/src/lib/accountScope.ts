import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useConvexAuth as useBackendAuth } from 'convex/react';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * Which copy the phone's stores read: the website's rule is "no merge — signing in switches which
 * store is read", and here it also decides where the phone keeps its offline copy.
 *
 * - `device`: signed out. Each store's plain key (`<key>`), the phone's own data.
 * - `account`: signed in. The account's copy, kept on the phone as `<key>:account` so the app opens
 *   with it offline. Every `:account` copy is deleted whenever the app finds itself signed out, so
 *   the next account to sign in on this phone starts from its own data, never the last one's.
 * - `loading`: the sign-in token is still being read (a moment at launch, and again when the app is
 *   reopened after Back closed it: the JS stays alive, the screens mount again). Stores show nothing
 *   yet, and keep what they hold: it's the same copy as before unless the sign-in has changed.
 *
 * Before 2026-11-20 the synced settings, tune lists and recents kept one copy for everyone, so a new
 * account signed in on this phone showed the previous account's favorites, recents and tool
 * options (and could write them into the new account). `migrateOldCopies` sorts out what that
 * version left behind, once.
 */
export type StoreMode = 'loading' | 'device' | 'account';

const ACCOUNT_SUFFIX = ':account';

/** The mode the stores are in (what they read and write). */
let current: StoreMode = 'loading';
/** Whose copy the stores hold: stays put through `loading`, so a reopened app keeps its data. */
let settled: 'device' | 'account' | null = null;
/** The mode the sign-in state asks for, applied once the old copies have been sorted out. */
let wanted: StoreMode = 'loading';
const listeners = new Set<(next: StoreMode, was: StoreMode) => void>();
const modeListeners = new Set<() => void>();

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

/** Runs `fn` when the stores switch copies (signed in or out): they drop what they hold and load
    the right copy. Not called for `loading` and back to the same copy. */
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

// ---- The one-time move of copies saved before the stores were kept apart ----

const MIGRATION_FLAG = 'jam-practice-store-scope-v1';

/** Every key the scoped stores (`useSyncedSettings`, the tune lists, the recents) had on
    2026-11-20, when they started keeping the account's copy apart. Before then, a phone signed in
    wrote the account's data to these plain keys. Fixed on purpose: a key added later never held
    anyone else's data. */
const OLD_SHARED_KEYS = [
  // useSyncedSettings
  'jam-practice-site-settings',
  'jam-practice-shed-notes',
  'jam-practice-favorites',
  'jam-practice-setlists',
  'jam-practice-ear-training-path',
  'jam-practice-timer-sound-settings',
  'jam-practice-practice-log-view',
  'jam-practice-settings-v2',
  'jam-practice-metronome',
  'jam-practice-tuner',
  'jam-practice-recorder-take',
  'jam-practice-slow-downer',
  'jam-practice-bass-genius',
  'jam-practice-drum-generator',
  'jam-practice-guess-the-chord',
  'jam-practice-guess-the-interval',
  'jam-practice-guess-the-progression',
  'jam-practice-find-the-root',
  'jam-practice-note-trainer',
  'jam-practice-scale-trainer',
  'jam-practice-interval-trainer',
  'jam-practice-tempo-trainer',
  'jam-practice-metric-modulation',
  'jam-practice-stick-control',
  'jam-practice-syncopation',
  'jam-practice-time-test',
  'jam-practice-time-test-history',
  // the tune lists (Tunes to Learn was never kept on the phone)
  'tunes',
  'jam-practice-library-tunes',
  // the recents
  'jam-practice-tool-recents',
  'jam-practice-chord-charts-recent',
];
/** Signed in, Practice Timer sessions were mirrored here from the account (which still has them);
    they aren't kept on the phone for an account any more. */
const OLD_MIRROR_KEYS = ['jam-practice-timer-sessions'];

let migration: 'pending' | 'running' | 'done' = 'pending';

/**
 * Run once, the first time this version learns whether it's signed in:
 * - **Signed in:** the plain keys hold this account's data (perhaps with edits that haven't reached
 *   it yet), so each moves to `<key>:account` (unless that's already there, which is newer), and
 *   the plain copies go. The account's own copy still wins once it arrives, as always.
 * - **Signed out:** the plain keys are the phone's own; nothing moves.
 * Safe to interrupt: copies are written before the plain keys are removed, an existing account copy
 * is never overwritten, and the flag is set last, so a second run just finishes the job.
 */
async function migrateOldCopies(signedIn: boolean): Promise<void> {
  try {
    if (await AsyncStorage.getItem(MIGRATION_FLAG)) return;
    if (signedIn) {
      const plain = await AsyncStorage.multiGet(OLD_SHARED_KEYS);
      const accounts = await AsyncStorage.multiGet(OLD_SHARED_KEYS.map((k) => k + ACCOUNT_SUFFIX));
      const haveAccount = new Set(accounts.filter(([, v]) => v != null).map(([k]) => k));
      const moves: [string, string][] = [];
      for (const [k, v] of plain) {
        if (v != null && !haveAccount.has(k + ACCOUNT_SUFFIX)) moves.push([k + ACCOUNT_SUFFIX, v]);
      }
      if (moves.length) await AsyncStorage.multiSet(moves);
      await AsyncStorage.multiRemove([...OLD_SHARED_KEYS, ...OLD_MIRROR_KEYS]);
    }
    await AsyncStorage.setItem(MIGRATION_FLAG, '1');
  } catch {
    // storage unavailable: try again next launch (the flag isn't set)
  }
}

/** Moves every store to `next` (a no-op when it's already there). The first time it isn't
    `loading`, the old copies are sorted out first; the stores stay in `loading` meanwhile. */
export function setStoreMode(next: StoreMode) {
  wanted = next;
  if (migration === 'done' || next === 'loading') {
    if (migration === 'done') applyMode(next);
    return;
  }
  if (migration === 'running') return;
  migration = 'running';
  void migrateOldCopies(next === 'account').finally(() => {
    migration = 'done';
    applyMode(wanted);
  });
}

const signOutListeners = new Set<() => void>();

/** Runs `fn` when the phone goes from an account to signed out (Sign out, a deleted account, a
    sign-in that ended) — not at launch signed out. */
export function onSignedOut(fn: () => void): () => void {
  signOutListeners.add(fn);
  return () => {
    signOutListeners.delete(fn);
  };
}

function applyMode(next: StoreMode) {
  if (next === current) return;
  const was = current;
  current = next;
  const signedOut = next === 'device' && settled === 'account';
  if (next === 'device') {
    void forgetAccountCopies();
    dropHeld();
  }
  if (next !== 'loading' && next !== settled) {
    settled = next;
    for (const fn of listeners) fn(next, was);
  }
  if (next === 'account' && accountReady) sendHeld();
  for (const fn of modeListeners) fn();
  if (signedOut) for (const fn of signOutListeners) fn();
}

function subscribeMode(fn: () => void) {
  modeListeners.add(fn);
  return () => {
    modeListeners.delete(fn);
  };
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

/** The mode the stores are actually in, as React state: it can lag `useStoreMode()` by a moment
    (the one-time move above), and a store's effects that wait for it re-run when it catches up. */
export function useAppliedStoreMode(): StoreMode {
  return useSyncExternalStore(subscribeMode, currentStoreMode);
}

// ---- Writes to the account ----

/**
 * The account only takes a write once the backend has accepted this session's sign-in. The stores
 * know you're signed in sooner (the token on the phone), and when the app is reopened after Back
 * closed it, the old screens' sign-in is gone before the new ones' is back: a write sent in that
 * gap was refused ("Not signed in") and lost. So writes wait here until then (the newest per key),
 * and are dropped only if the phone signs out first. `useAccountWritesGate` (mounted once, in the
 * root layout) says when the backend has the sign-in.
 */
let accountReady = false;
type Held = { send: () => Promise<unknown>; done: () => void };
const held = new Map<string, Held>();
const flushers = new Set<() => void>();

/** Sends one store's value to the account now, or once the backend has the sign-in. Resolves when
    it's been sent (or replaced by a newer value for the same key, or dropped at sign-out). */
export function sendToAccount(key: string, send: () => Promise<unknown>): Promise<void> {
  if (settled === 'device') return Promise.resolve();
  if (accountReady && current === 'account') {
    return send().then(
      () => {},
      () => {
        // offline or refused: the copy on the phone still has it; the next edit tries again
      },
    );
  }
  return new Promise((resolve) => {
    held.get(key)?.done();
    held.set(key, { send, done: resolve });
  });
}

function dropHeld() {
  for (const h of held.values()) h.done();
  held.clear();
}

function sendHeld() {
  const all = [...held.values()];
  held.clear();
  for (const h of all) h.send().then(h.done, h.done);
}

/** A store's "send what's waiting now" (its debounced edits), for `flushAccountWrites`. */
export function onFlushAccountWrites(fn: () => void): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

/** Sends every edit still waiting for its debounce. Call it just before signing out, while the
    account still takes writes. Also runs when the app goes to the background (below): Android may
    close it from there before the 600 ms are up, and the edit would never reach the account (the
    website lost edits the same way when a page was left inside that window). */
export function flushAccountWrites() {
  for (const fn of flushers) fn();
}

AppState.addEventListener('change', (state) => {
  if (state !== 'active') flushAccountWrites();
});

/** Mounted once, in the root layout: tells the writes above when the backend has the sign-in. */
export function useAccountWritesGate() {
  const { isAuthenticated } = useBackendAuth();
  useEffect(() => {
    accountReady = isAuthenticated;
    if (isAuthenticated && current === 'account') sendHeld();
    return () => {
      accountReady = false;
    };
  }, [isAuthenticated]);
}
