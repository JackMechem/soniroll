"use client";

import { createContext, useContext } from "react";
import { NAV_LINKS } from "@/components/tools";
import { RewardProvider } from "@/components/reward/Reward";
import { ChipsModeContext, SettingsBar } from "@/components/SettingsBar";
import { PresetsChip } from "@/components/PresetsChip";
import type { ToolPresets } from "@/lib/toolPresets";
import ToolIntro, { IntroButton, useIntro } from "@/components/help/ToolIntro";
import { topicForHref } from "@/lib/helpContent";
import ToolStats from "@/components/toolstats/ToolStats";
import { LOG_BY_BUTTON, PLAIN_OPTIONS } from "@/lib/toolTime";
import { useSiteSettings } from "@/lib/siteSettings";

const LayoutContext = createContext<"split" | "stacked">("split");

/** Which layout the surrounding tool page uses, so controls can pick matching icons. */
export function useToolLayout() {
  return useContext(LayoutContext);
}

/**
 * Shared page shell for the tools: the main display, with the tool's options as a row of setting
 * chips underneath (each panel/section becomes a chip that opens a popover; see `OptionChips`).
 * `layout="stacked"` gives the main display the full width (Slow Downer, Recorder, ...). An
 * optional `sidePanel` (history, struggles, logs) gets its own chips just above the main display.
 */
export default function ToolLayout({
  title,
  options,
  optionsMode,
  layout = "split",
  topAligned = false,
  titleExtra,
  help,
  sidePanel,
  credit,
  presets,
  children,
}: {
  title: string;
  layout?: "split" | "stacked";
  /** With the stacked layout: pin content to the top and let it fill the height (no centring). */
  topAligned?: boolean;
  /** Shown to the right of the title in the page header (e.g. the current project). */
  titleExtra?: React.ReactNode;
  /** A help button shown right after the title. */
  help?: React.ReactNode;
  /** Extra panels (history, logs), shown as chips just above the main display. */
  sidePanel?: React.ReactNode;
  /** Small, unobtrusive text pinned to the bottom-right corner of the page (e.g. an idea credit). */
  credit?: React.ReactNode;
  /** A mode selector shown above the option chips (e.g. Timed / Listen), for a choice that
      decides which chips there are. */
  optionsMode?: React.ReactNode;
  options: React.ReactNode;
  /** Saved presets of the tool's options: a "Presets" chip first in the chips. Build it with
      `toolPresets(id, settings, update)` (`lib/toolPresets.ts`). Hidden whenever `options` is. */
  presets?: ToolPresets;
  children: React.ReactNode;
}) {
  const stacked = layout === "stacked";
  const link = NAV_LINKS.find((l) => l.label === title);
  const TitleIcon = link?.icon;
  const topic = link ? topicForHref(link.href) : undefined;
  const intro = useIntro(topic);
  // The tool's own stats and its "Log to Shed Log" button (tools on the new logging so far).
  const statsHref = link && LOG_BY_BUTTON.has(link.href) ? link.href : null;
  // ...and the reward look for their options, except the few that keep their own.
  const [{ rewardChips }] = useSiteSettings();
  const rewardOn = rewardChips && !!statsHref && !PLAIN_OPTIONS.has(statsHref);

  const page = (
    <LayoutContext.Provider value={layout}>
      <div className={`relative flex min-h-full flex-1 flex-col bg-background text-foreground ${rewardOn ? "reward-scope" : ""}`}>
        <div className="absolute left-0 right-0 top-[calc(env(safe-area-inset-top)+0.75rem)] flex h-10 items-center pl-16 pr-4 sm:pl-[4.5rem] lg:top-3 lg:pl-8">
          <h1 className="flex min-w-0 items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {TitleIcon && <TitleIcon className="h-6 w-6 shrink-0 text-accent sm:h-7 sm:w-7" />}
            <span className="truncate">{title}</span>
          </h1>
          {topic && <div className="ml-1.5"><IntroButton onClick={intro.show} label={`How ${title} works`} /></div>}
          {help && <div className="ml-3">{help}</div>}
          {titleExtra && <div className="ml-4 pr-4">{titleExtra}</div>}
          {statsHref && (
            <div className="ml-4 hidden min-w-0 flex-1 lg:block">
              <ToolStats href={statsHref} />
            </div>
          )}
        </div>

        {intro.open && topic && <ToolIntro topic={topic} onClose={intro.close} />}

        {credit && (
          <p className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] right-[calc(env(safe-area-inset-right)+1.5rem)] z-10 text-xs text-muted/70">
            {credit}
          </p>
        )}

        {stacked ? (
          <main className="flex w-full flex-1 flex-col gap-6 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16">
            <section
              className={`flex w-full min-w-0 flex-1 flex-col items-center gap-6 text-center ${
                topAligned ? "justify-start" : "justify-center"
              }`}
            >
              {statsHref && <PhoneStats href={statsHref} />}
              {sidePanel && <TopChips>{sidePanel}</TopChips>}
              {children}
            </section>
            {options && <OptionChips mode={optionsMode} presets={presets}>{options}</OptionChips>}
          </main>
        ) : (
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16 xl:max-w-5xl">
            <section className="flex w-full min-w-0 flex-col items-center gap-7 text-center xl:items-center xl:justify-center">
              <div className="relative flex w-full flex-col items-center gap-7 xl:max-w-[24rem]">
                {statsHref && <PhoneStats href={statsHref} />}
                {sidePanel && <TopChips>{sidePanel}</TopChips>}
                {children}
                {options && <OptionChips mode={optionsMode} presets={presets}>{options}</OptionChips>}
              </div>
            </section>
          </main>
        )}
      </div>
    </LayoutContext.Provider>
  );
  // Tools on the new Shed Log logging also get the reward look for their options.
  return rewardOn && statsHref ? (
    <RewardProvider href={statsHref} color="var(--accent)">
      {page}
    </RewardProvider>
  ) : (
    page
  );
}

/** A tool's options, as a row of setting chips under its main display (each `CollapsiblePanel` /
    `OptionSection` becomes a chip that opens a popover). Replaces the old hideable options column. */
function OptionChips({
  children,
  mode,
  presets,
}: {
  children: React.ReactNode;
  mode?: React.ReactNode;
  presets?: ToolPresets;
}) {
  return (
    <ChipsModeContext.Provider value={true}>
      <div className="flex w-full flex-col items-center gap-3 pt-2">
        {mode}
        <SettingsBar>
          {presets && <PresetsChip tool={presets} />}
          {children}
        </SettingsBar>
      </div>
    </ChipsModeContext.Provider>
  );
}

/** The side panels (history, struggles, logs) as a small row of chips above the main display. */
function TopChips({ children }: { children: React.ReactNode }) {
  return (
    <ChipsModeContext.Provider value={true}>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </ChipsModeContext.Provider>
  );
}

/** Below `lg` the stats pills sit at the top of the page, a row you swipe sideways. */
function PhoneStats({ href }: { href: string }) {
  return (
    <div className="w-full max-w-[100vw] text-left lg:hidden">
      <ToolStats href={href} />
    </div>
  );
}
