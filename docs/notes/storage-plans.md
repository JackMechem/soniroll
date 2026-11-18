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
  change plan, card, receipts, cancel); `syncProducts` (owner only, for products made before the
  webhook); `revokeSubscription` (internal).
- `http.ts`: `polar.registerRoutes(http)` → webhook at `<deployment>.convex.site/polar/events`.
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

## Not verified

- Recordings and tune songs saved to the device (the Recorder needs a mic; same code path as files),
  Move to this device in bulk, saving someone's shared file or tune on the free plan, the note file
  picker putting a device file online, `tidyDeviceFiles` after a delete on another device.
- **Polar end to end:** no token yet, so no checkout, webhook, plan quota, portal or cancellation.
- The desktop app (its WebView's IndexedDB and opening checkout in the browser), Safari, real phones.
