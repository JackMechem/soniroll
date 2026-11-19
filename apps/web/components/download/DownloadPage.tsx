"use client";

import { useState, useSyncExternalStore } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CheckIcon, DownloadIcon } from "@/components/tools";
import { inDesktopApp } from "@/lib/deviceFiles";
import { type Download, type Platform, PLATFORM_NAME, RELEASES_URL, detectPlatform, useDesktopRelease } from "@/lib/desktopRelease";
import { formatBytes } from "@/lib/files";

/**
 * `/download` — the desktop app: one big button for the computer you're on (picked from the
 * browser), every platform's files below with how to open them the first time (the builds aren't
 * signed yet), and NixOS. The files come from the newest GitHub release (`lib/desktopRelease.ts`).
 */

const noSubscribe = () => () => {};

const WHY = [
  { title: "Its own audio engine", text: "Sound goes straight to your audio device, for steadier timing than a browser tab." },
  { title: "Files on your computer", text: "Without a storage plan, files are kept on your computer, and clearing a browser never deletes them." },
  { title: "Its own window", text: "Away from your browser tabs, and it opens like any other app." },
  { title: "Same account, same everything", text: "Every tool and page, signed in to your account, and free." },
];

/** What to do the first time, since the builds aren't signed with a developer certificate yet. */
const FIRST_RUN: Record<Platform, string> = {
  mac: "Open the .dmg and drag soniroll to Applications. The first time, right-click the app and choose Open (macOS 15 and later: open it once, then Open Anyway in System Settings › Privacy & Security).",
  windows: "Run the installer. If SmartScreen says it doesn't recognize the app, choose More info, then Run anyway.",
  linux: "Make the AppImage executable (chmod +x) and run it, or install the .deb or .rpm. Needs PipeWire (standard on recent distributions).",
};

export default function DownloadPage() {
  const release = useDesktopRelease();
  const platform = useSyncExternalStore(noSubscribe, detectPlatform, () => null);
  const desktop = useSyncExternalStore(noSubscribe, inDesktopApp, () => false);
  const order: Platform[] = platform ? [platform, ...(["mac", "windows", "linux"] as Platform[]).filter((p) => p !== platform)] : ["mac", "windows", "linux"];
  const primary = platform && release ? release.downloads[platform][0] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-8">
      <section className="flex flex-col items-start gap-5 rounded-3xl bg-surface px-5 py-8 sm:items-center sm:px-8 sm:py-12 sm:text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <DownloadIcon className="h-6 w-6" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">soniroll for your computer</h1>
          <p className="max-w-xl text-sm text-muted sm:text-base">The same soniroll as an app of its own, for macOS, Windows and Linux. Free, like everything else.</p>
        </div>
        {desktop ? (
          <p className="flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-sm font-medium">
            <CheckIcon className="h-4 w-4 text-accent" /> You&apos;re using the desktop app.
          </p>
        ) : release === undefined ? (
          <LoadingSpinner />
        ) : primary && platform ? (
          <div className="flex flex-col items-start gap-2 sm:items-center">
            <a
              href={primary.url}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-bold text-accent-foreground shadow-sm hover:bg-accent-hover"
            >
              <DownloadIcon className="h-5 w-5" /> Download for {PLATFORM_NAME[platform]}
            </a>
            <p className="text-xs text-muted">
              Desktop app {release?.version} · {formatBytes(primary.size)} · {primary.label}
              {platform === "mac" ? " · Apple silicon and Intel" : ""}
            </p>
          </div>
        ) : platform === null ? (
          // No computer detected (a phone or tablet): say so first; the list below is the quieter
          // second step (a link down the page rather than off to GitHub).
          <div className="flex flex-col items-start gap-3 sm:items-center">
            <p className="max-w-xl text-sm">On a phone or tablet? The desktop app is for computers; soniroll.com works everywhere.</p>
            <a
              href={release ? "#downloads" : RELEASES_URL}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-foreground/[0.05] px-5 text-sm font-semibold text-foreground hover:bg-surface-hover"
            >
              <DownloadIcon className="h-4 w-4" /> See downloads
            </a>
          </div>
        ) : (
          // A computer, but its download couldn't be picked (the release didn't load).
          <a href={release ? "#downloads" : RELEASES_URL} className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-accent px-6 text-base font-bold text-accent-foreground hover:bg-accent-hover">
            <DownloadIcon className="h-5 w-5" /> See downloads
          </a>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {WHY.map((w) => (
          <div key={w.title} className="flex gap-3 rounded-2xl bg-surface p-4">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <span className="block font-semibold">{w.title}</span>
              <span className="block text-sm text-muted">{w.text}</span>
            </span>
          </div>
        ))}
      </section>

      <section id="downloads" className="flex scroll-mt-20 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Every download</h2>
          {release && (
            <a href={release.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-accent hover:underline">
              What&apos;s new in desktop app {release.version}
            </a>
          )}
        </div>
        {release === null ? (
          <p className="rounded-xl bg-surface p-4 text-sm text-muted">
            The downloads couldn&apos;t be loaded just now.{" "}
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
              Get them from GitHub
            </a>
            .
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {order.map((p) => (
              <PlatformCard key={p} platform={p} downloads={release?.downloads[p]} yours={p === platform} />
            ))}
          </div>
        )}
        <p className="text-xs text-muted">
          The desktop app is new, so tell us if something&apos;s off (the bug button, top right). Builds aren&apos;t signed with a developer
          certificate yet, which is why your computer may warn you the first time.
        </p>
      </section>

      <NixSection version={release?.version} />
    </main>
  );
}

function PlatformCard({ platform, downloads, yours }: { platform: Platform; downloads: Download[] | undefined; yours: boolean }) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl bg-surface p-4 ${yours ? "ring-2 ring-accent" : ""}`}>
      <p className="flex items-center justify-between gap-2 font-semibold">
        {PLATFORM_NAME[platform]}
        {yours && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">Your computer</span>}
      </p>
      {downloads === undefined ? (
        <LoadingSpinner size="sm" />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {downloads.map((d, i) => (
            <li key={d.name}>
              <a
                href={d.url}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${i === 0 ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "bg-foreground/[0.05] hover:bg-surface-hover"}`}
              >
                <DownloadIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">{d.label}</span>
                <span className={`shrink-0 text-xs tabular-nums ${i === 0 ? "opacity-80" : "text-muted"}`}>{formatBytes(d.size)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{FIRST_RUN[platform]}</p>
    </div>
  );
}

/** The flake lines for one release tag (pinned; the README covers following a channel). */
const nixFor = (tag: string) => `# flake.nix inputs
soniroll.url = "github:JackMechem/soniroll/${tag}";

# configuration.nix
environment.systemPackages = [ inputs.soniroll.packages.\${pkgs.stdenv.hostPlatform.system}.soniroll-desktop ];`;

function NixSection({ version }: { version: string | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!version) return null;
  const tag = `desktop-v${version}`;
  const NIX = nixFor(tag);
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">NixOS</h2>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(NIX).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="inline-flex h-8 items-center rounded-md bg-foreground/[0.05] px-3 text-xs font-medium hover:bg-surface-hover"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-sm text-muted">
        Try it with <code className="rounded bg-foreground/[0.06] px-1">nix run github:JackMechem/soniroll/{tag}</code>, or add it to your configuration:
      </p>
      <pre className="overflow-x-auto rounded-lg bg-background p-3 text-xs leading-relaxed">{NIX}</pre>
    </section>
  );
}
