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

### UI pass 1 fixes (2026-11-20)

A reviewer went over the app on the emulator and graded it 6.5/10; this fixes their list.

- **Community feed:** routine and milestone posts said "0 tunes". `PostListItem` now does what
  the website's card does: a Routine / Milestone pill, a routine's tasks as the numbered preview and
  "3 tasks · 50 min" as its footer; a milestone shows no tune count (its card is on the post page).
- **No more Android teal:** the app theme has no accent, so switches and text cursors were teal on
  every theme. `components/ThemedTextInput.tsx` is `TextInput` with the accent for the cursor,
  selection and handles; every screen imports `TextInput` from there now (it's also the ref type).
  New text fields should too. `SwitchRow` (and Lessons settings' switch) colour the knob: accent on
  a lighter accent track when on, muted on a faint track when off. A background-coloured knob like
  the website's was tried first and disappeared on dark themes (Android's knob is bigger than its
  track).
- **One sheet look:** `components/BottomSheet.tsx` is the `ToolSheet` frame (inset card, 24 corners,
  dimmed page, `SheetSlide`, now exported from `SettingChip.tsx`). `ActionSheet` (every ⋮ menu),
  `SetlistTuneSheet`, `ChordChartSongMenu` and `ChordChartNewSheet` use it; they had no backdrop
  and a grab handle. `TuneListManager`'s editor still uses the old `sheetEdge` look.
- **Choice tiles** (`RewardCard`): a faint fill, no outline, `rounded-lg`; picked is an accent tint
  with a 1.5 dp accent ring (the ring's width is always there, transparent when off, so nothing
  shifts). Jam Practice's five count-off cards fit one row (`cardWidth="14%"`; the gaps are fixed
  dp, so 18% wrapped).
- **Stats sheet:** the four stat cards were surface on a surface sheet; now background, like the
  cards below them.
- **Tool intros:** `INTRO_OMIT` in `components/tool/introNotes.ts` drops the website's Help steps and
  options the phone doesn't have — the Tuner's Record step and Takes, Slow Downer's saved Loops,
  Shed Notes' command palette, PDF export, zip export/import, vim mappings and word suggestions.
- **Tune page:** 16 dp padding like other screens, the key grid fills its row (`flexBasis` +
  `flexGrow`), keys show ♭/♯, the title is in the text colour, and ⋮ is a round `IconButton` like the
  pencil.
- **Learn path:** each connector sits under its node (not the row's middle), moved halfway towards
  the previous node and tilted at it, so the winding trail joins up.
- **Smaller:** Jam Practice's Click chip value is "8-bar count-off" with "keeps going" in its label
  (sheet title stays "Click"); the ear trainers' chip is "Sound" (sheet "Sound & display"); the
  Shed Log's today section is "Time practiced" (it said Today three times); Home's date comes from
  `useToday()` so it moves on at midnight; Slow Downer's volume sheet is "Playback"; the Tuner says
  "Listening…" instead of "–"; Jam Practice's empty text reads properly; `EmptyState` always
  stacks its two buttons.

Checked: `tsc`, `eslint`; on the emulator (debug build, signed in as the throwaway
`mobile-audit@soniroll.test`), light and dark: Home search cursor, Community feed, Shed Log today,
Stats sheet, ⋮ menu, the charts' Create new sheet, Metronome's Subdivision / Sound / Time sheets, Jam Practice and its Click
sheet (switches on and off), Guess the Interval chips and Learn path, the Tuner listening and its
help, Slow Downer's volume sheet, Library empty states, and add tune → tune page → ⋮ → delete (the
test tune was deleted; the theme was put back to "Same as my phone"). Not checked: the setlist tune sheet
and a chart's ⋮ menu on `BottomSheet`, the Lessons settings switch, Home across a
real midnight, iOS, a release build or a real phone.

### UI pass 2 fixes: the Library catches up with the website (2026-11-20)

A reviewer graded the phone's Library, files and chart reading 6/10; the main finding was that the
phone's tune model had fallen behind the website's (`docs/notes/library-two-tabs.md`). Fixed:

