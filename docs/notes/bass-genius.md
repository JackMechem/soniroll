<!-- Moved word for word from the old single PROJECT.md (lines 2078–2579) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Bass Genius (2026-10-13, web)

`/bass-genius` (Practice; `components/BassGenius.tsx`): pick one of your chord charts
(`useChordChartsLibrary`, signed in or out) and a sampled jazz upright plays a bass line over it,
with the playing bar highlighted (`ChordChart`'s new `activeBar` prop). A **Bass player** selector
is there for the planned "play like Ray Brown" players; only **Computer** exists so far
(`BASS_PLAYERS` in `packages/core/bassLine.ts`). Walking in 4 or two feel; tempo + tap; Form
(choruses or keep going, count-in); Key (transposes chart and line); Sound (touch soft/medium/strong
= different velocity layers, volume, room reverb); a hi-hat-style click on 2 & 4. Settings key
`jam-practice-bass-genius`.

- **Sound:** Karoryfer "Meatbass" pizzicato (CC0; 1958 Otto Rubner bass, D. Smolken), from
  `github.com/sfzinstruments/karoryfer.meatbass`: 14 pitches A0–C4 every minor third (max ±1
  semitone shift) × 4 velocity layers × 4 round robins = 224 files, converted to mono VBR mp3
  (`-q:a 0`, ~59 dB SNR vs the 24-bit WAVs) in `apps/web/public/samples/upright-bass/` (~5 MB,
  served by the site itself). `lib/uprightBass.ts` downloads/decodes them all on the first Play
  (progress shown), trims any decoder padding at load (onset detection), never repeats a take
  twice in a row, releases notes with a finger-mute fade, and runs through a light compressor and
  a generated room impulse (identical in both ears from a fixed seed — independent random L/R
  channels made the bass sit left of centre; measured L/R now 0.00 dB). Also checked: same bass/player as Sneakybass and D. Smolken's
  double-bass set (both CC0) — Meatbass has the most dynamics. Its 8 percussive noises
  (`perc1–8`, not copied) could become dead notes later.
- **The line** (`packages/core/bassLine.ts`, shared): `chartHarmony` (per-beat harmony; "%", 2-bar
  repeats, held chords, 2–3 chords a bar, N.C.), `playbackOrder` (repeats with N1/N2/N3, then on the
  last chorus D.C./D.S., al Coda via the two Q markers, Fine, "al 2nd/3rd ending"), and
  `generateChorus` (targets on each chord's downbeat — root/slash bass, a 3rd/5th when a chord is
  held into a new bar — placed near a slowly drifting register goal; a beam search fills the
  beats with chord/scale tones and an approach note — chromatic, scale step or the target's fifth;
  occasional triplet skips; two feel = half notes + occasional pickups; final chorus ends on a
  held low root). Qualities map to scales in `analyzeQuality` (dorian, mixolydian, altered,
  half-whole, locrian ♮2, ...). Seeded RNG, state carried between choruses.
  `lib/bassGeniusEngine.ts` schedules it a chorus ahead on the audio clock (tempo changes live).
- Verified: the generator over all 1,460 tunes in Jack's playlist (no errors, every note E1–G3,
  ~75% of moves are steps), playback order on real D.C./D.S./coda/3rd-ending charts, `tsc` (web,
  mobile, core), `eslint`, `next build`, and in nix Chromium: samples load (224 requests),
  count-in, bar highlight following at tempo, audio actually reaching the output (peaks 0.2–0.6),
  Stop, 390 px with no overflow. **Not heard by a person yet.** **Web only** — the mobile app lists
  it (icon `music-clef-bass`) but opens the "not migrated yet" placeholder.

