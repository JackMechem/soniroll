# soniroll

**Current version: v0.10.2 (beta)** · [What's new](https://www.soniroll.com/changelog)

Free practice tools for musicians, in the browser: a metronome (odd and changing meters,
polyrhythm modulation), a tuner, ear training with levelled learning paths, note, scale and
interval trainers, chord charts (with iReal Pro import), a jam-practice tune picker, a bass-line
and drum generator to play along with, a slow-downer/looper, a recorder, a practice log with
streaks and goals, setlists, your files (PDFs, recordings, lead sheets) with share links, a community, and tools for teachers and students.

No ads, no paywalls. Every tool works without an account; signing in syncs your stuff between
devices.

**Use it:** [soniroll.com](https://www.soniroll.com)

**Found a bug, or want a feature?** Use [soniroll.com/feedback](https://www.soniroll.com/feedback)
(also in the sidebar's ⋮ menu), or open a GitHub issue.

## Running it locally

You need Node and [pnpm](https://pnpm.io) (pnpm only — no npm or yarn).

```bash
pnpm install
pnpm convex:dev   # the Convex backend (needs a Convex account and packages/convex/.env.local)
pnpm dev          # the website at http://localhost:3000
pnpm mobile       # the Expo app (development is paused)
```

The web app reads `NEXT_PUBLIC_CONVEX_URL` from `apps/web/.env.local`; the mobile app reads
`EXPO_PUBLIC_CONVEX_URL` from `apps/mobile/.env.local`.

### The desktop app (early test)

`apps/desktop` is a [Tauri](https://tauri.app) app that reuses the website's own components and
plays sound through a native (Rust) audio engine. It has every tool and page. In development it
uses the same Convex deployment as `apps/web/.env.local`; releases use production. You need Rust,
plus the system libraries from the flake's `desktop` shell on Linux:

```bash
nix develop .#desktop   # Linux: WebKitGTK, PipeWire, ALSA
pnpm desktop            # opens the app (with hot reload)
pnpm desktop:build      # a release build and installers, in apps/desktop/src-tauri/target/release
```

**Installing a release.** Downloads for Linux (`.deb`, `.rpm`, `.AppImage`), macOS (`.dmg`) and
Windows (`-setup.exe`) are on the [releases page](https://github.com/JackMechem/soniroll/releases).
On NixOS, run it straight from the flake, or add it to your configuration:

```nix
# flake.nix inputs (pin a release tag)
soniroll.url = "github:JackMechem/soniroll/desktop-v0.1.0";

# configuration.nix
environment.systemPackages = [ inputs.soniroll.packages.${pkgs.stdenv.hostPlatform.system}.soniroll-desktop ];
```

```bash
nix run github:JackMechem/soniroll/desktop-v0.1.0
```

**Releasing.** The desktop app has its own version, separate from the website's: bump it in
`apps/desktop/package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (then
`cargo build` for the lock file), add a section to `apps/desktop/CHANGELOG.md`, and check with
`apps/desktop/scripts/check-version.sh`. Pushing a tag `desktop-vX.Y.Z` builds the installers and
publishes the GitHub release (`.github/workflows/desktop-release.yml`). Every push that touches the
app, the website or the packages runs the desktop checks (`desktop-ci.yml`). If `pnpm-lock.yaml`
changes, the flake's `pnpm` hash for the desktop package changes too: set it to `""`, run
`nix build .#soniroll-desktop`, and copy in the hash it prints.

## Repo layout

| Folder | What's in it |
| --- | --- |
| `apps/web` | The website (Next.js + Tailwind) |
| `apps/mobile` | The iOS/Android app (Expo). Development is paused for now; it may pick up again later. |
| `apps/desktop` | The desktop app (Tauri), an early test: the website's components with native audio |
| `packages/core` | Shared logic used by both apps and the backend |
| `packages/convex` | The backend ([Convex](https://convex.dev)) |
| `docs` | [How it fits together](docs/architecture.md), [style guide](docs/guides/style.md), [versioning](docs/guides/versioning.md), [testing](docs/guides/testing.md), [deploying](docs/guides/deploying.md), and [feature notes](docs/notes/) |

## Branches

Nobody works directly on `main` any more.

| Branch | What it's for |
| --- | --- |
| `main` | What's live on soniroll.com. Only changes from `preview` are merged in, when a version is ready to release. |
| `preview` | Where day-to-day work happens and gets tested before release. |
| `<type>/<short-name>` | Optional, for a bigger or riskier piece of work. Branch off `preview`, merge back into `preview` when done, then delete it. |

**Naming work branches:** `<type>/<short-name>`, lowercase, words joined by hyphens, a few words
at most, no dates or version numbers.

| Type | Use it for | Example |
| --- | --- | --- |
| `feature/` | A new tool, page or ability | `feature/bass-genius-mobile` |
| `fix/` | A bug fix | `fix/shed-log-streak-reset` |
| `design/` | Visual or wording changes, no new behavior | `design/sidebar-cards` |
| `refactor/` | Restructuring code without changing what it does | `refactor/synced-settings-cache` |
| `docs/` | Documentation only | `docs/branch-guidelines` |
| `chore/` | Dependencies, build and tooling | `chore/expo-sdk-58` |

**Releasing:** bump the version on `preview` (see [docs/guides/versioning.md](docs/guides/versioning.md)),
check it, then merge `preview` into `main`. Merging into `main` is what updates the live site.

Every branch except `main` also gets a Vercel preview site with its own separate backend and demo
data; see [docs/guides/deploying.md](docs/guides/deploying.md#preview-deployments).

## Versioning

soniroll uses semantic versioning and is in beta until 1.0. The version is set in
`apps/web/package.json`, and every release is listed at [soniroll.com/changelog](https://www.soniroll.com/changelog)
(entries live in `apps/web/lib/changelog.ts`). See [docs/guides/versioning.md](docs/guides/versioning.md).

## Credits

Samples and fonts are by their authors under their own licenses; see
[soniroll.com/credits](https://www.soniroll.com/credits).
