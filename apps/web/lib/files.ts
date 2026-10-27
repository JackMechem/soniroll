"use client";

import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { siteOrigin } from "@/lib/siteOrigin";

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
  url: string | null;
};

/** Where a stored item came from (`packages/convex/lib/storage.ts`'s `StoredKind`). */
export type StoredKind = "file" | "recording" | "song" | "lesson" | "handin" | "profile";

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
};

/** An upload as a `StoredEntry`. */
export function entryOf(file: UserFile): StoredEntry {
  return { kind: "file", id: file._id, name: file.name, mimeType: file.mimeType, size: file.size, createdAt: file.createdAt, url: file.url, tuneId: file.tuneId, href: null };
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

/** Largest single file — same as the backend (`packages/convex/lib/storage.ts`), which checks
    again, along with the account's 100 MB total. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export type FileKind = "pdf" | "image" | "audio" | "video" | "notation" | "document" | "other";

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: "PDF",
  image: "Image",
  audio: "Audio",
  video: "Video",
  notation: "Notation",
  document: "Document",
  other: "File",
};

/** What sort of file it is, from its type and name. */
export function fileKind(mimeType: string, name: string): FileKind {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext)) return "image";
  if (mimeType.startsWith("audio/") || ["mp3", "m4a", "wav", "aif", "aiff", "flac", "ogg", "opus", "aac"].includes(ext)) return "audio";
  if (mimeType.startsWith("video/") || ["mp4", "mov", "webm", "mkv", "m4v"].includes(ext)) return "video";
  if (["mxl", "musicxml", "xml", "mid", "midi", "gp", "gpx", "gp5", "sib", "mscz", "dorico"].includes(ext)) return "notation";
  if (["doc", "docx", "txt", "rtf", "odt", "pages", "md", "csv", "xls", "xlsx", "key", "ppt", "pptx"].includes(ext)) return "document";
  return "other";
}

/** Whether the browser can show it in place (otherwise it's a download). */
export function canPreview(kind: FileKind) {
  return kind === "pdf" || kind === "image" || kind === "audio" || kind === "video";
}

/** "820 KB", "3.4 MB", "1.2 GB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 8" this year, "Oct 8, 2025" before. */
export function formatFileDate(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? "" : `, ${d.getFullYear()}`}`;
}

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

/** Turns a Convex error into the sentence inside it. */
export function errorText(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  const m = /Uncaught Error: (.+?)(?:\n|$)/.exec(e.message);
  return m ? m[1] : e.message.length < 160 ? e.message : fallback;
}
