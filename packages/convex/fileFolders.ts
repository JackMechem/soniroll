import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { kindArg, ownedItem } from "./files";
import {
  MAX_FILE_FOLDERS,
  cleanFolder,
  cleanTag,
  cleanTags,
  countFileTags,
  fileTagKey,
  folderAfterDelete,
  movedFolder,
} from "@jam-practice/core/fileFolders";
import { folderList, itemsInFolder, itemsWithTag, madeFolders, metaFor, metaRows, rowsInFolder, writeMeta } from "./lib/fileFolders";
import type { StoredKind } from "./lib/storage";

/**
 * Folders and tags for everything on the Files page (uploads, recordings, tune songs, lesson files,
 * hand-ins, profile images — online or kept on a device). An item's folder and tags are a `fileMeta`
 * row; folders made on their own (so they can be empty) are `fileFolders` rows. `files.storage`
 * returns each item's `folder` and `tags` and every folder.
 *
 * For other features (a Shed Log routine or task linked to a folder or a tag): `inFolder`,
 * `withTag` and `overview` here, or the helpers in `lib/fileFolders.ts` from other Convex code.
 * Folder paths look like "Etudes/Wilcoxon"; "" is the top level.
 */

async function me(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to organise your files.");
  return userId;
}

const itemArg = v.object({ kind: kindArg, id: v.string() });

/** Most items one call moves or tags (the Files page's selection). */
const MAX_ITEMS = 500;

async function assertOwned(ctx: QueryCtx, userId: Id<"users">, kind: StoredKind, id: string) {
  if (!(await ownedItem(ctx, userId, kind, id))) throw new Error("File not found.");
}

// ---------------------------------------------------------------- reading

/** Every folder (A–Z, made ones, ones with files and their parents) and every tag with how many
    items have it — for a folder or tag picker. Null when signed out. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return { folders: await folderList(ctx, userId), tags: countFileTags((await metaRows(ctx, userId)).map((m) => m.tags)) };
  },
});

/** The caller's items in a folder ("" = the top level), newest first, each with its `folder`,
    `tags` and download `url` (null when it's kept on a device — wrap the result in the web's
    `useDeviceUrls`). `deep` includes the folders under it. [] when signed out. */
export const inFolder = query({
  args: { folder: v.string(), deep: v.optional(v.boolean()) },
  handler: async (ctx, { folder, deep }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return itemsInFolder(ctx, userId, folder, deep ?? false);
  },
});

/** The caller's items with a tag (ignoring case; several tags = any of them), newest first, shaped
    like `inFolder`'s. [] when signed out. */
export const withTag = query({
  args: { tag: v.union(v.string(), v.array(v.string())) },
  handler: async (ctx, { tag }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return itemsWithTag(ctx, userId, tag);
  },
});

// ---------------------------------------------------------------- items

/** Moves items into a folder ("" = the top level). The folder doesn't have to exist yet. */
export const moveItems = mutation({
  args: { items: v.array(itemArg), folder: v.string() },
  handler: async (ctx, { items, folder }) => {
    const userId = await me(ctx);
    if (items.length > MAX_ITEMS) throw new Error(`Move up to ${MAX_ITEMS} at a time.`);
    const path = cleanFolder(folder);
    for (const { kind, id } of items) {
      await assertOwned(ctx, userId, kind, id);
      await writeMeta(ctx, userId, kind, id, { folder: path });
    }
    return path;
  },
});

/** Replaces one item's tags. */
export const setTags = mutation({
  args: { kind: kindArg, id: v.string(), tags: v.array(v.string()) },
  handler: async (ctx, { kind, id, tags }) => {
    const userId = await me(ctx);
    await assertOwned(ctx, userId, kind, id);
    await writeMeta(ctx, userId, kind, id, { tags });
  },
});

/** Adds tags to several items (keeping the tags they have) and/or takes tags off them. */
export const tagItems = mutation({
  args: { items: v.array(itemArg), add: v.optional(v.array(v.string())), remove: v.optional(v.array(v.string())) },
  handler: async (ctx, { items, add = [], remove = [] }) => {
    const userId = await me(ctx);
    if (items.length > MAX_ITEMS) throw new Error(`Tag up to ${MAX_ITEMS} at a time.`);
    const gone = new Set(remove.map(fileTagKey));
    for (const { kind, id } of items) {
      await assertOwned(ctx, userId, kind, id);
      const row = await metaFor(ctx, userId, kind, id);
      const tags = [...(row?.tags ?? []), ...add].filter((t) => !gone.has(fileTagKey(t)));
      await writeMeta(ctx, userId, kind, id, { tags });
    }
  },
});

