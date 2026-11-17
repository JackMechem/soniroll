# Checking your work

What to run before calling something done, how to see the app for real, and the rules about
Jack's devices. Report honestly: what was checked, how, and what wasn't.

## Always

- **Types:** `npx tsc --noEmit` in every package you touched (`apps/web`, `apps/mobile`,
  `packages/core`, `packages/convex`). A change in `packages/core` can break any of them.
- **Lint:** `pnpm lint` (web) / `npx eslint <files>` (mobile). Fix React Compiler (`react-hooks`)
  errors by restructuring, not by disabling.
- **Build:** `pnpm build` for web changes that touch routing, config or many files.
- **Convex:** after editing `packages/convex/*.ts`, run `npx convex dev --once` from
  `packages/convex` (pushes to the **dev** deployment, regenerates `_generated/`). Never run
  Convex commands from another folder or without `convex.json` present.
- **Mobile bundles:** `npx expo export --platform android` (or ios/web) from `apps/mobile` for
  config or dependency changes. Bundling isn't proof it works on a device.
- **Pure logic** (parsers, generators, schedulers): a quick Node script against the real functions
  (`node --experimental-strip-types`), kept in the scratchpad, not the repo.

## Seeing the web app in a browser

Playwright's own Chromium doesn't run here, but Chromium from nix does:

```bash
nix shell nixpkgs#chromium --command chromium --headless --no-sandbox --disable-gpu --mute-audio \
  --remote-debugging-port=9222 about:blank &
```

Drive it with `playwright-core` (installed in the scratchpad) over CDP:

```js
import { chromium } from "playwright-core";
const browser = await chromium.connectOverCDP("http://localhost:9222");
const page = await (browser.contexts()[0] ?? await browser.newContext()).newPage();
await page.goto("http://localhost:3000/metronome");
await page.screenshot({ path: "out.png" });
await page.close();
```

- Check **1440 and 390 wide**, light and dark, and watch for console errors and horizontal
  overflow (`scrollWidth > clientWidth`).
- `:hover` styles never trigger in this headless build; read the compiled CSS rules instead.
- **Seed state through real routes** (set localStorage, then reload) rather than making test
  pages. If you ever add a temporary route under `apps/web/app/`, delete it, stop the dev server
  by PID (`pkill -f "next dev"` would kill your own shell too), `rm -rf apps/web/.next/dev`, and
  restart — otherwise Jack's live view shows "Module not found" on every edit.
- Close the pages your scripts open, and stop the chromium process when done
  (`lsof -ti:9222 -sTCP:LISTEN | xargs -r kill`).
- **Signed in:** sign in through `/?auth=login` inside the same script (sessions don't survive
  between CDP connections). Use the **dev** deployment. Never write a password into a file; pass it
  in an environment variable. Remove test data afterwards and say so.
- Audio can't be heard here — and keep it that way: always pass `--mute-audio`, or the headless
  browser plays through Jack's speakers. Say "not heard" rather than implying it sounds right.

## The mobile app

Development of the mobile app is paused (2026-10-18). Only build it if Jack asks. If you change
`packages/core` or a Convex function it uses, still run `tsc --noEmit` in `apps/mobile`.

**Rules:** Jack tests the app himself. **Build and `adb install` only. Never launch, tap, navigate
or screenshot his phone.** Read `adb logcat` only if he reports a crash. Then give him a short list
of what to try.

Build a local **preview** build (standalone APK, like the eas.json `preview` profile — not Expo Go,
not "production"):

```bash
cd apps/mobile/android
export ANDROID_HOME=$(ls -d /nix/store/*-androidsdk/libexec/android-sdk | head -1)  # needs build-tools 35 + NDK 27.1
export ANDROID_SDK_ROOT=$ANDROID_HOME NODE_ENV=production
./gradlew assembleRelease -Dorg.gradle.jvmargs="-Xmx4096m -XX:MaxMetaspaceSize=1024m"
nix shell nixpkgs#android-tools -c adb install -r app/build/outputs/apk/release/app-release.apk
```

- Pick the nix SDK that has build-tools 35 (react-native-audio-api needs it); the nix store is
  read-only, so gradle can't install it.
- If native dependencies changed, run `npx expo prebuild` first. Exit code 137 is usually the
  machine running out of memory, not the build config.
- Jack's phone has two apps: **sheddex** (`com.jackmechem.sheddex`, dev Convex) — what "install a
  build" means — and **sheddex prod** (`com.jackmechem.sheddex.prod`, prod Convex), built with
  `apps/mobile/scripts/build-android-prod.sh`.
- Expo web (`npx expo start --web`) plus the nix browser is fine for layout checks, but
  device-only bugs (styling, audio, gestures) only show on the phone.
- After adding a route, run `CI=1 npx expo start --offline` for a few seconds to regenerate typed
  routes. Restart `expo start` after changing `.env.local`.

## Wording the result

End with what was verified (and how) and what wasn't. Typical gaps worth naming: anything signed
in, audio by ear, real iOS/Android behavior, real email delivery, hover effects.
