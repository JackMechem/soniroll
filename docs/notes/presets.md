# Tool presets

## Presets for every tool (2026-11-16, web + desktop)

Feedback FB-10 (GitHub issue #18) asked for presets on the Metronome; Jack wanted them on every
tool. Built once, as a shared building block, then wired into every tool with options.

**What it does.** A "Presets" chip, first in a tool's setting chips. Its value is the preset the
options match right now, "Custom" when they match none, "None" when there are no presets yet
(long names truncate). The popover (a bottom sheet on phones, like every chip) lists the presets:
tap one to apply it (the popover stays open and the check moves to it); ⋮ or right-click opens a
menu with **Update with current options** (hidden when the preset already matches), **Rename**
(`PromptDialog`) and **Delete** (`ConfirmDialog`). **Save current options** asks for a name; a
name already in use (ignoring case) asks "Replace “X”?" and then overwrites that preset. No
active-preset id is stored: "which preset is this" is worked out by comparing values, so it's
right after a reload, on another device, or when you set things back by hand.

**Files.**
- `apps/web/lib/toolPresets.ts` — the data side. `toolPresets(id, settings, update, omit?)` builds
  the `ToolPresets` object a tool hands over (generic, so `omit` names are type-checked against
  the settings object); `usePresets(tool)` reads the list and returns `active`, `matches`,
  `apply`, `saveAs`, `overwrite`, `rename`, `remove`, `findByName`.
- `apps/web/components/PresetsChip.tsx` — the UI: `PresetsChip` (the chip), `PresetsSection`
  (the same list as a `PanelSection`, for the Bass Genius-style properties panel), and the shared
  list body with its dialogs and menu.
- `ToolLayout` has a new `presets` prop; `OptionChips` renders the chip first in the row. It's
  hidden whenever `options` is (the trainers hide their options while a run is going, so you
  can't swap presets mid-round).
- `BookmarkIcon` added to `components/tools.tsx` (there was no bookmark/preset icon).

**How a tool opts in (one line).**
- Tools whose options go through `ToolLayout`:
  `presets={toolPresets("tempo-trainer", settings, updateSettings)}`.
- Tools that draw their own `SettingsBar` (Metronome, Time Test, the Recorder's metronome card):
  `<PresetsChip tool={toolPresets("metronome", settings, updateSettings)} />` as its first child.
- Tools with a properties panel of `PanelSection`s (Bass Genius, Drum Generator, Syncopation):
  `<PresetsSection id="dg-presets" tool={toolPresets("drum-generator", settings, update)} />` as
  the panel's first section. It starts closed (a one-line "Presets · <current>" row above Tempo);
  `PanelSection` gained `defaultOpen` for that (the stored panel state now has `opened` as well as
  `closed`).
- The id is the tool's href without the slash and names the storage key; never change it once
  shipped or people lose their presets. The fourth argument lists settings fields that aren't
  options (see below).

**Options only.** A preset saves every field of the tool's settings object (`useSyncedSettings`
view, so exactly the fields in the tool's defaults) except: fields named `history`,
`inputDeviceId`, or ending in `Stats` — always left out, as a safety net for tools that forget —
and the tool's own `omit` list. Applying a preset builds a patch of only those option fields (and
only ones whose type still matches the tool's current value, so a stale or hand-edited preset
can't break a tool), then calls the tool's own `update`, which merges into the whole stored
object. So history, stats and anything else beside the options are never touched — the
`useSyncedSettings` trap from PROJECT.md (a trimmed copy once wiped the ear trainers' history)
can't happen here. A preset saved before a tool grew a new option just leaves that option as it is
when applied, and isn't compared on it.

Per tool:
- Metronome, Tempo Trainer, Polyrhythm Metric Modulation Metronome, Jam Practice, Tuner,
  Random Sticking Warmup, Time Test, Syncopation, Drum Generator: the whole settings object.
  Modes are included (One meter / Changing meters, the structure itself).
- Note / Scale / Interval Trainer, Guess the Interval / Chord / Progression: everything except
  their history, per-item stats and mic (automatic). Practice / Learn and Timed / Listen are
  included, as they're options like the rest. Checked on Guess the Interval: applying a preset keeps history, stats and
  unknown fields byte for byte.
- Jam Practice: count-off and switches only; the tune list is its own store (`useSyncedTunes`),
  not an option.
- Time Test: its settings key only; the mic setup and calibration (`…-time-test-mic`, this device)
  and the take history (`…-time-test-history`) are separate keys and never touched.
- Slow Downer: speed, keep pitch, volume; `maximized` (the waveform's height) is left out.
- Bass Genius: the band setup (player, feel, touch, tempo, choruses, count-in, click, swing,
  chords, drums, mix). Left out: `tab`, `showChart` (view) and `source`, `chartId`, `typedText`,
  `typedKey`, `typedMeter`, `transposeKey` (which tune you're playing), so picking a preset doesn't
  change your tune.
- Recorder: the chip sits in the metronome card's chips (shown while the metronome is on) and
  saves the metronome only; auto gain, mono, mono source and the song options (`playSong`,
  `songVolume`) belong to the setup and the tune, not a preset.

**Skipped, and why.** Practice Timer (its saved sessions already are its presets; the rest is
the alarm sound, and a Presets chip beside New session would read as a second kind of session),
Shed Log, Shed Notes, Score Writer (documents, not options), Community, Library / Chord Charts,
Lessons. Practice Timer would be one line if Jack wants it:
`presets={toolPresets("practice-timer", settings, updateSoundSettings)}`.

**Storage.** One synced-settings key per tool, `jam-practice-presets-<id>`, holding
`{ presets: [{ id, name, values, updatedAt }] }` through `useSyncedSettings` with a module-level
defaults constant: in the account when signed in, in the browser when signed out, no merge (the
usual rule). The server's `syncedSettings` table takes any key, so there was no backend or schema
change and nothing to push to Convex. One key per tool keeps each row small and well under the
1 MiB document limit. Malformed entries are dropped on read.

**Gotchas found.**
- The presets popover opens dialogs and a menu; those are portaled to `<body>`, and a click in a
  portaled dialog counted as "outside" and closed the chip's popover. `SettingsBar`'s
  outside-click check now also ignores anything inside `[data-popover-child]` (the presets'
  dialogs are wrapped in one), as it already did for `role="menu"`/`listbox`.
- Pressing Enter in `PromptDialog` when its `onSubmit` opened a `ConfirmDialog` (the "Replace?"
  question) instantly cancelled the new dialog: the Enter's keypress landed on the Cancel button
  that had just taken focus. `PromptDialog` now `preventDefault`s its Enter.
- React bubbles events from portals up the component tree, so a right-click inside the portaled
  menu reached the preset row's own `onContextMenu`; the row ignores events from outside its own
  DOM.

**Verified** (signed out, dev server + headless Chromium, scripts in the scratchpad):
- Metronome at 1440 light: save, apply (from "Custom" back to the preset after changing tempo and
  meter), rename (popover stays open), the ⋮ menu, delete with confirm, saving a duplicate name →
  Replace.
- Guess the Interval at 390: seeded history, stats and an unknown field; saved a preset; changed
  options and added history/stats; applied the preset → options restored, history, stats and the
  unknown field unchanged. The saved preset's fields contain no history/stats/mic.
- Every chip tool (14) at 1440 light and 390 dark: chip shows "None", save works, chip shows the
  name, no console errors, no horizontal overflow. Bass Genius, Drum Generator, Syncopation: the
  panel section on desktop and in the phone Options sheet. Drum Generator in full (save, apply,
  rename, delete) at 1440 light and 390 dark, with dialogs above the phone sheet. Practice Timer,
  Recorder (signed out), Shed Log, Score Writer, Shed Notes have no chip.
- The Help page's new "Presets" topic (Getting started) in dark mode; a long preset name
  truncates in the chip and the list.
- `tsc` and `pnpm lint` in `apps/web` and `apps/desktop`; `vite build` of the desktop app.

**Not verified:** anything signed in (no test login: account sync of presets, the Recorder's chip,
which only shows signed in); the desktop app running (only its typecheck, lint and build); the
mobile app (untouched, and paused). Account deletion doesn't remove `syncedSettings` rows at all
(that predates this, see `account.ts`); presets live in the same table, so they share whatever
happens to the rest of a deleted account's settings.

**Privacy page:** "tool settings and the presets you save" under "Your stuff" (date bumped).
