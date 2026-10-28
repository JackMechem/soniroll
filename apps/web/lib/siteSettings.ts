"use client";

import { useEffect } from "react";
import { usePersistedSettings, writeSettings } from "@/lib/usePersistedSettings";
import type { DashboardItem } from "@/lib/dashboardLayout";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/**
 * Site-wide settings (Account → Settings): what shows in the sidebar and on the dashboard, which
 * features are on, and how things behave by default. They follow the account when signed in
 * (`useSyncedSettings`), and a copy is kept in this browser (`CACHE_KEY`) so the next page load can
 * use them straight away, before the account has answered, and so code outside React can read them.
 *
 * Every field's default is how the site behaved before these settings existed.
 */
export const SITE_SETTINGS_KEY = "jam-practice-site-settings";
const CACHE_KEY = "jam-practice-site-settings-cache";

export type ShedLogOpenOn = "last" | "month" | "week" | "day";

export const SITE_DEFAULTS = {
  /** 12-hour ("3:00 PM") or 24-hour ("15:00") times. */
  clock: "12" as "12" | "24",
  /** Confetti and sparkles when you tick things off, reach a goal or finish a routine. */
  celebrations: true,
  /** Show a tool's "how it works" the first time you open it. */
  toolIntros: true,
  /** Option descriptions shown without pressing "?" (until you hide them on a panel). */
  hintsByDefault: false,
  /** The colourful look for tool option chips. */
  rewardChips: true,

  /** The sidebar's tool categories start folded (until you open one). */
  sidebarCategoriesCollapsed: false,
  /** "Support soniroll" in the sidebar. */
  sidebarSupport: true,
  /** The streak flame next to your name in the sidebar. */
  sidebarStreak: true,
  /** Tools hidden from the sidebar and the dashboard (still found by search). */
  hiddenTools: [] as string[],

  /** Whole features, shown in the sidebar and on the dashboard. */
  shedLog: true,
  shedNotes: true,
  community: true,
  lessons: true,

  /** The dashboard's cards, their order and sizes, as arranged with its Edit button
      (`lib/dashboardLayout.ts`); null is the default layout. */
  dashboard: null as DashboardItem[] | null,
  /** Dashboard cards switched off before the dashboard could be edited. Only read while
      `dashboard` is null, so those cards stay off in the default layout. */
  hiddenCards: [] as string[],

  /** Which view the Shed Log opens on. */
  shedLogOpenOn: "last" as ShedLogOpenOn,
};
export type SiteSettings = typeof SITE_DEFAULTS;

/** The site settings, and a way to change them. The third value is true once the real values are in. */
export function useSiteSettings(): [SiteSettings, (patch: Partial<SiteSettings>) => void, boolean] {
  const [synced, update, ready] = useSyncedSettings(SITE_SETTINGS_KEY, SITE_DEFAULTS);
  const [cached] = usePersistedSettings(CACHE_KEY, SITE_DEFAULTS);
  const json = JSON.stringify(synced);
  useEffect(() => {
    if (ready && json !== JSON.stringify(cached)) writeSettings(CACHE_KEY, SITE_DEFAULTS, JSON.parse(json));
  }, [ready, json, cached]);
  return [ready ? synced : cached, update, ready];
}

/** The last settings this browser saw, for code outside React (null on the server). */
export function cachedSiteSettings(): SiteSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return { ...SITE_DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<SiteSettings>) : {}) };
  } catch {
    return SITE_DEFAULTS;
  }
}
