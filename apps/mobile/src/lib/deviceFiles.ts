import * as Device from 'expo-device';
import { Directory, File, Paths } from 'expo-file-system';
import { useMemo, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Files kept on this phone (free accounts — see `packages/convex/lib/storage.ts`): the native
 * sibling of the website's `lib/deviceFiles.ts`. The account has a row for each file, recording or
 * tune song (name, size, tune, `device: { key, label }`), so it's listed on every device; the data
 * itself is here, in the app's own documents folder, under `key`:
 *
 *   device-files/<key>/<the file's name>   the data (named, so viewers and the share sheet know
 *                                           its type)
 *   device-files/<key>/meta.json           who saved it and when (`owner`, `savedAt`)
 *
 * The app's documents folder isn't cleared like a browser's storage, but it goes when the app is
 * uninstalled. Rows from Convex come with `url: null` for these; `useDeviceUrls` fills in this
 * phone's `file://` address when it has the file, so players, viewers and the share sheet work
 * unchanged. A row kept on another device (the website, another phone) stays `url: null`, and
 * screens say where it is.
 */

/** Where a row's data lives when it isn't online. */
export type DeviceRef = { key: string; label: string };

type Meta = { owner?: string; savedAt: number; name: string };

const ROOT_NAME = 'device-files';
const META = 'meta.json';

function root(): Directory {
  const dir = new Directory(Paths.document, ROOT_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** A random key for a new file (not a secret — just unique). */
function newKey(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/** A file name that's safe on disk: no slashes or control characters, not too long, keeping its
    extension. */
function safeFileName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'file';
  if (clean.length <= 120) return clean;
  const ext = /\.[a-z0-9]{1,8}$/i.exec(clean)?.[0] ?? '';
  return clean.slice(0, 120 - ext.length) + ext;
}

/** "soniroll app on Pixel 8" — shown on other devices for files kept here (the website shows
    "Firefox on Linux" for its own). */
export function deviceLabel(): string {
  const model = Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android');
  return `soniroll app on ${model}`;
}

/** The data file in a key's folder (whatever its name), or null. */
function dataFileIn(dir: Directory): File | null {
  try {
    if (!dir.exists) return null;
    for (const entry of dir.list()) if (entry instanceof File && entry.name !== META) return entry;
  } catch {
    // unreadable: treat as missing
  }
  return null;
}

function readMeta(dir: Directory): Meta | null {
  try {
    const f = new File(dir, META);
    return f.exists ? (JSON.parse(f.textSync()) as Meta) : null;
  } catch {
    return null;
  }
}

function writeMeta(dir: Directory, meta: Meta) {
  const f = new File(dir, META);
  f.create({ overwrite: true });
  f.write(JSON.stringify(meta));
}

// ---------------------------------------------------------------- the store

/** key → this phone's `file://` address (it has it), null (it doesn't), missing (not looked yet). */
const uris = new Map<string, string | null>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** This phone's address for a kept file, or null when it doesn't have it. Looks on disk once per
    key (the folder listing is synchronous and quick). */
export function deviceFileUri(key: string): string | null {
  const known = uris.get(key);
  if (known !== undefined) return known;
  const file = dataFileIn(new Directory(root(), key));
  const uri = file?.uri ?? null;
  uris.set(key, uri);
  return uri;
}

/** Whether this phone has a row's file (always undefined for rows that are online). */
export function deviceHas(device: DeviceRef | null | undefined): boolean | undefined {
  return device ? deviceFileUri(device.key) !== null : undefined;
}

/** Keeps a file on this phone and returns where it is, for the account's row. `sourceUri` is a
    local file (a picked file in the cache, a recorded take); it's copied, not moved. `owner` is
    the account's id, so tidying up never touches another account's files on a shared phone. */
export async function saveOnDevice(sourceUri: string, name: string, owner?: string): Promise<DeviceRef> {
  const key = newKey();
  try {
    const dir = new Directory(root(), key);
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, safeFileName(name));
    await new File(sourceUri).copy(dest);
    writeMeta(dir, { owner, savedAt: Date.now(), name });
    uris.set(key, dest.uri);
  } catch {
    try {
      new Directory(root(), key).delete();
    } catch {
      // nothing to tidy
    }
    throw new Error(`Couldn't keep "${name}" on this phone — it may be out of space.`);
  }
  emit();
  return { key, label: deviceLabel() };
}

/** Downloads an online file and keeps it on this phone (moving it off the account's online
    storage). */
export async function downloadToDevice(url: string, name: string, owner?: string): Promise<DeviceRef> {
  const key = newKey();
  const dir = new Directory(root(), key);
  try {
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, safeFileName(name));
    await File.downloadFileAsync(url, dest, { idempotent: true });
    writeMeta(dir, { owner, savedAt: Date.now(), name });
    uris.set(key, dest.uri);
  } catch {
    try {
      dir.delete();
    } catch {
      // nothing to tidy
    }
    throw new Error(`Couldn't download "${name}" to this phone.`);
  }
  emit();
  return { key, label: deviceLabel() };
}

