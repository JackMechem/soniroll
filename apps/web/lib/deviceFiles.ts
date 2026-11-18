"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Files kept on this device (free accounts — see `packages/convex/lib/storage.ts`). The account
 * has a row for each (name, size, tune, `device: { key, label }`), so it's listed everywhere; the
 * data itself is here, in this browser's (or the desktop app's) IndexedDB, under `key`.
 *
 * Rows from Convex come with `url: null` for these; `useDeviceUrls` fills in a local `blob:` URL
 * when this device has the file, so players, previews and downloads work unchanged.
 */

/** Where a row's data lives when it isn't online. */
export type DeviceRef = { key: string; label: string };

const DB_NAME = "jam-practice-device-files";
const STORE = "files";

/** `owner`: the account it belongs to, so tidying up (`tidyDeviceFiles`) never touches another
    account's files on a shared computer. */
type Stored = { key: string; blob: Blob; name: string; savedAt: number; owner?: string };

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return wrap(run(db.transaction(STORE, mode).objectStore(STORE)));
}

/** True inside the desktop app (Tauri), where this storage is the app's own and never cleared
    with a browser's data. */
export function inDesktopApp() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** "Firefox on Linux", "soniroll desktop on macOS" — shown on other devices for files kept here. */
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Another device";
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  if (inDesktopApp()) return os ? `soniroll desktop on ${os}` : "soniroll desktop";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "A browser";
  return os ? `${browser} on ${os}` : browser;
}

/** Asks the browser to keep this site's files even when the disk gets full (it may say no, or
    ask the person). Resolves whether it will. */
export async function askToKeepFiles(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Whether the browser has agreed to keep this site's files (null if it can't say). */
export async function filesKept(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}

/** Saves a file on this device and returns where it is, for the account's row. Throws a readable
    message when the browser won't store it (full, or private browsing). */
export async function saveOnDevice(blob: Blob, name: string, owner?: string): Promise<DeviceRef> {
  void askToKeepFiles();
  const key = crypto.randomUUID();
  try {
    await withStore("readwrite", (store) => store.put({ key, blob, name, savedAt: Date.now(), ...(owner ? { owner } : {}) } satisfies Stored));
  } catch {
    throw new Error(`Couldn't keep "${name}" on this device: the browser's storage may be full or turned off (private windows often can't keep files).`);
  }
  urls.set(key, URL.createObjectURL(blob));
  emit();
  return { key, label: deviceLabel() };
}

/** The file's data, if this device has it. */
export async function deviceFile(key: string): Promise<Blob | null> {
  try {
    const row = (await withStore("readonly", (store) => store.get(key))) as Stored | undefined;
    return row?.blob ?? null;
  } catch {
    return null;
  }
}

/** Forgets a file on this device (after it was deleted, or moved online). */
export async function deleteOnDevice(key: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(key));
  } catch {
    // ignore: nothing to delete
  }
  const url = urls.get(key);
  if (url) URL.revokeObjectURL(url);
  urls.set(key, null);
  emit();
}

/** Deletes `owner`'s files on this device that their account no longer lists (deleted, or moved
    online, from any device). `liveKeys`: every `device.key` the account's rows still have. */
export async function tidyDeviceFiles(owner: string, liveKeys: Set<string>): Promise<void> {
  try {
    const db = await openDb();
    const rows = (await wrap(db.transaction(STORE, "readonly").objectStore(STORE).getAll())) as Stored[];
    for (const row of rows) if (row.owner === owner && !liveKeys.has(row.key)) await deleteOnDevice(row.key);
  } catch {
    // ignore: nothing to tidy
  }
}

/** Bytes this device keeps for `owner`, and what the browser lets the site use in all. */
export async function deviceUsage(owner: string): Promise<{ used: number; available: number | null }> {
  let used = 0;
  try {
    const db = await openDb();
    const rows = (await wrap(db.transaction(STORE, "readonly").objectStore(STORE).getAll())) as Stored[];
    for (const row of rows) if (row.owner === owner) used += row.blob.size;
  } catch {
    // nothing kept
  }
  let available: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) available = Math.max(0, est.quota - (est.usage ?? 0));
  } catch {
    // unknown
  }
  return { used, available };
}

// ---------------------------------------------------------------- blob: URLs for rows

/** key → a `blob:` URL (this device has it), null (it doesn't), missing (not looked yet). */
const urls = new Map<string, string | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const l of listeners) l();
}

function load(key: string) {
  if (urls.has(key) || loading.has(key)) return;
  loading.add(key);
  void deviceFile(key).then((blob) => {
    loading.delete(key);
    urls.set(key, blob ? URL.createObjectURL(blob) : null);
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether this device has a row's file: true / false, or undefined while it's being looked up
    (and for rows that are online). */
export function deviceHas(device: DeviceRef | null | undefined): boolean | undefined {
  if (!device) return undefined;
  const url = urls.get(device.key);
  return url === undefined ? undefined : url !== null;
}

type WithUrl = { url: string | null; device?: DeviceRef | null };

/** Rows from Convex with `url` filled in for files kept on this device (still null for one kept on
    another device — check `device` to say where it is). */
export function useDeviceUrls<T extends WithUrl>(rows: T[] | undefined): T[] | undefined;
export function useDeviceUrls<T extends WithUrl>(rows: T[] | null | undefined): T[] | null | undefined;
export function useDeviceUrls<T extends WithUrl>(rows: T[] | null | undefined): T[] | null | undefined {
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  return useMemo(() => {
    void v;
    if (!rows) return rows;
    return rows.map((row) => {
      if (row.url || !row.device) return row;
      const url = urls.get(row.device.key);
      if (url === undefined) load(row.device.key);
      return url ? { ...row, url } : row;
    });
  }, [rows, v]);
}

/** One row's `useDeviceUrls`. */
export function useDeviceUrl<T extends WithUrl>(row: T | null | undefined): T | null | undefined {
  const list = useMemo(() => (row ? [row] : row === null ? null : undefined), [row]);
  const out = useDeviceUrls(list);
  return out ? out[0] : out;
}
