import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { kindArg } from "./files";
import { type StoredKind, storedItemById } from "./lib/storage";

/** Room for a lot of ink, well under Convex's 1 MiB per document. */
const MAX_DATA = 900_000;

/** Which PDF: an upload by `fileId` (the original form), or any item in the caller's Files by
    `kind` + `id` (a lesson file, a hand-in, …; kind "file" is the same as `fileId`). */
const target = { fileId: v.optional(v.id("files")), kind: v.optional(kindArg), id: v.optional(v.string()) };
type Target = { fileId?: Id<"files">; kind?: StoredKind; id?: string };

/** The row holding the caller's markings on that PDF (uploads by `fileId`, the rest by `item`). */
async function findRow(ctx: QueryCtx, userId: Id<"users">, t: Target) {
  const fileId = t.fileId ?? (t.kind === "file" && t.id ? ctx.db.normalizeId("files", t.id) : null);
  if (fileId) {
    const row = await ctx.db
      .query("pdfMarkups")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .first();
    return { fileId, item: undefined, row: row && row.userId === userId ? row : null };
  }
  if (!t.kind || !t.id) return null;
  const item = `${t.kind}:${t.id}`;
  const row = await ctx.db
    .query("pdfMarkups")
    .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("item", item))
    .first();
  return { fileId: undefined, item, row };
}

/** The markings on one of the caller's PDFs, as JSON, or null when there are none yet. */
export const get = query({
  args: target,
  handler: async (ctx, t) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const found = await findRow(ctx, userId, t);
    if (!found?.row) return null;
    return { data: found.row.data, updatedAt: found.row.updatedAt };
  },
});

/** Saves the markings on one of the caller's own PDFs. */
export const save = mutation({
  args: { ...target, data: v.string() },
  handler: async (ctx, { data, ...t }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save your markings.");
    const found = await findRow(ctx, userId, t);
    const owned = found?.fileId
      ? (await ctx.db.get(found.fileId))?.userId === userId
      : !!(t.kind && t.id && (await storedItemById(ctx, userId, t.kind, t.id, false)));
    if (!found || !owned) throw new Error("This file isn't yours to mark up.");
    if (data.length > MAX_DATA) throw new Error("There are too many markings on this PDF to save. Clear some and try again.");
    const updatedAt = Date.now();
    if (found.row) await ctx.db.patch(found.row._id, { data, updatedAt });
    else if (found.fileId) await ctx.db.insert("pdfMarkups", { userId, fileId: found.fileId, data, updatedAt });
    else await ctx.db.insert("pdfMarkups", { userId, item: found.item, data, updatedAt });
    return updatedAt;
  },
});
