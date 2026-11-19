"use client";

import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { siteOrigin } from "@/lib/siteOrigin";
import type { DeviceRef } from "@/lib/deviceFiles";
import { type AccountStorage, type Placed, placeBlob, savesOnline, unplace } from "@/lib/storagePlan";
import { MAX_FILE_BYTES, type StoredKind } from "@jam-practice/core/files";

/**
 * Files people upload to their account (`packages/convex/files.ts`): on their own, or attached to
 * one of their tunes. Shared helpers for the Files page, a tune's Files section and shared tunes.
 */

export const filesApi = api.files;

/** A file as `files.list` / `files.listForTune` return it. */
export type UserFile = {
  _id: Id<"files">;
  name: string;
  mimeType: string;
  size: number;
  tuneId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Null when it's on another device (or this one, before `useDeviceUrls` fills it in). */
  url: string | null;
  /** Set when it's kept on a device instead of online. */
  device: DeviceRef | null;
};

/** Where a stored item came from (`packages/convex/lib/storage.ts`'s `StoredKind`). */
export type { StoredKind } from "@jam-practice/core/files";

/** Anything on the Files page, as `files.storage` lists it — the shape the ⋮ menu, rename, delete
    and share work on. A plain upload is `kind: "file"` with its `_id` as `id`. */
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

/** An upload as a `StoredEntry`. */
export function entryOf(file: UserFile): StoredEntry {
  return { kind: "file", id: file._id, name: file.name, mimeType: file.mimeType, size: file.size, createdAt: file.createdAt, url: file.url, tuneId: file.tuneId, href: null, device: file.device };
}

/** The address a shared file's link opens (`app/file/[id]`). */
export function sharedFileUrl(shareId: string) {
  return `${siteOrigin()}/file/${shareId}`;
}

/** Saves a file under its own name. Stored files live on another domain, where the browser ignores
    `download`, so it's fetched first; if that fails it opens in a new tab instead. */
export async function downloadFile(url: string, name: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// What sort of file it is and how its size and date read live in `packages/core/files.ts` (the app
// uses them too).
export { type FileKind, FILE_KIND_LABEL, MAX_FILE_BYTES, canPreview, fileKind, formatBytes, formatFileDate } from "@jam-practice/core/files";

/** Uploads one file to the account (optionally attached to a tune): `generateUploadUrl` → POST →
    `create`, and returns what `create` did (the new file's id). Throws a readable message if it's
    too big or there's no room. */
export async function uploadFile<T>(
  file: File,
  generateUploadUrl: () => Promise<string>,
  create: (args: { storageId: Id<"_storage">; name: string; tuneId?: string }) => Promise<T>,
  tuneId?: string,
  name = file.name,
): Promise<T> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" is over 100 MB.`);
  if (!file.size) throw new Error(`"${file.name}" is empty.`);
  const uploadUrl = await generateUploadUrl();
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!res.ok) throw new Error(`Uploading "${file.name}" failed (${res.status}).`);
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return await create({ storageId, name, ...(tuneId ? { tuneId } : {}) });
}

/** Saves a new file online (`online`, which needs a plan) or on this device — see
    `lib/storagePlan.ts` — optionally attached to a tune, and returns the new file's id. */
export async function saveFile(
  file: File,
  storage: AccountStorage | null | undefined,
  calls: {
    generateUploadUrl: () => Promise<string>;
    create: (args: { storageId: Id<"_storage">; name: string; tuneId?: string }) => Promise<Id<"files">>;
    createOnDevice: (args: { name: string; mimeType: string; size: number; tuneId?: string; device: DeviceRef }) => Promise<Id<"files">>;
  },
  tuneId?: string,
  name = file.name,
  online = savesOnline(storage),
): Promise<Id<"files">> {
  if (online && savesOnline(storage)) return uploadFile(file, calls.generateUploadUrl, calls.create, tuneId, name);
  if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" is over 100 MB.`);
  if (!file.size) throw new Error(`"${file.name}" is empty.`);
  const placed: Placed = await placeBlob(file, name, storage, calls.generateUploadUrl, false);
  if (!("device" in placed)) throw new Error("unreachable");
  try {
    return await calls.createOnDevice({ name, mimeType: file.type || "application/octet-stream", size: file.size, device: placed.device, ...(tuneId ? { tuneId } : {}) });
  } catch (e) {
    await unplace(placed);
    throw e;
  }
}

/** Turns a Convex error into the sentence inside it. */
export function errorText(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  const m = /Uncaught Error: (.+?)(?:\n|$)/.exec(e.message);
  return m ? m[1] : e.message.length < 160 ? e.message : fallback;
}
