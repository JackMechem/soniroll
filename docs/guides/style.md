# soniroll style guide

How soniroll should look, behave and read. These rules come from Jack's own requests and
corrections over many sessions. Follow them for every new screen, on web and mobile. If you're
unsure, copy how an existing, recently redesigned page does it (the Shed Log, the Tunes/Chord
Charts pages, Lessons, the Metronome).

## Words

- **Sentence case everywhere.** Never all caps: no Tailwind `uppercase` (or `tracking-wide` caps
  styling), no `.toUpperCase()` on display text, on web or mobile. "Played on", not "PLAYED ON".
  Small field labels are `text-xs font-semibold text-muted`.
- **Plain, concrete, short.** Say what a thing does in everyday words a musician would use. No
  marketing voice, no developer jargon in the UI. One line beats a paragraph.
- **Names people see:** "soniroll" (lowercase), "Shed Log" (not Practice Log), "Tunes I Know" (not
  just "Tunes" for that list), "Tunes to Learn", "Chord Charts", "Library" (the sidebar card for
  tunes, setlists, charts and files), "Files", "Community", "Lessons". A tool's
  page title must match its `NAV_LINKS` label exactly (the header icon and intro are looked up by
  it); `short` names (e.g. "Intervals") are only for the sidebar.
- **Never name** the source the Syncopation exercises were modelled on, or the book the Random
  Sticking Warmup's patterns came from.
- **Changelog and help text** are written for the people using the site, not for developers
  (see `versioning.md` and `apps/web/lib/helpContent.ts`).
- Error messages are friendly and say what to do next; they never reveal private facts (e.g.
  whether an email has an account).

## Color and theme

- **Only theme tokens, never raw colors.** Web tokens (CSS variables in `apps/web/app/globals.css`,
  Tailwind names in brackets): `--background` (`bg-background`), `--surface`, `--surface-hover`,
  `--foreground`, `--muted`, `--accent`, `--accent-hover`, `--accent-foreground`, `--overlay`,
  `--danger`. There are 30 preset themes plus a custom one (`packages/core/themes.ts`), so a
  hardcoded color will clash somewhere.
- **Derived colors also follow the theme:** category colors `--cat-0…6` (`CATEGORY_COLORS`) and
  key colors `--key-0…11` (`KeyBadge`) are the accent rotated in hue with `oklch(from …)`. Use them
  for tool tiles and keys instead of picking hues.
- **Check light and dark** (and ideally one odd preset like Gruvbox or Synthwave). Dark mode is the
  `.dark` class; screenshots and images swap with it.
- **Mobile:** colors come from `useAppTheme().colors` as inline `style`, never NativeWind color
  classes (they don't update on native). NativeWind is for layout and type only.

## Layout

- **Phones first.** Every page must work at 390px wide with a 16px gutter and no horizontal
  scroll. Check it.
- **Desktop pages are full width** from `lg` (`lg:max-w-none lg:px-8`): dashboard, library pages,
  account, posts, profiles. Reading pages (legal, shared links) and Community/New post stay
  narrow. Card grids add columns on wide screens.
- **Tool pages** (`ToolLayout`): the tool's main display in the middle; **options as setting
  chips** under it (each chip shows its current value and opens a popover; a bottom sheet on
  phones). A mode switch (One meter / Changing meters, Practice / Learn, Timed / Listen) sits above
  the chips. History/Struggles are chips above the display. No hideable options column.
- **Titles:** `text-2xl sm:text-3xl font-extrabold` in the foreground color, with the accent icon
  and a `?` that opens the page's intro (`IntroButton`). Library and other pages use `Hero` /
  `PageHeader` with the same look.
- **Back buttons:** `BackButton` (chevron + label in a pill), not "← Back" text links.
- **Popovers and menus** are portaled to `<body>` and `position: fixed`, kept on screen, capped to
  the available height with only their body scrolling. Escape, ×, and a click outside close them.
- **Mobile tool screens don't scroll.** Essentials on the main screen; everything else in the
  tabbed `ToolOptionsSheet`. The tab bar is only on the four main screens; scrolling pages leave
  room for it with `useTabBarSpace()`. Mobile cards, rows and buttons come from
  `components/ui.tsx` (the same fills, corners and category colours as the website).

## Controls

- **Sliders:** `<input type="range" className="slider">` with a `--progress` style for the filled
  part. Never the browser's default look.
- **Option descriptions are hidden by default** behind a `?` toggle (web: `Hint`, `SwitchRow`'s and
  `AdvancedSlider`'s `hint`, the panel's hints toggle) or an ⓘ popup (mobile: `InfoButton`). Every
  new option gets a description, but never as always-visible text under it.
- **Pools of choices** (which intervals, which roll types) are pill toggles; if the user empties
  the pool, fall back to all of them.
- Dropdowns: `Select` (web) / `Dropdown` (mobile). Confirmations: `ConfirmDialog`, never
  `window.confirm`. Typing a name or "DELETE" to confirm is for destructive, account-level actions.
- Loading: `LoadingSpinner` (the beat-dot spinner on web; the native spinner on mobile). Don't
  show a spinner where a synced hook already returns sensible defaults.
- Mobile press feedback: static `style` + `android_ripple` (never `style={({pressed}) => ...}`).

## Type, icons, music

- Web uses Geist (UI) and the theme's chosen font; chord charts use Petaluma / PetalumaScript
  (SMuFL glyphs for Δ, °, repeat signs, coda, segno). Mobile uses Geist too — every `<Text>` needs a
  `font-ui*` class.
- Web icons come from `components/tools.tsx` (and `RoutineIcon`, `InstrumentIcons`); mobile uses
  `@expo/vector-icons` (MaterialCommunityIcons; FontAwesome5 for the drum). Don't hand-draw new
  SVG icons when one exists.
- Notation is VexFlow, colored with `currentColor` from the theme (never VexFlow's default black).
- The logo is `components/Logo.tsx` (both apps), theme-colored.

## Motion and feel

- Small, quick animations that respect `prefers-reduced-motion` (page slide-in, the logo's ring
  sweep, check-off bursts, confetti on real achievements). Celebrations only for real moments
  (goal met, streak milestones, level passed).
- Nothing should flash wrong content on load: render nothing user-specific on the server, and wait
  for synced settings (`ready`) before showing values that would otherwise jump.