**Typed progressions (same day):** a "One of my charts / A progression I type" switch. Typed text
(`packages/core/typedProgression.ts`, `parseTypedProgression`) mixes chord names (Dm7, Cmaj7, F#ø,
Bb7/D, C7#9 — everyday spellings normalized to iReal suffixes and checked against a quality grammar)
and roman numerals in a chosen key (ii7, V7, Imaj7, bVII7, #ivo7, secondary "V7/ii"; lowercase =
minor; "ii-V-I" dashes split), "|" between bars (none = a bar per chord), "%" repeats a bar, N.C.
Unknown tokens are listed. Key + 4/4 or 3/4, five presets (ii–V–I, minor ii–V–i, I–vi–ii–V, jazz
blues, rhythm changes A); settings `source`/`typedText`/`typedKey`/`typedMeter`. Editing while it
plays takes over from the next chorus (`BassGeniusRun.setSong`). Verified with a parser script and
in nix Chromium (play, mid-play edit switching at the next chorus, unknown tokens, presets, 390 px).

**Bass players + a notation editor (same day):** Bass Genius has **Play / Bass players** tabs
(settings `tab`). Bass players (`components/bassgenius/BassPlayersTab.tsx`): add/rename/delete
players (with a description), each with transcriptions; import/export JSON. Signed in it's the
account (`packages/convex/bassPlayers.ts`, tables `bassPlayers` + `bassTranscriptions` — one row per
transcription, `data: v.any()`, title/measureCount copied out for lists; deleting a player deletes
its transcriptions; account deletion cascades; **dev deployed only**); signed out it's this browser
(`lib/useBassPlayers.ts`'s own small localStorage store, key `jam-practice-bass-players`).
**Nothing uses the transcriptions yet** — the plan is for Bass Genius to analyse a player's
transcriptions and walk new changes in their style, so the format is built for that.
- **Format** (`packages/core/bassTranscription.ts`, shared): `Transcription` {title, tune, source,
  tempo, comments, timeSignature (4/4 only for now), measures[{id, chords[{beat, symbol}], notes[]}]};
  a note is {id, value w/h/q/8/16, dots?, triplet?, tie?, ghost?, pitch? {step, alter, octave}
  (sounding, E1 = open E), midi? (sounding MIDI, kept in sync)}; no pitch = rest. Chord symbols are
  normalized iReal suffixes ("D-7", "G7b9") at a beat. `timeline()` gives every note's start/length
  in ticks (48/quarter) with the chord sounding — the hook analysis will start from. Files:
  `{format: "sheddex.bass-transcription", version: 1, exportedAt, player: {name}|null,
  transcription}` and `{format: "sheddex.bass-player", version: 1, player: {name, description},
  transcriptions: [...]}`; `readImportFile`/`cleanTranscription` validate untrusted JSON.
- **Editor** (`components/bassgenius/TranscriptionEditor.tsx` + `TranscriptionScore.tsx`, VexFlow
  5): bass clef, written an octave above sounding; rows of up to 4 bars by width; chord symbols
  above each bar at their beat; beams per beat, triplet brackets, ties (also across rows), dots,
  ghost x-heads, accidentals with naturals within a bar; unfinished bars padded with grey rests
  (not stored); selection in accent with a caret, measure tint, click-to-select (hit boxes from
  VexFlow bounding boxes). Entry: MuseScore-style keys (A–G = nearest octave to the last note,
  3–7 = 16th…whole, . dot, T triplet, 0/R rest, ↑↓ semitone, Shift+↑↓ octave, # - N accidentals,
  + tie, X ghost, ←→, Backspace, Space play, Ctrl+Z/Shift+Z) and the same on a palette. A note
  that doesn't fit the bar goes to the next (made if needed), overflow ripples forward
  (`insertNote`). Value/dot/triplet change a *picked* note (clicked or arrowed to), otherwise they
  set the next note. Chords per bar as text ("Dm7 G7", or "Dm7 / / G7" by beat). Undo/redo,
  800 ms autosave, Play from the cursor's bar through the upright bass. No key signatures yet.
- Verified: `tsc` (web, mobile, core, convex), `eslint`, `next build`, the dev push, signed-out
  Convex calls, and in nix Chromium signed out: player → transcription → keyboard entry (stored
  notes/midi/accidentals/triplets/tie/ghost/chords checked in storage), undo, export (file
  checked), playback starts, import back, 1400 and 390 px. **Not verified signed in.**

**MusicXML import (same day):** the Bass players Import buttons also take `.musicxml`/`.xml`
and compressed `.mxl` (MuseScore's default). `packages/core/musicXml.ts` (`importMusicXml`,
`decodeXmlBytes` — UTF-8 or UTF-16, which Finale writes) on a small pure XML parser
(`packages/core/xml.ts`, no DOMParser so RN can use it); `apps/web/lib/mxl.ts` unzips .mxl with the
browser's `DecompressionStream("deflate-raw")`. Takes the bass part (name or F clef; else the first)
and its first voice; written → sounding via `<transpose>`, or an octave down when there's none (so it
looks the same in the editor as on the page); type/dots/triplet (from `time-modification`), ties,
x noteheads = ghost, whole-bar rests; `<harmony>` → normalized symbols at the half-beat (kind +
degrees + bass); title, tempo. Warns about non-4/4, double stops (first note kept), other voices,
grace notes, notes shorter than 16ths, double dots, non-triplet tuplets. From the players list it
asks which player the file is by. Verified: all 450 MusicXML test files in MuseScore's repo
(`src/importexport/musicxml/tests/data`) import with no exceptions, a hand-written contrabass walking
line checked note by note, and in nix Chromium (.mxl, .musicxml, UTF-16, a wrong file).

**Mouse entry (same day):** hovering the staff shows a faint accent notehead (with ledger lines and
its name, e.g. "B1") snapped to the line/space under the pointer; clicking adds that note there —
after the notes to its left in that bar, at the palette's value/dot/triplet, natural (use ↑↓ or
♯/♭ after). Clicking a note's head still selects it; above/below the staff selects the bar. The
preview is a separate overlay SVG (no VexFlow redraw on hover); pitch comes from
`stave.getYForLine(0)`/line spacing (bass clef top line = written A3). The chord-symbol text is
drawn in the chord charts' Petaluma fonts (`ChordChart`'s `chordFont`/`chordSymbolFont`,
`SMUFL_CHORD_GLYPH` now exported) and the clef/time signature only on the first bar. Gotcha fixed:
focusing the editor (for its key handler) scrolled the page under the mouse — focus calls use
`preventScroll`.

**Overwrite editing (same day) — nothing after the cursor ever moves:** entry is MuseScore-style
overwrite (`writeNote`, which replaced `insertNote`; `insertNote` is now an alias): a new note is
written over whatever is at the cursor, a note it cuts into leaves its remainder as rests
(`restsFor`), and a note that won't fit what's left of the bar starts the next bar. With a note
*picked* (clicked/arrowed to), a letter or rest overwrites it **keeping its rhythm**
(`overwriteNote`) and the selection moves to the next note, so a run can be typed over; past the
last note it goes back to adding. Value/dot/triplet on a picked note (`setNoteRhythm`): shorter →
a rest fills the gap, longer → writes over what follows in the bar, refused ("won't fit") past the
barline. Backspace (`clearNote`) turns a note into a rest of the same length, and only removes the
last thing in a bar. Mouse: each note has a column (halfway to its neighbours); clicking above/
below a note in its column re-pitches it (rests too), past the last note of a bar with room adds
one, a full bar only overwrites. Real notes' SVG groups carry `data-note="m:i"` (handy for tests).
Verified in nix Chromium by checking the stored notes after each kind of edit.

