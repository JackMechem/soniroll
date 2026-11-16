<!-- Moved word for word from the old single PROJECT.md (lines 2580–2675) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Drum Generator (2026-10-16, web)

`/drum-generator` (Drummers; `components/DrumGenerator.tsx`): a drummer on the same Virtuosity
Drums kit Bass Genius uses, no other instruments, playing 17 styles, written out as it plays.
- **Kit** (`lib/drumSounds.ts`): new voices `hhClosed`, `hhOpen` (choked by the next closed or pedal
  hit), `crossStick`, `rimshot`, `tomHigh`, `tomLow`, `cowbell`, `block` (woodblock for clave) — 65
  new mono mp3s in `public/samples/drums/sticks/` (`hhc_*`, `hho_*`, `xstick_*`, `rim_*`, `htom_*`,
  `ltom_*`, `cowbell_*`, `block_*`; same CC0 release incl. its aux percussion; kit folder now 1.8 MB).
  `loadDrums`/`drumsReady` take an optional voice list (`ALL_VOICES`); Bass Genius still loads only
  its six voices. Trims set from measured peaks.
- **Grouped by country** (follow-up the same day): `DrumStyle.country` (`COUNTRIES`: United States
  (jazz), Brazil, Cuba, Puerto Rico, Dominican Republic, Colombia, Trinidad and Tobago, Argentina)
  replaced the swing/Latin/Afro-Cuban families, and 15 styles were added (32 in all): Brazil —
  partido alto, samba-reggae, ijexá, frevo, xote; Cuba — son montuno (martillo, bell in the
  montuno), danzón (baqueteo: quarters | cinquillo), conga (comparsa); Puerto Rico — plena;
  Dominican Republic — merengue (güira gallop, tambora on cross-stick + floor tom, jaleo variation),
  bachata; Trinidad and Tobago — calypso, soca; Argentina — tango (marcato, arrastre), milonga
  (3-3-2). Text sources for these were thin (Soundbrenner on merengue's güira/kick layout, the
  cinquillo, the milonga's 3-3-2, the partido alto figure); the rest are standard drum-set
  adaptations reconstructed from how each style's percussion is played — worth checking by ear.
- **Styles** (`packages/core/drumStyles.ts`, shim `lib/drumStyles.ts`): Swing — medium, with comping,
  up-tempo, jazz waltz (all through Bass Genius's `drumChorus`, so the ride feel is the tuned one),
  shuffle (12/8); Latin — bossa nova, samba, baião, cumbia; Afro-Cuban — mambo, cha-cha-chá, songo,
  Mozambique, guaguancó, bolero, bembé (12/8), Afro-Cuban 6/8. Each pattern style is a 1- or 2-bar
  cycle of lanes on a step grid (`X x o g .`), with weighted variations a drummer moves between;
  clave styles have a 3-2 / 2-3 switch (the cycle's bars swap) and "Clave on the woodblock". Fills
  every 4/8/16 bars (last beat or two on snare/toms, landing on crash + kick). Grounded in:
  Wikipedia's clave pulse grids (son, rumba, bossa, the 6/8 bell), Soundbrenner (cáscara, baião),
  danceintime (mambo bell counts), Drumeo (cha-cha bass drum on 2& 4&), Wikipedia's songo and
  Mozambique articles (NY bell = songo stick pattern minus beat 3; right hand on the main beats,
  left on offbeats), Cruise Ship Drummer / DrumHelper / Mixdown (kit orchestration). Most method
  books publish notation as images, so several parts (Mozambique bell, songo left hand,
  guaguancó toms, bolero) are standard-adaptation reconstructions, not transcriptions.
- **Engine** (`lib/drumGeneratorEngine.ts`): 8-bar blocks written ahead (`generateGroove`, seeded;
  block 0 uses the page's seed so Play plays the preview); tempo live; a style/option change
  rewrites from the next bar line; swing skip notes at `drumSwingPoint` (the queue is ordered by when
  a hit sounds — `order`, a skip ≈ beat + 0.5 — after a bug where a skip queued in written order held
  the hi-hat and bass drum back 20–85 ms behind the ride; measured 0 ms now in all four swing styles,
  bar the deliberate 15 ms lay back of a "lang"); humanize (shared timing
  offset per moment, level variation); count-in on the closed hi-hat.
- **Notation** (`components/drumgen/DrumScore.tsx`, VexFlow): percussion staff, hands stems up,
  feet down, x / circled-x (cross-stick) / diamond (ride bell) / triangle (cowbell above the
  staff, woodblock low) heads, accents and the open-hat "o" above, ghosts bracketed; 16ths in 4/4,
  eighths in threes in 12/8, swing in straight eighths. The playing note is lit (`data-at`, rAF).
  Stopped, it shows the 8 bars Play will play; "New groove" re-seeds.
- **Timekeeping, cross-stick and woodblock choices** (Feel; per style, settings `hands`,
  `crossSticks`, `blocks`): the right hand stays on the style's own instrument by default
  (variations that switched hi-hat ↔ ride ↔ cowbell no longer fire); pick Hi-hat / Ride / Ride
  bell / Cowbell to keep it on one, or **Automatic** for the old moving-around. The cross-stick
  plays the style's own part, a son / rumba / bossa nova clave (6/8 clave in 12/8), or nothing;
  the woodblock plays nothing, the style's clave, or any of them. A clave direction switch appears
  whenever a 2-bar clave is in play. Core: `GrooveOptions` `{crossStick, block, hand}` (replacing
  `claveOnBlock`, still read as "style's clave on the woodblock" when set), `claveKindsFor`,
  `mainTimeVoice`, `resolveClave`, `claveDirectionMatters`. A layer on the instrument the hand moves
  to (ijexá's shaker on the hi-hat) gives way. Checked by script over every style (default never
  changes instrument; a chosen one is the only one; claves land on their strokes both ways round)
  and in nix Chromium.
- **Kit faders** (Mix → Kit): one per part — bass drum, snare (+ rimshot), cross-stick, hi-hat
  (closed + open), hi-hat foot, ride (+ bell), crash, toms, cowbell, woodblock — showing only the
  parts the current style plays; labelled in dB (0 dB default, +6 dB top, bottom = off),
  double-click resets one, "Reset kit" all. Setting `parts` (fader 0–1, 0.5 = unity, missing =
  unity). It's a gain (`playDrum`'s new `gain` argument, `setVoiceGains` live), so the velocity
  layer — the sound of the stroke — doesn't change. Bass Genius is unaffected.
- Page: Play under the title, side panel (Tempo, Style by family, Feel: clave/woodblock/fills/
  variation/human feel/count-in, Mix), phones get the Options sheet. Settings key
  `jam-practice-drum-generator` (tempo and clave remembered per style). Credits updated.
- Verified: a script over every style (lane lengths, clave alignment, fills, swing/waltz output),
  `tsc` (web, mobile, core), `eslint`, `next build`, and in nix Chromium: all 17 styles drawn,
  playback with every new sample loading (no 4xx), notes lit while playing, switching style mid-play,
  phone width + options sheet, no console errors. **Not heard.** Mobile: listed, placeholder screen.

### Syncopation (2026-10-17, web)

`/syncopation` (Drummers; `components/Syncopation.tsx`): random 16-bar snare reading exercises,
four 4-bar lines, over a steady part underneath, written out (VexFlow, `components/syncopation/
SyncopationScore.tsx`) and played on the Drum Generator's kit. Each beat is a figure drawn from the
rhythm families switched on — quarters (plus half notes/rests on beats 1 and 3), eighths, sixteenths
(incl. dotted eighth/sixteenth), eighth-note triplets — with a Rests switch. Lines: a new bar every
bar (the last bar ends on a quarter rest), a 2-bar pattern ×2, or one bar ×4. Underneath: bass drum
on every beat, bass drum in unison with the snare, hi-hat foot on 2 & 4 or every beat, bass drum +
hi-hat foot, or nothing. Playback: hear the snare part (off = read against the feet), hi-hat click,
count-in, and after the 16 bars go on to a new exercise / play it again / stop. Generator is pure
and seeded (`packages/core/syncopation.ts`, shim `lib/syncopation.ts`; 12 ticks a beat); engine
`lib/syncopationEngine.ts` schedules a bar at a time so option changes land on the next bar.
**Played on: Snare / Snare and bass drum** (setting `split`): each note of the pattern goes to the
snare or the bass drum at random (`SyncopationBar.kicks`, seeded; never both at once, at most three
in a row on one, both in any bar of 2+ notes; a repeated bar keeps its choice). Underneath also
offers a hand hi-hat on eighths or every beat (`hhEighths`/`hhQuarters`; on a triplet beat the
"and" moves to the last triplet); with the split the feet options are hidden and fall back to
hi-hat eighths (`effectiveOstinato`). With a hand hi-hat the hi-hat is written stems up above the
staff and the pattern stems down below it. Settings key `jam-practice-syncopation`. Don't name the source these exercises were modelled on
anywhere in the site or code (Jack's request — it's still under copyright). Verified: a script over
every family/rests/line combination (every bar fills 48 ticks, only enabled families, no rests when
off), `tsc`, `eslint`, `next build`, and in nix Chromium (all ostinatos, line modes, playback
lighting the notes, 390 px, no errors). **Not heard.** Mobile: listed (placeholder screen).


**Now part of Rhythm Section (2026-11-16):** the Drum Generator and Bass Genius became one tool,
`/rhythm-section` (`/drum-generator` redirects to `/rhythm-section?play=drums`, which plays the drums
on their own). Its styles, groove options and kit faders are Rhythm Section's Style and Drums
sections; settings still live under `jam-practice-drum-generator`. `lib/drumGeneratorEngine.ts` was
replaced by `lib/rhythmSectionEngine.ts`; `DrumScore` now fits a busy bar (a fill no longer runs past
its bar line). See `rhythm-section.md`.
