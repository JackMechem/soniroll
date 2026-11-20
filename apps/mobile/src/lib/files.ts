import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { MAX_FILE_BYTES, type StoredKind, fileExtension, mimeTypeFor } from '@jam-practice/core/files';
import { useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';

import { type DeviceRef, deleteOnDevice, deviceFileUri, downloadToDevice, saveOnDevice } from '@/lib/deviceFiles';
import { useSyncedSettings } from '@/lib/useSyncedSettings';

/**
 * Files on the phone: the native sibling of the website's `lib/files.ts`, `lib/storagePlan.ts` and
 * `lib/storageMove.ts`. Everything the account stores (`files.storage`: uploads, recordings, tune
 * songs, lesson files, hand-ins, profile images) as `StoredEntry`s; picking and saving new files
 * (online with a storage plan, kept on this phone without one — `lib/deviceFiles.ts`); moving them
 * between the two; getting a local copy to view or send through the share sheet.
 */

export const filesApi = api.files;

export type { StoredKind };

/** Anything on the Files tab, as `files.storage` lists it — the shape the ⋮ menu, rename, delete
    and share work on. */
export type StoredEntry = {
  kind: StoredKind;
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  url: string | null;
  tuneId: string | null;
  href: string | null;
  sharedId?: string | null;
  /** Set when it's kept on a device instead of online (files, recordings and songs only). */
  device?: DeviceRef | null;
  /** In a note: stays online, never moved to a device. */
  keepOnline?: boolean;
};

export const SITE = 'https://www.soniroll.com';

/** The address a shared file's link opens (the website's `/file/<id>`). */
export function sharedFileUrl(shareId: string) {
  return `${SITE}/file/${shareId}`;
}

/** Turns a Convex error into the sentence inside it. */
export function errorText(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  const m = /Uncaught Error: (.+?)(?:\n|$)/.exec(e.message);
  return m ? m[1] : e.message.length < 160 ? e.message : fallback;
}

/** Kinds that can live on a device (lesson files, hand-ins and profile images are always online). */
export function isMovable(item: Pick<StoredEntry, 'kind'>): item is StoredEntry & { kind: 'file' | 'recording' | 'song' } {
  return item.kind === 'file' || item.kind === 'recording' || item.kind === 'song';
}

// ---------------------------------------------------------------- picking

/** A file picked on the phone (copied into the app's cache by the picker). */
export type PickedFile = { uri: string; name: string; type: string; size: number };

/** Opens the system file picker. `types` are MIME patterns ("application/pdf", "image/*"); an
    empty list takes anything. Empty when cancelled. */
export async function pickFiles(types: string[] = [], multiple = false): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: types.length ? types : '*/*', copyToCacheDirectory: true, multiple });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType || mimeTypeFor(a.name), size: a.size ?? 0 }));
}

/** POSTs a local file to a Convex upload URL (from `generate`), streamed from disk — reading it
    through `fetch(file://…).blob()` first arrived empty on Android. Returns the storage id. */
export async function uploadLocalFile(uri: string, type: string, name: string, generate: () => Promise<string>): Promise<Id<'_storage'>> {
  const url = await generate();
  const res = await uploadAsync(url, uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': type || 'application/octet-stream' },
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`"${name}" didn't upload — try again.`);
  return (JSON.parse(res.body) as { storageId: Id<'_storage'> }).storageId;
}

// ---------------------------------------------------------------- the plan, and where new files go

/** The account's plan and online storage (`files.storagePlan`): null signed out, undefined while
    loading. */
export function useStoragePlan() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.files.storagePlan, isAuthenticated ? {} : 'skip');
}

export type AccountStorage = NonNullable<ReturnType<typeof useStoragePlan>>;

/** True when new things can be saved online: the account has a plan, paid or gifted. */
export function savesOnline(storage: AccountStorage | null | undefined) {
  return !!storage?.hasPlan;
}

/** The website's site settings this reads (Account → Storage plan → "New files go"). */
const SITE_SETTINGS_KEY = 'jam-practice-site-settings';
const SITE_DEFAULTS = { newFilesOnline: true };

/**
 * Where something you're adding goes. With a plan you can choose (`canChoose`): online or only
 * this phone, starting from your default (`newFilesOnline`, set on the website). Without one it's
 * always this phone. `setOnline` changes it for this upload.
 */
export function useSaveTarget() {
  const storage = useStoragePlan();
  const [settings] = useSyncedSettings(SITE_SETTINGS_KEY, SITE_DEFAULTS);
  const [choice, setChoice] = useState<boolean | null>(null);
  const canChoose = savesOnline(storage);
  return { storage, canChoose, online: canChoose && (choice ?? settings.newFilesOnline !== false), setOnline: setChoice };
}

export type SaveTarget = ReturnType<typeof useSaveTarget>;

/** Where a saved file ended up: pass straight into `recordings.create` / `tuneSongs.set`. */
export type Placed = { storageId: Id<'_storage'> } | { device: DeviceRef; size: number };

/** Saves a local file online (via `generateUploadUrl`, which needs a plan) or on this phone. If
    saving its row then fails, call `unplace` to tidy up the phone's copy. */
export async function placeFile(
  file: { uri: string; name: string; type: string; size: number },
  storage: AccountStorage | null | undefined,
  generateUploadUrl: () => Promise<string>,
  online = savesOnline(storage),
): Promise<Placed> {
  if (storage === undefined) throw new Error('One moment — your account is still loading. Try again.');
  if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" is over 100 MB.`);
  if (online && savesOnline(storage)) return { storageId: await uploadLocalFile(file.uri, file.type, file.name, generateUploadUrl) };
  return { device: await saveOnDevice(file.uri, file.name, storage?.userId), size: file.size };
}

