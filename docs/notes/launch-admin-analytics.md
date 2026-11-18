<!-- Moved word for word from the old single PROJECT.md (lines 8083–8316) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Launch prep: feedback, reports, an admin panel, link previews (2026-10-17, web)

Before sharing sheddex with friends and family (a few hundred people).

**Feedback.** A **Report a bug** pill sits in the bottom-right corner of every page
(`components/feedback/FeedbackFab.tsx`, mounted in `AppChrome`, z-45, above the safe area); its
little × hides it on that device (localStorage `jam-practice-feedback-fab-hidden`; rendered hidden on
the server so it never flashes; `showFeedbackFab()` brings it back). `ToolLayout`'s bottom-right
credit line moved up to clear it. People can also send feedback from: the sidebar's ⋮ menu ("Send feedback"; on
phones it's an icon in the menu header), `/feedback`, and the footers of the landing page and
dashboard.
- **The form** (`components/feedback/FeedbackForm.tsx`) offers three kinds: Something's broken,
  An idea, Something else.
- **What's attached:** the page and the browser's user agent always go with the message. Signed in,
  you can add a screenshot (≤10 MB); signed out, there's an optional reply-to email.
- **Reports:** post pages and other people's profiles have a **Report** button, which opens the
  same form in report mode with the post or profile attached.
- **The dialog** is `FeedbackDialog`, mounted once in `AppChrome`. Open it from anywhere with
  `openFeedback({kind?, target?})` (a `sheddex:open-feedback` window event).
- **On `/feedback`,** signed-in people see what they've sent and its status.
- **Backend:** `packages/convex/feedback.ts` (`submit`, which allows 10 an hour per account;
  `generateUploadUrl`; `mine`) and a `feedback` table (kind, message, page, userAgent, screenshotId,
  target, status new|seen|planned|done|closed, adminNote).
- **Account deletion** removes the account's feedback and its screenshots.

**Admin panel** (`/admin`, `components/admin/AdminPage.tsx`, `packages/convex/admin.ts`).
- **Who gets in:**
  - The **owner**: `OWNER_EMAIL` (hardcoded in `admin.ts`, "mechemjack@gmail.com") **and** that
    email verified (`users.emailVerificationTime`, which Convex Auth only sets after an emailed code
    or Google proves the address). No env var or setting changes this. Nothing in the app writes
    `users.email`.
  - **Admins**: accounts the owner adds (table `admins`, `{userId, grantedBy, grantedAt}`;
    `grantAdmin` / `revokeAdmin`, owner only; Users tab → Make admin / Remove admin, with a
    type-the-username confirm). Admins can do everything else in the panel, except act on another
    admin's or the owner's account or posts (`cannotModerate`). Nobody can act on the owner, or on
    themselves, from the panel. Account deletion removes the `admins` row.
  - `myRole` returns "owner" | "admin" | null; `users` returns each account's `role`.
  - Every query and mutation checks this on the server, so the hidden link isn't the only lock.
  - Verified on dev with @jack2 made admin then removed: it couldn't grant itself, revoke, or
    delete or hide the owner; the owner couldn't delete themselves.
- **Non-admins** see "Nothing here". The page has noindex set. The admin gets an "Admin" button
  above the account row in the sidebar (desktop, collapsed and phone menu; `AdminButton` in
  `Sidebar.tsx`) and an "Admin" item in the ⋮ menus (`lib/useIsAdmin.ts`); neither renders for
  anyone else.
- **Tabs** (kept in `?tab=`):
  - **Overview:** accounts, posts, inbox and open reports cards; 30-day sign-ups chart; public
    profiles, teachers and students; latest inbox items; newest accounts.
  - **Inbox:** filter by status and kind, search; set the status; a private note (saved on blur);
    Reply (mailto with the message quoted); the screenshot (click to enlarge); device; delete.
    Reports show the target with Open and Remove post.
  - **Posts:** every Community post with its author, likes and report count; "Reported only"; open
    it; remove it (`removePost` deletes its likes and marks reports about it done).
  - **Users:** every account with email, username, public/private, sign-in methods, post count and
    join date. **Make private** (`setProfilePublic`). **Delete** asks you to type their username,
    then `deleteUser` (an action) runs the same full cascade as deleting your own account
    (`account.performDelete`). You can't delete yourself or another admin.
- Lists cap at 500 feedback items, 500 posts and 2,000 accounts. They need paging past that.

