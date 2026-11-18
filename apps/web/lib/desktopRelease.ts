"use client";

import { useEffect, useState } from "react";

/**
 * The desktop app's newest release, read from GitHub's API in the browser (the release workflow,
 * `.github/workflows/desktop-release.yml`, uploads the installers there with stable names:
 * `soniroll-desktop-<version>-<platform>.<ext>`). The newest Stable release (a plain version), or
 * the newest of all while there isn't one yet. GitHub allows 60 unauthenticated requests an hour
 * per address — plenty for one page — and the page falls back to the releases list if it fails.
 */

export const RELEASES_URL = "https://github.com/JackMechem/soniroll/releases";
const API = "https://api.github.com/repos/JackMechem/soniroll/releases?per_page=20";

export type Platform = "mac" | "windows" | "linux";
export type Download = { name: string; url: string; size: number; label: string };
export type DesktopRelease = {
  version: string;
  url: string;
  published: string;
  prerelease: boolean;
  downloads: Record<Platform, Download[]>;
};

type ApiRelease = {
  tag_name: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
};

/** Each platform's files, the one to suggest first. */
const KINDS: { platform: Platform; match: RegExp; label: string }[] = [
  { platform: "mac", match: /macos-universal\.dmg$/, label: "Disk image (.dmg)" },
  { platform: "mac", match: /macos-universal\.zip$/, label: "App in a .zip" },
  { platform: "windows", match: /windows-x86_64-setup\.exe$/, label: "Installer (.exe)" },
  { platform: "linux", match: /linux-x86_64\.AppImage$/, label: "AppImage (any distribution)" },
  { platform: "linux", match: /linux-x86_64\.deb$/, label: "Debian, Ubuntu (.deb)" },
  { platform: "linux", match: /linux-x86_64\.rpm$/, label: "Fedora (.rpm)" },
];

function toRelease(r: ApiRelease): DesktopRelease {
  const downloads: Record<Platform, Download[]> = { mac: [], windows: [], linux: [] };
  for (const kind of KINDS) {
    const asset = r.assets.find((a) => kind.match.test(a.name));
    if (asset) downloads[kind.platform].push({ name: asset.name, url: asset.browser_download_url, size: asset.size, label: kind.label });
  }
  return { version: r.tag_name.replace(/^desktop-v/, ""), url: r.html_url, published: r.published_at, prerelease: r.prerelease, downloads };
}

let cached: Promise<DesktopRelease | null> | null = null;

function fetchRelease(): Promise<DesktopRelease | null> {
  cached ??= fetch(API, { headers: { Accept: "application/vnd.github+json" } })
    .then(async (res) => {
      if (!res.ok) return null;
      const all = ((await res.json()) as ApiRelease[]).filter((r) => !r.draft && r.tag_name.startsWith("desktop-v"));
      const pick = all.find((r) => !r.prerelease) ?? all[0];
      return pick ? toRelease(pick) : null;
    })
    .catch(() => null);
  return cached;
}

/** The newest release (undefined while loading, null if GitHub couldn't be reached). */
export function useDesktopRelease(): DesktopRelease | null | undefined {
  const [release, setRelease] = useState<DesktopRelease | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void fetchRelease().then((r) => live && setRelease(r));
    return () => {
      live = false;
    };
  }, []);
  return release;
}

/** The visitor's computer, from the browser (null on phones and tablets, or when it can't tell). */
export function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android|Mobile/.test(ua)) return null;
  if (/Mac OS X|Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? null : "mac"; // iPads say Macintosh
  if (/Windows/.test(ua)) return "windows";
  if (/Linux|X11|CrOS/.test(ua)) return "linux";
  return null;
}

export const PLATFORM_NAME: Record<Platform, string> = { mac: "macOS", windows: "Windows", linux: "Linux" };
