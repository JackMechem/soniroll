"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { NAV_LINKS } from "@/components/tools";
import { RewardProvider } from "@/components/reward/Reward";
import { ChipsModeContext, SettingsBar } from "@/components/SettingsBar";
import { PresetsButton } from "@/components/PresetsChip";
import { FeedbackHeaderButton } from "@/components/feedback/FeedbackFab";
import type { ToolPresets } from "@/lib/toolPresets";
import ToolIntro, { IntroButton, useIntro } from "@/components/help/ToolIntro";
import { topicForHref } from "@/lib/helpContent";
import ToolStats from "@/components/toolstats/ToolStats";
import { LOG_BY_BUTTON, PLAIN_OPTIONS, useLiveToolTime } from "@/lib/toolTime";
import { useSiteSettings } from "@/lib/siteSettings";
import { usePaneTitleSlot } from "@/lib/paneContext";

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
  actions,
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
  /** Small, unobtrusive text (e.g. an idea credit), at the end of the page under the option
      chips. */
  credit?: React.ReactNode;
  /** A mode selector shown above the option chips (e.g. Timed / Listen), for a choice that
      decides which chips there are. */
  optionsMode?: React.ReactNode;
  options: React.ReactNode;
  /** Saved presets of the tool's options: a Presets button in the top bar (desktop) or the row at
      the top of the page (phones). Build it with `toolPresets(id, settings, update)`
      (`lib/toolPresets.ts`). */
  presets?: ToolPresets;
  /** Page-level buttons (e.g. Score Writer's Import / New score): on the right of the header bar
      (desktop), or in the row at the top of the page (phones). */
  actions?: React.ReactNode;
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
  // In a split-screen pane the page's name is in the pane's top bar: the ? goes beside it there.
  const paneTitleSlot = usePaneTitleSlot();
  const introButton = topic ? <IntroButton onClick={intro.show} label={`How ${title} works`} /> : null;

  const page = (
    <LayoutContext.Provider value={layout}>
      <div className={`relative flex min-h-full flex-1 flex-col bg-background text-foreground ${rewardOn ? "reward-scope" : ""}`}>
        {/* The header bar (desktop). On phones the title is in the app's top bar, and the ? and the
            stats sit at the top of the page instead. */}
        <div className="absolute inset-x-0 top-0 hidden h-14 items-center gap-2 border-b border-foreground/10 px-8 lg:flex">
          <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold">
            {TitleIcon && <TitleIcon className="h-[18px] w-[18px] shrink-0 text-muted" />}
            <span className="truncate" title={title}>{title}</span>
          </h1>
          {topic && <IntroButton onClick={intro.show} label={`How ${title} works`} />}
          {help && <div className="ml-1">{help}</div>}
          {/* Only the room left over (`basis-0`), cut short with … when the header is tight, so
              the title and the buttons on the right never get squeezed by it (FB-22). */}
          {titleExtra && <div className="ml-3 min-w-0 flex-1 basis-0 truncate pr-4">{titleExtra}</div>}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {presets && <PresetsButton tool={presets} />}
            {statsHref && <ToolStats href={statsHref} />}
            {actions}
            <FeedbackHeaderButton />
          </div>
        </div>

        {/* Phones: the same row, pinned just under the app's top bar. */}
        <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+4.25rem)] sm:inset-x-6 lg:hidden">
          <PhoneBar href={statsHref} presets={presets} actions={actions} intro={paneTitleSlot ? null : introButton} help={help} />
        </div>
        {paneTitleSlot && introButton && createPortal(introButton, paneTitleSlot)}

        {intro.open && topic && <ToolIntro topic={topic} onClose={intro.close} />}

        {stacked ? (
          <main className="flex w-full flex-1 flex-col gap-6 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+7rem)] sm:px-6 lg:pt-20">
            <section
              className={`flex w-full min-w-0 flex-1 flex-col items-center gap-6 text-center ${
                topAligned ? "justify-start" : "justify-start lg:justify-center"
              }`}
            >
              {sidePanel !== undefined && <SideChips href={link?.href} tall={rewardOn}>{sidePanel}</SideChips>}
              {children}
            </section>
            {options && <OptionChips mode={optionsMode}>{options}</OptionChips>}
            {credit && <Credit>{credit}</Credit>}
          </main>
        ) : (
          // Phones and tablets: from the top, just under the row of presets/stats (centred, a short
          // tool left a blank band above it and pushed its chips down). Desktop: centred.
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-start gap-8 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+7.75rem)] sm:px-6 lg:justify-center lg:pt-24 xl:max-w-5xl">
            <section className="flex w-full min-w-0 flex-col items-center gap-7 text-center xl:items-center xl:justify-center">
              <div className="relative flex w-full flex-col items-center gap-7 xl:max-w-[24rem]">
                  {sidePanel !== undefined && <SideChips href={link?.href} tall={rewardOn}>{sidePanel}</SideChips>}
                {children}
                {options && <OptionChips mode={optionsMode}>{options}</OptionChips>}
                {credit && <Credit>{credit}</Credit>}
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

/** An idea credit in the page's flow, under the option chips. (It used to be pinned to the
    window's bottom-right corner on desktop, where it sat on top of tools' content.) */
function Credit({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-xs text-muted/70">{children}</p>;
}

/** The side panels (history, struggles, logs) as a small row of chips above the main display. */
function TopChips({ children }: { children: React.ReactNode }) {
  return (
    <ChipsModeContext.Provider value={true}>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </ChipsModeContext.Provider>
  );
}

/** The side panels' row. A tool that hides them until there's something in them (History and
    Struggles after the first answer) passes `false` until then: while the tool runs, their row is
    kept free anyway, so when they appear mid-quiz the quiz doesn't jump down under your finger.
    Its own component, so only it re-renders with the tool's ticking time. */
function SideChips({ href, tall, children }: { href?: string; tall: boolean; children: React.ReactNode }) {
  const { running } = useLiveToolTime(href ?? "");
  if (children) return <TopChips>{children}</TopChips>;
  if (!running || !href) return null;
  // As tall as a row of chips (the reward look's are 56px, the plain ones 48px).
  return <div aria-hidden className={`w-full shrink-0 ${tall ? "h-14" : "h-12"}`} />;
}

/** Below `lg`, a small row at the top of the page: presets, the tool's stats and Log button, and
    its ?. */
function PhoneBar({ href, presets, actions, intro, help }: { href: string | null; presets?: ToolPresets; actions?: React.ReactNode; intro: React.ReactNode; help?: React.ReactNode }) {
  if (!href && !presets && !actions && !intro && !help) return null;
  return (
    // Always one line that fits (360–390 wide): the presets button is the part that gives way
    // (its name truncates; `[&>div]` reaches SettingChip's wrapper), the ? never moves off screen.
    <div className="flex w-full min-w-0 items-center gap-2 text-left lg:hidden">
      {presets && (
        <div className="flex min-w-[2.5rem] shrink [&>div]:min-w-0">
          <PresetsButton tool={presets} />
        </div>
      )}
      {href && <div className="flex shrink-0"><ToolStats href={href} /></div>}
      {actions}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {help}
        {intro}
      </div>
    </div>
  );
}