- **Three tune lists.** `lib/useTuneList.ts` now re-exports `TuneListId` / `TUNE_LIST_IDS` /
  `TUNE_LIST_LABEL` from `@jam-practice/core/tuneLibrary` and adds the Library list
  (`useLibraryTunes` in `useSyncedTunes.ts`, key `jam-practice-library-tunes`). Signed in, its
  `ready` waits for the account's copy (`waitForAccount`), since the phone has usually never cached
  it. Helpers: `findTune`, `allTunes`, `moveTune`, `chartsOnlyOn`, `useForgetChart`,
  `useChartLinker`. Library tunes show on the Tunes tab (a third section, only when there are
  some), its See all, search, Home search, setlist Add tunes / reader, "Link to a tune" /
  "Attach to a tune", Community's new post. The tune ⋮ moves a tune to either other list.
- **Every chart belongs to a tune**, as on the website. The tune ⋮ (`useTuneMenu`) has Open / Edit
  chord chart, Make this the main chart, Link another chart, Write another chart and **Delete this
  chart** (deleted for good unless another tune has it); "Unlink" and "Change linked chart" are
  gone. Deleting a tune deletes its charts no other tune has, and the confirm says so
  (`useTuneDeletes`, also used by the edit page). A chart deleted from its own ⋮ is taken off its
  tunes. The edit page no longer unlinks or creates charts (it can still link one).