// ---------------------------------------------------------------- tags everywhere

/** Renames a tag on every item that has it (to a tag that's already used merges the two). */
export const renameTag = mutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const from = fileTagKey(args.from);
    const to = cleanTag(args.to);
    if (!from || !to) return;
    for (const row of await metaRows(ctx, userId)) {
      if (!row.tags.some((t) => fileTagKey(t) === from)) continue;
      await ctx.db.patch(row._id, { tags: cleanTags(row.tags.map((t) => (fileTagKey(t) === from ? to : t))), updatedAt: Date.now() });
    }
  },
});

/** Takes a tag off every item. The items stay. */
export const deleteTag = mutation({
  args: { tag: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const key = fileTagKey(args.tag);
    for (const row of await metaRows(ctx, userId)) {
      if (!row.tags.some((t) => fileTagKey(t) === key)) continue;
      const tags = row.tags.filter((t) => fileTagKey(t) !== key);
      if (!tags.length && !row.folder) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { tags, updatedAt: Date.now() });
    }
  },
});

// ---------------------------------------------------------------- folders

/** Makes a folder (it can stay empty). "A/B" makes B inside A. Returns its cleaned path. */
export const createFolder = mutation({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const path = cleanFolder(args.path);
    if (!path) throw new Error("Give the folder a name.");
    const rows = await madeFolders(ctx, userId);
    if (rows.some((r) => r.path === path)) return path;
    if (rows.length >= MAX_FILE_FOLDERS) throw new Error("That's as many folders as an account can hold.");
    await ctx.db.insert("fileFolders", { userId, path, createdAt: Date.now() });
    return path;
  },
});

/** Renames or moves a folder; everything in it (files and folders) goes along: "A/B" → "C/B" moves
    B into C. Onto a folder that exists, the two merge. A folder can't go inside itself. */
export const renameFolder = mutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const from = cleanFolder(args.from);
    const to = cleanFolder(args.to);
    if (!from || !to || from === to) return to;
    if (to.startsWith(`${from}/`)) throw new Error("A folder can't go inside itself.");
    const now = Date.now();
    for (const row of await rowsInFolder(ctx, userId, from, true)) {
      await ctx.db.patch(row._id, { folder: movedFolder(row.folder, from, to), updatedAt: now });
    }
    const rows = await madeFolders(ctx, userId);
    const inside = (p: string) => p === from || p.startsWith(`${from}/`);
    const taken = new Set(rows.filter((r) => !inside(r.path)).map((r) => r.path));
    for (const r of rows) {
      if (!inside(r.path)) continue;
      const next = movedFolder(r.path, from, to);
      if (taken.has(next)) await ctx.db.delete(r._id);
      else {
        await ctx.db.patch(r._id, { path: next });
        taken.add(next);
      }
    }
    // Keep the folder itself even when it was only there because of its files.
    if (!taken.has(to)) await ctx.db.insert("fileFolders", { userId, path: to, createdAt: now });
    return to;
  },
});

/** Deletes a folder. What's inside moves up one level — its files into its parent, its folders
    into the parent too — so nothing is lost. (To delete the files as well, the web app deletes them
    one by one first, through `files.removeItem`, which also clears device copies.) */
export const deleteFolder = mutation({
  args: { path: v.string() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const path = cleanFolder(args.path);
    if (!path) return;
    const now = Date.now();
    for (const row of await rowsInFolder(ctx, userId, path, true)) {
      const folder = folderAfterDelete(row.folder, path);
      if (!folder && !row.tags.length) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { folder, updatedAt: now });
    }
    const rows = await madeFolders(ctx, userId);
    const inside = (p: string) => p === path || p.startsWith(`${path}/`);
    const taken = new Set(rows.filter((r) => !inside(r.path)).map((r) => r.path));
    for (const r of rows) {
      if (!inside(r.path)) continue;
      const next = r.path === path ? "" : folderAfterDelete(r.path, path);
      if (!next || taken.has(next)) await ctx.db.delete(r._id);
      else {
        await ctx.db.patch(r._id, { path: next });
        taken.add(next);
      }
    }
  },
});
