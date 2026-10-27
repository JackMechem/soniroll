# soniroll — project notes for AI agents

This file loads at the start of every session (through `CLAUDE.md`), so it's kept short: what
soniroll is, where things live, the traps that break things, and an index into the detailed notes.
It's hand-maintained, separate from the auto-generated Next.js warning in `apps/web/AGENTS.md`.

## How these docs work (read this first)

- **Always loaded:** this file, [`docs/guides/style.md`](docs/guides/style.md) (how soniroll
  looks and reads), [`docs/guides/versioning.md`](docs/guides/versioning.md) (version bumps and
  the changelog) and [`docs/guides/testing.md`](docs/guides/testing.md) (how to check work).
- **Read before you touch an area:** the matching file in [`docs/notes/`](docs/notes/), listed
  in the index below. These files are the full history of each feature, word for word from the
  old single PROJECT.md: what was built, why, the bugs found, what was and wasn't verified. Before
  changing a feature, read its notes file (and grep `docs/notes/` for the component or file
  names you're touching). Several features have entries in more than one file; the index lists
  them.
- **Other guides:** [`docs/guides/deploying.md`](docs/guides/deploying.md) (Convex dev/prod,
  Vercel, the launch checklist) and [`docs/architecture.md`](docs/architecture.md) (a
  human-facing overview of how the code fits together).
- **Older notes are history, not instructions.** Entries were appended over time and are not in
  date order. A later entry often replaces an earlier one (layouts, names and routes changed many
  times). When notes disagree, trust the code, then the newest dated entry. Paths in entries from
  before the monorepo split are relative to `apps/web/` (or `packages/convex/` for `convex/...`).
- **Writing new notes:** add the session's write-up to the right `docs/notes/` file (or a new one,
  added to the index), in the same plain style: what was built, decisions and why, gotchas, what
  was verified and what wasn't. In this file, only update the index line, and add to "Traps" or
  "Standing rules" if it's something every session must know. Keep this file under ~40k
  characters.

## What soniroll is

A free collection of music practice tools for Jack (a musician and developer) and, now, friends,
family and other musicians: about 25 tools plus a tune/chord-chart library, setlists, files, a practice
log (the Shed Log), a Community, Lessons for teachers and students, and an admin panel. Currently
**v0.10.1 beta** (see versioning).

- **Web** (`apps/web`): Next.js (App Router, a newer version with breaking changes — read
  `node_modules/next/dist/docs/` before using an unfamiliar API) + Tailwind v4, almost all client
  components. The real product. Live at soniroll.com.
- **Mobile** (`apps/mobile`): Expo (SDK 57, Expo Router) iOS/Android app. **Development is paused
  as of 2026-10-18** — Jack may pick it up again later. Until he does, don't build or port features
  to it, don't make builds for his phone, and don't say "mobile isn't done yet" as a to-do in your
  replies. Do keep it from breaking: a change to `packages/core` or a Convex function it calls
  should still pass `tsc` in `apps/mobile`. It's mobile only (it won't replace the website; see
  `docs/notes/mobile-tool-screens-and-sync.md`) and shares the backend and pure logic with web.
- **Backend** (`packages/convex`): Convex — accounts (email + password with emailed codes, and
  Google), synced settings, the chart library, Community, recordings, files, Lessons, admin,
  analytics.
- **Shared logic** (`packages/core`): pure TypeScript used by web, mobile and Convex.
- **Every tool works without an account.** Signed out, data lives in the browser (localStorage /
  IndexedDB). Signed in, it lives in the account. There is **no merge** between the two: signing in
  simply switches which store is read. Some things need an account (Community posting, the Shed
  Log, Lessons, recordings, favorites, Tunes to Learn).
