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

## Stage 2 — every tool laid out like the website's (2026-11-19)

Jack: "start updating all the tools like metronome to be the same as desktop and web."

- **The kit** (`components/tool/`): `SettingChip` / `SettingsBar` / `ToolSheet` (options as chips
  under the main display, each opening a bottom sheet; split chips for on/off settings), `reward.tsx`
  (`GradientFill`, `Segmented`, `RewardCard`, `OptionGroup`, `usePop`), `Slider` (gesture handler;
  the sheet has its own `GestureHandlerRootView` because a `Modal` is outside the app's), `meter.tsx`
  (`BigButton`, `TempoHero`, `TimeSignatureControl`, `MeterQuickPicks`, `SubdivisionPicker`,
  `SoundPicker`), plus `rhythm.tsx` and `ear.tsx` (the two agents' shared pieces: `ChipRow`,
  `ChoiceCards`, `PoolPills`, `PillButton`; `ToolScreen`, `QuizRing`, History/Struggles chips,
  `useGradeColors`). `BeatIndicator` is the website's three-segment bars.
- **Gradients:** `react-native-svg` gradients sized by `100%` inside a flexible view drew as thin
  strips; `GradientFill` uses React Native's own `experimental_backgroundImage` linear gradient
  (with the accent as the background colour underneath) and works on Android.
- **Done by:** the lead (kit + Metronome), then two agents in parallel (rhythm/practice tools and
  pitch/ear tools, separate files), then a review of every tool on the emulator. Details per tool are
  in commit 2613acb's message.
- `COMMON_METERS` and `SUB_LABELS` moved to `packages/core/meterControls.ts`.
- **Left over:** `Hint.tsx` still shows option descriptions as always-visible text (against the
  style guide); the ear-tool screens use `Field` with an ⓘ instead, and Slow Downer / Interval
  Trainer still use `Hint`. `NumberStepper` draws its buttons in `surface`, invisible in a sheet.
  The Sticking Warmup's chips sit in one sideways-scrolling row (cut off at the edge) so the
  notation keeps its room.

## New tools on the phone

Jack then asked for the tools the app didn't have yet, after the restyle. Order planned by size:
Syncopation, Find the Root, Time Test, Rhythm Section, Score Writer, the Shed Log, Shed Notes,
Lessons.

### Syncopation (2026-11-19)

- `app/tool/syncopation.tsx`: the website's tool, same settings key and defaults. Play and a
  sideways row of chips (Tempo, Rhythms, Underneath, Playback, Mix) stay at the top; the 16-bar
  exercise scrolls under them in a card with New. While it plays, the **bar** being heard is lit
  (the website lights each note).
- **The drum kit on the phone** (`lib/drumSounds.ts`, for Rhythm Section later too): the website's
  player ported — velocity layers, round robins, trims, onset trimming, room reverb (a convolver,
  `lib/roomImpulse.ts`), hi-hat choke. No compressor (the phone's audio engine has none). The
  samples are **bundled** from the website's own folder (`lib/drumSamples.ts` requires
  `apps/web/public/samples/drums/sticks/*.mp3`; Expo's Metro watches the whole monorepo), so they
  play offline; `decodeAudioData` takes the required module directly (no `expo-asset`).
- `lib/syncopationEngine.ts`: the website's engine with a plain interval; `lib/notation/
  syncopationNotation.ts`: the website's score drawn with VexFlow through `vexflowNative.ts`, a row
  at a time (rests painted `muted`), rendered by `components/SyncopationScore.tsx`.
- Checked on the emulator: the score renders (2 bars a row at phone width), Play loads the drums
  and the lit bar follows. Not heard (the emulator runs without audio), not on a phone.

### Rhythm Section (2026-11-19)

- `app/tool/rhythm-section.tsx`: the website's Band tab, same two settings keys and defaults
  (`jam-practice-bass-genius`, `jam-practice-drum-generator`), so settings follow you. Play and a
  sideways row of chips stay at the top: Tempo, Tune (no chart / a chart from the library with Key
  / typed chords with presets, key and 3/4; How long; Count-in), Style (the style, its description,
  the 35 styles as pills by country, then the groove: Swing, or timekeeping, cross-stick, woodblock,
  clave direction, fills, variation, human feel; New groove), Drums (off / time / comping; the
  hi-hat click when off; Drum settings; a fader per kit part), Bass and Chords (split chips: a
  switch plus the sheet), Mix. Under them scroll the bass line card (Hide chart, New line, the
  phrase chips of a modelled player opening how each phrase was made), the chart with the playing
  bar tinted (`components/rhythmSection/RhythmChart.tsx`, built from `ChordChartView`'s rows) and
  the drums card. The Bass players tab (making and editing players) is left to the website for
  now; `lib/useBassPlayers.ts` reads the built-in Ray Brown and, signed in, your own players with
  the website's queries (signed out the website keeps players in that browser, so the phone has
  only the built-ins).
- **Notation:** `lib/notation/scoreNotation.ts` + `components/notation/Score.tsx` port the
  website's read-only `notation/Score.tsx` (clef, key, accidentals, beams, triplets, ties across
  rows, dots, ghost notes, grey padding rests; chord symbols drawn as text in PetalumaScript;
  `cursor`, `playing`, `range`, taps) for Score Writer to reuse; two bars a row on a phone, laid
  out a little wider and scaled down. `lib/notation/drumNotation.ts` +
  `components/rhythmSection/DrumScore.tsx` port `DrumScore` with its key. The playing bass note
  and drum are lit like the website's: `vexflowNative.ts`'s `tagGroups` marks a note's group and
  `flattenTree` carries the tag, and the lit note is drawn again in the accent on a layer above
  (the score itself isn't redrawn).
- **Fixed in `vexflowNative.ts`:** the glyph data had no accidentals (U+E260–E26F added to
  `scripts/extract-notation-glyphs.py`, `glyphData.ts` regenerated), and VexFlow's
  `Font.fromCSSString` needs a DOM (it crashed on the ghost-note brackets); it's replaced with the
  file's own parser.
- The drum layout runs on the JS thread while the band plays (a new window every 8 bars), so it's
  laid out once from each bar's measured needs rather than by trial (about 40 ms per 8 bars in
  V8's interpreter, the slowest style; a check after drawing catches the odd overflow). Checked by
  script: every style × 6 seeds at 334 and 700 wide, every hit tagged, everything drawn for a
  note inside its bar but 96 of 122,000 glyphs, which reach up to 4 px past the bar line.
- `packages/core/drumKit.ts`: the kit parts, fader gain/dB, `styleVoices`, the key's legend
  (moved from the website's `rhythmsection/kit.tsx` and `DrumScore.tsx`, which now import it).
- Not checked: anything on a device or the emulator, audio, signed in (your own bass players).

### The Shed Log (2026-11-19)

- **Screens** (`app/tool/shed-log.tsx`, `shed-log-routines.tsx`, `shed-log-routine.tsx` (`?id=`),
  `shed-log-routine-edit.tsx` (`?id=` / `?date=`); pieces in `components/shedLog/`): the website's
  phone layout — the title line (today against the goal, the streak), labelled buttons (Stats,
  Routines, Settings: daily goal / sounds, New: a task or a routine), then **Today | Calendar**
  underline tabs. The day: arrows, Progress (bar + the day timer card), Routines (`RoutineCard`:
  checklist with times, subtasks, Start / Continue on the Practice Timer, time one task, a task just
  for that day, ⋮ open / edit / set a time / check all / skip / remove; Log time on past days),
  Extra tasks, **Time in tools** (today's unlogged tool time with a Log button each — the phone's
  stand-in for the website's per-tool Log button), Timed practice, Log time (quick amounts, Undo,
  Other…), and the day's notes and attachments read-only. The calendar: Month (heat tint, status
  badge, dots, gold star on goal days) or Week (the website's phone list); a day opens it. Dialogs
  are bottom sheets (`sheets.tsx`: goal, log time, task, a routine's time; `inputs.tsx`: minutes,
  time and date inputs instead of the browser's fields). Signed out: `ShedLogGate` → Sign in opens
  `/profile`. Home has a "Today's practice" card (signed in).
- **Data**: the same synced key (`jam-practice-practice-log`) and `packages/core/practiceLog.ts`.
  `lib/liveSynced.ts` is a synced document that **keeps following the account** (the generic
  `useSyncedSettings` takes the account's copy once per session — a phone left open for days would
  have written a stale log back over the website's). Local edits win while pending; a copy is kept
  on the phone for offline starts, and edits made on it before the account's copy arrives are
  replayed onto that copy (so a stale phone copy never overwrites the website). Checked with a
  Node script against the real module (stubbed AsyncStorage/Convex).
- **Timing**: `lib/practiceTimerEngine.ts` now records each step like the website's
  (`recordStep` → `lib/practiceLogQueue.ts`, `jam-practice-log-pending`): routine steps check
  their tasks off, plain Practice Timer runs become day sessions. `lib/dayStopwatch.ts` is the day
  timer (AsyncStorage, flushed every 30 s and when the app goes to the background).
  `ShedLogGlobal` (mounted in `_layout.tsx`) drains the queue signed in, syncs teachers' routines,
  restarts the day timer when a linked run resumes, celebrates (`lib/shedLogCelebrations.ts`:
  toasts, a synthesized pluck ladder and fanfare, confetti left out under reduced motion and when
  the website's "Confetti and sparkles" is off; once a day per device) and runs the tool-time
  tracker.
- **Tool time**: `lib/toolTime.ts` `useToolActivity(href, running)` (one line in each tool screen
  that runs, the same conditions as the website; not the Practice Timer, which logs itself) →
  the tool's usage log (`lib/toolUsage.ts`, `jam-practice-tool-usage`, also a live document; pure
  helpers moved to `packages/core/toolUsage.ts`) and the anonymous usage counts (`usage.track`:
  play/time only; the server skips admins; privacy page says so). As on the website nothing goes
  into the Shed Log until it's logged. `formatPracticed` moved to `packages/core/practiceMinutes.ts`.
- **Left out**: the time-grid week view and dragging to another day, recordings/clips, Shed Notes and
  adding attachments, progress cards and the day report, the tour, the per-tool stats pills.
- **Day view** (added the same day; `components/shedLog/DayView.tsx`): the calendar's switch is
  Month · Week · Day (the website's `jam-practice-practice-log-view` key, so `day` chosen on either
  shows on both). Title "Nov 19", subtitle "40 min · goal 1 hr" / "· goal met"; the arrows step a
  day (no sideways swipe — Month and Week don't have one on the phone either). The website's time
  grid at 64 dp an hour inside its own ScrollView (55% of the window tall, `nestedScrollEnabled`),
  opening at now − 1 h today, else the first timed item or 8 AM; a now line today; an Any time row
  (one pill per untimed routine and per untimed task, like the website's day view, so each can be
  dragged). Tapping opens a `ToolSheet` with the Today tab's own `RoutineCard` (tick, Start, ⋮ Set a
  time → `RoutineTimeSheet`) or `DayTasks`; hidden while another screen is pushed on top
  (`useIsFocused`). Press and hold (350 ms, `Gesture.Pan().activateAfterLongPress`, `runOnJS`) to
  drag to a time (15-min snap, dashed preview with the time) or onto Any time; it writes what the
  website writes for a same-day drop (routine: the day's `Occurrence.startTime`, removed when it's
  the routine's own time; task: `moveDayTask` with the new `time`) and skips the write when the
  time didn't change. Not draggable: skipped routines, routines whose tasks have clock times. Both
  ScrollViews stop scrolling while dragging (`onDragChange`); held near the grid's top/bottom edge
  it scrolls. Positions come from `onLayout`/`onScroll` plus the pan's `translationY` (no window
  coordinates). The grid's pure parts (`dayInfo`, `layoutLanes`, `blocksFor`, `routineDrag`,
  `taskDrag`, `hasFixedTimes`, `TASK_COLOR`, `SNAP`) moved from the website's `Calendar.tsx` to
  `packages/core/practiceLogDay.ts`; the website imports them from there.

### Find the Root, Time Test, Score Writer, Shed Notes, Lessons (2026-11-19)

Each was ported by an agent working on its own files, then checked by the lead on the emulator and
committed by path (each commit message has the details).
- **Find the Root** (`app/tool/find-the-root.tsx`, `components/findTheRoot/`): Sing or play / Pick,
  the 12-key picker, half credit, results, History/Struggles. `rootlessVoicings.ts` moved to core.
  First mobile screen to play the piano with the mic open — check on a phone.
- **Time Test** (`app/tool/time-test.tsx`, `components/timeTest/`, `lib/timeTest*.ts`): the mic's
  chunks don't share a clock with the audio context, so each is dated on arrival and the steadiest
  offset over a few seconds is used; calibration measures the rest (about ±1.5 ms in simulation).
  The detector and analysis moved to `packages/core/timeTest*.ts`. Accuracy needs a real phone.
- **Score Writer** (`app/tool/score-writer.tsx`) and **the phone's one notation editor**
  (`components/notation/ScoreEditor.tsx`, on Rhythm Section's read-only `Score`): a palette at the
  bottom, press-and-release Write mode, long-press bar menu; scores shared with the website
  (`api.scores`), on the phone signed out. Rhythm Section got its Band / Bass players tabs with it.
- **Shed Notes** (`app/tool/shed-notes*.tsx`, `components/shedNotes/`): a native markdown reader
  and a TextInput editor with a formatting bar above the keyboard; score blocks with the editor;
  ABC blocks show their source (no web view). Attached notes on Shed Log routines/days and tunes.
- **Lessons** (`app/tool/lessons*.tsx`, `components/lessons/`): teacher and student sides on the
  website's Convex functions. Invite links on soniroll.com don't open the app (no app links);
  Join takes a pasted link or code.

**Keyboard on Android:** the app draws edge to edge, so nothing lifts content for the keyboard,
and the keyboard's reported height leaves out the gesture bar under it. Bottom sheets
(`ToolSheet`) now sit on `useKeyboardHeight()`; screens with a fixed bar above the keyboard pad by
`keyboard + insets.bottom`. (Found because Add a student and the notes' formatting bar were
hidden.)

## Signed-in check (2026-11-19)

Jack asked for everything to be checked signed in with throwaway accounts. Two dev accounts
(`testAccounts:create`, `.test` addresses, the password derived on the fly into an environment
variable, never written down), signed in on the emulator by typing into the Account screen:
- Shed Log: log time, add a task (both reached the account's `jam-practice-practice-log` row),
  the Metronome's minutes in Time in tools and logging them (a Timed practice entry, the day total
  rose), the calendar, Home's Today's practice card.
- Favorites (starring the Metronome put it on Home), a new score saved to `api.scores`, a new
  Shed Note with a checklist and a [[link]], Library / Community / Recorder / Recordings loading.
- Lessons with both accounts: the teacher added a student, made a lesson and an assignment; the
  student joined with the invite code, saw the lesson and ticked the assignment off.
- **Deleting them found a real bug:** `account.performDelete` never removed `syncedSettings`
  (the Shed Log, tunes, favorites, every setting) — fixed (commit 45b2fdc), pushed to dev only.
  The app's own Delete account flow emails a code, which `.test` addresses can't receive, so the
  accounts were deleted with `npx convex run account:performDelete` on dev; nothing of theirs
  remains. Older test accounts from earlier sessions (reviewer, auditor, demo @soniroll.test) were
  left alone.
- Not checked signed in: hand-ins and review, booking, routines between teacher and student,
  sharing notes/routines, cross-device edits with the website open, the Recorder actually
  recording, Bass players, the Practice Timer's steps reaching the Shed Log.

### Files and the media viewer (2026-11-19)

Jack: "the file browser feature should work, and there should be a media viewer so i can view
pdfs, images, etc". Library → Files (`app/files/index.tsx`, `components/files/`) on the website's
`files.*` functions; files kept on the phone in the app's storage (`lib/deviceFiles.ts`, the row in
the account with a device key/label, like the website's browser storage); the Recorder saves on
the phone on the free plan. `components/files/FileViewer.tsx` shows PDFs
(`react-native-pdf-renderer`), images, audio, video (`expo-video`) and text, used by Files,
Lessons and Shed Notes. New native packages: react-native-pdf-renderer, expo-video,
expo-sharing — the app had to be rebuilt.

Two sheet bugs found while checking: a `ToolSheet` whose content grew after opening (the share
sheet's spinner → button) kept its first height and cut the rest off — its scroll area is now
sized to its content as it changes (`onContentSizeChange`); and `useKeyboardHeight` now ignores a
"shown" event with no keyboard actually showing. (Several wrong theories were tried first — the
slide-in animation, the menu hand-off, `gap` in the content container; measuring with a debug line
and a UI dump is what found it.)

Checked on the emulator with a throwaway free-plan account: uploading a PDF, an image, an audio
file and a video; each in the viewer; a share link (the file went online, the share sheet opened);
delete (row and phone copy gone). The account was deleted afterwards.

### Beat ring no longer moves the beats (2026-11-20, FB-33)

Jack: "In mobile app metronome beats move things vertically when active with the outline". The
playing beat in `components/BeatIndicator.tsx` had a 2 dp border (1 dp otherwise), so the lit bar
grew 2 dp taller; rows are bottom-aligned, so its number rose above the others and the row grew.
Jack chose to keep the outline: every bar now always has a 1 dp border, and the playing beat's
2 dp accent ring is an absolutely placed overlay (`pointerEvents="none"`, inset −1 so it sits on
the border) that doesn't take part in layout. The 1.05 scale stays (a transform, no layout). One
component, so the fix covers every user: Metronome, Tempo Trainer, Jam Practice, Random Metric
Modulation, Random Sticking Warmup, Time Test, Recorder's count-in, the StructureEditor.
Checked: `tsc`, `eslint`. Not checked on a device or the emulator.

### Progress cards and sharing on the phone (2026-11-20, FB-32)

Jack: "Mobile app doesn't have a way to share stats and share the progress cards, id want to post
them on social media as that's their main purpose (also the community ofc)". Progress cards and the
day report were on the Shed Log's "left out" list; now they're in.

- `components/shedLog/ProgressCard.tsx`: the website's canvas card (`ProgressCard.tsx`) redrawn in
  **react-native-svg** — the same 1080×1350 layout, numbers and wording (Streak / Hours / Days for a
  week, month or year; the day report). SVG text can't be measured before it's drawn, so the
  canvas's cut-to-fit and shrink-to-fit use Geist ExtraBold's real advance widths (read from the
  font file into a table). Text uses the loaded `Geist_700Bold` / `Geist_800ExtraBold` families.
- The image: `Svg.toDataURL(cb, { width: 1080, height: 1350 })` (react-native-svg draws the view
  into a bitmap at that size) → a PNG in the cache (`expo-file-system`) → `expo-sharing`'s share
  sheet. **No new native package** — react-native-svg, expo-file-system and expo-sharing were
  already in the app. react-native-view-shot was not needed.
- `components/shedLog/ProgressShareSheet.tsx` ("Share your progress", the website's
  `ProgressShareDialog`): card pills, range pills or a day stepper for the report, the preview,
  Share image, and Post to Community with a caption — `communityTunes.create` with
  `kind: "milestone"` and the card as payload, exactly what the website posts (no backend change);
  needs a public profile, as on the website. Mounted once in `ShedLogGlobal`, opened from anywhere
  with `openProgressShare` (`lib/progressShare.ts`, a tiny store standing in for the website's
  `SHARE_PROGRESS_EVENT`).
- Ways in: a Share button in the Shed Log's header; share buttons on the Stats sheet's Streak and
  In total cards and on "Your practice" (Days); "Day report" under the day's date (today and past
  days); a **Share** button on the goal / everything-done / streak-milestone / hours-milestone
  toasts (those stay 8 s instead of 4.2 s, as on the website).
- A milestone post now shows its card on the phone's post page (`app/post/[id].tsx`); before, it
  showed as an empty tune list.
- Checked: `tsc`, `eslint`; the four card kinds rendered through the real component (react-native-svg
  stubbed to plain SVG, rasterised with rsvg-convert and Geist) against seeded data — layout and
  text match the website's cards. **Not checked:** anything on a phone or the emulator —
  `toDataURL`'s PNG, the fonts inside it, the share sheet, posting signed in, the toasts' button.
