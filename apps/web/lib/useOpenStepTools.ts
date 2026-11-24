"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { findToolLink } from "@/components/tools";
import { STEP_TOOL_EVENT } from "@/lib/practiceTimerEngine";
import { DEFAULT_SOUND_SETTINGS, SOUND_SETTINGS_KEY } from "@/lib/practiceTimerSound";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { allPanes } from "@/lib/tilingLayout";
import { getTilingState, navigateMain } from "@/lib/useTilingLayout";

/** Opens a Practice Timer step's tool when the step starts (a Shed Log task's attached tool, or
    one picked for a step in the timer's editor), when "Open each step's tool" is on (off by
    default since 2026-11-23 — Jack: a task's attached tool shouldn't open unless you ask for it). Mounted
    once for the whole app (in `PracticeTimerAlert`, on web and desktop), so it works from any page. A renamed tool's old href goes
    to the tool it became. */
export function useOpenStepTools() {
  const router = useRouter();
  const [settings] = useSyncedSettings(SOUND_SETTINGS_KEY, DEFAULT_SOUND_SETTINGS);
  const on = settings.openTools === true;
  useEffect(() => {
    if (!on) return;
    const open = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      if (typeof detail !== "string") return;
      const href = findToolLink(detail)?.href;
      if (!href || window.location.pathname === href) return;
      // Split screen: in the main pane, unless a pane already shows it.
      const { layout } = getTilingState();
      if (layout.tree && allPanes(layout).some((p) => p.href.split(/[?#]/)[0] === href)) return;
      if (!navigateMain(href)) router.push(href);
    };
    window.addEventListener(STEP_TOOL_EVENT, open);
    return () => window.removeEventListener(STEP_TOOL_EVENT, open);
  }, [on, router]);
}
