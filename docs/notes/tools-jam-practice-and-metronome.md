<!-- Moved word for word from the old single PROJECT.md (lines 3722–3914) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

## Tools (sidebar order)

- **Jam Practice** (`components/JamPractice.tsx`) — random tune/tempo/key picker with a
  count-off metronome. Can draw from your own tune list or a built-in library of ~630 jazz
  standards (`lib/standards.ts`).
- **Metronome** — configurable time signature (including odd/custom meters), subdivisions,
  per-beat accents, tap tempo. Per a direct follow-up, the subdivision clicks (the "&" in eighth
  notes, etc.) now show in `BeatIndicator` too — not just a static marker, but genuinely live and
  clickable the same way the beats already were: they light up as they actually play, and clicking
  one cycles it through accent/normal/muted (`lib/clickEngine.ts`'s new `ClickSettings.subAccents`,
  flattened beat-major — `beat * (subdivision - 1) + subIndex` — and `lib/meterControls.ts`'s
  matching `defaultSubAccents`). This needed `onBeat` to change from firing only on the main beat
  (`sub === 0`) to firing on *every* tick, so a caller can track which subdivision just sounded
  (`currentSub`) the same way it already tracked `currentBeat` — the only two call sites, Metronome
  and Polyrhythm Metric Modulation Metronome, were updated accordingly; Jam Practice's own
  count-off doesn't go through this engine at all, so it's unaffected. An accented subdivision tick
  reuses the main beat's `normalFreq` at a lower volume (0.4, between a normal beat's 0.55 and a
  normal subdivision's 0.25) — distinguishable by loudness, not pitch, a deliberate simplification
  over adding a fourth frequency to every `ClickSound`. The Polyrhythm tool's secondary reference
  click stays locked to `subdivision: 1` (as it always was) and so never shows or needs subdivision
  ticks of its own.

  **`BeatIndicator` itself was then redesigned from numbered circles to a vertical-bar "sequencer
  strip"** per a direct follow-up with a reference screenshot (a row of tall colored bars, each
  beat's number printed top-left inside its own bar, its subdivision ticks as shorter unnumbered
  bars immediately after it). A shared `Bar` sub-component now renders both a beat and a
  subdivision tick identically apart from the number — same three-level color scheme (`bg-accent`
  for accent, `bg-foreground`/`text-background` for a bold "normal" bar, a faint ring-only hollow
  look for muted) and the same `active` treatment (scale/brightness/ring) a beat circle used to
  get, now shared by whichever bar — beat or tick — the engine just sounded. Bars within one beat
  sit close together (a small `gap-0.5`); the gap between beats is the container's own larger
  `gap-3`/`gap-2` (normal/`size="sm"`), matching the grouping the screenshot shows. `tsc`, `eslint`,
  and `next build` all pass. Verified with a synthetic script against a verbatim copy of the
  updated scheduling loop (can't import `lib/clickEngine.ts` directly outside the browser — it
  reaches for `window.AudioContext`): a muted subdivision tick schedules no sound at all, an
  accented one schedules at the expected frequency/gain, and `onBeat` fires for every tick in the
  right beat/sub order. **Not verified**: how the bar strip actually looks/feels in a real
  browser — whether it reads as close to the reference screenshot, whether the muted "hollow ring"
  look is legible at this size, and whether the active bar's ring-offset still looks right at the
  smaller `size="sm"` dimensions used for the Polyrhythm tool's reference click row.

  **"Structures" for odd/changing meters** (`lib/structure.ts`, `components/StructureEditor.tsx`)
  — per a direct follow-up request with a reference screenshot (from another app's "song form"
  editor, used as a UI/concept reference, not copied pixel-for-pixel): a structure chains bars of
  *different* time signatures in a fixed, looping sequence instead of one meter for the whole run
  — the request's own example, 2 bars of 11/8 then a bar of 12/8 then a bar of 15/8, is exactly
  three named sections (`A`: 2 bars of 11/8, `B`: 1 bar of 12/8, `C`: 1 bar of 15/8) arranged into
  a `form` of `[A, B, C]` that loops back to `A` after `C`. Modeled the same way a real tune's form
  is, per an explicit choice over a simpler flat list (asked directly, since the request's own
  example doesn't need reuse): a handful of reusable, named `sections` (`lib/structure.ts`'s
  `StructureSection` — bars, beatsPerBar/beatUnit, accents, subdivision, subAccents, i.e. a
  complete self-contained little meter, the same shape the plain top-level meter already is), and
  a `form` that's just an ordered list of section ids that can repeat the same one more than once
  (e.g. `[A, A, B, C]`) rather than needing a second copy of a section for every repeat. Off by
  default (`useStructure: false`); every existing field keeps behaving exactly as it always has
  while it's off — a `SwitchRow` inside the existing "Meter & subdivision" panel swaps that panel's
  content between the plain `MeterOptions` form and the new `StructureEditor` rather than adding a
  second panel.

  **Playback**: `Metronome.tsx`'s `getSettings(beat, sub)` — called by the click engine right as it
  schedules each tick, same function RandomMetricModulation already uses to land a tempo change
  exactly on a bar line — now also detects `beat === 0 && sub === 0` (a new bar starting) to decide
  whether the *current* form entry has finished its bar count and, if so, advances to the next one
  (wrapping past the end), the same "detect a bar boundary before it affects scheduling" trick,
  just switching the whole meter (`beatsPerBar`/`accents`/`subdivision`/`subAccents`) instead of the
  tempo. `bpm`/`volume`/`soundId` stay global across every section — only the meter itself changes
  per section, matching the request (no mention of the tempo itself changing through the form).
  `structFormIndexRef`/`structBarsIntoRef`/`structSeenFirstRef` (reset in `start()`, same pattern as
  `RandomMetricModulation`'s own `barsSinceModRef`/`seenFirstBeatRef`) track the state machine;
  `structPlayback` (React state, updated from inside `getSettings`) mirrors it for display and
  resets to `null` on `stop()` — read as `?? 0` everywhere it drives which section the main page
  shows/edits, so there's always a sensible section to look at even before Start has ever been
  pressed (defaulting to the form's first entry).

  **Editing**: `StructureEditor.tsx` — a "Form" strip of chips (one per form entry, reusing the
  same name-plus-"the section it is" idea everywhere), each with a remove button for that one
  occurrence and, per a direct follow-up request ("make them draggable, same for mobile"),
  genuinely draggable to an arbitrary position: Pointer Events
  (`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel` + `setPointerCapture`, the same
  mechanism `Sidebar.tsx`'s own resize handle already uses, not the HTML5 drag-and-drop API, which
  doesn't work on touch devices without unreliable polyfills), so one implementation drags with a
  mouse, a finger, or a pen alike. Each chip's bounding rect is measured once at drag-start into a
  fixed reference grid (`dragRectsRef`) — the *physical* position of slot N in the row never moves
  as the underlying form reorders, only which chip's data renders there does, so comparing the
  live pointer position against these frozen rects (nearest-center-wins) is enough to know which
  slot it's over, with no re-measuring mid-drag. Crossing into a different slot calls
  `reorderForm(structure, from, to)` (a splice-out/splice-in move to an arbitrary position) and
  re-centers the dragged chip's `transform: translate()` offset fresh against its new slot
  (recomputed from the *current* slot each move, never accumulated from the drag's start) — so
  there's no jump the instant it crosses into a new position. `touch-none` on the chip stops the
  browser's own touch-scroll from fighting the drag; a press that starts on the chip's own remove
  button (`closest("button")`) is left alone as that button's own click, not a drag. The original
  ←/→ adjacent-swap buttons (`moveFormEntry`) were removed outright once dragging covered the same
  job, per a direct follow-up ("get rid of the arrows") — `moveFormEntry` itself was deleted too
  once nothing called it anymore, rather than left as unused dead code. Verified with a synthetic
  script (the pure `reorderForm` splice logic, and the nearest-slot distance math against a small
  fixed grid of mock rects — a pointer past a slot boundary correctly picks up the next slot, and
  one far past the end clamps to the last slot rather than extrapolating past it) — **not
  verified**: how an actual touch/mouse drag feels in a real browser, since this sandbox has
  neither.

  "Add to form" buttons (one per defined section, `+ A` `+ B` ...) append to the end; and a "Sections" list
  of collapsible cards, each a complete little meter editor — name, bar count (`SteppedField`), the
  *exact* `MeterOptions` the plain meter uses (presets, beats/unit steppers, accent grouping,
  subdivision picker), and its own `BeatIndicator` (`size="sm"`) for that section's own
  accent/subdivision-accent pattern — reusing every existing building block rather than a second
  copy of any of them. The main page's own `BeatIndicator` (above Start/Stop) tracks whichever
  section is current (`activeSection`) instead of the plain top-level meter while a structure is
  active, including routing its `onCycle`/`onCycleSub` to edit that section directly
  (`cycleSectionAccent`/`cycleSectionSubAccent`) — the same live-editable convenience the plain
  meter already had, just aimed at a different target. Start/Stop is disabled with an empty form
  (`canStart`), since there'd be nothing to actually play.

  Verified with a synthetic script against a copy of the bar-counting/section-switching state
  machine (can't import the real `getSettings` — it closes over React refs) using the request's own
  example (`A`: 2×11/8, `B`: 1×12/8, `C`: 1×15/8, form `[A, B, C]`): the section/beatsPerBar
  sequence over 8 simulated bars comes out exactly `A A B C A A B C` / `11 11 12 15 11 11 12 15` —
  two bars of 11/8, a bar of 12/8, a bar of 15/8, looping, matching the request exactly. `tsc`,
  `eslint`, and `next build` all pass. **Not verified**: anything about how this actually looks or
  feels in a real browser — the Form chips' drag-to-reorder (see its own paragraph above), a
  section's inline `MeterOptions`/`BeatIndicator` editor actually usable at the smaller card width,
  the empty-state messaging, and whether switching meters exactly on the bar line actually sounds
  seamless rather than having any audible hiccup — this sandbox still has no working browser or
  audio output.

  **"Tempo note value" — letting BPM refer to a different note value than the beat unit** — per a
  direct follow-up request with a concrete example: in 4/8 time, type "quarter note = 275" and have
  the metronome actually click eighth notes at 550 (twice as fast), rather than 275 always meaning
  whatever the meter's own beat unit happens to be (the engine's only behavior before this — `lib/
  clickEngine.ts`'s `ClickSettings.bpm` has no concept of note values at all, it's always just
  "clicks per minute" for whatever the engine is currently counting as one beat). `lib/
  meterControls.ts`'s new `convertTempo(bpm, fromNoteValue, toNoteValue)` is the one-line
  conversion (`bpm * toNoteValue / fromNoteValue` — an eighth note is half as long as a quarter, so
  twice as many fit in the same minute) everything else here is built on. A new "Tempo note value"
  `Select` sits right under the BPM hero number (`TEMPO_NOTE_MATCH`, a `0` sentinel for "match beat
  unit" — the persisted field itself is `tempoNoteValue: number | null`, `null` meaning the same
  "match beat unit" default, so an existing saved tempo keeps meaning exactly what it always did
  unless this is explicitly changed); a small "= 550 BPM at eighth note clicks" line appears
  underneath whenever the chosen note value actually differs from the current beat unit, so the
  real click rate is never a surprise. `Metronome.tsx`'s `getSettings` — already the one place that
  resolves the engine's actual per-tick `ClickSettings` — now converts the displayed `bpm` through
  whichever beat unit is *currently* active before handing it to the engine: the plain meter's own
  `beatUnit` normally, or (in structure mode) the *active section's* `beatUnit`, which can differ
  bar to bar — `tempoNoteValue` itself stays one single global field either way (tempo, like
  volume/tone, doesn't change per-section), only the conversion's target note value does.
  `settingsRef` gained `beatUnit`/`tempoNoteValue` fields to make this resolvable from inside
  `getSettings` (which runs off the engine's own scheduler tick, not a render) without closing over
  stale render-time values. Verified: the conversion formula itself, directly, against the
  request's own numbers (`convertTempo(275, 4, 8) === 550`, confirming "twice as fast"; a
  round-trip back through the same two note values returns the original 275; converting between
  the same note value is a no-op). `tsc`, `eslint`, and `next build` all pass.

  Three direct follow-ups landed on top of this. First, "put it to the left of the bpm didget": the
  picker moved from its own row below the BPM number into the number's own row, immediately to its
  left, via a new optional `before?: React.ReactNode` prop on `TempoHero`
  (`components/MeterFields.tsx`). Then, "put the drop down on top of the big number actually":
  `before` was replaced with `aboveNumber?: React.ReactNode` instead, rendered as the first child
  of the narrow `w-40` column the number itself sits in (so it's centered directly above the
  digits, not off to the side in the wider −/+ row) — every other caller still passes neither, so
  both changes stay purely additive. Finally, "make the dropdown have actual notes": each option
  now shows a real engraved note glyph via a new
  `NoteValueIcon` (`components/MeterFields.tsx`, next to `SubdivisionIcon`, same notehead/stem
  proportions as that component's own beamed notes, just for one note standing alone) — hollow for
  whole/half, filled with a stem for quarter and shorter, plus one flag per halving below a quarter
  (eighth = 1, sixteenth = 2, ...), rather than text alone. The dropdown's own labels were
  shortened for this compact spot (`SHORT_NOTE_NAME` — "Quarter", "Eighth", "16th", ...) since
  there's much less room here than in the full-sentence conversion readout below it, which still
  uses `NOTE_VALUE_NAMES`' full names ("Quarter note"). **Not verified**: how the new Select/
  conversion-readout actually looks positioned under/beside the BPM number, whether the hand-drawn
  note glyphs actually read as recognizable whole/half/quarter/eighth/etc. notes at this small a
  size, and — the thing that actually matters most here — whether the resulting click rate is
  genuinely audible and in time once played for real, since this sandbox has no audio output at
  all.

  **The beats-per-bar/beat-unit control itself was simplified and shrunk**, in two more direct
  follow-ups. First, "get rid of the presets": the row of common-signature buttons (2/4, 3/4, 4/4,
  ...) that used to lead `MeterOptions` is gone outright — the beats/unit steppers right below them
  are now the only way to set a meter. Since `MeterOptions` is the one shared component behind the
  plain Metronome meter, the Polyrhythm tool's own meter, *and* every Structure section's inline
  editor, this one removal applies everywhere at once; its now-unused `onApplySignature` prop (and
  each of those three call sites' own `applySignature` helper function) was deleted too rather than
  left as dead code, and `SIGNATURE_PRESETS` itself stayed in `lib/meters.ts` since `TuneFields.tsx`
  still uses it for an unrelated tune-time-signature picker. Second, "make the time signature
  smaller and easier to understand what it is": `SteppedField`/`BeatUnitField` both gained an
  optional `size?: "md" | "sm"` prop (new `CIRCLE_BUTTON_SM`/`CIRCLE_INPUT_SM` constants,
  module-private since nothing outside this file needs them) — `"sm"` only inside `MeterOptions`'s
  own beats/unit pair, so Polyrhythm's own direct `SteppedField` call ("Bars between modulations")
  and a Structure section's "Bars" field keep their original, larger size. The two numbers'
  `showLabel` also flipped from `false` to its own default of `true`, so "Beats per bar"/"Beat
  unit" are now always-visible captions (not hidden behind the panel's "?" hint toggle the way they
  were before), plus a small "Time signature" heading above both of them tying the whole stacked
  pair together as one concept. `tsc`, `eslint`, and `next build` all pass. **Not verified**: how
  any of this actually reads once rendered — this sandbox still has no working browser.

## 2026-10-27 — four click levels, shown as three bars per beat

Jack (with a screenshot of another metronome app's beat columns) asked for every click to have
three levels you step through by clicking it, on every metronome on the site.

- `BeatLevel` (`lib/clickEngine.ts`) is now `0 | 1 | 2 | 3`: 0 muted, **3 soft (new)**, 1 normal,
  2 accent. Soft took the next free number so every saved `accents`/`subAccents` array (tool
  settings, structures, the account) keeps its meaning; `LEVEL_RANK` orders them by loudness
  (muted 0 … accent 3). `NEXT_LEVEL` steps down: accent → normal → soft → muted → accent.
- Sounds: `mainBeatClick` / `subClick` in `clickEngine.ts` are the one place a level becomes a click
  (the scheduler and `stickControlEngine.ts`'s count-off and pulse clicks use them). Jack's follow-up:
  levels differ by **pitch, not volume**. Every beat plays at one gain (0.75 of the volume; it used
  to be 0.9 for an accent, 0.55 for normal) and every subdivision at another (0.4, so the beat still
  leads); accent keeps the sound's accent pitch, normal its normal pitch, soft is a minor third under
  normal (`SOFT_RATIO`). Subdivisions: accent = the normal beat pitch, normal = the sub pitch, soft a
  minor third under that.
- `BeatIndicator`: each bar holds three segments that fill from the bottom by rank: three in the
  accent colour for an accent, two (foreground colour) for normal, one for soft, none for muted
  (which is also dimmed, its number struck through). Every metronome uses this component (Metronome,
  Metric Modulation, Jam Practice, Tempo Trainer, Recorder count-in, sticking warmup, structures,
  the background dock, landing previews), so they all get it.
- Mobile (paused) shares `packages/core`: its `BeatLevel` and click helpers know soft (a soft beat
  synced from the website plays at the normal pitch, quieter: its native engine only has samples for
  the existing pitches), its `BeatIndicator` shows soft like normal, and its own
  cycle is unchanged (a soft beat steps to muted there).

Checked in the nix Chromium (dev server on 3100, signed out): stepping beats through all four
levels on the Metronome (titles and saved `accents` `[2,3,0,2]`, kept after a reload), the bars in
light and dark, the Metric Modulation page. tsc for web, desktop, mobile, core (two old
`lessonFiles.ts` errors in core aren't from this) and convex; web lint. **Not heard:** how the levels
sound (the new pitches, beats now all at one volume); the desktop app's native audio.

Same day: the **Tap tempo** button (`TempoHero` in `MeterFields.tsx`, used by every tool with a
tempo) went from a full-width flat bar to a centred pill with the metronome icon that shrinks a
touch when pressed, and a ring (`.tap-ring` in globals.css) flashes out from it on every tap
(invisible without motion). Checked at 1000 and 390 wide, light and dark; five taps set the tempo.
