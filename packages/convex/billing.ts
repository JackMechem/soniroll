import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Polar } from "@convex-dev/polar";
import { subscriptionsRevoke } from "@polar-sh/sdk/funcs/subscriptionsRevoke.js";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { action, internalAction, internalQuery, query, type QueryCtx } from "./_generated/server";

/**
 * Storage plans, sold through Polar (polar.sh, the merchant of record: it handles payments, sales
 * tax and receipts). Only cloud storage is sold: every tool and feature is free, and a free account
 * keeps its files on the device that saved them (`lib/storage.ts`). A plan keeps them online, on
 * every device.
 *
 * Set up (see docs/notes/storage-plans.md):
 * - Convex env: POLAR_ORGANIZATION_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_SERVER ("sandbox" or
 *   "production"). The webhook is `<deployment>.convex.site/polar/events`.
 * - In Polar, one product per plan and billing period, each with the metadata `storage_gb` (how
 *   many GB it gives). Products without it are ignored, so nothing else in Polar becomes a plan.
 *   Products made before the webhook existed come in with `syncProducts` (run from the CLI).
 */

type UserInfo = { userId: string; email: string };

export const polar: Polar<DataModel> = new Polar<DataModel>(components.polar, {
  getUserInfo: async (ctx): Promise<UserInfo> => {
    const user: UserInfo | null = await ctx.runQuery(internal.billing.signedInUser, {});
    if (!user) throw new Error("Sign in first.");
    return user;
  },
});

export const signedInUser = internalQuery({
  args: {},
  handler: async (ctx): Promise<UserInfo | null> => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    if (!user?.email) return null;
    // Polar only takes addresses that can receive mail, so dev test accounts (`testAccounts.ts`,
    // always `.test`) check out as <name>+test@soniroll.com.
    const email = user.email.endsWith(".test") ? `${user.email.split("@")[0]}+test@soniroll.com` : user.email;
    return { userId: user._id as string, email };
  },
});

const GB = 1024 * 1024 * 1024;

export type StoragePlan = {
  productId: string;
  name: string;
  storageGb: number;
  interval: "month" | "year";
  priceCents: number;
  currency: string;
};

type Product = Awaited<ReturnType<typeof polar.listProducts>>[number];

/** How many GB a Polar product gives (its `storage_gb` metadata), or null if it isn't a plan. */
function storageGbOf(product: Pick<Product, "metadata">): number | null {
  const raw = product.metadata?.storage_gb;
  const gb = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(gb) && gb > 0 ? gb : null;
}

function planOf(product: Product): StoragePlan | null {
  const storageGb = storageGbOf(product);
  const price = product.prices.find((p) => !p.isArchived && p.amountType === "fixed");
  const interval = product.recurringInterval ?? price?.recurringInterval;
  if (!storageGb || !price || (interval !== "month" && interval !== "year")) return null;
  return {
    productId: product.id,
    name: product.name,
    storageGb,
    interval,
    priceCents: price.priceAmount ?? 0,
    currency: price.priceCurrency ?? "usd",
  };
}

async function storagePlans(ctx: QueryCtx): Promise<StoragePlan[]> {
  const products = await polar.listProducts(ctx);
  return products
    .map(planOf)
    .filter((p): p is StoragePlan => !!p)
    .sort((a, b) => a.storageGb - b.storageGb || (a.interval === "month" ? -1 : 1));
}

/** The plans on sale, smallest first (monthly before yearly). Open to anyone: the plans page shows
    them signed out too. Empty until products are set up in Polar. */
export const plans = query({
  args: {},
  handler: async (ctx) => storagePlans(ctx),
});

/** Statuses that still count as paid. `past_due`: a renewal failed and Polar is retrying, so the
    storage stays until the subscription actually ends. */
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export type AccountPlan = {
  /** The plan they pay for, or null on the free plan. */
  plan: (StoragePlan & { status: string; renewsAt: string | null; cancelAtPeriodEnd: boolean }) | null;
  /** Cloud storage in bytes (the free allowance, or the plan's). */
  cloudBytes: number;
};

