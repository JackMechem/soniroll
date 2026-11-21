"use client";

import Link from "next/link";
import LoadingSpinner from "@/components/LoadingSpinner";
import PageBar from "@/components/PageBar";
import { CheckIcon, DownloadIcon, PhoneIcon } from "@/components/tools";
import { useAndroidRelease } from "@/lib/androidRelease";
import { DOWNLOAD_PATH, RELEASES_URL } from "@/lib/desktopRelease";
import { formatBytes } from "@/lib/files";

/**
 * `/mobile` — the phone app, on a page of its own (the desktop app has `/download`). For now an
 * Android alpha: the newest `android-v*` GitHub release's APK (`lib/androidRelease.ts`), how to
 * install it, and what's in it. No iPhone version yet.
 */

const WHAT = [
  { title: "Every tool, made for a phone", text: "Big buttons, everything on one screen, and the options a tap away." },
  { title: "Keeps playing", text: "The Metronome and the rest keep going when you switch apps, and a strip takes you back." },
  { title: "Your Shed Log and Library", text: "Routines, the calendar, tunes, setlists, chord charts, files and recordings." },
  { title: "Same account, still free", text: "Sign in with your soniroll.com account, or use the tools without one." },
];

const STEPS = [
  "Tap Download for Android on your phone.",
  "Open the downloaded file. The first time, Android asks you to allow installing apps from your browser: allow it.",
  "Tap Install, then open soniroll.",
];

export default function MobilePage() {
  const android = useAndroidRelease();
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-20">
      <PageBar crumbs={[{ label: "Phone app" }]} icon={PhoneIcon} />
      <section className="flex flex-col items-start gap-5 rounded-3xl bg-surface px-5 py-8 sm:items-center sm:px-8 sm:py-12 sm:text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <PhoneIcon className="h-6 w-6" />
        </span>
        <div className="flex flex-col items-start gap-2 sm:items-center">
          <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">Alpha</span>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">soniroll for your phone</h2>
          <p className="max-w-xl text-sm text-muted sm:text-base">
            The phone app for Android is in alpha: an early test, so expect rough edges, and tell us what breaks (the bug button, top
            right). Not on the Play Store yet, and not on iPhone yet.
          </p>
        </div>
        {android === undefined ? (
          <LoadingSpinner />
        ) : android?.apk ? (
          <div className="flex flex-col items-start gap-2 sm:items-center">
            <a
              href={android.apk.url}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-bold text-accent-foreground shadow-sm hover:bg-accent-hover"
            >
              <DownloadIcon className="h-5 w-5" /> Download for Android
            </a>
            <p className="text-xs text-muted">
              Version {android.version} · {formatBytes(android.apk.size)} ·{" "}
              <a href={android.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                What&apos;s in it
              </a>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            The download couldn&apos;t be loaded just now.{" "}
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
              Find it on GitHub
            </a>
            .
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Installing it</h2>
        <ol className="flex flex-col gap-2">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3 rounded-2xl bg-surface p-4 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {WHAT.map((w) => (
          <div key={w.title} className="flex gap-3 rounded-2xl bg-surface p-4">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <span className="block font-semibold">{w.title}</span>
              <span className="block text-sm text-muted">{w.text}</span>
            </span>
          </div>
        ))}
      </section>

      <p className="text-sm text-muted">
        On iPhone, soniroll.com works in your browser. On a computer, there&apos;s{" "}
        <Link href={DOWNLOAD_PATH} className="font-medium text-accent hover:underline">
          the desktop app
        </Link>
        .
      </p>
    </main>
  );
}
