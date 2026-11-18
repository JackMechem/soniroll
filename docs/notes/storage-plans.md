# Storage plans, and files kept on devices (2026-11-17, branch `feature/storage-plans`)

Jack: storing big files (recordings, PDFs, images) costs him money, so cloud storage becomes a paid
subscription. Everything else stays free and **no feature is lost**: free accounts keep their files on
the device that saved them; a plan keeps them online, on every device. Several plan sizes. Payments
through **Polar** (merchant of record: it handles payments, sales tax/VAT and receipts). Persistent
browser storage is requested; existing users are warned about the move and told to back up. The
plans page compares the website, the desktop app and a plan.

## The model

- **Files, recordings and tune songs** (`files`, `recordings`, `tuneSongs`) are either online
  (`storageId`, Convex file storage) or on a device (`device: { key, label }`; `storageId` missing).
  The **row stays in Convex either way** (name, size, tune, Shed Log day, mix…), so lists, tunes, the
  Shed Log, search and links between things work on every device; only the data is local. On another
  device a row shows "On Firefox on Linux" and won't open there. This is the "no functionality lost,
  only sync" promise in practice.
- **Always online:** lesson files, hand-ins, profile pictures/banners (other people see them), a file
  shared by link (sharing a device file puts it online first: `moveOnline`), and anything in a Shed
  Note or lesson notes (`keepOnline` flag; note pastes are always uploaded online).
- **Limits** (`packages/convex/lib/storage.ts`): only online bytes count. Free: `FREE_CLOUD_BYTES` =
  **50 MB** (for sharing, Lessons, notes, the profile). Plan: its `storage_gb`. `quotaFor` reads the
  plan (`planFor` → `billing.accountPlan`); a broken subscription record falls back to the free
  allowance rather than blocking uploads. `MAX_FILE_BYTES` (100 MB per file) applies to device files
  too.
- **Where new things go:** online with a plan, on the device without one (`lib/storagePlan.ts`
  `savesOnline`, `placeBlob`; `lib/files.ts` `saveFile`). Used by the Files uploader, a tune's Files,
  the Recorder's save dialog and the tune song panel. The server doesn't refuse online uploads from
  free accounts (old desktop builds and the paused mobile app still upload online); the 50 MB limit
  bounds them.
- **Web vs desktop:** not artificially limited. The web keeps files in IndexedDB (browsers can clear
  it: clearing site data, Safari after 7 days away, low disk); the desktop app's WebView storage is
  its own and isn't cleared with a browser's data. That difference is what the plans page shows.

## Backend

- `convex.config.ts` (new): installs the `@convex-dev/polar` component (0.9.2). `@polar-sh/sdk` is
  **pinned to 0.49.0**: SDK v1 changed its exports (`@polar-sh/sdk/core.js` is gone) and the
  component imports the 0.x paths.
- `billing.ts` (new): the `Polar` client; `plans` (public: products whose Polar **metadata
  `storage_gb`** is set, with fixed monthly/yearly prices — no product ids in code); `accountPlan`
  (active / trialing / past_due count as paid); `checkout({productId})` (checks it's a plan and that
  the account has none, success URL `SITE_URL/plans?welcome=1`); `portal` (Polar's customer portal:
  change plan, card, receipts, cancel); `syncProducts` (internal: `npx convex run
  billing:syncProducts`, for products made before the webhook worked); `revokeSubscription`
  (internal). Polar only accepts emails whose domain takes mail, so dev test accounts (`.test`) check
  out as `<name>+test@soniroll.com`. Checkout/portal failures are logged and shown as a plain message.
- `http.ts`: the webhook at `<deployment>.convex.site/polar/events`. **Polar's secrets are now
  `whsec_<base64>` and sign with the decoded bytes, but the component's pinned 0.x SDK only tries the
  secret's raw text**, so every real delivery got 403. `lib/polarWebhook.ts` checks the signature
  with both keys (as Polar's v1 SDK does), then re-signs the request with the raw text and calls the
  component's own handler (captured from `registerRoutes` via the route's `_handler`, so the
  component still stores products and subscriptions). If the component or Convex changes that
  shape, the route answers 503 rather than accepting unchecked requests.
