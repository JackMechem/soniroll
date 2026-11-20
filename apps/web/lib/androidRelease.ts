"use client";

import { useEffect, useState } from "react";

/**
 * The Android app's newest release, read from GitHub's API in the browser, like the desktop app's
 * (`lib/desktopRelease.ts`). Android releases are tagged `android-v<version>` (for now alphas,
 * marked as pre-releases so they never become GitHub's "latest" release, which the desktop app's
 * updater reads) with one `.apk` attached. The phone app is in alpha: the download page says so.
 */

const API = "https://api.github.com/repos/JackMechem/soniroll/releases?per_page=30";
/** The phone app's page (`app/mobile`). */
export const MOBILE_PATH = "/mobile";

export type AndroidRelease = { version: string; url: string; apk: { url: string; size: number } | null; published: string };

type ApiRelease = {
  tag_name: string;
  html_url: string;
  published_at: string;
  draft: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
};

let cached: Promise<AndroidRelease | null> | null = null;

function fetchRelease(): Promise<AndroidRelease | null> {
  cached ??= fetch(API, { headers: { Accept: "application/vnd.github+json" } })
    .then(async (res) => {
      if (!res.ok) return null;
      const r = ((await res.json()) as ApiRelease[]).find((x) => !x.draft && x.tag_name.startsWith("android-v"));
      if (!r) return null;
      const apk = r.assets.find((a) => a.name.endsWith(".apk"));
      return {
        version: r.tag_name.replace(/^android-v/, ""),
        url: r.html_url,
        published: r.published_at,
        apk: apk ? { url: apk.browser_download_url, size: apk.size } : null,
      };
    })
    .catch(() => null);
  return cached;
}

/** The newest Android release (undefined while loading, null if there isn't one or GitHub couldn't be reached). */
export function useAndroidRelease(): AndroidRelease | null | undefined {
  const [release, setRelease] = useState<AndroidRelease | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void fetchRelease().then((r) => live && setRelease(r));
    return () => {
      live = false;
    };
  }, []);
  return release;
}