- **It's called "soniroll"** (lowercase) since 2026-10-18 (it was sheddex), with the goal-ring
  logo (`components/Logo.tsx`, drawn from theme colours). The site lives at
  `https://www.soniroll.com` (`soniroll.com` and `sheddex.com` redirect there); emails come from
  `noreply@soniroll.com`. New chart links start with `soniroll://`, and old `sheddex://` links still
  import. On purpose still sheddex: the GitHub repo, lesson calendar UIDs, bass-file format IDs,
  storage keys, the preview demo emails and the paused mobile app — see
  `docs/notes/rename-soniroll.md`. Keep "Shed Log" and "Your shed" (Jack's choice). Don't use
  older names in UI text (sheddex, jackshed, shed.io, Barn Tools). The repo
  folder and package names still say `jam-practice`, and storage keys start with `jam-practice-`
  — leave those alone, changing a key loses people's saved data.
- GitHub: `git@github.com:JackMechem/sheddex.git` — the repo is now named **JackMechem/soniroll** on
  GitHub (the old name redirects). The in-app GitHub links in `Home.tsx`, `Landing.tsx` and
  `app/terms` point at it; the feedback ↔ commit tools use `REPO` in `packages/convex/lib/github.ts`.

## Working with Jack

- He drives development one request at a time and reviews by screenshot. Expect pixel-level
  follow-ups. Do what was asked, then show it; don't widen the scope.
- He prefers plain, concrete explanations over jargon, and short replies.
- He tests the mobile app himself: **build and `adb install` only; never launch, tap or
  screenshot his phone** (details in `docs/guides/testing.md`).
- He watches `localhost:3000` while you work: don't add temporary pages under `apps/web/app/`
  (see testing).
- **Branches:** never work on `main` (it's the live site). Day-to-day work is on `preview`;
  bigger work goes on `<type>/<short-name>` branches off `preview` (naming rules in `README.md`
  under "Branches"). Check `git branch --show-current` at the start of a session, and if you're
  on `main`, ask before changing anything.
- **Commits: you make them.** When a piece of work is finished and checked, commit it on the
  current branch (never on `main`) with `git commit --no-gpg-sign`. His global git config signs
  every commit with his security key, which you can't touch; don't change that config — the flag
  keeps his own commits signed. Write detailed messages: a short first line (what changed, in
  plain words), a blank line, then what and why, and anything not verified. End with the
  `Co-Authored-By` line. When the work is for a piece of feedback, put its ID in the message
  (`Fixes FB-12` when it fixes it, just `FB-12` otherwise) so the admin inbox links it (see
  "GitHub webhook" in `docs/guides/deploying.md`). One commit per coherent change; don't commit half-done work, secrets or
  `.env*` files. Never push (that needs his key) — tell him when there's something to push.

## Repo layout

```
apps/web/          Next.js app: app/ (routes), components/, lib/, public/, next.config.ts,
                   vercel.json, AGENTS.md. Package "@jam-practice/web".
apps/mobile/       Expo app: src/app (routes), src/components, src/lib, scripts/.
                   android/ and android-prod/ are gitignored prebuild output.
apps/desktop/      Tauri desktop app (early test): Vite + the website's own components (aliased,
                   with next/* stand-ins) and a Rust audio engine in src-tauri/.
packages/convex/   Convex functions and schema at the folder's root; convex.json (load-bearing);
                   _generated/ is committed. Package "@jam-practice/convex".
packages/core/     Shared pure logic (themes, navLinks, chords, iRealPro, practiceLog, bassLine,
                   drums, lessonSchedule, ...). Package "@jam-practice/core".
docs/              guides/ (rules and how-tos), notes/ (feature history), architecture.md.
```

- A file moves into `packages/core` only when something outside `apps/web` needs it ("pull,
  don't push"). The old web path keeps a one-line `export * from "@jam-practice/core/X"` shim so
  existing imports keep working.
- Root scripts: `pnpm dev` (web), `pnpm build`, `pnpm lint`, `pnpm convex:dev`, `pnpm mobile`.
  **pnpm only.**
- `flake.nix` provides dev shells (eas-cli, an Android SDK + emulator).

## Traps (things that have broken before)

**Convex**
- `packages/convex/convex.json` (`{"functions": "./"}`) must stay. Without it, `npx convex dev`
  from that folder once pushed an empty schema and **deleted ~30 indexes** on the dev deployment.
- After changing any `packages/convex/*.ts`, run `npx convex dev --once` from `packages/convex`
  (pushes to **dev** and regenerates `_generated/`). `tsc` fails against a stale `api.d.ts`.
- Limits seen in practice: 1 MiB per document, 1,024 fields per object, ~4,096 document reads per
  function. That's why the chart library uses one row per song (bars in their own table), imports
  go in chunks of 150, big deletes are batched by the scheduler, and the `library` query will need
  paging at around 4,000 charts.
- Vercel preview builds get their own empty Convex backend per branch, seeded with demo data by
  `packages/convex/previewSeed.ts` (setup in `docs/guides/deploying.md`). When the schema or data
  shapes it writes change (tunes, charts, setlists, Shed Log, profiles, posts), update the seed.
- New backend code is on **dev** only until a Vercel production build runs `convex deploy`. The
  prod mobile app and soniroll.com don't have new functions until then.
- Convex Auth's Next.js middleware treats any `?code=` URL parameter as an OAuth callback (it
  signed people out). Use other names: `?token=` (password reset), `?invite=` (lessons).
- Cross-user reads must re-check privacy (`isPublic`, hidden lessons, Mayday flags) on the server;
  never trust the client. Account deletion (`account.performDelete`) must cascade into every new
  table that holds a user's data or files.

**Web**
- `useSyncedSettings` / `usePersistedSettings`: always pass a **module-level constant** defaults
  object. Their caches hold the whole stored object and each caller gets its own view
  (`viewOf`); writes merge into the whole object. Don't go back to storing a trimmed copy — that
  once wiped the ear trainers' history.
- Hydration: render nothing date-dependent or localStorage-dependent on the server. If a value
  might differ between server and client, use a CSS class to hide something rather than
  conditionally mounting it.
- Next caches optimized images by URL: when retaking screenshots (landing page `public/landing/`,
  Help `public/help/`), use a new versioned folder and bump the folder constant (`SHOTS`).
- `react-hooks` lint (React Compiler) rejects reading refs during render and calling `setState`
  synchronously inside an effect; restructure rather than disabling the rule.
- In split-screen (tiling) mode, keep the address bar in sync with `history.replaceState`
  (`syncAddressBar`), not Next's router — `router.replace` remounts the pane and stopped running
  audio.
- Tailwind `translate-*` and `hover:translate-*` on one element fight (both set
  `--tw-translate-y`); put centering on a wrapper.
- The dev server reads `next.config.ts` only at startup (restart to see a new version number).

**Mobile**
- Color does **not** go through NativeWind classNames: `vars()` CSS variables never update on
  native. Use `useAppTheme().colors` in inline `style`. NativeWind is for layout only.
- `Pressable`'s function form `style={({pressed}) => ...}` is silently dropped (never applies at
  all). Use a static style plus `android_ripple`.
- Metro resolves `react-native-css-interop` through `metro.config.js` because pnpm leaves a
  dangling symlink for it. Don't add it to package.json — that's what causes the bug.
- `pnpm-workspace.yaml` `overrides` pin `metro*` and `@react-native/metro-config` to one version.
  Two versions in the tree crashed EAS Android builds (`reading 'transformFile'`).
- Hermes: `localeCompare` and `.normalize()` are slow native calls; use `@jam-practice/core/sortText`.
- Android crashed (`IndexOutOfBoundsException`) on a list whose `stickyHeaderIndices` change; don't
  bring that back.
- RN style validators reject `undefined` values (e.g. `transform: undefined`); omit the key instead.
- `expo-audio`'s `AudioPlayer.playbackRate` is read-only; use `setPlaybackRate()`.
  `expo-secure-store` has no web implementation (web uses localStorage for auth tokens).
- `expo start` reads `.env.local` only at startup. Typed routes regenerate only when `expo start`
  runs — after adding a route, run `CI=1 npx expo start --offline` briefly or `tsc` fails.
- `Text.defaultProps` doesn't exist on this RN version; every `<Text>`/`<TextInput>` needs an
  explicit `font-inter*` class (custom fonts have no synthetic bold).
- Screens scrolling under the floating tab bar use `useTabBarSpace()` for bottom padding.

## Standing rules

- **Design and wording:** follow `docs/guides/style.md` (sentence case, theme tokens only, light
  and dark, phone width, option descriptions behind hints, and more).
- **Versions:** follow `docs/guides/versioning.md`. Small steps: PATCH for ordinary updates, MINOR
  only when Jack says. Every bump adds a changelog entry and updates the README's version line.
- **Never name the source the Syncopation exercises were modelled on** (still under copyright),
  anywhere in the site, code, help text or docs. The Random Sticking Warmup likewise doesn't name
  the book its patterns were transcribed from.
- **Licenses:** the Rhodes samples (jRhodes3d) are CC BY-NC — fine for a free site with credit,
  not for anything commercial. Every bundled sample/font is credited on `/credits`.
- **Storage:** every account has 100 MB in total (`packages/convex/lib/storage.ts`; every upload
  path must call `assertHasRoom` / `assertFits`). A new kind of stored file must also be added to
  `storedItems` (so it counts and shows on `/files`) and to `ownedItem` in `files.ts` (rename,
  delete, share by link). Paid plans for more storage are planned, not
  built — and the Rhodes license has to be sorted out before soniroll charges for anything
  (`docs/notes/files-and-tune-sharing.md`).
- **Privacy:** if a feature changes what's stored or who can see it, update `app/privacy` (and
  `app/terms` if it changes the rules).
