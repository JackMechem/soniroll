"use client";

import { createContext, useContext } from "react";
import { NAV_LINKS } from "@/components/tools";
import { RewardProvider } from "@/components/reward/Reward";
import { ChipsModeContext, SettingsBar } from "@/components/SettingsBar";
import { PresetsButton } from "@/components/PresetsChip";
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
  /** Saved presets of the tool's options: a Presets button in the top bar (desktop) or the row at
      the top of the page (phones). Build it with `toolPresets(id, settings, update)`
      (`lib/toolPresets.ts`). */
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
        {/* The header bar (desktop). On phones the title is in the app's top bar, and the ? and the
            stats sit at the top of the page instead. */}
        <div className="absolute inset-x-0 top-0 hidden h-14 items-center gap-2 border-b border-foreground/10 px-8 lg:flex">
          <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold">
            {TitleIcon && <TitleIcon className="h-[18px] w-[18px] shrink-0 text-muted" />}
            <span className="truncate">{title}</span>
          </h1>
          {topic && <IntroButton onClick={intro.show} label={`How ${title} works`} />}
          {help && <div className="ml-1">{help}</div>}
          {titleExtra && <div className="ml-3 pr-4">{titleExtra}</div>}
          {(presets || statsHref) && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {presets && <PresetsButton tool={presets} />}
              {statsHref && <ToolStats href={statsHref} />}
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
          <main className="flex w-full flex-1 flex-col gap-6 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-20">
            <section
              className={`flex w-full min-w-0 flex-1 flex-col items-center gap-6 text-center ${
                topAligned ? "justify-start" : "justify-center"
              }`}
            >
              <PhoneBar href={statsHref} presets={presets} intro={topic ? <IntroButton onClick={intro.show} label={`How ${title} works`} /> : null} help={help} />
              {sidePanel && <TopChips>{sidePanel}</TopChips>}
              {children}
            </section>
            {options && <OptionChips mode={optionsMode}>{options}</OptionChips>}
          </main>
        ) : (
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-24 xl:max-w-5xl">
            <section className="flex w-full min-w-0 flex-col items-center gap-7 text-center xl:items-center xl:justify-center">
              <div className="relative flex w-full flex-col items-center gap-7 xl:max-w-[24rem]">
                <PhoneBar href={statsHref} presets={presets} intro={topic ? <IntroButton onClick={intro.show} label={`How ${title} works`} /> : null} help={help} />
                {sidePanel && <TopChips>{sidePanel}</TopChips>}
                {children}
                {options && <OptionChips mode={optionsMode}>{options}</OptionChips>}
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
function OptionChips({ children, mode }: { children: React.ReactNode; mode?: React.ReactNode }) {
  return (
    <ChipsModeContext.Provider value={true}>
      <div className="flex w-full flex-col items-center gap-3 pt-2">
        {mode}
        <SettingsBar>
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

/** Below `lg`, a small row at the top of the page: presets, the tool's stats and Log button, and
    its ?. */
function PhoneBar({ href, presets, intro, help }: { href: string | null; presets?: ToolPresets; intro: React.ReactNode; help?: React.ReactNode }) {
  if (!href && !presets && !intro && !help) return null;
  return (
    <div className="flex w-full flex-wrap items-center gap-2 text-left lg:hidden">
      {presets && <PresetsButton tool={presets} />}
      {href && <ToolStats href={href} />}
      <div className="ml-auto flex items-center gap-1">
        {help}
        {intro}
      </div>
    </div>
  );
}
