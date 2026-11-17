"use client";

import Link from "next/link";
import { useState } from "react";
import { openFeedback } from "@/components/feedback/FeedbackForm";
import { DONATE_URL } from "@/components/support/SupportParts";
import { CheckIcon, FeedbackIcon, HeartIcon, ShareIcon, UsersIcon } from "@/components/tools";
import { shareLink } from "@/lib/shareLink";

const HEART = "var(--danger)";

/** What donations pay for — the services named in the privacy policy. */
const COSTS = [
  { title: "Your account and files", text: "The database and storage that keep your library, Shed Log, recordings and files in sync between devices." },
  { title: "The website", text: "Hosting soniroll.com so it's fast wherever you open it." },
  { title: "Email", text: "Sign-up codes, password resets, lesson invites and booking emails." },
  { title: "The domain", text: "soniroll.com itself." },
];

/**
 * `/support` — why and how to support soniroll: it's free with no ads, run by one person, and
 * donations (Buy me a coffee) pay for hosting. Also other ways to help: tell a friend, send
 * feedback.
 */
export default function SupportPage() {
  const [shared, setShared] = useState<string | null>(null);

  async function tellAFriend() {
    const result = await shareLink("soniroll — free practice tools for musicians", "https://www.soniroll.com");
    setShared(result === "copied" ? "Link copied" : result === "failed" ? null : "Thanks for sharing!");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-8">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <span className="shrink-0" style={{ color: HEART }}>
          <HeartIcon className="h-5 w-5" filled />
        </span>
        Support soniroll
      </h1>
      <section
        className="relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl px-6 py-8 text-center sm:py-10"
        style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${HEART} 16%, var(--surface)) 0%, var(--surface) 80%)` }}
      >
        <p className="max-w-xl text-base text-muted">
          soniroll is free, with no ads and no tool behind a paywall. It&apos;s made by one person, Jack Mechem, a musician and developer. Keeping it
          running costs money every month — if soniroll helps your practice, chipping in keeps it going.
        </p>
        <a
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-bold text-accent-foreground shadow-sm hover:bg-accent-hover"
        >
          <HeartIcon className="h-5 w-5" filled /> Buy me a coffee
        </a>
        <p className="text-xs text-muted">One-off, any amount, through Buy Me a Coffee. You don&apos;t need an account.</p>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">What it pays for</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {COSTS.map((c) => (
            <li key={c.title} className="flex gap-3 rounded-2xl bg-background p-3.5">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>
                <span className="block font-semibold">{c.title}</span>
                <span className="block text-sm text-muted">{c.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">Anything beyond the bills goes into building more tools.</p>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">Other ways to help</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => void tellAFriend()} className="flex flex-col items-start gap-2 rounded-2xl bg-background p-4 text-left hover:bg-surface-hover">
            <ShareIcon className="h-5 w-5 text-accent" />
            <span className="font-semibold">Tell a friend</span>
            <span className="text-sm text-muted">{shared ?? "Share soniroll with your band, students or teacher."}</span>
          </button>
          <button type="button" onClick={() => openFeedback()} className="flex flex-col items-start gap-2 rounded-2xl bg-background p-4 text-left hover:bg-surface-hover">
            <FeedbackIcon className="h-5 w-5 text-accent" />
            <span className="font-semibold">Send feedback</span>
            <span className="text-sm text-muted">Bugs, ideas, what you&apos;d like next — it all helps.</span>
          </button>
          <Link href="/community" className="flex flex-col items-start gap-2 rounded-2xl bg-background p-4 hover:bg-surface-hover">
            <UsersIcon className="h-5 w-5 text-accent" />
            <span className="font-semibold">Join the Community</span>
            <span className="text-sm text-muted">Post your tunes, setlists and routines for others.</span>
          </Link>
        </div>
      </section>

      <p className="text-center text-sm text-muted">Thank you — every coffee really does keep the lights on.</p>
    </main>
  );
}