- **Be honest about verification:** say what was checked and how, and what wasn't (especially
  signed-in flows, audio by ear, and real devices).

## Shared building blocks (reuse before writing new ones)

Web (`apps/web`):
- `ToolLayout` — every tool page. Options render as a row of **setting chips** under the main
  display (`OptionChips`/`SettingsBar`/`SettingChip`); `CollapsiblePanel`/`OptionSection`
  become chips automatically. `optionsMode` holds a mode switch above the chips; `sidePanel`s
  (History, Struggles) are chips above the main display. The title must match the tool's
  `NAV_LINKS` label (icon and intro lookup).
- `packages/core/navLinks.ts` + `components/tools.tsx` — the tool list, categories, icons,
  `CATEGORY_COLORS`; the source for the sidebar, ⌘K palette and Help.
- `lib/useSyncedSettings.ts` (returns `[settings, update, ready]`), `lib/useSyncedTunes.ts`,
  `lib/syncedStore.ts` (debounced, race-safe account writes).
- Meter/tempo: `lib/meterControls.ts`, `components/MeterFields.tsx`,
  `components/metronome/MetronomeOptions.tsx`, `StructureEditor`, `BeatIndicator`.
- Audio: `lib/clickEngine.ts` (run simultaneous clicks as tracks of **one** `startClickEngine`),
  `lib/tones.ts` (`playNote`, `playNotesTogether`, `prepare`), `lib/sampledTones.ts`,
  `lib/uprightBass.ts`, `lib/drumSounds.ts`, `lib/compSounds.ts`, `lib/iosAudio.ts`.