/** Forgets a file on this phone (after it was deleted, or moved online). Never throws. */
export function deleteOnDevice(key: string) {
  try {
    const dir = new Directory(root(), key);
    if (dir.exists) dir.delete();
  } catch {
    // nothing to delete
  }
  uris.set(key, null);
  emit();
}

/** How long a file saved here is left alone by `tidyDeviceFiles`: its row is created just after
    the data is saved, so a tidy-up in between must not take it for a deleted file. */
const TIDY_GRACE_MS = 10 * 60 * 1000;

/** Deletes `owner`'s files on this phone that their account no longer lists (deleted, or moved
    online, from any device). `liveKeys`: every `device.key` the account's rows still have. */
export function tidyDeviceFiles(owner: string, liveKeys: Set<string>) {
  try {
    const cutoff = Date.now() - TIDY_GRACE_MS;
    for (const entry of root().list()) {
      if (!(entry instanceof Directory) || liveKeys.has(entry.name)) continue;
      const meta = readMeta(entry);
      if (meta?.owner === owner && meta.savedAt < cutoff) deleteOnDevice(entry.name);
    }
  } catch {
    // nothing to tidy
  }
}

/** Bytes this phone keeps for `owner`. */
export function deviceUsage(owner: string): number {
  let used = 0;
  try {
    for (const entry of root().list()) {
      if (!(entry instanceof Directory) || readMeta(entry)?.owner !== owner) continue;
      used += dataFileIn(entry)?.size ?? 0;
    }
  } catch {
    // nothing kept
  }
  return used;
}

// ---------------------------------------------------------------- rows with addresses

type WithUrl = { url: string | null; device?: DeviceRef | null };

/** Rows from Convex with `url` filled in for files kept on this phone (still null for one kept on
    another device — check `device` to say where it is). */
export function useDeviceUrls<T extends WithUrl>(rows: T[] | undefined): T[] | undefined;
export function useDeviceUrls<T extends WithUrl>(rows: T[] | null | undefined): T[] | null | undefined;
export function useDeviceUrls<T extends WithUrl>(rows: T[] | null | undefined): T[] | null | undefined {
  const v = useSyncExternalStore(subscribe, () => version);
  return useMemo(() => {
    void v;
    if (!rows) return rows;
    return rows.map((row) => {
      if (row.url || !row.device) return row;
      const uri = deviceFileUri(row.device.key);
      return uri ? { ...row, url: uri } : row;
    });
  }, [rows, v]);
}

/** One row's `useDeviceUrls`. */
export function useDeviceUrl<T extends WithUrl>(row: T | null | undefined): T | null | undefined {
  const list = useMemo(() => (row ? [row] : row === null ? null : undefined), [row]);
  const out = useDeviceUrls(list);
  return out ? out[0] : out;
}
