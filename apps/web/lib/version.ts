/**
 * soniroll's version: semantic versioning (MAJOR.MINOR.PATCH), set in this app's package.json and
 * passed in at build time (next.config.ts). Bump PATCH for fixes, MINOR for new features, MAJOR
 * for 1.0 and breaking changes. `CHANNEL` says how finished it is ("beta" until 1.0) — see
 * CHANGELOG.md at the repo root.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const CHANNEL: "beta" | "stable" = "beta";

/** "v0.9.0 beta". */
export const VERSION_LABEL = `v${APP_VERSION}${CHANNEL === "beta" ? " beta" : ""}`;

/** The desktop app's own version (apps/desktop/package.json, passed in by its build), or undefined
    on the website. The app shows this rather than the website's. */
export const DESKTOP_VERSION: string | undefined = process.env.NEXT_PUBLIC_DESKTOP_VERSION || undefined;

/** The version people see: the desktop app's inside the app, else the website's. */
export const SHOWN_VERSION = DESKTOP_VERSION ?? APP_VERSION;
