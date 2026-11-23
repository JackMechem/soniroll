import { api } from '@jam-practice/convex/_generated/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useSyncExternalStore } from 'react';

import { onFlushAccountWrites, sendToAccount } from './accountScope';

/**
 * A synced document (one `syncedSettings` row, like the website's `useSyncedSettings`) that keeps
 * **following the account** while the app is open — for the Shed Log and the tools' usage log,
 * which the website and the phone both change all day. `lib/useSyncedSettings.ts` takes the
 * account's value once per session (fine for a tool's options); here a phone left open for days
 * would otherwise go stale and then write that stale copy back over the website's practice.
 *
 * - **Signed in:** the account's copy, taken whenever it changes and nothing of ours is waiting to
 *   be sent (a local edit always wins over a value that arrives while it's pending). Edits are sent
 *   600 ms after the last one, like the website. A copy is kept on the phone (`<key>:account`), so
 *   the app opens with your log offline; Convex queues the writes until it's back online. Changes
 *   made before the account's copy has arrived this session (on that kept copy) are replayed onto
 *   the account's copy when it comes, so a stale phone copy never overwrites what the website did
 *   meanwhile. That copy is dropped on sign-out, so another account never sees it.
 * - **Signed out:** this phone only (`<key>`, as the website keeps it in the browser). Nothing is
 *   merged when you sign in — the account's copy simply takes over, as on the website.
 *
 * `ready` is false until the right copy has loaded; writes before then are ignored, so nothing is
 * ever written over an empty default.
 */

type Mode = 'loading' | 'device' | 'account';
type Doc = Record<string, unknown>;
export type LiveSnapshot = { value: Doc; ready: boolean };

const DEBOUNCE_MS = 600;
const EMPTY: Doc = {};

export type LiveDoc = ReturnType<typeof createLiveDoc>;

