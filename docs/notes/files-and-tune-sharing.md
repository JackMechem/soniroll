# Files, and sharing a tune by link (2026-10-18, web; backend dev deployed)

Jack asked to upload files (e.g. a PDF) to any tune, to share a tune with its files and chord chart,
to upload files that aren't on any tune, and for a file browser showing everything the account
stores.

## Backend (`packages/convex/files.ts`, `lib/tunes.ts`; dev only until the next prod deploy)

- **Table `files`**: userId, storageId, name, mimeType, size, optional `tuneId` (a plain string,
  like `recordings.tuneId`), createdAt/updatedAt. Indexes `by_user`, `by_user_tune`.
- **Upload** is the usual two steps: `generateUploadUrl` (refuses while Mayday "pause uploads" is
  on, or when the account is full), POST the file, then `create({storageId, name, tuneId?})`.
  `create` reads the real size and type from `_storage` (it never trusts the client), and deletes
  the upload and throws when it's over **100 MB** (`MAX_FILE_BYTES`) or doesn't fit the account's
  limit. The limit counts **everything** the account stores (uploads, recordings, tune songs, lesson
  files, hand-ins, profile images). See "The storage limit" below.
- `list`, `listForTune`, `update` (rename; `tuneId` to attach, `null` to detach), `remove`
  (deletes the stored file too).
- **`storage`**: everything the account stores, newest first, each with kind
  (`file | recording | song | lesson | handin | profile`), size, download URL, `tuneId`, and an
  `href` to where it's managed; plus `used`, `quota`, `maxFile`. Lesson files are found through
  the teacher's `lessonStudents` → `lessonItems.fileId`; hand-ins through the student's
  `lessonStudents` → `lessonSubmissions` (filtered by `studentId`, as there's no index on it).
- **Table `sharedTunes`**: userId, tuneId, `snapshot` (a `PublicTune` without notes or chart id),
  createdAt/updatedAt. One per (owner, tune).
  - `shareTune({tuneId})` looks the tune up **on the server** from the owner's own synced lists
    (`ownerTune` in `lib/tunes.ts`) and upserts the row; `unshareTune`; `tuneShare({tuneId})` returns the
    link id or null.
  - `getSharedTune({id})` is open to anyone (null while Community is off, like shared setlists):
    the tune **as it is now**, its linked chart (`resolveLinkedChart`), its files with URLs and its
    recordings. Never its notes. If the owner deleted the tune, it falls back to the snapshot with
    no chart, files or recordings.
  - `copySharedFiles({shareId, tuneId})` (an action): copies the shared tune's files into the
    caller's account, attached to their copy of the tune (`ctx.storage.get` → `store`), skipping any
    that don't fit the caller's quota. Returns `{copied, skipped}`.
- Account deletion deletes `files` (and their storage) and `sharedTunes`.

## Web

- **`/files`** (`components/files/FilesPage.tsx`): Hero with the library tabs (now **Tunes ·
  Setlists · Chord Charts · Files**; on phones the icons hide and "Chord Charts" reads "Charts"),
  Upload, search (names and tune names), a storage bar, filter chips by source and by type, sort
  (newest, name, largest), and one list. Uploads have a ⋮ menu (open, rename, attach / move to a
  tune, detach, delete); other kinds open in place with a link to where they're managed. Dropping
  files anywhere on the page uploads them. Help topic `files` (first-visit intro).
- **A tune's page** (`TuneHub`): a **Files** section under the chart (`TuneFiles`: upload, drop,
  "From my files" to attach existing ones, ⋮ per file with "Remove from this tune") and a **Share**
  button in the header (signed in only) opening `TuneShareDialog` (what's included — chart, N files,
  N recordings, "your notes are never shared" — then make the link / share or copy / open / stop
  sharing).
