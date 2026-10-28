# Desktop app (`apps/desktop`)

## 2026-10-27 — first test version: Tauri, the website's components, native audio

Jack asked for a desktop app with as much shared code as possible, with low-latency native audio
as the reason for doing it. This is the test build: the same sidebar and every link, but only the
Metronome and Tuner work (plus sign-in, including Google, and the Account page so you can sign
out). Every other page shows "<page> isn't in the desktop app yet" with an "Open on soniroll.com"
button. Branch `feat/desktop`.

### How it shares the website's code

There's no copy of any website component. `apps/desktop` is a Vite + React app whose
`vite.config.ts` aliases `@/…` to `apps/web/`, so `Sidebar`, `AppChrome`, `Metronome`, `Tuner`,
`AccountPage` etc. are imported straight from the website. Three kinds of alias make that work:

- **Next.js stand-ins** in `src/shims/`: `next/link`, `next/navigation` (on a tiny history-based
  router, `src/router.ts`), `next/dynamic` (React.lazy), `next/image` (plain `<img>`),
  `next/font/google` (Geist bundled via `@fontsource-variable`, the other theme fonts from Google
  Fonts) and `next/font/local` (only the two Petaluma chord fonts, mapped by file name).
- **Native audio modules** in `src/native/` replace four website modules at build time:
  `lib/clickEngine`, `lib/metronome` (`getAudioContext()` returns the native clock),
  `lib/toneGenerator` and `lib/audioInput`. Each imports the original through `@web/…` for
  whatever it doesn't replace. `lib/toolRegistry` is swapped for one with just the two tools, so
  the rest of the site isn't bundled (and split screen only offers those two).
- **`@convex-dev/auth/react`** is wrapped (`src/native/convexAuthReact.ts`) so "Continue with
  Google" goes through the system browser (below). The real package is reached through the
  `convex-auth-react-original` alias.

`src/desktop.css` imports `apps/web/app/globals.css` and adds `@source` lines for the website's
folders, so the Tailwind classes and theme tokens are identical. `publicDir` is
`apps/web/public` (help screenshots, samples). `main.tsx` repeats what `app/layout.tsx` does:
runs the theme/display init scripts, sets the font classes and body classes, and renders the same
providers and chrome (`ConvexAuthProvider` instead of the Next.js one; tokens in localStorage).
`envDir` is `apps/web`, so it reads `NEXT_PUBLIC_CONVEX_URL` from `apps/web/.env.local` — the
desktop app talks to the same (dev) deployment.

The one website change: `lib/clickEngine.ts`'s scheduler was split out as
`runClickScheduler(tracks, output)` with a `ClickOutput` (`now`, `play`, optional `latency`).
`startClickEngine` passes Web Audio exactly as before; the desktop passes the native engine. Same
scheduling code on both.

### The audio engine (`src-tauri/src/audio.rs`)

- cpal 0.18. On Linux it uses cpal's **PipeWire** host (the `pipewire` feature, on by default;
  needs libpipewire + libclang, both in the flake's `desktop` shell), falling back to ALSA.
- One output stream, opened on first use, on its own thread (cpal streams aren't `Send` on every
  platform). JavaScript still decides *when* each click happens (the website's scheduler, 120 ms
  lookahead) and sends batches of `{at, wave, freq, gain, length}` in engine seconds; the audio
  callback places each one on its exact sample. Envelopes match Web Audio's (exponential ramps to
  0.0001). Square and saw are band-limited with PolyBLEP.
- The engine clock (seconds of audio rendered) is emitted as `audio-clock` ~50×/s; `engineNow()`
  in `src/native/engine.ts` extrapolates from the last report with `performance.now()` and never
  goes backwards. Clock jitter only affects when JS sends a batch, not where clicks land.
- The beat display waits for the device's output delay (`latency` in `ClickOutput`).
- Reference tones (Tuner, click previews): `audio_tone_start` / `audio_tone_stop`, with
  `audio-tone-ended` events for the "plucked" ones. Engine calls go through one queue so a stop
  can't overtake its start.
- Input (Tuner): a cpal input stream mixed to mono into a ring buffer; a thread takes the newest
  4096 samples every 30 ms, computes RMS and runs **YIN ported line for line from
  `packages/core/pitchDetect.ts`**, and sends `{freq, level}` over a Tauri `Channel`. The
  sensitivity threshold is applied in JS, like the website.
- Device lists hide PipeWire's `*_default` aliases, other apps' streams (named "unknown") and, for
  inputs, every output's monitor. A program stream with a real name (e.g. `pw-loopback-…`) can
  still show up.