- **New charts are linked.** "Create one" / "Write another chart" pass `tune=<list>:<id>`, the
  tune's key and time signature through `chord-charts-new` to the editor, which adds the saved chart
  to that tune (`addChartsToTune`) and goes back to it. A chart made anywhere else (Charts tab,
  import, a lesson's "Save to my charts") goes through `useChartLinker` (`linkChartsToTunes`: the
  tune with its name, else a new Library tune; imports are tagged with the playlist's name). The
  linker reads the three lists at call time (`hook.read()`) and does nothing until all three are
  the account's own copy — the phone's synced lists take the server's value only once per session,
  so a write built from a stale phone copy would overwrite the account's.
- **No automatic linking pass on the phone** (the website's `useAutoLinkCharts`): for the reason
  just above, a phone left open while the website imports charts would see them as orphans and make
  duplicate Library tunes. Older orphan charts still get linked the next time the website's Library
  opens. That's also why the **Charts tab stays**: it's still the only place for chart playlists and
  import, and the one way to reach a chart that isn't on a tune yet. Its "Playlists · 0" heading
  over an "All charts" row is gone when there are no playlists.
- **Tune page:** a "Chart 1 of 2" picker when a tune has several charts (main first; charts deleted
  since are left out), the ⋮ acting on the chart shown; a **Files** card (uploads with this tune,
  opened in the viewer, ⋮ menu, "Add a file" uploads onto the tune — `components/library/TuneFiles.tsx`);
  ♭/♯ in the key tiles from PetalumaScript (Geist has none); keys shown as "Cm", not "C-".
- **Recordings tab folded into Files:** four tabs (Tunes · Setlists · Charts · Files). `/recordings`
  redirects to `/files?filter=source:recording`; Files reads `?filter=`, keeps that filter in its
  menu even at 0, and says "No recordings yet" with Record. The Recorder's "All takes" opens it. The
  tab labels reserve their bold width, so switching no longer nudges the row.
- **Rows:** tune rows are a grouped card (the setlist page's look), with a chart count when there
  are several and up to two tags. Recent / A–Z on the Tunes tab and See all (`tuneOrder.ts`,
  remembered on the phone). A file's tune is on its own line in Files.
- **Status bars:** `components/FullScreenModal.tsx` — a Modal is its own window on Android, so the
  root `<StatusBar>` never reached it and the clock was white on light themes. It sets the bar style
  inside the modal and again `onShow` (RN 0.86's StatusBar module applies styles to modal windows
  too). Used by the standards picker, tune / chart pickers, Link / Attach to a tune, recording
  picker, file viewer, linked chart, rhythm patterns and score dialog.
- **Charts:** the time signature was pushed back over the opening barline (the chords' row was 100%
  wide beside it); the chords now take the remaining width, as in the builder. Chords with ♭ or °
  sat higher than their neighbours (Petaluma's glyphs have tall metrics): fixed line heights on the
  root and quality. The transpose menu offers the chart's quality ("D♭m" for a minor chart), with
  ♭/♯. The chart ⋮ sheet never shows an empty subtitle line.
- **Smaller:** foreground titles and round ⋮ / trash buttons on the chart view, setlist, setlist
  reader, tune notes and recording page (`IconButton` takes a `color`); Files → "Attach to a tune"
  is titled that, and says "Attached … to Autumn Leaves." afterwards; **Open in Slow Downer** for
  audio and video files (copies the file into the Slow Downer's own list, `saveLocalFile`, and opens
  `/tool/slow-downer?open=<id>`); recording names use 12-hour time ("Nov 21, 12:38 AM") and detail
  lines are "0:24 · Nov 21"; curly quotes in delete dialogs; the setlist reader's dots are visible
  and a page without a chart has "Open the tune".
- **Bug found on the way:** the Slow Downer couldn't open any file shorter than a few seconds —
  building the waveform copied past the end of the audio (`copyFromChannel` with a full window at
  the end; react-native-audio-api reads the whole underlying array even for a `subarray`). Fixed
  with a right-sized array for the last window.
- Skipped: naming iReal Pro in the Charts empty state is fine (only the Syncopation source and the
  sticking book are never named).

Checked: `tsc` and `eslint` in apps/mobile (packages/core unchanged). On the emulator (debug build,
signed in as the throwaway `mobile-audit@soniroll.test`, data seeded with
`npx convex run --identity '{"subject":"<userId>|x"}' …`): Tunes tab with all three lists, tags
and chart counts; a Library tune with two charts (picker, menu, Write another chart → saved and
linked as chart 3, Delete this chart → gone from the tune and the account); Autumn Leaves → Create
one (key Gm filled in) → saved and shown on the tune; moving a tune to Tunes I Know; a chart made
from the Charts tab became a new Library tune; Add a file on a tune; Files: attach to a Library
tune with the notice, the tune line, Open in Slow Downer (waveform loads); old Recordings link →
Files on Recordings; the transpose menu; status bars in pickers, light and dark. All test data
removed afterwards (charts, files, lists, the files pushed to the emulator). **Not checked:** the
setlist reader's dots and "Open the tune" button, import of a real chart link, signed out, a
Recorder take's new name, audio by ear, a release build, a real phone.

### UI pass 3 fixes: tools and the Shed Log (2026-11-20)

A reviewer went over every tool and the Shed Log on the emulator (6.5/10). Fixed (commits 718ca85,
66d4ae9, 7db99f6, b107092):

- **The Practice Timer no longer floats over tools.** The pill sat at the tab bar's height, which on
  a tool screen (no tab bar) is exactly where the setting chips are, so they couldn't be tapped. It
  now works like now-playing: on the main screens a strip docked on top of the tab bar
  (`PracticeTimerStrip`, counted in `useTabBarHeight`, so scrolling pages leave room), elsewhere a
  small clock pill in the header (`PracticeTimerHeaderButton`), and nothing on the timer's own screen.
- **Ear trainers stop when you leave their screen** (`lib/useStopOnBlur.ts`, `useFocusEffect`): one
  left mid-round kept timing out questions and filing them as misses in Struggles. The Metronome
  family and the Slow Downer still keep playing on purpose.
- **Chip strip:** the "N more" cell has a set width (84 dp) so the real values get the row, and long
  values/labels were shortened where they're made (a chip `title` keeps the full name for its sheet).
  `adjustsFontSizeToFit` was tried and dropped: Android ignores `minimumFontScale`, so values shrank to
  unreadable sizes.
- **Learn path:** the trainers pass `scroll={false}` (new on `ToolScreen`) in Learn mode, so the
  level card sits under the chips and the trail fills the rest and scrolls inside itself with fades.
  A `flex: 1` ScrollView inside ToolFrame's own ScrollView isn't bounded — the outer one scrolled.
- Smaller: Metronome / Tempo Trainer stop when switched to an empty Changing meters form; the
  Metronome's help drops the website-only stats and Log options; History / Struggles clears ask
  first; Guess the Chord shows ♯/♭ and "Time's up"; Rhythm Section's chart drops an opening 4/4;
  routine editor (four "When" segments fit, colours in one row), calendar arrows flank the title,
  share sheet opens on Hours at a 0-day streak.
- Skipped: Metric Modulation's title on one line (`HeaderTitle` wraps long names on purpose rather
  than shrinking them); the Sticking Warmup's serif L/R (drawn from VexFlow's Academico outlines, as
  on the website — Geist would need its own glyph data); the day report's "1m" (matches the website's
  card).

Checked on the emulator (debug build, signed in as `mobile-audit@soniroll.test`); test data removed
(the timer's 1 min via "Clear this day's time", Guess the Chord's struggles). Not checked: the Slow
Downer loop line, the timer strip together with now-playing, audio by ear, a real phone.

## UI/UX pass 4 fixes — accounts, people, About (2026-11-20)

Fixes from pass 4's mobile review (people, account and first impressions). Commits d9bbbd3,
0c6b13d, 87b8378 and the notes/review commit after them.

- **Another account never sees the last one's data (privacy bug).** A new account signed in on the
  phone showed the previous account's favorites, "Pick up where you left off", tune lists and
  Metronome settings, and an edit would then write them into the new account: `useSyncedSettings`,
  `useSyncedTunes` and the recents kept one AsyncStorage copy for everyone and only ever let the
  account's value override it when it had one. Now `lib/accountScope.ts` gives every store a mode
  (`loading` / `device` / `account`, from the token-level `useConvexAuth`, which is true offline
  too): signed out reads `<key>` (the phone's own, unchanged), signed in reads `<key>:account` (the
  scheme `liveSynced.ts` already used), and **every `:account` key is deleted whenever the app finds
  itself signed out** (also at a signed-out cold start, so a killed app can't leak). On a switch the
  stores drop what they hold (an edit still waiting is sent first) and load the other copy; for the
  render before the switch they show defaults, and `update` is ignored mid-switch. Practice Timer
  sessions are no longer mirrored into the signed-out copy. Data saved before this under the plain
  keys while signed in stays as the phone's signed-out copy (no way to tell it apart). Checked by
  reading `RKStorage` over `run-as`: account A's Metronome 130 / starred Tuner reached its
  `syncedSettings` rows, sign-out left no `:account` keys, account B saw defaults.
- **Routine posts** had a blank page (only milestone and setlist posts had a body):
  `components/community/PublicRoutineView.tsx` draws the routine like the website's
  `RoutinePreview` (schedule, tasks with times, subtasks, notes, tool chips that open the tool) with
  "Add to my Shed Log" (`routineFromPublic`, then the routine's page). Feed milestone cards say their
  numbers.
- **Account → About** (signed in and out): What's new, Help, Send feedback, Privacy, Terms, Credits
  open soniroll.com in the in-app browser (`expo-web-browser`); the app version from
  `expo-constants` under it. Account also lists Following and Liked posts. Sign up shows the
  8-character rule and the Terms/Privacy line; sign out's confirm is the accent (`ConfirmDialog`'s
  new `safe`).
- **Community/profiles:** `UserAvatar` takes a `name` and draws its first letter on the faint fill
  (the old fallback sat on an invisible `surface` circle); profiles show Posts after Instruments as
  feed cards, tune lists five at a time; the post header says "Post"; your own post doesn't offer
  Add/Learn; the counts row always shows; My posts has an empty state with New post; the New post
  gate pushes the profile editor so Back returns to the form.
- **Keys** use `prettyKeyName` in `tuneSummary`, Tune of the day, post chips and setlist rows
  (Library search also matches the raw "Db").
- **Lessons wording:** invite link ellipsizes in the middle (Android never ellipsizes `selectable`
  text), "not practiced yet", no summary line, "Read all notes", note previews joined with " · ",
  the zone once, a chevron instead of "→"; head-button labels and one-word tool tile names use
  `adjustsFontSizeToFit` (only one-line, one-word text, so it shrinks just enough — unlike the chip
  strip, where it shrank values to unreadable sizes).
- Skipped: hiding "Share their invite link" after a student joins (the website keeps "Copy their
  invite link" too); the dev-only LogBox toasts for wrong-password errors (Convex's client logs
  them; not in release builds); custom accent / text size on Theme (deliberately left out).

Checked on the emulator (debug build) with throwaway accounts `uipass4fa`/`uipass4fb` (both
deleted), light and dark, font scale 1.3 for the tiles and Lessons buttons. The reviewer's
`uipass4m` was signed out to test sign-in (its password isn't known, so it can't be signed back in;
the account still exists). Not checked: a real phone, an offline signed-in launch, the student side
of a lesson page, iOS.

## UI/UX pass 5 fixes — whole app (2026-11-20)

Fixes from pass 5's mobile review (the final whole-app sweep). Commits 6117245, e94520e, 8bcce60
and the notes commit after them.

- **Old account data moves to the account, once.** Before d9bbbd3 a phone signed in wrote the
  account's settings, tune lists and recents to the plain keys, which the per-account stores then
  read as the phone's own signed-out data (the reviewer saw old accounts' tunes, recents and a
  247 BPM Metronome signed out). `accountScope.ts` now runs `migrateOldCopies` the first time it
  learns the sign-in state (flag `jam-practice-store-scope-v1`): signed in, each key in a fixed list
  of what those stores had then (`OLD_SHARED_KEYS`) moves to `<key>:account` unless that already
  exists, and the plain copies (plus the old Practice Timer session mirror) go; signed out, nothing
  moves. Copies are written before the plain keys are removed and the flag is set last, so an
  interrupted run finishes next launch; the stores stay in `loading` meanwhile. The list is fixed on
  purpose: a key added later never held anyone else's data.
- **Writes wait for the backend's sign-in.** Reopening the app after Back closed it (the JS stays
  alive, the screens remount) cleared the old screens' sign-in before the new ones' was back: a
  debounced write in that gap failed with "Not signed in" (lost in a release build), and
  `users.current` could answer `null`, which made `SignOutIfAccountGone` **sign you out** (seen
  on the emulator). Now every account write from the stores (`useSyncedSettings`, the tune lists,
  `liveSynced`) goes through `sendToAccount`, which holds the newest value per key until
  `convex/react`'s `useConvexAuth` (the backend's answer, not the token on the phone) says signed in
  (`useAccountWritesGate`, mounted in the root layout), and drops them only on sign-out.
  `loading` no longer counts as a switch: the stores keep what they hold (and an edit still waiting)
  and reset only when the sign-in really changes. Sign out calls `flushAccountWrites()` first.
  `SignOutIfAccountGone` waits for the backend's sign-in too.
