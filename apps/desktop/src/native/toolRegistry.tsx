import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import Logo from "@/components/Logo";
import { NAV_LINKS } from "@/components/tools";

/** Desktop version of `lib/toolRegistry`: only the tools the desktop app has so far, so split
    screen offers just these (and the rest of the site isn't bundled in). */

function PaneLoading() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <Logo height={46} className="max-w-full animate-pulse" />
    </div>
  );
}

export const TOOL_COMPONENTS: Record<string, ComponentType> = {
  "/metronome": dynamic(() => import("@/components/Metronome"), { loading: PaneLoading }),
  "/tuner": dynamic(() => import("@/components/Tuner"), { loading: PaneLoading }),
};

export const TILEABLE_LINKS = NAV_LINKS.filter((link) => link.href in TOOL_COMPONENTS);
