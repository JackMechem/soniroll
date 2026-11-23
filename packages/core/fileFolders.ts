/**
 * Folders and tags on stored files (Library → Files): the pure rules shared by the backend
 * (`packages/convex/fileFolders.ts`) and the website. Pure: no DOM, no React Native.
 *
 * - A folder is a path like "Etudes/Wilcoxon" ("" is the top level). It exists when a file is in
 *   it (or in a folder under it), or when it was made on its own with New folder.
 * - Tags are short words on a file, any number; the same tag in two spellings counts once
 *   (ignoring case and spaces), like tune tags (`tuneLibrary.ts`).
 */

import { cleanFolder } from "./shedNotes";

export { cleanFolder };

/** Tidies a tag as typed: trimmed, single spaces (the same as a tune tag's `cleanTag`). */
export function cleanTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ").slice(0, 60);
}

/** Most tags one file can have. */
export const MAX_FILE_TAGS = 30;

/** Most folders an account can make on its own. */
export const MAX_FILE_FOLDERS = 2000;

/** Tags compare ignoring case and spacing. */
export const fileTagKey = (tag: string) => tag.trim().replace(/\s+/g, " ").toLowerCase();

/** Tags cleaned up: trimmed, no empty ones, no duplicates ignoring case (the first spelling wins). */
export function cleanTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = cleanTag(raw);
    if (!tag || seen.has(fileTagKey(tag))) continue;
    seen.add(fileTagKey(tag));
    out.push(tag);
    if (out.length >= MAX_FILE_TAGS) break;
  }
  return out;
}

/** Whether `tags` has `tag` (ignoring case). */
export function hasFileTag(tags: readonly string[] | undefined, tag: string): boolean {
  const k = fileTagKey(tag);
  return !!tags?.some((t) => fileTagKey(t) === k);
}

/** "Etudes/Wilcoxon" → "Etudes"; "Etudes" → "" (the top level). */
export function folderParent(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** "Etudes/Wilcoxon" → "Wilcoxon". */
export function folderName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Whether something in `itemFolder` is in `folder` — directly, or (`deep`) in a folder under it
    too. Everything is somewhere under the top level (""). */
export function isInFolder(itemFolder: string, folder: string, deep = false): boolean {
  if (itemFolder === folder) return true;
  if (!deep) return false;
  return folder === "" || itemFolder.startsWith(`${folder}/`);
}

/** "Etudes/Wilcoxon/Book 1" → ["Etudes", "Etudes/Wilcoxon", "Etudes/Wilcoxon/Book 1"]. */
export function folderAncestors(path: string): string[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** Where `path` ends up when folder `from` is renamed or moved to `to` (unchanged when it isn't
    in `from`). */
export function movedFolder(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (from && path.startsWith(`${from}/`)) return cleanFolder(`${to}/${path.slice(from.length + 1)}`);
  return path;
}

/** Where `path` ends up when folder `deleted` is deleted and what's inside moves up one level:
    its files go to its parent, its subfolders become the parent's. */
export function folderAfterDelete(path: string, deleted: string): string {
  const parent = folderParent(deleted);
  if (path === deleted) return parent;
  if (path.startsWith(`${deleted}/`)) return cleanFolder(`${parent}/${path.slice(deleted.length + 1)}`);
  return path;
}

/** Every folder there is: the ones made on their own and the ones files are in, with all their
    parents, A–Z (natural order, so "Book 2" comes before "Book 10"). Never includes "". */
export function allFolderPaths(made: readonly string[], itemFolders: readonly string[]): string[] {
  const out = new Set<string>();
  for (const p of [...made, ...itemFolders]) for (const a of folderAncestors(cleanFolder(p))) out.add(a);
  return [...out].sort(compareFolders);
}

/** A–Z by path, numbers in order, ignoring case. */
export function compareFolders(a: string, b: string): number {
  const pa = a.split("/");
  const pb = b.split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const c = pa[i].localeCompare(pb[i], undefined, { numeric: true, sensitivity: "base" });
    if (c) return c;
  }
  return pa.length - pb.length;
}

/** The folders directly inside `parent` ("" = the top level), from a list of every folder. */
export function childFolders(all: readonly string[], parent: string): string[] {
  return all.filter((p) => folderParent(p) === parent && p !== "");
}

/** Every tag in use with how many files have it, A–Z (the first spelling seen wins). */
export function countFileTags(lists: readonly (readonly string[] | undefined)[]): { tag: string; count: number }[] {
  const byKey = new Map<string, { tag: string; count: number }>();
  for (const tags of lists) {
    for (const tag of tags ?? []) {
      const k = fileTagKey(tag);
      const hit = byKey.get(k);
      if (hit) hit.count++;
      else byKey.set(k, { tag, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }));
}
