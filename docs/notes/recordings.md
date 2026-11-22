<!-- Moved word for word from the old single PROJECT.md (lines 1603–1744) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Mobile: a new, simple Recorder linked to tunes, with recordings on the backend (2026-10-08)

Jack wants the Recorder reworked everywhere — no multitrack, just one take at a time with an
optional metronome, recordings saved to the account and linkable to tunes. **Mobile first; the web
Recorder is still the old multitrack one** (and the shared `navLinks` description still says so).

- **Backend** (`packages/convex/recordings.ts`, schema `recordings` — **dev deployment only** until
  Jack pushes): one row per recording (name, notes, durationSec, mimeType, optional `tuneId`) with
  the audio in Convex file storage. `generateUploadUrl` → POST file → `create`; `list`,
  `listForTune`, `get` (each with the file `url`), `update` (rename / notes / `tuneId`, `null`
  unlinks), `remove` (deletes the file too). `tuneId` is a plain string (tunes live inside the
  synced tunes blob), so a recording whose tune was deleted just shows as unlinked. Account
  deletion now also deletes recordings and their files.
- **Recording** (`apps/mobile/src/lib/recorderEngine.ts`): `react-native-audio-api`'s
  `AudioRecorder` with file output — M4A/AAC, mono, 44.1kHz, 128kbps (~1MB/min) — plus an RMS level
  meter from `onAudioReady`. The optional metronome is the shared `metronomeEngine`; with a count-in
  the take starts on the downbeat after it. Its click goes through the speaker, so the mic records
  it unless you wear headphones.
- **Screens**: `tool/recorder` (big record button, timer, level, metronome on/off + tempo; count-in,
  beats per bar, sound in Options; signed out → sign-in prompt; `?tuneId=` records for that tune with
  the metronome at the tune's tempo), `recordings/save` (listen back, name — "Take N" for a tune,
  else date/time — tune link, notes; Discard asks first, back is blocked), `recordings/[id]` (play,
  rename, notes, link/change/unlink tune, delete), `recordings/index` (My recordings: search, inline
  play). A tune's page (`library/tune.tsx`) has a **Recordings** section: its takes (inline play),
  "Record a take" and "Link existing". Playback is `expo-audio` streaming the Convex URL, one
  player per screen (`useRecordingPlayer`). Settings key `jam-practice-recorder-take`.

Verified: `tsc`/`eslint`, the Convex push (only added the table + 2 indexes), signed-out calls
behave (`list` → `[]`, upload refused), release build installed. **Recording, upload and playback
not yet tried on the device.**

Follow-up: the Recorder's metronome is now the full Metronome tool — same settings shape (stored
under `jam-practice-recorder-take`, separate from the Metronome tool's own), same on-page controls
(tempo + tap, time signature, the tappable beat strip with sub-accents, lit while clicking) and the
same options (tempo note value, accent grouping, subdivision, structures, sound) behind an Options
button inside the metronome section, plus a Count-in tab. Changes mid-take apply live
(`updateRecorderMetronome`); the count-in length follows the first section of a structure and the
tempo note value.

Follow-ups from the first real device test: (1) uploads failed with a 400 — `fetch(file://…).blob()`
handed Convex an empty body on Android; `uploadRecordingFile` now streams the file natively
(`expo-file-system/legacy`'s `uploadAsync`, binary body) and surfaces Convex's error text. (2) Takes
were very quiet: `react-native-audio-api`'s recorder is patched to always open the mic
`Unprocessed` (for the tuner). Takes now record through `expo-audio`'s recorder instead (created
directly via `AudioModule.AudioRecorder`, metering polled for the level meter) with an **Auto gain**
toggle (default on) choosing Android's `camcorder` source (system AGC) vs `unprocessed`. The tuner's
own input is unchanged. (3) The recording page shows a header Save button while name/notes have
unsaved edits, and saves them on leaving too.