- Dialogs and inputs: `Select`, `SwitchRow`, `ConfirmDialog`, `PromptDialog`, `NumberField`,
  `ContextMenu`, `Flyout`, `LoadingSpinner`, `Hint`, `HelpButton`.
- Library pages: `components/library/ui.tsx` (`Hero`, `KeyBadge`, `Panel`, cards),
  `components/library/shared.tsx` (`PageShell`, `PageHeader`, `BackButton`),
  `components/library/chartView.tsx` (`ChartPaper`, `ReaderBar`). The chart renderer is
  `components/ChordChart.tsx`.
- Site settings: `lib/siteSettings.ts` (`useSiteSettings`: features, sidebar, dashboard, tool
  defaults; synced) and `lib/display.ts` (text size, less motion; this device). New "turn it off"
  or "default" options go there and on `components/settings/SettingsSections.tsx`.
- Activity: `lib/toolTime.ts`'s `useToolActivity(href, running)` drives Shed Log tool time and
  the anonymous usage counts — call it from any tool that "runs".
- Files: `components/files/FileParts.tsx` (`useFileActions` — the ⋮/right-click menu, rename,
  share, delete for any `StoredEntry`; `FileViewer`, `FilePreviewDialog`, `useFileUploader`,
  `TuneFiles`), `FileShareDialog`, `lib/files.ts` (`fileKind`, `formatBytes`, `downloadFile`).