- **`/tune/<id>`** (`components/files/SharedTunePage.tsx`): name, key badge, time/tempo/keys, the
  chart (transposable; hidden when there's none), files (open in place, download), recordings.
  **Save to my tunes**: uses your tune of the same name if you have one, else adds it to Tunes I
  Know; imports the chart into a "Shared with me" playlist (if your tune has no chart yet); signed
  in, copies the files too (signed out it says "Sign in to copy its files too"). The owner sees
  "This is your tune — open it". Counted as a Community page by the Mayday switch and grouped as
  `/tune/[id]` in usage counts. `/tune` (no id) is still the old redirect.
- Shared pieces in `components/files/FileParts.tsx`: `FileTypeIcon` (type → icon and a theme
  category colour), `FileRow`, `fileDetail`, `FilePreviewDialog` (PDF in an iframe, image, audio,
  video; anything else is a download), `useFileUploader` (multi-file, drop target, progress, error
  text), `useFileActions` (⋮ menu, preview with actions, rename/attach/delete dialogs — portaled
  at z-80 so they open **above** the preview, which is z-70), `FileSelectDialog`, `TuneFiles`.
  `lib/files.ts`: `fileKind`, `formatBytes`, `uploadFile`, `errorText`. New icons in `tools.tsx`:
  `UploadIcon`, `FileIcon`, `DocumentIcon`, `ImageIcon`, `VideoIcon`.
- Privacy policy: files in "Your stuff" (with the 1 GB limit) and shared tunes in "Posts and shared
  links". Terms: "files" added to "Your content".

## Verified

- `tsc` (web, convex), `eslint`, `pnpm build`, Convex push to dev (two tables, four indexes).
- Signed-out calls: `storage` → null, `list` → [], uploads and sharing refused, a bad share id → null.
- In nix Chromium against the dev backend, with a throwaway account made for the test and deleted
  afterwards (with its files and link): uploading a PDF and an image on `/files`, the PDF preview,
  attaching it to a tune from the preview (the bug where the tune picker opened under the preview was
  found and fixed here), renaming from the ⋮ menu, the type filter, the tune page's Files section
  and an upload there, the share dialog, the shared page signed out (files listed and openable,
  the tune's notes **not** on the page), Save to my tunes signed out, a bad link, and 390 px wide
  (no overflow) on `/files`, `/tunes` and a tune page; light and dark. `copySharedFiles` was run
  through the CLI with `--identity` (2 copied, right sizes and tune).

## Not done / not verified

- **Mobile app:** none of this yet (no Files screen, no Files on its tune page, no share link).
  Files attached on web don't show in the app.
- Not exercised: the quota limits for real (a 100 MB+ upload, a full account), video and audio
  previews with real media, Save to my tunes **signed in** through the page (only the action itself,
  via the CLI), and the Mayday "Community off" gate on `/tune/<id>`.
- See "The storage limit" below for how the per-account limit relates to Convex's free plan.

## The storage limit: 100 MB per account (2026-10-18)

First built as 1 GB per account, then lowered to **100 MB** after Jack asked whether 30 users would
stay on Convex's free plan. They wouldn't at 1 GB: the free plan has **1 GB of file storage for the
whole deployment (backups included)** and **1 GB a month of downloads (data egress)** — every
played recording, opened PDF or profile picture counts — plus 0.5 GB of database.

- **`packages/convex/lib/storage.ts`** holds it all now (moved out of `files.ts`):
  `ACCOUNT_QUOTA_BYTES` (100 MB), `MAX_FILE_BYTES` (100 MB), `storedItems` / `bytesUsed`,
  `quotaFor(ctx, userId)` (the one place a per-account limit comes from — everyone gets the same
  for now), `assertHasRoom` (before handing out an upload URL) and `assertFits` (once the upload
  has arrived: deletes it and throws if it's too big or doesn't fit; `replacing` frees the size of
  a tune's old song).
- **Every upload path checks it**: `files` (URL + create), `recordings` (URL + create),
  `tuneSongs.set` (fits, counting the replaced song as freed), `lessons.generateUploadUrl` and
  `generateSubmitUploadUrl` (refused when already full — lesson files and hand-ins aren't checked
  again after upload, so one upload can take an account a little past 100 MB). Profile pictures
  and feedback screenshots aren't limited (small, resized).
- Existing data over the limit isn't touched; those accounts just can't upload more until they
  delete something.
- Web: the Files page says how much every account has, turns the note red when full, and says
  "Need more room? Plans with more storage are coming." Recording, song and lesson-file errors now
  show the backend's message (`errorText`) instead of the raw Convex error. Help topic and privacy
  policy say 100 MB.
- Checked on a local throwaway Convex backend: two 60 MB uploads — the first saved, the second
  refused with the "There isn't room" message and deleted (usage stayed at 60 MB).
- 30 accounts × 100 MB is still 3 GB, so the free plan isn't guaranteed if everyone fills up; a
  site-wide stop (refuse uploads when the whole deployment nears ~800 MB) was suggested but not
  built yet.

## Planned: paid plans for more storage

Jack wants people to be able to **subscribe for more storage** later (100 MB stays free). Not built.
When it is:
- `quotaFor` in `lib/storage.ts` returns the account's plan limit (e.g. from a `subscriptions` table
  kept up to date by the payment provider's webhook).
- Payments: Stripe, or Lemon Squeezy / Paddle (they handle sales tax as merchant of record). A
  checkout, a webhook into Convex, a "manage subscription" link on the Account page.
- Convex: paid storage pushes past the free plan, so move to the pay-as-you-go plan and price the
  subscription above what the storage and downloads cost.
- Wording: the landing page, README and privacy policy say sheddex is free and non-commercial;
  they'd need updating (the tools stay free), plus Terms (payments, refunds, cancelling).
- **Licenses first:** the Rhodes samples (jRhodes3d, Jeff Learman) are **CC BY-NC**. A site with a
  paid tier is arguably commercial even though the Rhodes itself stays free — ask the author for
  permission or switch to a CC0 / CC BY Rhodes **before** charging. Re-check the other samples'
  licenses too (they're CC0 / CC BY today).

## A real file browser: rename, delete and share anything (2026-10-18, v0.9.2)

Jack: "make the file browser more like a file browser where i can delete files, rename them, and be
able to share them with others".

- **Backend (`files.ts`), by kind** (`file | recording | song | lesson | handin | profile`, the
  `StoredKind` ids `storage` lists): `ownedItem` finds one and **re-checks ownership** for every kind
  (a lesson file's teacher, a hand-in's student, the profile's avatar/banner).
  - `renameItem` — every kind but profile images. A lesson file renames `fileName` (and the item's
    title when the title was just the file name); a hand-in renames that file inside the submission.
  - `removeItem` — deletes the stored file and its row. A lesson **file item** goes entirely (with
    any submissions); a file attached to another kind of lesson item is just taken off it; a hand-in
    file is taken out of the submission; a profile image is unset.
  - **Table `sharedFiles`** (userId, kind, itemId, createdAt; `by_user`, `by_user_item`): `shareItem`
    (not profile images), `unshareItem`, `itemShare`, and public `getSharedFile({id})` (null while
    Community is off, or once the item's gone — it reads the item **live**, so renames show and
    deletes end the link). `copySharedFile` (action) copies it into the caller's files, refusing when
    it doesn't fit their quota. `storage` now returns each item's `sharedId`.
  - Deleting through `removeItem`, `files.remove` or `recordings.remove` drops the item's links;
    account deletion deletes `sharedFiles`.
- **Web:**
  - `useFileActions` (`FileParts.tsx`) works on any `StoredEntry` (`lib/files.ts`; `entryOf` turns an
    upload into one). Menu: Open, Rename, Share a link / Shared — manage link, Download
    (`downloadFile` fetches to a blob so the file keeps its name — storage URLs are cross-origin,
    where `download` is ignored), attach / move / detach (uploads), go to where it lives (recording,
    lesson, tune, Account), Delete (a message per kind). `contextMenu` opens it at the pointer on
    right-click; `deleteMany` asks once for several. The preview's buttons match.
  - `FileShareDialog`: make the link, share or copy, open, stop sharing; a line for lesson files,
    hand-ins and songs saying only that file is shared.
  - `/files` is a table from `sm` up: tick box, Name (type underneath, a "Shared" link badge), Where
    (kind + tune, the tune is a link), Size, Added, ⋮ — click a heading to sort, again to flip.
    Ticking shows "N selected · size · Delete · Cancel"; Delete/Backspace deletes what's ticked,
    Escape clears. Phones: one line of details under the name, a sort menu, and **Select** to show
    tick boxes (tapping a row then ticks it).
  - `/file/<id>` (`SharedFilePage`): name, "shared by @user" (public profiles only), Download,
    **Save to my files** (signed in) / "Sign in to save a copy", the owner sees "This is your file";
    PDFs, images, audio and video shown in place (`FileViewer`, pulled out of the preview dialog).
    Counted as a Community page by Mayday, grouped as `/file/[id]` in usage counts.
  - Help topic `files` and the privacy policy ("a setlist, routine, tune or file you share by link").
- **Checked** in nix Chromium on the dev backend, signed in as Jack's dev account with two test
  files (deleted afterwards, with their link): uploading two files, the right-click menu, rename,
  making a link (the Shared badge appears), the link signed out (name, Download, "Sign in to save a
  copy", the PDF shown) and as the owner, ticking both and deleting with the Delete key + confirm,
  the link then saying "This file isn't available", 390 px in dark (no overflow), no page errors.
  Found and fixed: the Delete key was ignored while a tick box had focus.
- **Not checked:** renaming, sharing or deleting a recording, tune song, lesson file or hand-in for
  real (only the type checks and the code paths — Jack's real ones weren't touched); "Save to my
  files" from a second account; Download in a real browser (headless doesn't save files).

## 2026-11-18 — Opening a file in a tool: the file picker and drop anywhere (FB-24)

Jack (FB-24): "files uploaded to slowdowner should go to files and should be uploaded online if i have
a storage plan"; and "for any of the tools requiring a file like slow downer, make a popup that shows
all your uploaded files, and if you drag and drop a file anywhere on the screen it will import it into
it, and have an upload button that opens the system file picker".

- **`components/files/FilePicker.tsx`** (new): `useFilePicker({ filter, onFile, saveToFiles, dropInto,
  title, uploadLabel, local })` returns `{ open, elements, status, signedIn, save }`. The dialog
  ("Open a file") lists the account's own files, recordings and tune songs that match the tool's
  `filter` (`AUDIO_OR_VIDEO`, `AUDIO_ONLY`, or the tool's own), newest first, with a search, as
  `FileRow`s (`files.storage`, wrapped in `useDeviceUrls`; rows kept on another device show greyed
  "On Chrome on Linux"). Picking one fetches it into a `File` and hands it to the tool. Upload opens
  the system picker (with the `SaveWhere` switch when the account has a plan). A bottom sheet on
  phones. `local` lists files the tool keeps in the browser itself (the Slow Downer's old IndexedDB
  library), with a remove button and its own `ConfirmDialog`.
- **Saving to Files (`saveToFiles`):** a file from this device (Upload or a drop) is saved with
  `useFileUploader(...).uploadAll` (now returned by the hook and resolving whether every file saved —
  an additive change), so it goes online with a plan and on this device without one, through the
  usual checks. **Not twice:** skipped when the account's `files.list` already has a file with the
  same name and size, or this tab saved it in the last minute (the list catching up). `status` shows
  "Saving to your Files…", "Saved to your Files(, on this device)" or "Not saved to your Files: …"
  (the tool still opens the file either way, e.g. one over 100 MB).
- **`lib/useFileDrop.ts`** (new): window `dragover`/`drop` listeners, only for drags carrying files,
  ignoring drops something else already handled (`defaultPrevented`). The overlay hides 250 ms after
  `dragover` stops. **Split screen:** the scope is the nearest scrolling box around the tool (a pane's
  `overflow-y-auto` body); on a normal page (`[data-page-scroll]`) it's the whole window. So a file
  dropped on the other pane is left for that pane. The picker dialog (portaled to `<body>`, outside the
  pane) is marked `data-file-drop` so drops on it count too. No tiling files were changed.
- **Slow Downer:** "Open a file" (the empty state) and the open file's name ("Change", replacing the
  old Select with "Add new file…") open the dialog; dropping a file anywhere opens it ("Drop to open in
  Slow Downer"). Signed in, files from the device go to Files and are no longer kept in the old
  `jam-practice-files` IndexedDB library; files still in that library show under "Only in this
  browser" (hidden once Files has the same name and size), and opening one saves it to Files and then
  removes the browser copy (markers are keyed by name and size, so they carry over). Signed out it
  works as before (kept in the browser, listed in the dialog with a remove button), and the dialog
  says signing in keeps files in Files. The inline "Saved in this browser" list on the empty page is
  gone (it's in the dialog).
- **Also adopted:** the Tuner's Takes → "Open a file" (audio only; opens a file or recording from
  Files or from this device as a take, as before — not saved to Files, takes stay browser-only) and
  Rhythm Section → Bass players → Import (MusicXML / exported JSON; a MusicXML kept in Files can be
  imported now). Neither has drop-anywhere (their file is a side action, not the tool's main input).
  **Left alone:** Score Writer's import (its own `.json` backups, which Files wouldn't hold), and the
  avatar/banner/feedback/lesson/notes/chart-import uploads.
- Help (Slow Downer's "Load a song" step and an "Open a file" option, replacing "Saved files") and the
  privacy policy (the Slow Downer line said its files always stay in the browser) updated.
- **Verified** in nix Chromium on dev, signed in as the shared test account: Open a file → Upload a
  WAV → it plays, "Saved to your Files, on this device", and it's listed in the dialog; a synthetic
  drop of the same file → opened, no second row; a drop of another file → opened and saved; picking
  the first one from the dialog reopens it (duration right). The overlay shows during a synthetic
  file `dragover` and not for a text drag. Signed out (desktop and phone): the dialog shows "From this
  device", the browser-kept file and the sign-in line. Split screen (Metronome | Slow Downer, signed
  out): the overlay covers only the Slow Downer pane; a drop on the Metronome pane is ignored, a drop
  on the Slow Downer pane opens the file. Tuner's dialog opens (signed in); the bass Import dialog
  imported a MusicXML through it (signed out, phone). 1440 and 390, light and dark, no horizontal
  overflow, no console errors (one `<p>` around the spinner was found and fixed). Test files deleted
  from the account afterwards (Files page → Delete).
- **Not verified:** a real OS drag-and-drop (only synthetic `DragEvent`s), saving online with a storage
  plan (the test account is free; same `saveFile` path as the Files page), audio by ear, Safari, real
  phones, a file over 100 MB, and migrating a real old browser-library file signed in.
