<!-- Moved word for word from the old single PROJECT.md (lines 1964–2077) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Guess the Progression, and side panels as chips (2026-10-13, web)

**Side panels are chips now.** `ToolLayout`'s `sidePanel` (History / Struggles / the Polyrhythm
metronome's Modulations log) renders as a row of setting chips just above the main display
(`TopChips`), not a hideable right-hand column; `sidePanelLabel` and `useSidePanelHidden` are
gone. History's chip shows the best time, Struggles the weak count. `SettingsBar`'s popover now
opens *below* its chip when there's more room underneath (it always opened above before).

**Guess the Progression** (`components/GuessTheProgression.tsx`, `packages/core/progressions.ts`,
shim `lib/progressions.ts`, route `/guess-the-progression`, Ear Training) — Guess the Chord's round
/ timer / history / struggles machinery, but it plays a progression and you type it. A
**Roman numerals / Chord names** switch sits above the chips. Numerals: the case says major or
minor and the suffix adds the rest the usual way (`ii7` = minor 7, `V7` dominant, `I^7` major 7,
`iih7` half-diminished, `viio` diminished, `bVII7`, `#io7`; `ii-7`/`iim7`/`Imaj7`/`IΔ7` also
accepted; `ii-V-I` with dashes splits correctly). Chord names: iReal-style symbols, with the first
chord's root prefilled. **Type chord qualities** off grades only degree/root plus major vs minor
(the numeral's case, or a `-` on a chord name). Grading is per chord: all right = correct, some =
partial. 29 progressions in 5 categories (Jazz, Pop & rock, Minor, Cadences, Blues; 9 on by
default), each written as a numeral string and parsed by the same parser that grades answers
(a bad spec throws at load). Chords are voiced around the tonic (bass on the root an octave below,
the rest packed into one octave above) so voices move by step. Settings: key (random or fixed),
register, play the key's tonic chord first, chord length, block/arpeggio, Piano/Rhodes, drill
(each progression once; misses come back in a new key). `lib/tones.ts` gained `prepareNotes` so
the whole progression's samples load before the first chord. Keypads: numerals I–VII / i–vii
plus ♭/♯ (or root letters C–B), the shared `ChordSymbolKeypad`, digits, next (space) and delete;
a numeral/letter key starts a new chord (adds the space itself). Settings key
`jam-practice-guess-the-progression`. Verified: a script over every progression (canonical
numerals and chord names grade fully correct, case/quality variants behave), `tsc`, `eslint`,
`next build`, and in nix Chromium at 1400 and 390 wide (keypad typing, a graded wrong answer,
chord-names prefill, the pool popover; no errors). **Not heard** (no audio in the sandbox).
**Web only** — the mobile app lists it but opens the "not migrated yet" placeholder.

### Ear-training Learn mode: levelled learning paths (2026-10-13, web)

Guess the Interval, Guess the Chord and Guess the Progression each have a **Practice / Learn**
switch above their chips (`learnMode` in each tool's synced settings). Learn shows a winding path of
levels (`components/learning/LearningPath.tsx`); each level adds new material on top of everything
before it, and Start plays the selected level: **10 rounds** (`LEVEL_ROUNDS`), about half on the new
items and half review (`levelQueue`), no requeueing, no History entry (Struggles still count).
**Pass at 80%** (`PASS_SCORE`, partial = half) to unlock the next; stars ★ 80% / ★★ 90% / ★★★ 100%,
best score kept. `components/learning/LevelComplete.tsx` is the result screen: confetti, stars
popping in, a fanfare in the tool's tone and "Unlocked: Level N" on a pass; "So close!" with how
many were needed on a miss. Earlier levels can be replayed for more stars.

- Levels are pure data in `packages/core/learningPath.ts` (shim `lib/learningPath.ts`):
  13 interval levels (P5+P8 → … → tritone, then "Going down" and "Both notes together", which set
  direction/harmonic via `intervalLevelOptions`), 14 chord levels (major/minor → … → 11ths/13ths;
  slash bass off; 9 rare qualities stay Practice-only), 16 progression levels (I–IV–V–I → … →
  "Everything else"; answer mode/qualities follow the tool's own settings). Progress is stored by
  level **id**, so levels can be reordered or added later.
- Progress: one synced key for all three, `jam-practice-ear-training-path`
  (`{interval, chord, progression}: {[levelId]: {best, passedAt}}`), via `lib/useLearningPath.ts`;
  per-tool state in `lib/useLearnSession.ts`.
- Shown on the **dashboard** ("Ear training path" card, `components/learning/EarTrainingProgress.tsx`;
  the weak-spots card now includes progressions too) and on **public profiles**:
  `profiles.getPublicByUsername` returns `earTraining` (per-tool levels passed / stars / next
  level via `summarizeLearning`, never raw scores), shown once at least one level is passed. The
  privacy policy says so. Pushed to the **dev** Convex deployment; prod gets it on the next deploy.
- Verified: a script over the level data (every item id exists, queues stay in the unlocked pool
  with ≥ half new), `tsc` (web, mobile, convex), `eslint`, `next build`, the dev query returning
  `earTraining` for a real public profile, and in nix Chromium: level 1 played and passed (Math.random
  pinned so every round was a P5) → 3-star celebration → stored progress → Next level → a failed
  attempt → back to the path → the dashboard card showing 1/13 and ★3; the path at 390 wide with no
  overflow in all three tools. **Not verified:** the fanfare by ear, and a signed-in round trip.
  **Mobile has no Learn mode yet** (progress made on web will be there to read when it does).

### Fixed: settings caches trimmed to whichever caller loaded first (2026-10-13, web)

`settings.history is undefined` in the ear trainers ("only sometimes"): the dashboard reads the
ear trainers' settings keys with stats-only defaults, and both settings caches
(`lib/usePersistedSettings.ts`'s localStorage store and the signed-in `syncedStore` cache used by
`lib/useSyncedSettings.ts`) stored whichever caller's *filtered* copy loaded first. Opening the
dashboard first handed the tool an object with only `chordStats`, and a setting change then
**wrote that trimmed object back**, dropping the tool's other settings and history. Both caches
now hold the whole stored object; each caller gets its own memoized view (`viewOf(raw,
defaults)`), and writes merge the patch into the whole object, so fields other callers (or a newer
app version) own are kept. Reproduced in nix Chromium (dashboard → Guess the Chord crashes on the
old code) and fixed (no crash; history and every other field survive a setting change). The
mobile app has its own hooks and reads each key in one place only, so it never hit this — but it
still trims to its own defaults on write, so a web-only field (e.g. `learnMode`) resets when mobile
saves that tool's settings.

### Mobile: Guess the Progression, Learn mode, and the settings-cache fix (2026-10-13)

The web changes above, ported to `apps/mobile`:
- **Guess the Progression** (`app/tool/guess-the-progression.tsx`) — same features and settings
  key as web. Playback is `lib/sampledTones.ts`'s new `playChordSequence`: downloads every chord's
  samples, then schedules the whole progression on the audio clock (cancellable), with slot
  highlights on JS timers alongside. Answers on `components/ProgressionAnswerKeyboard.tsx`, laid
  out exactly like the chart editor's keyboard (same rows/key sizes; numeral mode splits the roots
  row into I–VII + ♭ and i–vii + ♯; the bar-tools row is "I don't know" + Submit); numeral/root keys
  add the space between chords. Tab bar hidden on this screen; icon `stairs-up`.
- **Learn mode** in Guess the Interval / Chord / Progression: a Practice / Learn switch
  (`components/learning/ModeSwitch.tsx`) next to Options, `components/learning/LearningPath.tsx`
  (winding level nodes, pulsing current level, scrolls inside itself), `LevelComplete.tsx`
  (`Modal` with Animated confetti, springing stars, fanfare, Restart level / Next level), state in
  `lib/useLearnSession.ts` on the same synced key as web (`jam-practice-ear-training-path`). Same
  levels/rules as web (shared `packages/core/learningPath.ts`). Animated values are held with lazy
  `useState` — `useRef(...).current` trips the React Compiler's refs rule.
- **Options hidden while running** in all three (the Options button and mode switch disappear;
  a level pill shows during a learn level).
- **Progress shown** on Home ("Ear training path" section), the Profile tab, and public profiles
  (`u/[username].tsx`, from `getPublicByUsername`'s `earTraining`).
- **`lib/useSyncedSettings.ts` now caches the whole stored object** (each caller views it through
  its own defaults via `viewOf`, writes merge into the whole object) — same fix as web, so fields
  only the website knows (or another screen reading the same key) are no longer dropped when the
  phone saves.

Verified: `tsc` and `eslint` clean; in Expo web at 390 wide: typing ii → V → 7 → I on the keyboard
gives "ii V7 I", Submit grades and reveals per chord, the learn path renders, Home shows the new
section, and in Interval/Chord learn mode the Options button is hidden while running with the
level pill shown; no page errors. Release (preview) APK built — **not installed / not heard on the
phone yet**.


## 2026-11-18: no phone keyboard in Guess the Progression (FB-26)

The keypads type every possible answer, so tapping the answer box no longer brings up the phone's
keyboard: `onPointerDown` sets the input's `inputMode` to "none" for a touch tap (and back to "text"
for a mouse/pen), before focus, so the caret still shows and a hardware keyboard still types.
Guess the Chord keeps the keyboard: its keypad has no root letters. Not verified on a real phone
(headless Chromium has no on-screen keyboard).
