"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { svgProps } from "@/components/tools";
import { tabTitle } from "@/components/pageNames";
import type { StoredKind } from "@/lib/files";
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

const FILE_KINDS: StoredKind[] = ["file", "recording", "song", "lesson", "handin", "profile"];

/** The file's name when `href` is one of your files (`/files/view`), so a tab showing a PDF is
    named after it rather than "File". Null otherwise, or while it loads. */
function useFileViewName(href: string): string | null {
  const url = new URL(href, "http://x");
  const kind = url.searchParams.get("kind") as StoredKind | null;
  const id = url.searchParams.get("id");
  const isFile = url.pathname === "/files/view" && !!kind && FILE_KINDS.includes(kind) && !!id;
  const { isAuthenticated } = useConvexAuth();
  const item = useQuery(api.fileFolders.item, isFile && isAuthenticated ? { kind: kind!, id: id! } : "skip");
  return item?.name ?? null;
}

/** A tab's name: what it was renamed to, else its main page's (a file's own name). */
export function useTabName(tab: TabView): string {
  const fileName = useFileViewName(tab.mainHref);
  return tab.name ?? fileName ?? tabName(tab);
}

/** A page's name for the tab list (a file's own name). */
export function PageNameText({ href }: { href: string }) {
  const fileName = useFileViewName(href);
  return <>{fileName ?? tabTitle(null, href).label}</>;
}

/** "Metronome, Shed Log": the tab's other pages, for its tooltip and the phone's list. */
export function otherPageNames(tab: TabView): string[] {
  return tab.pageHrefs.slice(1).map((href) => tabTitle(null, href).label);
}

/** A tab's icon and name, and a small split mark when it holds more than one page (its tooltip
    names them). */
export function TabLabel({ tab, iconClassName = "h-4 w-4", active, mark = true, hint }: { tab: TabView; iconClassName?: string; active: boolean; mark?: boolean; hint?: string }) {
  const { icon: Icon, color } = tabTitle(tab.name, tab.mainHref);
  const label = useTabName(tab);
  return (
    <>
      {Icon && (
        <span className={`flex shrink-0 ${color ? "" : active ? "text-foreground" : "text-muted"}`} style={color ? { color } : undefined}>
          <Icon className={iconClassName} />
        </span>
      )}
      <span className="min-w-0 truncate" title={hint === undefined ? undefined : `${label}${hint}`}>
        {label}
      </span>
      {mark && tab.panes > 1 && (
        <span className="flex shrink-0 text-muted" title={`${tab.panes} pages: ${[label, ...otherPageNames(tab)].join(", ")}`}>
          <SplitMarkIcon className="h-3.5 w-3.5" />
          <span className="sr-only">, {tab.panes} pages</span>
        </span>
      )}
    </>
  );
}

/** Two panes side by side: a tab with more than one page. */
function SplitMarkIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </svg>
  );
}

export function tabName(tab: Pick<TabView, "name" | "mainHref">): string {
  return tabTitle(tab.name, tab.mainHref).label;
}

/** "Ctrl+Alt+3" (or ⌘⌥3 on a Mac) for the tab at `index`, for tooltips; none past the 9th. */
export function tabShortcut(index: number, count: number): string | null {
  const n = index < 8 ? index + 1 : index === count - 1 ? 9 : null;
  if (n === null) return null;
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return mac ? `⌘⌥${n}` : `Ctrl+Alt+${n}`;
}
