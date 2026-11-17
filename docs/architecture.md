# How soniroll fits together

A short tour of the code for anyone reading the repo. For the rules and full history, see
[docs/README.md](README.md).

## The pieces

```
apps/web          The website (Next.js App Router + Tailwind v4). The main product.
apps/mobile       The iOS/Android app (Expo SDK 57, Expo Router, NativeWind for layout).
packages/core     Shared pure TypeScript: music theory, parsers, generators, practice-log logic.
packages/convex   The backend (Convex): schema, queries, mutations, actions, auth.
```

It's a pnpm workspace. Web and mobile both import `@jam-practice/core` and talk to the same
Convex deployment through `@jam-practice/convex`.

## Data: local first, account optional

Every tool works without an account.

- **Signed out:** settings and data stay on the device — localStorage (`usePersistedSettings`) and
  IndexedDB on web (audio files for the Slow Downer), AsyncStorage on mobile.
- **Signed in:** the same hooks read and write the account instead. Most tools store one JSON
  value per settings key in the generic `syncedSettings` table (`useSyncedSettings`), with a
  debounced, race-safe cache in `apps/web/lib/syncedStore.ts`. There's no merge between device and
  account data: signing in just switches which store is used. Mobile also keeps an AsyncStorage
  copy so it works offline.
- **Things with their own tables:** the chord-chart library (one row per song, bars separate),
  Community posts, profiles and follows, recordings, tune songs and uploaded files (Convex file
  storage, 100 MB per account), setlists, tunes and files shared by link, routines, Lessons (students, lessons, items, hand-ins, bookings), Rhythm Section
  bass players and transcriptions, feedback, admin roles, site flags, usage counts.

## Audio

All sound is made on the device.

- **Web:** Web Audio. Clicks are synthesized and scheduled ahead on the audio clock
  (`lib/clickEngine.ts`); instruments use real samples (piano, Rhodes, upright bass, drums) loaded
  on demand and pitch-shifted to the nearest note (`lib/sampledTones.ts`, `lib/uprightBass.ts`,
  `lib/drumSounds.ts`). Pitch detection for the listening tools is in `packages/core/pitchDetect.ts`.
- **Mobile:** `react-native-audio-api` (Web-Audio-like) for samples and the tuner, `expo-audio`
  for playback and recording, pre-rendered click WAVs for the metronome.

## Backend

Convex functions live at the root of `packages/convex` (`convex.json` sets that). Auth is Convex
Auth: email + password with emailed codes (Resend) and Google. Each function checks who's calling;
anything read across users re-checks privacy on the server. Deleting an account cascades through
every table in `account.ts`.

## Deploying

Vercel builds `apps/web` and, in the same build, deploys Convex to production. See
[guides/deploying.md](guides/deploying.md).
