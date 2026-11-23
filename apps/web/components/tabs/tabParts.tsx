"use client";

import { svgProps } from "@/components/tools";
import { tabTitle } from "@/components/pageNames";
import type { TabView } from "@/lib/useTabs";

/** Tabs: two cards, one behind the other. */
export function TabsIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="7" width="14" height="13" rx="2" />
      <path d="M7 7V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

/** A new tab: a card with a plus. */
export function NewTabIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

/** A copy of a tab. */
export function DuplicateIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

/** A tab's icon and name ("+1" when it holds more pages than its main one). */
export function TabLabel({ tab, iconClassName = "h-4 w-4", active }: { tab: TabView; iconClassName?: string; active: boolean }) {
  const { label, icon: Icon, color } = tabTitle(tab.name, tab.mainHref);
  return (
    <>
      {Icon && (
        <span className={`flex shrink-0 ${color ? "" : active ? "text-foreground" : "text-muted"}`} style={color ? { color } : undefined}>
          <Icon className={iconClassName} />
        </span>
      )}
      <span className="min-w-0 truncate">{label}</span>
      {tab.panes > 1 && <span className="shrink-0 text-xs font-normal text-muted">+{tab.panes - 1}</span>}
    </>
  );
}

export function tabName(tab: TabView): string {
  return tabTitle(tab.name, tab.mainHref).label;
}

/** "Ctrl+Alt+3" (or ⌘⌥3 on a Mac) for the tab at `index`, for tooltips; none past the 9th. */
export function tabShortcut(index: number, count: number): string | null {
  const n = index < 8 ? index + 1 : index === count - 1 ? 9 : null;
  if (n === null) return null;
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return mac ? `⌘⌥${n}` : `Ctrl+Alt+${n}`;
}
