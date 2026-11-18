# soniroll desktop changelog

The desktop app's own releases. What's new on the website itself is at
[soniroll.com/changelog](https://www.soniroll.com/changelog). Each section here becomes the notes
of the GitHub release for its `desktop-v<version>` tag.

## [0.1.10] - 2026-11-18

- The Metronome's beat bars show on Macs (0.1.9's fix didn't do it; FB-20, FB-21).

## [0.1.9] - 2026-11-18

- The Metronome's beat bars show again on Macs where they came out empty (FB-20).
- Report a bug is a button in each tool's top bar instead of floating in the corner.
- Everything else in the website's 0.10.9.

## [0.1.8] - 2026-11-18

- Rhythm Section no longer scrolls the page to follow the music while it plays.
- Everything else in the website's 0.10.8.

## [0.1.7] - 2026-11-17

- **Updates itself:** at launch it checks for a new version and installs it (macOS, Windows), or
  tells you one is out (Linux). Installs from 0.1.6 and before need this one downloaded by hand.
- **The Recorder, rebuilt:** pick the input, set the input level (applied in the native engine),
  Check level before recording, a live level trace that warns when it's too loud; Auto gain is off
  by default.
- **Files kept on your computer** without a storage plan, and storage plans for having them online
  on all your devices (Account → Storage plan; checkout opens in your browser).
- Syncopation's swing beat underneath, and everything else in the website's 0.10.6 and 0.10.7.
- Rhythm Section's chords are piano only for now (the Rhodes samples are no longer in the app).
- The sidebar (and What's new, and bug reports) show the desktop app's own version.

## [0.1.6] - 2026-11-17

- **A cleaner look** throughout, the same as the website's: less clutter, smaller corners, fewer
  outlines, a simpler sidebar with colour-coded tools. **Classic look** (Settings → Appearance)
  brings back the old feel.
- Search (/) finds tools, your tunes and chord charts, pages, settings and help.
- Presets sit in every tool's top bar; −10/−5/+5/+10 tempo buttons; Space always starts and stops.
- Shed Log: quieter missed days, minutes and progress on every day, log time on past days, and
  Stats can step back through past weeks.
- Library: chord charts in folders with a Recent row, a Recordings tab, Write the chart from a
  tune, and Play along to open a chart in Rhythm Section.
- Slow Downer: Loop start / Loop end buttons; Practice Timer: a quick timer.
- Signed in, your own things load first instead of waiting for your whole chart library.

## [0.1.5] - 2026-11-16

- New **Rhythm Section** tool, replacing Bass Genius and the Drum Generator: drums in over 30 styles,
  with an upright bass and piano or Rhodes playing your chord charts, and a bass part for every style.
- **Presets** on every tool: save a tool's options under a name and pick them again later.
- New ear trainer, **Find the Root**: hear a rootless voicing and sing, play or pick its root.
- **Record in the Tuner** and play the take back through it, with a graph of how in tune each note
  was. Recorded natively, and kept on this computer only.
- Slow Downer: a Volume chip, and a button and the B key back to the loop start.
- Time Test: drag the playhead, or click anywhere, to play from there; the count-in no longer
  loses its first click.
- Clicks keep time when the window is in the background.

## [0.1.4] - 2026-10-28

- Shed Notes: clicking a line puts the cursor on that line, even below tables, notation, scores and
  pictures, and with vim keys on, `k` and `j` move one line at a time instead of sometimes skipping
  lines or jumping far up the note.

## [0.1.3] - 2026-10-28

- New tool, **Time Test** (under Drums): play along to the click on a practice pad and see how far
  off every stroke was. On desktop the mic is recorded natively and lined up with the app's own
  click, so calibration only has to cover the last few milliseconds.
- Thinner scrollbars.

## [0.1.2] - 2026-10-27

- Every metronome click has four levels you step through by clicking a beat: accent, normal, soft
  and muted. Each beat shows its level as up to three bars, and lower levels are lower in pitch
  rather than quieter.
- A nicer Tap tempo button that flashes as you tap.

## [0.1.1] - 2026-10-27

- Smoother on Linux: the app draws with the graphics card again (it only falls back on NVIDIA
  drivers, where that can show a blank window).
- The dashboard is yours to arrange: press Edit to move cards, change their size, take some off or
  add others. It also starts with fewer cards.

## [0.1.0] - 2026-10-27

The first test release.

- Every soniroll tool and page, made from the website's own components, so it looks and works the same.
- Sound plays natively instead of through the browser: every tool shares one output and one
  clock, with a choice of output device and buffer size (the Native audio button on each tool).
- The Tuner and the Recorder use the microphone natively; the Recorder saves MP3s, and takes
  recorded with a count-in start right on the first beat.
- Sign in with email and password or with Google (through your browser).
- Downloads open a Save dialog, and files can be dragged onto pages that take them.
