"use client";

import { createContext, useContext } from "react";
import { HintsButton } from "@/components/CollapsiblePanel";
import { SettingChip, useChipsMode } from "@/components/SettingsBar";
import { HelpIcon, SlidersIcon } from "@/components/tools";
import { HintsContext } from "@/lib/hints";
import { useHints } from "@/lib/panels";
import { usePersistedSettings } from "@/lib/usePersistedSettings";

const DEFAULTS = { open: true, showHints: false, hints: "" };

/**
 * One card holding a tool's option sections side by side (used by the full-width tools).
 * The whole card can be collapsed to its header, but the sections inside aren't collapsible
 * on their own.
 */
export function OptionsCard({ id, children }: { id: string; children: React.ReactNode }) {
  const [{ open, showHints: savedHints, hints: hintsChoice }, update] = usePersistedSettings(
    `jam-practice-options-card-${id}`,
    DEFAULTS,
  );
  const [showHints, toggleHints] = useHints(savedHints, hintsChoice, update);
  const bodyId = `options-card-${id}`;
  // As chips, the card itself disappears: each section is its own chip, sharing the card's
  // "show descriptions" setting.
  if (useChipsMode()) {
    return (
      <CardHints.Provider value={{ showHints, toggle: toggleHints }}>{children}</CardHints.Provider>
    );
  }

  return (
    <div className="w-full rounded-lg bg-surface text-left">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => update({ open: !open })}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm font-medium text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent sm:px-6"
        >
          <span className="flex items-center gap-2">
            <SlidersIcon className="h-4 w-4 shrink-0" />
            Options
          </span>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
        <button
          type="button"
          aria-pressed={showHints}
          aria-label={showHints ? "Hide option descriptions" : "Show option descriptions"}
          title={showHints ? "Hide option descriptions" : "Show option descriptions"}
          onClick={toggleHints}
          className={`mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent sm:mr-3 ${
            showHints
              ? "bg-accent text-accent-foreground"
              : "text-muted hover:bg-background hover:text-foreground"
          }`}
        >
          <HelpIcon className="h-4 w-4" />
        </button>
      </div>
      <div
        id={bodyId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-200 ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="grid gap-x-6 gap-y-6 px-4 pb-4 sm:px-6 sm:pb-6 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
            <HintsContext.Provider value={showHints}>{children}</HintsContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}

const CardHints = createContext<{ showHints: boolean; toggle: () => void }>({ showHints: false, toggle: () => {} });

export function OptionSection({
  title,
  icon: Icon,
  summary,
  wide,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** As a chip: the setting's current value. */
  summary?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const chips = useChipsMode();
  const hints = useContext(CardHints);
  if (chips) {
    return (
      <SettingChip icon={Icon} label={title} value={summary} wide={wide} headerExtra={<HintsButton on={hints.showHints} onToggle={hints.toggle} />}>
        <HintsContext.Provider value={hints.showHints}>{children}</HintsContext.Provider>
      </SettingChip>
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
        <Icon className="h-4 w-4 shrink-0" />
        {title}
      </h2>
      {children}
    </section>
  );
}
