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
