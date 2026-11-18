import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { roleOf, staffMe, type Role } from "./lib/roles";
import { DEFAULT_FLAGS, siteFlags, type SiteFlags } from "./lib/site";
import { planFor, storedItems } from "./lib/storage";
import { polar } from "./billing";

/**
 * The admin panel (/admin): feedback and reports, every community post (remove), every account
 * (hide a profile, delete an account).
 *
 * Who can use it:
 * - The **owner**: the account whose email is lib/roles.ts's OWNER_EMAIL *and* has been verified
 *   (`emailVerificationTime` — Convex Auth only sets it once the address is proven by an emailed
 *   code or by Google). Hardcoded on purpose; no env var or setting changes it.
 * - **Admins**: accounts the owner has added to the `admins` table. Only the owner can add or
 *   remove admins. Admins can moderate (inbox, posts, regular accounts) but can't hide or delete
 *   another admin or the owner. Nobody can act on the owner's account from here.
 *
 * Every function checks on the server, so hiding the link in the sidebar isn't the lock.
 */

async function me(ctx: QueryCtx) {
  return staffMe(ctx);
}

async function mustAdmin(ctx: QueryCtx) {
  const m = await me(ctx);
  if (!m) throw new Error("Not allowed.");
  return m;
}

async function mustOwner(ctx: QueryCtx) {
  const m = await me(ctx);
  if (m?.role !== "owner") throw new Error("Only the owner can do that.");
  return m;
}

/** Why the caller can't moderate this account (hide or delete it), or null if they can. */
async function cannotModerate(ctx: QueryCtx, actor: { id: Id<"users">; role: Role }, target: Id<"users">) {
  if (actor.id === target) return "That's you — use Account settings for your own account.";
  const role = await roleOf(ctx, target);
  if (role === "owner") return "The owner's account can't be changed here.";
  if (role === "admin" && actor.role !== "owner") return "Only the owner can do that to another admin.";
  return null;
}

async function personOf(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return {
    id: userId,
    exists: !!user,
    username: profile?.username || null,
    email: user?.email ?? null,
    name: user?.name ?? null,
    avatarUrl: profile?.avatarStorageId ? await ctx.storage.getUrl(profile.avatarStorageId) : null,
  };
}

export const amIAdmin = query({
  args: {},
  handler: async (ctx) => !!(await me(ctx)),
});

/** "owner", "admin", or null — for the panel to show owner-only controls. */
export const myRole = query({
  args: {},
  handler: async (ctx) => (await me(ctx))?.role ?? null,
});

// ---------------------------------------------------------------- overview

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await mustAdmin(ctx);
    const now = Date.now();
    const DAY = 86_400_000;
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const posts = await ctx.db.query("communityTunes").collect();
    const feedback = await ctx.db.query("feedback").collect();
    const pairs = await ctx.db.query("lessonStudents").collect();
    // Sign-ups per day, the last 30 days (oldest first).
    const signups = Array.from({ length: 30 }, (_, i) => {
      const end = now - (29 - i) * DAY;
      return users.filter((u) => u._creationTime > end - DAY && u._creationTime <= end).length;
    });
    return {
      users: users.length,
      newThisWeek: users.filter((u) => u._creationTime > now - 7 * DAY).length,
      publicProfiles: profiles.filter((p) => p.isPublic).length,
      posts: posts.length,
      postsThisWeek: posts.filter((p) => p.createdAt > now - 7 * DAY).length,
      openFeedback: feedback.filter((f) => f.status === "new" || f.status === "seen").length,
      newFeedback: feedback.filter((f) => f.status === "new").length,
      reports: feedback.filter((f) => f.kind === "report" && (f.status === "new" || f.status === "seen")).length,
      teachers: new Set(pairs.map((p) => p.teacherId)).size,
      students: pairs.filter((p) => p.studentId).length,
      signups,
    };
  },
});

// ---------------------------------------------------------------- feedback

// The inbox itself (list, status, notes, links, GitHub issues) is in inbox.ts / inboxCore.ts,
// which also reach the shared inbox on production.

// ---------------------------------------------------------------- posts

