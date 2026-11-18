import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

/**
 * Test accounts for trying signed-in flows without a real inbox: an email + password account with
 * the email already verified (so no code is emailed) and a private profile. Only addresses ending
 * in `.test` (a domain that can never receive mail), so it can't create or take over a real
 * person's account. Internal: run it from the command line on the dev deployment:
 *
 *   npx convex run testAccounts:create '{"email":"someone@soniroll.test","password":"…","username":"someone"}'
 *
 * Delete one like any account (Account → Delete account), which removes everything it made.
 */

export const create = internalAction({
  args: { email: v.string(), password: v.string(), username: v.string() },
  handler: async (ctx, { email, password, username }): Promise<string> => {
    const clean = email.trim().toLowerCase();
    if (!clean.endsWith(".test")) throw new Error("Test accounts must use an address ending in .test.");
    if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
    if (await ctx.runQuery(internal.testAccounts.exists, { email: clean })) return `${clean} already exists`;
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: clean, secret: password },
      profile: { email: clean, name: username },
    });
    await ctx.runMutation(internal.testAccounts.finish, { userId: user._id, email: clean, username });
    return `created ${clean} (@${username})`;
  },
});

export const exists = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) =>
    !!(await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first()),
});

export const finish = internalMutation({
  args: { userId: v.id("users"), email: v.string(), username: v.string() },
  handler: async (ctx, { userId, email, username }) => {
    const now = Date.now();
    // Sign-in with a password asks for an emailed code until the email is verified.
    await ctx.db.patch(userId, { emailVerificationTime: now });
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
      .first();
    if (account) await ctx.db.patch(account._id, { emailVerified: email });
    await ctx.db.insert("profiles", { userId, username, instruments: [], isPublic: false, updatedAt: now });
  },
});