**Chords typed on the score (same day):** the per-bar chord text field is gone. Select a note →
**+ Chord** (or Ctrl/Cmd+K) → an input opens above that note (at its start beat; bar start with
nothing selected) → Enter saves; Space/Tab saves and opens the next note's (prefilled if it has
one); an empty input removes the chord; Esc cancels; clicking away saves (and that click doesn't
also add/select a note — `justClosedChord`). Clicking a chord symbol on the score edits it (chord
hit boxes from the drawn text's `getBBox`). Placement comes from `TranscriptionScore`'s
`handleRef.anchorFor(measure, beat)` (imperative, so no setState in the draw effect); the input is
passed in as `overlay`. Chords keep `{beat, symbol}` (beats can be fractional, e.g. on an "and").
Verified in nix Chromium against the stored chords after each step.

**Select / Write modes and copying chord changes (2026-10-15):** the palette starts with a
**Select | Write** switch (Esc → Select, W → Write; default Select). Select: clicks only select —
a note's head selects it, anywhere else in a bar selects the whole bar, Shift+click extends to a
range of bars (tinted, chords included); no hover preview, nothing is added or re-pitched. Write is
the old click-to-add/re-pitch behaviour. Keyboard entry works the same in both. Right-clicking a
bar (selecting it first if it's outside the selection) opens a menu: **Copy chords**, **Paste
chords** (only the chords; notes untouched), **Clear chords**; Ctrl+C / Ctrl+V do the same with
bars selected. Paste starts at the first selected bar; a multi-bar selection is filled by
repeating the copied bars, a single bar takes all of them (adding bars at the end if needed). The
clipboard is in memory for the session, so chords can go from one transcription into another.
Also fixed: every redraw scrolled the page to the top (the score is rebuilt row by row and
`getBBox()` forces layout mid-way, so the page was briefly short) — the score's height is held
during the redraw. Verified in nix Chromium: select-mode clicks change nothing, copy bars 1–2 →
paste over 3–5 (repeats), clear, write mode still re-pitches, scroll stays put, no errors.

**Your bass players play (2026-10-15):** the Play tab's Bass player list is Computer plus every
player you've made; picking one plays from their transcriptions (`packages/core/bassStyle.ts`,
shim `lib/bassStyle.ts`). `analyzeStyle` reads each 4/4 transcription into per-beat harmony (from
its chord symbols; a chord on an off-beat counts from the next beat, on the "and" of 4 from the
next downbeat) plus its notes (`timeline`, ties merged). `generateStyledChorus` walks the chart a
half bar at a time and searches every transcription for the same progression: same root movement
beat for beat in any key, chord changes on the same beats of the bar, starting on the same half
of the bar; chord-family differences cost a little (`classCost`: sus for 7, m6 for m7… 0.3/beat,
others 1.5/beat, budget 1 + 0.25/beat), up to 8 bars. Candidates are scored by length − cost,
recently used passages (`state.recent`) penalised, picked at random among the best. The line is
transposed; where qualities differ chord tones map to the same chord tone of the new chord and held
notes outside the scale move to the nearest scale note (`refit`); the octave joins onto the line
and stays near the player's median register (`placeOctave`, strays folded into E1–C4); at every
seam the previous note becomes a half-step approach if it was heading elsewhere (not if it's a
4th/5th away). Gaps and non-4/4 bars are the Computer's line (walking, in the player's register),
and the last chorus still ends on the Computer's held root. `PerformedBeat.from` names the passage
("Blue Bossa, bars 9–12"), shown in the status line while playing; under the player picker a line
says how many transcriptions/bars with chords were read and what share of this chart's bars have a
match (`styleCoverage`). Feel is locked for your players (the lines are what they are). Convex:
`bassPlayers.playerTranscriptions` (dev deployed), hook `usePlayerTranscriptions`. Transcriptions
**need chord symbols** to be matched. Verified: a script (a ii–V–I line comes back transposed note
for note in F; a sus bar refits B→C; a second-half-of-bar ii–V borrows a second half), a stress
run over Jack's 1,343 4/4 tunes with a 40-tune fake corpus (no errors, all notes in range, 0.05%
leaps over an octave, ~11 ms a chorus, 94% coverage), and in nix Chromium (picker, coverage line,
playback naming each passage, no errors). Not heard by a person. Mobile doesn't have it.

**The line on a staff while it plays (2026-10-15):** the Play tab shows a "Bass line" card above
the chart: the chorus being heard, drawn with the transcription editor's `TranscriptionScore`
(select mode, read-only), chord changes above, the note being heard lit in the accent colour
(a `bass-now` class on its `[data-note]` group — no VexFlow redraw per note) and scrolled into
view if it's off screen. The engine reports each chorus as it's written (`onWrite`, a chorus
ahead); `packages/core/bassLineScore.ts`'s `chorusToTranscription` turns it into a transcription:
a measure per bar played, notes quantized to the editor's grid (straight values where they fit,
else eighth-note triplets, so a triplet skip is two tied triplet eighths plus one), long notes
tied, gaps as rests, flats unless the key is a sharp one. It stays up after Stop until the next
Play. Verified: a script over 400 tunes × walking/two-feel (every note placed at its exact
start, no overfull bar), and in nix Chromium (staff drawn, the playing note lit, no errors).

**Swing (2026-10-15):** playback swings the eighths (`lib/bassGeniusEngine.ts` `swingPoint` /
`swung`): a note starting or ending on an "and" (exactly x.5 beats) is moved to the swing point;
beats, triplets and sixteenths are untouched, and the score stays written straight, as swing is
written. Setting `swing` (Swing panel): "auto" (default) is 2:1 (triplet) up to 140 BPM, easing to
1.15:1 by 300; light 1.5:1, hard 2.3:1, straight. Changes apply live. Not heard.

