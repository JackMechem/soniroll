<!-- Moved word for word from the old single PROJECT.md (lines 1868–1963) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Page transitions with the logo's drum hit (2026-10-10, web)

Every route change (non-tiling mode): the new page slides in from the right (`AppShell`'s
`AnimatedPage`, 480ms ease-out) and the sidebar logo's sticks swing apart and strike back into the
x with the off-beat dashes popping out (`lib/stickStrike.ts`). (A big version of the sticks striking
in the middle of the content area was tried first and removed on request.) `AnimatedLogo` drives the sidebar one. `Logo.tsx`'s sticks are now
grouped (`data-stick="a"|"b"`, `data-ticks`, pivoting on the crossing) so any logo can be struck;
nothing visual changed at rest. Web Animations in a layout effect (no re-renders, no un-animated
frame); skipped on first load and under `prefers-reduced-motion`. The page wrapper is transformed
only while animating, so a page's `position: fixed` elements are offset for that half-second only.
Checked frame by frame in the browser (Metronome to Tuner); in dev a slow first compile shows
`app/loading.tsx` during the slide instead of the page.

### Metronome options redesigned to explain themselves (2026-10-10, web)

`components/metronome/MetronomeOptions.tsx` (Metronome only for now; Polyrhythm and Structure
sections still use `MeterFields.tsx`'s `MeterOptions`/`SoundOptions`). The "Meter & subdivision"
panel is now **Rhythm**: a "One meter / Changing meters" segmented control (was the "Use a
structure" switch; Changing meters shows the unchanged `StructureEditor`), a `TimeSignatureControl`
drawn as a stacked time signature with arrows beside each number and a readout ("7 eighth notes per
bar"), and `SubdivisionPicker` (picture +
short name tiles). Accents are set only by tapping beats in the main beat strip (an "Accents"
group-splitter was tried here and dropped as redundant; the typed grouping field is gone too). **Sound**: click-sound cards that play a preview (accent then normal click) when
picked, and a volume slider with speaker icons that previews on release. No description text;
`CollapsiblePanel` gained `hints={false}` to hide its "?" button where there's nothing to reveal
(Rhythm shows it only in Changing meters mode). Verified in the browser: 4/4 to 7/8 with arrows, triplets, mode switch, sound pick,
light/dark, 390px wide; no errors. Not heard: the sound previews (no audio here).

**Then (same day) the Metronome's options column was replaced by setting chips.** `options={null}`
(`ToolLayout` now hides its "Options" show-button and column when a tool passes no options), and a
row of chips under the beat strip (`components/metronome/SettingsBar.tsx`: `SettingsBar`,
`SettingChip`) shows each setting's current value. Above the chips, a One meter / Changing meters
switch decides which chips there are: one meter shows **Time** ("4/4") and **Subdivision**
("8ths"); changing meters shows the form itself on the page, in a card under the switch (`StructureEditor
show="form"`: the play-order chips, drag to reorder, × to remove, "+ A / + B" to add), and a
**Sections** chip ("3 sections", or "Add sections") whose popover is just the section list with
"New section" (`show="sections" modern`). With `modern`, each section card uses the same controls
as One meter: a name field, `StepperPill` for bars ("‹ 2 › bars"), `TimeSignatureControl`,
`SubdivisionPicker`, the section's beat strip for accents, and Remove; the collapsed card reads
"2 bars of 11/8" next to a badge with the section's name. `StructureEditor` defaults to `show="all"`, so Tempo Trainer and
Recorder are unchanged. **Sound**
("Classic click · 80%") is always there. The chips sit below Start. A chip opens a popover (a bottom sheet with
a dim backdrop on phones; Escape, the ×, or a click outside closes it; one open at a time). The
popover is portaled to `<body>` and `position: fixed`: always just above its chip, kept on screen, and capped to the available height, with
only its body scrolling (header pinned), so a long editor never makes the page scroll (checked: the
page's scroll height is unchanged with a long section list open), holding the same controls
as before (`MetronomeOptions.tsx`). No collapsing, no hiding. The
Rhythm/Sound `CollapsiblePanel`s and `PanelsToggle` are no longer used by the Metronome. Verified in
the browser (each chip's popover, desktop and 390px, Changing meters editing inside the popover); no
errors.

### Every tool's options are setting chips now (2026-10-10, web)

The Metronome's chip pattern, applied site-wide through the shared components rather than tool by
tool. `ToolLayout` renders a tool's `options` as a centred row of chips under the main display
(`OptionChips`: `ChipsModeContext` + `SettingsBar`); the hideable options column and its
"Options" show-button are gone (`sidePanel`s such as History/Struggles/Modulations keep their own
column). Under that context, `CollapsiblePanel` and `OptionSection` render as a `SettingChip`
(`components/SettingsBar.tsx`, moved out of `components/metronome/`) whose popover holds the
panel's children; the popover header carries the panel's "?" descriptions toggle (`HintsButton`)
and, for panels with a `toggle`, a **split chip**: a switch with the label and value that turns the
whole section on/off straight from the chip, plus a separate sliders button that opens the popover;
dimmed while off (value "Off"). The popover then has no switch of its own; opened while off it says
"<Title> is off." with a "Turn on" button. Exception: Note / Scale / Interval Trainer's listen mode is a **Timed | Listen**
selector above the chips (`ToolLayout`'s new `optionsMode` slot, a `Segmented`, disabled while
running), like the Metronome's One meter / Changing meters; with `asMode` the panel (now titled
"Listen") only appears as a plain chip while listening. Tempo Trainer now matches the Metronome exactly: a One meter / Changing
meters selector plus the form card in `optionsMode`, Time + Subdivision chips (one meter) or a
Sections chip (`StructureEditor show="sections" modern`), then Mute cycle ("4 on · 4 off") and
Sound.
`OptionsCard` renders just its sections (sharing one hints setting); `PanelsToggle` renders nothing.
New props on both: `summary` (the chip's value) and `wide`. Summaries added for the obvious ones:
meters ("4/4"), sounds ("Woodblock · 80%", `soundSummary`), pools ("12 of 33"), ranges ("E1-G4"),
Tuner instrument / "A = 440 Hz", Slow Downer speed / markers, count-off/count-in, roll type, Jam
Practice's tune count, Practice Timer sound. Practice Timer has no separate "New session" button: the **New session** chip
(always present) opens the session editor, and a saved session's pencil opens the same popover as
"Edit session" (`SettingChip`/`CollapsiblePanel` gained controlled `open`/`onOpenChange`); closing
the popover keeps an unsaved draft (chip value "Unsaved"), Save/Cancel end it. The Pomodoro editor is `components/PomodoroEditor.tsx`: Work / Break / Long break minute
cards side by side, a Set number / Keep going switch with "Work cycles" and "Long break every N
cycles" steppers, then exactly one optional name field per cycle (per cycle in a round when it keeps
going; `normalizePomodoro` trims `workTitles` to the cycles that exist, so there can't be more names
than cycles), and a preview strip of the run in order with its total time. Work cycles cap at 24. The popover ignores clicks/Escape inside portaled
menus (`[role=listbox|menu]`, e.g. `Select` options), so dropdowns inside popovers work.
`MeterFields`' `MeterOptions` and `SoundOptions` now render the Metronome's controls
(`TimeSignatureControl` + `SubdivisionPicker`; `SoundPicker`), so Polyrhythm, Tempo Trainer, the
Recorder and the classic section cards match; the typed accent-grouping field (`GroupsField`) is
deleted (accents come from tapping each tool's beat strip). Verified: every tool page in the
browser at 1440 and 390 wide (chips, a popover each, no errors), `tsc`, `eslint`, `next build`.
The Recorder's metronome got the same treatment, but its chips live inside the Metronome card
(shown while the metronome is on) rather than under the page, since the recordings list sits below
it: One meter / Changing meters, the form card, Time / Subdivision or Sections, Count-in, Sound
(`SettingsBar fit` wraps within the card). Checked in the browser by temporarily bypassing the
signed-in gate (reverted). The Recorder page is now `layout="stacked"` (vertically centred) with a grid: on desktop
the Metronome card on the left and the recorder (timer, record button, auto gain) above recent
recordings on the right; on phones recorder, then metronome, then recordings.


## One title style for every page (2026-10-18)

Jack asked for consistent page titles. The plain row the tools and the Shed Log use (accent icon,
`text-2xl sm:text-3xl font-extrabold`, the `?` next to it, buttons on the right, no card) is now
the style everywhere. `Hero` (`components/library/ui.tsx`) no longer draws a tinted gradient card
with an icon tile; it renders that row, so Tunes, Setlists, Chord Charts, Files, Lessons (and its
sub-pages), tune pages and Feedback all changed at once. Because Hero's buttons now sit on the page
background, its actions wrapper turns any `bg-background` button into `bg-surface`
(`[&_.bg-background]:bg-surface`); `HeroSearch`, `LibraryTabs` and the Setlists sort toggle moved to
`bg-surface` for the same reason. Admin (which used hardcoded zinc/indigo colours), What's new and
Support were restyled by hand to the same row. Left alone on purpose: Dashboard, Community and the
Shed Log (and its routine pages). Public profiles (`/u/[name]`) are no longer full width on
desktop (`max-w-4xl`). Checked at 1440 and 390 in light mode, signed out; signed-in Lessons pages,
tune pages and dark mode were not screenshotted.

## Library as one page with tabs (2026-10-18)

Tunes, Setlists, Chord Charts and Files now all title themselves "Library" (`LibraryIcon`) and show
`LibraryTabs` as an underline tab bar under the title row (Hero renders `tabs` below the title
now, not top-right; the back button keeps its own row). Each tab keeps its own subtitle, buttons
and `?` intro (Setlists has no help topic, so no `?`). On tab pages Hero keeps the buttons on the
title line and truncates the subtitle to one line, so the tabs don't move when switching on a
phone; Tunes' Add became icon-only on phones for room. The "Tunes I Know"/"Tunes to Learn" list
pages (`TuneListManager`) are deeper pages with a back button, so they lost the tabs and keep their
own title. Checked at 1440 and 390, light, signed out.

## Storage pill beside the Library title (2026-10-18)

`components/files/StoragePill.tsx`: a Shed Log-style stat pill (ring + "20 MB / 100 MB",
"storage"; danger colour past 90%, "storage full" when full) passed to Hero's new `titleExtra`
slot on all four Library tabs, so the header is the same on each. Signed in only; it links to
`/files` and reuses `files.storage` (the same query the Files tab runs). The Files tab's storage
card is gone; its "full" warning, upload progress and upload errors now show only when needed, and
"drop files anywhere here to upload" moved into the subtitle. Not seen signed in (no test login
in that session): only tsc/eslint and the signed-out pages were checked.

## Library tabs are a query param, not routes (2026-10-18)

Jack asked for the Library tabs to be real tabs, not separate routes. `/tunes` is now the only
Library page: `app/tunes/page.tsx` renders `components/library/LibraryHub.tsx` (in `<Suspense>`,
because it reads `useSearchParams`), which picks Tunes/Setlists/Chord Charts/Files from
`?tab=setlists|charts|files` (no tab = Tunes). `libraryHref(tab)` in `components/library/ui.tsx`
builds the address; `LibraryTabs` links use `replace` and `scroll={false}`, so switching tabs
doesn't add history entries or reload. The pages `app/tunes/setlists`, `app/chord-charts/page.tsx`
and `app/files` were deleted; `next.config.ts` redirects those addresses (307, not permanent) to
the matching tab. Sub-pages (`/tunes/list`, `/tunes/tune`, `/tunes/setlist`, `/chord-charts/view`,
`/new`, `/import`, `/playlist`, `/edit`) are unchanged. Internal links now go straight to the tab
URLs. Left as they were on purpose: `NAV_LINKS` (`/chord-charts` is still an entry; the paused
mobile app uses the same list), `helpContent` hrefs (the redirect covers their Open button), and
the sidebar's `isLibraryPath`. Split-screen panes for `/tunes` and `/chord-charts` now render
`LibraryPane` / `ChartsPane` (Chord Charts opens on the charts tab). Checked: redirects by curl,
tab clicks in the browser (URL updates, no reload, history length unchanged, no console errors),
`next build`, tsc, lint. Not checked: split-screen panes, signed in.

## UI/UX pass 3 fixes: practice tools (2026-11-20)

From the pass-3 web review (practice tools and the Shed Log).
- **Trainers' History chip** (Guess the Interval/Chord/Progression, Note/Scale/Interval Trainer)
  shows only once a round has *finished* (`history.length > 0`). A stopped round only feeds
  Struggles, so before this the History chip opened to "No attempts yet" right after practising.
  When it shows, its value is "Best …", "N rounds" or "None yet". The empty text is now "Finish a
  round with these settings to see it here."
- **Fills, not outlines:** the quiz answer grid (`answerButtonClass`/`answerButtonStyle` in
  `components/learning/quizUi.ts`) is a `bg-foreground/[0.05]` fill. Right and wrong answers get a
  tint plus a 2px inset ring (box-shadow) in the grade colour. `PoolPill`'s off state is also a fill
  now (a transparent border keeps its size), and the Sticking Warmup's roll-type and triplet pills use
  `PoolPill` instead of their own bordered buttons.
- **`MeterQuickPicks`** (`components/metronome/MetronomeOptions.tsx`): the 4/4 … 12/8 grid. It's in
  every Time popover: Metronome, Time Test, Tempo Trainer, and Metric Modulation through
  `MeterOptions`' new `onPickMeter` prop. The quick picks show only when that prop is passed, so
  StructureEditor's sections don't get them. `onPick` sets both numbers and the accents in one
  update.
- **`DisclosureSummary`** (`components/Disclosure.tsx`): the `<summary>` for native `<details>`
  ("How to type a chord", "How to type your answer", Slow Downer's "Shortcuts", the chart editor's
  "More tips"). It uses the same muted text and turning chevron as `Disclosure`, with no browser ▶
  marker.
- **Smaller fixes:**
  - Time Test's "Recording 0:04" badge is an `inline-flex` pill. As `flex` it stretched across
    the PageBar's `flex-1` slot.
  - The tempo slider has `aria-valuetext="N BPM"`.
  - Metric Modulation's Previous tempo click popover shows its sound grid and Mute only while
    it's on. It stays a plain chip: an earlier pass moved it off the split `toggle` chip on
    purpose.
- **Skipped:** the review's "ASCII G# in the instrument trainers". They already go through
  `noteGlyphs`, and the screenshots show G♯.
- **Checked** in headless Chromium at 1440 light and 390 dark:
  - Answered then stopped a Guess the Interval round. There's no History chip, and Struggles
    still shows.
  - The answer grid after answering.
  - The Tempo Trainer and Metric Modulation Time popovers (picked 3/4).
  - The Sticking Warmup pills, the Guess the Chord summary open and closed, and the Time Test
    badge while recording.

  Also tsc and lint. **Not checked:** a finished 15-question round (the "N rounds" / "Best"
  values), hover styles, and audio.