**Recordings in shared setlists:** `convex/lib/setlists.ts`'s `liveSetlist(…, "full")` — what a
setlist share link (`setlists.getShared`) and a Community setlist post (`communityTunes.get`) read —
now attaches each tune's recordings (`PublicTune.recordings: PublicRecording[]`: id, name, duration,
date, file URL; **never notes**), so anyone the setlist is shared with can play them. Only the live
setlist carries them (a deleted setlist's stored snapshot has none). Mobile `PublicSetlist`: a mic
button with the count on a tune row expands its recordings inline (play only); web `PublicSetlist`
lists them with native `<audio controls>`. "Save as my setlist" doesn't copy recordings
(`toOwnTune` copies explicit fields only). Verified: deployed to dev, a share link fetched signed out
still works; not yet seen with a tune that actually has recordings.

### Web: the new Recorder + recordings, replacing the multitrack Recorder (2026-10-08)

The web app now matches the mobile Recorder; the old multitrack recorder is gone (`Recorder.tsx`
rewritten; `lib/{clips,splice,multitrack,projectStore,syncBurst,alignBeat,wav}.ts` deleted — only
it used them; Slow Downer's `Waveform`/`audioFile`/`fileLibrary`/`markers` stay). Old multitrack
projects lived only in each browser's IndexedDB and are no longer reachable. `navLinks`: Recorder
is no longer `desktopOnly` and has a new description.

- `lib/recorderEngine.ts` (web): `MediaRecorder` on `getUserMedia({ autoGainControl, echoCancellation:
  false, noiseSuppression: false })` — **Auto gain** maps to the browser's `autoGainControl`. Picks
  `audio/mp4` (AAC where the browser has it) before WebM/Opus. Level meter via an `AnalyserNode`.
  Metronome = the Metronome tool's own `lib/metronomeEngine.ts`, count-in like mobile.
- `components/Recorder.tsx`: `ToolLayout` with the metronome's options in the options column
  (Meter & subdivision incl. structures, Count-in, Metronome sound), main area: timer, level,
  record button, Auto gain, a Metronome section (`TempoHero` + tempo-note picker + `BeatIndicator`),
  recent recordings. Same settings key as mobile (`jam-practice-recorder-take`). `/recorder?tuneId=`
  records for a tune. Stopping opens `SaveTakeDialog` (preview, name, tune, notes).
- `/recordings` (`components/recordings/RecordingsPage.tsx`) and `/recordings/view?id=`
  (`RecordingPage.tsx`: play, rename, notes with Save button + save-on-leave, link/unlink tune,
  delete). `TuneHub` has a Recordings section (`TuneRecordings`). Playback is native `<audio>`.
- Gotcha hit and fixed: revoking the take's object URL in an effect cleanup broke the preview in
  dev (React's double-mount) — it's revoked on Save/Discard instead.

Verified: `tsc`, `eslint`, `next build`; in nix Chromium with a fake microphone: metronome on →
count-in → recording → Stop → save dialog with a playable 1.7s take, no console errors (signed-out
gate temporarily bypassed for the check, then restored). Upload/list/playback of saved takes on web
not exercised (needs a signed-in session).

### Web: a tune's song behind its recordings, with a mixer (2026-10-13)

A tune page's Recordings section has a **Song** row: upload an audio file of the actual tune
(mp3/m4a/wav/…, ≤100 MB), replace or remove it. Backend (**dev deployed only**):
`packages/convex/tuneSongs.ts` (`getForTune`, `set` — replaces and deletes the old file —,
`remove`; table `tuneSongs`, one per `(userId, tuneId)`, file in Convex storage, uploaded through
`recordings.generateUploadUrl`), and `recordings.mix` (optional `{songVolume, takeVolume,
offsetSec}`, accepted by `create`/`update`, returned by every recordings query). Account deletion
deletes songs and their files.
- `components/recordings/MixPlayer.tsx` is a small DAW-style track view (after the old multitrack
  Recorder): Song and Take tracks, each with a header (mute, solo, level meter, volume fader) and
  its region drawn as a waveform on one canvas with a ruler (0:00 = the take's start) and a
  playhead. Click/drag the ruler or lanes to seek/scrub, drag the Song region sideways to line it
  up (or nudge ±1 s/0.1/0.01), Ctrl/⌘+wheel or −/+/Fit to zoom, sideways wheel to pan, Space to
  play. `lib/recordingPlayback.ts` downloads and decodes both files (`fetch` — Convex storage
  sends CORS headers for the site's origin; LRU cache of 4) and plays them as `AudioBuffer`s on
  one clock (`TimelinePlayer`), one timeline at a time site-wide. The first version streamed two
  `<audio>` elements, and seeking jumped back — browser-recorded files often aren't seekable when
  streamed. `compact lazy` (the tune page's cards) downloads nothing until Play. `SavedMixPlayer`
  saves mix changes to the recording (600 ms debounce, and on unmount); the save dialog uses it too.
  **Editor** (the transport's maximize button) turns the same view full screen (`fixed inset-0`,
  lanes share the height, Esc closes, page scroll locked) without reloading anything. **Snap** (on by
  default): a dragged Song region's start or end snaps, within 10 px, to the take's start/end, the
  playhead, or a ruler line (major and half-step lines, both drawn full height); clip edges and the
  playhead win over ruler lines; Alt drags freely; an accent line shows the snap. Verified in nix
  Chromium: a drag ending near the take's start landed exactly on 0, Alt left −0.37, one ending
  4 px from the 1 s line landed on it, one 12 px away didn't snap; Esc closed the editor.
  **Phones:** the track headers shrink to 4.5rem (name, M/S, meter) and the faders move to a row
  under the tracks; full-screen lanes are capped (190 px on phones, 340 px otherwise). Touch: a tap
  moves the playhead, a horizontal drag scrubs or moves the Song region (it waits 6 px to tell a
  drag from a page scroll — outside full screen the lanes are `touch-pan-y`, and a cancelled
  gesture undoes the drag), two fingers pinch-zoom and scroll. Checked at 390 px with emulated
  touch (tap, pinch, a snapped drag, full screen).
- **Recorder** (`?tuneId=` with a song): "Play the song" (setting `playSong`), start point (±5 s),
  song volume (`songVolume`, live). `lib/recorderEngine.ts` preloads the song during the count-in,
  starts it with the take, and the finished take carries `songOffsetSec` = start point − the time
  the song took to start − output/input latency; the save dialog previews the take over the song
  and saves that mix. The mic records the song too unless you wear headphones.
- Track view verified in nix Chromium (temporary page, generated audio): seeking paused and while
  playing sticks, dragging the Song region changes the line-up, zoom, the lazy card; no errors.
- The first player was verified the same way: song position stayed within ~50 ms of take + offset through play, nudges, a negative offset (song comes in
  late), pause, seek and the end; volumes applied; and a fake-mic take with the song started at
  5 s came back with a 4.979 s line-up. `tsc` (web, mobile, convex), `eslint`, `next build`.
  **Not verified:** anything signed in (uploading a real song, the tune page/recording page/Recorder
  UI with real data), and how well the automatic line-up matches by ear. **Mobile not done yet** —
  it ignores `mix` and has no song upload.

**Mono recording (web Recorder, same day):** a **Mono** switch under Auto gain (settings `mono`,
`monoSource`: Left / Mix / Right) for interfaces that put a single mic on one side only.
`lib/recorderEngine.ts` routes the mic through Web Audio into a one-channel
`MediaStreamDestination` (a channel splitter for Left/Right, a 1-channel downmix for Mix = the
average, so a one-sided mic comes out half as loud) and records that. Verified in nix Chromium
with a fake right-only stereo input: off → 2 channels (0 / 0.707 RMS), Right → 1 channel 0.708,
Mix → 0.354, Left → silence. Takes already recorded one-sided aren't changed.


**Takes without a song scrub now (2026-10-20):** a take recorded in the browser is WebM with no
duration or seek index, so the browser's `<audio>` couldn't scrub it (reported on Mac Firefox: the
playhead stuck at the end). Takes without a song now play in `components/recordings/TakePlayer.tsx`:
Play/Pause, a `.slider` scrubber and the times, decoding the file on the first Play with
`loadAudio` and playing it on a one-track `TimelinePlayer` (stored `durationSec` shows the length
before then). Used on the recording page, the recording cards and the save dialog. Checked in
headless Chromium with a MediaRecorder WebM made on the page: play, scrub, stop at the end. Not
checked in Firefox itself.

## 2026-11-17 — The Recorder redesigned: input level, level check, chips

Jack: "redesign the recorder and make it more functional… the auto gain is stupid… it's just a
mess". Before: a big metronome panel on the left, Auto gain / Mono switches under the button, a tiny
level bar only while recording, recent recordings below.

- **Layout** (`components/Recorder.tsx`, the normal `ToolLayout`): status, a big timer, a **level
  trace** (64 bars, about 4.5 s, red where the peak distorted), a hint line ("Too loud — turn the
  input level down", "Very quiet…", "Check the level before you record"), the beat strip when the
  metronome is on, then **Check level** beside the record button. Chips: **Input** (microphone —
  `listAudioInputs`, so the desktop's native list too —, **Input level** 0–400 %, Channels
  Stereo/Left/Both/Right, Auto gain), **Metronome** (a split chip: switch + the full Metronome
  settings incl. changing meters), Count-in and Click sound (with the metronome), **Song** (split
  chip, when the tune has one). **Recent takes** is a chip above the display (last 5 + All
  recordings). Space starts/stops a take. Presets skip the input fields.
- **Settings:** `inputDeviceId`, `inputGain`, and `autoGainOn` (default **off**) replacing
  `autoGain` (default on before; the old field stays in stored settings, unused on web — the paused
  mobile app still reads it).
- **Engine** (`lib/recorderEngine.ts`): a `RecorderInput` (deviceId, autoGain, mono, gain). The mic
  always goes source → gain → (mono) → the recorded stream, meter after the gain. `startMonitor` /
  `stopMonitor` open the input just to meter it; a take started from there reuses it (no second
  permission prompt); changing mic/channels/auto gain while checking reopens it; `setRecorderGain`
  changes the level live (also mid-take). The snapshot has `monitoring` and **`peak`** (the loudest
  sample): "too loud" = peak ≥ 0.9, not the meter level (that's RMS × 4, which tops out around
  −12 dBFS, far from distortion).
- **Desktop** (`apps/desktop/src/native/recorderEngine.ts`, `src-tauri/src/recorder.rs`): the same
  API. `recorder_open` takes `gain` (applied before auto gain and the soft clipper) and a new
  `recorder_set_gain` changes it live (an `AtomicU32` shared with the audio thread); the level channel
  now sends `(level, peak)`. A level check is `recorder_open` without `recorder_begin`. New Rust test
  `manual_gain_scales_and_changes_live`.
- The Shed Log's quick recorder (`RecordClip`) passes the new input shape (auto gain on there, as
  before).
- Verified: `tsc` (web, desktop), eslint, `cargo test --lib recorder` (10 pass), clippy. In a
  separate muted headless Chromium with a fake microphone, as the demo account: Check level → the
  trace moves and (the fake beep peaks at 1.13) "Too loud"; Input level 50 % → the warning cleared
  live, the chip read "Default mic · 50%"; a 3.5 s take → Recording → the save dialog; Discard; 390 px
  without overflow; no console errors.
- Not verified: the desktop app's native path by ear or in the window, a real interface's channels,
  the Song chip with a real song, the help page's old Recorder screenshot (`shot: "recorder"`) needs
  retaking.


## 2026-11-18 — Recordings moved into the Library route (FB-28)

Jack's feedback: Files and Recordings in the Library were separate routes; everything should be on
the Library's route. Files already was (`/tunes?tab=files`); Recordings now is too.

- **The Recordings tab** is `/tunes?tab=recordings`: `"recordings"` joined `LibraryTab` /
  `LIBRARY_TABS` (`components/library/ui.tsx`) and `LibraryHub` renders `RecordingsPage` for it.
  `RecordingsPage` already drew the Library hero and tabs (it was dressed as the last tab while
  living at `/recordings`), so it's reused unchanged apart from its links. The tab row was already
  five tabs wide, so nothing changed at 390px (it fits: "Chord Charts" shows as "Charts" there).
- **One recording** is `/tunes/recording?id=…` (`app/tunes/recording/page.tsx`, title "Recording"),
  next to `/tunes/tune`. Its Back uses `goBackOr(router, "/tunes?tab=recordings")`, deleting lands
  on the tab with `router.replace`, and the "doesn't exist anymore" state now has a Back too. The
  sidebar keeps Library lit there through its `/tunes/` prefix check.
- **Old addresses:** `app/recordings/**` was deleted. `next.config.ts` redirects `/recordings` →
  `/tunes?tab=recordings` and `/recordings/view` → `/tunes/recording` (non-permanent; Next passes
  the query through, so `?id=` carries over — no thin redirect page needed). The desktop router
  (`apps/desktop/src/routes.tsx`) dropped its two routes, added `/tunes/recording`, and maps both old
  paths in `redirectFor`. Sidebar's `isLibraryPath` still lists `/recordings` (harmless).
- **Links updated:** `RecordingParts` (card name), `RecordingsPage`'s ⋮-menu entry, the Recorder's
  "All recordings" link and its after-save page, the ⌘K palette's Recordings page, Help's Recordings
  topic, the Files tab's "All recordings" (now an in-place tab switch, `replace`), and the `href`
  `files.storage` returns for recordings (`packages/convex/lib/storage.ts`, pushed to dev).
  The paused mobile app has its own native `/recordings` routes, untouched.
- **Verified** (headless Chromium, signed in on the test account with two seeded device-kept
  recordings, deleted afterwards): the tab at 1440 and 390, light and dark, no overflow, no console
  errors; Files tab → Recordings tab click; Files' "All recordings" → the tab; a card's name → the
  recording page; Back with history and with none (falls back to the tab); delete → the tab; a
  deleted id's page. `curl` showed both old addresses 307 to the new ones on the dev server. Not
  checked: the desktop app (types only), playback (device-kept seeds have no audio here).

## 2026-11-22 — Record the computer's sound too (Recorder, off by default)

Jack: the Recorder should also be able to record desktop audio (a song playing in Spotify), only
when turned on.

- **Setting:** `desktopAudio` (default false) in the Recorder's synced settings; a switch "Record the
  computer's sound too" in the Microphone chip, shown only where it can work
  (`canRecordDesktopAudio`, read through `useSyncExternalStore` so it's false on the server). Kept out
  of presets? No: it's an option like the others. Help line added.
- **Website** (`lib/recorderEngine.ts`): `startRecording` asks `getDisplayMedia` *before* the
  microphone (the share prompt needs the click's activation), with `systemAudio: "include"` and
  `selfBrowserSurface: "exclude"`; the video track is stopped at once; no audio track → "Nothing to
  hear there…". Its source connects straight to the take's `MediaStreamDestination` (`recordDest`),
  so it skips the input level, mono pick and meter (mono down-mixes it). Released with the input.
  Works where Chromium shares audio: a tab anywhere, the whole screen's sound on Windows/ChromeOS
  (not Firefox or Safari: the switch hides when `getDisplayMedia` is missing, and on phones).
- **Desktop** (`recorder.rs`): `recorder_open(desktop_audio)` opens a second cpal stream *as an
  input on the output device* (the forced `SONIROLL_AUDIO_OUTPUT`, else the default output):
  PipeWire records that output's monitor, WASAPI records loopback. `Loopback` resamples it to the
  input's rate (linear) and adds it to the processed frames after the meter (`soft_clip` on the
  sum); its backlog is kept under a quarter of a second (the two clocks drift), and where nothing
  has arrived yet the input is left as it is. Everything the computer plays is in it, the app's own
  metronome click too. A failure to open it fails `recorder_open` with "Couldn't record the
  computer's sound…", which the wrapper shows as such. `sameInput` includes `desktopAudio`, so a
  level check (opened without it) is reopened for the take.

Verified: `cargo test` (11 recorder tests; new `loopback_mixes_in_and_resamples`: 48 kHz into a
44.1 kHz take, mono averaging, nothing waiting), `cargo clippy --all-targets -D warnings`; on this
PipeWire machine, a null sink with a 440 Hz tone played into it (`pw-play --target`, nothing to the
speakers) recorded through `build_loopback` (ignored test `loopback_hears_an_output`): rms 0.212 (=
0.3/√2), 439.8 Hz. Web: `tsc`, eslint, desktop `tsc`. In headless Chromium signed in (throwaway
accounts, deleted): the switch shows in the Microphone chip; with it on, Record auto-picked a tab
playing a tone (`--auto-select-tab-capture-source-by-title`), the share came back with an audio
track and a 3.9 s take was made with no errors — but the take was silent, most likely because the
test browser runs with `--mute-audio` (kept on so nothing plays aloud), so the tab's sound reaching
the take is **not verified** on the web. Not verified either: the whole desktop app recording a
take with it (only the loopback stream and the mixer separately), Windows WASAPI loopback, macOS
(likely refused without a capture permission/aggregate device), real Spotify, the alignment between
the song and the microphone (tens of ms apart is expected).