- If the output device disappears (unplugged), the next sound reopens on the system default.
- The **Native audio** chip (`src/NativeAudioChip.tsx`, bottom-right of the Metronome and Tuner,
  built from the website's `SettingChip`/`Select`/`Hint`) picks the output and buffer size
  (default 256 samples; saved per computer under `jam-practice-desktop-audio`) and shows sample
  rate, buffer, device delay and total delay.

### Google sign-in

Google refuses sign-in inside embedded web views, so: the wrapped `signIn("google")` asks Rust
for a one-off listener on `127.0.0.1:<random port>` (`src-tauri/src/oauth.rs`) and passes
`redirectTo: "http://127.0.0.1:<port>/"`. The real `signIn` then sets `window.location` to the
Convex sign-in URL; the `external-links` plugin in `lib.rs` refuses any navigation away from the
app and opens it in the system browser instead. After Google, Convex sends the browser to the
listener with `?code=`; the listener shows "Back to soniroll", emits `oauth-code`, focuses the
window and stops. `src/GoogleSignIn.tsx` finishes with `signIn(undefined, { code })` (the
verifier saved at the start is what makes the code usable, so another program catching it gains
nothing).

`packages/convex/auth.ts` got a `redirect` callback that allows exactly
`http://127.0.0.1:<port>/` and otherwise repeats Convex Auth's default rule (a path on
`SITE_URL`). Pushed to **dev** only; prod gets it with the next production deploy. Google Cloud
needed no change (Google still returns to Convex's own callback URL).

Other links: a capture-phase click handler and a `window.open` override (`src/links.ts`) send any
off-site link to the system browser.

### Gotchas

- `pkill -f vite` (or any pattern in your own command line) kills your own shell. Stop things by
  PID.
- The dev app (`http://localhost:1420`) and the release app (`tauri://localhost`) have separate
  localStorage, so settings and sign-in don't carry between them.
- WebKitGTK needs `WEBKIT_DISABLE_DMABUF_RENDERER=1` on some setups (set in the shell).
- `audio_set_output` is a no-op when nothing changed, because the chip calls it on every mount
  (reopening the stream would cut off a running metronome).
- Linux bundles (`pnpm desktop:build`) weren't tried; AppImage builds are often awkward on NixOS.
  `tauri build --no-bundle` works.

### What was verified, and how

- `tsc` in desktop, web, mobile and convex; `pnpm lint` (desktop, using the website's rules) and
  eslint on the changed web file; `vite build`; `cargo test` (5 engine tests: a click lands on its
  exact sample, late clicks play at once, a decaying tone ends and reports it, a sustained tone
  holds until stopped, YIN finds 440 / 196 / 82.41 Hz within 0.2%).
- Headless Chromium on the Vite server: Metronome, Tuner, a placeholder page and the sign-in page
  at 1440 (light and dark) and 390 — look identical to the website, no console errors except the
  expected "no Tauri" ones, no horizontal overflow.
- The real Tauri window (dev and release builds) under Xvfb, screenshotted: renders like the
  site, sidebar navigation and the ⌘K search work, "Open on soniroll.com" hands the right URL to
  the browser.
- **End-to-end timing**, without making a sound: a temporary PipeWire null sink as the output,
  recorded with `pw-record` while the metronome ran at 100 BPM. 19 clicks, every gap exactly
  28,800 samples (0.000 ms error), accents on beat 1. The chip showed PipeWire, 48 kHz,
  256 samples, 5.3 ms device delay, 11 ms total.
- **Tuner input end-to-end**: a 440 Hz tone played into a temporary loopback "mic"; the tuner read
  440.0 Hz.
- **Google sign-in up to Google**: with a stand-in `xdg-open` that only logs, "Continue with
  Google" opened the Convex URL with the loopback `redirectTo`; Convex answered 302 to Google; the
  listener ignored `/favicon.ico`, answered `/?code=…` and closed.

Not verified: an actual Google login all the way through (needs Jack's Google account), password
sign-in, staying signed in after a restart, anything heard by ear, real latency on Jack's
interface, macOS and Windows (never built), installers.

## 2026-10-27 — every page, and testing without the speakers

- `src/routes.tsx` now carries the website's whole route table (same components, same props,
  the website's redirects; `/` goes to the dashboard). Tools that build their own sounds use the
  window's Web Audio (WebKitGTK → GStreamer, in the `desktop` shell); the click engine, tones and
  mic input stay native. Checked: every route loads in headless Chromium without errors, and a
  Guess the Interval round recorded from a silent sink inside the real window (`PULSE_SINK`).
- **Testing without making a sound:** create a null sink
  (`pw-cli create-node adapter '{ factory.name=support.null-audio-sink node.name=<name> media.class=Audio/Sink object.linger=true audio.position=[FL FR] priority.session=0 }'`),
  run the app with `SONIROLL_AUDIO_OUTPUT=pipewire:<name>` (native engine) **and**
  `PULSE_SINK=<name>` (WebKit's Web Audio), record it with
  `pw-record --target <name> -P '{ stream.capture.sink=true }'`, then `pw-cli destroy <id>`.
  Without both variables, sound goes to the real speakers. Use `XDG_DATA_HOME=<tmp>` so a test run
  doesn't share the app data of a copy Jack has open.
- **Never stop the app with `pidof soniroll-desktop`**: Jack may have his own copy running. Stop
  only the PIDs you started.

## 2026-10-27 — the Recorder records through the native engine

The website's Recorder (and the Shed Log's "Record a clip", same engine) works in the desktop app
without `getUserMedia`/`MediaRecorder`, which WebKitGTK doesn't do reliably (and which can pop
portal dialogs). Nothing in `apps/web` changed.

### What was built

- **`src/native/recorderEngine.ts`** replaces `@/lib/recorderEngine` (alias in `vite.config.ts`
  and `tsconfig.json`), with the same exports: the snapshot store, `startRecording`,
  `stopRecording`, `updateRecorderMetronome`, `setRecorderSongVolume`, `clearRecorderError` and
  the types (re-exported from the website's module, type-only). Same phases (idle → countin →
  recording → finishing), same count-in rule, same song preload, same errors where they apply.
  It never touches `navigator.mediaDevices` or `getAudioContext()`.
- **`src-tauri/src/recorder.rs`** (new module; `audio.rs` only got `find_device` made
  `pub(crate)` and a grouped "Shared with the Recorder" block: `now_nanos()`, `heard_nanos(at)`).
  Commands: `recorder_open(deviceId, mono, autoGain, onLevel)` opens a cpal input and streams the
  level (RMS of the newest 2048 samples × 4, every 70 ms, like the website's meter);
  `recorder_begin(at?)` starts the take; `recorder_stop` finishes it (async, off the main
  thread); `recorder_take` returns the bytes as an `ArrayBuffer` (`tauri::ipc::Response`, no
  JSON); `recorder_cancel`.
- **Input choice:** the Native audio chip now also sits on `/recorder` and there shows an
  **Input** picker (`inputDeviceId` in `jam-practice-desktop-audio`, per computer, like the
  output). A saved input that's gone falls back to the system default, like the Tuner. The Tuner
  keeps its own synced choice.
- **Mono** (Left / Mix / Right) works like the website's: Mix is the average; a mono input gives a
  mono file whatever's picked. Otherwise the input's first two channels are recorded.
- **Auto gain** is a small AGC in Rust standing in for the browser's `autoGainControl`: peak
  envelope, aims at about −12 dBFS peaks, between −12 dB and +18 dB, comes down in ~20 ms and
  goes up over ~2 s, holds still below −50 dBFS (so silence isn't boosted into hiss), and a soft
  clip above 0.8. Off = the raw input.

### The format: MP3

MPEG-1 Layer III, constant bitrate, **128 kb/s mono / 160 kb/s joint stereo** (about 1 / 1.2 MB a
minute, the same as the website's 128 kb/s takes, so the 100 MB quota lasts as long), at the
input's rate when it's 32/44.1/48 kHz (LAME resamples anything else to 48 or 44.1 kHz). Encoded as
it records by LAME (`mp3lame-encoder` crate, which builds LAME 3.100 from source with autotools;
the test build adds LAME's decoder through a dev-dependency feature).

Why not Opus: it's the one compressed format every browser plays and decodes
(`decodeAudioData` + `<audio>`), including Safari versions that have no WebM or Ogg Opus, the
paused mobile app's players, and pure-Rust decoders like Symphonia, which has no Opus decoder —
relevant if the desktop's Web Audio bridge decodes recordings natively. The patents have
expired. The cost is a little efficiency compared with Opus, which doesn't matter at these
bitrates.

**No Xing/LAME tag**, on purpose: browsers disagree on whether they use it to trim MP3's start
delay. Without it nobody trims, so the decoded file always starts exactly `CODEC_DELAY_FRAMES` =
576 (LAME) + 529 (decoder) = **1105 samples** before the take's first sample. Measured the same in
LAME's decoder (unit test), ffmpeg and Chromium. A constant bitrate file has an exact duration
and seeks without the tag (Chromium's `<audio>` read 2.736 s for a 2.736 s file).

LAME is LGPL. Fine for an open-source app that's built from source, but it should go on
`/credits` alongside the other bundled things before a desktop release (not done: that's web
code).

### Timing (what the native engine does better)

- **Count-in:** the take starts on the exact input sample where the first beat after the count-in
  was *heard*. JS gets the first beat's engine time from `latestFirstBeat()`, a small addition to
  `native/clickEngine.ts` (it mirrors `runClickScheduler`'s `startAt = now() + 0.06`, so keep
  them in step), adds the count-in length and passes that to `recorder_begin`. Rust turns it into
  wall-clock time with `heard_nanos` (engine clock + the output's reported delay), and into an
  input frame with markers that every input callback sends (frame number, capture time = now −
  the capture delay cpal/PipeWire report). The worker keeps the last 4 s of processed input, so
  the start can be a little in the past and the JS timer doesn't need to be exact. The website
  just starts `MediaRecorder` when a timer fires.
- **Stop** ends the take on the sample captured at that moment (it waits up to 750 ms for it).
- **`durationSec`** is the real sample count, not wall-clock time.
- **Song line-up** (`songOffsetSec`): `start point − time the song took to start − lead − output
  delay`, where `lead` (from `recorder_begin`) is how long before that moment the decoded file's
  first sample was captured, codec delay included. The song still plays through an `<audio>`
  element (WebKit's media player), whose output delay can't be read, so the native output's delay
  stands in for it.

### Test hooks (like `SONIROLL_AUDIO_OUTPUT`)

- `SONIROLL_AUDIO_INPUT=<device id>` forces the Recorder's input and **never falls back** to the
  default (that would be the real microphone): a missing device is an error. It logs the input
  the app asked for, so you can still check the in-app choice got through.
- `SONIROLL_RECORDER_DUMP=<folder>` saves a copy of every finished take
  (`take-<ms>-<duration>s.mp3`), so a test can check the file without signing in to save it.

### Gotchas

- The Recorder page is signed-in only. To test it signed out, its gate in `Recorder.tsx` was
  bypassed temporarily and restored afterwards (not committed).
- Run test windows inside `dbus-run-session --` with `GDK_DEBUG=no-portals`: WebKitGTK talks to
  the desktop portals over the session bus, and a test window once caused an "Allow apps to use
  the camera?" dialog on Jack's real screen. Headless Chromium inherits your shell's `DISPLAY`,
  so give it a private bus too, and remember the portal services it starts there. Stop them by
  PID (in zsh, `kill $PIDS` doesn't split the list — write the PIDs out).
- A freshly opened PipeWire input delivers ~30 ms of silence before the first real samples (links
  being made). A take started without a count-in begins with that silence. With a count-in the
  input has been open for a bar already.
- cpal prints `recorder input error: Device disconnected` when the stream is dropped at the end of
  a take. It's harmless.
- `pw-loopback`, used as the test "mic", seems to add one quantum (256 samples) of delay that it
  doesn't report. See below.

### What was verified, and how

- `cargo test` (14 tests; 9 new): MP3 round trips (mono 48 kHz: pitch, level, length, starts with
  a plain MPEG-1 frame; stereo 44.1 kHz: each side keeps its own pitch), **the codec delay is
  exactly 1105 samples**, the take assembler (start in the past, in the future, too old → oldest
  kept, end on its frame, stopped before starting = empty), capture-time → frame mapping, mono
  choices, auto gain (quiet comes up, loud comes down, about right stays, silence isn't boosted,
  never clips). `tsc` and `pnpm lint` in `apps/desktop`, `vite build`, `cargo build`.
- **The real window under Xvfb**, sound only to a null sink, the input a `pw-loopback` "mic" fed
  from that sink, in a private session bus:
  - Picked the loopback mic in the chip's new Input picker; the log showed the app asked Rust for
    exactly that device. Only the loopback was linked to the app's capture stream.
  - A 440 Hz tone: a 3.368 s take decoded (ffmpeg) as 440 Hz throughout, 48 kHz stereo, 160 kb/s,
    3.408 s = take + codec delay + padding. The level meter showed about 70% while it played.
    The save dialog's player (WebKit's own `decodeAudioData`) played it.
  - **Metronome at 100 BPM with a 1-bar count-in, recording its own clicks** through the loopback:
    the downbeat is at sample 1364 of the decoded file (expected 1105: 259 samples / 5.4 ms
    late, about one 256-sample quantum, probably `pw-loopback`'s own buffering), and the next
    clicks are exactly 28,800 samples apart (no dropped or doubled samples).
  - Stopping during the count-in: back to Ready, no take, input closed, no error.
  - Mono → Right with a 440 Hz left / 660 Hz right signal: a mono 128 kb/s file at 660 Hz.
  - Headless Chromium: `canPlayType("audio/mpeg")` = probably; `decodeAudioData` and `<audio>`
    gave the same length and click positions as ffmpeg.
- **Not verified:** anything signed in (uploading a take, the quota check, saving from the
  dialog, "Record a clip" in the Shed Log), the song line-up (needs a tune with a song), Firefox
  and Safari decoding these files (expected to work: plain CBR MP3), real microphones and
  interfaces (the actual capture/output delays, and whether the 5 ms above is the loopback or
  something real), more than 2 input channels, input rates other than 48 kHz, unplugging the
  input mid-take, macOS/Windows (LAME builds with autotools / cc there, never tried), anything by
  ear.

## 2026-10-27 — every tool's sound on native audio: the Web Audio bridge

Before this, only the click engine, reference tones and the tuner's mic were native; every other
sound (trainers, piano/Rhodes samples, drums, upright bass, comping, Bass Genius, Drum Generator,
Syncopation, sticking warmup, recordings) went through `getAudioContext()`, which was the
WebKitGTK window's own Web Audio. Now `getAudioContext()` is a **JavaScript stand-in for
`AudioContext`** that forwards the graph to the Rust crate **`web-audio-api` 1.7** (a spec
implementation of Web Audio). No website file changed: it's the same graph, built by the same
code, on a different engine.

### How it fits together

- **JS side** (`src/native/webAudio/`): `context.ts` (`NativeAudioContext`), `nodes.ts` (gain,
  oscillator, buffer source, constant source, compressor, convolver, analyser, splitter, merger,
  biquad, delay, stereo panner, wave shaper, destination), `param.ts` (`AudioParam`),
  `buffer.ts` (`AudioBuffer`, `decodeAudioData`, `PeriodicWave`), `bridge.ts` (transport).
  JavaScript owns the ids (nodes and buffers share one counter, starting at a random number so an
  event from before a page reload can't hit a new node). Every call becomes an op; the ops of one
  tick go to Rust in one `wa_ops` call; calls go through one promise queue so they arrive in order.
- **Rust side** (`src-tauri/src/bridge.rs`): `Graph<C>` maps ids to `web-audio-api` nodes and
  applies ops; generic over the context so the tests render offline. `audio.rs` now only lists
  devices, maps the chip's device onto the bridge, and runs the tuner's input + YIN.
- **It catches every path:** `src/native/webAudio/install.ts` (imported first in `main.tsx`) sets
  `window.AudioContext` to the stand-in, and constructing it returns the one shared instance. The
  `@/lib/metronome` alias alone missed a lot: `playCountOff` (Jam Practice) calls that module's
  own `getAudioContext`, and `uprightBass`, `bassGeniusEngine`, `drumGeneratorEngine` and
  `syncopationEngine` import `./metronome`, which the exact-match alias doesn't see.
  `native/metronome.ts`'s `getAudioContext()` returns the same instance.
- **One output, one clock.** The click engine is now the website's own `scheduleClick` (an
  oscillator into a gain) on the bridge; `native/clickEngine.ts` only waits for the clock
  (`ensureStarted`) and passes the output delay to the beat display. `native/toneGenerator.ts` is
  gone (the website's runs on the bridge). The old cpal mixer in `audio.rs` is removed. Clicks and
  a tool's own sounds share one clock, so nothing can drift between them.

### Decisions

- **Sync reads have JS mirrors.** `currentTime` is the old `audio-clock` extrapolation (Rust sends
  `ctx.current_time() + offset` every 20 ms; every bridge call's reply re-anchors it). A param's
  automation timeline is kept in JS too (`valueAt` in `param.ts`, the spec's rules), so `.value`
  reads what's playing (the tone generator fades a held tone out from `gain.value`; a wrong value
  would jump to 1). Long timelines compact themselves. Analysers are pull-based: each read returns
  the last reply and asks for a fresh one (one frame behind; the very first read is silence).
- **Buffers.** `decodeAudioData` sends the file's bytes to Rust (`wa_decode`, raw binary IPC),
  which decodes with symphonia at the app's rate in an `OfflineAudioContext` (loading a file never
  opens the output), keeps the buffer to play, and returns the channels as raw bytes (16-byte
  header, then planar f32) for `getChannelData` (drum/bass onset detection, waveforms). If Rust
  can't decode a file, the window's own decoder is tried and the buffer goes to Rust when first
  played. `createBuffer` buffers are uploaded (`wa_buffer`, raw bytes) when first used, and again
  if written since; any `getChannelData` call on them counts as a write. Decoded buffers are
  treated as read-only. Nodes and buffers are freed on the Rust side when JavaScript
  garbage-collects them (`FinalizationRegistry`).
- **Lifetimes like a browser's:** a started source is held until Rust reports it ended (`wa-ended`
  event → `onended`), a node holds what it's connected to, and Rust drops a source as soon as it
  ends. A metronome run held 2–4 nodes in Rust the whole time.
- **The spec's exceptions are thrown in JS** (start twice, stop before start, buffer set twice,
  exponential ramp to 0, negative times, bad fftSize), because `web-audio-api` panics on them.
  Anything that slips through is caught per op (`catch_unwind`) and logged as "ignored an op the
  engine refused".
- **Connections are tracked in Rust** because `web-audio-api` doesn't ignore a repeated `connect()`
  (it would double the signal); this also makes disconnects exact.
- **Reopening the output** (the chip's device or buffer size, or the device vanished: the clock
  stalls for 1.5 s and the next sound reopens it) makes a fresh context with an empty graph. Every
  reply carries the output's generation; when it changes, JS replays its live nodes (create,
  channel config, attributes, buffer/wave/curve, each param's current value plus future events,
  connections). Sources already playing are cut off (their `onended` fires). Times stay
  continuous: Rust adds an `offset` so JS's clock never jumps back. `set_sink_id` would keep the
  graph but resets the buffer size to `web-audio-api`'s default, so every change goes through
  reopen + replay instead. The old context is closed on a thread with a 500 ms timeout:
  `close_sync` waits forever on a context whose device has gone.
- **Sample rate** is fixed for the app's life, like a browser's: the forced/default output's rate,
  put in the window before any script runs by a tiny plugin's init script
  (`window.__SONIROLL_AUDIO__`), because tools build reverb impulses at `ctx.sampleRate` as soon as
  they mount. Contexts open at that rate (PipeWire resamples for a device at another rate).
- **Devices:** `web-audio-api` 1.7 uses the same cpal 0.18 (one copy in the lockfile) with its
  `cpal-pipewire` feature, so it's on PipeWire on Linux. It names outputs by description (numbered
  when two share one); `audio::output_sink` maps the chip's cpal id onto that. With
  `SONIROLL_AUDIO_OUTPUT` the mapping is strict: a missing device is an error, never a fallback to
  the default (the speakers). The buffer size becomes a latency hint (next power of two); the
  chip's "Device default" option is gone (the crate always asks for a size), 256 stays the default.
- **The chip** now sits on every tool whose sound is native, not just the Metronome and Tuner. Not
  on the Slow Downer: its playback is a `<video>` element (WebKit's media player, with
  `preservesPitch`), which this bridge doesn't touch; only its waveform decode is native. Not on
  the Recorder either (another agent is replacing `lib/recorderEngine` natively).
- **Not supported:** `createMediaStreamSource`/`Destination`, `createMediaElementSource`,
  `createScriptProcessor`, `createPanner`, `createIIRFilter` throw a clear `NotSupportedError`.
  Until the native Recorder lands, the website's Recorder fails on this branch for that reason.
  `close()` is a no-op (the one shared context stays open); the compressor's `reduction` reads 0.
- Dependencies are built optimized in `tauri dev` too (`[profile.dev.package."*"]`): unoptimized
  convolution and mp3 decoding can't keep up with a 256-sample buffer.

### Gotchas

- A null sink without `node.description` is called "unknown", like other apps' streams and other
  test sinks. The mapping copes (by position), but give test sinks a description.
- `pw-cli ls Node | grep -B3 -A6 <name>` shows the *next* node's id after the match: check the id
  with `pw-cli info <id>` before destroying anything. (One unrelated node was destroyed this way.)
- `pw-record` writes 16-bit PCM unless told otherwise; stop it with `timeout -s INT` so the WAV
  header is finished.
- Test windows must run inside `dbus-run-session --` with `GDK_DEBUG=no-portals`, or WebKitGTK can
  pop portal dialogs (camera, file chooser) on Jack's real desktop.
- Driving the real window without test code in the repo: a scratch Vite config (passed with
  `--config` in `beforeDevCommand`) spreads the repo's config and adds a plugin that injects a
  small polling script; the agent writes JS to a file, the page runs it and posts the result back.
  The config must be `.mts` when it lives outside the package (else Vite bundles it as CommonJS).

### What was verified, and how

- `cargo test` (14: a click lands on its exact sample; three clicks exactly 28,800 samples apart
  at 100 BPM; times keep the offset after a reopen; a repeated connect doesn't double the level;
  disconnect + free silence a node; `disconnect(node)` leaves param connections; an uploaded buffer
  plays at its playback rate and reports `ended`; a one-channel gain sums a stereo sample to the
  middle; refused ops are skipped; the binary formats round-trip; a WAV decodes; the device-name
  picker; YIN), `cargo build` (no warnings), `tsc` and `pnpm lint` in `apps/desktop`, `vite build`.
- In the real window (Xvfb, private D-Bus, everything into a null sink, recorded with
  `pw-record`):
  - **Metronome at 100 BPM: 21 clicks, every gap exactly 28,800 samples** at 48 kHz, accents on
    beat 1 (0.70 vs 0.42). The chip read PipeWire, 48 kHz, 256 samples, 5.3 ms device delay,
    11 ms total.
  - Guess the Interval (sampled piano) played a round. Rust's decode of the piano mp3 matches
    WebKit's decode of the same file (correlation 0.9999 at zero lag, lengths within a sample).
  - The website's tones through its own `playNote`: triangle, organ (PeriodicWave), square, pluck,
    sine and Rhodes all at 440 Hz, peaks within ~1% of the same functions rendered by WebKit's real
    Web Audio (`OfflineAudioContext`): 0.388/0.390, 0.295/0.299, 0.150/0.147, 0.397/0.397,
    0.395/0.394.
  - Drum Generator (samples → compressor → convolver reverb) played, with the reverb tail after
    Stop. Bass Genius (walking bass + piano comping, through the `./metronome` imports) played.
  - Reference tones: a plucked tone's `onEnd` fired at 536 ms (0.5 s + 20 ms stop); a held tone
    stopped with a fade from its level, no jump.
  - Switching the buffer to 512 mid-groove: the drums carried on, the clock went 53.441 →
    53.447 s, 24 nodes were replayed, status showed 512.
  - Slow Downer: a file loaded through its file input, waveform drawn (decoded in Rust), and it
    played (through WebKit's media player, into `PULSE_SINK`).
  - Rust's node count stayed at 2–4 during a 30 s metronome run, and was 1 after Stop.

Not verified: anything heard by ear; a device actually unplugged (the stall → reopen path); a real
interface's latency; the chip's device picker with real hardware (only the forced test sink);
recordings playback (`TimelinePlayer`, needs a signed-in account with recordings), the Syncopation
and sticking-warmup engines, Jam Practice's count-off, Score Writer playback and the Practice
Timer chime (same APIs as what was tested, but not run); macOS/Windows; a release build.

## 2026-10-27 — the website's web-only assumptions, audited (share links, downloads, drops)

Every page rendered, but the website assumes it's served from soniroll.com in a browser. Went
through everything that depends on that, in the real window (WebKitGTK under Xvfb, driven with
`xdotool`; JavaScript run through WebKitGTK's remote inspector, `WEBKIT_INSPECTOR_HTTP_SERVER`,
which works in debug builds).

### Fixed

- **Share links** used `window.location.origin` (`tauri://localhost` in the app). The website now
  asks `lib/siteOrigin.ts` (`window.location.origin`, unchanged behaviour); the desktop aliases
  it to `src/shims/siteOrigin.ts` → `https://www.soniroll.com`. Covers routines, tunes, files,
  notes, lesson invites and booking offers, and the changelog's "Link". Setlists, posts and
  profiles already used a fixed address. New code that builds a link people will open elsewhere
  should use `siteOrigin()`, never `location.origin`.
- **New-tab links to the app's own pages** (the share dialogs' "Open") went to the system browser
  as `http://localhost:1420/…` (`tauri://localhost/…` in release). `src/links.ts` now opens
  same-origin `target="_blank"` links and `window.open` of app pages inside the app.
- **Downloads** (`<a download>`: CSV/JSON/ICS/zip exports, progress cards, stored files):
  WebKitGTK saved them silently into Downloads. `src/downloads.ts` catches them (the anchor's
  `click()`, which the website calls on links it often never adds to the page, and real clicks),
  keeps each blob for a minute after the page frees it (most exports revoke right after
  `click()`), and Rust's `save_download` (`src-tauri/src/downloads.rs`, `tauri-plugin-dialog`)
  shows the Save dialog starting in Downloads and writes the file.
- **Dropping files** (Files, Slow Downer, Shed Notes, the Tunes/Charts drop zones): WebKitGTK
  2.5x gives pages an empty `dataTransfer.files` on file drops (WebKit bug 323277 — dragging
  from a file manager shows only `text/uri-list`), so simply turning off Tauri's handler doesn't
  work. Tauri keeps catching file drops natively; `src/fileDrop.ts` replays them as
  dragenter/dragover/dragleave/drop DOM events at the pointer with real `File`s read through
  `read_dropped_file` (`src-tauri/src/file_drop.rs`, which only serves the latest drop's files).
  `drop` only fires if the page accepted `dragover`, like a browser. On Linux wry only intercepts
  drags that carry file URIs, so dragging inside the page (notes into folders, the calendar) is
  untouched. `tauri.windows.conf.json` turns native drop handling off on Windows (it would break
  in-page drag and drop there, and WebView2 handles file drops itself) — it repeats the window
  settings because Tauri's platform files replace the `windows` array; keep both in step.

### Checked and fine

- Clipboard (`navigator.clipboard.writeText`) works from a click, even ~1 s after it (an awaited
  mutation first). `navigator.share` doesn't exist in WebKitGTK, so `shareLink` copies instead.
- `<input type="file">` opens the GTK file chooser, honours `accept`, and the `File` works (Tunes
  I Know → Import CSV imported two tunes).
- `window.print()` opens the GTK print dialog (Shed Notes printing).
- `mailto:` and other sites' links go to the system's handler / browser; `window.open` of an
  external address too.
- Closing the window fires `pagehide`, so the website's flush-on-leave code (Shed Notes, tool
  time, the day stopwatch) runs. Whether an in-flight Convex mutation gets out before the
  process exits wasn't checked (signed in only).
- No `confirm()`/`prompt()`/`alert()` anywhere (the site uses its own dialogs); no `Notification`
  API (the Practice Timer's alert is the in-page takeover plus its sound).
- Every route at the window's minimum width (380 CSS px): no page-level horizontal scroll and
  nothing sticking out outside a horizontal scroller. Note Xvfb runs at ~100 dpi, so WebKitGTK's
  `devicePixelRatio` is 1.04 there and a 380 px window is only 365 CSS px wide; at 365 the Drum
  Generator page overflows by ~35 px (the site never promises less than 390).
- "/" opens the ⌘K palette, Escape closes it, Enter opens a result (release build). Tauri adds
  no accelerators of its own in release; the site's other shortcuts (Shed Notes, Score Writer)
  weren't tried one by one.
- The app never shows or copies a `tauri://` address (the only `location.origin` reads left are
  in `lib/siteOrigin.ts`; `location.href`/`pathname` reads are for the address bar and feedback).

### Testing safely (portals)

WebKitGTK and GTK talk to the desktop portals over the session D-Bus, so a test window under Xvfb
can still pop dialogs (camera permission, file chooser, print) on Jack's real screen. Run test
windows with `dbus-run-session --` and `GDK_DEBUG=no-portals` (GTK then uses its own in-window
dialogs, which `xdotool` can drive under Xvfb), and give other GTK tools started on the test
display `DBUS_SESSION_BUS_ADDRESS=disabled:` and no `WAYLAND_DISPLAY`. Real users will get portal
dialogs (file chooser, print, camera if anything asks) — that's expected.

File drops can be tested with `ripdrag` (GTK4) as the drag source on the Xvfb display and
`xdotool` moving in small steps (XDND ignores a single jump); `dragon-drop` works too but shows
the same WebKit bug.

### Still wrong / not done

- **The camera-dialog fix (`src/mediaDevices.ts`) doesn't stick on WebKitGTK.** It patches the
  `navigator.mediaDevices` object itself; WebKit drops those properties when it garbage-collects
  that object's JavaScript wrapper and hands out a fresh one later. Seen here: patched at start-up,
  back to the native `enumerateDevices` a few pages later, and the Tuner then raised the camera
  portal again (inside the private test bus). Holding a reference kept the patch; patching
  `MediaDevices.prototype` (`addEventListener`, `enumerateDevices`) instead of the instance is
  the likely fix. Left to the audio side (not changed here).
- Share links made by the **dev** app point at soniroll.com but the dev app writes to the dev
  Convex deployment, so they only resolve once the app talks to prod.
- HiDPI: file-drop positions are divided by `devicePixelRatio` (right on Xvfb, where GTK and
  WebKit disagree by 1.04); not checked on a scaled display. Dropped files are read whole into
  memory (fine for the 100 MB upload cap).
- Never checked: macOS and Windows (WKWebView's `window.print()`, drops with the Windows config),
  anything signed in (stored-file downloads, .ics, Shed Notes export and print, share dialogs,
  whether a Convex write gets out when the window closes).

### Verified (2026-10-27)

`tsc` and `pnpm lint` in `apps/desktop`; `tsc` and eslint on the changed files in `apps/web`
(after `next typegen`); `cargo build` (dev) and `tauri build --no-bundle` (release) in the
`desktop` shell. In the real window under Xvfb, in a private D-Bus session: everything listed
above, plus in the **release** build (`tauri://localhost`): the ⌘K palette, a WAV dropped on
Slow Downer (loaded, 0:02.0), Import CSV → Export all through the Save dialog (bytes checked on
disk), and after closing and reopening the app, localStorage (recents, dismissed intros) and
IndexedDB (Slow Downer's saved file) were still there. Image copy to the clipboard
(`ClipboardItem`, the progress card's "Share image") works after awaits. Theme fonts load from
Google Fonts; Geist and Petaluma are bundled and load.

## 2026-10-27 — the Recorder on the Web Audio bridge

The native Recorder and the Web Audio bridge were built at the same time; this puts the Recorder
on top of the bridge. (It replaces what the bridge section above says about the Recorder failing
and not having the chip.) Nothing changed in `recorder.rs` or `native/recorderEngine.ts` except a
test helper.

- **What the Recorder needed from the old mixer:** `audio::heard_nanos(at)`, when a sound
  scheduled at output time `at` comes out of the speakers, anchored on the audio callback's own
  timestamp; and `latestFirstBeat()` in `native/clickEngine.ts`.
- **The clock tap** (`bridge.rs`): `web-audio-api` doesn't expose when its render callback runs,
  and the clock thread's 20 ms poll of `current_time()` is far too coarse for sample-exact takes.
  So the live graph has one silent node, a Rust `AudioWorkletProcessor` (`ClockTap`), that notes
  the context time and wall clock (`audio::now_nanos()`) at the first render quantum of each
  callback. (A callback asking for 256 frames renders two quanta microseconds apart; quanta less
  than 0.5 ms apart count as one callback.) `bridge::heard_nanos(at)` = that wall clock + (`at` −
  that time) + the output delay, which is the same anchor the old mixer used. `audio::heard_nanos`
  (the "Shared with the Recorder" block) calls it, so `recorder.rs` didn't change. The clock sent
  to JavaScript now also extrapolates from the tap instead of from the polled time.
- `latestFirstBeat()` is back in the bridge version of `native/clickEngine.ts`: first beat = the
  scheduler's first clock reading + 0.06 s, as before (keep it in step with `runClickScheduler`).
- The chip on `/recorder` has the Recorder's Input picker as well as the bridge's output and
  buffer size; every other sound tool has the chip without it.
- **Start-up sample rate:** in one launch cpal's PipeWire host reported 44.1 kHz for the test
  sink, which was running at 48 kHz like the PipeWire graph (cpal takes a node's own `node.rate`,
  or else PipeWire's `clock.rate` setting). Every later reading said 48 kHz and I couldn't get it
  to happen again. At 44.1 kHz PipeWire would have resampled the whole app, so the bridge now asks
  until two readings agree and logs them (`audio bridge: running at … Hz (readings …)`). Cause
  not found; if it shows up again on real hardware, that log line says so.
- The Recorder's two MP3 round-trip tests sometimes failed when they ran at the same time: LAME's
  decoder (mpglib, a test-only dependency) keeps global state. The test decode helper now takes a
  lock.
- The page audit's `downloads.ts` wraps `URL.createObjectURL`/`revokeObjectURL`. Neither the bridge
  nor the native Recorder engine makes blob URLs; the website's own (the Slow Downer's file, a
  take's playback) only get an extra reference until they're revoked.

### What was verified, and how

`cargo test` (23 tests, six runs in a row), `cargo build`, `tsc`, `pnpm lint`, `vite build`, after
merging both the Recorder and the page audit. In the real window (Xvfb, private D-Bus, sound only
into a null sink, a `pw-loopback` "mic" fed from that sink's monitor at session priority 0,
`SONIROLL_AUDIO_INPUT` set to it, takes saved by `SONIROLL_RECORDER_DUMP`, the Recorder's
sign-in gate bypassed for the test and restored afterwards):

- **Metronome at 100 BPM:** 19 clicks recorded from the sink, every gap exactly 28,800 samples.
- **A take of a 440 Hz tone** (played through the bridge, heard by the loopback mic): MP3, 48 kHz
  stereo, 160 kb/s, 440 Hz throughout; 3.528 s decoded for a 3.489 s take (+ the 1,105-sample
  codec delay + frame padding).
- **A take with a 1-bar count-in and the metronome on, recording its own clicks:** "Count-in…" for
  four beats, then "Recording". In the decoded file the downbeat is at sample 1366 (1,105 codec
  delay + 261 samples, 5.4 ms). The Recorder's own test on the old mixer got 1364 and put the
  quantum down to `pw-loopback`, so the bridge's clock tap lines takes up the same as the old
  engine did. Click positions by cross-correlation are exactly 115,200 samples (one bar) apart to
  within 0.01 sample. (Threshold crossings in the MP3 wobble by ±1 sample: codec noise.)
- **Stop during the count-in:** back to Ready, no take written, the input closed (no links left on
  the loopback mic), no error.
- **Jam Practice's count-off** (the website's `playCountOff`, called from the module the app loads
  because the test profile has no tunes to pick): 2 bars at 120 BPM, 8 clicks, every gap exactly
  24,000 samples, accents on the downbeats, on the native context.
- **Syncopation** played (hi-hat count-in, then the pattern); the drum chain stayed at 6 nodes after
  Stop.
- **Random Sticking Warmup:** a rerun had 11 gaps of exactly 28,800 samples, straight through the
  count-off → pattern switch. The first run had one gap 768 samples short (exactly three
  256-frame quanta) with every other gap exact. A late output would make a gap longer, so that
  looks like the recording dropping three cycles; it didn't happen again.
- **Score Writer:** a new score with eight typed notes played back (about 2 s of notes).

Not verified: anything signed in (uploading a take, Record a clip in the Shed Log), the song
line-up, real microphones and interfaces (their real capture and output delays), anything by
ear, macOS/Windows, a release build.

## 2026-10-27 — CI, releases and the Nix package

Set up like Jack's open-stomp-manager, simplified.

- **Version:** the desktop app has its own, starting at 0.1.0, in `apps/desktop/package.json`,
  `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (+ Cargo.lock).
  `apps/desktop/scripts/check-version.sh [version]` checks they agree and that
  `apps/desktop/CHANGELOG.md` has a `## [x.y.z]` section. Tags are `desktop-vX.Y.Z`, not `vX.Y.Z`,
  so they can't be confused with the website's version (which the sidebar still shows).
- **`.github/workflows/desktop-ci.yml`:** on any branch push touching the app, the website, the
  packages, the lock file or the flake. Frontend job: filtered install
  (`--filter "@jam-practice/desktop..."`, which skips the mobile app), version check, `tsc`,
  ESLint, `vite build`. Rust job on Ubuntu 24.04, macOS and Windows: `cargo fmt --check` (Linux),
  `clippy -D warnings`, `cargo test`, `tauri build --no-bundle`. Nix job: `nix build
  .#soniroll-desktop`.
- **`.github/workflows/desktop-release.yml`:** a `desktop-v*` tag builds `.deb`/`.rpm`/`.AppImage`,
  a universal `.dmg` (+ zipped `.app`, ad-hoc signed, not notarized) and a Windows NSIS installer,
  and publishes a GitHub release with that version's changelog section plus install notes. 0.x is a
  pre-release. Unlike open-stomp's, publish runs with whatever platforms built (a failed one is left
  out; the run shows red), so an untested macOS/Windows build can't block Linux.
- **Ubuntu 24.04, not 22.04:** cpal's PipeWire backend asks for libpipewire 0.3.53; 22.04 has 0.3.48.
  The `.deb` depends on `libpipewire-0.3-0t64 | libpipewire-0.3-0`, the `.rpm` on `pipewire-libs`.
- **Releases and the Nix package talk to production Convex** (`grandiose-dolphin-564`), set as
  `NEXT_PUBLIC_CONVEX_URL` in both workflows and in `flake.nix` (it's public anyway). Dev runs still
  read `apps/web/.env.local`. A Vite plugin (`requireConvexUrl`) fails `tauri build` if the URL is
  missing, so a release can't ship pointing at nothing.
- **Nix (`packages.soniroll-desktop`, also `default`, Linux only):** `buildRustPackage` +
  `cargo-tauri.hook`, with `fetchPnpmDeps` over the workspace filtered to the desktop app and its
  workspace dependencies (`pnpmWorkspaces`). The source is a fileset of just the workspace files,
  `apps/desktop`, `apps/web`, `packages/*` and `apps/mobile/package.json` (the lock file's importer
  needs it). The repo's pinned nixpkgs supports `fetcherVersion` 3/4 (not 5 yet). **When
  `pnpm-lock.yaml` changes, the hash must be updated** (set `""`, build, copy the printed hash); the
  CI nix job fails otherwise. Wrapped with GStreamer plugins, glib-networking (TLS for Convex's
  websocket), `ALSA_PLUGIN_DIR` and `WEBKIT_DISABLE_DMABUF_RENDERER=1` as a default. Tests are off in
  the Nix build (CI runs them).
- **Rust formatting:** `src-tauri/rustfmt.toml` (110 wide, `use_small_heuristics = "Max"`) is the
  closest to how the code was written; the code was run through it once. Two clippy fixes:
  `as_chunks::<4>()` for f32 decoding, and `large_enum_variant` allowed on the bridge's `Node`.

## 2026-10-27 — smoother drawing on Linux: the DMA-BUF workaround only for NVIDIA

Jack noticed the desktop app ran at a lower frame rate than the browser. The dev shell and the Nix
package set `WEBKIT_DISABLE_DMABUF_RENDERER=1` for everyone, which forces WebKitGTK off its GPU
(DMA-BUF) path; it's only needed with NVIDIA's driver (blank or broken windows). Now `lib.rs`
(`webkit_gpu_workaround`) sets it at start-up only when `/proc/driver/nvidia/version` exists and
the variable isn't already set, and the flake no longer sets it. Jack's machine: AMD RX 7700/7800 XT,
Hyprland (Wayland). Not verified by me: whether it's smoother (Jack to check), and NVIDIA machines.