**Link previews:**
- `app/layout.tsx` metadata now has `metadataBase` (from `NEXT_PUBLIC_SITE_URL`, else
  https://sheddex.com), a title template ("%s · sheddex"; the pages' own " · sheddex" suffixes were
  removed), a real description, and openGraph/twitter (`summary_large_image`).
- `app/opengraph-image.tsx` draws the card: the logo from `Logo.tsx`'s exported paths, a tagline
  and tool chips, at 1200×630.

**Legal and docs:**
- Terms: rewrote "Your content", which said recordings never leave the browser (no longer true).
  Added "Community and moderation" (rules, reports, removal at discretion).
- Privacy: added "Feedback and reports" and "Administration" (the admin can see account
  emails/usernames and remove posts and accounts, and doesn't browse private data).
- Both contact sections point at `/feedback`. README rewritten.

**Checked:** the git history has no committed `.env` files or API keys (`.env*` is gitignored).

**Verified:**
- Convex dev push; `amIAdmin` is true for Jack, and @jack2 is refused.
- `tsc`, `eslint`, `pnpm build`.
- In nix Chromium, signed in as Jack: sent a feedback, saw it in the overview and inbox; the Posts
  and Users tabs with real data; 390 px with no overflow; no console errors. The test feedback was
  deleted afterwards.
- The OG image renders.

**Not verified:** removing a real post and deleting a real account from the panel (not done on
purpose), the screenshot upload, the Report flow end to end, and the 10-an-hour limit.

#### Launch checklist (only Jack can do these)

1. **Deploy prod.** The newest backend (lessons, booking, feedback, admin, …) is on the **dev**
   Convex deployment only. A Vercel production build runs `convex deploy` and pushes it to prod.
   Watch that build's log, then check `/admin` on sheddex.com.
2. **Fix the email sender.** Prod `AUTH_EMAIL_FROM` is still `jackshed <noreply@jackshed.com>`, so
   every sign-up code and password-reset email says "jackshed".
   - Verify sheddex.com in Resend (its DNS records).
   - Then run `npx convex env set AUTH_EMAIL_FROM 'sheddex <noreply@sheddex.com>' --prod`, and the
     same without `--prod` for dev.
   - Send yourself a sign-up code to check it.
3. **Google sign-in on prod.** In Google Cloud Console, publish the OAuth consent screen ("In
   production"). While it's in "Testing", only listed test users can sign in with Google.
4. **Limits:**
   - Resend's free plan sends 100 emails a day (3,000 a month), and a sign-up wave can hit that.
   - Check Convex's free-tier bandwidth and storage in the dashboard after the first few days.
     Recordings and sample files are the big items.
5. **Test the real thing on prod** with a fresh email: sign up, sign in on another device, send
   feedback, report a post, and see it in `/admin`.
6. **Backups:** turn on Convex's periodic backups for prod (Dashboard → Backups) before the user
   count grows.

### Mayday switches (2026-10-17, web; backend dev deployed)

Admin → **Mayday** (`components/admin/Mayday.tsx`). The flags live in one `siteFlags` row (key
"site"; `packages/convex/lib/site.ts`: `SiteFlags`, `siteFlags`, `communityHidden`,
`assertUploadsOpen`). Only the **owner** can flip them (`admin.setSiteFlags`, `resetSiteFlags`); other
admins see them read-only. Roles moved to `packages/convex/lib/roles.ts` (`OWNER_EMAIL`, `roleOf`,
`staffMe`, `isStaff`), and `admin.ts` uses them.
- **Maintenance mode**: everyone who isn't staff sees `MaintenanceScreen` (logo, "Back soon", your
  message). `AppChrome` renders only that screen (`useMaintenance`), so nothing of the app mounts,
  split screen included. `/reset-password` stays reachable. The screen has an **Admin sign in**
  button (the app's `SignInModal`); signed in as a non-admin, it says so and offers Sign out.
  This is client-side only (the tools run in the browser anyway); the backend keeps working.
- **Community off**: on the server, every `communityTunes` read returns empty/null, likes and posting
  refuse, and `profiles.getPublicByUsername` / `search` and the shared setlist / routine links
  return nothing. Staff are exempt, so they can moderate. `SiteGate` (in `AppChrome`) shows "Community
  is taking a break" on `/community*`, `/post`, `/u`, `/setlist`, `/routine`, and on
  `/setlist-charts?post|shared`.
- **Pause posting** (`communityTunes.create` refuses; New post shows a notice).
- **Pause sign-ups**: Convex Auth's `callbacks.afterUserCreatedOrUpdated` in `auth.ts` throws for a
  brand-new user. It runs in the user-creating transaction, so no account is made. Covers email and
  Google. The sign-up form shows a notice.
- **Pause uploads**: `assertUploadsOpen` is in all five `generate*UploadUrl` mutations (profiles,
  recordings — also used for tune songs —, feedback, lessons files, hand-ins).
- **Pause feedback**: `feedback.submit` refuses; the form shows a notice and the bug button hides.
- **Announcement banner** (text, info / warning): `SiteBanner` floats at the top of every page.
  Closing it hides that exact text on the device (localStorage `jam-practice-banner-dismissed`).
  Staff also see a red "Mayday on: …" pill linking to the tab.
- **Sign everyone out** (an action): deletes every `authSessions` row and its refresh tokens, 100
  at a time, except the owner's own.
- **Automatic limits, always on**: 10 Community posts a day per account (staff exempt;
  `MAX_POSTS_PER_DAY`), and 30 signed-out feedback messages an hour site-wide
  (`MAX_ANON_PER_HOUR`).
- `site.status` (open to anyone) gives the web app the flags plus `staff` (`lib/useSiteStatus.ts`).

Verified on dev:
- Only the owner can flip (@jack2 was refused). With the flags on, a signed-out caller and @jack2
  got an empty feed while the owner still saw it; uploads and feedback were refused.
- In nix Chromium, signed out: the maintenance screen showed; Admin sign in → Jack → the site came
  back with the Mayday pill. The Community-off page and the banner showed, and the tools still
  worked. `resetSiteFlags` put everything back.
- `tsc` and `eslint` (web, convex).

Not exercised: pause sign-ups with a real new account, and Sign everyone out (only reasoned
through, not run on dev).

### Analytics and anonymous usage counts (2026-10-17, web; backend dev deployed)

**Usage counts** (new): `packages/convex/usage.ts` `track` mutation.
- **What's stored:** one `usageDaily` row per UTC day × kind × key, holding only `n` and `ms`.
  Kinds: `visit` (key "account" / "guest"), `view` (page path), `play` (tool started), `time` (tool
  running ms). No user id, device id or IP.
- **What's refused:** bad kinds or keys (a path regex), anything past 40 events a call, and anything
  from staff (checked on the server).
- **Sending** (`apps/web/lib/usage.ts`):
  - queues events and sends them in batches through `components/UsageTracker.tsx`, mounted in
    `AppChrome`: ~5 s after something is queued, every 30 s, and when the tab hides;
  - one visit per browser per local day (localStorage `jam-practice-visit-day`);
  - page views per route, with ids taken out (`normalizePath`: `/post/[id]`, `/u/[username]`…);
  - tool starts and run time come from `lib/toolTime.ts`'s `useToolActivity`, the same "the tool is
    actually running" signal the Shed Log uses.
- **Skipped:** blocked until auth and site status are known, and skipped for staff and for browsers
  with Do Not Track or Global Privacy Control.
- The privacy policy was rewritten shorter, with a "Usage counts" section. It used to say "no
  analytics", and that recordings stay in the browser; neither was true any more.

**Admin → Analytics** (`components/admin/Analytics.tsx`) reads from
`packages/convex/adminAnalytics.ts` `analytics({days})`.
- **How it reads:** an action, staff only, that pages through each table with the internal `scan`
  query (1,000 rows a page; usage 2,000), and through the Shed Log blobs with `scanPractice` (40 a
  page, minutes per log day via `minutesOn`, plus tool minutes from `sessions[].tool`).
- **What it returns:** per-day series and breakdowns:
  - accounts: signups, sign-ins, active accounts (distinct users with a session or refresh token
    that day);
  - Community: posts, likes, follows, shared setlists;
  - content: recordings and their minutes, charts added;
  - Lessons: students, items, bookings;
  - feedback;
  - usage: visits (signed in or not), page views, tool starts and minutes;
  - practice: minutes and people practising;
  - breakdowns: tools, pages, sign-in methods, instruments, post kinds, feedback kinds.
- **On the page:**
  - The range is 7 / 30 / 90 / 180 / 365 days; it fetches twice the range for the "vs before"
    comparisons.
  - KPI cards with sparklines and the change against the previous period.
  - Customizable chart cards: any of 22 metrics; line, area, bars or stacked bars; daily, weekly or
    monthly; running total; full width; title; reorder; remove; add. Saved per device in
    `jam-practice-admin-charts`, with "Reset charts to the defaults". Legend chips hide a series,
    and hovering shows a tooltip.
  - Breakdown cards as bars or a donut (tools by starts, minutes or Shed Log minutes).
  - All charts are plain SVG, no chart library; the y-axis steps are 1 / 2 / 2.5 / 5 × 10ⁿ
    (`niceStep`).
- Days are UTC, except practice, which uses each person's log days.

Verified:
- `track` rejected a junk key and ignored an owner call; signed out, `analytics` was refused.
- In nix Chromium, a signed-out visit counted its visit, page views, a Metronome start and run time
  (after the 5 s send was added — before it, a short visit lost its tool start).
- The tab rendered with real dev data; customizing (stacked, weekly, added a metric) saved to
  storage; the tooltip and axis ticks were right; no horizontal overflow at 390 px.
- `next build`.
- The test usage rows were cleared (`convex import --replace` with an empty file).

### Landing page: new screenshots and a teaching section (2026-10-18, web)

- **Screenshots:** `public/landing/v3/` (`SHOTS = "v3"` in `Landing.tsx`; `v2` deleted). Shots: `app`
  (dashboard, 1440×900), `setlist` (1024×640), `phone` (390×700), `split` (Metronome + Tuner,
  1050×550), and the new `lessons` and `lesson` (1280×800). All are light + dark at 2× (a
  `deviceScaleFactor: 2` context, signed in to Jack's **dev** account inside the script).
- **What was masked before each shot:** the account email, the scrollbars, the sidebar chevron, the
  bug button and the intros. A few test names were swapped in the page text: "Another test
  Setlist" → "Friday night gig", "@jack2" → "@maya.plays", "Test Student" → "Sam Rivera".
- **The lesson shots** used a temporary demo pair: Jack teaching "Maya Chen" (@jack2 joined), four
  dated lessons, notes, two charts and two assignments. It was deleted afterwards with
  `lessons.removeStudent`.
- **Teaching section:** `TeachingSection` (nav link "Teaching", `#teaching`): a heading and intro,
  the student-page shot with the lesson-page shot overlapping it, then four points across.
- **Retaking:** use a new folder (`v4`) and bump `SHOTS`.

**Sidebar (same day):**
- Admin is in the ⋮ menus again (desktop, collapsed, phone; admins only), and the always-visible
  Admin button was removed.
- The account row lost its ⋮ (Sign out is on the Account page).
- The sidebar's Recent row was removed; Community / Tunes / Lessons are bolder cards with a "Tools"
  heading under them.
- A faint chevron at the page's top-left (`SidebarToggle`) hides and shows the sidebar.
- The resize handle is a 16px grab strip with a faint pill; double-click resets the width.
- Width: min 220, default 244.


### Feedback IDs and linked commits/PRs (2026-10-20)

- `feedback.number` (index `by_number`) → shown as `FB-<n>`: assigned on submit (`nextNumber`),
  and older feedback is numbered oldest-first by `ensureNumbers` (run from submit and, once, by the
  admin inbox via `admin.ensureFeedbackNumbers`). The sender sees it after sending and on
  `/feedback`.
- `feedback.links`: commits and PRs (`kind`, `ref`, `url`, `title`, `merged`). Added by hand on the
  admin card (`admin.addFeedbackLink` parses a hash, `#12` or a GitHub link —
  `packages/convex/lib/github.ts`), removed with ×, searchable.
- GitHub webhook `POST /github-webhook` (`http.ts`): HMAC-checked with `GITHUB_WEBHOOK_SECRET`;
  push and pull_request events; `FB-n` links, "fixes FB-n" on main marks done
  (`feedback.linkWork`). Setup in `docs/guides/deploying.md`.
- Checked: 13 Node checks on the parsing and the signature; the route answers 503 on dev (no
  secret yet); the inbox in the harness (IDs assigned oldest first, linking a hash and `#7`, the
  error for junk, search by ID, 1200 and 390 with no overflow). Not checked: a real GitHub
  delivery (the webhook isn't set up), signed in on the real admin page.
- **Pick… (same day):** each card's Pick… opens a dialog of the repo's recent commits (branch
  select, default `preview`) and pull requests, from GitHub's API via the admin-only action
  `github.recentWork` (public repo; optional `GITHUB_TOKEN` for the rate limit), cached 5 minutes
  in the page; a click links one with its title. Checked against real GitHub data (60 commits on
  preview, 8 PRs) in the harness at 1200 and 390; the action itself not run signed in.
- **Pick… moved to the browser (same day):** the Convex action hit "rate limit reached" straight
  away — GitHub's unauthenticated limit is per IP, and Convex's servers are shared. The picker now
  calls GitHub's API from the page (`lib/githubWork.ts`, CORS allowed, 5-minute cache; the
  message says when the limit resets), and `convex/github.ts` is gone. Checked live from the
  harness page: 60 commits, 8 PRs.

### Shared inbox, GitHub issues, version (2026-10-20)

- **Version:** `feedback.version` ("0.9.6 beta", sent by the form), on the card and in issues.
- **Shared inbox** (`convex/inbox.ts`, `inboxCore.ts`, `inboxForward.ts`): production holds the
  list. With `FEEDBACK_HUB_URL` + `FEEDBACK_HUB_SECRET` set, a deployment's new bugs/ideas/notes
  are stored locally without a number and `inbox.forward` (scheduled; retries with backoff) sends
  them, with the screenshot as base64, to production's `POST /feedback-hub` (secret header), which
  stores them with `source` and a `sender` snapshot and returns the FB-number (written back
  locally, so `/feedback` shows it). The admin inbox is now actions (`inbox.list`, `inbox.apply`,
  `inbox.createIssue`, `inbox.moveToShared`) on every deployment — `components/admin/useInbox.ts`
  polls every 15 s and refreshes after each change. Rows carry `where` ("shared"/"here"). The old
  admin feedback query/mutations are gone.
- **GitHub issues:** never automatic. `createIssueHere` (on the deployment holding the list, with
  `GITHUB_TOKEN`) writes title, quoted message, ID, kind, version, page link, device, and the
  screenshot only when asked; labels `bug` / `enhancement`. Link existing: the picker lists the
  repo's issues from the browser (`lib/githubWork.ts`), or `#45` / a link. The webhook's `issues`
  event closes/reopens the linked feedback.
- Checked: tsc (web, convex, mobile), lint, build; the hub endpoint on dev with a temporary secret
  (list with the version field, 401 with a wrong secret, readable 400s; secret removed after);
  the inbox in the harness (version and source on the card, the create panel's wording and
  screenshot box → `includeScreenshot: true`, the issue chip, the issue picker against the real
  repo — which has no issues yet). **Not checked:** forwarding between two real deployments,
  creating a real issue (no token here, and it would be public), a real webhook delivery.
- **Closed issues close the feedback (same day):** a GitHub issue closed (completed or not
  planned) sets its feedback to **Closed**; reopened → Planned (`issueStatus` in `inboxCore.ts`,
  used by the webhook's `issues` event and the new `issueState` change). The admin inbox also
  checks linked issues against GitHub's list when it loads (browser, 5-minute cache) and applies
  any difference, so it works without the webhook. Checked in the harness against the real repo
  (#11 open on GitHub corrected a stale "closed").
- **Merged or closed PRs close the feedback (same day):** a PR that's linked to a feedback,
  mentions its FB-number, or points at its GitHub issue (`#11`) closes it when merged or closed
  (`applyPrState` / `prEvent` in `inboxCore.ts`; the webhook's `pull_request` event — the old
  "fixes FB-n merged into main → done" rule for PRs is replaced). Each PR link now stores its last
  `state`, so a feedback reopened by hand isn't closed again by the same PR. The admin inbox does
  the same check against GitHub's PR list when it loads. Checked in the harness with the real
  merged PR #8 (closed the feedback once, nothing on the next refresh) and the `#n` / `FB-n`
  parsing in Node.

## 2026-11-18 — Bug button in the tool header

Jack asked for the floating bottom-right "Report a bug" button to move to the top bar. Now
`FeedbackHeaderButton` (in `FeedbackFab.tsx`) sits at the right end of `ToolLayout`'s desktop
header, after Log; phones keep `FeedbackBarButton` in the app's top bar. The floating `FeedbackFab`
is only on the landing page now; other app pages have Send feedback in the sidebar's ⋮ menu. The
same hide switch (Settings → General, `jam-practice-feedback-fab-hidden`) hides all of them.