/** Undoes `placeFile`'s copy on this phone (online uploads are cleaned up by the backend). */
export function unplace(placed: Placed) {
  if ('device' in placed) deleteOnDevice(placed.device.key);
}

/** Saving files picked on the phone into Files, online or on this phone (`target`), one by one.
    `progress` is "2 of 5" while it runs; `error` says what didn't save. */
export function useFileUploader(target: SaveTarget, tuneId?: string) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const create = useMutation(api.files.create);
  const createOnDevice = useMutation(api.files.createOnDevice);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { storage, online } = target;

  const uploadAll = useCallback(
    async (files: PickedFile[]): Promise<boolean> => {
      if (!files.length) return true;
      setError(null);
      setProgress({ done: 0, total: files.length });
      const failures: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          if (!file.size) throw new Error(`"${file.name}" is empty.`);
          const type = file.type || 'application/octet-stream';
          const placed = await placeFile({ ...file, type }, storage, () => generateUploadUrl({}), online);
          try {
            if ('storageId' in placed) await create({ storageId: placed.storageId, name: file.name, ...(tuneId ? { tuneId } : {}) });
            else await createOnDevice({ name: file.name, mimeType: type, size: file.size, device: placed.device, ...(tuneId ? { tuneId } : {}) });
          } catch (e) {
            unplace(placed);
            throw e;
          }
        } catch (e) {
          failures.push(errorText(e, `Couldn't save "${file.name}".`));
          // Out of room (or uploads paused): the rest won't fit either.
          if (/room|full|paused/i.test(failures[failures.length - 1])) break;
        }
        setProgress({ done: i + 1, total: files.length });
      }
      setProgress(null);
      if (failures.length) setError(failures.join(' '));
      return failures.length === 0;
    },
    [create, createOnDevice, generateUploadUrl, online, storage, tuneId],
  );

  return { uploadAll, progress, error, clearError: () => setError(null) };
}

// ---------------------------------------------------------------- moving between online and the phone

/** `moveToDevice(item)`: downloads an online item to this phone, then deletes the online copy.
    `moveOnline(item, purpose?)`: uploads an item kept on this phone, then forgets the phone's copy.
    Without a plan the backend only allows that for a `purpose` (`share` — the link is made in the
    same step and its id returned — or `note`). Both throw readable messages. */
export function useStorageMoves(owner: string | undefined) {
  const toDevice = useMutation(api.files.moveToDevice);
  const online = useMutation(api.files.moveOnline);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const moveToDevice = useCallback(
    async (item: StoredEntry) => {
      if (!isMovable(item) || item.device) return;
      if (!item.url) throw new Error(`Couldn't download "${item.name}".`);
      const device = await downloadToDevice(item.url, item.name, owner);
      try {
        await toDevice({ kind: item.kind, id: item.id, device });
      } catch (e) {
        deleteOnDevice(device.key);
        throw e;
      }
    },
    [owner, toDevice],
  );

  const moveOnline = useCallback(
    async (item: StoredEntry, purpose?: 'share' | 'note'): Promise<string | null> => {
      if (!isMovable(item) || !item.device) return null;
      const uri = deviceFileUri(item.device.key);
      if (!uri) throw new Error(`"${item.name}" is on ${item.device.label}, not this phone. Put it online from there.`);
      const storageId = await uploadLocalFile(uri, item.mimeType, item.name, () => generateUploadUrl(purpose ? { purpose } : {}));
      const shareId = await online({ kind: item.kind, id: item.id, storageId, ...(purpose ? { purpose } : {}) });
      deleteOnDevice(item.device.key);
      return shareId;
    },
    [generateUploadUrl, online],
  );

  return { moveToDevice, moveOnline };
}

// ---------------------------------------------------------------- local copies (viewing, sending)

/** A short, stable hash of a string (for cache file names). */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** A file name with an extension that matches its type, so other apps know what it is. */
function nameWithExtension(name: string, mimeType: string) {
  if (fileExtension(name)) return name;
  const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('wav') ? 'wav' : mimeType.includes('webm') ? 'webm' : mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') ? 'jpg' : '';
  return ext ? `${name}.${ext}` : name;
}

/**
 * A `file://` address for a file: itself when it's already on this phone, otherwise a copy
 * downloaded into the cache (kept there, by address, so opening it again is instant; the system
 * clears the cache when it needs room). Throws a readable message when the download fails.
 */
export async function localCopy(file: { url: string; name: string; mimeType: string }): Promise<string> {
  if (file.url.startsWith('file:')) return file.url;
  const name = nameWithExtension(file.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'file', file.mimeType);
  const dir = new Directory(Paths.cache, 'viewer', hash(file.url));
  const dest = new File(dir, name);
  if (dest.exists && dest.size > 0) return dest.uri;
  try {
    dir.create({ intermediates: true, idempotent: true });
    const out = await File.downloadFileAsync(file.url, dest, { idempotent: true });
    return out.uri;
  } catch {
    throw new Error(`Couldn't download "${file.name}". Check your connection and try again.`);
  }
}

/** Sends the file itself through the system share sheet (to another app, a chat, Files…), which
    also offers opening it in another app. */
export async function shareFile(file: { url: string; name: string; mimeType: string }, title = 'Share or open in another app') {
  if (!(await Sharing.isAvailableAsync())) throw new Error("This phone can't share files from here.");
  const uri = await localCopy(file);
  await Sharing.shareAsync(uri, { mimeType: file.mimeType || mimeTypeFor(file.name) || undefined, dialogTitle: title });
}
