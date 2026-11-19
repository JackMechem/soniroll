# Time Test (`/time-test`)

## 2026-10-28 — brought in from Jack's `~/Projects/time-test`, on web and desktop

Jack's standalone Tauri app (Rust audio engine + React UI) "listens to me practicing on a practice
pad and tells me how off the click I'm playing". Now a soniroll tool in the **Drums** category, on
the website and in the desktop app. Branch `feat/time-test` (off `main`, because `preview` didn't
have the desktop app yet).

### How it's split

Jack chose "port the analysis to TypeScript" over keeping Rust on desktop or compiling it to WASM,
so there is **one** analysis, used by both apps:

- `apps/web/lib/timeTest/onset.ts` — the stroke detector (high-pass, rise trigger, walk back to the
  attack start), ported line for line from `onset.rs`.
- `apps/web/lib/timeTest/analysis.ts` — the grid from the clicks that actually played, auto-detected
  subdivisions per beat (Viterbi with a switch cost), click-bleed rejection learned from the
  count-in, stats, by-beat / by-note / by-bar groups, calibration, and the live grader. Ported from
  `analysis.rs` (+ `live_error` from `engine.rs`).
- `apps/web/lib/timeTest/clock.ts` — `ClockMap` (median-of-neighbours anchors), from `clock.rs`.
- `apps/web/lib/timeTest/session.ts` — the engine: click, mic, live detection, recording, calibration,
  playback. Two small stores (main state; the mic meter at 20 Hz, so only the meter re-renders).
- `apps/web/lib/padInput.ts` — **the only platform-specific part**: mono mic samples, every chunk
  tagged with where its first sample sits on the click's clock.
  - Web: an AudioWorklet (inline Blob module) in the same AudioContext as the clicks; a chunk's time
    is its context frame, so it's exact. The round trip (output + air + input) is what calibration
    measures. The guess before calibrating is `baseLatency + outputLatency + track latency`.
  - Desktop: `apps/desktop/src/native/padInput.ts` (aliased in `vite.config.ts` and `tsconfig.json`)
    → `src-tauri/src/pad_input.rs`: a cpal input, mixed to mono, sent as raw bytes over a Tauri
    `Channel` every ~20 ms (`[frame f64][time f64][f32 samples]`, little-endian). The time is the
    callback's reported capture time turned into output time by the new `bridge::time_heard_at`
    (the inverse of `heard_nanos`). Honours `SONIROLL_AUDIO_INPUT` like the Recorder (strict).
- `lib/clickEngine.ts` got `ClickTrack.onSchedule` — called for every tick as it's scheduled
  (muted ones too) with its exact output time and level. That's how a take knows where every click
  is. Same scheduler on both apps, so the desktop got it for free.

The UI (`components/TimeTest.tsx`, `components/timetest/`) reuses the Metronome's pieces
(`TempoHero`, `BeatIndicator`, `MetronomeOptions`, setting chips). Jack's `Analytics` and `Waveform`
came over nearly as they were; the waveform now computes peaks from the take in memory (falls back
to the overview above 4M visible samples). Status colours are the trainers' `GRADE_COLOR`
(`lib/timeTest/timing.ts`), so "on time" looks like "correct" elsewhere.

### Settings and storage

- `jam-practice-time-test` (synced): tempo, meter, accents, sound, count-in, "You're playing",
  tolerance, play-with-click.
- `jam-practice-time-test-mic` (this device only, `usePersistedSettings`): input, sensitivity,
  `latencyMs` + `calibrated`, ignore click bleed. They belong to the computer's audio setup.
- `jam-practice-time-test-history` (synced): `{ takes: TakeSummary[] }`, last 100.
- Audio is never stored or uploaded; a take lives in memory until the next one. Privacy page says
  so.

### Gotchas

- **`mergeWithDefaults` drops a stored value whose type differs from the default's.** A default of
  `null` therefore never keeps a number: the first version stored `latencyMs: null` and calibration
  silently didn't stick. Use a number plus a boolean flag instead.
