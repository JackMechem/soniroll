import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * A small store kept on this device (AsyncStorage) for things the website keeps in the browser
 * when signed out — Score Writer's scores, Rhythm Section's bass players — under the same key and
 * in the same shape as the website's localStorage copy. It's read once; every change goes through
 * `update`, which waits for that read and runs in order, so several quick edits never overwrite
 * each other.
 */
export function createLocalStore<T>(key: string, empty: T, parse: (raw: unknown) => T) {
  let value = empty;
  let loaded = false;
  let chain: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };

  function load(): Promise<void> {
    chain ??= AsyncStorage.getItem(key)
      .then((raw) => {
        if (raw) value = parse(JSON.parse(raw));
      })
      .catch(() => {
        // Unreadable: start empty (the next change writes a good copy).
      })
      .finally(() => {
        loaded = true;
        notify();
      });
    return chain;
  }

  /** Changes the stored value (after it has been read), then saves it. */
  function update(change: (current: T) => T): Promise<void> {
    chain = load().then(() => {
      value = change(value);
      notify();
      return AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {
        // Full or blocked storage: it stays in memory for this session.
      });
    });
    return chain;
  }

  /** The value now, once read (for one-off reads outside React). */
  async function read(): Promise<T> {
    await load();
    return value;
  }

  /** The value and whether it has been read yet. */
  function useStore(): { value: T; loaded: boolean } {
    useEffect(() => {
      void load();
    }, []);
    const v = useSyncExternalStore(subscribe, () => value);
    const l = useSyncExternalStore(subscribe, () => loaded);
    return { value: v, loaded: l };
  }

  return { update, read, useStore };
}
