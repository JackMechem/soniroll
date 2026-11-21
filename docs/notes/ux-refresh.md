# UX refresh (design/ux-refresh, 2026-11-17)

Jack asked for the web app to feel less confusing and cluttered: Vercel-dashboard-like UX (not its
look), smaller corners used deliberately, useless stats removed, the Shed Log decluttered, phones
intuitive, nothing that looks AI-generated. First pass done in one session (main thread plus five
parallel agents, each owning separate files); Jack reviewed live on localhost and corrected course.

## What changed

- **Radius scale** (`app/globals.css` `@theme`): sm 4px, md 6px, lg 10px, xl 12px, 2xl 16px, 3xl
  20px (Tailwind's defaults go to 24px). Controls use `rounded-md`, cards `rounded-lg`, dialogs
  `rounded-xl`. The big main buttons (Start, Pick a tune, Record) are `rounded-full` pills
  (`BIG_PRIMARY`/`BIG_SECONDARY` in `MeterFields.tsx`, `startButtonClass` in `learning/quizUi.ts`).
- **Borders:** first pass put a thin border on every card, row and button; Jack disliked "thin
  borders around everything". A script then removed them: cards are filled (`bg-surface` on the
  page), rows and secondary buttons/inputs use a faint fill `bg-foreground/[0.05]` (works on both
  the page and a card, light and dark), popovers/menus keep `ring-1 ring-foreground/[0.06]` with
  their shadow. Kept: the sidebar's edge, the phone top bar, page-header rules, `divide-y` lists,
  dashed empty states. Inputs focus with `ring-2 ring-accent/40`.
- **Sidebar** (`Sidebar.tsx`, `navRow.ts`): one flat list of rows (Dashboard, Your shed, People,
  then the tool categories); no cards, tiles or subtitles. Icons keep colour (Jack asked): tools in
  their category colour, Shed Log/Notes accent. The Shed Log row shows today's minutes/goal and a
  small ring. Collapsed mode: icon buttons split by hairlines.