- Help: `lib/helpContent.ts` (a topic per tool, with options), `components/help/ToolIntro.tsx`.
- Notation: `components/notation/ScoreEditor.tsx` (the one notation editor — never write another;
  wrap it with a `header`) and `Score.tsx` (read-only view too); scores via `lib/useScores.ts`.
- Notes: `components/shednotes/AttachedNotes.tsx` (Shed Notes on anything — a `NoteTarget` from
  `packages/core/shedNotes.ts`), `NoteEditor` (CodeMirror markdown editor), `renderNotation` (abcjs).

Mobile (`apps/mobile/src`): `ToolOptionsSheet` (tabbed options sheet — tool screens don't scroll;
essentials on the main screen, the rest in the sheet), `FloatingTabBar` (+ `useTabBarSpace`),
`useAppTheme`, `lib/useSyncedSettings.ts` (offline-first: AsyncStorage, then the account),
`lib/metronomeClickEngine.ts`, `lib/sampledTones.ts` (react-native-audio-api), `Dropdown`,
`InfoButton`, `withScreenLoader`, VexFlow on native in `lib/notation/`.

## Index of notes

Read the file(s) for an area before working on it. All are in `docs/notes/`.

| Area | Files |
| --- | --- |
| History of the name, early overview | `overview.md` |
| Monorepo structure, Vercel root dir, convex.json incident | `repo-structure.md` |
| Mobile: setup, NativeWind theming, device-only bugs, home/menu, Convex on mobile, metronome port | `mobile-foundations.md` |
| Mobile: tool-screen layout, Inter, offline sync, account page, icons, EAS fix, mobile-only pivot | `mobile-tool-screens-and-sync.md` |
| Mobile: Tunes and Chord Charts tabs, the iReal importer rewrite, chart backend (2026-10-07) | `tunes-and-chord-charts-2026-10-07.md` |
| Mobile ports: Guess the Interval/Chord, Slow Downer, metric modulation, sticking warmup | `mobile-tool-ports.md` |
| Web parity: setlists, sharing, Community dashboard, Home, logo | `web-parity-setlists-community-home.md` |
| Recorder (new single-take), recordings backend, tune songs + mixer, mono | `recordings.md`, older multitrack in `tools-slow-downer-recorder-community-home.md` |
| Setlists + standards, "All charts" library and playlists as references | `setlists-and-chart-library.md` |
| Landing page, `/dashboard` routing, forgot password | `landing-and-password-reset.md`; newer shots/teaching section in `launch-admin-analytics.md` |
| Page transitions, Metronome options, setting chips everywhere, Pomodoro editor | `web-ui-patterns.md` |
| Ear training: Guess the Progression, Learn mode, settings-cache fix | `ear-training.md`; originals in `tools-trainers.md` |
| Bass Genius (bass lines, players, transcriptions, comping, drums) | `bass-genius.md` |
| Drum Generator, Syncopation | `drum-generator-and-syncopation.md` |
| Shed Log (practice log, routines, goals, streaks, sharing, cards, the week view and its popover); tool stats, per-tool streaks, the Log button and the reward-look options (`LOG_BY_BUTTON`) | `shed-log.md` |
| Score Writer (`/score-writer`) and the shared notation editor (`components/notation/`: `Score`, `ScoreEditor`, `ScoreDialog`) used by Score Writer, Shed Notes and Bass Genius; clefs, key signatures, re-barring | `score-writer.md` |
| Shed Notes (markdown notes, CodeMirror live preview, vim, `[[links]]`/backlinks, abcjs notation, the JSON settings file, notes attached to routines/days/tunes) | `shed-notes.md` |
| Help page, intros, title style, screenshots | `help-page.md`, `sidebar-library-and-chart-reading.md` |
| Community, profiles, posts, banners, account page | `community-and-profiles.md`, `backend-convex.md`, `tools-slow-downer-recorder-community-home.md` |
| Sidebar, tool categories, Tunes/Chord Charts redesign, full-width pages, chart reading | `sidebar-library-and-chart-reading.md` |
| Lessons (teachers/students, notes, invites, scheduling, assignments) | `lessons.md` |
| Files (uploads, the `/files` browser: rename/delete/share any stored item, storage quota), sharing a tune (`/tune/<id>`) or a file (`/file/<id>`) by link | `files-and-tune-sharing.md` |
| Site settings (Account → Settings: features, theme, text size, sidebar, dashboard, tools, Shed Log defaults; `/settings`) | `site-settings.md` |
| Donations: `/support`, the sidebar's Support row, the dashboard card; why no ads | `support-and-donations.md` |
| The rename to soniroll: new logo, what changed and what didn't | `rename-soniroll.md` |
| iPhone silent-mode audio | `ios-audio.md` |
| Versioning and the changelog (history) | `versioning-and-changelog.md` (rules: `docs/guides/versioning.md`) |
| Jam Practice, Metronome (structures, tempo note value) | `tools-jam-practice-and-metronome.md` |
| Metric modulation, Tuner, Note/Scale/Interval Trainer, Guess the Interval/Chord | `tools-trainers.md` |
| Practice Timer | `tools-practice-timer.md` |
| Chord Charts (parser, renderer, fonts, editor, transpose, `sheddex://` links) | `tools-chord-charts.md` |
| Random Sticking Warmup | `tools-sticking-warmup.md` |
| Slow Downer, old Recorder, Community posts, old Home, legal pages | `tools-slow-downer-recorder-community-home.md` |
| Backend: sync design, auth, email, account page, profiles, follows, file storage | `backend-convex.md` |
| Split screen (tiling panes) | `tiling-split-screen.md` |
| Older shared-conventions list (partly superseded by the section above) | `shared-conventions.md` |
| What was never verified (older list) | `untested.md` |
| Git auto-commit quirk | `environment-quirk.md` |
| Feedback, reports, admin panel, Mayday switches, analytics, launch checklist | `launch-admin-analytics.md` |
| Desktop app (`apps/desktop`): Tauri, reusing web components via aliases, native audio (the Web Audio bridge to `web-audio-api`), Google sign-in through the system browser | `desktop-app.md` |

