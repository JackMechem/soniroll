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