- The R shortcut handler checks `e.target.closest(...)`; a synthetic event dispatched on `window`
  (no `closest`) throws. Dispatch test key events on `document.body`.
- Tempo is locked while recording (the grid follows the clicks that actually played anyway).
- Next.js: the worklet is loaded from a Blob URL, so nothing goes in `public/`.

### What was verified, and how

- The 8 Rust tests (detector, early/late, latency shift, calibration, headphones, bleed,
  per-bar subdivisions, sloppy quarters) ported to a scratch Node script against the real TS
  files: all pass. `cargo test` (25, 2 new: chunk bytes, capture-time mapping), clippy
  `-D warnings`, `cargo fmt --check`. `tsc` in web, desktop and mobile; eslint on the new and
  changed web files; `pnpm lint` in desktop.
- **Web, headless Chromium** with a fake mic (`--use-file-for-fake-audio-capture`, a WAV of
  pad-like strokes exactly 0.6 s apart): live readout, meter and stroke flash work; a take at
  100 BPM gave **±0.0 ms spread and 100.0 BPM** (the offset is whatever phase the file started
  at); playback's playhead moves at real speed; 1440 and 390, light and dark, no console errors,
  no page overflow. Calibration correctly fails there ("didn't pick anything up"), since the
  clicks can't reach a fake mic.
- **Desktop, real window under Xvfb** (private D-Bus, output forced to a null sink, mic forced to
  a `pw-loopback` of that sink): calibration measured **5.4 ms** (the same one-quantum delay the
  Recorder's tests put down to `pw-loopback`), then a take of the clicks themselves (bleed
  rejection off) graded **22/22, −0.0 ms average, ±0.0 ms spread, worst −0.1 ms, 100.0 BPM**.
  Before the latency fix the same take read +5.4 ms, i.e. exactly the uncorrected round trip.

Not verified: a real mic and a real practice pad (by anyone but Jack), anything by ear, iOS
Safari / Firefox AudioWorklet behaviour, Bluetooth headphones, signed-in history sync, long takes
(memory: ~11 MB a minute of float samples, capped at 30 minutes), macOS/Windows desktop.

## 2026-11-16 — moving the playhead (FB-18)

The playhead is now always drawn on the waveform (lighter while stopped, where Play starts from),
with a handle at the top. Dragging within 8 px of it scrubs (`Waveform`'s `scrub` state; seeks on
release, `onScrub` keeps the time readout following); clicking or dragging the overview strip also
moves it. Checked headless with a fake-mic take; not on a touch screen. The count-in bug (FB-19,
3 clicks for 4) was the shared click scheduler, see `tools-jam-practice-and-metronome.md`.

## 2026-11-19 — on the phone, and the analysis moved to `packages/core`

The mobile app got the Time Test (`apps/mobile/src/app/tool/time-test.tsx`), on the
`feat/mobile-refresh` branch. Same settings key and defaults (`jam-practice-time-test`), the same
synced history (`jam-practice-time-test-history`), and the mic settings under the same key but kept
on the phone (`useDeviceSettings`, AsyncStorage), like the website keeps them per computer.

### What moved to core

The pure parts went to `packages/core` so both apps run the same detector and grading:
`timeTestOnset.ts`, `timeTestClock.ts`, `timeTestAnalysis.ts`, `timeTestTiming.ts`. The web's
`lib/timeTest/{onset,clock,analysis,timing}.ts` are now one-line `export *` shims. Also moved:
`TakeSummary` / `HISTORY_LIMIT` (web `timetest/History.tsx` re-exports them) and `verdict()` (was
local to web `Analytics.tsx`, now in `timeTestTiming.ts`). New in `timeTestAnalysis.ts`, without
changing what the website gets: `detectStrokes(take, sensitivity)`, `takeOverview(take)`, and an
optional third argument to `analyze` to pass those in already worked out. Checked with a scratch
Node script against the old files (four synthetic takes × three sensitivities × fixed/auto grid ×
bleed on/off, calibration, `LiveGrader`, `ClockMap`, the wording helpers): every result identical,
and identical again with the precomputed strokes passed in.

