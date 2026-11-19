# Find the Root (rootless voicings)

### Find the Root: hear a rootless voicing, find its root (2026-11-16, web + desktop)

From feedback FB-12 / GitHub issue #26, Jack's idea: "plays what is a rootless voicing. for C
minor --> Eb major. plays rootless voicing and prompts you to sing/play what would make it such and
such (example C minor 9)."

**What it does.** `/find-the-root`, "Find the Root" in Ear training (sidebar short name "Rootless
voicings", icon `RootlessIcon`: ChordIcon's stack with the bottom note dashed). A round plays a
rootless voicing (E♭ G B♭ D) and asks "Make it a minor 9". You answer with the root (C), then it
reveals: the full chord (C-9) in the ring, "You're hearing E♭Δ7", "C under E♭ G B♭ D (♭3 5 ♭7 9)",
and plays the root under the voicing. Replay / I give up / Next (Enter), a run of N rounds, then a
results card like Guess the Chord's. Answers are graded by pitch class (any octave).

- **Two ways to answer** (`optionsMode` switch, "Sing or play" / "Pick"): Sing or play opens the
  mic through the same `lib/audioInput.ts` `startAudioInput` + `noteGrade`'s `gradePitch`
  (`ignoreOctave`) the Note/Scale/Interval Trainers use; a pitch has to stay on one semitone for
  the hold time before it counts (Note Trainer's `stable`/`holdFrames` logic). Pick shows 12 keys
  laid out like a piano (`RootKey`, a 14-column grid, black keys `bg-foreground`).
- **The mic waits for the chord.** The tool plays the voicing through the speakers, and the mic
  would hear its notes as wrong answers, so frames are ignored until the chord has finished
  (`CHORD_SECONDS` 2.2 s + 250 ms, timed from when `playNotesTogether` resolves, i.e. after the
  samples load). The page says "Listening after the chord…" meanwhile. "Listen while it plays"
  (off by default; hint says use headphones) drops that gate so you can sing against the chord.
- **Grading:** right first time = correct; right after a wrong held note or a wrong pick =
  partial ("Half credit after a wrong note", on by default); "I give up" = incorrect. No timer:
  singing needs time.
- **Settings** (`jam-practice-find-the-root`, `useSyncedSettings` with a module-level
  `DEFAULT_SETTINGS`): chord types (pill toggles by category; empty = all; "All" / "Reset"),
  roots (12 pills, empty = all), register (low/middle/high: where the voicing's lowest note sits),
  shape (root position of the chord on top / any inversion / left-hand A and B), show the
  voicing's name, piano/Rhodes, number of rounds (5–40), next round (manual or after 2/4/6 s),
  half credit, and Listen (input, `InputTest`, listen while it plays, tolerance, hold time
  (210 ms default, longer than Note Trainer's 120 because voices wobble), sensitivity). Options
  hide while a run is going, like the other trainers.
- **History** keeps the last 50 finished runs (score, total, time, sung or picked; chip shows the
  best %). **Struggles** count per chord type (`lib/struggleStats.ts`) with "Shed weak chords" (one
  round per struggling type, on a random root from the pool; doesn't go into History).
- Registered in `packages/core/navLinks.ts`, `components/tools.tsx`, `lib/toolRegistry.tsx`,
  `lib/toolTime.ts` (`LOG_BY_BUTTON`, so `useToolActivity("/find-the-root", running)` counts
  Shed Log time and the stats pills show), a help topic (no screenshot yet, so the intro shows
  without a picture), `app/find-the-root/page.tsx`, and the desktop `routes.tsx` inside
  `NativeTool` (the voicing plays through the native bridge like Guess the Chord; the mic goes
  through the desktop's aliased `native/audioInput.ts`, same as Note Trainer). The privacy page's mic
  line now names the listening trainers and Find the Root.

**The theory** is one pure module, `apps/web/lib/rootlessVoicings.ts` (no imports, so a Node
script can load it). Each type lists its degrees (never the root), the chord those notes make on
their own (root degree + iReal suffix, or null), and where its A and B voicings start:

| Type | Notes on C | Makes on its own |
| --- | --- | --- |
| Minor 7 (C-7) | E♭ G B♭ (♭3 5 ♭7) | E♭ major triad |
| Major 7 (CΔ7) | E G B | E minor triad |
| Dominant 7 (C7) | E G B♭ | E diminished triad |
| Half-diminished (Cø7) | E♭ G♭ B♭ | E♭ minor triad |
| Minor 9 (C-9) | E♭ G B♭ D | E♭Δ7 |
| Major 9 (CΔ9) | E G B D | E-7 |
| Dominant 9 (C9) | E G B♭ D | Eø7 |
| 7♭9 (C7♭9) | E G B♭ D♭ | E°7 |
| 9sus4 (C9sus) | G B♭ D F (5 ♭7 9 11) | G-7 |
| Half-diminished 9 (Cø9) | E♭ G♭ B♭ D | E♭-Δ7 |
| Dominant 13 (C13) | A: E A B♭ D (3 6 7 9), B: B♭ D E A (7 9 3 6) | none |
| Altered (C7alt) | A: E A♭ B♭ D♯ (3 ♭13 ♭7 ♯9), B: B♭ D♯ E A♭ | none |

The first seven are on by default. Voicings are packed close (`closeOrder`: each next note the
nearest above): root position starts on the chord-on-top's own root (or the A voicing when there
is none), "any inversion" on any degree, A on the 3rd (the 4th for 9sus4) and B on the 7th. The
root plays an octave or so under the voicing on the reveal.

- **7♭9 has four right answers.** Its voicing is a diminished 7th, which is symmetrical: E G B♭ D♭
  is C7♭9, E♭7♭9, F♯7♭9 and A7♭9. `correctRoots` finds every root whose voicing has the same
  pitch classes, both answer modes accept any of them, and the reveal says "It's a diminished 7th,
  so E♭, F♯, A work too." Every other type has exactly one.
- **Spelling** is by degree from the root (a ♭3 is always a letter-3rd up), so the voicing's
  name and the listed notes agree (C-9: E♭Δ7, E♭ G B♭ D). Roots are written flats-except-F♯
  (`ROOT_NAMES`), except where the other spelling of a black key avoids double flats/sharps for
  that chord (`rootName`): E♭ half-diminished is written D♯ø7 (D♯ F♯ A C♯, voicing F♯-), D♭7♭9 is
  C♯7♭9. A remaining double accidental falls back to the plain name (the ♯9 of E7alt is written G),
  and for the two voicings with no name of their own, C♭/F♭/E♯/B♯ are written plainly too.
- The A/B label ("A voicing") only shows after answering: A starts on the 3rd, so it's a clue.

**Verified:** a Node script (esbuild-bundled, kept in the scratchpad) against the real module and
`packages/core/chords.ts`: for every type, root + voicing = the full chord from an independent
table (13 may leave out the 5th), no voicing contains its root, the "chord on top" built from the
core chord bank's own intervals is exactly the notes played, the voicing's name spelled from its
own root matches the listed notes for all 12 roots, every round in every shape and register is
close, ascending, within an octave, in the register, with the right note names and the root
below; Jack's example (C minor → E♭ major) and A/B shapes (3-6-7-9, 7-9-3-6, 7-9-3-5) as
expected; only 7♭9 is ambiguous (4 roots). `tsc` (web, desktop), `pnpm lint` (web, desktop),
`next build`, desktop `vite build`. In nix Chromium (signed out, dev server): a 5-round Pick run
(wrong then right = half, right, give up, Enter for next, right → 3.5/5, 70%, history and
struggles stored and shown); Sing mode with a fake mic playing C4 (Chromium's
`--use-file-for-fake-audio-capture`): "Listening after the chord…" for the first seconds, then
C-9 graded correct, and with the root set to D, "Heard C (0¢), not it"; 7♭9 picked as E♭ graded
correct with the other roots lit; 1440 and 390, light and dark, no console errors, no horizontal
overflow.

**Not verified:** anything by ear (not heard), a real mic or voice (the fake mic is a clean sine),
the "listen while it plays" path with real speakers, the desktop app's window and native mic
(only its bundle was built), signed-in sync of the settings/history, Safari/Firefox, iOS. No help
screenshot yet. Mobile (paused) doesn't have it.

## 2026-11-18: credit (FB-27)

The tool was Rob Moreno's idea (FB-12), so it now shows `credit="Idea by Rob Moreno"` like Jam
Practice, Note Trainer and Metric Modulation, and `/credits` has a Find the Root section.
