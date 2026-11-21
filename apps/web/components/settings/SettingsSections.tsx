"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { HintsButton } from "@/components/CollapsiblePanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import DesktopUpdates from "@/components/settings/DesktopUpdates";
import { hideFeedbackFab, showFeedbackFab, useFeedbackFabHidden } from "@/components/feedback/FeedbackFab";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { VIEW_DEFAULTS, VIEW_KEY } from "@/components/PracticeLog";
import GoalDialog from "@/components/practicelog/GoalDialog";
import SwitchRow from "@/components/SwitchRow";
import { ClassicLookSwitch, ThemePicker } from "@/components/ThemeModal";
import { NAV_LINKS, groupByCategory } from "@/components/tools";
import { DISPLAY_DEFAULTS, DISPLAY_KEY, TEXT_SIZES } from "@/lib/display";
import { HintsContext } from "@/lib/hints";
import { WEEKDAY_LETTER, formatMinutesShort } from "@/lib/practiceLog";
import { isToolHidden, SITE_DEFAULTS, useSiteSettings, withToolHidden, type ShedLogOpenOn } from "@/lib/siteSettings";
import { usePersistedSettings } from "@/lib/usePersistedSettings";
import { usePracticeLog } from "@/lib/usePracticeLog";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/** A settings section: a filled panel with a title, an optional line under it, and a "?" that
    shows each option's description; then its controls. `footer` is a strip along the bottom (a
    note and a button), like a form's save row. Also used by the account page's own sections. */
export function SettingsCard({
  title,
  description,
  hints = true,
  danger = false,
  footer,
  children,
}: {
  title: string;
  description?: ReactNode;
  hints?: boolean;
  danger?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const [showHints, setShowHints] = useState(false);
  return (
    <section className="overflow-hidden rounded-lg bg-surface text-left">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className={`text-base font-semibold ${danger ? "text-danger" : ""}`}>{title}</h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {hints && <HintsButton on={showHints} onToggle={() => setShowHints(!showHints)} />}
        </div>
        {children && <HintsContext.Provider value={showHints}>{children}</HintsContext.Provider>}
      </div>
      {footer && (
        <div className={`flex flex-wrap items-center gap-3 border-t px-4 py-3 text-sm text-muted sm:px-5 ${danger ? "border-danger/30" : "border-foreground/10"}`}>
          {footer}
        </div>
      )}
    </section>
  );
}

/** Buttons for settings sections. */
export const BUTTON_PRIMARY = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";
export const BUTTON_SECONDARY = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-50";
export const INPUT = "h-9 rounded-md bg-foreground/[0.05] px-3 text-base text-foreground outline-none transition-colors focus:ring-2 focus:ring-accent/40 sm:text-sm";

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium text-muted">{children}</span>;
}

