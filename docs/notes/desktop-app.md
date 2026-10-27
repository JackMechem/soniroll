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
