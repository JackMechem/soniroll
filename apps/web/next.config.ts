import path from "node:path";
import type { NextConfig } from "next";
import pkg from "./package.json";

// This app now lives at apps/web inside a pnpm monorepo (repo root is two levels up) — both of
// these tell Next's file tracing / Turbopack to treat the monorepo root as the workspace root
// instead of inferring it (which gets confused by the extra `apps/*`/`packages/*` nesting and can
// silently drop a traced file from the serverless output). See PROJECT.md's Expo-migration plan.
const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  // `@jam-practice/convex` (packages/convex) is a workspace package of plain, untranspiled
  // TypeScript (Convex's own generated `_generated/api.ts` etc.) — Next only transpiles files
  // inside this app by default, so an external workspace package needs to be opted in explicitly
  // or its imports fail to build.
  transpilePackages: ["@jam-practice/convex", "@jam-practice/core"],
  // The app's version (bump `version` in package.json), shown under the sidebar logo — lib/version.ts.
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  // The landing page briefly lived at /welcome before moving to "/".
  async redirects() {
    return [
      { source: "/welcome", destination: "/", permanent: true },
      // The Practice Log was renamed the Shed Log.
      { source: "/practice-log", destination: "/shed-log", permanent: true },
      { source: "/practice-log/:path*", destination: "/shed-log/:path*", permanent: true },
      // Library's sections became tabs on /tunes (?tab=). Not permanent, so browsers don't cache it.
      { source: "/tunes/setlists", destination: "/tunes?tab=setlists", permanent: false },
      { source: "/chord-charts", destination: "/tunes?tab=charts", permanent: false },
      { source: "/files", destination: "/tunes?tab=files", permanent: false },
      // Bass Genius and the Drum Generator became Rhythm Section (`?tab=players` carries over;
      // the Drum Generator's link plays the drums on their own).
      { source: "/bass-genius", destination: "/rhythm-section", permanent: false },
      { source: "/drum-generator", destination: "/rhythm-section?play=drums", permanent: false },
    ];
  },
};

export default nextConfig;