/** Toggles for a pool of tools: lit = shown, struck through = hidden. */
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors ${on ? "bg-foreground/[0.08] text-foreground hover:bg-surface-hover" : "text-muted line-through hover:bg-surface-hover hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- General

export function GeneralSettings() {
  const [site, update] = useSiteSettings();
  const fabHidden = useFeedbackFabHidden();
  const [resetting, setResetting] = useState(false);
  return (
    <>
      <DesktopUpdates />
      <SettingsCard title="Times">
        <div className="flex flex-col gap-2">
          <FieldLabel>Clock</FieldLabel>
          {/* Two short choices: don't stretch them across the whole card. */}
          <div className="w-full max-w-xs">
          <Segmented
            label="Clock"
            value={site.clock}
            onChange={(clock) => update({ clock })}
            options={[
              { value: "12", label: "3:00 PM" },
              { value: "24", label: "15:00" },
            ]}
          />
          </div>
        </div>
      </SettingsCard>
      <SettingsCard title="Features" description="Turn off the parts of soniroll you don't use. Nothing is deleted, and you can turn them back on any time.">
        <SwitchRow label="Shed Log" checked={site.shedLog} onChange={(shedLog) => update({ shedLog })} hint="Your practice log: its place in the sidebar, today's practice on the dashboard and the streak by your name." />
        <SwitchRow label="Shed Notes" checked={site.shedNotes} onChange={(shedNotes) => update({ shedNotes })} hint="Your notes: hides their card in the sidebar. Notes attached to routines, days and tunes still show there." />
        <SwitchRow label="Community" checked={site.community} onChange={(community) => update({ community })} hint="Posts from other musicians. Hides it from the sidebar." />
        <SwitchRow label="Lessons" checked={site.lessons} onChange={(lessons) => update({ lessons })} hint="For teachers and students. Hides it from the sidebar and the dashboard." />
      </SettingsCard>
      <SettingsCard title="Feel">
        <SwitchRow label="Confetti and sparkles" checked={site.celebrations} onChange={(celebrations) => update({ celebrations })} hint="The burst when you tick something off and the confetti when you reach a goal or finish a routine." />
        <SwitchRow label="Bug report button" checked={!fabHidden} onChange={(on) => (on ? showFeedbackFab() : hideFeedbackFab())} hint="The bug button at the right of each tool's top bar (and the phone's top bar). Send feedback is still in the sidebar's ⋮ menu. Saved on this device." />
      </SettingsCard>
      <SettingsCard
        title="Start over"
        description="Put every setting on this page back to how it started. Your theme stays."
        hints={false}
        footer={
          <button type="button" onClick={() => setResetting(true)} className={`ml-auto ${BUTTON_SECONDARY}`}>
            Reset settings
          </button>
        }
      />
      {resetting && (
        <ConfirmDialog
          title="Reset settings?"
          message="Every setting goes back to how it started: features, the sidebar, the dashboard, tools and the Shed Log's view. Your theme, practice log and tunes aren't touched."
          confirmLabel="Reset"
          onConfirm={() => {
            update(SITE_DEFAULTS);
            setResetting(false);
          }}
          onCancel={() => setResetting(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Appearance

export function AppearanceSettings() {
  const [display, setDisplay] = usePersistedSettings(DISPLAY_KEY, DISPLAY_DEFAULTS);
  return (
    <>
      <SettingsCard title="Theme" description="Colors and font for the whole site. Saved on this device." hints={false}>
        <ThemePicker />
      </SettingsCard>
      <SettingsCard title="Text and motion" description="Saved on this device.">
        <div className="flex flex-col gap-2">
          <FieldLabel>Text size</FieldLabel>
          <Segmented label="Text size" value={display.textSize} onChange={(textSize) => setDisplay({ textSize })} options={TEXT_SIZES.map((t) => ({ value: t.value, label: t.label }))} />
        </div>
        <SwitchRow
          label="Less motion"
          checked={display.lessMotion}
          onChange={(lessMotion) => setDisplay({ lessMotion })}
          hint="Turns off animations and sliding. If your device is already set to reduce motion, soniroll follows it either way."
        />
        <ClassicLookSwitch />
      </SettingsCard>
    </>
  );
}

// ---------------------------------------------------------------- Sidebar

const HIDEABLE_TOOLS = NAV_LINKS.filter((l) => l.category !== "Community" && l.href !== "/" && l.href !== "/shed-log");

export function SidebarSettings() {
  const [site, update] = useSiteSettings();
  return (
    <>
      <SettingsCard title="Sidebar">
        <SwitchRow
          label="Start with tool groups folded"
          checked={site.sidebarCategoriesCollapsed}
          onChange={(sidebarCategoriesCollapsed) => update({ sidebarCategoriesCollapsed })}
          hint="Each group of tools starts closed; open the ones you use. A group you've opened or closed yourself stays that way."
        />
        <SwitchRow label="Desktop app" checked={site.sidebarDesktopApp} onChange={(sidebarDesktopApp) => update({ sidebarDesktopApp })} hint="The row near the bottom of the sidebar, on the website. The download page is still in the ⋮ menu and at soniroll.com/download." />
        <SwitchRow label="Support soniroll" checked={site.sidebarSupport} onChange={(sidebarSupport) => update({ sidebarSupport })} hint="The row near the bottom of the sidebar in the phone menu and the desktop app. The Support page is also in the ⋮ menu and at soniroll.com/support." />
        <SwitchRow label="Streak by your name" checked={site.sidebarStreak} onChange={(sidebarStreak) => update({ sidebarStreak })} hint="The flame with your Shed Log streak, next to your name at the bottom of the sidebar." />
      </SettingsCard>
      <SettingsCard title="Tools you see" description="Tap a tool to hide it from the sidebar and the dashboard. Searching still finds it." hints={false}>
        {groupByCategory(HIDEABLE_TOOLS).map(({ category, items }) => (
          <div key={category} className="flex flex-col gap-2">
            <FieldLabel>{category}</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {items.map((l) => {
                const on = !isToolHidden(site.hiddenTools, l.href);
                return (
                  <Pill key={l.href} on={on} onClick={() => update({ hiddenTools: withToolHidden(site.hiddenTools, l.href, on) })}>
                    {l.label}
                  </Pill>
                );
              })}
            </div>
          </div>
        ))}
        {site.hiddenTools.length > 0 && (
          <button type="button" onClick={() => update({ hiddenTools: [] })} className="self-start text-sm font-medium text-accent hover:underline">
            Show every tool
          </button>
        )}
      </SettingsCard>
    </>
  );
}

// ---------------------------------------------------------------- Dashboard

export function DashboardSettings() {
  const [site, update] = useSiteSettings();
  return (
    <SettingsCard title="Dashboard" description="Choose your cards, their order and their sizes right on the dashboard: press Edit at the top of it." hints={false}>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard?edit" className={BUTTON_PRIMARY}>
          Edit the dashboard
        </Link>
        {site.dashboard && (
          <button type="button" onClick={() => update({ dashboard: null, hiddenCards: [] })} className={BUTTON_SECONDARY}>
            Back to the default cards
          </button>
        )}
      </div>
    </SettingsCard>
  );
}

// ---------------------------------------------------------------- Tools

const TOOL_STATS_KEY = "jam-practice-tool-stats";
const TOOL_STATS_DEFAULTS = { hidden: false };

export function ToolSettings() {
  const [site, update] = useSiteSettings();
  const [{ hidden: statsHidden }, setStats] = useSyncedSettings(TOOL_STATS_KEY, TOOL_STATS_DEFAULTS);
  const log = usePracticeLog();
  return (
    <>
      <SettingsCard title="Tool pages">
        <SwitchRow label="Stats beside the title" checked={!statsHidden} onChange={(on) => setStats({ hidden: !on })} hint="Your streak, today's time and this week for the tool, with the button that logs it to the Shed Log." />
        <SwitchRow
          label="Count tool time as practice"
          checked={log.data.prefs.trackTools !== false}
          onChange={(trackTools) => log.setPrefs({ trackTools })}
          hint="Time spent in a tool counts toward your daily goal and streak."
        />
        <SwitchRow label="Colorful option chips" checked={site.rewardChips} onChange={(rewardChips) => update({ rewardChips })} hint="The bigger, colorful look for options on tools that have it. Off, they use the plain look." />
      </SettingsCard>
      <SettingsCard title="Help">
        <SwitchRow
          label="Show option descriptions"
          checked={site.hintsByDefault}
          onChange={(hintsByDefault) => update({ hintsByDefault })}
          hint="Each option's description shows without pressing ?. You can still hide them on any one panel."
        />
      </SettingsCard>
    </>
  );
}

// ---------------------------------------------------------------- Shed Log

/** The Shed Log's preferences: the daily goal (the full goal window), sounds, how it opens. */
export function PracticeSettings() {
  const log = usePracticeLog();
  const { data } = log;
  const [site, update] = useSiteSettings();
  const [view, setView] = usePersistedSettings(VIEW_KEY, VIEW_DEFAULTS);
  const [goalOpen, setGoalOpen] = useState(false);
  const by = data.prefs.goalByWeekday;
  const perDay = Array.isArray(by) && by.length === 7;
  return (
    <>
      <SettingsCard title="Daily goal" description="How much practice makes a full day. Hitting it fills the ring, stars the day and keeps the celebrations coming." hints={false}>
        <div className="flex flex-wrap items-center gap-3">
          {perDay ? (
            <div className="flex gap-1">
              {by!.map((m, i) => (
                <span key={i} className="flex w-10 flex-col items-center rounded-md bg-foreground/[0.05] py-1.5">
                  <span className="text-[11px] text-muted">{WEEKDAY_LETTER[i]}</span>
                  <span className="text-xs font-medium tabular-nums">{m > 0 ? m : "–"}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xl font-semibold tabular-nums">{formatMinutesShort(data.prefs.dailyGoal)}</span>
          )}
          <span className="text-sm text-muted">{perDay ? "minutes, by weekday" : "every day"}</span>
          <button type="button" onClick={() => setGoalOpen(true)} className={`ml-auto ${BUTTON_SECONDARY}`}>
            Change
          </button>
        </div>
      </SettingsCard>
      <SettingsCard title="While you practice">
        <SwitchRow label="Sounds when you check things off" checked={data.prefs.sounds} onChange={(sounds) => log.setPrefs({ sounds })} hint="A little note for each thing you tick off, and a fanfare when you finish." />
      </SettingsCard>
      <SettingsCard title="How it looks">
        <div className="flex flex-col gap-2">
          <FieldLabel>Opens on</FieldLabel>
          <Segmented<ShedLogOpenOn>
            label="Opens on"
            value={site.shedLogOpenOn}
            onChange={(shedLogOpenOn) => update({ shedLogOpenOn })}
            options={[
              { value: "last", label: "Last used" },
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
              { value: "day", label: "Day" },
            ]}
          />
        </div>
        <SwitchRow label="Stats at the top" checked={view.showStats} onChange={(showStats) => setView({ showStats })} hint="Today, your streak, this week and in total, beside the title. Saved on this device." />
        <SwitchRow
          label="Day panel beside the calendar"
          checked={!view.dayHidden}
          onChange={(on) => setView({ dayHidden: !on })}
          hint="On wider screens, the selected day's routines sit to the left of the calendar. Saved on this device."
        />
        <Link href="/shed-log" className="self-start text-sm font-medium text-accent hover:underline">
          Open the Shed Log →
        </Link>
      </SettingsCard>
      {goalOpen && <GoalDialog data={data} onSave={log.setPrefs} onClose={() => setGoalOpen(false)} />}
    </>
  );
}