- **Keys:** `prettyKeyName` on the rest of the screens (setlist rows and reader, pickers, chart
  editor/view/pager, Charts' Recently opened, Rhythm Section), and `withAccidentals()`
  (`components/Accidentals.tsx`) draws ♭/♯ in PetalumaScript inside any `<Text>` (Geist has none;
  the fallback looked like a subscript "b").
- **Setting chips:** a cell's inner `Pressable` was `flex-1`, whose zero basis made every cell the
  same width — the real cause of "Root posit…", "Progressio…", "Previous t…". Cells now grow from
  their content; the "N more" cell says "Options" (no fixed width). All 21 tools' strips fit.
- **Tabs:** Back from any tab goes to Home, Back on Home leaves (Home `dismissTo('/')`, other tabs
  `dismissTo('/')` then `push`).
- Smaller: one-word tool tile names shrink only at font scale > 1.1 (Android shrank them at 1.0);
  the header account button shows your letter; the tune page's Files/Recordings/Shed Notes empties
  read like Chord chart's; tune ⋮ deletes together at the bottom as "Delete chart"/"Delete tune";
  "Following · 0"; standards picker titles semibold; setlist empty text; sign-in cards stack their
  buttons like `EmptyState`; the Tuner doesn't say "Listening…" twice; a signed-out Lessons screen's
  header says "Lessons".

Checked on the emulator (debug build) with throwaway accounts `uipass5fix`/`uipass5fix2` (both
deleted): signed out at first run the flag was set and nothing moved; with plain keys seeded and
signed in at first run everything moved to `:account` and the Metronome opened at the seeded BPM;
an edit followed by Back-to-exit within 250 ms reached the account after reopening, with no "Not
signed in" and still signed in (before the `SignOutIfAccountGone` change a reopen signed the
account out); sign-out left no `:account` keys. The emulator's own data was restored from a dump
afterwards and it's left signed out. Not checked: sign-out within 600 ms of an edit, an offline
signed-in launch, a release build, a real phone, iOS.

