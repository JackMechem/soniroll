/**
 * What sort of file something is, and how its size and date read — shared by the website's Files
 * page, the app's Files tab and its file viewer. Pure: no DOM, no React Native.
 */

/** Largest single file — the backend (`packages/convex/lib/storage.ts`) checks it again, along
    with the account's online storage. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** Where a stored item came from (`packages/convex/lib/storage.ts`'s `StoredKind`). */
export type StoredKind = "file" | "recording" | "song" | "lesson" | "handin" | "profile";

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

/** A file name's extension, lower case, without the dot ("" when it has none). */
export function fileExtension(name: string): string {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

/** What sort of file it is, from its type and name. */
export function fileKind(mimeType: string, name: string): FileKind {
  const ext = fileExtension(name);
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

/** Plain text that reads fine as text: notes, Markdown, CSV, MusicXML (not compressed `.mxl`),
    ABC, JSON. */
export function isTextFile(mimeType: string, name: string): boolean {
  const ext = fileExtension(name);
  if (["txt", "md", "markdown", "csv", "tsv", "xml", "musicxml", "abc", "json", "log"].includes(ext)) return true;
  return mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/vnd.recordare.musicxml+xml";
}

/** A MIME type from a file name, for pickers and stores that don't say. Empty when unknown. */
export function mimeTypeFor(name: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/opus",
    flac: "audio/flac",
    aif: "audio/aiff",
    aiff: "audio/aiff",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    musicxml: "application/vnd.recordare.musicxml+xml",
    mxl: "application/vnd.recordare.musicxml",
    mid: "audio/midi",
    midi: "audio/midi",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rtf: "application/rtf",
  };
  return map[fileExtension(name)] ?? "";
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

/** "Oct 8" this year, "Oct 8, 2025" before. Plain string work (no `Intl`, slow on Hermes). */
export function formatFileDate(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? "" : `, ${d.getFullYear()}`}`;
}

/** "PDF · 2.4 MB · Oct 8" (with anything extra on the end). */
export function fileDetail(file: { name: string; mimeType: string; size: number; createdAt: number }, extra?: string | null) {
  return [FILE_KIND_LABEL[fileKind(file.mimeType, file.name)], formatBytes(file.size), formatFileDate(file.createdAt), extra].filter(Boolean).join(" · ");
}