export const posts = query({
  args: {},
  handler: async (ctx) => {
    await mustAdmin(ctx);
    const rows = await ctx.db.query("communityTunes").withIndex("by_createdAt").order("desc").take(500);
    const people = new Map<string, Awaited<ReturnType<typeof personOf>>>();
    const reports = await ctx.db.query("feedback").collect();
    return Promise.all(
      rows.map(async (r) => {
        if (!people.has(r.userId)) people.set(r.userId, await personOf(ctx, r.userId));
        return {
          id: r._id,
          title: r.title,
          description: r.description,
          kind: r.kind ?? "tunes",
          tuneCount: Array.isArray(r.tunes) ? r.tunes.length : 0,
          likes: r.likeCount ?? 0,
          unlisted: !!r.unlisted,
          author: people.get(r.userId)!,
          reports: reports.filter((f) => f.kind === "report" && f.target?.type === "post" && f.target.id === r._id && f.status !== "closed" && f.status !== "done")
            .length,
          createdAt: r.createdAt,
        };
      }),
    );
  },
});

/** Removes someone's community post (and its likes). */
export const removePost = mutation({
  args: { id: v.id("communityTunes") },
  handler: async (ctx, { id }) => {
    const actor = await mustAdmin(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    // Your own posts are fine to remove; someone else's follow the same rule as their account.
    if (row.userId !== actor.id) {
      const problem = await cannotModerate(ctx, actor, row.userId);
      if (problem) throw new Error(problem);
    }
    for (const like of await ctx.db
      .query("communityTuneLikes")
      .withIndex("by_post", (q) => q.eq("postId", id))
      .collect())
      await ctx.db.delete(like._id);
    await ctx.db.delete(id);
    // Close open reports about it.
    for (const f of await ctx.db.query("feedback").collect())
      if (f.kind === "report" && f.target?.type === "post" && f.target.id === id && f.status !== "closed")
        await ctx.db.patch(f._id, { status: "done", adminNote: f.adminNote || "Post removed.", updatedAt: Date.now() });
  },
});

// ---------------------------------------------------------------- users

export const users = query({
  args: {},
  handler: async (ctx) => {
    const actor = await mustAdmin(ctx);
    const rows = await ctx.db.query("users").order("desc").take(2000);
    const allPosts = await ctx.db.query("communityTunes").collect();
    return Promise.all(
      rows.map(async (u) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", u._id))
          .first();
        const accounts = await ctx.db
          .query("authAccounts")
          .withIndex("userIdAndProvider", (q) => q.eq("userId", u._id))
          .collect();
        return {
          id: u._id,
          email: u.email ?? null,
          name: u.name ?? null,
          username: profile?.username || null,
          isPublic: !!profile?.isPublic,
          avatarUrl: profile?.avatarStorageId ? await ctx.storage.getUrl(profile.avatarStorageId) : null,
          providers: [...new Set(accounts.map((a) => a.provider))],
          posts: allPosts.filter((p) => p.userId === u._id).length,
          joined: u._creationTime,
          isMe: u._id === actor.id,
          role: await roleOf(ctx, u._id),
        };
      }),
    );
  },
});

/** Takes a profile off public view (they can turn it back on; use delete for abuse). */
export const setProfilePublic = mutation({
  args: { userId: v.id("users"), isPublic: v.boolean() },
  handler: async (ctx, { userId, isPublic }) => {
    const actor = await mustAdmin(ctx);
    const problem = await cannotModerate(ctx, actor, userId);
    if (problem) throw new Error(problem);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (profile) await ctx.db.patch(profile._id, { isPublic });
  },
});

export const checkCanDelete = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const actor = await me(ctx);
    if (!actor) return "Not allowed.";
    if (!(await ctx.db.get(userId))) return "That account is already gone.";
    return await cannotModerate(ctx, actor, userId);
  },
});

/** Deletes someone's account and everything in it — the same full clean-up as deleting your own
    account (profile, posts, library, lessons, files, sign-in). Can't be undone. */
export const deleteUser = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const problem = await ctx.runQuery(internal.admin.checkCanDelete, { userId });
    if (problem) throw new Error(problem);
    await ctx.runMutation(internal.account.performDelete, { userId });
  },
});

// ---------------------------------------------------------------- admins (owner only)

/** Makes an account an admin. Owner only. */
export const grantAdmin = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const owner = await mustOwner(ctx);
    if (!(await ctx.db.get(userId))) throw new Error("That account doesn't exist.");
    if (await roleOf(ctx, userId)) return;
    await ctx.db.insert("admins", { userId, grantedBy: owner.id, grantedAt: Date.now() });
  },
});

/** Takes an account's admin role away. Owner only (the owner's own role can't be removed). */
export const revokeAdmin = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await mustOwner(ctx);
    for (const row of await ctx.db
      .query("admins")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect())
      await ctx.db.delete(row._id);
  },
});

