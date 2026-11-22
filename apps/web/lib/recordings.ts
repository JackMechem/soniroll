"use client";

import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import type { Tune } from "@/lib/types";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { type DeviceRef, useDeviceUrl } from "@/lib/deviceFiles";
import { useTunesToLearn } from "@/lib/useTunesToLearn";
import { useLibraryTunes } from "@/lib/useTuneLists";

/** A saved recording, as `convex/recordings.ts`'s queries return it — shared with the app. */
export type Recording = {
  _id: Id<"recordings">;
  name: string;
  notes: string;
  durationSec: number;
  mimeType: string;
  tuneId: string | null;
  mix: RecordingMix | null;
  /** The Shed Log day (YYYY-MM-DD) and routine it's attached to, if any. */
  logDate?: string | null;
  routineId?: string | null;
  /** A task in that routine, or a one-off task on that day. */
  taskId?: string | null;
  createdAt: number;
  updatedAt: number;
  /** Null when it's on another device (`device`), or before `useDeviceUrls` fills it in. */
  url: string | null;
  device: DeviceRef | null;
};

/** How a take plays over its tune's song: each side's volume (0..1), and where in the song the
    take starts (seconds; negative = the take starts before the song does). */
export type RecordingMix = { songVolume: number; takeVolume: number; offsetSec: number };

export const DEFAULT_MIX: RecordingMix = { songVolume: 0.7, takeVolume: 1, offsetSec: 0 };

export const recordingsApi = api.recordings;
export const tuneSongsApi = api.tuneSongs;

/** A tune's song (the audio file played behind its takes), or null / undefined while loading. */
export type TuneSong = {
  name: string;
  durationSec: number;
  mimeType: string;
  url: string | null;
  device: DeviceRef | null;
};

/** The tune's song, with a playable `url` when it's online or on this device. */
export function useTuneSong(tuneId: string | null | undefined): TuneSong | null | undefined {
  const { isAuthenticated } = useConvexAuth();
  const active = isAuthenticated && !!tuneId;
  const song = useDeviceUrl(useQuery(tuneSongsApi.getForTune, active ? { tuneId } : "skip"));
  return active ? song : null;
}

/** An audio file's length in seconds, read by the browser (0 if it can't tell). */
export function audioFileDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (sec: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(sec) ? sec : 0);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

/** "1:05", "12:40", "1:02:03". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 8, 10:45" — the same format the app uses. */
export function formatRecordedAt(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Uploads a take to Convex file storage (`generateUploadUrl` → POST the file) and returns the
    stored file's id, for `api.recordings.create`. */
export async function uploadRecordingBlob(blob: Blob, generateUploadUrl: () => Promise<string>) {
  if (!blob.size) throw new Error("The recording is empty.");
  const uploadUrl = await generateUploadUrl();
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
  if (!res.ok) throw new Error(`Upload failed (${res.status}${res.statusText ? `: ${res.statusText}` : ""}).`);
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

import type { TuneListId } from "@jam-practice/core/tuneLibrary";
export type { TuneListId };

/** Every tune of yours by id, from both lists — for showing and picking a recording's tune. */
export function useTuneIndex() {
  const [tunes] = useSyncedTunes();
  const [learn] = useTunesToLearn();
  const [library] = useLibraryTunes();
  return useMemo(() => {
    const byId = new Map<string, { tune: Tune; list: TuneListId }>();
    for (const tune of tunes) byId.set(tune.id, { tune, list: "tunes" });
    for (const tune of learn) byId.set(tune.id, { tune, list: "learn" });
    for (const tune of library) byId.set(tune.id, { tune, list: "library" });
    return byId;
  }, [tunes, learn, library]);
}
