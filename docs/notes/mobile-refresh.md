# Mobile refresh (2026-11-19, in stages)

Jack picked the mobile app up again after a month's pause. He asked whether something other than Expo
would be better (a Tauri 2 build reusing the website's components was the alternative weighed), then
chose to **stay on Expo**. The brief: bring the app up to where the website and desktop app are — the
soniroll name and the post-UX-refresh look — **without porting any new tools for now**, changing the
UI/UX as much as a phone needs, in small stages with a check-in after each. Mid-way through stage 1
he added: redesign the app's overall flow too, the old bottom tab bar no longer made sense, "go with
whatever you think fits".

Work is on the `feat/mobile-refresh` branch.

## Stage 1 — rebrand, the website's look, and the navigation

**The name and logo**
- The logo's shapes moved to `packages/core/logo.ts` (wordmark outline, ring, badge, note) so both
  apps draw the same logo; web's `components/Logo.tsx` imports and re-exports them (nothing else on
  web changed). Mobile `components/Logo.tsx` has `Logo`, `LogoMark` and `Mark`, theme-coloured like
  the web's (ring `accent`, track/note/badge `foreground`, tick `background`). The old sheddex
  crossed-sticks wordmark is gone.
- App name `soniroll` (`app.json` `name`; the photo permission text too). Kept on purpose: the
  package id `com.jackmechem.sheddex`, the `sheddex` link scheme and the Expo slug (a new package id
  is a new app on the phone and loses its data; the slug is tied to the EAS project). The prod build
  script now names its copy "soniroll prod".
