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
