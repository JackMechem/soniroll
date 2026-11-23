### Rhythm Section (2026-11-16, web + desktop)

Feedback FB-11 / GitHub #27: "Combine bass, drum gen into one rhythm section box". Asked how, Jack
chose a new tool that replaces both Bass Genius and the Drum Generator in the sidebar, the old
links redirecting. Branch `feature/rhythm-section`.

`/rhythm-section` (Play along; `components/RhythmSection.tsx`, icon `BassIcon`): Play / Bass
players tabs as Bass Genius had. The Play tab is Bass Genius's properties panel (Tempo, Tune,
Style, Drums, Bass, Chords, Mix; the Options sheet on phones) with the Drum Generator's style
picker and groove options folded in. On the right: with a chart, Bass Genius's bass line card and
chart (side by side from `xl`) and a Drums card under them; with no chart, the Drums card alone
(style name, country, clave, the style's description, New groove), like the Drum Generator.

**The style decides the band** (`packages/core/rhythmSection.ts`, shim `lib/rhythmSection.ts`):
`bassFamilyOf(style)`.
- Swing styles (medium, up-tempo, jazz waltz — the ones with `DrumStyle.swing`) are Bass Genius
  as it was: the walking line (Computer walking / two feel, your bass players and the built-in Ray
  Brown, phrases or style), the tuned jazz drummer (`drumChorus`; Time / Comping, Drum settings),
  piano/Rhodes comping or held chords, the Swing setting (moved into the Style section, since it
  swings the drums and chords too).
- Every other style plays the Drum Generator's groove (`generateGroove`) and a simple bass part
  of its own that follows the chart, from `PATTERNS` (four-beat bars; 12/8 counts four dotted
  quarters): bossa (bossa nova, bachata, ijexá: root dotted quarter, fifth on the "and" of 2 held
  through 3, and on the "and" of 4 a push into the next chord when it changes), samba (samba,
  partido alto, samba-reggae: root, then the fifth below as the "a" pickup and on beat 2, twice a
  bar), baião (baião, xote: root, fifth, octave in the zabumba's dotted-eighth figure), tumbao
  (mambo, son montuno, songo, guaguancó, conga, Mozambique: nothing on 1, the "and" of 2 and beat
  4, each taking the next chord — the 4 rings over the bar line), half (cha-cha-chá, danzón,
  bolero: root on 1, fifth on 3), march (frevo, plena: root and fifth on every beat), merengue (the
  same plus a push on the "and" of 4), cumbia (root on 1, fifth on 3 and 4), 3-3-2 (calypso,
  soca, milonga: root, fifth, octave), tango (marcato eighths on every beat, root and fifth,
  1 and 3 accented), 6/8 (bembé, Afro-Cuban 6/8: root and fifth on the dotted quarters, a push on
  the last eighth), and the shuffle a shuffle line (root, 3rd, 5th, 6th, 7th, 6th, 5th, 3rd,
  counted from where each chord starts). Rules shared by all: a new chord always starts on its
  root (the slash bass if there is one); an off-beat note before a chord change takes the new
  chord and is tied into the note it anticipates (that one isn't struck again); N.C. rests; roots
  stay E1–G2 near the last root; the last bar of the last chorus is a held low root; bars that
  aren't four beats get root on 1 and fifth halfway. Everything goes through `makePlayable`. Your
  bass players only play the swing styles (the player picker shows only there; a line says what
  the style's part is otherwise). These styles hold the chords (the Comping / Held switch is for
  swing). Kept modest on purpose — worth checking by ear.
- The bass can be turned off (setting `bass`). With no chart (source "none", or "A chart" with
  none picked, or typed chords that don't parse) bass and chords are off and the drums play alone.
  With no style ever picked, the style is Medium swing (Jazz waltz for a 3/4 chart) when there's a
  chart and Bossa nova when there isn't.
- "Swing with comping" isn't in the picker; a saved one reads as Medium swing with comping on.
- A groove in another meter than the chart (bossa over a waltz) plays the start of each of its
  bars (a note under the Style section says so); a longer chart bar repeats it. Swing styles
  follow the chart's meter themselves (`drumChorus` works on the real beats), and their notation
  is drawn in the chart's meter.

**One engine, one clock** (`lib/rhythmSectionEngine.ts`, replacing `bassGeniusEngine.ts` and
`drumGeneratorEngine.ts`; `swingPoint`, `drumSwingPoint`, `previewChorus` moved there). It writes
a chorus at a time a chorus ahead — the chart's form, or 8 bars with no chart (`GROOVE_BARS`,
`grooveBeats`) — bass, both comping lists and both drum lists (`chorusDrums`: just time / comping;
the same for groove styles), and schedules all of it from one anchor (tempo changes re-anchor). Each
chorus keeps the state it started from (`Chorus.snap`), so `setGroove` (a new style or groove
option) can rewrite from the next bar line: it drops everything not yet played from the cut and
writes the affected choruses again, each from where the one before now ends — the bass, chords and
drums switch together at a bar line. With no chart the bars after the cut follow the new style's
meter (the chorus is cut short there and new ones are written). Swing (eighths moved late) applies
only where the style is a swing one (`walkingFrom` records where the family changes); groove styles
are straight. Groove hits are loosened by Human feel, the swing drummer's by Drum settings' timing.
The count-in is the closed hi-hat with drums on, the click without. The whole kit (`ALL_VOICES`) is
loaded whenever drums are on. The previews (stopped) use the same seeds Play uses: `seed` for the
bass line ("New line"), `grooveSeed` for the drums ("New groove"); `chorusSeed` derives each
chorus's seeds.

**Notation:** the bass line card as before; `chorusToTranscription` now ties a note held over the
bar line into the next bar (the pushes), instead of cutting it at the bar line. The Drums card
shows 8 bars: stopped, the first 8 Play will play; playing, the 8-bar window the music is in (the
engine reports each chorus's drum bars, `onDrums`; `position()` gives the bar for lighting the
drum being heard, `.drum-now`). Kit pieces, faders and the key under the staff moved to
`components/rhythmsection/kit.tsx`. `DrumScore` was fixed the same day: a bar of 16ths with a fill
ran past its bar line (pre-existing in the Drum Generator) — bar widths in a row now follow how
much each bar holds, and it redraws with fewer bars a row if a note still lands past a bar line;
at one bar a row (a phone) a bar still too busy is drawn wider and scaled down to fit. Checked: 15
styles × 3 seeds, every notehead inside its own bar at 1440 and 390 wide.

**Settings — nothing moved, nothing lost.** Two keys, as before:
- `jam-practice-bass-genius` (tune, bass, chords, swing drummer, mix): new fields `bass` (default
  on) and source `"none"`; `drums` now defaults to on (stored "off" stays off; an old "brushes"
  counts as on); `bpm` defaults to 0 = never set.
- `jam-practice-drum-generator` (groove): `style` defaults to "" = never picked; tempos per style
  (now for every style, also with a chart — the swing styles fall back to Bass Genius's `bpm` until
  one is set); clave/cross-stick/woodblock/hand per style; fills, variation, human feel; kit
  faders. Its `volume` and `room` are no longer read (Mix's Drums and Room are Bass Genius's
  `drumsVolume` / `roomAmount`). Count-in is on only if both keys' `countIn` are; changing it sets
  both.
- The panel's open/closed sections still use `jam-practice-bass-genius-panel`.

**Old hrefs** (`RETIRED_TOOL_HREFS` + `currentToolHref` in `packages/core/navLinks.ts`,
`findToolLink` in `components/tools.tsx`): `/bass-genius` → `/rhythm-section` (`?tab=players`
carried over and opens the Bass players tab), `/drum-generator` → `/rhythm-section?play=drums`
(sets "No chart"; the query is then dropped with `history.replaceState`). Redirects in
`next.config.ts` (not permanent) and the desktop router's `redirectFor`. Saved data keeps the old
hrefs and is read through the map: Shed Log sessions and attachments and shared routines show the
Rhythm Section icon (sessions keep their saved title, "Bass Genius"), tool usage
(`withRetired` in `lib/toolUsage.ts` folds the old tools' days into Rhythm Section's streak and
totals, read-only; Log marks the old tools' day logged too), recents and favorites (mapped and
de-duplicated; unstarring removes the old href too), hidden tools (`isToolHidden`: Rhythm Section
is hidden if it is, or if both old tools were), split-screen panes (the old hrefs open Rhythm
Section), admin analytics labels, `/help?topic=bass-genius|drum-generator`. Tool time is counted
under `/rhythm-section` (in `LOG_BY_BUTTON` and `PLAIN_OPTIONS`).

Also: help topic `rhythm-section` (options for Tune, Style, Drums, Bass, Chords, Mix, Bass players)
with new shots `public/help/v3/rhythm-section-{light,dark}.jpg` (the old two removed), the
credit line by the title ("Bass idea and built-in transcriptions by Rob Moreno") and /credits
("Rhythm Section's bass", "Rhythm Section chords", "Rhythm Section drums"), user-facing "Bass
Genius" strings in the Bass players tab, Score Writer and the transcription file errors, the
desktop route (inside `NativeTool`), the mobile icon map (`/rhythm-section`; mobile is paused,
nothing else). No Convex change (bass players' tables and functions are unchanged).

Verified: `tsc` (web, desktop, mobile; core's only errors are the existing `lessonFiles.ts` `.at`
ones), `eslint` (web — one existing warning in `SettingsBar.tsx` —, desktop), `next build`. By
script (`node --experimental-strip-types` with a resolver for extensionless imports): every style
family over typed progressions (ii–V–I, two chords a bar, N.C., slash chords, 3/4) — every note a
chord tone of its chord or of the chord it pushes into, every chord change gets its root, notes in
order, E1–G3; every family over all 1,460 tunes of Jack's iReal playlist × 2 choruses (4.2 million
notes, no errors, none out of range, none dropped by `makePlayable` at 160 BPM, ~2 s); drums for
every style over the typed charts (hits inside their chorus, sorted, one notation bar per bar) and a
sample of 400 tunes; written-out bass bars never overfull. In nix Chromium (signed out): drums only
(bossa, samba, swing, waltz, shuffle, bembé, tango, mambo, merengue; Play, switching style while
playing, the playing drum lit), typed chords (bossa then swing then mambo while playing, comping,
piano, bass off), real charts seeded into the local library through the chart picker (Blue Bossa
with bossa nova, Someday My Prince Will Come with swing in 3/4), Ray Brown's phrases on swing and
hidden on son montuno, every sound (bass, piano, drums) starting on one 16th-note grid for 9 s
(within ±16 ms but the piano's deliberate finger spread), the redirects, old usage stats / recents /
hidden tools, 1440 and 390 wide, light and dark, the Options sheet, no console errors or horizontal
overflow. **Not heard** — the style bass parts especially need Jack's ears. Not checked: signed in
(Shed Log entries, favorites, synced settings), the desktop app running, a real phone.

## 2026-11-18 — The Rhodes taken out (licence)

jRhodes3d (Jeff Learman) is CC BY-NC 4.0, and soniroll now sells storage plans, so Jack had it
switched off until he has permission. `lib/compSounds.ts`: `CompInstrument` is just `"piano"` (the
Rhodes sample table and trims removed); `public/samples/rhodes/` deleted (29 mp3s, so it's neither
served by the site nor bundled into the desktop app). Rhythm Section's Chords are Off / Piano; a
stored `chords: "rhodes"` (settings or a preset) plays the piano. Credits, help and PROJECT.md
updated. To bring it back: restore the files and code from git history before this change.
The ear trainers' "Rhodes" tone is a different set (FluidR3 "Electric Piano 1", CC BY 3.0, from
GitHub Pages) and stays.

## 2026-11-18 — No auto-scroll

Jack found it annoying: while playing, the page no longer scrolls to keep the bass's playing note in
view (`scrollIntoView` removed); the note is still lit (`bass-now`). The drum notation still turns to
the next window of bars as it plays (that swaps the bars shown, it doesn't scroll).

## 2026-11-23 — The Rhodes is back (CC BY), and it's the one Rhodes everywhere

Jeff Learman relicensed jRhodes3d (and jRhodes3c) **CC BY 4.0** (attribution only; the repo's
LICENSE now reads "License for samples: CC BY / everything else: CC0"), so Jack had the real Rhodes
brought back and used as the Rhodes in every tool.

- **Samples:** the 28 mp3s restored from git (`git checkout 9d28186^ -- apps/web/public/samples/rhodes`)
  plus 11 new ones converted the same way from the repo's mono FLACs (pinned commit `4508215a`):
  29/35/40 (F1, B1, E2) layers 2–4 and 96 (C7) layers 2 and 4 — so the set runs F1–C7 (MIDI 29–96;
  the instrument is E1–E7), 39 files, 3.2 MB. The recipe, worked out by matching the old files byte
  for byte in size: `ffmpeg -i A_045__A2_3.flac -t 8 -af afade=t=out:st=6.5:d=1.5 -ac 1 -c:a libmp3lame
  -q:a 2 45_3.mp3`. `LICENSE.txt` there says CC BY 4.0 with the credit line.
- **Layer numbering was backwards.** jRhodes3d's sfz maps layer **1 to the hardest** velocities and
  **5 to the softest** (4 = vel 61–84, 3 = 85–103, 2 = 104–119); the README says the higher
  velocity layers have "substantial bark". The old `LAYER_VELOCITY` treated 2 as soft and 4 as
  loud, so soft comping played the barky samples. Now `rhodes: { 4: 0.3, 3: 0.55, 2: 0.8 }` (web and
  phone). Comping velocities are 0.15–0.9, mostly ~0.4, so most chords use layer 4 now — it will
  sound rounder than what Jack heard before 11-18.
- **Rhythm Section (web and phone):** Chords Off / Piano / Rhodes again; the chip says "Rhodes ·
  comping/held"; a stored `chords: "rhodes"` plays the Rhodes again. `compSounds.ts` as before
  (A2–D6 table, trim 0.85, 0.25 s release). Help (`packages/core/helpContent.ts`) says piano or Rhodes.
- **The trainers' Rhodes tone** (Guess the Interval/Chord/Progression, Find the Root, Note/Scale/
  Interval Trainer's play-out-loud, Practice Timer's chime — everything through `lib/tones.ts`) was
  FluidR3 "Electric Piano 1" from GitHub Pages; now it's jRhodes3d from `/samples/rhodes/`
  (`lib/sampledTones.ts`). No velocity there, so every note is **layer 4** (medium-soft, the only
  layer on every key, so one timbre top to bottom), nearest sample pitch-shifted. The files are
  normalized ~18 dB hotter than the Salamander mp3s, so the set has `gain: 0.15` (measured: Rhodes
  layer 4 mean ≈ −8 to −15 dB over the first 1.5 s vs the piano's ≈ −25 to −36 dB). The trainers do
  go low (Guess the Chord's Low register is MIDI 36–47 with slash basses an octave under; Guess the
  Interval played an F1 sample in a test), which is why the low samples were added: nothing is
  shifted more than ~3 semitones inside F1–C7.
- **Phone:** `src/lib/rhodesSamples.ts` bundles the 39 files with `require` from the website's folder
  (like `uprightBassSamples.ts` and `drumSamples.ts`), so the Rhodes plays offline and doesn't wait
  for a deploy; `sampledTones.ts` (layer 4, gain 0.15) and `compSounds.ts` (layers 4/3/2) use them.
  `SampleNote` now carries a cache `key` and a `src` (URL or asset).
- **Desktop:** nothing to change — its `publicDir` is `apps/web/public`, so the folder is served in
  dev and bundled in release, and the Web Audio bridge decodes the mp3s in Rust as before.
- **Credits** (`/credits`): jRhodes3d by Jeff Learman (1977 Rhodes Mark I Stage 73), CC BY 4.0,
  served by soniroll; the FluidR3 credit is gone (nothing uses it now). Privacy: GitHub Pages now
  serves only the piano samples. PROJECT.md's licence rule updated; the "sort out the Rhodes before
  charging" items in `storage-plans.md`, `support-and-donations.md` and `ux-refresh.md` marked done.

Verified: tsc (web, mobile, desktop; core's only errors are the existing `lessonFiles.ts` `.at`
ones), eslint on the changed files; every file in `/samples/rhodes/` answers 200 from the dev
server; in headless Chromium (signed out) Rhythm Section with typed chords and Rhodes loaded all 26
comping samples (200) and played without console errors, the Chords panel shows Off / Piano /
Rhodes at 390 wide (dark), Guess the Interval and Guess the Chord (Low, slash basses) with the
Rhodes tone fetched `29_4`, `35_4`, `40_4`, `45_4` (200) with no errors. **Not heard** — the level
match (0.15) and the layer swap need Jack's ears. Not checked: the phone app on a device or
emulator (only tsc/eslint), the desktop app running, signed in.
