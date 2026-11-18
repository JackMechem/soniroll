import { v } from "convex/values";
import { assertUploadsOpen } from "./lib/site";
import { MAX_FILE_BYTES, assertFits, assertHasRoom, assertPlanForOnline } from "./lib/storage";
import { cleanDevice } from "./files";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";

/**
 * The Recorder tool's recordings — private to their owner. Online (a storage plan): the usual two
 * steps (`generateUploadUrl`, then POST the file there, then `create` with the returned
 * `storageId`). On the device (free accounts): the web app keeps the audio and calls `create` with
 * `device` and `size` instead (see `lib/storage.ts`). Deleting a recording deletes its file too.
 */

const MAX_NAME = 120;
const MAX_NOTES = 20000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const mixValidator = v.object({ songVolume: v.number(), takeVolume: v.number(), offsetSec: v.number() });

function cleanMix(mix: { songVolume: number; takeVolume: number; offsetSec: number }) {
  const vol = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 1);
  return {
    songVolume: vol(mix.songVolume),
    takeVolume: vol(mix.takeVolume),
    offsetSec: Number.isFinite(mix.offsetSec) ? Math.min(36000, Math.max(-36000, mix.offsetSec)) : 0,
  };
}

async function withUrl(ctx: QueryCtx, row: Doc<"recordings">) {
  return {
    _id: row._id,
    name: row.name,
    notes: row.notes,
    durationSec: row.durationSec,
    mimeType: row.mimeType,
    tuneId: row.tuneId ?? null,
    mix: row.mix ?? null,
    logDate: row.logDate ?? null,
    routineId: row.routineId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    /** Null when it's only on a device (`device`). */
    url: row.storageId ? await ctx.storage.getUrl(row.storageId) : null,
    device: row.device ?? null,
  };
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await assertUploadsOpen(ctx);
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save recordings.");
    // Recordings and songs only go online with a storage plan.
    await assertPlanForOnline(ctx, userId);
    await assertHasRoom(ctx, userId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    /** Online, or `device` + `size` for a take kept on this device. */
    storageId: v.optional(v.id("_storage")),
    device: v.optional(v.object({ key: v.string(), label: v.string() })),
    size: v.optional(v.number()),
    name: v.string(),
    notes: v.optional(v.string()),
    durationSec: v.number(),
    mimeType: v.string(),
    tuneId: v.optional(v.string()),
    mix: v.optional(mixValidator),
    logDate: v.optional(v.string()),
    routineId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save recordings.");
    let where: { storageId: Id<"_storage"> } | { device: { key: string; label: string }; size: number };
    if (args.storageId) {
      await assertPlanForOnline(ctx, userId, args.storageId);
      await assertFits(ctx, userId, args.storageId);
      where = { storageId: args.storageId };
    } else if (args.device) {
      const size = Math.max(0, Math.round(args.size ?? 0));
      if (size > MAX_FILE_BYTES) throw new Error(`Recordings can be up to ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
      where = { device: cleanDevice(args.device), size };
    } else throw new Error("The recording didn't arrive — try again.");
    const now = Date.now();
    return await ctx.db.insert("recordings", {
      userId,
      ...where,
      name: args.name.trim().slice(0, MAX_NAME) || "Recording",
      notes: (args.notes ?? "").slice(0, MAX_NOTES),
      durationSec: Math.max(0, args.durationSec),
      mimeType: args.mimeType,
      ...(args.tuneId ? { tuneId: args.tuneId } : {}),
      ...(args.mix ? { mix: cleanMix(args.mix) } : {}),
      ...(args.logDate && DATE_RE.test(args.logDate) ? { logDate: args.logDate } : {}),
      ...(args.routineId ? { routineId: args.routineId.slice(0, 100) } : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Every recording of the caller's, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("recordings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return Promise.all(rows.map((row) => withUrl(ctx, row)));
  },
});

/** The caller's recordings linked to one tune, newest first. */
export const listForTune = query({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("recordings")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .order("desc")
      .collect();
    return Promise.all(rows.map((row) => withUrl(ctx, row)));
  },
});

/** The caller's Shed Log recordings from `from` to `to` (YYYY-MM-DD, inclusive), oldest day first. */
export const listForLogRange = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("recordings")
      .withIndex("by_user_logDate", (q) => q.eq("userId", userId).gte("logDate", from).lte("logDate", to))
      .collect();
    return Promise.all(rows.map((row) => withUrl(ctx, row)));
  },
});

/** Every recording of one Shed Log routine, newest first. */
export const listForRoutine = query({
  args: { routineId: v.string() },
  handler: async (ctx, { routineId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("recordings")
      .withIndex("by_user_routine", (q) => q.eq("userId", userId).eq("routineId", routineId))
      .order("desc")
      .collect();
    return Promise.all(rows.map((row) => withUrl(ctx, row)));
  },
});

export const get = query({
  args: { id: v.id("recordings") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId) return null;
    return withUrl(ctx, row);
  },
});

/** Rename, edit notes, link/unlink a tune (`tuneId: null` unlinks), or change how it plays over
    the tune's song (`mix`). */
export const update = mutation({
  args: {
    id: v.id("recordings"),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
    tuneId: v.optional(v.union(v.string(), v.null())),
    mix: v.optional(mixValidator),
    logDate: v.optional(v.union(v.string(), v.null())),
    routineId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { id, name, notes, tuneId, mix, logDate, routineId }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId) throw new Error("Recording not found.");
    await ctx.db.patch(id, {
      ...(name !== undefined ? { name: name.trim().slice(0, MAX_NAME) || "Recording" } : {}),
      ...(notes !== undefined ? { notes: notes.slice(0, MAX_NOTES) } : {}),
      ...(tuneId !== undefined ? { tuneId: tuneId ?? undefined } : {}),
      ...(mix ? { mix: cleanMix(mix) } : {}),
      ...(logDate !== undefined ? { logDate: logDate && DATE_RE.test(logDate) ? logDate : undefined } : {}),
      ...(routineId !== undefined ? { routineId: routineId ?? undefined } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("recordings") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId) return;
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    // Its link (`files.shareItem`), if it had one.
    for (const share of await ctx.db
      .query("sharedFiles")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("kind", "recording").eq("itemId", id))
      .collect())
      await ctx.db.delete(share._id);
  },
});
