import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { allFolderPaths, cleanFolder, cleanTags, fileTagKey, isInFolder } from "@jam-practice/core/fileFolders";
import { storedItemById, storedItems, type StoredItem, type StoredKind } from "./storage";

/**
 * Folders and tags on stored items (the `fileMeta` and `fileFolders` tables). Helpers for any
 * Convex function that needs a user's files by folder or tag — the Files page, and (next) a Shed Log
 * routine or task linked to a folder or a tag. The public queries and mutations are in
 * `../fileFolders.ts`.
 */

/** A stored item with where it's filed. */
export type OrganizedItem = StoredItem & { folder: string; tags: string[] };

const itemKey = (kind: string, id: string) => `${kind}:${id}`;

/** Every `fileMeta` row of one user (small: only items that have a folder or tags). */
export async function metaRows(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("fileMeta")
    .withIndex("by_user_item", (q) => q.eq("userId", userId))
    .collect();
}

/** `kind:id` → its row, for joining onto `storedItems`. */
export async function metaMap(ctx: QueryCtx, userId: Id<"users">) {
  return new Map((await metaRows(ctx, userId)).map((m) => [itemKey(m.kind, m.itemId), m] as const));
}

/** One item's row, if it has one. */
export async function metaFor(ctx: QueryCtx, userId: Id<"users">, kind: StoredKind, itemId: string) {
  return ctx.db
    .query("fileMeta")
    .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("kind", kind).eq("itemId", itemId))
    .first();
}

/** Sets an item's folder and/or tags (left out = unchanged). The row is deleted once it has
    neither. Doesn't check that the item is the user's — callers do (`files.ownedItem`). */
export async function writeMeta(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: StoredKind,
  itemId: string,
  change: { folder?: string; tags?: string[] },
) {
  const row = await metaFor(ctx, userId, kind, itemId);
  const folder = change.folder !== undefined ? cleanFolder(change.folder) : (row?.folder ?? "");
  const tags = change.tags !== undefined ? cleanTags(change.tags) : (row?.tags ?? []);
  if (!folder && !tags.length) {
    if (row) await ctx.db.delete(row._id);
    return;
  }
  if (row) await ctx.db.patch(row._id, { folder, tags, updatedAt: Date.now() });
  else await ctx.db.insert("fileMeta", { userId, kind, itemId, folder, tags, updatedAt: Date.now() });
}

/** Forgets an item's folder and tags (it was deleted). */
export async function dropMeta(ctx: MutationCtx, userId: Id<"users">, kind: StoredKind, itemId: string) {
  const rows = await ctx.db
    .query("fileMeta")
    .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("kind", kind).eq("itemId", itemId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

/** Folders made on their own (New folder). */
export async function madeFolders(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("fileFolders")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

/** The rows whose folder is `folder` or (`deep`) anywhere under it, through the index. For the top
    level that's every row, so callers handle "" themselves. */
export async function rowsInFolder(ctx: QueryCtx, userId: Id<"users">, folder: string, deep: boolean): Promise<Doc<"fileMeta">[]> {
  const exact = await ctx.db
    .query("fileMeta")
    .withIndex("by_user_folder", (q) => q.eq("userId", userId).eq("folder", folder))
    .collect();
  if (!deep) return exact;
  // Everything starting "folder/": "/" is just below "0", so this range is exactly those paths.
  const under = await ctx.db
    .query("fileMeta")
    .withIndex("by_user_folder", (q) => q.eq("userId", userId).gte("folder", `${folder}/`).lt("folder", `${folder}0`))
    .collect();
  return [...exact, ...under];
}

/** Resolves rows to their items (dropping ones whose item is gone), newest first. */
async function resolve(ctx: QueryCtx, userId: Id<"users">, rows: Doc<"fileMeta">[], withUrls: boolean): Promise<OrganizedItem[]> {
  const out: OrganizedItem[] = [];
  for (const row of rows) {
    const item = await storedItemById(ctx, userId, row.kind as StoredKind, row.itemId, withUrls);
    if (item) out.push({ ...item, folder: row.folder, tags: row.tags });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The user's items in a folder ("" = the top level), newest first; `deep` includes every folder
 * under it. A named folder reads only its own rows (through `by_user_folder`), so it stays quick
 * however many files the account has; the top level has to read everything.
 */
export async function itemsInFolder(ctx: QueryCtx, userId: Id<"users">, folder: string, deep = false, withUrls = true): Promise<OrganizedItem[]> {
  const path = cleanFolder(folder);
  if (!path) {
    const meta = await metaMap(ctx, userId);
    return (await storedItems(ctx, userId, withUrls))
      .map((item) => {
        const m = meta.get(itemKey(item.kind, item.id));
        return { ...item, folder: m?.folder ?? "", tags: m?.tags ?? [] };
      })
      .filter((item) => isInFolder(item.folder, "", deep));
  }
  return resolve(ctx, userId, await rowsInFolder(ctx, userId, path, deep), withUrls);
}

/** The user's items with a tag (ignoring case), newest first. With several tags, items with any
    of them (like the Files page's tag pills). */
export async function itemsWithTag(ctx: QueryCtx, userId: Id<"users">, tags: string | string[], withUrls = true): Promise<OrganizedItem[]> {
  const keys = new Set((Array.isArray(tags) ? tags : [tags]).map(fileTagKey).filter(Boolean));
  if (!keys.size) return [];
  const rows = (await metaRows(ctx, userId)).filter((m) => m.tags.some((t) => keys.has(fileTagKey(t))));
  return resolve(ctx, userId, rows, withUrls);
}

/** Every folder the user has (made ones, ones items are in, and their parents), A–Z. Rows whose
    item is gone still count here (cheap, and rare: every delete path drops them). */
export async function folderList(ctx: QueryCtx, userId: Id<"users">) {
  const made = (await madeFolders(ctx, userId)).map((f) => f.path);
  const used = (await metaRows(ctx, userId)).map((m) => m.folder).filter(Boolean);
  return allFolderPaths(made, used);
}
