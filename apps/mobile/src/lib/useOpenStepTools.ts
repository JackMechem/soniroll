import { NAV_LINKS_DATA, currentToolHref } from '@jam-practice/core/navLinks';
import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { toolRoute } from '@/components/ToolGrid';
import { onStepTool } from '@/lib/practiceTimerEngine';
import { DEFAULT_SOUND_SETTINGS, SOUND_SETTINGS_KEY } from '@/lib/practiceTimerSound';
import { useSyncedSettings } from '@/lib/useSyncedSettings';

/** Opens a Practice Timer step's tool when the step starts (a Shed Log task's attached tool, or one
    picked for a step in the timer's editor), unless "Open each step's tool" is off — the phone's
    version of the website's `lib/useOpenStepTools.ts`. Mounted once for the whole app (in
    `PracticeTimerAlert`), so it works from any screen. A renamed tool's old href goes to the tool
    it became; nothing happens when that tool's screen is already showing. */
export function useOpenStepTools() {
  const router = useRouter();
  const pathname = usePathname();
  const [settings] = useSyncedSettings(SOUND_SETTINGS_KEY, DEFAULT_SOUND_SETTINGS);
  const on = settings.openTools === true;
  useEffect(() => {
    if (!on) return;
    return onStepTool((href) => {
      const current = currentToolHref(href);
      if (!NAV_LINKS_DATA.some((l) => l.href === current)) return;
      const route = toolRoute(current);
      if (typeof route === 'string' && route === pathname) return;
      router.push(route);
    });
  }, [on, router, pathname]);
}