export function createLiveDoc(key: string) {
  const accountKey = `${key}:account`;
  let mode: Mode = 'loading';
  // Whose copy is held. It stays through `loading`: when the app is reopened after Back closed it,
  // the sign-in is read again and it's normally the same copy, kept (with any edit still waiting).
  let settled: 'device' | 'account' | null = null;
  let value: Doc | null = null;
  let json: string | null = null;
  let snapshot: LiveSnapshot = { value: EMPTY, ready: false };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = 0;
  // Signed in: whether the account's copy has arrived this session, and the changes made before
  // it did (on the copy kept on the phone), to replay onto it.
  let remoteSeen = false;
  let replay: ((prev: Doc) => Doc)[] = [];
  let sender: ((json: string) => Promise<unknown>) | null = null;
  // Which load is current: a slow AsyncStorage read from before a sign-in/out is ignored.
  let generation = 0;
  const listeners = new Set<() => void>();

  function emit() {
    snapshot = { value: value ?? EMPTY, ready: value !== null && mode !== 'loading' };
    for (const l of listeners) l();
  }

  function parse(raw: string | null | undefined): Doc | null {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Doc) : null;
    } catch {
      return null;
    }
  }

  function storageKey() {
    return settled === 'account' ? accountKey : key;
  }

  function saveLocal() {
    if (saveTimer) clearTimeout(saveTimer);
    const k = storageKey();
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (json !== null) void AsyncStorage.setItem(k, json).catch(() => {});
    }, 300);
  }

  function send() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (settled !== 'account' || json === null || !sender) return;
    const body = json;
    const s = sender;
    inFlight++;
    // Held until the backend has the sign-in (`accountScope.ts`); offline or refused, the copy on
    // the phone still has it and the next edit tries again.
    void sendToAccount(key, () => s(body)).finally(() => {
      inFlight--;
    });
  }

  // Signing out (or the app going to the background) sends an edit still waiting first, while the
  // account still takes it, and writes the phone's copy now rather than in 300 ms.
  onFlushAccountWrites(() => {
    if (timer) send();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (json !== null) void AsyncStorage.setItem(storageKey(), json).catch(() => {});
    }
  });

  /** Signed in, out, or still finding out. Signing in or out drops what's held and loads the right
      copy; `loading` and back to the same copy keeps it. */
  function setMode(next: Mode) {
    if (next === mode) return;
    mode = next;
    if (next === 'loading' || next === settled) {
      emit();
      return;
    }
    const was = settled;
    settled = next;
    // Too late to send an edit still waiting: signing out already did (`flushAccountWrites`).
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    value = null;
    json = null;
    remoteSeen = false;
    replay = [];
    generation++;
    if (was === 'account' && next === 'device') void AsyncStorage.removeItem(accountKey).catch(() => {});
    emit();
    const gen = generation;
    AsyncStorage.getItem(next === 'account' ? accountKey : key)
      .then((raw) => {
        if (gen !== generation || value !== null) return;
        const parsed = parse(raw);
        if (parsed) {
          value = parsed;
          json = raw;
          emit();
        } else if (next === 'device') {
          value = {};
          json = '{}';
          emit();
        }
      })
      .catch(() => {
        if (gen !== generation || value !== null || next !== 'device') return;
        value = {};
        json = '{}';
        emit();
      });
  }

  /** The account's copy arrived or changed (`null`: there's none yet). */
  function adoptRemote(raw: string | null) {
    if (mode !== 'account') return;
    if (!remoteSeen) {
      remoteSeen = true;
      if (replay.length) {
        // Changes made on the phone's kept copy before this arrived, made again on the real one.
        value = replay.reduce((v, fn) => fn(v), parse(raw) ?? {});
        replay = [];
        json = JSON.stringify(value);
        emit();
        saveLocal();
        if (timer) clearTimeout(timer);
        timer = setTimeout(send, DEBOUNCE_MS);
        return;
      }
    }
    // Something of ours is on its way: it wins (it's what the account will hold next).
    if (timer || inFlight > 0) return;
    const text = raw ?? '{}';
    if (text === json) return;
    const parsed = parse(raw) ?? {};
    value = parsed;
    json = text;
    emit();
    saveLocal();
  }

  /** Changes the document (ignored until it's loaded). */
  function write(fn: (prev: Doc) => Doc) {
    if (value === null || mode === 'loading') return;
    value = fn(value);
    json = JSON.stringify(value);
    emit();
    saveLocal();
    if (mode === 'account' && !remoteSeen) {
      replay.push(fn);
      return;
    }
    if (mode === 'account') {
      if (timer) clearTimeout(timer);
      timer = setTimeout(send, DEBOUNCE_MS);
    }
  }

  return {
    key,
    setMode,
    adoptRemote,
    write,
    setSender(fn: (json: string) => Promise<unknown>) {
      sender = fn;
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    getSnapshot: () => snapshot,
    /** The current value, outside React (null until loaded). */
    current: () => (snapshot.ready ? snapshot.value : null),
  };
}

/** Keeps `doc` in step with the sign-in state and the account; returns its value and `ready`. */
export function useLiveDoc(doc: LiveDoc): LiveSnapshot {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const remote = useQuery(api.syncedSettings.get, isAuthenticated ? { key: doc.key } : 'skip');
  const setRemote = useMutation(api.syncedSettings.set);
  useEffect(() => {
    doc.setMode(isLoading ? 'loading' : isAuthenticated ? 'account' : 'device');
  }, [doc, isLoading, isAuthenticated]);
  useEffect(() => {
    doc.setSender((value) => setRemote({ key: doc.key, value }));
  }, [doc, setRemote]);
  useEffect(() => {
    if (isAuthenticated && remote !== undefined) doc.adoptRemote(remote?.value ?? null);
  }, [doc, isAuthenticated, remote]);
  return useSyncExternalStore(doc.subscribe, doc.getSnapshot);
}
