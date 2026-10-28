# soniroll desktop changelog

The desktop app's own releases. What's new on the website itself is at
[soniroll.com/changelog](https://www.soniroll.com/changelog). Each section here becomes the notes
of the GitHub release for its `desktop-v<version>` tag.

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