- Icons, rendered from SVG with `rsvg-convert` (nix librsvg): `icon.png` (the ring on the dark
  default theme's `#18232F`), the adaptive icon's foreground (ring inside the 66% safe zone) and
  background, a **monochrome** icon with the badge cut out of the ring (white-on-white otherwise
  hid the tick; also the notification icon), `favicon.png`.
- **Launch:** the native splash shows the empty ring with its note (`splash-icon.png`);
  `components/LaunchSplash.tsx` starts identical, sweeps the ring closed and pops the tick (the
  website's page-change animation, same timing and easing), then fades into the app. Reduced motion:
  just the fade. It replaced Expo's template overlay (`animated-icon*`, a blue screen with Expo's
  logo), which had been left in since the project was created; its images and the other unused
  template images were deleted.
- Text and links: share links (posts, setlists) point at `https://www.soniroll.com/…`; "sheddex" is
  gone from UI text (Community's sign-in prompt, the chart-link import error, the profile address
  hint).

**The look**
- **Geist** replaces Inter (`@expo-google-fonts/geist`, the website's UI font). The classes were
  renamed `font-inter*` → `font-ui`, `font-ui-semibold`, `font-ui-bold`, `font-ui-extrabold`
  (every `<Text>` still needs one; 900+ uses changed by script) and the few `fontFamily` literals
  point at `Geist_*`.
- `tailwind.config.js` has the website's corner scale (sm 4, md 6, lg 10, xl 12, 2xl 16, 3xl 20).
- **Category colours**: `packages/core/accentColors.ts` computes the web's `--cat-N` / `--key-N`
  colours in TypeScript (OKLab maths: the accent turned round the hue circle, chroma at least 0.09,
  then clipped per channel). Checked against headless Chromium's own rendering of the CSS for six
  accents including a grey and an out-of-gamut pink: every step within 1/255. Two things found doing
  that: Chromium **clips** out-of-gamut colours per channel when it paints (not CSS Color 4's gamut
  mapping, which gave visibly different oranges), and it gives greys a hue of about 23.7°, so the
  code uses that. The web's `CATEGORY_COLORS` now reads the category → index map from there too.
- `useAppTheme().derived`: `fill` (the web's `bg-foreground/[0.05]`), `hairline`, and `category`
  colours. `withAlpha(hex, opacity)` is exported from the theme provider.
- `components/ui.tsx`: `PageTitle`, `Card` (filled, title row with an optional link), `ListRow`
  (rows on the faint fill), `IconTile` / `ToolIcon` (a tool's icon on a tile in its category
  colour), `Button` (primary / secondary, `pill` for big main buttons), `IconButton` (`primary` for a
  page's main action), `SearchField`, `Chip`, `EmptyText`. The library's older `SearchField` in
  `ChordChartList.tsx` now renders this one, so there's one search look.
- Headers: titles in the text colour (they were accent) with the tool's icon in its category colour
  on tool screens (looked up by title, as the web does); the back button sits on the faint fill.
- All-caps labels removed app-wide (47 field labels plus the ones passed through `label('…')`
  helpers, "TIME'S UP" etc.) and their wide letter-spacing; sentence case as the style guide says.

**Navigation (Jack: "go with whatever you think fits")**
- Four tabs: **Home · Tools · Library · Community**, with short labels. **Account** (profile,
  settings, Theme, signing in) is the button at the top right of each main screen
  (`AccountButton`: your picture, or a person icon); it opens `/profile`, now a normal screen titled
  "Account" with a back button. Theme moved there (a row; signed out too).
- **The tab bar shows only on the main screens** (`/`, `/tools`, the Library's four parts,
  `/tool/community`). Anything opened from them — a tool, a tune, a chart, a post — covers the screen
  with a back button, so a tool gets the whole screen (the old bar sat under every tool, and four
  screens had to hide it by hand). `useTabBarSpace()` knows whether it's showing; screens no longer
  add `TAB_BAR_CONTENT_HEIGHT` by hand (about 20 tool and detail screens lost that padding).
- **Tools** (`app/tools.tsx`, new): search, Favorites as cards, then each group in its own card in
  the sidebar's order, each tool in its category colour with a star.
- **Library**: Tunes (`/library`), Setlists (`/library/setlists`), Charts (`/charts`) and Recordings
  (`/recordings`) are its four parts, switched with underline tabs under one "Library" header
  (`LibraryHeader`, `router.replace` between them), like the website's Library page. Setlists and
  Recordings used to be pushed screens with their own headers.
- **Home** is the website's dashboard made for a phone: the logo and account button, "Your practice
  space" and the date, a search for tools and tunes, then cards: Pick up where you left off, **Tune
  of the day** (new on mobile; the website's rule, so both show the same tune), Favorites / Get
  started (with an "All tools" link), Your library, the ear training path. The long list of every
  tool moved to Tools.
- Main screens fade in (`animation: 'fade'`) rather than slide, like switching tabs.

**Fixed along the way**
- **Android Back closed the app from every screen.** `app.json` had `predictiveBackGestureEnabled:
  true` since the project was created (Expo's template), which sets
  `android:enableOnBackInvokedCallback`; on Android 14+ Back then went straight to the system and
  finished the activity instead of popping the stack. Turned off; checked on the emulator (Back from
  a tool returns to Home, from Tools returns to Home) by first flipping it in the generated manifest
  only, then in `app.json`. Jack's phone gets the fix with its next build.
- A borderless `android_ripple` replaces a `Pressable`'s background on Android, so a round accent
  button lost its colour; `IconButton` uses a clipped, non-borderless ripple.

**Left for later stages** (not done in stage 1): the Library's Tunes page still has its own
Setlists section and the big count cards the website dropped; the inside of tool screens (options
sheet, chips), Community, the account sections and the sign-in form keep their old styling apart
from the font, corners and caps fixes; Google sign-in in the app.

**Testing setup** (see `docs/guides/testing.md`): an emulator (AVD `sheddex`) Jack watches as a
window, plus Expo web on port 8081 that he can open in a browser. Jack's NixOS config got zram swap
and `DefaultOOMPolicy=continue` the same day (the kernel had been killing whole tmux sessions when
`next dev` grew to ~9 GB).

**Verified (stage 1):** `tsc` in mobile, web and desktop (core still has its older `lessonFiles.ts`
`.at()` errors), eslint on mobile and the two web files, and the desktop Nix package's pnpm hash
(forced re-fetch with `nix build --rebuild .#soniroll-desktop.pnpmDeps`: unchanged, so the flake
needed no update even though `pnpm-lock.yaml` changed). Expo web at 390 wide (Home, Tools, the four
Library parts, Community, Account, Metronome) in Light, Dark and Gruvbox Dark; no console errors or
horizontal overflow except the Metronome's, which predates this. A debug build on the emulator
(signed out): the launch animation frame by frame from a screen recording, Home, Tools, opening a
tool full-screen, the Library tabs, Account, Community, Back. **Not verified:** anything signed in
(the avatar on the account button, Favorites from the account, recents with real tunes), a release
build, iOS, Jack's phone, the themed (monochrome) icon on a real launcher, audio.