- **Phones:** a fixed top bar (menu, logo or "logo / page name"), 3.5rem; pages already pad 4.5rem.
- **Tool pages** (`ToolLayout.tsx`): a 56px header bar on desktop (title, ?, tool stats on the
  right); on phones the title is in the top bar and the stats + ? sit at the top of the page.
  `ToolStats` is now one small button (today's time + streak) that opens the history, plus Log.
- **Option chips** (`SettingsBar.tsx`) and `Segmented`: Jack preferred the old ones — restored from
  git unchanged.
- **Dashboard** (`Home.tsx`): smaller header; cards with a title row; recents as plain rows; library
  counts as small numbers. **Library:** the big stat cards are gone; underline tabs, a toolbar, row
  lists. **Shed Log:** the stat-pill row is gone (one `TodaySummary` line under the title; full stats
  behind Stats); sections have plain headings; log-time is one row of small buttons; `MomentumPills`
  deleted. Account page: Vercel-style left nav, a Select on phones.
- Shared helpers added by agents: `learning/quizUi.ts`, `settings/SettingsSections.tsx`
  (`SettingsCard`, `BUTTON_PRIMARY` …), `lessons/parts.tsx` button constants, `library/ui.tsx`
  `Toolbar`/`RecentList`/`SetlistItem`.

## Verified / not verified

Verified: `tsc`, `pnpm lint` (one old warning), screenshots signed out at 1440/390, light/dark, no
horizontal overflow. **Not verified:** anything signed in (no test account; creating one on dev was
blocked) — the Shed Log, account, lessons, admin, Community feed were checked by reading code only.
Hover states, audio. Help screenshots in `public/help/` still show the old look.

## Follow-ups the same day

- Jack's corrections after the first pass: thin borders everywhere replaced by fills; old option
  chips restored; main buttons round; sidebar icons coloured; Favorites in an accent panel; presets
  moved into the tool's top bar (`PresetsButton`); −10/−5/+5/+10 tempo buttons; Space in a number
  field still starts/stops (`useSpaceToggle`); **Classic look** setting (`lib/display.ts`
  `classicLook`, `.classic-look` in globals.css: bigger radius variables, tinted sidebar icon
  tiles via `[data-nav-icon]`, bolder h1). The radius scale lives in a non-inline `@theme` block so
  that class can change it.
- Three rounds of context-free UI and UX reviews (separate agents, signed out). Scores: UI 6.5 →
  6 → 7.5, UX 7 → 7 → 7. Fixed from them: word-by-word tool search with extra keywords
  (`filterNavLinks` in packages/core), tunes in the / palette and the phone menu search, palette
  groups ordered by best match, `/library` redirect, signed-out Theme and display (sidebar dialog
  and /account), Log hidden when signed out, a phone tool row pinned under the app bar, muted
  beat bars, "New" tags instead of unexplained dots, ♯/♭ on the tuner dial, number fields select
  on focus. Left for Jack (reviewers kept raising them): short sidebar names, first-visit intros,
  /8 meters keeping a quarter-note beat, the support card on a first visit, Rhythm Section's own
  layout, Help's screenshots (need a signed-in retake), Learn mode's inner scroll.
- The headless browser played the Metronome through Jack's speakers once; it now always runs with
  `--mute-audio` (docs/guides/testing.md).

## Review rounds 4–8, signed in (2026-11-17, later)

Jack asked for five more rounds, signed in to his own account (dev deployment) and with a
first-impression score for every tool and page. Each round: one UI reviewer, one UX reviewer for
the tools (signed out, touch-emulated at 390) and one for the other pages (signed in, view only),
then three fix agents with separate files. The headless Chromium ran with a persistent profile
(not `--incognito`) so one sign-in served every agent; anything that saves was tested in fresh
signed-out contexts. Reviewers starred a sidebar tool by accident three times (loose selectors next
to the favorite stars) — each was undone and checked; later briefs said to navigate with
`page.goto` and never use `[aria-label*=…]` on the signed-in context.

Scores (UI · tools UX/ease · pages UX/ease): r4 7 · 7.5/7.5 · 7/7; r5 7 · 7.5/7 · 7.5/7;
r6 8 · 8/8.5 · 8/8; r7 7.5 · 7.5/7.5 · 8/8; r8 7.5 · 8/8 · 8/8. Different reviewers each round,
so the numbers wobble; the per-page tables in the round reports had most pages at 8–9.

What changed, roughly by area (details in the round commits, 42a8ab3 → the r8 commit):
- **Shed Log:** missed days are quiet (no red wash/✕; a muted date and dot); month and week views
  show routine marks filled by progress plus minutes and done/total; past days offer Log time;
  phones get Today / Calendar tabs and labelled header buttons; Stats steps back through weeks;
  `--success` / `--warning` tokens; destructive one-taps confirm.
- **Loading bug Jack saw** (page half signed in for a while): Convex answers a page's first query
  batch together, and the 386 KB `chordCharts:library` was in it on the dashboard, Shed Log and
  Library. `useChordChartsLibrary` now subscribes only after `users.current` answers. Not
  reproduced cold; the most likely cause removed.
- **Library:** Chord Charts tab is folders-first ("playlist" → "folder" in all UI text; data and
  Convex names unchanged), a Recent chip row, charts listed on the tab when there are few; Write
  the chart from a tune pre-fills and links; the editor guards unsaved work (`useLeaveGuard`);
  chart pages add their tune to a list; Play along → `/rhythm-section?chart=&key=` (web and
  desktop); Recordings tab with the Files ⋮ menu; standards picker chooses the list; tune-page key
  grid reads as "keys I know" toggles; chord charts scale crowded bars and keep the time
  signature clear of marks.
- **Navigation:** `/` palette and phone menu search find pages, settings, help topics, tunes and
  charts; Settings row in the sidebar; sidebar scrolls to the current page; phone top-bar name is
  a link and covers every page; the bug-report button lives in the phone top bar
  (`FeedbackBarButton`), floating only on desktop; a styled 404; Account on phones lists sections.
- **Tools:** all chip rows share the reward look (Sticking Warmup left `PLAIN_OPTIONS`); empty
  History/Struggles chips hidden until there's a result; phone tool pages top-aligned; presets in
  every tool's top bar (Rhythm Section and Syncopation too); the phone top row always fits;
  "New" tags only after a second choice in a group; trainers say what to do before round one,
  name the instrument and have their own timing chip; Slow Downer loops by touch with Loop
  start/end buttons and shows loop times; Score Writer works on phones (wrapping toolbar, folded
  fields, cursor kept in view, press-and-release entry); Practice Timer quick timer; Jam Practice
  empty-state actions and one-tap custom tunes; Interval Trainer with none selected = all.
- **Theme:** heatmap greens follow light/dark; 7 presets got more surface contrast; thin
  theme-coloured scrollbars on non-touch screens.

Left for Jack: the Rhodes license before any paid plan (see `support-and-donations.md` /
PROJECT.md), Help and landing screenshots (retake signed in), the browser Back button not closing
sheets, the dashboard gap at two-column widths, the Shed Log header icon.

Not verified across these rounds: anything that writes to a signed-in account (logging, linking,
saving charts, week-view dragging), audio by ear, hover styles, real phones and Safari, the
desktop app at runtime (tsc only).

## Header bar with crumbs on every page (2026-11-20)

Jack asked for every page's header to look like the tool pages' desktop bar, with the trail of
pages you came through ("Library / Tunes / Setlists / Another test Setlist"), each one clickable.

- **One component, `components/PageBar.tsx`.** The 56px bar (`absolute inset-x-0 top-0 hidden …
  lg:flex`): the page's icon (muted), the crumbs (earlier ones muted links, "/" between, the page
  itself last in an `h1`), the intro ? (`helpTopic`, or `intro` when the page runs its own),
  `help`, `titleExtra`, `actions`, then Report a bug. `ToolLayout` renders it too, so the tools
  look as before. Crumbs are `{ label, href?, onClick?, short? }`; they follow the page's
  structure (where its back button went), not browser history. Past five on desktop the middle
  ones fold into "…".
