"use client";

import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { useSiteSettings } from "@/lib/siteSettings";
import { type DeviceRef, deleteOnDevice, saveOnDevice } from "@/lib/deviceFiles";

/**
 * Where new files, recordings and tune songs go: online (Convex file storage) with a storage
 * plan, or on this device without one (`lib/deviceFiles.ts`). Every feature works either way; only
 * having them on every device needs a plan. See `packages/convex/lib/storage.ts`.
 */

/** The account's plan and online storage (`files.storagePlan`), or null signed out / undefined
    while loading. */
export function useStoragePlan() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.files.storagePlan, isAuthenticated ? {} : "skip");
}

export type AccountStorage = NonNullable<ReturnType<typeof useStoragePlan>>;

/** True when new things can be saved online: the account has a plan, paid or gifted. */
export function savesOnline(storage: AccountStorage | null | undefined) {
  return !!storage?.hasPlan;
}

/** Where a saved blob ended up: pass straight into `recordings.create` / `tuneSongs.set`. */
export type Placed = { storageId: Id<"_storage"> } | { device: DeviceRef; size: number };

/** POSTs a blob to a Convex upload URL and returns its storage id. */
export async function uploadBlob(blob: Blob, generateUploadUrl: () => Promise<string>, name = "the file"): Promise<Id<"_storage">> {
  if (!blob.size) throw new Error(`"${name}" is empty.`);
  const uploadUrl = await generateUploadUrl();
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
  if (!res.ok) throw new Error(`Uploading "${name}" failed (${res.status}).`);
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

/** Saves a blob online (via `generateUploadUrl`) or on this device: `online` picks (see
    `useSaveTarget`); online is only possible with a plan. If saving its row then fails, call
    `unplace` to tidy up a device copy. */
export async function placeBlob(
  blob: Blob,
  name: string,
  storage: AccountStorage | null | undefined,
  generateUploadUrl: () => Promise<string>,
  online = savesOnline(storage),
): Promise<Placed> {
  if (storage === undefined) throw new Error("One moment — your account is still loading. Try again.");
  if (online && savesOnline(storage)) return { storageId: await uploadBlob(blob, generateUploadUrl, name) };
  return { device: await saveOnDevice(blob, name, storage?.userId), size: blob.size };
}

/**
 * Where something you're adding goes. With a plan you can choose (`canChoose`): online or only
 * this device, starting from your default (`newFilesOnline`, Account → Storage plan). Without one
 * it's always this device. `setOnline` changes it for this upload / this dialog.
 */
export function useSaveTarget() {
  const storage = useStoragePlan();
  const [settings] = useSiteSettings();
  const [choice, setChoice] = useState<boolean | null>(null);
  const canChoose = savesOnline(storage);
  return { storage, canChoose, online: canChoose && (choice ?? settings.newFilesOnline), setOnline: setChoice };
}

export type SaveTarget = ReturnType<typeof useSaveTarget>;

/** Undoes `placeBlob`'s device copy (online uploads are cleaned up by the backend). */
export async function unplace(placed: Placed) {
  if ("device" in placed) await deleteOnDevice(placed.device.key);
}

/** When free accounts' files, recordings and songs stop being kept online (the move notice's
    date). Until then the ones already online keep working; after it they're meant to be moved to
    a device or deleted — see docs/notes/storage-plans.md. */
export const DEVICE_MOVE_DATE = "2027-01-31";

/** "January 31, 2027". */
export function moveDateLabel() {
  const [y, m, d] = DEVICE_MOVE_DATE.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Where your plan is shown and managed: the Account page's Storage plan section. (`/plans` shows
    the plans signed out and sends you here signed in.) */
export const PLAN_HREF = "/account?tab=storage";