**Matching rewritten after a real test (2026-10-15): Ray Brown's "Cool Walk" over I Got Rhythm.**
Jack's Ray Brown transcription (`~/Downloads/cool-walk.json`, 64 bars = two rhythm-changes
choruses, imported from MusicXML) against "I Got Rhythm" from `~/Documents/irealprolink.txt`
(36 bars with the tag). The first matcher (identical roots beat by beat, greedy) played one-bar
scraps from all over — 34% of notes matched Ray's at the same spot — because the transcription
spells rhythm changes differently from the chart (bar 1 "Bb" for "Bb6 G-7", a bar of "Bb" for
"D-7 G-7", chords a beat off) **and its second chorus's chord symbols are misplaced in the
MusicXML itself** (the D7–G7–C7–F7 labels sit on bars 41–48, Ray plays the bridge in 49–56). Now:
- **`align`** is a Viterbi alignment of the whole chorus over (source beat × key) states plus a
  Computer state. Carrying on to the transcription's next beat is free; a jump costs `JUMP` (14;
  half at a chorus start), a jump that also changes key `KEY_CHANGE` (6) more, handing over to
  the Computer `COMPUTER_IN`; the Computer earns `COMPUTER` (−0.55) a beat. Only the 3 likeliest
  keys per transcription (by chord-root histograms) are tried. Scores and masks are 12-bit
  interval masks (`toneMask`/`scaleMask`); ~76 ms a chorus against a 40-transcription corpus, a
  few ms for one.
- **`beatScore`** = 0.12 × chord-symbol similarity (`chordSim`: shared chord tones / union, + root
  and bass bonuses) + 1.2 × **how the player's own notes in that beat fit the chart's chord**
  (`noteFit`: chord tone 1, a note moving by step into the next (`step`) 0.9, scale tone 0.45,
  other 0.1; on a chord's downbeat the bass note 1.6, a chord tone 0.9, anything else −0.6),
  minus `MATCH_BASE` (0.85). The notes outweigh the labels, so misplaced chord symbols don't
  steer it.
- A chorus that ends mid-transcription hands `state.next` to the next, which can carry straight
  on for free; `state.recent` (the beats it used) costs `RECENT_COST` a beat next chorus.
- `refit` maps chord tones only where the roots line up; over a substitute chord the player's
  line is kept as played.
Result (script `rhythm.ts`, several seeds): odd choruses play Ray's chorus 1 note for note (99%
of notes match; the rest is the chart's 4-bar tag, which uses Ray's next four bars); even
choruses play his chorus 2 note for note for bars 1–30 (85–88%; the tag differs). Tried and
dropped: a cheap jump with a "don't reuse a passage within a chorus" re-alignment (got worse), and
cheaper entry from the Computer (worse). Known trade-off: a short chart that no stretch of the
corpus fits whole (e.g. a 4-bar corpus vs. "Em7 A7 | Dm7 G7") keeps the line whole and can sit a
bar off rather than splice half bars. `bassStyle.ts` exports `__test` (align, chordSim, beatScore,
chordOfHarmony) for scripts.

**Patterns (2026-10-15):** a **Patterns** button next to each transcription (and one in the player
header for all of them) opens `components/bassgenius/PatternsDialog.tsx` (portaled to `<body>`,
`bg-overlay`, Esc closes), from `packages/core/bassInsights.ts`'s `analyzeInsights`: bars / notes /
range / usual register; rhythm mix; what lands on a new chord's first beat (degree, or chromatic);
chord tone / scale / chromatic per beat; how the line moves; how it leads into a chord change
(half step below/above, whole step, from its 5th, same note, skip, leap); the commonest chord
changes (e.g. "m7 → 7, root up a 4th") with the usual way in and the line across the bar line in
degrees ("5 6 | 1"); one-chord four-note bar shapes by chord family with a name (arpeggio up/down,
scale, two-feel pairs, + approach); five-note phrases that recur in any key; and bars whose
on-beat notes don't fit the written chord (flags Cool Walk's misplaced 41–48). Each figure has an
example bar. Reads chords via `bassStyle.transcriptionBeats` (shared with the matcher). Hook
`usePlayerTranscriptionRows` (ids + data). Verified: the analysis on Cool Walk by script, and the
dialog in nix Chromium (one transcription, all, Esc, 390 px, no errors).

