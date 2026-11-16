/**
 * The Tuner's takes: recordings made in the Tuner, audio files opened in it, and copies of account
 * recordings sent to it ("Open in Tuner" on a recording's page). They're kept **on this device
 * only**, in this browser's IndexedDB (`jam-practice-tuner-takes`), signed in or not: never
 * uploaded, not part of the account, and not counted against its storage. Each one keeps its
 * pitch track once it's been worked out, so opening it again is instant.
 */

import { useEffect, useState } from "react";
import { createLibrary, type LibraryEntry } from "@/lib/fileLibrary";
import type { PitchTrack } from "@/lib/pitchTrack";

export type TakeSource = "take" | "file" | "recording";

export type TakeMeta = {
  durationSec: number;
  source: TakeSource;
  /** A copy of an account recording: that recording's id (opening it again reuses the copy). */
  sourceId?: string;
  /** File extension for downloads ("webm", "mp3", …). */
  ext: string;
  track?: PitchTrack;
};

export type TunerTake = LibraryEntry<TakeMeta> & { meta: TakeMeta };

const library = createLibrary<TakeMeta>("jam-practice-tuner-takes", Number.POSITIVE_INFINITY);

const listeners = new Set<() => void>();
function changed() {
  for (const listener of listeners) listener();
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const EXT_BY_TYPE: [RegExp, string][] = [
  [/mpeg|mp3/, "mp3"],
  [/mp4|m4a|aac/, "m4a"],
  [/webm/, "webm"],
  [/ogg|opus/, "ogg"],
  [/wav/, "wav"],
  [/flac/, "flac"],
];

/** A file extension for a take: from the file's own name when it has one, else from its type. */
export function extensionFor(type: string, fileName?: string): string {
  const own = fileName?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  if (own) return own.toLowerCase();
  return EXT_BY_TYPE.find(([re]) => re.test(type))?.[1] ?? "audio";
}

export async function listTakes(): Promise<TunerTake[]> {
  const all = await library.list();
  return all.filter((t): t is TunerTake => !!t.meta);
}

export async function getTakeBlob(id: string): Promise<Blob | null> {
  return library.get(id);
}

/** Stores a take and returns its id, or null when the browser wouldn't store it. */
export async function saveTake(blob: Blob, name: string, meta: TakeMeta): Promise<string | null> {
  const id = newId();
  const ok = await library.save(id, name, blob, meta);
  changed();
  return ok ? id : null;
}

export async function renameTake(id: string, name: string) {
  await library.rename(id, name);
  changed();
}

export async function deleteTake(id: string) {
  await library.remove(id);
  changed();
}

/** Keeps a take's worked-out pitch track (and its exact length) with it. */
export async function updateTakeMeta(take: TunerTake, patch: Partial<TakeMeta>) {
  await library.setMeta(take.id, { ...take.meta, ...patch });
  changed();
}

/** "Take 4": one more than the highest "Take N" so far. */
export function nextTakeName(takes: TunerTake[]): string {
  let n = 0;
  for (const t of takes) {
    const m = t.name.match(/^Take (\d+)$/);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `Take ${n + 1}`;
}

/** The name a file shows with: its own name without the extension. */
export function nameOfFile(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{1,5}$/i, "") || "Audio file";
}

/** A copy of an account recording, kept with the Tuner's takes (one copy per recording). */
export async function copyRecordingToTuner(recording: { id: string; name: string; url: string; durationSec: number }): Promise<string> {
  const existing = (await listTakes()).find((t) => t.meta.source === "recording" && t.meta.sourceId === recording.id);
  if (existing) return existing.id;
  const res = await fetch(recording.url);
  if (!res.ok) throw new Error(`Couldn't download the recording (${res.status}).`);
  const blob = await res.blob();
  const id = await saveTake(blob, recording.name, {
    durationSec: recording.durationSec,
    source: "recording",
    sourceId: recording.id,
    ext: extensionFor(blob.type),
  });
  if (!id) throw new Error("This browser wouldn't store the recording. It may be out of space.");
  return id;
}

/** Saves a take under its name (`<name>.<ext>`). */
export async function downloadTake(take: TunerTake) {
  const blob = await getTakeBlob(take.id);
  if (!blob) return;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${take.name}.${take.meta.ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** The takes, newest first; null until they've been read (only ever read in the browser). */
export function useTunerTakes(): TunerTake[] | null {
  const [takes, setTakes] = useState<TunerTake[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      void listTakes().then((t) => {
        if (live) setTakes(t);
      });
    };
    load();
    listeners.add(load);
    return () => {
      live = false;
      listeners.delete(load);
    };
  }, []);
  return takes;
}
