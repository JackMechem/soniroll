### Library: two tabs, every chart on a tune, tags, Open in (2026-11-20, web; FB-30)

Jack's feedback: tunes and charts as separate tabs was confusing, Recordings didn't need its own tab,
"Library overall needs to be consolidated", while keeping tunes and charts "somewhat separated without
making the page too cluttered", and audio in Files should open in the tools that play audio.

**What it looks like now (web, `apps/web/components/library/`).**
- `/tunes` has two tabs, **Tunes** and **Files** (`LibraryTabs`, `LibraryHub`). Tunes is first and
  the default: it works signed out, it's where most of the library is, and every old `/tunes` link
  keeps meaning it. (Jack had suggested Files first; that would have made the signed-out default a
  "sign in" box.)
- `?tab=setlists` and `?tab=charts` are pages *inside* Tunes (`SetlistsPage`, `ChartsDashboard`, with
  a "Tunes" back button), opened from two cards at the top of the Tunes tab. `?tab=recordings` (and
  `/recordings`) opens Files with the Recordings filter on. `RecordingsPage.tsx` is gone;
  `/tunes/recording?id=` is unchanged. `LibraryView` in `ui.tsx` lists every `?tab=` value.
- **Tunes tab** (`TunesDashboard`): one list of every tune. Filters: All / Tunes I Know / Tunes to
  Learn (signed in) / Library, with counts; tag pills (a tune must have *every* tag picked); A–Z or
  Newest (from the time at the end of `makeId` ids). 100 rows, then "Show more". Search covers name,
  tags, notes and the titles of the tune's charts. "Edit" beside the tags renames or deletes a tag
  on every tune (`ManageTagsDialog`). Filter and order are remembered per device
  (`jam-practice-library-tunes-view`). Rows (`TuneItem`): key badge (keys known, else the main
  chart's key), chart mark with a count when there are several, list chip (on All), two tags.
- **A tune's page** (`TuneHub`): all its charts — a select when there are several (main first);
  the chart ⋮ has Make this the main chart, Link another chart, Write another chart, Unlink. A
  **List** card (one tap moves it between the three lists) and **Tags** (`TagEditor`) sit at the
  top of the side column (on phones that's below the chart, files and recordings; the header ⋮
  also moves it).
- **A chart's page** lists every tune that has it (any list) and "Move to / Add to" Tunes I Know or
  Tunes to Learn.
- **Import** (`ImportChartsPage`): "Tag the tunes" (on; the playlist's name unless you type one) and a
  result line that says how many charts joined tunes you have and how many new tunes are in the
  Library list.
- **Files**: "Open in Slow Downer" (audio and video) and "Open in Tuner" (audio) for uploads,
  recordings and tune songs, in the ⋮ menu and the preview (`components/files/openInTool.ts`). The
  Slow Downer opens `/slow-downer?open=<kind>:<id>`: the route passes it as `openStored` to
  `useFilePicker`, which finds the item in `files.storage` (with `useDeviceUrls`, so files kept on
  this device work), fetches it, calls the tool's `onFile` and takes `open` out of the address. The
  Tuner copies the file into its takes once (`copyRecordingToTuner`, now with `source: "file"`) and
  opens `?take=`. A recording's page has Open in Slow Downer next to Open in Tuner. The recordings
  view's empty state says "No recordings yet" and has a Record link.

**Data model (`packages/core/tuneLibrary.ts`).**
- Three tune lists, each one JSON array in `syncedSettings` (signed out, localStorage): `"tunes"`
  (Tunes I Know), `"jam-practice-tunes-to-learn"`, and the new **`jam-practice-library-tunes`** — the
  neutral Library list: tunes that came in with charts and aren't sorted yet. Signed out the Library
  list works too (localStorage, through `lib/useSyncedList.ts`); Tunes to Learn stays account-only.
  The Library list is private (profiles read only the other two).
- A tune's charts: `chordChartId` is always the **main** chart (old app builds, shared tunes,
  profiles and Convex's `resolveLinkedChart` read only that); `chordChartIds` holds all of them,
  main first, **only when there are two or more**. Read with `tuneChartIds`, write with
  `withChartIds` / `addChartsToTune` / `removeChartFromTune` / `makeMainChart` /
  `replaceMainChart`. If an older build changes `chordChartId` without knowing the list, the new one
  replaces the old main; if it deletes `chordChartId`, the tune has no charts.
- `tags?: string[]` on a tune (cleaned, no duplicates ignoring case; the field is dropped when
  empty). `allTags`, `renameTag`, `removeTag`, `hasTag`.
- `TuneListId` is `"tunes" | "learn" | "library"` everywhere (`lib/useTuneLists.ts` has
  `useTuneLists` with all three plus `ready` and `canLearn`, `findTune`, `moveTune`, `tuneHref`;
  `useTuneActions` re-exports them for old imports). Shed Log tune attachments can point at
  `library`.
- Size: a Library tune is ~180 bytes (measured: 299 tunes = 53 KB; 1,400 in a script = 280 KB). The
  1 MiB document limit is ~5,000 Library tunes; the chart library query needs paging before that
  (~4,000 charts).

**Linking charts to tunes.**
- `linkChartsToTunes` (pure): for each chart, the tune that already has it (just tagged), else the
  first tune with the same name (`tuneMatchKey`: `nameId` — case, accents, punctuation, a leading or
  iReal-style trailing ", The"/"A"/"An" — plus "&" = "and"; Tunes I Know, then Tunes to Learn, then
  Library), whose charts it joins, else a new Library tune named after the chart (`tidyName`,
  "Man I Love, The" → "The Man I Love", time signature from the chart, no keys/tempos). Running it
  twice changes nothing.
- `useChartLinker` (`lib/useTuneLists.ts`) applies it to the lists **as they are at call time**
  (`readTunes` / `readTunesToLearn` / `readSyncedList`, so it's safe after an import's await), does
  nothing until every list has loaded, and adds the chart ids to **`jam-practice-charts-linked`**.
- `useChordChartsLibrary.importSongs` links what it imported unless `link: false` (and takes
  `tags`), so every path that adds charts links them: the import page, lessons' "save chart", the
  chart builder. Paths that link to a particular tune themselves pass `link: false`: Write the chart
  from a tune (`?tune=<list>:<id>`, now also `library`), saving a shared tune, saving a shared
  setlist. It returns `linked` (counts) for the import page's message.
- **Existing charts** (`lib/useAutoLinkCharts.ts`, run on the Tunes tab and the Chord charts page):
  every chart not in `jam-practice-charts-linked` and on no tune is linked as above, tagged with the
  folders it's in (`playlistNameList`, new on `LibrarySongMeta`); every chart seen is then
  remembered, so a chart you unlink, or whose tune you delete, stays unlinked. It catches charts
  added by mobile (which doesn't link yet) the next time the web Library opens. Client-side, chosen
  over a Convex mutation because tunes are whole-blob values written through `syncedStore`'s
  debounced cache — a server write to the same blob could be overwritten by a pending client write.
  Nothing is deleted. Tested idempotent (a reload changes nothing).
- Chart playlists (folders) are unchanged in the backend; they show as tags on the tunes made from
  them.

**Mobile.** Reads the main chart as before (`chordChartId` is always main). Editing a tune now keeps
fields the form doesn't show (tags, other charts) instead of rebuilding the tune; link / change /
unlink use the helpers. It doesn't show the Library list or tags, and its chart import doesn't link
(the web pass catches those charts). **Installed builds from before this still rebuild a tune on
edit and drop its tags and extra charts** — a new build fixes it.

**Gotchas.**
- Next client navigation renders the new page before `window.location` changes, so a tool can't read
  `?open=` from `window.location` in render or a state initializer; the route passes it as a prop
  (`app/slow-downer/page.tsx`, the desktop router).
- The first pass in two tabs at once could create the same Library tunes twice (each tab has its own
  cache). Rare (first run only); not handled.
- Hero icon/titles: Setlists and Chord charts pages are now titled "Setlists" / "Chord charts" with a
  back button, not "Library" with tabs.
- Help screenshots (`public/help/v3/tunes-*`) show the old tabs; retake into `v4` when there's time.

**Verified** (nix Chromium, dev deployment): signed out — import of an 8-chart iReal playlist with a
tag (2 joined Tunes I Know, 6 new Library tunes), a tune with two charts, moving lists, tags, the
Chord charts and Setlists pages, old tab URLs; signed in with a throwaway account seeded through the
Convex client with 302 unlinked charts in two folders — the pass made 299 Library tunes, linked 3,
tagged them, a reload changed nothing; moving a tune from its page and from a chart's page; Files:
uploaded WAV opened in the Slow Downer and the Tuner. 1440 and 390 wide, light and dark, no
overflow or console errors. tsc in web, desktop, mobile, core, convex; `pnpm lint`; mobile eslint.
**Not verified:** audio by ear, the desktop app, mobile on a device, a real ~1,300-chart account,
recordings made in the Recorder (Files listed them before this), two tabs racing the first pass.

## Follow-up (2026-11-20, Jack's feedback after the release)

- **Tag filters are OR**: picking several tags shows tunes with *any* of them (they were AND).
- **No Chord charts page or card.** Every chart belongs to a tune, so the page was confusing.
  `ChartsDashboard` is deleted (its `chartHref`/`playlistHref` moved to
  `components/library/hrefs.ts`); `?tab=charts`, `/chord-charts` (Next redirect, desktop router,
  split-screen panes) and every back link open Tunes. The `/chord-charts` NAV_LINKS entry stays
  (hidden from the sidebar already; old links and saved panes use it). The chart view, editor,
  import and folder pages still exist under `/chord-charts/*`.
- **A chart can't be left without a tune**: the tune page's "Unlink" is now "Delete this chart"
  (deleted for good unless another tune has it); deleting a tune deletes its charts that no other
  tune has (the confirm says so); and `useAutoLinkCharts` now links *every* orphan chart each time
  the Library opens (not only unseen ones; folder tags still only on a chart's first pass).

## UI pass 2 fixes (2026-11-20, web)

- **Link another chart** (tune page, and the row ⋮'s "Link another chart") opens on the full list
  when the tune already has a chart (searching the tune's own name only found the excluded
  chart). `ChartLinkPicker` says "No other charts called …" / "You don't have any other chord
  charts yet" when `exclude` is what emptied it.
- **Folder wording gone from the chart page and import:** the chart page's Folders card is removed
  (its "Your tunes" rows show the tune's tags instead); the import page explains tags, and its
  result line no longer says "into <playlist>". Still left: the chart editor's Folder select and
  the chart ⋮'s folder items (folders still exist in the backend; a bigger decision).
- **Filters:** the With/Without charts pills show only when the tunes are a mix; Files hides its
  source row and type row when there's only one choice in them.
- **Phones:** the Tunes tab's Import pill is hidden below `sm` (it's in the Add menu); Files' Back
  up uses a new `ArchiveIcon` (it was a second download arrow).
- **Menus:** the Add menu and the tune row ⋮ have icons like the tune page's and Files' menus.
- **Audio preview** (`FilePreviewDialog`): a small dialog for audio, doesn't autoplay (video
  still does), "Open in Slow Downer" is the main button for audio/video, and "Open in a new tab"
  is an icon (`ExternalLinkIcon`) in the header; the footer only shows when it has something.
- Smaller: chart editor toggles are fills, not outlines, and its help is one line plus "More
  tips"; the Setlists card says "1 setlist"; the New setlist prompt has a placeholder; the
  signed-out Files pitch no longer promises "any device".
- Verified in headless Chromium (1440 and 390, light and dark) with a throwaway account, deleted
  afterwards. Not verified: the desktop app window (tsc only), audio by ear.

## UI pass 5 fixes (2026-11-20, web)

- **`/tunes?list=tunes|learn|library`** opens the Tunes tab on that list (other filters cleared;
  `LibraryHub` passes it to `TunesDashboard`, which writes it into the saved view once per link,
  then the pills take over). The ⌘K entries (Tunes I Know, Tunes to Learn, Library list) and the
  dashboard's stat rows point there now, not at the old `/tunes/list` page.
- **`/tunes/list`** is kept (it has CSV import/export and bulk delete, nothing else does) but
  tidied: empty, its bar shows only Import CSV; Delete selected appears once something is ticked;
  the empty text is "No tunes here yet. Add one, or pick a jazz standard."; the bar has the `?`.
- **Files on phones**: the two selects are gone. The filter is an edge-faded pill row like Tunes'
  (one at a time; a group with one choice is left out, as on wider screens), and the order is a
  select in the list's header, like Tunes' A–Z. The header names the kind when one is picked.
- **Tune page, phones**: the Recordings card's "Add the song" puts Upload song under its text.
