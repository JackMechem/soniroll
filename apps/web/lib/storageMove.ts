"use client";

import { api } from "@jam-practice/convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { deleteOnDevice, deviceFile, saveOnDevice } from "@/lib/deviceFiles";
import type { StoredEntry } from "@/lib/files";
import { savesOnline, uploadBlob, useStoragePlan } from "@/lib/storagePlan";
import { makeZip, safeName } from "@/lib/zip";

/**
 * Moving files, recordings and songs between online (Convex file storage) and this device, and
 * downloading everything as a backup. See `packages/convex/lib/storage.ts` for where things live.
 */

/** Kinds that can live on a device (lesson files, hand-ins and profile images are always online). */
export function isMovable(item: Pick<StoredEntry, "kind">): item is StoredEntry & { kind: "file" | "recording" | "song" } {
  return item.kind === "file" || item.kind === "recording" || item.kind === "song";
}

/** The item's data: from its online URL, or this device. Null if neither has it. */
async function dataOf(item: StoredEntry): Promise<Blob | null> {
  if (item.device) return deviceFile(item.device.key);
  if (!item.url) return null;
  const res = await fetch(item.url);
  return res.ok ? await res.blob() : null;
}

/** `moveToDevice(item)`: saves an online item on this device, then deletes the online copy.
    `moveOnline(item)`: uploads an item kept on this device, then forgets the device copy. Both
    throw readable messages. `owner` is the account's id (tags the device copy). */
export function useStorageMoves(owner: string | undefined) {
  const toDevice = useMutation(api.files.moveToDevice);
  const online = useMutation(api.files.moveOnline);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const moveToDevice = useCallback(
    async (item: StoredEntry) => {
      if (!isMovable(item) || item.device) return;
      const blob = await dataOf(item);
      if (!blob) throw new Error(`Couldn't download "${item.name}".`);
      const device = await saveOnDevice(blob, item.name, owner);
      try {
        await toDevice({ kind: item.kind, id: item.id, device });
      } catch (e) {
        await deleteOnDevice(device.key);
        throw e;
      }
    },
    [owner, toDevice],
  );

  const moveOnline = useCallback(
    async (item: StoredEntry) => {
      if (!isMovable(item) || !item.device) return;
      const blob = await deviceFile(item.device.key);
      if (!blob) throw new Error(`"${item.name}" is on ${item.device.label}, not this device. Put it online from there.`);
      const storageId = await uploadBlob(blob, () => generateUploadUrl(), item.name);
      await online({ kind: item.kind, id: item.id, storageId });
      await deleteOnDevice(item.device.key);
    },
    [generateUploadUrl, online],
  );

  return { moveToDevice, moveOnline };
}

/** Saving someone else's shared file into your files. With a plan the backend copies it online
    (`files.copySharedFile(s)`); without one, `copyToDevice` downloads it here instead. */
export function useDeviceCopy() {
  const storage = useStoragePlan();
  const createOnDevice = useMutation(api.files.createOnDevice);
  const copyToDevice = useCallback(
    async (file: { url: string | null; name: string; mimeType: string }, tuneId?: string) => {
      if (!file.url) throw new Error(`"${file.name}" isn't available.`);
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`Couldn't download "${file.name}".`);
      const blob = await res.blob();
      const device = await saveOnDevice(blob, file.name, storage?.userId);
      try {
        await createOnDevice({ name: file.name, mimeType: file.mimeType || blob.type, size: blob.size, device, ...(tuneId ? { tuneId } : {}) });
      } catch (e) {
        await deleteOnDevice(device.key);
        throw e;
      }
    },
    [createOnDevice, storage?.userId],
  );
  return { toDevice: storage !== undefined && !savesOnline(storage), copyToDevice };
}

/** A file name with the right extension for its type, when its name has none (recordings). */
function withExtension(name: string, mimeType: string) {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("mpeg") ? "mp3" : mimeType.includes("wav") ? "wav" : mimeType.includes("pdf") ? "pdf" : "";
  return ext ? `${name}.${ext}` : name;
}

/** Downloads every item this device can reach (online, or kept here) as one .zip, in folders by
    kind. Returns how many were left out (on another device, or failed to download). */
export async function downloadEverything(
  items: StoredEntry[],
  onProgress?: (done: number, total: number) => void,
  zipName = "soniroll files.zip",
): Promise<{ saved: number; skipped: number }> {
  const folder: Record<string, string> = { file: "Files", recording: "Recordings", song: "Songs", lesson: "Lesson files", handin: "Hand-ins", profile: "Profile" };
  const entries: { path: string; data: Uint8Array; modified: Date }[] = [];
  const used = new Set<string>();
  let skipped = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const blob = await dataOf(item);
      if (!blob) skipped += 1;
      else {
        const base = `${folder[item.kind] ?? "Files"}/${safeName(withExtension(item.name, item.mimeType || blob.type))}`;
        let path = base;
        for (let n = 2; used.has(path.toLowerCase()); n++) path = base.replace(/(\.[^./]+)?$/, ` (${n})$1`);
        used.add(path.toLowerCase());
        entries.push({ path, data: new Uint8Array(await blob.arrayBuffer()), modified: new Date(item.createdAt) });
      }
    } catch {
      skipped += 1;
    }
    onProgress?.(i + 1, items.length);
  }
  if (entries.length) {
    const href = URL.createObjectURL(makeZip(entries));
    const a = document.createElement("a");
    a.href = href;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }
  return { saved: entries.length, skipped };
}

/** The most one backup .zip holds: it's built in memory, so a browser can't do much more. */
export const MAX_BACKUP_BYTES = 2 * 1024 ** 3;

/** "soniroll files 2026-11-17.zip". */
function backupName() {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `soniroll files ${day}.zip`;
}

/**
 * Backing up files as one .zip: everything this device can reach — online, or kept on this
 * device (rows with a `url`, after `useDeviceUrls`). Files kept on another device are left out and
 * counted. `status` is the progress line, `message` the result.
 */
export function useBackup() {
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const backUp = useCallback(async (items: StoredEntry[]) => {
    setMessage(null);
    const here = items.filter((i) => i.url);
    const elsewhere = items.length - here.length;
    const elsewhereNote = elsewhere ? ` ${elsewhere} kept on another device ${elsewhere === 1 ? "isn't" : "aren't"} included — back ${elsewhere === 1 ? "it" : "them"} up there.` : "";
    if (!here.length) {
      setMessage({ text: items.length ? `Nothing to back up on this device.${elsewhereNote}` : "There are no files to back up yet.", error: !!items.length });
      return;
    }
    const bytes = here.reduce((sum, i) => sum + i.size, 0);
    if (bytes > MAX_BACKUP_BYTES) {
      setMessage({ text: "That's more than one download can hold (2 GB). Tick some files and download them in parts.", error: true });
      return;
    }
    setStatus(`Backing up 1 of ${here.length}…`);
    try {
      const { saved, skipped } = await downloadEverything(here, (done, total) => setStatus(`Backing up ${Math.min(done + 1, total)} of ${total}…`), backupName());
      const failed = skipped ? ` ${skipped} couldn't be downloaded.` : "";
      setMessage({ text: `Saved ${saved} file${saved === 1 ? "" : "s"} in one .zip.${failed}${elsewhereNote}`, error: !!skipped });
    } catch {
      setMessage({ text: "Couldn't make the backup.", error: true });
    } finally {
      setStatus(null);
    }
  }, []);

  return { backUp, status, message, busy: status !== null, clear: () => setMessage(null) };
}

