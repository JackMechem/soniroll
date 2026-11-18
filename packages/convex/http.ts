import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { feedbackRefs, issueRefs, validSignature } from "./lib/github";
import { hub } from "./inbox";
import { polar } from "./billing";
import { resignForComponent, validPolarSignature } from "./lib/polarWebhook";

const http = httpRouter();

auth.addHttpRoutes(http);

// Polar's webhook (`/polar/events`): keeps storage plans' products and subscriptions up to date.
// The component's own route can't check Polar's current `whsec_` signatures, so this route checks
// them (`lib/polarWebhook.ts`) and passes the request, re-signed, to the component's handler.
type RawHttpHandler = (ctx: ActionCtx, request: Request) => Promise<Response>;
let polarHandler: RawHttpHandler | null = null;
polar.registerRoutes({
  route: ({ handler }: { handler: { _handler?: RawHttpHandler } }) => {
    polarHandler = handler._handler ?? null;
  },
} as unknown as Parameters<typeof polar.registerRoutes>[0]);

http.route({
  path: "/polar/events",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.POLAR_WEBHOOK_SECRET ?? "";
    if (!secret || !polarHandler) return new Response("Not set up", { status: 503 });
    const body = await req.text();
    if (!(await validPolarSignature(body, req.headers, secret))) return new Response("Forbidden", { status: 403 });
    return polarHandler(ctx, await resignForComponent(body, req.headers, secret, req.url));
  }),
});

const MAIN = "main";

/**
 * GitHub webhook (repo Settings → Webhooks: `<deployment>.convex.site/github-webhook`, JSON, the
 * secret in the GITHUB_WEBHOOK_SECRET env var, events: pushes, pull requests and issues). A commit
 * message or PR title/description that mentions FB-<number> links it to that feedback; "fixes
 * FB-<number>" in a commit marks it done once it's pushed to main. A PR that's linked to a feedback,
 * mentions its FB-number or points at its GitHub issue (#11) closes it when merged or closed, and
 * closing a feedback's GitHub issue closes it too (reopening moves it back to planned).
 */
http.route({
  path: "/github-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) return new Response("Not set up", { status: 503 });
    const body = await req.text();
    if (!(await validSignature(secret, body, req.headers.get("x-hub-signature-256")))) return new Response("Bad signature", { status: 401 });
    const event = req.headers.get("x-github-event");
    const payload = JSON.parse(body) as Record<string, unknown>;
    const now = Date.now();
    let linked = 0;

    if (event === "push") {
      const onMain = payload.ref === `refs/heads/${MAIN}`;
      const commits = (payload.commits ?? []) as { id: string; message: string; url: string }[];
      for (const c of commits) {
        const { mentioned, fixes } = feedbackRefs(c.message);
        for (const number of mentioned) {
          const title = c.message.split("\n")[0];
          await ctx.runMutation(internal.feedback.linkWork, {
            number,
            link: { kind: "commit", ref: c.id.slice(0, 7), url: c.url, title, at: now },
            done: onMain && fixes.includes(number),
          });
          linked++;
        }
      }
    } else if (event === "issues") {
      // An issue made from feedback closed (or reopened) on GitHub: the feedback follows.
      const action = payload.action;
      const issue = payload.issue as { number: number; state: string };
      if (action === "closed" || action === "reopened") {
        await ctx.runMutation(internal.inboxCore.setStatusForIssue, { issueNumber: issue.number, state: issue.state });
        linked++;
      }
    } else if (event === "pull_request") {
      // A PR opened, edited, merged or closed: feedback it's linked to, mentions (FB-12) or whose
      // issue it points at (#11) follows — merged or closed closes the feedback.
      const pr = payload.pull_request as { number: number; html_url: string; title: string; body: string | null; merged: boolean; state: string };
      const text = `${pr.title}\n${pr.body ?? ""}`;
      await ctx.runMutation(internal.inboxCore.prEvent, {
        url: pr.html_url,
        ref: `#${pr.number}`,
        title: pr.title,
        state: pr.merged ? "merged" : pr.state,
        fbRefs: feedbackRefs(text).mentioned,
        issueRefs: issueRefs(text),
      });
      linked++;
    }
    return new Response(JSON.stringify({ ok: true, linked }), { status: 200, headers: { "content-type": "application/json" } });
  }),
});

/** The shared feedback inbox (production): other deployments send and read feedback here. */
http.route({ path: "/feedback-hub", method: "POST", handler: hub });

export default http;
