import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { ResendOTP } from "./ResendOTP";
import { ResendPasswordReset } from "./ResendPasswordReset";
import { siteFlags } from "./lib/site";
import type { QueryCtx } from "./_generated/server";

// Google only actually works once AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET are set on the deployment
// (`npx convex env set ...`) and the matching OAuth Client ID's redirect URI is configured in
// Google Cloud Console — see PROJECT.md. Listing it here before that's done is harmless; the
// "Continue with Google" button just won't work until the env vars exist.
//
// `verify: ResendOTP` requires confirming a 6-digit code emailed to the address before a
// password sign-up (or any not-yet-verified account's next sign-in) actually completes — same
// prerequisite as Google: needs AUTH_RESEND_KEY set before it can actually send anything.
//
// `reset: ResendPasswordReset` is "forgot password": it emails a one-time link to the web app's
// `/reset-password` page (see that file).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ verify: ResendOTP, reset: ResendPasswordReset }), Google],
  callbacks: {
    // Where Google sends people back to. The desktop app (apps/desktop) signs in through the
    // system browser and listens on a one-off local address (`http://127.0.0.1:<port>/`) for the
    // code; the code is useless without the verifier the app kept, so allowing that address is
    // safe. Everything else keeps Convex Auth's own rule: a path on SITE_URL.
    async redirect({ redirectTo }) {
      if (/^http:\/\/127\.0\.0\.1:\d{1,5}\/$/.test(redirectTo)) return redirectTo;
      const base = (process.env.SITE_URL ?? "").replace(/\/$/, "");
      if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) return `${base}${redirectTo}`;
      if (redirectTo.startsWith(base)) {
        const after = redirectTo[base.length];
        if (after === undefined || after === "?" || after === "/") return redirectTo;
      }
      throw new Error(`Invalid redirectTo ${redirectTo}`);
    },
    // Mayday → "Pause sign-ups": refuse brand-new accounts. This runs in the same transaction
    // that creates the user, so throwing here means the account is never made.
    async afterUserCreatedOrUpdated(ctx, { existingUserId }) {
      if (existingUserId) return;
      if ((await siteFlags(ctx as unknown as QueryCtx)).signupsPaused) throw new Error("New sign-ups are paused right now.");
    },
  },
});
