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