- `/plans` strips the `customer_session_token` Polar adds to the return address.
- `account.performDelete`: schedules `billing.revokeSubscription` for an active plan (Polar's own
  customer row in the component's tables is left; it holds only Polar's id and our user id).
- `files.ts`: `storage` returns `used` (online), `onDevices`, `quota`, `freeQuota`, `plan`;
  `storagePlan` (light: plan, quota, used, `toMove` = free-plan online files/recordings/songs not
  shared and not in notes, `userId`); `createOnDevice`; `moveOnline` (upload → `assertFits` → patch);
  `moveToDevice` (deletes the online copy, drops its links; refuses `keepOnline`); `keepOnline`;
  `markNoteFiles` (one-off backfill, below). Shared tunes/setlists list only online files and takes.
  `recordings.create` and `tuneSongs.set` take `storageId` **or** `device` + `size`.

## Web

- `lib/deviceFiles.ts`: the IndexedDB store (`jam-practice-device-files`, keyed by `key`, each
  tagged with the account id as `owner`); `saveOnDevice` (asks `navigator.storage.persist()`),
  `deviceFile`, `deleteOnDevice`, `tidyDeviceFiles` (the Files page deletes this account's device
  files that no row lists any more — deleted or moved online from anywhere), `deviceLabel()`,
  `inDesktopApp()` (`__TAURI_INTERNALS__`). **`useDeviceUrls(rows)` / `useDeviceUrl(row)`** fill in a
  `blob:` URL for rows kept on this device, so every player/preview/download works unchanged — wrap
  any new query of files, recordings or songs with it.
- `lib/storageMove.ts`: `useStorageMoves` (moveToDevice / moveOnline), `useDeviceCopy` (free accounts
  saving someone's shared file or tune files download them to the device instead of the server copy),
  `downloadEverything` (a .zip via the existing `lib/zip.ts`).
- Files page: the move panel (below), a line saying where new files go, badges (This device / the
  other device's name / Online on the free plan for what will move), ⋮ **Put online** and **Keep on
  this device only**, the share dialog explains putting a device file online. Recordings on another
  device show `OnOtherDevice` instead of a player. The tune share dialog says how many device files
  aren't included. The note file picker puts a device file online and marks it `keepOnline`.
- `/plans` (`components/plans/PlansPage.tsx`, also in the desktop router): the plan (usage, renews/
  ends, Manage plan) or the plans (monthly/yearly switch, "saves $x"), the website / desktop app /
  plan comparison (cards on phones, a table from `sm`), and whether this browser agreed to keep files
  (with a button to ask). Checkout and the portal open in the same tab on the web and in the system
  browser in the desktop app. Linked from the account menus, ⌘K ("Storage plans"), the storage meter
  beside the Library title (now online use), the Files page and the move notice.
- **Making plans known** (Jack: "it should probably be making the plans more prominent"): **Storage
  plans** in the sidebar's ⋮ menus (a sidebar row was tried, then removed: Jack wants the sidebar's
  foot to be only Settings and Support soniroll); the dashboard's support card
  ("a coffee or a storage plan…", a Storage plans button); "Get a storage plan" first under Other ways
  to help on `/support`; the landing page's "$0" tile ("every tool free… Storage plans are
  optional", linked); and on the free plan a `KeptHereHint` line ("Recordings are kept on this
  device. Get them on all your devices") in the save-recording dialog and under a tune's files.
- Help (`files` topic, Shed Notes' pictures), privacy policy (where files are kept, Polar, storage
  plans) and terms (storage plans section; the service is free, plans optional) updated.

## Moving existing users (the migration)

- `DEVICE_MOVE_DATE` in `lib/storagePlan.ts` (**2027-01-31, a placeholder for Jack to set**).
- A card at the bottom of every page (not the Library/plans pages) for free accounts with `toMove`
  files: "Files are moving to your devices on …. Back up your N files (X MB) or move them now.
  Review". Closing it hides it for a week. The Files page panel explains it (every feature still
  works, only syncing these files needs a plan), with **Download a backup** (a .zip of what's still
  online), **Move to this device**, and See storage plans.