### How the phone hears strokes and dates them

- `lib/timeTestPadInput.ts`: `react-native-audio-api`'s `AudioRecorder` (`onAudioReady`, 1024-sample
  chunks at the device's preferred rate), raw: none of the Tuner's low-pass or gain. The library is
  already patched to open the mic `Unprocessed` (no AGC), which suits a stroke detector too.
- The recorder only numbers its samples (`when` is frames emitted / rate; it's on a different
  stream from the `AudioContext`), so each chunk is dated by **when it reaches JS**:
  `ctx.currentTime` read first thing in the callback, minus the chunk's length. That's always late
  by a varying amount (thread hand-off, busy JS, `currentTime` moving per render burst), never
  early, so `lib/timeTestClock.ts` (`ArrivalClock`) uses the **smallest** offset over ~3 s of
  chunks; what's left is a fixed input delay that calibration measures with the speaker→mic round
  trip, as on the website. Live grading uses the past 3 s; a finished take is re-dated with chunks
  either side (`settled`), so a busy start doesn't skew the first bars. Sliding, so the mic and
  speaker clocks drifting apart is followed.
- A scratch simulation (late arrivals with random JS delay and stalls, 192-frame input bursts,
  128-frame render bursts, 60 ppm drift): settled times within ±1.5 ms of the truth; the fixed
  offset moved by about ±0.8 ms from one simulated mic session to the next. With 480-frame bursts
  the error grows to about ±6 ms. These are the model's numbers, not a phone's.
- `lib/timeTestSession.ts` is the website's session with: the shared click scheduler
  (`lib/metronomeClickEngine.ts` got the web's optional `onSchedule`), a 400 ms wait after the mic
  opens before the first click, a 5-minute longest take (the screen stops and grades it then;
  ~58 MB of samples at 48 kHz), and the take's strokes and 2 ms peaks found **while it records**
  (the same `Detector` over the same samples, then the same 20 ms flush as `detectAll`: checked
  identical), because `detectAll` over a long take takes seconds on Hermes. Changing the
  sensitivity afterwards re-detects; tolerance, latency and the grid re-grade from the cached
  strokes.
- Latency guess before calibrating: a flat 50 ms (the phone's engine reports no latencies). The
  "Calibrate first" prompt stays until it's measured.
- iOS: asks for the `playAndRecord` session with `defaultToSpeaker`. Never run on an iPhone.

### The screen

The website's phone layout: History chip on top once there's a take; tempo, beats, Record (Stop and
analyze while recording, with the live readout and a "Recording 0:42" line), "Calibrate…" until
calibrated; chips Time, Subdivision, Sound, Count-in, You're playing, On time within, Microphone
(sensitivity with the live meter and stroke flash, Calibrate, Fine-tune, Ignore click bleed;
descriptions behind ⓘ). Results open under the chips and the page scrolls to them: the verdict,
six tiles, the waveform (react-native-svg, drawn as a few paths per colour; drag, pinch, tap to
seek and see a stroke, drag the playhead, tap/drag the whole-take strip), Timing across the take
(tap a dot, then Show), Where your strokes land (tap a bar), Worst moments, By beat, By note.
Left out: presets, keyboard shortcuts, Shed Log tool time, a mic picker (the phone uses its own
input), split-screen guards.

### Verified, and not

`tsc` in mobile, web, desktop and core (only the two old `lessonFiles.ts` errors), eslint on every
new/changed mobile and web file, and the scratch scripts above. **Not** run on the emulator or a
phone by the agent that wrote it; not heard; no real mic, pad or speaker; iOS never.
