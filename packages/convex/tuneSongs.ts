import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { MAX_FILE_BYTES, assertFits } from "./lib/storage";
import { cleanDevice } from "./files";
import type { Id } from "./_generated/dataModel";

/**
 * A tune's song: an audio file of the actual recording, uploaded to play behind your takes of
 * that tune (see `recordings.mix`). One per tune, private to its owner. Online: upload the file
 * with `recordings.generateUploadUrl`, then `set` it with the `storageId`; on the device (free
 * accounts), `set` it with `device` and `size`. Replacing or removing one deletes the old file.
 */

const MAX_NAME = 200;

/** The song for one of the caller's tunes, with a playable URL, or null. */
export const getForTune = query({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("tuneSongs")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .first();
    if (!row) return null;
    return {
      _id: row._id,
      tuneId: row.tuneId,
      name: row.name,
      mimeType: row.mimeType,
      durationSec: row.durationSec,
      createdAt: row.createdAt,
      /** Null when it's only on a device (`device`). */
      url: row.storageId ? await ctx.storage.getUrl(row.storageId) : null,
      device: row.device ?? null,
    };
  },
});

export const set = mutation({
  args: {
    tuneId: v.string(),
    storageId: v.optional(v.id("_storage")),
    device: v.optional(v.object({ key: v.string(), label: v.string() })),
    size: v.optional(v.number()),
    name: v.string(),
    mimeType: v.string(),
    durationSec: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to add a song.");
    const existing = await ctx.db
      .query("tuneSongs")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", args.tuneId))
      .collect();
    // The old song is about to be deleted, so its space counts as free.
    let replacing = 0;
    for (const row of existing) if (row.storageId) replacing += (await ctx.db.system.get(row.storageId))?.size ?? 0;
    let where: { storageId: Id<"_storage"> } | { device: { key: string; label: string }; size: number };
    if (args.storageId) {
      await assertFits(ctx, userId, args.storageId, replacing);
      where = { storageId: args.storageId };
    } else if (args.device) {
      const size = Math.max(0, Math.round(args.size ?? 0));
      if (size > MAX_FILE_BYTES) throw new Error(`Songs can be up to ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
      where = { device: cleanDevice(args.device), size };
    } else throw new Error("The song didn't arrive — try again.");
    for (const row of existing) {
      if (row.storageId) await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
    return await ctx.db.insert("tuneSongs", {
      userId,
      tuneId: args.tuneId,
      ...where,
      name: args.name.trim().slice(0, MAX_NAME) || "Song",
      mimeType: args.mimeType,
      durationSec: Math.max(0, args.durationSec),
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const rows = await ctx.db
      .query("tuneSongs")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .collect();
    for (const row of rows) {
      if (row.storageId) await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
  },
});
