import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeId } from '@jam-practice/core/types';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * The Slow Downer's saved files — the native counterpart of web's IndexedDB `lib/fileLibrary.ts`
 * and `lib/markers.ts`. A picked file is copied into the app's own documents folder (so it's still
 * there next time, whatever happens to the original), listed in AsyncStorage; markers are
 * remembered per saved file. Device-only, like on web — audio files aren't synced.
 */
export type LibraryEntry = { id: string; name: string; size: number; file: string; addedAt: number };
export type Marker = { id: string; time: number; label: string; note: string };

const LIBRARY_KEY = 'jam-practice-slow-downer-files';
const MARKERS_KEY = 'jam-practice-markers';

function folder() {
  const dir = new Directory(Paths.document, 'slow-downer');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function listFiles(): Promise<LibraryEntry[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(LIBRARY_KEY)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    // Drop anything whose copy has gone missing.
    return parsed.filter((e: LibraryEntry) => e && typeof e.file === 'string' && new File(e.file).exists);
  } catch {
    return [];
  }
}

async function writeLibrary(entries: LibraryEntry[]) {
  await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
}

/** Opens the system file picker for an audio or video file and saves a copy. `null` if cancelled. */
export async function pickAndSaveFile(): Promise<LibraryEntry | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*', 'video/*'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const id = makeId();
  const safeName = asset.name.replace(/[^\w.\- ]+/g, '_');
  const destination = new File(folder(), `${id}-${safeName}`);
  await new File(asset.uri).copy(destination);
  const entry: LibraryEntry = { id, name: asset.name, size: asset.size ?? destination.size ?? 0, file: destination.uri, addedAt: Date.now() };
  await writeLibrary([entry, ...(await listFiles())]);
  return entry;
}

/** Saves a copy of a file already on the phone (one of your Files, downloaded) into the list —
    or returns the saved copy when one with the same name and size is there already. */
export async function saveLocalFile(uri: string, name: string, size: number): Promise<LibraryEntry> {
  const existing = (await listFiles()).find((e) => e.name === name && e.size === size);
  if (existing) return existing;
  const id = makeId();
  const destination = new File(folder(), `${id}-${name.replace(/[^\w.\- ]+/g, '_')}`);
  await new File(uri).copy(destination);
  const entry: LibraryEntry = { id, name, size: size || destination.size || 0, file: destination.uri, addedAt: Date.now() };
  await writeLibrary([entry, ...(await listFiles())]);
  return entry;
}

export async function deleteFile(entry: LibraryEntry) {
  try {
    const f = new File(entry.file);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
  await writeLibrary((await listFiles()).filter((e) => e.id !== entry.id));
  await saveMarkers(entry.id, []);
}

async function readMarkerStore(): Promise<Record<string, Marker[]>> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(MARKERS_KEY)) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function loadMarkers(fileId: string): Promise<Marker[]> {
  const list = (await readMarkerStore())[fileId];
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && typeof m.id === 'string' && typeof m.time === 'number' && typeof m.label === 'string')
    .map((m) => ({ ...m, note: typeof m.note === 'string' ? m.note : '' }));
}

export async function saveMarkers(fileId: string, markers: Marker[]) {
  const store = await readMarkerStore();
  if (markers.length) store[fileId] = markers;
  else delete store[fileId];
  await AsyncStorage.setItem(MARKERS_KEY, JSON.stringify(store));
}

export function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