- **Nothing is deleted automatically.** After the date, online files on free accounts just keep
  working; deleting or forcing them to devices is a later decision and isn't built.
- **Run once per deployment:** `npx convex run files:markNoteFiles` (`--prod` for production) marks
  files/recordings/songs already in Shed Notes or lesson notes as `keepOnline`. Run on dev (marked 1).

## Polar sandbox on dev (set up 2026-11-17)

- Organization `soniroll` in the **sandbox**. Dev Convex env: `POLAR_ORGANIZATION_TOKEN` (the sandbox
  token Jack gave), `POLAR_SERVER=sandbox`, `POLAR_WEBHOOK_SECRET` (piped from the API, never
  printed). `SITE_URL` is `http://localhost:3000` on dev.
- Webhook endpoint `235671df-d161-4824-b648-3dc423b5efb7` → `https://befitting-cobra-264.convex.site/
  polar/events` (product, subscription, order.paid, customer.state_changed events).
- Products (metadata `storage_gb`; placeholder prices to adjust): 5 GB $2/mo `8d920763…`, $20/yr
  `18bf55cb…`; 25 GB $5/mo `df676c96…`, $50/yr `b63d48ba…`; 100 GB $12/mo `e09e887c…`, $120/yr
  `18e802be…`.

## Setting up Polar (Jack)

Test in Polar's **sandbox** first (a separate account at sandbox.polar.sh), on the dev deployment:
1. Create an organization access token (scopes listed in the component's README: products,
   subscriptions, customers, checkouts, checkout links, customer portal, customer sessions — read and
   write). `npx convex env set POLAR_ORGANIZATION_TOKEN …`, `POLAR_SERVER sandbox` (or `production`).
2. Webhook: `https://<deployment>.convex.site/polar/events`, events `product.created`,
   `product.updated`, `subscription.created`, `subscription.updated`. `npx convex env set
   POLAR_WEBHOOK_SECRET …`.
3. Products: one per size and period (e.g. 5 GB monthly, 5 GB yearly…), recurring, fixed price, with
   metadata `storage_gb` = the size. Made before the webhook: run `billing:syncProducts` signed in as
   the owner (or from the dashboard).
4. `SITE_URL` must be the site's address (Convex Auth already uses it).
Then the same on prod with `POLAR_SERVER production`. Polar's own generic setup prompt (Next.js
routes, `.env`) doesn't apply: the webhook and keys live in Convex.

## Before charging anyone

- **The Rhodes (jRhodes3d) is CC BY-NC** — get Jeff Learman's permission or swap it first.
- Refund policy: the terms say nothing about refunds yet (Polar has its own); Jack to decide.
- Deploy the backend to prod, turn on Convex backups.

## Verified

- `tsc` (web, desktop, convex, mobile), eslint on every changed file, `pnpm build`, Convex push to dev
  (schema accepted: the new fields are optional), the backfill on dev.
- In nix Chromium, signed in as Jack on dev (view only, nothing clicked): `/plans` at 1440 light and
  390 dark (no overflow; "Plans aren't on sale yet" since Polar isn't set up), the Files page (move
  panel: 5 files, 16 MB; badges; the plan line) at 1440 and 390, the bottom notice on the dashboard
  at 1440 and 390.

