<!-- Moved word for word from the old single PROJECT.md (lines 3915–4127) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

- **Polyrhythm Metric Modulation Metronome** (`components/RandomMetricModulation.tsx`) — same click engine
  and meter controls as Metronome, but every N bars it randomly jumps the tempo by a musical
  ratio (3:2, 4:3, 2:1, etc. — `lib/metricModulation.ts`), bouncing to the ratio's inverse if
  that would push the tempo out of range. Configurable bars-per-modulation (or "play until tempos
  realign" — each `Modulation` carries an exact `num`/`den`, so e.g. a 3:2 jump auto-sets the
  interval to 3 bars, the point where the new and reference tempos next share a downbeat), which
  ratios are in the mix, whether to avoid repeating the same one twice, and an optional "return to
  original tempo" mode that alternates modulate-away/return-home instead of drifting freely. Shows the
  upcoming tempo ahead of time and logs each modulation for the run in a `ToolLayout` `sidePanel`
  (see below). An optional second click — the "Previous tempo click" (`playOriginalTempo`; own
  tone, own mute, own `BeatIndicator`) — runs the whole time as a second track on the _same_
  `startClickEngine` call (see below) so it can hear/see it against whatever the main click has
  modulated to — pinned to the true starting tempo in "return to original" mode, or otherwise
  always the tempo the main click just left (one modulation behind, which is what the toggle's
  name reflects — it's usually tracking the *previous* tempo, not literally the original one).
  Turning it on also forces "play until tempos realign" (`matchToRealignment`) on and locks it
  there (disabled, can't be switched off) until the previous-tempo click is turned off again —
  that's what keeps the reference click's own realignment math meaningful; letting the two vary
  independently could leave it silently out of sync with the main click. Each modulation carries
  an exact `num`/`den` (e.g. 3:2), so it also shows what the new
  tempo's quarter note is worth in the reference tempo's note values where that reduces to a
  single clean name (`describeQuarterEquivalence` in `lib/metricModulation.ts`; several ratios,
  like 4:3, genuinely don't and show nothing). The modulation itself is applied from inside
  `getSettings` (a param `startClickEngine` passes `(beat, sub)` into) rather than reacting to
  `onBeat`, so it lands exactly on the bar line instead of one beat late.
- **Tuner** — a Total-Energy-style circular note picker for a chromatic tuner + tone generator,
  with per-instrument string tunings.
- **Note Trainer** — drills random notes in an instrument's range. Has a mic-based "listen mode"
  (`lib/audioInput.ts`, `lib/pitchDetect.ts`, `lib/noteGrade.ts`) that listens through the
  microphone and grades correct/partial/incorrect, with a countdown ring and adjustable max-time
  per note. Once a note is graded, the same ring (plus a "Next note in Ns" readout,
  `components/CountdownLabel.tsx`) retargets to count down "Time between notes" instead (0–8s,
  a main Listen-mode control, not tucked in Advanced); an optional "Sound feedback" toggle adds a
  click each second of that countdown plus one the instant a note is graded, via
  `lib/clickEngine.ts`'s `scheduleClick`. Same mechanism as Scale Trainer's (see below), ported
  over afterward — `lockInResult` here is the equivalent of Scale Trainer's `lockInRound`.
  A lifetime "Struggles" side panel (`lib/struggleStats.ts`, shared with Scale Trainer — see
  below) tracks correct/partial/incorrect per note across every listen-mode session ever run
  (not reset between sessions, unlike the timed "History" list next to it), ranks them worst
  first, and a "Shed weak notes" button starts a focused session on just those — reuses the same
  queue machinery as "Drill every note" (`start()` takes a `StartRequest` —
  `{kind:"normal"|"weak"}` or `{kind:"string", stringIndex}`, all three driving the same
  `drilling`-gated code paths in `start()`/`advance()`) but sources its queue from
  `weakNotesInRange` instead of the whole range, forces listen mode on, and never writes to the
  timed History (a short focused run isn't a fair comparison against a full one). For a stringed
  instrument (`Instrument.strings` in `lib/instruments.ts` — bass4/5, guitar, ukulele, violin,
  viola, cello; mirrors the standard tuning already in `lib/tunings.ts` for the Tuner, which uses
  a separate instrument-id namespace and isn't reused directly) there's also a "Shed a string"
  button per string, same focused-session machinery again, queued from that string's own open
  note up to two octaves above it (clamped to the instrument's declared range — no fret-count
  data exists anywhere in the app, so this is a stated, adjustable assumption, not measured) —
  always shown and graded with the octave via `effectiveIgnoreOctave`, regardless of the "Ignore
  octave" toggle, since isolating one string is inherently octave-specific. That override is
  computed from `lastRequest` (which mode last ran) rather than `running`, so it also still
  applies to the results screen shown right after — but `start()` never reads it or the
  `ignoreOctave`-derived `rangeInput` directly for a string session (both are only current as of
  the last *completed* render, and `start()` needs values that are correct at the moment it's
  called, mid-render-cycle) — it recomputes both locally from the instrument's own declared range.
- **Scale Trainer** (`components/ScaleTrainer.tsx`, `lib/scales.ts`) — same shape as Note Trainer
  (shares its countdown ring, elapsed timer, advanced-slider, and note-spelling code — see shared
  conventions below), but drills scales instead of single notes: a random starting note plus a
  random mode from a selectable pool (`lib/scales.ts`'s `SCALE_MODES`, grouped into categories —
  the 7 major-scale modes, harmonic/melodic/harmonic-major, pentatonic/blues, the 7 melodic-minor
  modes, and the symmetric scales — with a sensible starter subset enabled by default). Listen
  mode expects the scale's notes in order, root to root; a wrong note fails the round (turns red)
  immediately by default. An optional "Partial credit" toggle (Listen mode → Advanced) instead
  gives each scale degree one retry — a second miss on the same degree still fails the round, but
  a degree that's missed once and then fixed lets the round finish as "partial" (amber) rather
  than "correct" (green), matching Note Trainer's correct/partial/incorrect grading
  (`GRADE_COLOR`/`GRADE_LABEL`/`Grade`/`scoreOf` now live in `lib/noteGrade.ts`, shared by both).
  The current round's note pills show progress live (matched/current-waiting-on-a-retry/failed)
  while it's running.
  "Drill every scale" plays every selected mode in all 12 keys (each with its own random octave)
  instead of a fixed count; a missed round is requeued with a freshly re-rolled octave rather than
  the identical one, so a repeated miss doesn't look like the same exact round stuck on screen. An
  "Ignore octave" toggle drops the octave number from every note shown (e.g. "C Dorian" instead of
  "C4 Dorian") **and** accepts the scale played in any octave — it's passed through to
  `gradePitch`'s own `ignoreOctave` option, not just a display flag. Once a round is graded, the
  same countdown ring (and a "Next scale in Ns" readout, `components/CountdownLabel.tsx`) retargets
  from "time left to play" to "time until the next scale", timed by the "Time between scales"
  slider (0–8s, promoted out of Advanced since it's a main control now); an optional "Sound
  feedback" toggle adds a click on every second of that countdown plus one the instant a scale is
  graded, via `lib/clickEngine.ts`'s `scheduleClick` (the same oscillator-click code the
  metronomes use) rather than a pitched note. Shares Note Trainer's lifetime "Struggles" panel
  (`lib/struggleStats.ts`) and "Shed weak scales" button, keyed by key *and* mode together (e.g.
  "F# Dorian" and "C Dorian" are tracked and shed separately, not lumped into one "Dorian"
  struggle) — the stat key folds a bare 0–11 pitch class and the mode id into one string
  (`scaleStatKey`/`parseScaleStatKey`), pitch class rather than a spelled letter so it survives an
  accidental-style change and doesn't care what octave it was played in. A weak session is one
  round per struggling key, built with `scaleRoundForPitchClass` for that exact key+mode rather
  than a random root of the mode — not the full `drillQueueForPool` 12-key-per-mode sweep "Drill
  every scale" does, so it stays quick and targeted on what's actually giving trouble.
- **Interval Trainer** (`components/IntervalTrainer.tsx`, `lib/intervals.ts`) — same shape again
  (same shared countdown ring/timer/note-spelling code), but drills the twelve intervals within an
  octave (minor 2nd through an octave, `lib/intervals.ts`'s `INTERVALS`, all enabled by default —
  a small enough set that a curated starter subset isn't worth the friction) instead of scales. A
  round is `{interval, direction, startMidi, notes: [start, target]}` — always exactly two notes,
  so `handleFrame`'s degree-by-degree grading loop is reused almost verbatim from Scale Trainer. An
  "Include descending intervals" toggle (Intervals panel) controls whether a round can ask for the
  interval *below* the starting note as well as above; off by default (ascending only). Listen mode
  has two distinct styles, both built on the existing "precompute the next round for preview" ref
  (`upcomingRef`) rather than any new state:
  1. **Fresh root each round** (default) — `randomIntervalRound` picks a brand-new random starting
     note every time, shown as e.g. "C4 ↑ Major 3rd".
  2. **Continue from previous note** (the "Continue from previous note" toggle, mutually exclusive
     with "Drill every interval") — `chainedIntervalRound` starts the next round exactly on the
     *target* note the previous round just ended on, so the interval is played relative to wherever
     the last one landed rather than a fresh root. The starting note is still always shown (e.g.
     "F#4 ↓ Perfect 4th") even though it's the same note as the previous round's target — a chain
     that hid it would leave no way to re-orient after a wrong note, since nothing on screen would
     say where you actually are. Falls back to a fresh random root if the chain runs out of range to
     continue in.
  "Drill every interval" works like Scale Trainer's "Drill every scale": every selected interval, in
  every selected direction, starting on all 12 keys, each its own random octave
  (`drillQueueForPool`); a missed round is requeued with a freshly re-rolled octave
  (`intervalRoundForPitchClass`) rather than the identical one. Shares the lifetime "Struggles"
  panel and "Shed weak intervals" button (`lib/struggleStats.ts`), but keyed by interval *and*
  direction together (`"M3:1"` = ascending Major 3rd, `"M3:-1"` = descending — `intervalStatKey`/
  `parseIntervalStatKey`), not by starting note, since an interval is the same struggle wherever
  it's started from. A weak session is one round per struggling interval+direction
  (`randomIntervalRound` with that single interval/direction forced), not the full drill sweep.
  An optional "Play interval out loud" toggle (quiz mode only, not listen mode) plays both notes in
  order, spaced out, instead of a single note like the other two trainers.
- **Guess the Interval** (`components/GuessTheInterval.tsx`, reuses `lib/intervals.ts` directly —
  no new lib file) — the first tool in its own **"Ear Training"** sidebar category (a new entry in
  `components/tools.tsx`'s `CATEGORIES`, between "Practice" and "Timing & Tuning"). Derived from
  Interval Trainer but inverted: it plays an interval (melodic or harmonic — a "Playback style"
  setting — via `lib/tones.ts`'s `playNote`) and the player picks which interval it is from a
  multiple-choice grid, instead of playing it back on an instrument through the mic. Because
  there's no audio input at all, it drops everything that only exists for pitch-listening (mic
  input, tolerance/hold-time/sensitivity, partial credit, ignore-octave, ignore-repeated-notes) but
  keeps the exact same *timing* machinery as Interval Trainer end to end — the countdown
  ring/label, "Max time to answer"/"Time between rounds" sliders, the sound-feedback countdown
  clicks, `roundCount`/"Drill every interval", and a timed "History" list keyed by a config only
  attempts with matching settings compare against — `lockInRound`/`scheduleAdvance`/`advance`'s
  finalize-then-pick-next state machine is copied over almost line for line, just with grading
  triggered by `submitGuess(id)` (a button click, immediately correct/incorrect — no partial
  credit, since there's no note-by-note sequence to retry) instead of `handleFrame`'s mic
  callback. A round is always shown as "?" until graded, then reveals the interval (e.g.
  "↑ Major 3rd", colored green/red) and, if "Reveal notes after answering" is on, the actual notes
  played (e.g. "C4 → E4"). "Include descending intervals" still exists (a round can play the
  interval below the start), but since guessing only asks "which interval", not "which direction",
  the answer grid and the lifetime "Struggles" stats (`lib/struggleStats.ts`) are keyed by interval
  alone — unlike Interval Trainer's interval-*and*-direction keying. A "Shed weak intervals"
  session's answer choices come from whatever's actually in that session's queue rather than the
  live pool selection, so a struggling interval that's since been deselected from "Intervals" still
  shows up as a valid answer instead of being an un-pickable correct answer.
  Two `react-hooks/purity` false positives (`performance.now()` inside `lockInRound`/`start`, both
  only ever reached from a button's `onClick`, never during render — the same ref-mutation timing
  pattern every other trainer uses) are suppressed with `eslint-disable-next-line` comments; the
  other trainers use the identical pattern but are large/complex enough that the React Compiler
  lint integration bails out of analyzing them before it would reach the same code, so only this
  smaller component's version gets (harmlessly) flagged.
- **Guess the Chord** (`components/GuessTheChord.tsx`, `lib/chords.ts`) — second tool in "Ear
  Training". Same timed-round shape as Guess the Interval (countdown ring, max time to
  answer/time between rounds, sound feedback, drill mode, timed History, lifetime "Struggles" +
  "Shed weak chords"), but plays a full chord instead of an interval, and grading is a typed text
  answer instead of a multiple-choice pick — there's no fixed candidate list to build (a real
  simplification vs. Guess the Interval's answer-choices bug the weak-session fix had to work
  around). `lib/chords.ts`'s `CHORD_QUALITIES` (33 qualities across 6 categories — Triads,
  Sixths, Sevenths, Altered dominants, Extensions, Sus & add, with a smaller starter subset
  enabled by default, same pattern as Scale Trainer's mode categories) is written in the *same*
  plain-text quality-suffix grammar iReal Pro itself uses (`^7`, `-7`, `h7` for half-diminished,
  `o7` for diminished, `+`, `#`/`b`, ...) — deliberately, so a chord here is typed and displayed
  exactly the way it'd appear on a Chord Charts chart. `prettyQuality` (the `^`/`h`/`o`/`#`/`b` →
  Δ/ø/°/♯/♭ substitution) moved from being a private helper in `ChordChart.tsx` to an export of
  `lib/iRealPro.ts` so both this bank and the chart renderer draw a chord the same way. Typing
  is graded, not chosen: `parseChordInput` (root letter + accidental, then a non-greedy quality
  capture, then an optional `/bass` — the same shape as `iRealPro.ts`'s own `CHORD_RE`/
  `splitMain`, just permissive about the quality text instead of a fixed char class) resolves
  freeform typed text like `maj7`, `m7`, `dim`, `sus4`, `Δ7`, `ø7`, `°7` against each quality's
  declared `aliases`, case/whitespace/punctuation-insensitively; grading
  (`chordInputMatchesRound`) then compares root pitch class + resolved quality id + slash bass
  pitch class (or both `null`) — enharmonic spelling doesn't matter, same as every other trainer
  here. Deliberately does *not* accept a bare `M7` for major 7: matching is case-insensitive, so
  there's no way to tell `M7` from `m7` apart once normalized, and `m`/`m7`/... for minor is by
  far the more universal shorthand, so that's the one bare-letter form supported — major relies
  on `maj7`/`^7` instead (documented both in a code comment on `ChordQuality.aliases` and in an
  always-visible on-page hint, since it's a real gotcha for anyone typing `M7` expecting major).
  What's typed renders live, formatted the same way (`formatChordParts` + `prettyQuality`), in
  the same spot the revealed answer appears once graded — so "proper formatted notation" is
  visible the whole time you're typing, not just after submitting. A chord's root is drawn from a
  plain register choice (Low/Mid/High/Wide MIDI ranges) rather than an instrument list — a chord
  isn't "played on an instrument" the way the other trainers' material is, so reusing the
  Instrument dropdown wouldn't mean anything here. Slash chords aren't restricted to real
  inversions: a "Chance of a slash chord" slider (0-100%) independently rolls *any* of the 12
  pitch classes as the bass, so it can land on an actual chord tone (a normal inversion) or a
  genuinely unrelated note (the "weird slash chords" the tool was asked for) with equal
  likelihood — `buildRound` voices that bass in the octave directly under the root. A round times
  out the same way an explicit answer works, not silently: `gradeAndReveal` (grades whatever's
  currently typed, or "incorrect" if empty/unrecognized) runs from *both* the "Submit"/Enter path
  and the max-time timer's `onTimeUp` callback, so running out of time still reveals the correct
  answer through the normal `lockInRound` reveal-and-countdown pause instead of just silently
  picking the next round — a deliberate departure from Interval/Scale Trainer's own timeout
  behavior (which doesn't reveal anything on a miss), made because losing an answer you were
  mid-typing without ever finding out what it was seemed like a worse loss here specifically.
  Struggle stats (`lib/struggleStats.ts`) are keyed by quality id alone (not quality-and-slash),
  matching Guess the Interval's keep-it-simple choice over Interval Trainer's fuller keying.
  A "Give the root" toggle (on by default) pre-fills the answer field with the round's root the
  instant it's shown — cursor placed right after it — so typing (and being graded on) is about
  working out the quality/slash bass by ear, not also having to name the root; switching it off
  clears the field instead, making the whole symbol, root included, something to work out.
  Leaving the prefilled root untouched and submitting reads as "just typed the root" (a bare
  major triad, the empty-quality default), which is correct only when the round genuinely is one.
  A small "keypad" of buttons sits above the answer field (visible whenever it is) for the
  symbols that are awkward to type, especially on a phone — minor `-`, major 7 `^`, diminished
  `o`, half-diminished `h`, augmented `+`, `#`/`b`, `/` (slash), `sus`, `add` — each key shows its
  `prettyQuality`-formatted glyph as the button face and inserts the plain iReal text at the
  field's current cursor position (not just appended to the end), restoring the caret right after
  it via a `requestAnimationFrame` (the DOM `<input>` doesn't have the just-set React state's
  value yet the same tick a key is clicked). Each key's `onMouseDown` prevents the browser's
  default focus-shifting-to-the-button behavior, so the answer field never visibly loses focus to
  a keypad tap at all.

### Tuner: record takes and look back at your intonation (2026-11-16, FB-8 / issue #11)

Feedback from a recording's page: "play recordings through the tuner, so you can look back on your
intonation". Jack: takes recorded in the Tuner are stored **locally**. Branch
`feature/tuner-recordings`.

- **Record** (next to Start listening): records a take from the Tuner's own input and starts
  listening too, so the needle follows you while it records (Stop ends the listening again if
  Record started it). One "Stop recording 0:12" button while it runs; Space stops it. Stopping
  saves the take as "Take N" and opens it.
- **Takes are on this device only**: IndexedDB `jam-practice-tuner-takes`, through
  `lib/fileLibrary.ts`'s `createLibrary` (now generic: each file can carry a `meta`, plus
  `setMeta`; the Slow Downer's library is unchanged). `lib/tunerTakes.ts` holds the store: length,
  where it came from (`take` / `file` / `recording`), download extension, and the worked-out pitch
  track. Not uploaded, not in the account, not counted in the 100 MB; no cap on how many. Never
  read on the server (the list loads in an effect).
- **Takes chip** (`components/tuner/TakesChip.tsx`, the `sidePanel` above the dial, like History
  elsewhere): play in the tuner, rename (`PromptDialog`), download (`<name>.<ext>`), delete
  (`ConfirmDialog`), and **Open a file** (audio from disk, up to 40 MB, saved like a take). The
  dialogs sit outside the popover (it closes when you click into them).
- **Playing a take through the tuner** (`components/tuner/useTakePlayback.ts`, `TakePanel.tsx`,
  `PitchGraph.tsx`): the take is decoded and played on the recordings' `TimelinePlayer` (seekable,
  unlike `<audio>` with browser-recorded WebM). The dial, cents bar and note readout follow the
  take at the playhead instead of the mic (the mic stops). Under the dial: Play/Pause, time, zoom
  (3–48 s, or "All" when the take is shorter; saved as `takeZoom`), the pitch graph and a summary
  ("6 notes · 3 in tune · 1 sharp · 2 flat · Average 0 cents"). The panel is wider than the dial
  column from `xl` (44rem, centred over it). The tuner's strings row hides while a take is open.
- **The pitch track** (`lib/pitchTrack.ts`) is worked out once for the whole take with the live
  tuner's own `detectPitch` (YIN), 30 ms steps like the live tuner, ~85 ms window. To be quick the
  audio is mixed to mono and brought down to ~24 kHz first (triangular low-pass, every 2nd sample
  at 48 kHz): 3 minutes take about 5 s in Chromium, done in slices so the page stays smooth
  (frames ≤ 33 ms apart while analysing and playing), and the graph fills in as it goes. Stored
  with the take (`PITCH_TRACK_VERSION`; bump it if the analysis changes), so reopening is instant.
  Readings are **chromatic** (nearest semitone) even when the live tuner snaps to an instrument's
  strings — for looking back at intonation that's what makes sense. The Sensitivity setting
  applies (per-frame RMS is stored). The needle holds 0.8 s through silence and smooths over two
  frames, like the live tuner.
- **Notes**: runs of frames on the same semitone (gaps up to 2 frames), each with its median
  cents; under 3 frames counts as short (drawn thin and muted, not labelled or counted). The graph
  draws each note's line without its first and last frame (they straddle the attack/release and
  read wild), labels note name (written pitch, so transposing instruments match the dial) and
  cents, shades the ±8 in-tune band, dashes ±25. Click/drag seeks (the view holds still while you
  drag, and stays there while the playhead is in it); otherwise it turns the page as the playhead
  reaches the edge. An overview strip of the whole take sits under it when the take is longer than
  the view. The graph is a focusable slider: ←/→ 1 s, Shift 5 s, Home/End.
- **Colours are theme tokens now**: `--tune-in`, `--tune-close`, `--tune-off` in `globals.css`
  (fixed green/amber/red as the fallback; with relative colours, off = `--danger` and the others
  are it turned to amber and green in OKLCH). The live dial and the background dock's tuner card
  use them too (they were hard-coded hex before), via `centsColor` in `lib/pitchTrack.ts`.
- **Open in Tuner** on a recording's page (`RecordingPage.tsx`): downloads the recording and keeps
  a **local copy** with the takes (one per recording: opening it again reuses the copy), then goes
  to `/tuner?take=<id>` (`app/tuner/page.tsx` passes `openTakeId`). A copy, not a pass-through, so
  it's in the takes list next time and its pitch track is stored.
- **Desktop**: `lib/tunerRecorder.ts` (web: `getUserMedia` on the Tuner's input + `MediaRecorder`)
  is aliased to `apps/desktop/src/native/tunerRecorder.ts`, which records through the native
  Recorder engine (`recorder_open` with the Tuner's input, mono mix, no auto gain → `recorder_begin`
  → `recorder_stop` → `recorder_take`, MP3). No Rust change. The native engine does one take at a
  time, so it refuses to start while the Recorder tool is recording (the Recorder would cut a Tuner
  take off if started during one — not guarded). Playback and decoding go through the Web Audio
  bridge like the recordings pages; IndexedDB works in WebKitGTK.
- **Privacy page**: says Tuner takes, opened files and Open in Tuner copies stay in the browser
  on this device.

Verified: `tsc` (web, desktop), `pnpm lint` (web: only the old SettingsBar warning; desktop),
`pnpm build`, desktop `vite build`. In headless Chromium with a fake mic playing a generated WAV
(A4 0, C5 −15, E4 +30, G4 +5, D5 −20 cents): recorded a take; the graph read exactly those cents
and the summary counted them right; playback moved the playhead and the dial (A4 → C5 …); a click
and a drag on the graph seeked; the take survived a reload; rename, download (an `.m4a`, which is
Opus in MP4 from Chromium), delete (closes the open take); Open a file read the WAV exactly; a
3-minute stereo file analysed in ~5 s, overview click to 2:00 worked, reopening took 0.2 s;
`?take=` opened a take. 1440 and 390, light, dark, Gruvbox and Synthwave colours: no console errors,
no horizontal overflow. In the real desktop window (Xvfb, private D-Bus, the existing debug
binary built from the same Rust, sound only into a null sink, a `pw-loopback` "mic" fed from it,
`SONIROLL_AUDIO_INPUT` set to it, the Tuner's input set to it too): Record → played the WAV into
the sink → Stop gave a 23.7 s MP3 take, analysed in about half a second with the same five
notes and cents; playback moved the playhead and the dial (C5 −14.7, E4 +30.1, G4 +5.7) and the
take's audio came out of the native output (recorded from the sink); Open a file (a Rhodes A2
sample, decoded by the bridge) read A2 +3.

Not verified: anything signed in — **Open in Tuner** on a real recording (the download, the copy,
the jump to the Tuner) wasn't run; audio by ear; Safari/Firefox recording and decoding (Safari
should pick AAC in MP4); real microphones; the desktop file chooser itself (the file was handed to
the input from a script); macOS/Windows desktop; the Recorder and the Tuner recording at the same
time on desktop.

### Tuner: pitch graph in the dial (2026-11-22)

Jack: an option to always show the graph, with live data, in the middle of the ring of notes.

- **Pitch graph** chip (`tuner-graph`, setting `dialGraph`, off by default): "Pitch graph in the
  dial". A band across the middle of the ring (`components/tuner/DialGraph.tsx`) shows the last
  5 s: cents sharp up, flat down (±50, clamped like the take graph), the ±8 in-tune band shaded,
  ±25 dashed, "now" at 86% across so the newest point isn't lost in the circle's edge, with a dot
  on it. Each run of frames on one note (broken by a gap over 0.12 s) is one line, coloured by its
  median with `centsColor`.
- **Live** it reads `getTunerHistory()` from `lib/tunerEngine.ts`: every accepted frame (after the
  two-frame candidate check), unsmoothed cents, kept 12 s, cleared when listening starts. It's not
  in the snapshot; the graph polls it on animation frames while listening, so the Tuner itself
  doesn't re-render per point. After Stop it holds what it last showed. With strings (not
  Chromatic) the cents are against the nearest string, like the needle, so a note far from a string
  sits on the band's edge.
- **With a take open** it shows the take's frames for the 5 s up to the playhead (chromatic, like the
  take graph).
- `TunerDial`'s `tight` prop: less padding inside the ring and the middle clipped to the circle (only
  then: clipping cut the long "Press Start…" hint without it). The readout is smaller with the graph
  (letter `text-4xl`, cents · Hz on one line, fixed `h-14` so the graph doesn't jump) and the hint is
  narrowed to 75%.

Verified: `tsc`, eslint on the changed files. Headless Chromium with a fake mic playing a WAV (A4 +5,
C5 −18, E4 +30, with a little vibrato), Chromatic: the graph drew green/amber/red lines at the right
heights, scrolled, held after Stop; recorded a take and played it: the graph followed the take. 1440
and 390, light and dark, no console errors or overflow; without the graph the dial looks as before.
Not verified: a real mic, the desktop app, how smooth it is on a slow phone (an SVG redrawn every
frame while listening).
