export type Marker = { id: string; time: number; label: string; note: string };
/** A loop saved to come back to later. */
export type SavedLoop = { id: string; name: string; start: number; end: number };

const MARKERS_KEY = "jam-practice-markers";
const LOOPS_KEY = "jam-practice-slow-downer-loops";
const MAX_FILES = 100;

type Store<T> = Record<string, T[]>;

function readStore<T>(key: string): Store<T> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeList<T>(key: string, fileKey: string, list: T[]): void {
  try {
    const store = readStore<T>(key);
    delete store[fileKey];
    if (list.length > 0) store[fileKey] = list;
    const keys = Object.keys(store);
    // Drop the oldest entries if this ever grows large.
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) delete store[old];
    window.localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // storage unavailable
  }
}

/** Markers (and saved loops) are remembered per file, identified by name and size. */
export function fileKeyOf(file: File): string {
  return `${file.name}|${file.size}`;
}

export function loadMarkers(fileKey: string): Marker[] {
  const list = readStore<Marker>(MARKERS_KEY)[fileKey];
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (m) =>
        m && typeof m.id === "string" && typeof m.time === "number" && typeof m.label === "string",
    )
    .map((m) => ({ ...m, note: typeof m.note === "string" ? m.note : "" }))
    .sort((a, b) => a.time - b.time);
}

export function saveMarkers(fileKey: string, markers: Marker[]): void {
  writeList(MARKERS_KEY, fileKey, markers);
}

export function loadLoops(fileKey: string): SavedLoop[] {
  const list = readStore<SavedLoop>(LOOPS_KEY)[fileKey];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (l) =>
      l &&
      typeof l.id === "string" &&
      typeof l.name === "string" &&
      typeof l.start === "number" &&
      typeof l.end === "number" &&
      l.end > l.start,
  );
}

export function saveLoops(fileKey: string, loops: SavedLoop[]): void {
  writeList(LOOPS_KEY, fileKey, loops);
}
