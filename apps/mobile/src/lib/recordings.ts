import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { File } from 'expo-file-system';

import type { DeviceRef } from '@/lib/deviceFiles';

export type Recording = {
  _id: Id<'recordings'>;
  name: string;
  notes: string;
  durationSec: number;
  mimeType: string;
  tuneId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Null when it's kept on a device (`device`) — `useDeviceUrls` fills in this phone's copy. */
  url: string | null;
  /** Set when it's kept on a device instead of online (free accounts). */
  device?: DeviceRef | null;
};

export const RECORDING_MIME = 'audio/mp4';

/** "1:05", "12:40", "1:02:03". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 8, 10:45" — plain string work (no `Intl`/`toLocaleString`, slow on Hermes). */
export function formatRecordedAt(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Deletes a local take once it's uploaded or discarded. Never throws. */
export function deleteLocalTake(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Left in the cache directory; the OS clears it eventually.
  }
}

export const recordingsApi = api.recordings;
