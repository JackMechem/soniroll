# Site settings (Account → Settings)

## 2026-10-19: a Settings group on the account page

Jack asked for a settings page for account holders with global settings for the whole site, the
theme picker moved onto it, built into the account page by extending the old "Preferences" group,
with as much as possible configurable: turning features off and changing defaults (hiding stats,
folding things by default).

**Where it lives.** The account page's nav group "Preferences" became **Settings**, with six
sections (`?tab=`): General (`general`), Appearance (`appearance`), Sidebar (`sidebar`), Dashboard
(`dashboard`), Tools (`tools`) and Shed Log (`practice`). `/settings[?tab=]` redirects to
`/account?tab=general` (or the given tab). The sections are in
`components/settings/SettingsSections.tsx`. Each card's options have a `?` that reveals their
descriptions (`HintsContext`), per the style guide.

**Storage.**
- `lib/siteSettings.ts`: `useSiteSettings()` over one synced key, `jam-practice-site-settings`
  (`useSyncedSettings`, so it follows the account). Every default is how the site behaved before.
  A copy goes to `jam-practice-site-settings-cache` in localStorage once the real values load;
  until then the hook returns that copy, so a reload doesn't flash the defaults.
  `cachedSiteSettings()` reads it for code outside React.
- `lib/display.ts`: device-only display settings (`jam-practice-display`): text size (root
  `font-size` %, everything is in rem) and "Less motion" (`html.less-motion`, see the end of
  `globals.css`). `DISPLAY_INIT_SCRIPT` is inlined in `app/layout.tsx` next to the theme's, so
  they're applied before paint. It's kept in a file with no React/Convex imports so the server
  layout can import the string.
- The theme stays device-only (`lib/theme.ts`, unchanged). `ThemeModal` was split: `ThemePicker`
  is the picker itself (inline on Appearance); `ThemeModal` wraps it in the dialog.
- Some switches write existing keys rather than new ones: tool stats → `jam-practice-tool-stats`
  `hidden`; tool time → the Shed Log's `prefs.trackTools`; the Shed Log's stats and day panel →
  `jam-practice-practice-log-view` (`showStats`, `dayHidden`; `VIEW_KEY`/`VIEW_DEFAULTS` are now
  exported from `PracticeLog.tsx`); the bug report button → `FeedbackFab`'s own key
  (`hideFeedbackFab` was added).

**What each setting does, and where it's read.**
- Clock 12/24 h: `setClock24` in `packages/core/practiceLog.ts` changes `formatTime`. It's a
  module flag set by `components/SiteSettingsEffects.tsx` (mounted in the root layout): from the
  cached copy when the module loads (before anything renders), then from the real value once
  `ready`. Calendar hour labels and the time picker's quick picks drop ":00" only before AM/PM
  (`/:00(?= )/`), so 24 h labels read "15:00". Mobile's default (12 h) is unchanged.
- Confetti and sparkles: `setCelebrationEffects` in `Celebrations.tsx` stops `burstAt` and the
  confetti rain; `html.no-confetti` hides `.confetti-piece` elsewhere (level complete). Toasts
  still show; sounds are the Shed Log's own setting.
