"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CloseIcon, HeartIcon } from "@/components/tools";

/**
 * Asking for support (donations), in a few places: the `/support` page, a "Support soniroll" row
 * that's always in the sidebar, items in the sidebar's ⋮ menus, and a card on the dashboard you can
 * put away for a while. soniroll has no ads; donations are what pay for hosting.
 */

/** Where donations go. */
export const DONATE_URL = "https://buymeacoffee.com/jackmechem";
export const SUPPORT_PATH = "/support";

/** The heart: the theme's warm red (its `--danger`), so it reads as a heart in every theme. */
const HEART = "var(--danger)";

/** The sidebar's "Support soniroll" row (or, collapsed, just the heart). */
export function SupportRow({ collapsed = false, large = false, active = false, onNavigate }: { collapsed?: boolean; large?: boolean; active?: boolean; onNavigate?: () => void }) {
  if (collapsed) {
    return (
      <Link
        href={SUPPORT_PATH}
        aria-label="Support soniroll"
        title="Support soniroll"
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-transform hover:scale-105"
        style={{ background: `color-mix(in srgb, ${HEART} 16%, transparent)`, color: HEART }}
      >
        <HeartIcon className="h-[18px] w-[18px]" filled />
      </Link>
    );
  }
  return (
    <Link
      href={SUPPORT_PATH}
      onClick={onNavigate}
      className={`group flex items-center gap-2.5 rounded-xl px-2 transition-colors ${large ? "py-2 text-base" : "py-1.5 text-sm"} ${
        active ? "bg-surface-hover" : "hover:bg-surface-hover"
      }`}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg ${large ? "h-9 w-9" : "h-7 w-7"}`}
        style={{ background: `color-mix(in srgb, ${HEART} 16%, transparent)`, color: HEART }}
      >
        <HeartIcon className={`${large ? "h-[18px] w-[18px]" : "h-4 w-4"} transition-transform group-hover:scale-110`} filled />
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">Support soniroll</span>
      {large && <span className="shrink-0 text-xs text-muted">Keep it free</span>}
    </Link>
  );
}

// ---------------------------------------------------------------- the dashboard card

const DISMISS_KEY = "jam-practice-support-card-hidden-until";
const HIDE_FOR_MS = 30 * 24 * 3_600_000;
const listeners = new Set<() => void>();

function hiddenUntil(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function hideForAWhile() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + HIDE_FOR_MS));
  } catch {
    // Storage unavailable: it just shows again next time.
  }
  listeners.forEach((l) => l());
}

/** True while the card has been put away (on this device). Hidden on the server, so it never
    flashes in and out on load. */
export function useSupportCardHidden() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hiddenUntil() > Date.now(),
    () => true,
  );
}

/** "Keep soniroll free" — the dashboard's ask. "Not now" puts it away on this device for 30 days
    (`always` shows it anyway: the dashboard while you edit it). */
export function SupportCard({ always = false }: { always?: boolean }) {
  const hidden = useSupportCardHidden();
  if (hidden && !always) return null;
  return (
    <section
      className="relative flex h-full flex-col gap-4 overflow-hidden rounded-3xl p-5 @2xl:flex-row @2xl:items-center sm:p-6"
      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${HEART} 14%, var(--surface)) 0%, var(--surface) 75%)` }}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${HEART} 18%, transparent)`, color: HEART }}>
        <HeartIcon className="h-6 w-6" filled />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold">Keep soniroll free</h2>
        <p className="text-sm text-muted">
          No ads, no paywalled tools, made by one musician. If soniroll helps your practice, a coffee helps pay for the servers.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
          <HeartIcon className="h-4 w-4" filled /> Buy me a coffee
        </a>
        <Link href={SUPPORT_PATH} className="inline-flex h-10 items-center rounded-full bg-background px-4 text-sm font-semibold hover:bg-surface-hover">
          Why it helps
        </Link>
      </div>
      <button
        type="button"
        onClick={hideForAWhile}
        aria-label="Not now"
        title="Not now (hides this for 30 days)"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </section>
  );
}