- **The free-plan file flow, end to end**, in its own browser context as a dev test account
  (`demo@soniroll.test`, @storagedemo, made with `testAccounts:create`): upload → saved on the device
  (badge "This device", 1 IndexedDB entry) → preview shows the image from a `blob:` URL → Put online
  (badge Online, the device copy deleted, meter 74 B of 50 MB, the move panel counts it) → Download a
  backup (a valid .zip, `Files/demo-pic.png`) → Keep on this device only (back to 1 entry) → Share a
  link (the dialog's note, then the link made and the file online) → Stop sharing → back to the device
  → a second, fresh browser context sees it as "Chrome on Linux" → Delete (row gone, IndexedDB empty).
  No page errors. Headless Chrome didn't grant persistent storage (`persisted: false`), as expected.

- **Polar sandbox, end to end**, as the demo account in its own browser context: `/plans` lists the six
  plans → Get 5 GB → Polar's sandbox checkout (test card 4242…) → back to `/plans?welcome=1` → the
  webhook stored the subscription → "Your plan: 5 GB · $20 a year · renews November 17, 2027". With
  the plan, an upload went online (no device copy; meter "74 B of 5.0 GB online"). Manage plan opened
  Polar's portal (subscription Active). Through the API: cancel at period end → still 5 GB,
  `cancelAtPeriodEnd` true; revoke → back to free (50 MB). Every webhook delivery 202.

## Not verified

- Recordings and tune songs saved to the device (the Recorder needs a mic; same code path as files),
  Move to this device in bulk, saving someone's shared file or tune on the free plan, the note file
  picker putting a device file online, `tidyDeviceFiles` after a delete on another device.
- Polar **production** (only the sandbox), renewals and failed payments (`past_due`), changing plan
  in the portal, account deletion revoking a real subscription, and the desktop app opening checkout
  in the system browser.
- The desktop app (its WebView's IndexedDB and opening checkout in the browser), Safari, real phones.

## 2026-11-17 — Plans in the Account page; checkout over the page; plans managed in soniroll

Jack: the payment side should feel like soniroll rather than "just link to Polar", and the plan
should live in the Account page.

- **Account → Storage plan** (`/account?tab=storage`, in the Account group above Sign-in &
  security): `StoragePlans` from `components/plans/PlansPage.tsx`. `/plans` sends signed-in people
  there (keeping `welcome=1`) and stays a page for signed-out visitors (the landing page links it).
  `PLAN_HREF` (`lib/storagePlan.ts`) is used by every signed-in link (sidebar row and menus, Files
  page, notices, storage meter, the dashboard card); ⌘K has "Storage plan" under Settings.
- **Checkout over the page:** `billing.checkout` returns `{url, embedOrigin}`; on the site's own
  address the web app opens Polar's embedded checkout (an overlay; light/dark from the theme), and
  on success closes it and stays on the page (the plan appears when the webhook lands). The desktop
  app and other addresses (preview builds) still open Polar's page. The embed script is **vendored**
  (`lib/vendor/polarEmbed.js` + `.d.ts`, Apache-2.0, credited on `/credits`, ignored by eslint):
  pnpm linked the `@polar-sh/checkout` package to a folder that doesn't exist (its Stripe peers),
  and the script is 4 KB with no imports.
- **Polar only frames the checkout for listed hosts** (organization `embed_hosts`, Settings →
  Embedding; otherwise `frame-ancestors 'none'` and a blank overlay). Set on the sandbox through the
  API: `localhost:3000`, `www.soniroll.com`, `soniroll.com`. **The production organization needs
  the same** (add any other address the site runs on).
- **Managed in soniroll:** `billing.changePlan` (any other plan, incl. monthly ↔ yearly; refused
  when the account keeps more online than the new size; Polar prorates per the organization's
  setting), `cancelPlan` (at the period's end), `resumePlan`. The section shows the plan, usage,
  renews/ends, **Keep my plan** after a cancel, **Cancel plan** (confirm: "Keep plan" / "Cancel plan"
  — `ConfirmDialog` got a `cancelLabel`), **Payment details and receipts** (Polar's portal, now only
  for the card and receipts) and a **Switch plan** grid (the Monthly/Yearly switch starts on your
  plan's period; same size reads "Switch to yearly").
- Fixed a hydration mismatch: the sidebar's plans row decided "active" from `location.search` while
  rendering; now `PlansRow` reads it after hydrating (`useSyncExternalStore`).
- **Verified** as the demo account (own browser context, sandbox): `/plans` → the Account section;
  Get 5 GB → the overlay on the Account page (saved test card) → Subscribe → the overlay closed, the
  page stayed, "Thanks for subscribing!" and "Your plan: 5 GB · $20 a year"; Switch to 25 GB
  (monthly) → "Your plan: 25 GB · $5 a month · renews December 17"; Cancel plan → "ends December
  17" and Keep my plan; Keep my plan → renews again. No console errors after the hydration fix;
  1440 and 390 wide (no overflow); `/plans` signed out at 390. Jack's own sandbox subscription and the
  demo's were revoked afterwards (both accounts are free again).
- **Not verified:** typing a new card inside the overlay (the demo account had a saved card), the
  portal's card update, the desktop app's path.

## 2026-11-17 — Back up as a .zip

Jack: "a way to back up files that are online and in local storage… download to zip".

- `useBackup` (`lib/storageMove.ts`): zips every item this device can reach — online, or kept here
  (rows with a `url` after `useDeviceUrls`) — into "soniroll files YYYY-MM-DD.zip", in folders by
  kind (Files, Recordings, Songs, Lesson files, Hand-ins, Profile; `downloadEverything` with the
  existing `lib/zip.ts`). Items kept on another device are left out and counted in the message.
  Refuses more than 2 GB (`MAX_BACKUP_BYTES`: the zip is built in memory).
- Where: **Back up** beside Upload on the Files page (icon only on phones), **Download** in the
  selection bar for what's ticked, and a "Back up your files" row in Account → Storage plan.
- **Bug found and fixed while testing:** `tidyDeviceFiles` (run by the Files page whenever the list
  changes) deleted a device file whose data was saved but whose row hadn't arrived yet — uploading
  two files at once lost the second one's data. It now skips files saved in the last 10 minutes.
- Verified as the demo account (own contexts): one file online and one on the device → Back up gave a
  valid zip with both; ticking one → a zip with that one; a second, fresh context → a zip with the
  online one and "1 kept on another device isn't included"; the Account row's button → both. Test
  files deleted afterwards.

## 2026-11-17 — Choosing online or this device; online needs a plan (enforced)

Jack: choose not to upload a file online, change the default, put a device file online, and make
sure nothing goes online without a subscription.

- **Choosing:** `useSaveTarget()` (`lib/storagePlan.ts`): with a plan, `online` starts on the
  synced site setting **`newFilesOnline`** (default true; Account → Storage plan → "New files go:
  Online / This device") and `setOnline` changes it for that upload. `SaveWhere`
  (`components/files/SaveWhere.tsx`, a small Online / This device switch) shows beside Upload on the
  Files page and a tune's files, in the save-recording dialog and by a tune song's Upload — only
  with a plan. `useFileUploader(tuneId, target)`, `saveFile(…, online)` and `placeBlob(…, online)`
  take the choice. Saving someone's shared file follows the default too.
- **Putting device files online:** "Put online" in the ⋮ menu and, for several, in the selection bar
  (`useFileActions().putOnline`) — both only with a plan.
- **Enforced on the server:** without a plan, `files.generateUploadUrl` (unless `purpose` is `note`
  or `share`) and `recordings.generateUploadUrl` (recordings and songs) refuse, so nothing is
  uploaded. As a second check `files.create` (unless `keepOnline`), `recordings.create` /
  `tuneSongs.set` with a `storageId`, `moveOnline` (unless `purpose`), and the server-side copies
  (`copySharedFile(s)`) refuse too (`assertPlanForOnline`). `moveOnline({purpose: "share"})` makes the
  link in the same mutation (so a free account can only put a file online by actually sharing it);
  `purpose: "note"` marks it `keepOnline`. Lessons and profile images are separate paths, unchanged.
- **Gotcha:** a mutation that throws rolls back everything, including `ctx.storage.delete` of the
  upload it's refusing — so "delete the upload, then throw" (here and in the older `assertFits`)
  leaves the file in storage. Refusing at the upload-URL step is what actually prevents orphans.
  (Two 74-byte test uploads from checking this are left in dev storage.)
- **Old clients:** the desktop app 0.1.6 and the paused mobile app upload recordings online; on a
  free account those saves are now refused until they're updated.
- Verified: with the demo account's identity on the CLI, the upload URL and saves are refused
  without a plan and the share upload URL is given; in the browser with a plan (embedded checkout,
  saved test card): the switch beside Upload, one file to This device and one Online, Put online
  for the ticked device file, the default set to This device (the switch then starts there, the line
  says so), set back to Online; files deleted and the plan revoked afterwards. Not checked: the
  switch in the save-recording dialog (needs a mic) and the tune song panel by hand.

## 2026-11-17 — Live: Polar production set up (release 0.10.6)

- Production Convex (`grandiose-dolphin-564`) env: `POLAR_ORGANIZATION_TOKEN` (the live org token
  Jack gave), `POLAR_SERVER=production`, `POLAR_WEBHOOK_SECRET` (piped from the API, never printed);
  `SITE_URL` was already set.
- Live Polar org `soniroll` (`1b5e76ad-…`): embed hosts `www.soniroll.com`, `soniroll.com`; webhook
  `39b552f2-2992-4bfd-b52f-6a5713b387f9` → `https://grandiose-dolphin-564.convex.site/polar/events`;
  products (metadata `storage_gb`, prices Jack can change in Polar): 5 GB $2/mo `57f3b507…`, $20/yr
  `1a96c30d…`; 25 GB $5/mo `68358a2d…`, $50/yr `61b2d111…`; 100 GB $12/mo `555f5cf5…`, $120/yr
  `4b8604d6…`. All six `product.created` deliveries 202; `billing:plans --prod` lists them; the live
  `/plans` page shows them signed out.
- `files:markNoteFiles --prod` run (marked 2).
- Not done by Claude: Polar's own account verification and payouts (Jack), a real live purchase,
  the Rhodes license and a refund policy before charging.

## 2026-11-17 — Admin: a user's storage, and giving plans

Jack: manage users' plans from the admin panel to troubleshoot, and give someone some months of a
plan.

- **Table `planGifts`** (userId, storageGb, startsAt, endsAt, ended, grantedBy, note). `lib/storage.ts`
  `planFor` now returns `{ plan (Polar), gift, hasPlan, cloudBytes }`: the cloud limit is the biggest
  of the free 50 MB, the paid plan and a running gift; `hasPlan` (either kind) is what every "can
  this go online" check uses — `assertPlanForOnline`, `files.storagePlan` (`toMove`), `hasPlanFor`,
  and on the web `savesOnline` and the Files page / menus / notices. Checkout's own guard
  (`billing.hasPlan`) still looks only at Polar, so a gifted account can buy a plan.
- **Admin** (`admin.ts`): `userStorage` (staff: online / on devices, the Polar subscription and a link
  to the customer in Polar's dashboard — sandbox or live by `POLAR_SERVER` —, gifts with who gave
  them); owner only: `giftPlan` (GB 0.1–1000, 1–36 calendar months, a note; replaces a running gift),
  `extendGift`, `endGift`. A job is scheduled for each `endsAt` (`expireGift`, which ignores runs made
  stale by an extension) and marks the gift ended, so pages update when it runs out. Account deletion
  deletes the account's gifts.
- **UI:** Admin → Users → **Storage** on every row (`components/admin/UserStorage.tsx`); the account's
  own Storage plan section shows a gift ("A gift — nothing to pay · until …"), or a line under a paid
  plan.
- Verified on dev from the CLI with identities: a 25 GB / 1 month gift to the demo account → has a
  plan, 25 GB; +3 months moved the end date; the demo account itself was refused ("Only the owner can
  do that"); ending it → free, 50 MB. The admin panel opened (read-only) on the demo account's row,
  no console errors. The test gift stays in the demo account's history on dev. Not checked: a gift
  running out on its own (the scheduled job), a gifted account buying a plan.