// ---------------------------------------------------------------- mayday (owner only)

/** The switches, for the Mayday tab (any admin can look; only the owner can flip them). */
export const siteSwitches = query({
  args: {},
  handler: async (ctx) => {
    await mustAdmin(ctx);
    const row = await ctx.db
      .query("siteFlags")
      .withIndex("by_key", (q) => q.eq("key", "site"))
      .first();
    const by = row?.updatedBy ? await ctx.db.get(row.updatedBy) : null;
    return { flags: await siteFlags(ctx), updatedAt: row?.updatedAt ?? null, updatedBy: by?.name ?? by?.email ?? null };
  },
});

const flagPatch = v.object({
  maintenance: v.optional(v.boolean()),
  maintenanceMessage: v.optional(v.string()),
  banner: v.optional(v.string()),
  bannerTone: v.optional(v.union(v.literal("info"), v.literal("warning"))),
  communityOff: v.optional(v.boolean()),
  postingPaused: v.optional(v.boolean()),
  signupsPaused: v.optional(v.boolean()),
  uploadsPaused: v.optional(v.boolean()),
  feedbackPaused: v.optional(v.boolean()),
});

export const setSiteFlags = mutation({
  args: { patch: flagPatch },
  handler: async (ctx, { patch }) => {
    const owner = await mustOwner(ctx);
    const current = await siteFlags(ctx);
    const next: SiteFlags = { ...DEFAULT_FLAGS, ...current, ...patch };
    next.maintenanceMessage = next.maintenanceMessage.slice(0, 500);
    next.banner = next.banner.trim().slice(0, 300);
    const row = await ctx.db
      .query("siteFlags")
      .withIndex("by_key", (q) => q.eq("key", "site"))
      .first();
    const doc = { key: "site", flags: next, updatedAt: Date.now(), updatedBy: owner.id };
    if (row) await ctx.db.replace(row._id, doc);
    else await ctx.db.insert("siteFlags", doc);
  },
});

/** Everything back to normal in one go. */
export const resetSiteFlags = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await mustOwner(ctx);
    const row = await ctx.db
      .query("siteFlags")
      .withIndex("by_key", (q) => q.eq("key", "site"))
      .first();
    const doc = { key: "site", flags: DEFAULT_FLAGS, updatedAt: Date.now(), updatedBy: owner.id };
    if (row) await ctx.db.replace(row._id, doc);
    else await ctx.db.insert("siteFlags", doc);
  },
});

/**
 * Signs every account out on every device (deletes their sessions and refresh tokens), except the
 * owner's own sessions. For when an account or password may have leaked. People just sign in again.
 */
export const signEveryoneOut = action({
  args: {},
  handler: async (ctx): Promise<number> => {
    const ownerId = await ctx.runQuery(internal.admin.ownerIdForAction, {});
    if (!ownerId) throw new Error("Only the owner can do that.");
    let total = 0;
    for (;;) {
      const n: number = await ctx.runMutation(internal.admin.deleteSessionsBatch, { keep: ownerId });
      total += n;
      if (n === 0) break;
    }
    return total;
  },
});

export const ownerIdForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    const m = await me(ctx);
    return m?.role === "owner" ? m.id : null;
  },
});

export const deleteSessionsBatch = internalMutation({
  args: { keep: v.id("users") },
  handler: async (ctx, { keep }) => {
    let n = 0;
    for (const session of await ctx.db
      .query("authSessions")
      .filter((q) => q.neq(q.field("userId"), keep))
      .take(100)) {
      for (const t of await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect())
        await ctx.db.delete(t._id);
      await ctx.db.delete(session._id);
      n++;
    }
    return n;
  },
});

// ---------------------------------------------------------------- storage plans (troubleshooting)

const DAY = 24 * 60 * 60 * 1000;

