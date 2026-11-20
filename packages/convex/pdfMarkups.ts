import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Room for a lot of ink, well under Convex's 1 MiB per document. */
const MAX_DATA = 900_000;

/** The markings on one of the caller's PDF files, as JSON, or null when there are none yet. */
export const get = query({
  args: { fileId: v.id("files") },
  handler: async (ctx, { fileId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("pdfMarkups")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .first();
    if (!row || row.userId !== userId) return null;
    return { data: row.data, updatedAt: row.updatedAt };
  },
});

/** Saves the markings on one of the caller's own PDF files. */
export const save = mutation({
  args: { fileId: v.id("files"), data: v.string() },
  handler: async (ctx, { fileId, data }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save your markings.");
    const file = await ctx.db.get(fileId);
    if (!file || file.userId !== userId) throw new Error("This file isn't yours to mark up.");
    if (data.length > MAX_DATA) throw new Error("There are too many markings on this PDF to save. Clear some and try again.");
    const row = await ctx.db
      .query("pdfMarkups")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .first();
    const updatedAt = Date.now();
    if (row) await ctx.db.patch(row._id, { data, updatedAt });
    else await ctx.db.insert("pdfMarkups", { userId, fileId, data, updatedAt });
    return updatedAt;
  },
});
