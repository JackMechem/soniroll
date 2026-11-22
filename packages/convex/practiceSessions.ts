import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import type { PracticeSession } from "@jam-practice/core/practiceTimer";

const segmentValidator = v.object({ id: v.string(), title: v.string(), minutes: v.number(), tool: v.optional(v.string()) });
const pomodoroValidator = v.object({
  workMinutes: v.number(),
  shortBreakMinutes: v.number(),
  longBreakMinutes: v.number(),
  workTitles: v.array(v.string()),
  cyclesBeforeLongBreak: v.number(),
  totalCycles: v.union(v.number(), v.null()),
});

/** A `practiceSessions` row shaped as the client's own `PracticeSession` type (the Convex
    document id doubling as `PracticeSession.id`), so callers on the UI side never have to know
    the sync source of a session they're looking at. */
function toPracticeSession(row: Doc<"practiceSessions">): PracticeSession {
  if (row.type === "pomodoro") {
    return {
      id: row._id,
      name: row.name,
      type: "pomodoro",
      pomodoro: row.pomodoro!,
      updatedAt: row.updatedAt,
    };
  }
  return {
    id: row._id,
    name: row.name,
    type: "custom",
    segments: row.segments ?? [],
    updatedAt: row.updatedAt,
  };
}

/** All of the signed-in user's saved sessions, newest-first. `[]` (not an error) when signed out —
    callers that only want this while signed in should gate on `useConvexAuth()` themselves. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<PracticeSession[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("practiceSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map(toPracticeSession).sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** Creates a new saved session and returns its id (used as the new `PracticeSession.id` on the
    client immediately, so a freshly-saved session doesn't wait on a round-trip to know its own
    id). */
export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("custom"), v.literal("pomodoro")),
    segments: v.optional(v.array(segmentValidator)),
    pomodoro: v.optional(pomodoroValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    return await ctx.db.insert("practiceSessions", { userId, updatedAt: Date.now(), ...args });
  },
});

/** Overwrites an existing saved session in place (rename, re-edit segments/Pomodoro config, or
    just a bumped `updatedAt`). Silently does nothing if `id` isn't one of this user's own rows —
    same "can't touch what isn't yours" shape as the rest of this codebase's user-scoped
    mutations. */
export const update = mutation({
  args: {
    id: v.id("practiceSessions"),
    name: v.string(),
    type: v.union(v.literal("custom"), v.literal("pomodoro")),
    segments: v.optional(v.array(segmentValidator)),
    pomodoro: v.optional(pomodoroValidator),
  },
  handler: async (ctx, { id, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) return;
    // Clear whichever of segments/pomodoro doesn't apply to the (possibly just-changed) type,
    // rather than leaving stale data from a prior type sitting in the row unused.
    await ctx.db.patch(id, {
      ...fields,
      segments: fields.type === "custom" ? fields.segments : undefined,
      pomodoro: fields.type === "pomodoro" ? fields.pomodoro : undefined,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("practiceSessions") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) return;
    await ctx.db.delete(id);
  },
});
