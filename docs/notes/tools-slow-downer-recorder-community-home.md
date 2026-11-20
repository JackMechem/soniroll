<!-- Moved word for word from the old single PROJECT.md (lines 6280–6630) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

- **Slow Downer** — load a local audio/video file, slow playback without pitch shift, loop
  sections, add named markers with notes, zoom/pan the waveform.
- **Recorder** — multitrack recording: per-track clips, punch-in recording, trim/crop/repeat/move
  clips (even between tracks), automatic recording/playback sync via an inaudible burst-tone
  trick (`lib/syncBurst.ts`), a "align to beat" pitch-based nudge (`lib/alignBeat.ts`), WAV
  export/mixdown. **Desktop-only** — greyed out on phones via `desktopOnly` in
  `components/tools.tsx`'s `NAV_LINKS`.
- **Community** (`components/Community.tsx`, `app/community/page.tsx`) — this app's first public,
  social feature; a new `"Community"` `NAV_LINKS` category on its own, reachable (like every other
  page here) without an account. Has its own left sidebar — Search / Following / Chord Charts —
  using the exact same `SidebarNavButton` (`components/SidebarNavButton.tsx`, pulled out of
  `/account`'s own sidebar into a shared component) `/account` itself uses, per a direct request to
  give this page "the same sidebar thing." **Search** is a username-only search box (not
  instrument/tune — an explicit scoping call) over every `isPublic` profile, via
  `convex/profiles.ts`'s `search` — a plain scan-and-filter over public profiles rather than a real
  search index, since this is a small personal-project directory, not a large-scale service.
  **Following** reuses `FollowLists` wholesale (the same component `/account`'s own Following tab
  renders — both who you follow and who follows you), per a direct follow-up request for "a
  section for people you follow" here too, not just on the account page. **Chord Charts**
  (`components/CommunityChordCharts.tsx`) is this app's first user-generated content — see its own
  paragraph below. Since this page (unlike `/account`) is reachable signed out, `Community` gates
  the Following and Chord Charts views itself — `useConvexAuth()`'s `isLoading`/`isAuthenticated`
  picks between a loading spinner, the real content, or a sign-in prompt — rather than mounting
  either unconditionally: `FollowLists`' own `useQuery(api.users.current)` gate only checks for
  "still loading" (`user === undefined`), not "definitely signed out" (`user === null`), so
  mounting it while signed out would leave its lists stuck spinning forever, and
  `CommunityChordCharts` is deliberately signed-in-only per Jack's own scoping call (browsing needs
  an account, even though search doesn't); `/account` never hits either problem because that whole
  page is already gated behind being signed in before any tab ever renders. See "Public profiles &
  follows" under Backend (Convex) below for the follow/profile feature, and "Community chord
  charts"/"Community tunes" further down for the two posting sections — the public profile page
  itself (`app/u/[username]/page.tsx`) isn't a "tool" with a nav entry of its own, just what a
  Community search result (or a shared link) leads to.
- **Community chord charts** (`components/CommunityChordCharts.tsx`, `convex/communityChordCharts.ts`)
  — the Community page's third section: browse chord charts and playlists other users have posted,
  and import any of them straight into your own Chord Charts library. Went through two real
  storage designs, both broken at actual scale, before landing on the current one — worth reading
  in order since each failure directly shaped the next design:
  1. **v1**: one `communityChordCharts` document per post, `songs: v.any()` holding every song
     inline, full `bars` included. Broke the same way the personal library's original blob did —
     `create` (`songIds.length` used to be `songs.length`) had a `MAX_SONGS_PER_POST = 100` cap
     specifically to stay under Convex's 1 MiB single-document limit, but Jack wanted to post the
     whole jazz-standards forum playlist (~1,400 charts), which both the cap and the underlying
     document size would have rejected outright.
  2. **v2**: kept posting/importing on the client, but had it fetch every selected song's `bars`
     in one bulk call (`chordCharts.getSongsBars`, an object keyed by song id) right before
     posting, so the post itself could still be assembled and sent in one `create` call. This
     traded the document-size problem for a different Convex limit: a plain object can have at
     most 1024 fields, and a 1,410-song bulk fetch needed 1,410 keys —
     `chordCharts.js:getSongsBars return value invalid: Object has too many fields (1410 > maximum
     number 1024)`.
  3. **Current**: **songs live in their own table** (`communityChordChartSongs`, one row per song,
     indexed `by_post` — the post row itself only holds `songCount`), the same
     one-row-per-song split the personal library already uses for `chordChartSongs`/
     `chordChartSongBars`. And, critically, **posting and importing never move `bars` through the
     client at all anymore**: `create` takes only `songIds: Id<"chordChartSongs">[]` — ids the
     client already has from its own metadata-only library listing — and copies each song's data
     (`title`/`composer`/`style`/`key`/`timeSignature`/`bars`) straight from the caller's own
     `chordChartSongs`/`chordChartSongBars` rows into fresh `communityChordChartSongs` rows,
     entirely server-side, inside the mutation. Symmetrically, `importIntoLibrary` (new — replaces
     the old client-side `mergeIntoLibrary` call `PostDetailModal` used to make) takes a `postId`
     and optional `songIds` (omitted = "Import all") and copies the other direction, straight from
     `communityChordChartSongs` into the caller's own `chordChartSongs`/`chordChartSongBars`,
     same server-side-only rule. Both share `convex/lib/chordCharts.ts`'s `findOrCreatePlaylist`/
     `songKey` helpers (also used by `chordCharts.importSongs`) so "merge into an existing
     playlist by name" and "skip a song you already have" mean the same thing everywhere a song
     gets added to a library. `get` (opening a post) now returns song *metadata only*, same
     "list cheaply, fetch one thing's bars lazily" split as the personal library's own
     `library`/`getSongBars` — a post's individual songs preview inline via a new
     `communityChordCharts.getSongBars` (one song's bars, fetched only for whichever row is
     currently expanded). Net effect: no operation in this whole feature ever has to hold more
     than *one song's* `bars` in memory or in a single value at once, so post size no longer has
     any practical ceiling tied to Convex's per-document or per-object-field limits —
     `MAX_SONGS_PER_POST` is still a cap (now 3,000, a generous sanity bound rather than a
     size-driven one) purely to keep one `create`/`importIntoLibrary` call's transaction from
     growing unbounded, not because a bigger post would break storage.

  Both `create` and `importIntoLibrary` were spot-verified against the real dev deployment (not
  just `tsc`): an unauthenticated call is correctly rejected, and — since the previous failure was
  specifically about a *shape* of return value (an object with too many fields), not overall
  payload size — a separate temporary query confirmed a 1,500-element *array* return succeeds with
  no comparable limit, which is the shape `get`'s song list now actually uses.

  **Posting requires the caller's own profile to be `isPublic`** (checked server-side in `create`,
  the real source of truth — the UI mirrors it by showing a "make your profile public" prompt
  instead of a Post button when it isn't) — **browsing only requires being signed in**, not a
  public profile of your own. Every read (`list`/`get`/`getSongBars`) drops a post (or song) whose
  author's profile isn't (or is no longer) public, the same privacy rule applied everywhere else
  cross-user data is read in this app, and `convex/account.ts`'s `performDelete` cascades both the
  post rows and their now-separate song rows, so deleting your account doesn't leave posts (or
  orphaned song rows) behind with no reachable author. The browse list (`list`) stays
  metadata-only (title, description, `songCount`, the author's *current* username/avatar).
  Posting (`CreatePostModal`) doesn't accept a pasted iReal link directly — it picks one or more
  songs out of the caller's *own* Chord Charts library, so there's exactly one place (the Chord
  Charts tool itself) that ever parses iReal links. That picker is grouped by playlist (the same
  grouping the tool's own "Tunes" panel shows) rather than one long flat checkbox list, per a
  direct follow-up request ("a better interface for selecting what charts to include... let me
  include entire playlists"): each playlist has its own tri-state checkbox (unchecked/checked/
  indeterminate, using the checkbox DOM node's `.indeterminate` property via a ref callback —
  there's no HTML attribute for it) that selects or clears every song in that playlist at once,
  alongside per-song checkboxes, and a collapse chevron per playlist. Picking a whole playlist as
  the very first selection defaults the post title to that playlist's name — a starting
  suggestion, never overwriting a title already typed. Viewing a post lets each song expand inline
  into the real `ChordChart` renderer before deciding to import it (lazily fetching just that
  song's bars via `getSongBars`), plus an "Import all" shortcut for the whole post — both call
  `importIntoLibrary` directly, so importing a chart you already have (from Community or anywhere
  else) is always a safe no-op rather than a duplicate, and lands in a playlist named after the
  post.
- **Community tunes** (`components/CommunityTunes.tsx`, `convex/communityTunes.ts`) — the Community
  page's fourth section, added right after Chord Charts per a direct follow-up ("there should be
  another section for posting tunes") and built as its sibling in every way: same shape, same
  posting-needs-a-public-profile/browsing-just-needs-an-account split, same metadata-only `list` +
  lazy-loaded-on-open `get`, same account-deletion cascade, same `v.any()`-blob-in-a-dedicated-table
  call (`communityTunes` in `convex/schema.ts`) for the identical "needs to be readable by other
  users, so `syncedSettings` alone can't cover it" reason. A post's `tunes` is a snapshot of
  `PublicTune[]` (`lib/profileTunes.ts` — name/tempos/keys/time signature) taken from the poster's
  own Tunes list (`useSyncedTunes()`) at post time via the new `toPublicTune` export, never
  `notes` — the exact same privacy rule `getPublicByUsername` already applies when a profile's own
  Tunes section resolves live, just run once at posting time instead. `CreatePostModal` here is
  the tune-shaped twin of the chord-charts one: a searchable checkbox list of the caller's own
  tunes instead of their own chord charts, same "post a tune" and "make a tune list" being the same
  action with a different number of boxes checked. The one real difference from Chord Charts:
  viewing a post (`PostDetailModal`) doesn't need its own bespoke row/import UI at all — it hands
  `post.tunes` straight to `PublicTuneList`, the *exact* component a public profile's own Tunes
  section already renders with (name, tempo/key chips, and the "Add"/"Learn" buttons that copy a
  tune into the viewer's own Tunes or Tunes to Learn list with the same name-based dedupe check),
  so browsing a Community tune post and browsing someone's profile page behave identically with no
  second copy of that logic to maintain. Capped at 300 tunes per post (`MAX_TUNES_PER_POST`) —
  higher than Chord Charts' 100, since a tune here is a few small fields, not a full parsed bar
  list, so many more of them fit comfortably under the same practical per-document-size concern.
- **"My Posts" and posts on a public profile** — two direct follow-up requests landed together
  since they're the same underlying gap: `list`'s shared Browse feed is capped at the 60 most
  recent posts across *everyone*, so your own older post could silently fall out of view with no
  way to find it again once enough other people had posted more recently, and there was no way at
  all to see what someone *else* had posted from their profile page. Two new queries per Community
  table (`communityChordCharts.ts`/`communityTunes.ts`), both scoped by the `by_user` index rather
  than `by_createdAt`, so neither is capped the way `list` is:
  - `mine` — every post the signed-in caller has posted, full stop, no `isPublic` filter (it's
    your own data; deleting already worked this way too, scoped purely by ownership). Drives a new
    Browse/My Posts toggle (a plain two-button pill, `view` state) in both `CommunityChordCharts.tsx`
    and `CommunityTunes.tsx` — switches which query's results the shared list renders, reusing the
    exact same row component either way (`PostListItem`, pulled out of each file's own top-level
    component specifically so Browse/My Posts/a profile's posts section all render a post
    identically — see below).
  - `listByUser(userId)` — a specific user's posts, for a public profile's own "Chord Chart Posts"/
    "Tune Posts" sections (`PublicProfilePage.tsx`). Same signed-in-required rule as `list`/`mine`
    (browsing needs an account, even someone else's posts, per Jack's existing scoping call for
    this feature) *plus* the target's profile has to currently be `isPublic` — re-checked
    independently here rather than trusted from the caller, even though `PublicProfilePage.tsx`
    only ever calls this once `getPublicByUsername` has already confirmed it, same "don't trust the
    caller, the query is the real gate" pattern every other cross-user read in this app follows.
  `PostListItem` and `PostDetailModal` are now exported from each Community component file
  (`export function`, not a second copy) and imported into `PublicProfilePage.tsx` aliased per
  source (`ChordChartPostListItem`/`TunePostListItem` etc.) — a post reached from a profile page
  opens in the *exact* same detail modal Community's own Browse/My Posts do, so viewing and
  importing behave identically regardless of which page led you there.

  Building this surfaced a real gap in the privacy rule itself: `get`/`getSongBars`/
  `importIntoLibrary` (chord charts) and `get` (tunes) all used to hide a post from *everyone*,
  including its own author, the moment that author's profile stopped being `isPublic` — meaning
  "My Posts" could list a post its own owner then couldn't actually open. Fixed by adding an
  owner bypass to each (`row.userId !== userId && !profile.isPublic`, rather than just
  `!profile.isPublic`) — your own posts stay visible/manageable to you regardless of your current
  profile visibility, the same way `remove` already worked (no `isPublic` check on it at all,
  scoped purely by ownership); a private profile still hides your posts from *everyone else*,
  which is the part the rule actually exists to protect.

  Verified against the real dev deployment (not just `tsc`): `mine` and `listByUser` both
  correctly return `[]` for an unauthenticated caller, including `listByUser` called with a real
  existing public user's id (not just a not-found one) — confirming "browsing requires an
  account" holds even when the target profile genuinely is public and exists. Not verified: any
  of the actual UI — the Browse/My Posts toggle switching correctly, a profile's posts sections
  rendering and opening the right modal, or the owner-bypass fix actually letting someone view
  their own post after going private (this sandbox has no way to sign in as two different users,
  post as one, go private, and confirm "My Posts" still opens for the owner). A direct follow-up
  request added `max-h-96 overflow-y-auto` to all four of a profile's list sections (Tunes, Tunes
  to Learn, Chord Chart Posts, Tune Posts) so a long one scrolls in place instead of pushing the
  rest of the page down indefinitely — confirmed, separately, that "import each tune to my
  account" was already covered by `PublicTuneList`'s existing `canAdd` prop on the Tunes/Tunes to
  Learn sections (per-tune Add/Learn buttons), not something that needed building. A further
  follow-up restyled `PostListItem` itself (shared by Browse, My Posts, and a profile's posts
  sections in both files) from a stacked card — title/meta, then a flat rectangular "View &
  import"/"View & add" button on its own line below — into a single horizontal row: title/
  description/meta on the left, a delete icon (when `onDelete` is passed) and a solid `bg-accent`
  "View" pill on the right, both vertically centered against the row via the `<li>`'s own
  `items-center`. `bg-accent` reads as blue by design here (`app/globals.css`'s `--accent`,
  `#6366f1`/`#818cf8` light/dark) — the same token every other primary action button in this app
  already uses (`Post a chart`, `Import all`, ...), not a one-off color picked for this button.
  A further follow-up request added search to both Community list views (Browse and My Posts,
  same input/filter in both files) — typing filters by the post's own title *or* any individual
  song/tune name inside it, not just the title. Chord charts needed a small schema addition —
  `communityChordCharts.songTitles: v.optional(v.array(v.string()))`, accumulated once in
  `create` alongside `songCount` — since a post's individual song names otherwise only exist
  inside `communityChordChartSongs` rows, which `list`/`mine` deliberately never read (the same
  cost `getSongsBars` blew up over — see the two-Convex-bug section below); denormalizing just the
  titles onto the post row keeps search free at read time without re-introducing that cost. Tunes
  needed no schema change at all: a tune post's `tunes` field is already inline `v.any()` on the
  row (small, capped at `MAX_TUNES_PER_POST`), so `communityTunes.ts`'s new `tuneNamesOf` helper
  just derives names from it defensively on every read instead of storing them separately. Both
  `summarizePost` functions now return the name list, and each file's top-level component filters
  its visible list client-side with a case-insensitive substring match against title-or-any-name,
  via a `useMemo` keyed off the trimmed/lowercased query. A `SearchIcon` + `<input type="search">`
  row (same shape used elsewhere in this app) sits above the list, only shown once there's
  something to search; the empty state distinguishes "no posts match your search" from "nobody's
  posted here yet". Verified with `tsc`, `eslint`, and `next build`; not verified by actually
  typing into the box in a browser, same caveat as everything else in Community this session.
- **Home** (`app/page.tsx` / `components/Home.tsx`) — an actual landing page, not a tool directory.
  Went through two very different designs this session: the first rendered every `NAV_LINKS` entry
  as an icon-card grid, grouped by category via the sidebar/command palette's own `groupByCategory`
  helper — a genuinely complete site overview, but one that read like generated documentation
  (a wall of identical cards) rather than a page meant to make a case for the site. Per a direct
  follow-up request to redo it as a real, "somewhat artistic" landing page instead — and
  specifically not "obviously AI generated" — it's a short, editorial single column now: a big
  two-tone "jack**shed**" wordmark (the "shed" in accent color, no gradient text, no icon logo —
  see below); a hand-picked, fixed-array waveform-bar strip under the hero (`WAVEFORM`, tuned by
  hand rather than `Math.random()`'d at render time, which would be a real hydration mismatch — the
  same class of bug `CollapsiblePanel.tsx`'s own "always render the chevron" comment warns about
  elsewhere in this app); a short first-person paragraph in Jack's own voice about *why* this exists
  (styled as a blockquote — a left accent border, not a boxed card) instead of impersonal marketing
  copy; and a curated "A few favorites" list of five of the ~14 tools (not all of them — picked for
  range: a practice tool, an ear trainer, a novelty metronome, a chart reader, and the recorder),
  each written up as its own real sentence with a large faint index numeral (01–05, alternately
  indented for a less perfectly-gridded rhythm) rather than reduced to an icon and a
  three-word fragment. Every tool is still fully reachable — nothing was removed, just no longer
  duplicated on this page — via the sidebar and the `/` command palette, which is what `NAV_LINKS`
  is actually for. Closes with one quiet line about accounts being entirely optional (linking to
  `/community`) instead of a separate "Ready to get started?" CTA banner, and the same footer as
  before. There's no separate icon logo anywhere in the app anymore either, per an earlier follow-up
  request in this same session — the old hand-drawn barn-roof SVG, `BarnLogo` in
  `components/tools.tsx`, was deleted outright (not just unmounted), along with its icon-box wrapper
  in both the desktop and mobile sidebar headers — the "sheddex" text itself is the logo
  everywhere now. Shows "Welcome back, {name}" above the title once signed in — `user.name` (only
  ever set by Google sign-in) if there is one, `user.email` otherwise, since every account has one
  or the other but not necessarily both, same fallback order this app already uses elsewhere for a
  short signed-in label (`AccountMenu.tsx`'s collapsed button, `AccountPage.tsx`'s own subtitle).
  Gated on both `useConvexAuth()`'s `isAuthenticated` and the `api.users.current` query actually
  resolving, so a signed-in visitor never sees a flash of the signed-out version first.

  (Note: the "A few favorites" numbered-list section described just above is no longer in the
  actual file as of this session — it was gone before this round's own changes started, with
  nothing in this document recording when or why. Flagging the drift rather than silently leaving
  it, the same way this file has caught stale documentation before, e.g. the "sheddex" rename
  bullet's own note about a four-file list going stale by the next rename.)

  **Redesigned again** per a direct follow-up with a reference screenshot (another site's own
  marketing landing page — a bold two-line headline, two CTA buttons, and a cluster of small
  floating product-photo widgets around a big centered phone mockup, with a customer-logo strip
  along the bottom) — used purely as a *layout* reference, not copied: "instead of the photos/
  widgets... put little interactive previews of the tools... instead of the buttons... put a
  search bar." Two concrete changes followed from that:
  - The hero's call-to-action buttons (this page never actually had any — the closest equivalent
    was a plain "press / to search" text hint) became a real, styled search-bar-shaped `<button>`
    that dispatches `components/CommandPalette.tsx`'s own `OPEN_PALETTE_EVENT` — the exact same
    event `Sidebar.tsx`'s own desktop search button already fires, so this opens the identical `/`
    command palette, not a second, parallel search implementation.
  - The reference's floating product photos became `PreviewCluster` — five small tool previews
    (Metronome, Jam Practice, Chord Charts, Guess the Interval, Polyrhythm Metric Modulation
    Metronome), each a real `Link` to that tool so the whole tile is what's "interactive" here;
    there's no live audio or state running on the landing page itself. One genuinely reuses a real,
    static-friendly piece of that tool's own UI (`BeatIndicator`, passed a fixed `currentBeat={0}`
    so beat 1 shows lit, no engine running) rather than an approximation of it; the other four are
    small hand-built stand-ins using this app's own existing tokens (`bg-surface`, `bg-accent`,
    the same icons `NAV_LINKS` already uses for each tool) rather than stock photos or screenshots,
    since there was no cheap way to drop in a real live preview of a chord chart or an interval
    quiz without the complexity (and landing-page weight) of their actual stateful components.
    Scattered via absolute positioning (slightly rotated, overlapping the way the reference's own
    photos did) only at `sm:` and up; below that it's a plain, un-rotated 2-column grid (the hero
    Metronome tile spanning both columns) — deliberately not the same absolute-position trick at
    phone width, which would be fragile to get right blind. The reference's bottom customer-logo
    strip has no real equivalent here (this app has no customers to name) and was dropped rather
    than forced into a parallel that wouldn't mean anything.

  **Actually verified in a real browser this time** — a first for this page's own revision
  history, and for most of this document's many "no working browser here" caveats: Playwright's
  own downloaded Chromium still fails on this machine (missing `libglib-2.0.so.0`, no sudo to fix
  it), but a working Chromium turned out to be reachable anyway via `nix shell nixpkgs#chromium`
  (Nix needs no root), driven over CDP with `playwright-core` (a plain npm install, no browser
  binary download, since it only connects to the nix-provided one). Against the real dev server:
  the page renders with zero console errors at both a 1280×900 desktop size and a 390×844 phone
  size; the scattered cluster doesn't overlap or overflow at desktop width (confirmed by screenshot
  — see this session's own notes for what that first pass caught: the Metronome tile's
  `BeatIndicator` wrapped onto two rows at the card's ~208px width using its default size, fixed by
  passing `size="sm"`); the mobile 2-column grid reads cleanly; and clicking the new search button
  genuinely opens the command palette (`paletteVisible` confirmed via a Playwright locator, not
  just "a click didn't throw"). This capability (nix chromium + playwright-core over CDP) isn't
  yet captured as a reusable project skill — worth a `/run-skill-generator` pass at some point so
  future sessions don't have to rediscover it from scratch.

  **A real bug this same verification setup then caught**, reported directly ("when hovering over
  the metronome widget thing it goes too far down"): the hero `PreviewCard`'s centering
  (`left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`, needed to center a `w-52` box at the
  cluster's exact midpoint) and `PreviewCard`'s own `hover:-translate-y-1` lift lived on the *same*
  element. Tailwind v4 compiles every `translate-*` utility to the same `--tw-translate-y` custom
  property plus a full `translate: var(--tw-translate-x) var(--tw-translate-y)` reassignment —
  confirmed by reading the actual compiled rules directly
  (`document.styleSheets[i].cssRules`, recursing into the `@layer`/`@media (hover: hover)` blocks
  Tailwind nests them in) rather than assumed from how the utility classes read. Since
  `.hover\:-translate-y-1:hover` has higher specificity than plain `.-translate-y-1\/2` (the
  `:hover` pseudo-class adds to it), the hover rule always wins while hovering — snapping
  `--tw-translate-y` from `-50%` (centering) to `-0.25rem` (the intended lift), which reads as the
  card suddenly dropping down about half its own height, not lifting. Fixed by moving the
  centering transform onto a plain wrapper `<div>` around the hero `PreviewCard`, so the Link
  itself only ever carries the hover transform, with no base translate-y for it to clobber — the
  four scattered (non-hero) cards never had this problem, since they're positioned with `rotate-*`
  utilities instead, a separate CSS custom property (`--tw-rotate`) that doesn't collide with
  `--tw-translate-y` at all. Caught and fixed using the same nix-chromium setup described above —
  reading the exact compiled CSS rule text to confirm the specificity/cascade mechanism by hand,
  since this particular headless Chromium build reports `(hover: hover)` as `false` — a real,
  separately-noted limitation of this nix-chromium setup — so simulated mouse hovers never
  actually trigger `:hover` styles to screenshot before/after directly, even after trying to
  override it via CDP's `Emulation.setEmulatedMedia`. `tsc`, `eslint`, and `next build` all pass.

  **The waveform-behind-the-wordmark treatment, extended app-wide.** Three more direct follow-ups:
  first, "overlay the sheddex logo over the bars" — the hero's waveform strip and "sheddex" title
  used to just stack vertically (bars, then a gap, then the heading); now they share one box, bars
  centered (`items-center`, not the strip's old `items-end` baseline-only growth) so a tall bar can
  extend both above and below the text's own line, with the heading rendered on top
  (`position: relative`, painted after its absolutely-positioned sibling in DOM order — no
  `z-index` needed for two `auto`-stacked siblings). Second, "lower opacity of waveform" —
  `bg-accent/40` → `bg-accent/20`, so the bars read as texture behind the bold text rather than
  competing with it. Third, "do the same thing for the sheddex in the side bar and mobile menu":
  rather than copy the hero's markup twice more (a third drifting copy), the whole effect moved
  into a new shared `components/Wordmark.tsx`, used by the hero *and* both of `Sidebar.tsx`'s own
  "sheddex" lockups (desktop header, mobile menu header) — one definition, not three. It takes two
  separate hand-tuned bar arrays (`WAVEFORM_LG`/`WAVEFORM_SM`, the same "hand-picked, not
  `Math.random()`'d — a real hydration mismatch otherwise" reasoning as the original array), since
  the much narrower sidebar/mobile lockup needs a different bar *density* to read right behind
  smaller text, not just fewer of the hero's own bars; a `heading` prop swaps the inner "sheddex"
  between a plain `<span>` and an `<h1>`, since the hero's copy is also the page's real main
  heading and the sidebar's own copies never were. Verified with the same nix-chromium setup,
  zoomed in via `document.body.style.zoom` before screenshotting a locator directly (the sidebar/
  mobile lockups render at only ~70×32px in reality — the bars are genuinely there and correctly
  proportioned at actual size, confirmed by inspecting each bar's real `getBoundingClientRect()`
  directly, but too small to visually read as a texture rather than noise in an un-zoomed
  screenshot, the same way they'd be hard to make out on an actual phone/sidebar at 100% zoom
  without looking closely) — both zoomed screenshots show the same bars-peeking-through-letterforms
  look the hero already had. `tsc`, `eslint`, and `next build` all pass.
- **Privacy Policy / Terms of Service** (`app/privacy/page.tsx`, `app/terms/page.tsx`,
  `components/LegalPage.tsx`) — plain prose pages, not tools (no `ToolLayout`), and plain Server
  Components (no `"use client"` anywhere in either — no interactivity needed). Linked from
  `Home.tsx`'s footer and, only during the sign-up flow specifically, `AccountMenu.tsx`'s
  `AuthForm`. Written to accurately describe what this app *actually* does (client-side-only
  tool data, what an account collects, the Convex/Resend/Google/Vercel third parties involved,
  no analytics/tracking anywhere in the codebase — confirmed by grepping for common trackers
  before writing this), with jurisdiction (Los Angeles County, California) and the
  privacy-request contact channel (GitHub issues, reusing what `README.md` already directs bug
  reports to) both confirmed with Jack rather than assumed. **Not reviewed by an actual lawyer**
  — a reasonable, honest starting point given this app's genuinely low-risk profile (no payments,
  no ads, minimal data collection), not a substitute for real legal review if that ever matters
  more (e.g. it picks up real users, or the planned data-sync phases land).


### Slow Downer: Volume chip and back to the loop start (2026-11-16)

FB-15/16/17. Volume moved out of the Speed chip into its own Volume chip. A ⏮ transport button
(the `SkipForwardIcon` mirrored with `-scale-x-100`, not a new icon) and the **B** key jump to the
loop's start, or the file's start with no loop on; the key is ignored in inputs, dialogs and with
modifiers. Enter was considered (Logic/Pro Tools use Return) but it would fight focused buttons.
Checked headless at 1440/390; not by ear.


### Slow Downer: draggable markers, number keys, saved loops (2026-11-20)

FB-29. Jack: "make the markers in the slow downer have more functionality, also have ability to
save loop values so I can go back to a loop and make it so i can set a loop start/end to a marker,
and yes make the markers draggable and make keyboard number keys go to the marker index number."
Web only (the mobile Slow Downer is unchanged).

- **Dragging markers** (`components/Waveform.tsx`, new `onMarkerMove(id, time, final)` prop): a
  `marker` drag kind like the loop-edge one: it grabs after 4px (10px for a finger), a short tap
  still goes to the marker (the old `onClick` is gone; the tap is handled in `onPointerUp`, since
  the box captures the pointer). Each marker is now two elements, a line strip (`z-10`, 24px wide on
  touch screens) and the name flag (`z-[21]`). The flag sits above the loop edges (now `z-[11]`) and
  the playhead (`z-20`): after "Loop to the next marker" a marker sits right on a loop edge, and
  after going to a marker the playhead sits on it; without that the marker couldn't be grabbed or
  right-clicked. Below the flag, a loop edge on a marker still wins. While dragging, the list isn't
  re-sorted (numbers stay put); it's sorted by time when let go.
- **Number keys:** 1–9 go to markers 1–9 in time order, 0 to the 10th, in the same keydown
  listener as B (pane guard, ignored in inputs and dialogs and with Ctrl/Alt/Meta; Shift allowed
  because some keyboard layouts need it for digits). Nothing else on the site uses bare digits.
  The number shows on the flag (`numberMarkers`, hidden on `pointer: coarse`), in the Markers list
  and as the menu hint. Going to a marker scrolls a zoomed view to it (`reveal`).
- **Marker menu** (`markerMenuItems`), from a right-click on a marker or the new ⋮ on each row of
  the Markers chip (the row's ✕ moved into it): Go to marker, Play from here, Loop from this
  marker, Loop to this marker (both through `setEdge`, same rules as the Loop start/end buttons),
  Loop to the next marker (or "to the end" on the last one), Rename marker (right-click only — the
  list has the name box; it opens `PromptDialog`), Delete. A right-click between markers adds
  "Loop between markers" (the markers either side, or the file's start/end). The ContextMenu
  (`role="menu"`) opens over the chip's popover/sheet without closing it.
- **Saved loops:** `lib/markers.ts` now also keeps `SavedLoop {id, name, start, end}` per file
  under `jam-practice-slow-downer-loops` in localStorage, keyed like markers (`name|size`), same
  100-file cap; deleting a browser-kept file clears both. "Save loop" appears in the loop row
  (when the loop isn't saved yet) and in the right-click menu; a new **Loops** chip lists them
  (time range button = loop it again and go to its start, highlighted when it's the current
  loop; a name box; ✕ to delete) with "Save current loop". The default name is the markers at
  both ends ("Verse to Chorus"), the start marker's name, or the first free "Loop N". Saving the
  same loop twice says "Already saved as …". When the current loop is a saved one, its name
  shows instead of "Loop" beside the times.
- Not synced to the account, like markers (they point at a file name and size, not a Files row).
  Help (Markers and a new Loops option, features) and the Shortcuts list updated. The Help text is
  shared with the phone app's intro, which doesn't have these yet.
- **Verified** headless (nix Chromium, dev server, signed out) with a generated 20 s WAV: three
  markers added; 2 and 3 jump to 0:10 / 0:15, 9 does nothing; dragging marker 1's flag past
  marker 2 moved it to 12.07 s and re-sorted the stored list without moving the playhead; a click
  on a flag goes to it; the right-click menus (marker and empty space) and the ⋮ menu show the
  right items; Loop to the next marker → 0:10–0:12.1, Save loop → named "Marker 2 to Marker 1";
  Loop between markers → 0:00–0:10, saved; picking a saved loop in the chip restores it; rename;
  everything still there after a reload. Touch emulation at 390 (`pointer: coarse`): flag numbers
  hidden, a touch drag moved a marker, a tap on a flag went to it. 1440 and 390, light and dark,
  no horizontal overflow, no console errors. `tsc` (web, desktop) and `eslint` pass.
- **Not verified:** a real mouse/finger (only synthetic events), Safari/WebKit and the desktop app,
  audio by ear, keyboards that need Shift for digits.
