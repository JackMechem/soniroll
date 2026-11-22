"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { findToolLink } from "@/components/tools";
import { STEP_TOOL_EVENT } from "@/lib/practiceTimerEngine";
import { DEFAULT_SOUND_SETTINGS, SOUND_SETTINGS_KEY } from "@/lib/practiceTimerSound";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/** Opens a Practice Timer step's tool when the step starts (a Shed Log task's attached tool, or
    one picked for a step in the timer's editor), unless "Open each step's tool" is off. Mounted
    once for the whole app (in `PracticeTimerAlert`, on web and desktop), so it works from any page. A renamed tool's old href goes
    to the tool it became. */
export function useOpenStepTools() {
  const router = useRouter();
  const [settings] = useSyncedSettings(SOUND_SETTINGS_KEY, DEFAULT_SOUND_SETTINGS);
  const on = settings.openTools !== false;
  useEffect(() => {
    if (!on) return;
    const open = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      if (typeof detail !== "string") return;
      const href = findToolLink(detail)?.href;
      if (!href || window.location.pathname === href) return;
      router.push(href);
    };
    window.addEventListener(STEP_TOOL_EVENT, open);
    return () => window.removeEventListener(STEP_TOOL_EVENT, open);
  }, [on, router]);
}