- **Where it sits.** It's `absolute` at the top of the nearest positioned box: the page scroller
  (`AppShell`'s `[data-page-scroll]`, now `relative`) or ToolLayout's page. Pages pad `lg:pt-20`
  for it (`PageShell`, `LibraryPage` and the custom `main`s); phones keep the 4.5rem for the phone
  bar. Don't put a narrower `relative` wrapper between a page's root and its `PageBar`.
- **Phones and panes** (`lib/pageCrumbs.ts`): `PageBar` hands its trail, icon and ? to a small
  store with `usePageCrumbs` (in an effect, so the server render and hydration see nothing and
  the top bar falls back to its old path-based name). `Sidebar`'s `MobileBarTitle` shows the logo
  then the trail: a short one whole (≤ 26 characters), else "… / parent / page"; "…" opens the
  hidden crumbs as real links (so `useLeaveGuard` still asks); tapping the page's own name
  scrolls to the top; the page's ? sits after it. Inside a split-screen pane the page writes to
  the pane's own store (`PaneCrumbStoreContext`) and the pane's bar shows the trail instead of
  the tool name. `phoneCrumbs` gives phones a different trail (Help: just "Help" until a topic is
  open, since desktop always shows one).
- **Gotcha:** the store's snapshot must only change when the trail does (labels, links, icon).
  The first version handed out a new object on every page render; in a pane, whose bar is the
  page's parent, React re-rendered the pane on the changed snapshot, which re-rendered the page,
  which made a new snapshot — "Maximum update depth exceeded". Handlers are now copied onto the
  same snapshot.
- **Pages:** `Hero` and `PageHeader` take `crumbs` (the pages above; their old `back`/`backHref`
  become one crumb) and render the bar, with the subtitle, `leading` badge, buttons, tabs and
  search on a line under it (Library's storage meter sits at the end of the tabs). Library trails
  come from `components/library/hrefs.ts` (`LIBRARY_CRUMB`, `UNDER_TUNES`, `SETLISTS_CRUMB`,
  `FILES_CRUMB`) and `chartCrumbs.ts` (a chart under its tune; "Chart" when it has the tune's
  name). Every other page with its own `h1` got the bar: dashboard, Shed Log and routines, Shed
  Notes (/ the open note), Lessons and its pages, Community, posts, profiles, New post, Account /
  section, Help / topic, What's new, Admin / tab, Storage plans, Support, Desktop app, Phone app,
  Feedback, legal pages (`LegalPageBar`, since `LegalPage` is a server component) and shared links
  (one crumb, the item's name). Titles that are content stay as headings (`h2`): the dashboard
  greeting, a post's title, a profile's name, signed-out pitches, the download pages' headlines.
- **Left as they were:** the landing page, not-found, the maintenance screens, reset password,
  print views, dialogs, the chart reader's own title, and the setlist chart reader
  (`/setlist-charts`, a full-screen reader with its own bar).

Verified: tsc (web, desktop), `pnpm lint` (the old SettingsBar warning only); nix Chromium at
1440 and 390, light and dark, signed out and signed in with a throwaway account (deleted after):
about 45 pages' trails, no console errors or horizontal overflow; clicking crumbs, the phone "…"
menu, the phone ?, a three-pane split screen. Not verified: hover styles, the desktop app at
runtime, real phones, the admin page (owner only), a lesson's notes page with real data, shared
links with real items.

## 2026-11-20 — UI pass 1 fixes (web + desktop)

From a reviewer's pass (6.5/10). Fixed:
- **Phone crumbs** (`PageBar`'s compact `CrumbTrail`): crumbs of 7 letters or fewer take only their
  own width (the 4rem minimum left a gap after "Help /"); the trail folds to "… / parent / page" past
  ~20 characters so the page's own name isn't the part cut short; the current crumb is
  `role="heading" aria-level=1` (phones had no h1), and the dashboard's phone-bar logo is in an h1.
- **Own private profile**: `/u/<you>` says "Your profile is private" with a Make it public link
  (`profiles.getMine`, asked only when the profile comes back hidden). Others still can't tell a
  private profile from a missing one.
- **Help**: Library and Chord Charts topics describe charts living on tunes; the Chord Charts topic
  has no `href` (no Open button; its icon is in `EXTRA_ICONS`).
- **`PageHeader`** with buttons but no subtitle puts them in `PageBar`'s actions from `lg` (Community's
  New post); phones and panes keep the row.
- **Fills, not outlines**: `TuneFields` pills, `RewardCard` tiles (every reward-look option popover)
  and MetronomeOptions' tiles; picked = tint + 2px inset ring. Key grid shows D♭/F♯/C♯m. `PoolPill`
  still has borders (not done).
- Tune page signed out: "Sign in" in the Files and Recordings cards is a link.
- Library filters: the Library list and With/Without charts are hidden when they'd show 0 (unless
  picked, and never while charts load). The "Library" list name was left for Jack.
- Desktop fixes are in `desktop-app.md`.
Verified in headless Chromium (390/1440, light/dark; the profile signed in with a deleted `.test`
account). Not verified: screen readers, hover styles, the real desktop window.

## 2026-11-20 — UI pass 4 fixes (web + desktop)

From a reviewer's pass over people, account and first impressions (7/10). Lessons, Community and
desktop items are in `lessons.md`, `community-and-profiles.md` and `desktop-app.md`. Here:
- **Phone crumbs** (`CrumbTrail`, compact): after folding to "… / parent / page", if parent + page
  is still over 22 characters the parent folds too, so the page's name is whole.
- **⌘K / Ctrl+K** opens the search palette as well as "/" (from text boxes too, desktop widths
  only), except inside a Shed Notes editor (its own Mod-k) or when the page already used the key
  (the notation editor's add-a-chord, via `defaultPrevented`). The sidebar's Search shows "⌘K" or
  "Ctrl K" beside "/" (after hydrating, so nothing mismatches).
- **Help and palette for account basics**: the "Account, sync & themes" topic has options for a
  forgotten password, changing it and deleting the account (`packages/core/helpContent.ts`);
  Help search also matches step titles. The palette has "Forgot your password?" (signed out,
  `/reset-password`) and "Delete account" (`/account?tab=danger`).
- Dashboard edit banner: its sentence is hidden on phones (two lines instead of five).
- Feedback: the email box takes its own row on phones and in the compact form.
- Streak and In total cards hide their share button at zero.
- Signed-out `/account` (the sidebar's Theme and display) is titled that, and is `max-w-2xl` so
  the font tiles don't truncate.
- Storage plans signed out: Sign up free comes before Sign in, like everywhere else.
- Days practiced squares have day names for screen readers; future days are hidden from them.
Verified in headless Chromium (1440/390, light/dark; signed in with deleted throwaways). Not
verified: hover, screen readers, real phones, the desktop window.

## 2026-11-20 — UI pass 5 fixes (web + desktop, the last pass)

From the final whole-app reviewer pass (7.5/10). Library items are in `library-two-tabs.md`. Here:
- **Dialog order**: Edit tune / New tune (`TuneEditorModal`) is Cancel then the main button,
  right-aligned, like every other dialog.
- **Log button** (`ToolStats`): shows from a minute unlogged (it was 1 s); between 1 s and a minute
  nothing shows (the time chip counts the seconds), and "Logged" only once nothing is left.
- **Jam Practice** signed in with tunes only in the Library list / Tunes to Learn: "None of your
  tunes are in Tunes I Know yet. Move some there from your Library…" (a link) instead of "Your tune
  list is empty".
- **Dashboard at `md`** (800 wide, a normal desktop window): half-width cards pair up in order under
  the dense flow, so with an odd number the last one spans the row (`LONE_SIZE_CLASSES` in
  `lib/dashboardLayout.ts`). `lg` keeps its sizes; edit mode isn't touched.
- **Sign-in prompts**: Recorder (signed out) and Score Writer's signed-out note use `SignInButtons`
  (Sign up free + Sign in), like the Files and Shed Log pitches.
- **Help**: plain `/help` on desktop opens a "How soniroll works" panel with the Getting started
  topics (crumb "Help", URL stays `/help`) instead of silently picking Dashboard. Long tool names
  (over 24 characters — only Polyrhythm Metric Modulation Metronome) use the sidebar `short` name on
  phones for the Open button and the crumb.
- **Feedback**: the picked tile is tint + inset ring (it was a solid accent block); the email
  placeholder is "Email, if you'd like a reply".
- **Shed Notes**: the list's "No notes yet" line is `lg:hidden` (the main pane says it on desktop).
Verified in headless Chromium (1440/390/800, light/dark; signed in with deleted `.test`
throwaways), tsc in web and desktop, eslint on the changed files. Not verified: hover, the real
desktop window, screen readers.