**How each phrase was made (2026-10-15):** while one of your players plays, the Bass line card
lists the chorus's phrases as buttons ("Bars 1–4 · Cool Walk 1–4", or "Computer"; the playing one
lit). Phrases are up to four bars, cut on the chart's bar lines (`phraseCuts`), from each stretch
the alignment chose. `generateStyledChorus` returns `chorus.phrases: BassPhrase[]`
(`packages/core/bassLine.ts`): beat, length, the chart's chords; for a borrowed phrase the
transcription (index into the analysed list — `SourceTune.index`), its start beat, key shift and
octave, its own chords, `fit` (share of notes that are chord / scale / stepwise passing notes of
the chart's chords), notes `refitted` and `folded`; `leadIn` when its last note became an approach
to the next phrase. The engine passes them in `onWrite`. Clicking opens
`components/bassgenius/PhraseDialog.tsx` (portaled): "Why this" (carries straight on from the
phrase before, or the best fit for these changes; the fit; key and octave; anything adjusted; or
why the Computer walked it), the chart's chords against the player's bar by bar, a snippet of the
transcription as written (real bar numbers — `TranscriptionScore`'s new `firstBar`), and the
phrase as played; the main staff tints the phrase's bars. The dialog stays on its chorus when the
next chorus starts.

Matching tweak found while testing this: two-feel passages of repeated chord tones (F F G G) beat
Ray's walking lines over a typed rhythm-changes A section because every repeat scored as fresh
evidence of the chord; a repeated note now gets half credit (`REPEAT_CREDIT`). The typed A section
now opens with Ray's bars 1–8 (it took his bars 21–28 before); I Got Rhythm unchanged (99% / 88%).

**Playable on an upright (2026-10-15):** every chorus — the Computer's or a modelled player's —
goes through `packages/core/bassPlayable.ts`'s `makePlayable(notes, bpm, previousNote)` in the
engine's `writeChorus`, at the tempo then, before it's shown or scheduled (so the staff shows what's
played). Rules: range E1–C4 (`UPRIGHT_LOW/HIGH`, octave folds); the widest leap depends on the
time to make it (`maxLeap`: a 12th with ≥0.45 s, a 10th ≥0.25 s — Ray Brown plays F1→A2 in
quarters —, an octave ≥0.18 s, a 6th ≥0.11 s, else a 5th) — a note that jumps too far moves by
octaves to the spot nearest the notes around it, or if it can't (below low E) the note before
moves; a big leap straight back the other way at eighth-note speed moves the middle note; no more
than ~13 plucked notes a second (0.075 s; ghost notes 0.05 s) — the decoration (ghost, or an
off-beat note before a note on the beat) is dropped and the note before held; ghost notes stay
within an octave of the note they decorate. `playabilityProblems` checks a line (tests). Verified
over 300 4/4 tunes × 2 choruses × Computer walking / two-feel / Ray at 100, 200, 300 BPM: 0
problems after (from up to ~1,300 before at 300 BPM); Ray's own transcription breaks no rule at
160–200 BPM, and his line over I Got Rhythm is untouched at 140 and 200 BPM (6 of 293 notes at
260, his sixteenths). Not applied to the transcription editor's own playback (that's the
player's real line).

**Use their phrases / Learn their style (2026-10-15):** with one of your players picked, a toggle
under the player picker (setting `playerMode`, default "copy") chooses between the phrase-copying
matcher above and **Learn their style**: `packages/core/bassLearned.ts`. `learnModel` measures the
player's habits (with small textbook priors so one transcription is enough): the chord *role*
they land on at a change (root/3rd/5th/7th/9th/11th/13th/chromatic — roles, so a habit over major
chords carries to minor; chromatic landings capped at 4% since loose chord symbols inflate them),
the role each beat of the bar gets, melodic motion (−12…+12), the approach into a change (−7…+7),
eighth / triplet / ghost rates per beat, register; and the *shape* (rhythm + intervals, any key) of
every bar and pair of bars. `generateLearnedChorus` writes: each change's landing note from their
landing odds near the line and register (planned a beat early so the beat before can lead into
it), the beats between from role odds × motion odds (the approach beat from their approach odds ×
√motion), never three repeats in a row, then their rhythmic figures; a bar whose shape matches one
of theirs is rewritten (up to 7 times). Phrases carry `learned.points` (what it did vs. the
player's numbers) shown in the phrase dialog; chips say "New, in their style". Engine:
`model` option, `line.styleMode`. Verified: over Cool Walk the model reads Ray landing on the root
53% / 5th 15%, approaching from a half step below most; 16 choruses over I Got Rhythm quote no bar
of his (the only "matches" were a lone final B♭1); 300 tunes × 2 choruses, 0 errors, 0 playability
problems after the pass, ~1 ms a chorus; in nix Chromium the toggle, chips and dialog work.
Not heard.

**Learn mode rewritten into phrases (2026-10-15)** — "it sounds bad, kinda like it's playing random
notes": picking each beat from statistics did. Now each chord's beats are a **motif** learned from
the player (`motifOf`: arpeggio up/down, scale run up/down, up-and-back, down-and-back, repeated
pairs — counted per chord length 2/3/4 from the transcriptions' on-beat notes), realised on the
target chord's own tones/scale (`realise`, `stepFrom`), a chord tone forced on beat 3, then their
**approach** into the next chord's landing (planned one chord ahead; `approachNote` weighs their
approach odds × closeness). Direction: toward the next landing if it's far, else the phrase
**arc** — every two bars the goal flips between the high and low end of their working range
(`model.low/high`, 10th–90th percentile), so lines rise and fall. Bars whose on-beat notes mostly
miss the written chord (misplaced symbols) are left out of the harmonic counts. Landings weigh
smoothness more. Still no quoted bar shapes; 0 playability problems.

**Chords under the bass (2026-10-15):** "No chords / Piano / Rhodes" on the page (settings
`chords`, `chordStyle` comp|sustain, `chordVolume`; a Chords options panel). Voicings
(`packages/core/comping.ts`): rootless A/B shapes (3-5/13-7-9 and 7-9-3-5/13; ♭9/♯9 from the
chord's scale, 13 on dominants, half-dim/dim shapes), bottom note D3–B3, each chord the placement
closest to the last. `compChorus` writes both styles per chorus: comping = Charleston (1, and of 2),
2&4, 1 + and of 3, sustained bars, 2-beat stabs, ~22% anticipations of the next chord on the "and"
of 4 (that chord then skips its downbeat); sustained = one held chord per change/bar. The engine
schedules them on the same swung clock (`setComp` live), a few ms of finger spread.
Sounds (`lib/compSounds.ts`), with real velocity layers: **piano** = Salamander Grand (CC-BY 3.0)
from the Tone.js Piano project's layered set (`tambien.github.io/Piano/audio/<C|Ds|Fs|A><oct>v<4|8|12>.mp3`,
A2–C6, 42 files); **Rhodes** = jRhodes3d, Jeff Learman's 1977 Mark I Stage 73, layers 2–4,
converted (nix ffmpeg) to trimmed mono mp3s in `apps/web/public/samples/rhodes/<midi>_<layer>.mp3`
(26 files, 2.3 MB, LICENSE.txt there). **jRhodes samples are CC BY-NC 4.0** — fine for sheddex as a
free, non-commercial site with credit (on /credits); anything commercial needs the author's
permission. Own compressor + the bass's room impulse (`roomImpulse` now exported from
`uprightBass.ts`). Verified: voicings/voice-leading by script (I Got Rhythm, Autumn Leaves, Stella:
e.g. A7♭9 = G B♭ D♭ G♭, biggest voice move 5 semitones); in nix Chromium all 26 Rhodes + 42 piano
samples load (200), switching instrument mid-play works, no errors. **Not heard.**

**Chords held, varied, voice-led; a mixer (2026-10-15):** `packages/core/comping.ts` rewritten.
Each chord (one span per change; a chord held over bar lines is one span) is struck once and
**held until the next** (−0.06 beats so the keys lift first). Style "comp" (labelled "Held, with
pushes and variation") moves the strike: ~15% pushed early onto the "and" before (when the chord
before lasted ≥2 beats), ~10% laid back to the "and" after, a few a whole beat late — ~25% of
strikes off the beat over 400 tunes — and chords of 8+ beats are struck again ~2 bars in with a
fresh voicing; "sustain" ("Held, always on the beat"). **Voicings** (`voiceChord`): the rootless
four (3rd, 7th/6th, 9th as the scale allows, 5th — 13th on an unaltered dominant, ♭13 where the
scale has it; half-dim/dim keep 3-5-7-root) in **every inversion, close and drop-2**, bottom C3–D4,
top ≤ E5, nothing muddy low (no 2nds below E3, no 3rds below C3); cost = each voice's distance to
the nearest note of the last chord + top-voice motion (stepwise free, held small, leaps cost) +
all-parallel penalty + distance from middle C, with a little randomness in "comp". 400 tunes: 0
errors, 0 overlaps, average total movement ~4.3 semitones per change.
**Mixer:** a Mixer button under the Chords switch opens sliders for Bass (`volume`), Chords
(`chordVolume`, "Turn on" when off), Hi-hat (`clickVolume`, new — the engine's `setClickVolume`;
"Turn on" when off) and Room (`roomAmount`, new; `setUprightBassRoom`/`setCompRoom` now take an
amount). Closes on outside click / Escape. Verified in nix Chromium (rows, turn-on, values saved,
playback with chords, no errors). Not heard.

**Then (same day): "chords are sustaining too much… the voicings sound kinda off".** Comping style
"comp" (now "Comping (varied rhythms)") picks a figure per chord: hold to the next (22%), half-held
then space (24%), a short stab (20%), a Charleston — stab, then the "and" of 2 (18%, if ≥2.5 beats),
or two hits (16%, if ≥3.5 beats); pushes / laid-back strikes as before (~30% of hits off the beat);
a chord of 7+ beats is struck again about a bar in (the first figure stops before it). "sustain"
("Held chords, on the beat") is unchanged. Voicings are now only the **A and B rootless forms**
(A = 3-5/13-7-9 up from the 3rd, B = 7-9-3-5/13 up from the 7th) in close position or drop-2 — a
guide tone always at the bottom — with the bottom D3–C4 (was C3–D4, crowding the walking bass) and
the top ≤ D5. E.g. Autumn Leaves: C-7 B♭ D E♭ G, F7 A D E♭ G, B♭^7 A C D F, E♭^7 G B♭ D F,
D7♭13 F♯ B♭ C E, G-6 E A B♭ D. 400 tunes: 0 errors, 0 overlaps, average total movement ~3.1
semitones per change, biggest top-voice move 8. Not heard.
Follow-up: a chord lasting a bar or more now mostly rings — figures weighted hold 50%, half-held
(≥2 beats, 55–80% of it) 22%, Charleston / two hits whose last hit rings to the end 25%, stabs 3%;
its re-strike usually rings to the next chord. Over 400 tunes, chords of a bar or more sound ~81%
of their time, shorter ones ~61%; no overlaps.

**A drummer (2026-10-15):** "No drums / Brushes / Sticks" on the page (settings `drums`,
`drumsVolume`; a Drums row in the mixer; the 2-and-4 click is skipped while drums play — the mixer
shows "Off with drums"). Samples (CC0, served from `apps/web/public/samples/drums/`, 109 mono
mp3s, 2.4 MB, LICENSE.txt there; converted with nix ffmpeg, mic pairs mixed):
**sticks** = Virtuosity Drums (Versilian Studios & Karoryfer) — ride 3 layers × 4 RR (overheads),
bell, hi-hat pedal 3×4, kick 2×4 (kick mic + overheads), snare 10 layers (snare mic + overheads),
crash; **brushes** = Karoryfer's Swirly Drums — brush taps on snare 3×4 (top + bottom mics), stirs
4×4, brushed ride 3×4, hi-hat foot 2×4, kick 3×2 (beater + reso). `packages/core/drums.ts`'s
`drumChorus` writes both kits per chorus: sticks = ride "spang-a-lang" (skip notes on the "and"s
of 2 and 4, 2 and 4 accented, a few dropped/extra), hi-hat foot 2 & 4, feathered kick every beat,
0–2 snare comping hits a bar (mostly ghosts), the odd kick bomb, a setup on the last "and" of each
8-bar phrase, a crash at the top of each chorus after the first, a final crash + kick; brushes =
a stir sweep every bar (faded to the bar's length), brush taps in the ride rhythm on the snare
(2 & 4 accented), foot 2 & 4, softer feathered kick, setups. `lib/drumSounds.ts`: nearest velocity
layer, round robin (never the same twice running), per-voice trims (the raw levels differ by
~20 dB), compressor + the shared room. The engine swings the "and"s and adds ±3 ms. Verified: the
patterns by script (all 1,460 tunes, no errors); in nix Chromium both kits load (54 + 55 files,
200), hits are played, switching kit mid-tune works, mixer row, no errors. **Not heard.**
Then: "the ride cymbal is not swung enough… the swing amount should really vary a lot, and the ride
pattern, and there should be no comping on the snare." No snare comping or snare setups (brushes
keep their taps and stirs — that's the time). The ride's skip notes are `skip` hits placed by the
engine at `drumSwingPoint` (0.72 of the beat up to 150 BPM, easing to 0.62 by 300; light −0.05,
hard +0.03, straight 0.5) plus each note's `swing` offset: a per-bar random walk (±0.06) and
±0.015 per note — e.g. at 160 BPM 0.66–0.76 (median 0.71, ~78 ms behind straight). Ride figures
vary bar to bar (`RIDE_4`/`RIDE_3`: spang-a-lang 42%, skip on every beat, plain quarters, the
skip moved into 3, triplet "ding-da-da" pickups, a downbeat or beat 3 left out), each often kept for
two bars; the brush taps use the same figures.
Then trimmed to what Jack asked for: the ride plays mostly quarter notes and "spang, spang-a-lang"
(45% / 45%), now and then "spang-a-lang-a-lang-spang" (skips into 2 and 3, 10%) — no triplet
pickups, all-skip bars or dropped beats — and nothing piles up between phrases: no crash or extra
kick at the top of a chorus; the ending is one ride note (a brush tap with brushes) over a soft kick.
Dynamics through each figure, like the stick falling back onto the cymbal: the spang (the beat
with the skip after it) loudest, the "a" (skip) well below it, the "lang" (the next beat, across
bar lines too) a touch below the "a" — sticks 0.64 / 0.45 / 0.39, brushes 0.56 / 0.34 / 0.29 — a
"lang" stays soft even when another skip follows it; plain quarters 0.56 on 2 & 4, 0.49 otherwise;
±0.015 variation so the order holds (715 / 715 spang-led figures checked).
Hi-hat lined up with the ride: the Virtuosity hi-hat pedal samples have ~50 ms of pedal travel
before the "chick" (the rest ≤7 ms), so it landed late. `drumSounds.ts` now finds each sample's
attack on load (first sample over 25% of peak, minus 2 ms) and starts playback there; and the
engine's ±3 ms human offset is shared by every drum struck at the same moment (`feelAt`). Checked in
nix Chromium by logging every source's start + attack: hi-hat foot vs ride attacks 0 ms apart.
Then: skip note a hair earlier (`drumSwingPoint` 0.69 up to 150 BPM, easing to 0.60 by 300), more
spang-a-lang (4/4 figures now quarters 25%, spang-a-lang 65%, spang-a-lang-a-lang 10%; 3/4 quarters
30%), and a softer "lang" (sticks 0.32, brushes 0.24 — still under the "a").
Then: a quieter "a" (0.36, with the lang at 0.30, later 0.33 — spang 0.64 > a > lang held in 1,006/1,006
figures). **Brushes removed** ("it sucks"): the switch is now "No drums / Drums", `DrumKit` is just
"sticks", the Swirly samples (`public/samples/drums/brushes/`) and their credit are gone, and a
saved `drums: "brushes"` plays sticks. The brush details above are history.
The "a" and "lang" now share one ride recording: `DrumHit.tone` picks the velocity layer (0.45 →
the middle layer) separately from the level, since at 0.36 / 0.33 they fell on different layers
and sounded like different strokes. Levels a 0.38, lang 0.35 (~1 dB apart, ±0.005).
Figures reweighted to mostly spang-a-lang: 4/4 weights spang-a-lang 88%, quarters 5%,
spang-a-lang-a-lang 7% (measured over 200 tunes: 89% / 5% / 6% of bars); 3/4 skip into 1 75%, quarters 15%, skip into 3 10%.
Laid back: the "a" and "lang" (and the feathered kick under a lang) play `LAY_BACK` = 15 ms behind
the time (`DrumHit.late`, added by the engine), the spang and the hi-hat on 2 & 4 stay on top; the
a–lang gap is unchanged.

**Drums "With comping" (2026-10-15):** a "Just time / With comping" switch under the drums
(setting `drumsComping`, default off; `setDrumsComping` live — the engine writes both versions every
chorus). With comping (`drumChorus` `comping`, `sectionBars` = chart bars with a section letter, else
every 8 bars; the top of each chorus after the first counts): 0–2 snare hits a bar on the swung
"and"s (mostly ghosts ~0.2, ~18% firmer ~0.45), a setup (snare + kick) on the last "and" before each
section, and the section's downbeat marked by crashing the ride (that ride hit at 0.92 on its hard
layer, a soft crash 0.32 under it, a kick 0.5, nothing laid back), plus the odd lone kick bomb.
Checked: I Got Rhythm (sections A/A/B/A) marks bars 1·9·17·25 with setups in 8·16·24; all tunes, no
errors; the switch works mid-tune in nix Chromium. Not heard.

**Drum settings (2026-10-15):** a "Drum settings" button beside Just time / With comping opens
`components/bassgenius/DrumSettingsDialog.tsx`: 26 sliders and 5 switches in five sections — Swing
(swing point at medium tempos, lighter at fast tempos, drift bar to bar, note-to-note variation,
lay back of the a-lang, timing looseness), Ride pattern (the three figures' weights, keep a figure
for the next bar), Ride dynamics (spang, a, lang, quarters on 2&4 / 1&3, phrase swell, level
variation), Hi-hat and bass drum (on/off, levels), Comping (snare hits per bar, ghost level, accent
chance/level, setups on/off + level, section ride crashes on/off + ride/crash levels, bomb chance) —
each with a one-line explanation, a per-setting "reset" when changed, and "Reset to defaults".
Saved as the setting `drumConfig` (read through `drumConfigOf`, so missing fields take defaults).
`packages/core/drums.ts` now takes `DrumConfig` (`DEFAULT_DRUM_CONFIG`, `drumSkipPoint`); the engine's
`setDrumConfig` applies swing, lay back and timing at once, patterns/levels from the next chorus.
Less robotic by default: timing looseness ±5 ms (was ±3), and a gentle **phrase swell** (the ride
rising through each 4-bar phrase and easing back, a "lang" keeping its figure's swell over a bar
line so spang > a > lang still holds — 1,285/1,285). Verified in nix Chromium (edits saved,
per-setting reset, reset all, playback, no errors).

**Built-in Ray Brown, and credit to Rob Moreno (2026-10-15):** `packages/core/bassBuiltIns.ts`
(`BUILT_IN_PLAYERS`, `isBuiltInId`) bundles Rob Moreno's Ray Brown transcription "Cool Walk" (64
bars, rhythm changes, from `~/Downloads/cool-walk.json`; notes and chords untouched — the second
chorus's misplaced chord symbols included; tune/source/comments filled in to credit Rob) as player
`builtin:ray-brown` / transcription `builtin:ray-brown:cool-walk`, titled **"Rhythm Changes Tune 1"**
(Jack's name for it). `useBassPlayers` lists the built-in player for everyone (signed in or out);
if you already have a player of that name, the built-in transcriptions are listed **under your
player** instead ("· built in"; skipped if yours already has one with the same title —
`builtInExtrasFor` in `bassBuiltIns.ts`), and that player plays from them too
(`usePlayerTranscriptionRows(playerId, playerName)`). Found on prod: Jack's own Ray Brown held only
an empty "Untitled transcription", which used to hide the built-in entirely.
`useTranscription`/`usePlayerTranscriptionRows` serve them read-only (`readOnly`; saves ignored);
"Make it my own" on such a transcription copies it into your player. Bass players tab: "· built in" in the list; a built-in's page
has no rename/import/delete/new transcription — **Make it my own** copies it into your players
(after which the built-in steps aside); its transcription opens as a read-only score with the
credit. Play tab: Ray Brown is in the player picker out of the box. Credit: Bass Genius's page
credit beside the title "Idea and built-in transcriptions by Rob Moreno", and a "Bass Genius" section on
/credits. Verified in nix Chromium (signed out, from empty: listed, read-only view, copy, picker,
learn/copy info line; no errors).

**Play tab redesigned around a properties panel (2026-10-16):** the stacked on-page switches
(source, player, phrases/style, chords, drums, comping, drum settings, Mixer popover) and the
option chips under the page (Form, Key, Sound, Chords, Swing, Click; Feel above them) are gone.
The Play button (and the status line under it) sits right under the Play / Bass players switch.
Below, desktop is two columns: a sticky left **properties panel** (`components/bassgenius/PlayPanel.tsx`:
`PanelSection` — collapsible, open/closed remembered per device under
`jam-practice-bass-genius-panel` —, `Field` (label optional), `LevelRow`) and, on the right, the bass
line and the chart. Phones (below `lg`) don't show the panel: an **Options** button beside Play opens
it as a bottom sheet (`OptionsSheet`, z-60, so the chart picker and drum settings open over it; Esc /
× / tap above closes). Gotcha hit here: the dev server's Tailwind never generated a brand-new
`lg:block`, so the panel uses `lg:flex` (already in use elsewhere). Descriptions are kept only where something
needs doing (a player with no transcriptions / no chord symbols; typed chords not understood).
Sections, in the order you'd set up a session: **Tempo** (the BPM hero, slider, tap), **Tune** (A chart / Type chords; the chart card or the typed editor with presets, key, time; Key;
How long + Count-in), **Bass** (Player; Their phrases / Their style with the explanation, or Feel
for the Computer; Touch; Swing), **Chords** (Off / Piano / Rhodes; Comping / Held), **Drums**
(Off / Time / Comping in one switch; Drum settings; the hi-hat click on 2 & 4 when there are no
drums), **Mix** (Bass, Chords, Drums, Click, Room levels — replaces the Mixer popover). The page
passes `options={null}` to `ToolLayout`. Settings keys are unchanged.

**The line is written as you set the options (2026-10-16):** while stopped, the Bass line card shows
the first chorus the current settings would play — chart/typed changes, key, player, phrases/style,
feel, touch, tempo (deferred while dragging), length — redrawn on every change, phrase chips and
"how this was made" included. `lib/bassGeniusEngine.ts`'s `previewChorus` writes it with the same
code a performance uses (`writeLine`, factored out of `writeChorus`: generator + `makePlayable`) from
a seed the page holds; Play passes that seed (`seed` option → `initialBassState(seed)`), so the
first chorus heard is exactly the one shown (checked note for note for the Computer, Ray's phrases
and his style). **New line** (on the card, while stopped) picks a new seed. After Stop the card goes
back to the preview.

**Chart beside the bass line (2026-10-16):** from `xl` (1280 px) the right side is two columns —
the written bass line (3fr) and the chord chart (2fr, sticky so it stays in view while the line
scrolls); narrower screens stack them. The Bass line card's header has **Hide chart / Show chart**
(setting `showChart`, default on); hiding it gives the bass line the full width. The empty states
(no charts, pick a chart, type some chords) always show.


**No auto-scroll on phones (2026-10-18):** Jack asked to turn off the score following the playing
note on mobile. The `scrollIntoView` that keeps the `.bass-now` note in view now only runs from
640px wide (`sm`) up; the note is still highlighted on phones. Not checked on a real phone.


**The editor moved (2026-10-20):** `TranscriptionScore` and the body of `TranscriptionEditor` are
now the shared `components/notation/Score.tsx` and `ScoreEditor.tsx`, which Score Writer and Shed
Notes use too. `bassgenius/TranscriptionEditor.tsx` is a wrapper with the same props. A
transcription with no `clef` is `bass8` (written an octave up), so nothing changed here. See
`score-writer.md`.


**Now part of Rhythm Section (2026-11-16):** Bass Genius and the Drum Generator became one tool,
`/rhythm-section` (`/bass-genius` redirects there; `?tab=players` opens Bass players). The Play tab,
bass players, the walking line and the swing drummer are its swing styles; settings still live under
`jam-practice-bass-genius`. `lib/bassGeniusEngine.ts` was replaced by `lib/rhythmSectionEngine.ts`.
See `rhythm-section.md`.