## Current state at a glance (2026-10-18)

- **Web routes:** `/` landing, `/dashboard`, one route per tool, `/tunes*`, `/chord-charts*`,
  `/setlist-charts`, `/community*`, `/post`, `/u/[username]`, `/shed-log*`, `/lessons*`,
  `/recordings*`, `/files`, `/support`, `/account`, `/help`, `/changelog`, `/feedback`, `/admin`, `/reset-password`,
  shared links `/setlist/[id]`, `/routine/[id]`, `/tune/[id]`, `/file/[id]`, plus `/privacy`, `/terms`,
  `/credits`.
- **Mobile (paused):** a bottom tab bar (Home · Tunes · Chord Charts · Community · Profile) and
  native screens for most tools (`src/app/tool/`); anything not ported opens the `[slug]`
  placeholder. Web-only so far: Bass Genius, Drum Generator, Syncopation, the Shed Log, Lessons and
  Files / tune and file share links.
- **Accounts and roles:** the owner is `mechemjack@gmail.com` (verified email, hardcoded in
  `packages/convex/lib/roles.ts`); the owner can make other accounts admins. Mayday switches
  (maintenance, Community off, pause posting/sign-ups/uploads/feedback, banner) are owner-only.
- **Not yet done before launch** (only Jack can do these): deploy the backend to prod, publish the Google OAuth consent screen, turn on
  Convex backups — see `docs/guides/deploying.md`.