## 2026-11-21 — Releasing an Android alpha (alpha 3)

How the public alphas go out, written down with alpha 3 (the phone UI passes 2–5):

1. Raise `versionCode` in `app.json` (and in `android/app/build.gradle`, prebuild output, if you
   don't re-run prebuild) so phones with the last alpha treat the APK as an update.
   `version` stays 1.0.0; the alpha number lives only in the tag and the file name.
2. `APP_NAME=soniroll ARCHS=arm64-v8a,armeabi-v7a nix develop .#androidBuild --command
   apps/mobile/scripts/build-android-prod.sh --no-install`. That's the prod app id and prod Convex,
   named "soniroll", phones only.
3. `gh release create android-v1.0.0-alpha.N --prerelease` with the APK attached as
   `soniroll-android-1.0.0-alpha.N.apk`, with notes saying what's new since the last alpha and how to install.
   The download page (`lib/androidRelease.ts`) picks up the newest `android-v*` release on its own.

Alpha 3: versionCode 3, built from `preview` after 0.10.15's commits. Not installed on a phone
before release (Jack tests it himself).

## 2026-11-22 — Pitch graph in the Tuner, a step's tool opening, the day timer stopping with its task

Three of the website's 2026-11-22 features, ported to the phone (web notes: `tools-trainers.md`
"Tuner: pitch graph in the dial", `tools-practice-timer.md` "A step's tool opens when the step
starts", `shed-log.md` "The day timer stops with the task that started it").

**Tuner: pitch graph in the dial.**
- `lib/tunerEngine.ts` keeps a 12 s history of heard frames (`getTunerHistory()`: `t` from
  `Date.now()`, unsmoothed cents, after the two-frame check), cleared when listening starts; it's
  not in the snapshot.
- `components/TunerDialGraph.tsx` draws it with react-native-svg (already installed): the last 5 s,
  ±50 cents clamped, the ±8 band shaded, ±25 dashed, "now" at 86% with a dot, one line per run on a
  note (broken by a gap over 0.12 s), coloured by its median. It draws in pixels from `onLayout`
  rather than a stretched `viewBox` (so the dot is a plain `Circle` and strokes don't need
  `vectorEffect`). It polls on `requestAnimationFrame` at most every 33 ms while listening, in its
  own state, and skips redraws while nothing's been heard in the window; after Stop it holds.
- `TunerDial`'s `tight`: the middle stacks from the top with less padding and `overflow: hidden`
  with the round corners, so the graph is clipped to the circle. The tuning colours and
  `centsColor` moved from the screen into `TunerDial.tsx` (exported) so the graph shares them.
- Setting `dialGraph` (off by default, the website's key, so it syncs): a fourth chip, **Pitch
  graph**, a toggle chip whose sheet has "Pitch graph in the dial". With it on, the readout is
  smaller at a fixed height (letter, then "cents · Hz" on one line; "Play a note…" while listening).
- The phone's Tuner has no takes, so the graph is always live.

**A step's tool opens when it starts (Practice Timer and Shed Log).**
- `lib/practiceTimerEngine.ts`: `onStepTool(listener)`; `loadStep` calls the listeners with the
  step's `tool` only when `chime` is true (start, skip, auto-advance, Continue after an alarm),
  never when a run is restored as the app reopens.
- `lib/useOpenStepTools.ts`, mounted in `PracticeTimerAlert` (once, app-wide, as on the website):
  maps the href through `currentToolHref` (retired hrefs), checks it's a known tool, and
  `router.push(toolRoute(href))` (`ToolGrid`'s mapping, so tab tools go to their tabs), unless
  `usePathname()` is already that route. Off when `openTools` is false.
- `lib/practiceTimerSound.ts`: the timer's synced sound settings key and defaults, now with
  `openTools: true` (the website's field). The timer screen imports it; `usePracticeLog.ts` still
  has its own copy of the key (left alone, another agent was working nearby).
- Practice Timer: a **Tools** toggle chip ("Open each step's tool"). The session editor has an
  "Opens" dropdown on each step ("No tool", then the same tools as the website's list: everything
  but Community, Library, Chord Charts, Shed Log and the timer); "No tool" removes the key rather
  than saving it empty; a long name shows its short name on the button.
- `usePracticeLog.ts`'s `startRoutine` / `startDayTasks` give each step the task's first tool
  attachment (`taskTool`; for routines, that day's `taskAttachments` count too, after the task's own).

**The day timer stops with the task that started it.**
- `lib/dayStopwatch.ts`: `startDayTimer(byTask)` sets `byTask` (kept through flushes and the saved
  copy); `dayTimerStartedByTask()`. A running day timer is left as it was.
- `startRoutine` / `startDayTasks` call `startDayTimer(true)`; the day timer card's Start now calls
  `startDayTimer()` through an arrow (it was `onPress={startDayTimer}`, which would have passed the
  press event as `byTask`).
- `ShedLogGlobal` watches the engine like the website's `PracticeLogGlobal`: resuming a linked run
  restarts the day timer (by the task); a linked run that was going and is then paused, stopped,
  finished or replaced by a plain session pauses it if `dayTimerStartedByTask()`.

Verified: `npx tsc --noEmit` in `apps/mobile` (the only errors were in another agent's new
`lib/shedLogPages.ts`, a typed route not generated yet — none in these files); `npx eslint` on every
changed file (clean); `npx expo export --platform android` bundled. A Node script against the real
`stepAt` checked the task-tool mapping (first tool wins, a day's attachment counts, a retired href
is passed through for the hook to map) and a copy of the watcher's logic through start → pause →
resume → stop, a hand-started day timer surviving a task's start and stop, and a plain session
replacing a linked run. **Not verified at all on a device or the emulator** (none was run this
session): how the graph looks and how smooth it is on a phone, the readout's sizes in the dial,
Android clipping the graph to the circle, a tool actually opening when a step starts (including from
the background or with the editor open), the Tools and Pitch graph chips at 390 wide, saving a
session with a tool signed in (the Convex validator has `tool` on dev; prod gets it with the next
production deploy), the day timer pausing with a real run, and anything by ear.

## 2026-11-22 — Routine and task screens, recordings that say where they're from

The website's routine and task pages (`shed-log.md`, every 2026-11-22 section from "Routine and
task pages" to "Redesign of the routine and task pages") on the phone. No side view on a phone:
they're normal stacked screens with the header's back button, so Back returns to the Shed Log
where you were.

**Ways in.** A task's name on a routine card or in the day's tasks opens its screen; only the box
ticks it off (`TaskCheck`'s `onOpen` in `components/shedLog/parts.tsx`: the box is its own padded
target, the name and its line another). A routine's name or icon on its card opens its screen for
that day. A recording's "Bass / Scales" line opens the task. A note's "Attached to" a routine or
task (`LinksSection`'s `targetRoute`) now opens those screens instead of the Shed Log.
Routes are built in `lib/shedLogPages.ts` (`routineRoute`, `taskRoute`).

**Task screen** (`app/tool/shed-log-task.tsx`, new; `?routine=&task=&date=` or `?date=&task=`,
`&from=routine` when opened from the routine's screen). The header has the name and one line of
facts ("10 min · Every Sunday", or the day for a day's task) and Edit (the routine editor; not for
a teacher's routine). The header pattern is the tune and setlist screens' (title over a muted line,
icon buttons on the right) in `PageHeader`, `components/shedLog/pageParts.tsx`; the running
timer's header pill is kept there. Under it a pill with the routine's icon and name (or the day)
opens the routine: Back when it came from there, else the routine's screen for that day. Then the
day panel on one card: a big box with "Done today" / "Not done today yet", the time logged and
planned, a bar of one against the other, one primary **Start · 10 min** (hidden on past days; adds
the routine to the day first if it isn't on it) or the running timer with pause/skip/stop in its
place (`RunningTimer`, pulled out of `RoutineCard`), **Log time** (the Shed Log's own
`LogTimeSheet` on this task), the checklist (per day through `Occurrence.subDone` for a routine
task, on the task for a day's task) and Attached: the task's own attachments, then the day's,
editable (`Occurrence.taskAttachments[taskId]`, or the day task's own). Then Notes, Recordings
(with Record in the section header) and History (routine tasks: days checked off or timed, each
opening that day in the Shed Log). No stats row and no Arrange (Jack dropped the stats on the web;
arranging sections isn't worth it on a phone).

**Routine screen** (`app/tool/shed-log-routine.tsx`, restructured). Header: name and "Every Sunday
· 8:00 AM · 20 min · 2 tasks", Share and Edit. Then the teacher line and description if there are
any; that day's card (`RoutineCard embedded`: no icon or name, no minutes or repeat, no "Open
routine" in its ⋮; its tasks open their screens with `from=routine`), or "It isn't on today" with
"Add it to today"; Notes; Coming up; Recordings on other days (grouped by day, each day opening it
in the Shed Log); History (x/y and time on the right, the old day notes under the date). The old
Tasks list and "Start today" button are gone: the card has them.

**Notes** (`PageNotes` / `NotePreview` in `pageParts.tsx`, `lib/taskNotes.ts`). The main attached
note shows as a preview card: its first written lines (not headings or `![…](file:…)` player
lines; checked with a node script), its title, how many recordings are in it, Open. Others are rows.
With none, "Start notes" makes it and opens it in the Shed Notes note screen to write. A task's note
is attached to its `task` / `dayTask` target, titled "<Routine> · <Task>" ("<Task> · Nov 22" for a
day's task), starts with `TASK_NOTE_START`, and for a routine task `- [[title]]` is appended to the
routine's own note when it has one (`appendLine`; a failure there doesn't stop the note being made).
A routine's new note (`routineNotes`) starts with "## Tasks" and a link to each task note there
already. `useTaskNoteActions` reads the attached notes with `useConvex().query` at the moment it
needs them, so the save screen can use it too.

**Recordings.**
- `components/shedLog/RecordClip.tsx` records in place with the Recorder's engine (no metronome,
  the Recorder's Auto gain setting): Record, then the take's time and Stop; stopping opens the save
  screen with `logDate`, `routineId` and `taskId`. One take at a time (Record is greyed out while
  the Recorder or another task is recording); which clip started the take is a tiny module store,
  so the right screen shows Stop after you've been away.
- `app/recordings/save.tsx` names such a take after what it's for ("Scales · Nov 22, 12:09 PM"),
  shows "For the task Scales · Bass" (or "For the routine"), saves `logDate`/`routineId`/`taskId`,
  puts a task's player into its note (`shedNotes.addRecording`, or a new note with it) and goes back
  to the screen it came from.
- `RecordingRow` shows where a take is from (`components/recordings/RecordingPlace.tsx`: "Bass /
  Scales", "Bass", "Nov 22 / Transcribe"), which opens the task or routine; `hidePlace` on the
  task's own screen, `placeWithin` inside a routine (just the task's name). It also stops repeating
  the day when the name has it. The place shows on the recording's own screen too. Everywhere else
  recordings are listed (the Recorder's recent takes, a tune's page) gets it from the row.
- The Shed Log's routine cards now show that day's clips and Record (`DayPanel` queries
  `listForLogRange` for the day; the website's card does the same). The routine screen passes its
  own. Every list goes through `useDeviceUrls`, so a clip kept on this phone plays.
- `lib/recordings.ts`'s `Recording` type gained `logDate`, `routineId`, `taskId` (Convex already
  returns them).

**Attachments** (`components/shedLog/Attachments.tsx`, new — the phone had no attachment picker):
chips that open the tune, setlist, chart or tool; with `onChange` a × each and an Attach button
opening a sheet with Tunes / Setlists / Charts / Tools tabs, a search and tick rows (charts load only
on their tab). The routine card now also shows each task's attachments (its own and that day's)
and the routine's; the day's tasks show theirs.

**Verified:** `npx tsc --noEmit` in `apps/mobile` (after regenerating typed routes with a short
`CI=1 npx expo start --offline`), `npx eslint` on every changed file, `npx expo export --platform
android` bundles. The note preview text and the date-in-name check with a node script.
**Not verified at all:** nothing was run on a device or the emulator, so none of this has been seen
or tapped — the layouts at 390 wide, light/dark, the box vs name touch targets, the header with a
long title, recording and saving a clip (mic permission, the player line landing in the note),
attaching for a day, the Shed Notes link in the routine's note, the timer block on the task screen,
a clip kept on the phone playing, and Back landing where it should.

### Seen on the emulator (2026-11-22, after both ports above)

Debug build (no native changes, so the existing debug APK with Metro), AVD `sheddex`, signed in with a
throwaway dev account (deleted) whose routine "Bass" (Scales, Arpeggios) was made on the website:
the Tuner with "Pitch graph in the dial" on (the band and lines draw in the dial; no sound on the
emulator, so no trace); the Shed Log card (a task's box ticks it, its name opens the task screen);
the task screen (Bass pill, day panel with Start · 10 min and Log time, Attach for today, Start
notes, Recordings, History); its box → "Done today"; the routine screen (Today card without the
title, Notes, Coming up, History "2/2 · 20 min"); Start notes → "Bass · Scales" opening with
"## Notes". Not seen: recording a clip (the emulator has no mic), a tool opening when a step starts,
the day timer with a real run, dark mode.
