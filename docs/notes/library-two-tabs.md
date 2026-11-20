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