- Features: Shed Log / Community / Lessons off hide them in the sidebar (the Shed Log card,
  Community and Lessons tiles), on the dashboard (Today's practice, Lessons) and the streak badge.
  The pages still open by URL. Nothing is deleted.
- Sidebar: "Start with tool groups folded" is the default for groups you haven't opened or closed
  yourself (`collapsedCategories[key] ?? site.sidebarCategoriesCollapsed`); Support row; streak
  badge (`StreakBadge`). Hidden tools (pill toggles by category) leave the sidebar and the
  dashboard's Favorites/Get started/All tools; a search still finds them.
- Dashboard: a switch per card (`DASHBOARD_CARDS`). The grid is now `grid-flow-row-dense` so a
  hidden card doesn't leave a hole.
- Tools: option descriptions shown by default (`useHints` in `lib/panels.ts`: panels now store
  `hints` "on"/"off"/"" alongside the old `showHints`; "" follows the setting); colorful option
  chips (`ToolLayout`'s `rewardOn`); explaining a page the first time (`useIntro`), and "Show them
  again" (`resetIntros()` clears `jam-practice-intros-seen`).
- Shed Log: "Opens on" Last used / Month / Week / Day (`PracticeLog` keeps the view picked in this
  visit in state; otherwise the setting, or the stored last view for "Last used").
- General → Reset settings puts `SITE_DEFAULTS` back (not the theme, display or other keys).

**Sidebar menus.** Signed in, the ⋮ menus' "Theme" item is now "Settings" (gear icon,
`GearIcon` added to `tools.tsx`) and goes to `/account?tab=general`. Signed out it's still "Theme",
opening the dialog, since the settings page is for account holders.

**Verified** in headless Chromium against the dev server, signed out with the account page's
sign-in check bypassed temporarily (so the synced path ran on localStorage): every tab at 1440
dark and two at 390 dark (no overflow, no console errors); hiding Metronome, folding groups,
hiding Support, turning off Community, two dashboard cards off, 24 h clock and Large text all
took effect on the dashboard and sidebar and survived a reload; the Shed Log opened on Day with
24 h times. **Not verified:** signed in (the account sync and the cache handoff on a fresh
device), real phones, light mode for every tab, hover styles.

## 2026-10-27 — the dashboard is edited right on it (Edit), with a calmer default

Jack: the dashboard had too much going on; he wanted it fully customizable on the dashboard itself,
behind an edit mode. Same component in the desktop app (it renders `components/Home.tsx`).

- **Layout:** `lib/dashboardLayout.ts` has every card (`DASHBOARD_CARDS`: id, label, hint, the sizes
  it allows, and the feature it needs), `DEFAULT_LAYOUT`, and helpers (`resolveLayout`, `moveItem`,
  `nextSize`, `defaultSize`). The layout is a list of `{ id, size }` saved as `dashboard` in the
  site settings (synced; `null` = default). Sizes: small/medium/large/full = 4/6/8/12 of a 12-column
  grid from `lg`, 1 or 2 columns from `md`, one column on phones (the size button is hidden there).
- **Old setting:** `hiddenCards` (the Settings switches) is only read while `dashboard` is null, so
  people who'd switched cards off keep them off in the default; the old "today" also hides the two
  cards it was split into. Reset (and Settings → Dashboard → Back to the default cards) clears both.
- **Cards changed:** "Today's practice" was split into **Goal and streak** (`TodayMomentum`),
  **Today's practice** (day timer + on today + quick add; the "Start your Shed Log" invite signed out)
  and **Days practiced** (`HeatGrid bare`, 18/26/40 weeks by size). Every card now has the same
  frame (`Card` in `Home.tsx`: a title row, `tone` surface/accent/plain). Lessons and Support kept
  their looks but the dashboard decides whether they show: `useLessonsData()` (null = no lessons)
  and `useSupportCardHidden()`. The old always-there "chip in" box at the bottom is gone (the
  Support card covers it; the footer gained a "Support soniroll" link).
- **Default:** Goal and streak, Today's practice + Days practiced, Pick up where you left off + Tune of
  the day, Favorites, Lessons (only if you have any), Support. Library, Setlists, Practice sessions,
  weak spots, Ear training path and All tools are in Edit → Add a card.
- **Edit mode (`components/dashboard/DashboardGrid.tsx`):** the Edit button by the search (or
  `/dashboard?edit`, which Settings links to) swaps the header for a sticky "Editing your dashboard"
  bar (Reset with a confirm, Done; Escape also leaves and drops `?edit`). Each card gets a dashed
  frame with a row of controls: a drag handle, its name, a size button (cycles through the sizes it
  allows) and ×; its content is `inert` and dimmed. Cards with nothing to show get a placeholder
  ("Shows once you're signed in"). "Add a card" lists what's missing (descriptions behind the ?).
- **Dragging** is hand-rolled with pointer events: a mouse can grab anywhere on a card, a finger or
  pen only the handle (`touch-none`), so phones still scroll. The card follows the pointer
  (a transform, no re-render), an accent bar shows where it'll land (before/after the card under the
  pointer; above/below when that card is nearly full width), and it's placed on release (Escape
  cancels). It scrolls the app's scrolling area near its edges. Arrow keys on the handle move a card
  one place, and focus is put back on the handle afterwards.
- Outside edit mode the grid is `grid-flow-row-dense`, so a card that has nothing to show doesn't
  leave a hole; while editing, the grid follows the saved order exactly.

Checked with the nix Chromium (dev server on port 3100, signed out, 1440 and 390 wide, light and
dark): the default layout, Edit, a mouse drag (the drop bar and the new order), size changes, ×,
adding cards, arrow-key moves (focus stays on the handle), the order and sizes surviving a reload,
`?edit` and Escape, Reset, no console errors, no sideways scroll on a phone. `tsc` and lint pass for
web and desktop; the desktop frontend builds. **Not checked:** anything signed in (Goal and streak,
the Today's practice list, Days practiced and Lessons with real data, the layout syncing to the
account), dragging with a finger on a real phone, and the desktop app's window itself.