/** What `userId` pays for and how much cloud storage that gives. Used by `lib/storage.ts`. */
export async function accountPlan(ctx: QueryCtx, userId: Id<"users">, freeBytes: number): Promise<AccountPlan> {
  const sub = await polar.getCurrentSubscription(ctx, { userId });
  if (!sub || !PAID_STATUSES.has(sub.status)) return { plan: null, cloudBytes: freeBytes };
  const plan = planOf(sub.product);
  // A paid product without `storage_gb` (set up by mistake) still gets the free allowance.
  if (!plan) return { plan: null, cloudBytes: freeBytes };
  return {
    plan: { ...plan, status: sub.status, renewsAt: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd },
    cloudBytes: Math.max(freeBytes, plan.storageGb * GB),
  };
}

/** Where Polar sends people back to after paying or managing their plan. `SITE_URL` is the same
    variable Convex Auth uses for the site's address. */
function siteUrl(path: string) {
  const base = (process.env.SITE_URL ?? "https://www.soniroll.com").replace(/\/$/, "");
  return `${base}${path}`;
}

/** Starts a checkout for one of the plans and returns Polar's checkout page to open. */
export const checkout = action({
  args: { productId: v.string() },
  handler: async (ctx, { productId }): Promise<{ url: string }> => {
    const user: UserInfo | null = await ctx.runQuery(internal.billing.signedInUser, {});
    if (!user) throw new Error("Sign in to get a storage plan.");
    const known: boolean = await ctx.runQuery(internal.billing.isPlanProduct, { productId });
    if (!known) throw new Error("That plan isn't on sale any more. Reload the page and pick another.");
    const current: boolean = await ctx.runQuery(internal.billing.hasPlan, { userId: user.userId as Id<"users"> });
    if (current) throw new Error("You already have a plan. Change it from Manage plan.");
    try {
      const session = await polar.createCheckoutSession(ctx, {
        productIds: [productId],
        userId: user.userId,
        email: user.email,
        origin: siteUrl(""),
        successUrl: siteUrl("/plans?welcome=1"),
      });
      return { url: session.url };
    } catch (e) {
      console.error("Polar checkout failed", e);
      throw new Error("The checkout couldn't be opened. Try again in a minute, or send feedback if it keeps happening.");
    }
  },
});

export const isPlanProduct = internalQuery({
  args: { productId: v.string() },
  handler: async (ctx, { productId }) => (await storagePlans(ctx)).some((p) => p.productId === productId),
});

export const hasPlan = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => (await accountPlan(ctx, userId, 0)).plan !== null,
});

/** Polar's own page for changing plan, the card, or cancelling. */
export const portal = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const user: UserInfo | null = await ctx.runQuery(internal.billing.signedInUser, {});
    if (!user) throw new Error("Sign in first.");
    try {
      return await polar.createCustomerPortalSession(ctx, { userId: user.userId, returnUrl: siteUrl("/plans") });
    } catch (e) {
      console.error("Polar customer portal failed", e);
      throw new Error("Your plan's page couldn't be opened. Try again in a minute, or send feedback if it keeps happening.");
    }
  },
});

/** Pulls in products made in Polar before the webhook was set up (or while it was failing):
    `npx convex run billing:syncProducts` (add `--prod` for production). */
export const syncProducts = internalAction({
  args: {},
  handler: async (ctx) => {
    await polar.syncProducts(ctx);
  },
});

/** Ends a deleted account's subscription straight away, so it isn't charged again. Scheduled by
    `account.performDelete` with the subscription's id (the account is gone by the time it runs). */
export const revokeSubscription = internalAction({
  args: { subscriptionId: v.string() },
  handler: async (_ctx, { subscriptionId }) => {
    const result = await subscriptionsRevoke(polar.polar, { id: subscriptionId });
    if (!result.ok) console.error("Couldn't cancel the Polar subscription", subscriptionId, result.error);
  },
});