/** Adds whole calendar months to a time (Jan 31 + 1 month = the last day of February). */
function addMonths(time: number, months: number) {
  const d = new Date(time);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

/** One account's storage, for the admin page: what it keeps online and on devices, its paid plan
    (from Polar, with a link to the customer there), and its gifts. Staff can see it; only the
    owner can change gifts. */
export const userStorage = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const actor = await mustAdmin(ctx);
    const { plan, gift, cloudBytes } = await planFor(ctx, userId);
    const items = await storedItems(ctx, userId, false);
    const customer = await polar.getCustomerByUserId(ctx, userId).catch(() => null);
    const sub = await polar.getCurrentSubscription(ctx, { userId }).catch(() => null);
    const sandbox = (process.env.POLAR_SERVER ?? "sandbox") !== "production";
    const gifts = await ctx.db.query("planGifts").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const giver = new Map<string, string | null>();
    for (const g of gifts) if (!giver.has(g.grantedBy)) giver.set(g.grantedBy, (await personOf(ctx, g.grantedBy)).username);
    return {
      canEdit: actor.role === "owner",
      quota: cloudBytes,
      online: items.reduce((s, i) => s + (i.device ? 0 : i.size), 0),
      onDevices: items.reduce((s, i) => s + (i.device ? i.size : 0), 0),
      onlineCount: items.filter((i) => !i.device).length,
      deviceCount: items.filter((i) => i.device).length,
      plan,
      subscription: sub ? { status: sub.status, productName: sub.product.name, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, currentPeriodEnd: sub.currentPeriodEnd } : null,
      polarCustomerUrl: customer ? `https://${sandbox ? "sandbox." : ""}polar.sh/dashboard/soniroll/customers/${customer.id}` : null,
      activeGiftId: gift?.id ?? null,
      gifts: gifts
        .sort((a, b) => b.startsAt - a.startsAt)
        .map((g) => ({
          id: g._id,
          storageGb: g.storageGb,
          startsAt: g.startsAt,
          endsAt: g.endsAt,
          ended: !!g.ended || g.endsAt <= Date.now(),
          note: g.note ?? null,
          grantedBy: giver.get(g.grantedBy) ?? null,
        })),
    };
  },
});

/** Gives an account a storage plan for `months` (owner only). A gift already running is replaced. */
export const giftPlan = mutation({
  args: { userId: v.id("users"), storageGb: v.number(), months: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, { userId, storageGb, months, note }) => {
    const actor = await mustOwner(ctx);
    if (!(await ctx.db.get(userId))) throw new Error("That account doesn't exist.");
    const gb = Math.round(storageGb * 10) / 10;
    const n = Math.round(months);
    if (!(gb > 0 && gb <= 1000)) throw new Error("Pick a size between 0.1 and 1000 GB.");
    if (!(n >= 1 && n <= 36)) throw new Error("Pick between 1 and 36 months.");
    const now = Date.now();
    for (const g of await ctx.db.query("planGifts").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) {
      if (!g.ended && g.endsAt > now) await ctx.db.patch(g._id, { ended: true, endsAt: now });
    }
    const endsAt = addMonths(now, n);
    const id = await ctx.db.insert("planGifts", {
      userId,
      storageGb: gb,
      startsAt: now,
      endsAt,
      grantedBy: actor.id,
      ...(note?.trim() ? { note: note.trim().slice(0, 200) } : {}),
    });
    await ctx.scheduler.runAt(endsAt, internal.admin.expireGift, { giftId: id });
    return id;
  },
});

/** Adds months to a running gift (owner only). */
export const extendGift = mutation({
  args: { giftId: v.id("planGifts"), months: v.number() },
  handler: async (ctx, { giftId, months }) => {
    await mustOwner(ctx);
    const g = await ctx.db.get(giftId);
    if (!g || g.ended || g.endsAt <= Date.now()) throw new Error("That gift has already ended. Give a new one.");
    const n = Math.round(months);
    if (!(n >= 1 && n <= 36)) throw new Error("Pick between 1 and 36 months.");
    const endsAt = addMonths(g.endsAt, n);
    await ctx.db.patch(giftId, { endsAt });
    await ctx.scheduler.runAt(endsAt, internal.admin.expireGift, { giftId });
  },
});

/** Ends a gift now (owner only). Files already online stay there; nothing more goes online
    beyond the free space (or a paid plan). */
export const endGift = mutation({
  args: { giftId: v.id("planGifts") },
  handler: async (ctx, { giftId }) => {
    await mustOwner(ctx);
    const g = await ctx.db.get(giftId);
    if (g && !g.ended) await ctx.db.patch(giftId, { ended: true, endsAt: Math.min(g.endsAt, Date.now()) });
  },
});

/** Runs when a gift's time is up (scheduled for `endsAt`; an extension schedules a later one, and
    this earlier run then does nothing). Marking it ended refreshes everything that reads the plan. */
export const expireGift = internalMutation({
  args: { giftId: v.id("planGifts") },
  handler: async (ctx, { giftId }) => {
    const g = await ctx.db.get(giftId);
    if (g && !g.ended && g.endsAt <= Date.now() + DAY / 24 / 60) await ctx.db.patch(giftId, { ended: true });
  },
});
