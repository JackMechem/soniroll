"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import AccountMenu from "@/components/AccountMenu";
import { OPEN_PALETTE_EVENT, useSearchExtras, type SearchItem } from "@/components/CommandPalette";
import Flyout, { FlyoutItem } from "@/components/Flyout";
import PracticeTimerWidget from "@/components/PracticeTimerWidget";
import ThemeModal from "@/components/ThemeModal";
import AnimatedLogo from "@/components/AnimatedLogo";
import Logo, { LogoMark } from "@/components/Logo";
import { APP_VERSION, CHANNEL, DESKTOP_VERSION, SHOWN_VERSION, VERSION_LABEL } from "@/lib/version";
import { useChangelogUnseen } from "@/lib/useChangelogUnseen";
import { DASHBOARD_PATH, LANDING_PATH } from "@/lib/landing";
import PracticeLogNavCard from "@/components/practicelog/PracticeLogNavCard";
import ShedNotesNavCard from "@/components/shednotes/ShedNotesNavCard";
import DashboardNavCard from "@/components/DashboardNavCard";
import { SupportRow, SUPPORT_PATH } from "@/components/support/SupportParts";
import { MOBILE_PATH } from "@/lib/androidRelease";
import { DOWNLOAD_PATH } from "@/lib/desktopRelease";
import { DesktopAppRow } from "@/components/download/DesktopAppRow";
import { useInDesktopApp } from "@/lib/deviceFiles";
import { PLAN_HREF } from "@/lib/storagePlan";
import {
  CATEGORY_COLORS,
  BugIcon,
  FeedbackIcon,
  GearIcon,
  MegaphoneIcon,
  CloudIcon,
  DownloadIcon,
  PhoneIcon,
  HeartIcon,
  HelpIcon,
  ShieldIcon,
  NAV_LINKS,
  SearchIcon,
  FileIcon,
  HomeIcon,
  SideViewIcon,
  SplitIcon,
  StarIcon,
  filterLinks,
  groupByCategory,
  svgProps,
} from "@/components/tools";
import { useCollapsedCategories } from "@/lib/panels";
import { navIconButtonClass, navIconClass, navRowClass } from "@/components/navRow";
import { isToolHidden, useSiteSettings } from "@/lib/siteSettings";
import { useConvexAuth } from "@convex-dev/auth/react";
import { openFeedback } from "@/components/feedback/FeedbackForm";
import { CrumbTrail } from "@/components/PageBar";
import { IntroButton } from "@/components/help/ToolIntro";
import { type PageCrumbs, useCurrentCrumbs } from "@/lib/pageCrumbs";
import { FeedbackBarButton, showFeedbackFab, useFeedbackFabHidden } from "@/components/feedback/FeedbackFab";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { findPane } from "@/lib/tilingLayout";
import { canShowInPane } from "@/lib/toolRegistry";
import { useFavorites } from "@/lib/useFavorites";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { navigateMain, openBeside, useTilingState } from "@/lib/useTilingLayout";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { isLibraryPath, pageNameFor } from "@/components/pageNames";
import PhoneTabsButton, { openTabsSheet } from "@/components/tabs/PhoneTabs";
import { NewTabIcon, TabsIcon } from "@/components/tabs/tabParts";
import { newTab } from "@/lib/useTabs";

const STORAGE_KEY = "jam-practice-sidebar";
const DEFAULT_WIDTH = 244;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const COLLAPSED_WIDTH = 68;
/** Dragging the edge narrower than this turns the sidebar into its icon strip. */
const RAIL_SNAP_WIDTH = 150;
/** How long the pointer can be away before the peeking sidebar slides away again. */
const PEEK_CLOSE_MS = 300;
/** Room the page bar leaves at its left for the menu button while the sidebar is hidden. */
const TOGGLE_ROOM = "2.75rem";

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3a9 9 0 000 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-7.8-9-7.8z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10.5" cy="7" r="1" />
      <circle cx="15.5" cy="7.5" r="1" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** The sidebar's own "more options" trigger — three vertical dots, filled rather than stroked
    (every other icon in this file is an outlined `svgProps` icon, but a stroked dot at this size
    reads as a faint ring rather than a solid dot). */
function DotsIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

const noSubscribe = () => () => {};

function clamp(n: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

/** `collapsed`: the icon strip (dragged narrow). `hidden`: out of the way entirely, like Notion's
    sidebar: a menu button at the top left brings it back, and hovering that button (or the
    window's left edge) slides it in over the page. */
type Layout = { width: number; collapsed: boolean; hidden: boolean };

const DEFAULT_LAYOUT: Layout = { width: DEFAULT_WIDTH, collapsed: false, hidden: false };
const layoutListeners = new Set<() => void>();
let cachedLayout: Layout | null = null;

function getLayout(): Layout {
  if (cachedLayout) return cachedLayout;
  cachedLayout = DEFAULT_LAYOUT;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored) {
      cachedLayout = {
        width: typeof stored.width === "number" ? clamp(stored.width) : DEFAULT_WIDTH,
        collapsed: stored.collapsed === true,
        hidden: stored.hidden === true,
      };
    }
  } catch {
    // ignore unreadable storage
  }
  return cachedLayout;
}

function getServerLayout(): Layout {
  return DEFAULT_LAYOUT;
}

function updateLayout(patch: Partial<Layout>) {
  cachedLayout = { ...getLayout(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedLayout));
  } catch {
    // storage unavailable
  }
  for (const listener of layoutListeners) listener();
}

function subscribeLayout(listener: () => void) {
  layoutListeners.add(listener);
  return () => layoutListeners.delete(listener);
}

/** The sidebar's current on-screen width in pixels (collapsed or not) — exported so
    `BackgroundToolDock.tsx` can anchor itself just to the right of the sidebar's own edge without
    duplicating this module's layout store. */
export function useSidebarShownWidth(): number {
  const { width, collapsed, hidden } = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  return hidden ? 0 : collapsed ? COLLAPSED_WIDTH : width;
}

/** The shortcut that hides the sidebar or brings it back: ⌘\ on a Mac, Ctrl+\ elsewhere (Ctrl on
    the server and while hydrating). */
function useHideShortcut() {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘\\" : "Ctrl+\\"),
    () => "Ctrl+\\",
  );
}

function DoubleChevronIcon({ direction, className }: { direction: "left" | "right"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={direction === "left" ? "m11 17-5-5 5-5M18 17l-5-5 5-5" : "m13 17 5-5-5-5M6 17l5-5-5-5"} />
    </svg>
  );
}

/** In the sidebar's header: « hides it completely. While it's peeking (hidden, slid in over the
    page), » keeps it open instead. */
function SidebarHideButton({ peeking }: { peeking: boolean }) {
  const label = peeking ? "Keep the sidebar open" : "Hide the sidebar";
  const shortcut = useHideShortcut();
  return (
    <button
      type="button"
      onClick={() => updateLayout({ hidden: !peeking })}
      aria-label={label}
      title={`${label} (${shortcut})`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <DoubleChevronIcon direction={peeking ? "right" : "left"} className="h-4 w-4" />
    </button>
  );
}

/** Under the logo in the icon strip: widens the sidebar again (as dragging its edge out does). */
function SidebarExpandButton() {
  return (
    <button
      type="button"
      onClick={() => updateLayout({ collapsed: false })}
      aria-label="Widen the sidebar"
      title="Widen the sidebar"
      className="mx-auto mb-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

/** "⌘K" on a Mac, "Ctrl K" elsewhere; null on the server and while hydrating (shown after). */
function usePaletteKey() {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => null,
  );
}

function SearchBox({
  query,
  onChange,
  onNavigate,
  large,
}: {
  query: string;
  onChange: (query: string) => void;
  onNavigate?: () => void;
  large?: boolean;
}) {
  const router = useRouter();
  const paletteKey = usePaletteKey();

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      onChange("");
    } else if (e.key === "Enter") {
      const first = filterLinks(query)[0];
      if (!first) return;
      router.push(first.href);
      onChange("");
      onNavigate?.();
    }
  }

  // On desktop the sidebar search is a button that opens the same menu as pressing "/".
  if (!large) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        aria-label="Search tools"
        className="mb-3 flex h-8 w-full items-center gap-2 rounded-md bg-foreground/[0.05] px-2 text-left text-sm text-muted outline-none transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Search</span>
        <kbd className="rounded-sm bg-foreground/[0.05] px-1.5 font-sans text-[11px] leading-4 text-muted">/</kbd>
        {paletteKey && <kbd className="rounded-sm bg-foreground/[0.05] px-1.5 font-sans text-[11px] leading-4 text-muted">{paletteKey}</kbd>}
      </button>
    );
  }

  return (
    <label
      className={`mb-3 flex items-center gap-2 rounded-md bg-foreground/[0.05] px-3 text-muted focus-within:ring-2 focus-within:ring-accent ${
        large ? "py-2.5 text-base" : "py-2 text-sm"
      }`}
    >
      <SearchIcon className="h-4 w-4 shrink-0" />
      <input
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={large ? "Search tools, tunes, charts…" : "Press / to search"}
        aria-label="Search tools, tunes, charts, pages and settings"
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted"
      />
    </label>
  );
}

type NavLink = (typeof NAV_LINKS)[number];

/** Shared by Favorites and every real category in `NavItems` below — a collapsible section: a
    small muted heading (a star for Favorites; click to fold it away) over its rows. A module-level
    component (not a function defined inside `NavItems`'s own render, which the React Compiler
    correctly flags — a new component identity every render resets state), so everything it needs
    from `NavItems` is passed in explicitly instead of closed over. */
function CategoryBlock({
  title,
  items,
  large,
  searching,
  isCollapsed,
  onToggleCollapse,
  renderLink,
  star = false,
}: {
  title: string;
  items: NavLink[];
  large?: boolean;
  searching: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  renderLink: (link: NavLink) => React.ReactNode;
  star?: boolean;
}) {
  // A light section: a small heading (click to fold it away), then the tools. Favorites stands
  // out: a soft accent panel with a stronger heading and an accent star.
  return (
    <div data-nav-section className={`flex flex-col gap-0.5 ${star ? "rounded-lg bg-accent/[0.08] p-1.5 pt-2" : ""}`}>
      <button
        type="button"
        onClick={onToggleCollapse}
        disabled={searching}
        aria-expanded={!isCollapsed}
        className={`group flex w-full items-center gap-1.5 rounded-md px-2 pb-1 text-left transition-colors hover:text-foreground disabled:hover:text-muted ${star ? "font-semibold text-foreground" : "font-medium text-muted"} ${large ? "text-sm" : "text-xs"}`}
      >
        {star && <StarIcon className="h-3.5 w-3.5 text-accent" filled />}
        <span className="flex-1">{title}</span>
        {isCollapsed && <span className="font-medium tabular-nums opacity-70">{items.length}</span>}
        {!searching && (
          <ChevronDownIcon className={`h-3 w-3 shrink-0 transition-all ${isCollapsed ? "-rotate-90" : "opacity-0 group-hover:opacity-100"}`} />
        )}
      </button>
      {!isCollapsed && <div className="flex flex-col gap-px">{items.map(renderLink)}</div>}
    </div>
  );
}

/** A tool's icon, in its category's colour. */
function ToolTile({ link, large }: { link: NavLink; active?: boolean; large?: boolean }) {
  const Icon = link.icon;
  return (
    <span data-nav-icon className="flex shrink-0" style={{ color: CATEGORY_COLORS[link.category] }}>
      <Icon className={large ? "h-5 w-5" : "h-4 w-4"} />
    </span>
  );
}

/** A sidebar section's heading ("Your shed", "People", "Tools"): small and muted. */
function SectionHeading({ children, large = false }: { children: React.ReactNode; large?: boolean }) {
  return <h2 className={`px-2 pb-1 pt-3 font-medium text-muted first:pt-0 ${large ? "text-sm" : "text-xs"}`}>{children}</h2>;
}

function NavItems({
  collapsed,
  large,
  query = "",
  onNavigate,
}: {
  collapsed?: boolean;
  large?: boolean;
  query?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { favorites, toggleFavorite, isAuthenticated } = useFavorites();
  const [collapsedCategories, setCategoryCollapsed] = useCollapsedCategories();
  // Which link counts as "active": the real URL, or with split screen showing, the main pane's page
  // (where the sidebar opens things; panes change the address bar without Next's router, so
  // `usePathname()` doesn't follow them).
  const tilingState = useTilingState();
  const isDesktop = useIsDesktop();
  const mainPane = isDesktop ? findPane(tilingState.layout, tilingState.layout.mainPaneId) : undefined;
  const activePaneHref = mainPane ? mainPane.href.split(/[?#]/)[0] : undefined;
  const effectivePathname = activePaneHref ?? pathname;
  const navRef = useRef<HTMLElement>(null);
  // Bring the page you're on into view in a long list (the sidebar, or the phone menu as it
  // opens), so you can see where you are and what's next to it. Only when it's out of sight of the
  // list itself, and then from its section's heading when that fits, so a section isn't left cut
  // off at the top. The list can still grow just after (favorites and folded sections load), so
  // it looks again as it does, for a moment.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const bring = () => {
      const row = nav.querySelector('[aria-current="page"]');
      if (!row) return;
      const n = nav.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      if (r.top >= n.top && r.bottom <= n.bottom - 8) return;
      const section = row.closest("[data-nav-section]");
      const top = section ? section.getBoundingClientRect().top : r.top;
      const from = r.bottom - top <= n.height - 24 ? top : r.top - 40;
      nav.scrollTop += from - n.top - 8;
    };
    bring();
    let frame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(bring);
    });
    mo.observe(nav, { childList: true, subtree: true });
    const stop = setTimeout(() => mo.disconnect(), 2000);
    return () => {
      clearTimeout(stop);
      cancelAnimationFrame(frame);
      mo.disconnect();
    };
  }, [effectivePathname, collapsed]);
  // The icon strip (collapsed) can hold more icons than fit: while there are more below, a fade
  // and a ⌄ button at its bottom say so (the scrollbar is hidden there).
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const nav = navRef.current;
    if (!collapsed || !nav) return;
    const check = () => setMoreBelow(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 4);
    const ro = new ResizeObserver(check);
    ro.observe(nav);
    if (nav.firstElementChild) ro.observe(nav.firstElementChild); // the icons (grows as favorites load)
    nav.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      nav.removeEventListener("scroll", check);
    };
  }, [collapsed]);
  const [site] = useSiteSettings();
  const searching = query.trim().length > 0;
  // Settings: tools you've hidden stay out of the lists (a search still finds them), and so do
  // Community and Lessons when they're turned off.
  const filtered = filterLinks(query).filter(
    (l) => (searching || !isToolHidden(site.hiddenTools, l.href)) && (site.community || l.href !== "/community") && (site.lessons || l.href !== "/lessons"),
  );
  const router = useRouter();
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Right-click any page in the sidebar (desktop): open it, or open it in split screen next to
  // what's showing — side by side or one above the other.
  function onNavContextMenu(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a[href]");
    const href = a?.getAttribute("href");
    if (!isDesktop || !href || !canShowInPane(href)) return;
    e.preventDefault();
    // "Open" shows the page's own icon (the sidebar row's), like the rows below show theirs.
    const OpenIcon = pageNameFor(href)?.icon ?? (href === DASHBOARD_PATH ? HomeIcon : FileIcon);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Open", icon: <OpenIcon className="h-4 w-4 text-muted" />, onSelect: () => navigateMain(href) || router.push(href) },
        // Short, so they fit the menu's width; the split icons say it's split screen.
        { label: "Open side by side", icon: <SplitIcon direction="row" className="h-4 w-4 text-muted" />, onSelect: () => openBeside(href, { mode: "right" }) },
        { label: "Open above and below", icon: <SplitIcon direction="col" className="h-4 w-4 text-muted" />, onSelect: () => openBeside(href, { mode: "down" }) },
        { label: "Open in the side view", icon: <SideViewIcon className="h-4 w-4 text-muted" />, onSelect: () => openBeside(href) },
        { label: "Open in a new tab", icon: <NewTabIcon className="h-4 w-4" />, onSelect: () => newTab(href, { after: true }), divider: true },
      ],
    });
  }
  const contextMenu = menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />;
  // Community, Tunes and Chord Charts aren't a collapsible category like the others — they're the
  // app's main destinations (each its own tab in the mobile app), shown as always-visible items
  // right under the search box.
  const communityItems = filtered.filter((link) => link.category === "Community");
  // Tunes and Chord Charts share one entry: the Tunes button covers the chord charts pages too
  // (Chord Charts still turns up as a search result).
  const libraryItems = communityItems.filter((link) => link.href !== "/chord-charts");
  // "Your shed" holds the Library (with the Shed Log card); "People" holds Community and Lessons.
  const shedItems = libraryItems.filter((link) => link.href === "/tunes");
  const peopleItems = libraryItems.filter((link) => link.href !== "/tunes");
  // The Shed Log isn't one tool among the others: it's its own card under Dashboard (and
  // only joins the list while searching, as a normal result).
  const groups = groupByCategory(filtered.filter((link) => link.category !== "Community" && (searching || (link.href !== "/shed-log" && link.href !== "/shed-notes"))));
  // A subset of `filtered`, in NAV_LINKS' own order (stable regardless of favoriting order) —
  // shown as a section of its own above the normal categories, where each item also still stays
  // in its own category below (a quick-access shortcut, not a "moved out of" relocation).
  const favoriteItems = isAuthenticated
    ? filtered.filter((link) => favorites.includes(link.href))
    : [];

  function renderLink(linkInfo: NavLink, options?: { noStar?: boolean }) {
    const { href, label, short, icon: Icon, desktopOnly } = linkInfo;
    const active = effectivePathname === href;
    // On phones, tools that need a bigger screen are shown greyed out and can't be opened.
    if (large && desktopOnly) {
      return (
        <div
          key={href}
          aria-disabled="true"
          title="Needs a larger screen"
          className="flex h-11 cursor-not-allowed items-center gap-2.5 rounded-md px-2 text-base text-muted opacity-50"
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="truncate">{label}</span>
          <span className="ml-auto text-xs font-normal">Desktop only</span>
        </div>
      );
    }

    // Room reserved on the right for the star, so it never overlaps the icon/label — reserved
    // whenever it *can* show (signed in, not collapsed), not just while actually hovered, so nothing
    // shifts around when it fades in.
    // `options` is an object, not a bare boolean, because `items.map(renderLink)` passes the index
    // as the second argument.
    const showsStar = isAuthenticated && !collapsed && !options?.noStar;
    const name = searching ? label : (short ?? label);
    const link = (
      <Link
        href={href}
        onClick={onNavigate}
        title={name !== label ? label : undefined}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`${navRowClass(active, large)} ${showsStar ? (large ? "pr-12" : "pr-8") : ""}`}
      >
        <ToolTile link={linkInfo} active={active} large={large} />
        <span className="truncate">{name}</span>
      </Link>
    );

    if (!showsStar) {
      return <div key={href}>{link}</div>;
    }
    // The star sits on top of the link's own right edge (visually "inside" the nav button, so the
    // button stays full width) rather than actually nested inside it — a <button> inside the <a>
    // next/link renders is invalid HTML and breaks click handling. It's a sibling in a `relative`
    // wrapper instead, absolutely positioned over the padding the link reserved for it above, and
    // stacked on top (`z-10`) so a click there hits the star, not the link underneath it.
    const isFavorite = favorites.includes(href);
    return (
      <div key={href} className="group relative flex items-center">
        {link}
        <button
          type="button"
          onClick={() => toggleFavorite(href)}
          aria-label={isFavorite ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
          aria-pressed={isFavorite}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          className={`absolute right-0.5 top-1/2 z-10 flex -translate-y-1/2 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-hover ${
            large ? "h-10 w-10" : "h-7 w-7"
          } ${isFavorite ? "text-accent" : "text-muted hover:text-foreground"} ${
            // An already-favorited star always stays visible (so you can see what's starred at a
            // glance); an unfavorited one only shows on hover on desktop (no hover on mobile, so
            // it's always visible there too). focus-visible keeps it reachable by keyboard even
            // without a mouse hovering it.
            large || isFavorite
              ? ""
              : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          }`}
        >
          <StarIcon className={large ? "h-4 w-4" : "h-3.5 w-3.5"} filled={isFavorite} />
        </button>
      </div>
    );
  }

  // A main destination (Library, Community, Lessons): a row like the rest, active on its subpages too.
  function renderTile(link: NavLink) {
    const { href, label, icon: Icon } = link;
    const active = effectivePathname === href || effectivePathname.startsWith(`${href}/`) || (href === "/tunes" && isLibraryPath(effectivePathname));
    return (
      <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={navRowClass(active, large)}>
        <span data-nav-icon className="flex shrink-0" style={{ color: CATEGORY_COLORS[link.category] }}>
          <Icon className={navIconClass(large)} />
        </span>
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  // Collapsing is a `!collapsed`-only (not icon-mode) concept, and a search in progress always
  // forces every section open — a collapsed one hiding its own search matches would just look
  // like the search was broken.
  function isSectionCollapsed(key: string) {
    return !collapsed && !searching && (collapsedCategories[key] ?? site.sidebarCategoriesCollapsed);
  }

  if (collapsed) {
    // Icon-only: the same groups as the full sidebar, split by hairlines (each name on hover).
    const iconLink = (link: NavLink) => {
      const { href, label, icon: Icon } = link;
      const active = effectivePathname === href || (href !== "/" && effectivePathname.startsWith(`${href}/`)) || (href === "/tunes" && isLibraryPath(effectivePathname));
      return (
        <Link key={href} href={href} onClick={onNavigate} title={label} aria-label={label} aria-current={active ? "page" : undefined} className={navIconButtonClass(active)} style={{ color: CATEGORY_COLORS[link.category] }}>
          <Icon className="h-4 w-4" />
        </Link>
      );
    };
    const group = (key: string, title: string, children: React.ReactNode) => (
      <div key={key} title={title} className="flex w-full flex-col items-center gap-px border-t border-foreground/10 pt-2 first:border-t-0 first:pt-0">
        {children}
      </div>
    );
    return (
      <nav ref={navRef} onContextMenu={onNavContextMenu} className="flex h-full flex-col items-center overflow-y-auto overflow-x-hidden pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-full shrink-0 flex-col items-center gap-2">
        {group("start", "Dashboard", <DashboardNavCard active={effectivePathname === DASHBOARD_PATH} collapsed onNavigate={onNavigate} />)}
        {group(
          "shed",
          "Your shed",
          <>
            {site.shedLog && <PracticeLogNavCard active={effectivePathname.startsWith("/shed-log")} collapsed onNavigate={onNavigate} />}
            {site.shedNotes && <ShedNotesNavCard active={effectivePathname.startsWith("/shed-notes")} collapsed onNavigate={onNavigate} />}
            {shedItems.map(iconLink)}
          </>,
        )}
        {peopleItems.length > 0 && group("people", "People", peopleItems.map(iconLink))}
        {favoriteItems.length > 0 && group("favorites", "Favorites", favoriteItems.map(iconLink))}
        {groups.map(({ category, items }) => group(category, category, items.map(iconLink)))}
        </div>
        {moreBelow && (
          <div className="pointer-events-none sticky bottom-0 -mt-10 flex h-12 w-full shrink-0 items-end justify-center bg-gradient-to-t from-surface from-40% to-transparent">
            <button
              type="button"
              onClick={() => navRef.current?.scrollBy({ top: 240, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
              aria-label="Show more tools"
              title="More tools"
              className="pointer-events-auto mb-2 flex h-6 w-9 items-center justify-center rounded-md bg-foreground/[0.05] text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        {contextMenu}
      </nav>
    );
  }

  return (
    <nav ref={navRef} onContextMenu={onNavContextMenu} className="flex h-full flex-col gap-4 overflow-y-auto [scrollbar-width:thin]">
      {(!searching || communityItems.length > 0) && (
        <div className="flex flex-col gap-px">
          {searching ? (
            communityItems.map((l) => renderLink(l))
          ) : (
            <>
              {/* The dashboard (the app's home); the logo above goes to the landing page. */}
              <DashboardNavCard active={effectivePathname === DASHBOARD_PATH} collapsed={collapsed} large={large} onNavigate={onNavigate} />
              {/* Your shed: your own practice — the Shed Log and your library. */}
              <SectionHeading large={large}>Your shed</SectionHeading>
              {site.shedLog && <PracticeLogNavCard active={effectivePathname.startsWith("/shed-log")} collapsed={collapsed} large={large} onNavigate={onNavigate} />}
              {site.shedNotes && <ShedNotesNavCard active={effectivePathname.startsWith("/shed-notes")} collapsed={collapsed} large={large} onNavigate={onNavigate} />}
              {shedItems.map((link) => renderTile(link))}
              {/* People: other musicians — Community, and your teachers or students. */}
              {peopleItems.length > 0 && (
                <>
                  <SectionHeading large={large}>People</SectionHeading>
                  {peopleItems.map((link) => renderTile(link))}
                </>
              )}
            </>
          )}
        </div>
      )}
      {/* While searching, the matches show once, in their own categories (not again under Favorites). */}
      {favoriteItems.length > 0 && !searching && (
        <CategoryBlock
          title="Favorites"
          star
          items={favoriteItems}
          large={large}
          searching={searching}
          isCollapsed={isSectionCollapsed("Favorites")}
          onToggleCollapse={() => setCategoryCollapsed("Favorites", !isSectionCollapsed("Favorites"))}
          renderLink={renderLink}
        />
      )}
      {groups.map(({ category, items }) => (
        <CategoryBlock
          key={category}
          title={category}
          items={items}
          large={large}
          searching={searching}
          isCollapsed={isSectionCollapsed(category)}
          onToggleCollapse={() => setCategoryCollapsed(category, !isSectionCollapsed(category))}
          renderLink={renderLink}
        />
      ))}
      {/* Searching (the phone menu): pages, settings, your tunes and charts after the tools, as
          in the / palette — mounted only while searching, so the chart list isn't loaded otherwise. */}
      {searching && <SearchExtras query={query} large={large} toolsFound={groups.length + communityItems.length} onNavigate={onNavigate} />}
      {contextMenu}
    </nav>
  );
}

/** The search's other results, under the tools (`useSearchExtras`, the / palette's own search). */
function SearchExtras({ query, large, toolsFound, onNavigate }: { query: string; large?: boolean; toolsFound: number; onNavigate?: () => void }) {
  const { help, pageGroups, tunes, charts } = useSearchExtras(query);
  const groups: { title: string; items: SearchItem[]; accent?: boolean }[] = [
    { title: "Help", items: help },
    ...pageGroups.map((g) => ({ title: g.category, items: g.items })),
    { title: "Your tunes", items: tunes, accent: true },
    { title: "Your chord charts", items: charts, accent: true },
  ].filter((g) => g.items.length);
  if (toolsFound === 0 && groups.length === 0) {
    return <p className={`px-3 text-muted ${large ? "text-base" : "text-sm"}`}>Nothing matches that</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-px">
          <SectionHeading large={large}>{g.title}</SectionHeading>
          {g.items.map(({ href, label, detail, icon: Icon }) => (
            <Link key={href} href={href} onClick={onNavigate} className={navRowClass(false, large)}>
              <span data-nav-icon className={`flex shrink-0 ${g.accent ? "text-accent" : "text-muted"}`}>
                <Icon className={navIconClass(large)} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {label}
                {detail && <span className={`ml-2 text-muted ${large ? "text-sm" : "text-xs"}`}>{detail}</span>}
              </span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The app's sidebar on desktop (resizable, collapsible to icons, hideable) and the phone's top
    bar and menu. Right-click a page in it to open it in split screen or the side view. */
export default function Sidebar() {
  // The ⋮ menus offer the desktop app everywhere but inside it.
  const inDesktop = useInDesktopApp();
  const layout = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  const { width, hidden } = layout;
  // Hidden, the sidebar peeks in at full width (never as the icon strip).
  const collapsed = layout.collapsed && !hidden;
  const [dragging, setDragging] = useState(false);
  const [peek, setPeek] = useState(false);
  const peeking = hidden && peek;
  const asideRef = useRef<HTMLElement>(null);
  const shortcut = useHideShortcut();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const fabHidden = useFeedbackFabHidden();
  const currentPath = usePathname();
  // The phone menu remembers the page it was opened on and counts as closed once the page
  // changes. Its links close it themselves, but a leave guard (unsaved work) stops their click
  // and navigates after its own "Leave", so the menu must also close on the page change itself.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  if (menuOpenOn !== null && menuOpenOn !== currentPath) setMenuOpenOn(null);
  const mobileOpen = menuOpenOn !== null;
  const setMobileOpen = (open: boolean) => setMenuOpenOn(open ? currentPath : null);
  const [site] = useSiteSettings();
  // Signed in, the theme lives on the Settings page; signed out, it's the theme dialog.
  const { isAuthenticated } = useConvexAuth();
  const openSettings = () => (isAuthenticated ? router.push("/account?tab=general") : setThemeOpen(true));
  const settingsIcon = isAuthenticated ? GearIcon : PaletteIcon;
  const settingsLabel = isAuthenticated ? "Settings" : "Theme and display";
  const onHelp = currentPath === "/help";

  const setWidth = (w: number) => updateLayout({ width: clamp(w) });

  // While hidden, the page bar leaves room at its left for the menu button (`PageBar`, panes).
  useEffect(() => {
    const root = document.documentElement;
    if (hidden) root.style.setProperty("--sidebar-toggle-room", TOGGLE_ROOM);
    else root.style.removeProperty("--sidebar-toggle-room");
  }, [hidden]);

  // ⌘\ / Ctrl+\ hides the sidebar or brings it back (desktop widths).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "\\" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      e.preventDefault();
      setPeek(false);
      updateLayout({ hidden: !getLayout().hidden });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hidden: the window's left edge brings the sidebar in, like hovering the menu button.
  useEffect(() => {
    if (!hidden || peek) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.clientX <= 4) setPeek(true);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [hidden, peek]);

  // Peeking: it stays while the pointer is over it, the menu button, or a menu or dialog it opened
  // (those are portaled outside it), and slides away a moment after the pointer leaves them all.
  useEffect(() => {
    if (!peeking) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const keep = (target: EventTarget | null) =>
      target instanceof Element &&
      (asideRef.current?.contains(target) ||
        toggleRef.current?.contains(target) ||
        !!target.closest('[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]'));
    const onMove = (e: PointerEvent) => {
      if (keep(e.target) || (e.pointerType === "mouse" && e.clientX <= 4)) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
      } else if (timer === null) {
        timer = setTimeout(() => setPeek(false), PEEK_CLOSE_MS);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPeek(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [peeking]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpenOn(null);
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) setMenuOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileOpen]);

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  /** Narrower than `RAIL_SNAP_WIDTH` it becomes the icon strip, and wider again comes back out
      (not while peeking: the strip is for a sidebar that's kept open). */
  function onDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const left = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    const w = e.clientX - left;
    if (!hidden && w < RAIL_SNAP_WIDTH) {
      if (!layout.collapsed) updateLayout({ collapsed: true });
    } else {
      updateLayout({ collapsed: false, width: clamp(w) });
    }
  }

  function onKeyResize(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      if (collapsed) return;
      if (!hidden && width <= MIN_WIDTH) updateLayout({ collapsed: true });
      else setWidth(width - 16);
    } else if (e.key === "ArrowRight") {
      if (collapsed) updateLayout({ collapsed: false, width: MIN_WIDTH });
      else setWidth(width + 16);
    } else return;
    e.preventDefault();
  }

  const shownWidth = collapsed ? COLLAPSED_WIDTH : width;

  return (
    <>
      {/* Phones: a top bar with the menu and the logo (pages leave 4.5rem at the top for it). The
          practice timer's chip, when one runs, sits at its right end before the bug button; the
          page name gives way (truncates) to them. */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-[calc(env(safe-area-inset-top)+3.5rem)] items-center gap-2 border-b border-foreground/10 bg-background/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-hover"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <MobileBarTitle path={currentPath} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <PhoneTabsButton />
          <PracticeTimerWidget bar />
          <FeedbackBarButton />
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:hidden">
          <div className="mb-6 flex items-center justify-between gap-1">
            <div className="min-w-0">
              <Link
                href={LANDING_PATH}
                onClick={() => setMobileOpen(false)}
                aria-label="About soniroll"
                className="block w-fit rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <AnimatedLogo height={36} />
              </Link>
              <VersionTag onNavigate={() => setMobileOpen(false)} />
            </div>
            {/* Send feedback is in the ⋮ menu (the top bar has the bug-report button). */}
            <div className="flex shrink-0 items-center gap-1">
              <Link
              href="/help"
              onClick={() => setMobileOpen(false)}
              aria-label="Help"
              title="Help"
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
            >
              <HelpIcon className="h-5 w-5" />
            </Link>
              <Flyout
                icon={DotsIcon}
                label="Menu options"
                align="end"
                buttonClassName="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                {(close) => (
                  <>
                    <FlyoutItem
                      icon={TabsIcon}
                      label="Tabs"
                      onSelect={() => {
                        setMobileOpen(false);
                        openTabsSheet();
                        close();
                      }}
                    />
                    <FlyoutItem
                      icon={FeedbackIcon}
                      label="Send feedback"
                      onSelect={() => {
                        setMobileOpen(false);
                        openFeedback();
                        close();
                      }}
                    />
                    {fabHidden && (
                      <FlyoutItem
                        icon={BugIcon}
                        label="Show bug report button"
                        onSelect={() => {
                          showFeedbackFab();
                          close();
                        }}
                      />
                    )}
                    <FlyoutItem
                      icon={HeartIcon}
                      label="Support soniroll"
                      onSelect={() => {
                        setMobileOpen(false);
                        router.push(SUPPORT_PATH);
                        close();
                      }}
                    />
                    <FlyoutItem
                      icon={CloudIcon}
                      label="Storage plans"
                      onSelect={() => {
                        setMobileOpen(false);
                        router.push(PLAN_HREF);
                        close();
                      }}
                    />
                    {!inDesktop && (
                      <>
                        <FlyoutItem
                          icon={DownloadIcon}
                          label="Desktop app"
                          onSelect={() => {
                            setMobileOpen(false);
                            router.push(DOWNLOAD_PATH);
                            close();
                          }}
                        />
                        <FlyoutItem
                          icon={PhoneIcon}
                          label="Phone app"
                          onSelect={() => {
                            setMobileOpen(false);
                            router.push(MOBILE_PATH);
                            close();
                          }}
                        />
                      </>
                    )}
                    <FlyoutItem
                      icon={settingsIcon}
                      label={settingsLabel}
                      onSelect={() => {
                        setMobileOpen(false);
                        openSettings();
                        close();
                      }}
                    />
                    {isAdmin && (
                      <FlyoutItem
                        icon={ShieldIcon}
                        label="Admin"
                        onSelect={() => {
                          setMobileOpen(false);
                          router.push("/admin");
                          close();
                        }}
                      />
                    )}
                  </>
                )}
              </Flyout>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                title="Close menu"
                className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-hover"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <SearchBox
            large
            query={query}
            onChange={setQuery}
            onNavigate={() => setMobileOpen(false)}
          />
          {/* min-h-0 lets this shrink below its content's natural height (the flex-column
              default is min-height: auto, which would otherwise just grow the whole menu past
              the screen instead of scrolling) — needed now that the tool list is long enough to
              overflow a phone screen on its own. */}
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            <NavItems large query={query} onNavigate={() => setMobileOpen(false)} />
          </div>
          {/* Kept short, so the list above gets the room: Support soniroll is in the ⋮ menu. */}
          <div className="mt-1 flex flex-col gap-1 border-t border-foreground/10 pt-2">
            <PracticeTimerWidget />
            <SettingsRow
              large
              signedIn={isAuthenticated}
              onOpenTheme={() => {
                setMobileOpen(false);
                setThemeOpen(true);
              }}
              onNavigate={() => setMobileOpen(false)}
            />
            <AccountMenu large onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {themeOpen && <ThemeModal onClose={() => setThemeOpen(false)} />}

      {/* Hidden: the menu button at the top left. Hovering it slides the sidebar in over the
          page; clicking keeps it open again. */}
      {hidden && (
        <button
          ref={toggleRef}
          type="button"
          onClick={() => {
            setPeek(false);
            updateLayout({ hidden: false });
          }}
          onPointerEnter={(e) => e.pointerType === "mouse" && setPeek(true)}
          aria-label="Show the sidebar"
          title={`Keep the sidebar open (${shortcut})`}
          className="fixed left-3 top-2.5 z-[51] hidden h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground lg:flex"
        >
          {peeking ? <DoubleChevronIcon direction="right" className="h-4 w-4" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      )}

      <aside
        ref={asideRef}
        style={{ width: shownWidth }}
        inert={hidden && !peek}
        aria-hidden={hidden && !peek ? true : undefined}
        className={`hidden shrink-0 flex-col bg-surface p-2 lg:flex ${
          hidden
            ? `fixed bottom-2 left-2 top-14 z-50 rounded-xl shadow-2xl shadow-black/20 ring-1 ring-foreground/10 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                peek ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"
              }`
            : `relative border-r border-foreground/10 ${dragging ? "" : "transition-[width] duration-150"}`
        }`}
      >
        <div
          className={
            collapsed
              ? "mb-4 flex h-10 items-center justify-center"
              : "mb-3 flex min-h-10 items-center justify-between gap-1 pl-1 pt-1"
          }
        >
          {collapsed ? (
            <Link href={LANDING_PATH} aria-label="About soniroll" title={`soniroll ${VERSION_LABEL}`} className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-hover">
              <LogoMark size={28} />
            </Link>
          ) : (
            <div className="min-w-0 flex-1">
              <Link href={LANDING_PATH} aria-label="About soniroll" className="block w-fit rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <AnimatedLogo height={30} />
              </Link>
              <VersionTag />
            </div>
          )}
          {!collapsed && (
          <div className="flex shrink-0 items-center">
          <Link
            href="/help"
            aria-label="Help"
            title="Help"
            className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-hover hover:text-foreground ${onHelp ? "text-foreground" : "text-muted"}`}
          >
            <HelpIcon className="h-4 w-4" />
          </Link>
          <Flyout
            icon={DotsIcon}
            label="Sidebar options"
            align="end"
          >
            {(close) => (
              <>
                <FlyoutItem
                  icon={NewTabIcon}
                  label="New tab"
                  onSelect={() => {
                    newTab();
                    close();
                  }}
                />
                <FlyoutItem
                  icon={MegaphoneIcon}
                  label={`What's new · v${SHOWN_VERSION}`}
                  onSelect={() => {
                    router.push("/changelog");
                    close();
                  }}
                />
                <FlyoutItem
                  icon={FeedbackIcon}
                  label="Send feedback"
                  onSelect={() => {
                    openFeedback();
                    close();
                  }}
                />
                <FlyoutItem
                  icon={HeartIcon}
                  label="Support soniroll"
                  onSelect={() => {
                    router.push(SUPPORT_PATH);
                    close();
                  }}
                />
                <FlyoutItem
                  icon={CloudIcon}
                  label="Storage plans"
                  onSelect={() => {
                    router.push(PLAN_HREF);
                    close();
                  }}
                />
                {!inDesktop && (
                  <>
                    <FlyoutItem
                      icon={DownloadIcon}
                      label="Desktop app"
                      onSelect={() => {
                        router.push(DOWNLOAD_PATH);
                        close();
                      }}
                    />
                    <FlyoutItem
                      icon={PhoneIcon}
                      label="Phone app"
                      onSelect={() => {
                        router.push(MOBILE_PATH);
                        close();
                      }}
                    />
                  </>
                )}
                {fabHidden && (
                  <FlyoutItem
                    icon={BugIcon}
                    label="Show bug report button"
                    onSelect={() => {
                      showFeedbackFab();
                      close();
                    }}
                  />
                )}
                <FlyoutItem
                  icon={settingsIcon}
                  label={settingsLabel}
                  onSelect={() => {
                    openSettings();
                    close();
                  }}
                />
                {isAdmin && (
                  <FlyoutItem
                    icon={ShieldIcon}
                    label="Admin"
                    onSelect={() => {
                      router.push("/admin");
                      close();
                    }}
                  />
                )}
              </>
            )}
          </Flyout>
          <SidebarHideButton peeking={peeking} />
          </div>
          )}
        </div>
        {collapsed && <SidebarExpandButton />}
        {collapsed ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            aria-label="Search tools"
            title="Search tools"
            className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-foreground/[0.05] text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
        ) : (
          <SearchBox query={query} onChange={setQuery} />
        )}
        <NavItems collapsed={collapsed} query={query} />
        {/* The grouping background/padding is only meaningful expanded — collapsed, with just an
            icon-sized widget and the avatar link stacked tightly, it read as an unwanted rounded
            box squeezed around the profile picture (reported directly, with a screenshot), so
            collapsed drops to a plain unboxed stack instead. */}
        <div
          className="mt-2 flex flex-col gap-1 border-t border-foreground/10 pt-2"
        >
          <PracticeTimerWidget collapsed={collapsed} />
          {/* The website offers the desktop app here; inside the app, Support soniroll. */}
          {inDesktop
            ? site.sidebarSupport && <SupportRow collapsed={collapsed} active={currentPath === SUPPORT_PATH} />
            : site.sidebarDesktopApp && <DesktopAppRow collapsed={collapsed} active={currentPath === DOWNLOAD_PATH} />}
          <SettingsRow collapsed={collapsed} signedIn={isAuthenticated} onOpenTheme={() => setThemeOpen(true)} />
          {collapsed && (
            <div className="flex flex-col items-center gap-1 pb-1">
              <Flyout icon={DotsIcon} label="Sidebar options" align="start">
                {(close) => (
                  <>
                    <FlyoutItem
                      icon={NewTabIcon}
                      label="New tab"
                      onSelect={() => {
                        newTab();
                        close();
                      }}
                    />
                    <FlyoutItem
                      icon={settingsIcon}
                      label={settingsLabel}
                      onSelect={() => {
                        setMobileOpen(false);
                        openSettings();
                        close();
                      }}
                    />
                    {isAdmin && (
                      <FlyoutItem
                        icon={ShieldIcon}
                        label="Admin"
                        onSelect={() => {
                          router.push("/admin");
                          close();
                        }}
                      />
                    )}
                    <FlyoutItem
                      icon={HelpIcon}
                      label="Help"
                      onSelect={() => {
                        router.push("/help");
                        close();
                      }}
                    />
                    <FlyoutItem
                      icon={MegaphoneIcon}
                      label={`What's new · v${SHOWN_VERSION}`}
                      onSelect={() => {
                        router.push("/changelog");
                        close();
                      }}
                    />
                    <FlyoutItem
                      icon={FeedbackIcon}
                      label="Send feedback"
                      onSelect={() => {
                        openFeedback();
                        close();
                      }}
                    />
                    <FlyoutItem
                      icon={HeartIcon}
                      label="Support soniroll"
                      onSelect={() => {
                        router.push(SUPPORT_PATH);
                        close();
                      }}
                    />
                    <FlyoutItem
                      icon={CloudIcon}
                      label="Storage plans"
                      onSelect={() => {
                        router.push(PLAN_HREF);
                        close();
                      }}
                    />
                    {!inDesktop && (
                      <>
                        <FlyoutItem
                          icon={DownloadIcon}
                          label="Desktop app"
                          onSelect={() => {
                            router.push(DOWNLOAD_PATH);
                            close();
                          }}
                        />
                        <FlyoutItem
                          icon={PhoneIcon}
                          label="Phone app"
                          onSelect={() => {
                            router.push(MOBILE_PATH);
                            close();
                          }}
                        />
                      </>
                    )}
                    {fabHidden && (
                      <FlyoutItem
                        icon={BugIcon}
                        label="Show bug report button"
                        onSelect={() => {
                          showFeedbackFab();
                          close();
                        }}
                      />
                    )}
                  </>
                )}
              </Flyout>
            </div>
          )}
          <AccountMenu collapsed={collapsed} />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={shownWidth}
          tabIndex={0}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={onKeyResize}
          onDoubleClick={() => updateLayout({ collapsed: false, width: DEFAULT_WIDTH })}
          title="Drag to resize (very narrow: just icons) · double-click to reset"
          // A 16px grab area covering the gap between the sidebar and the page, with a faint pill
          // in the middle as the handle; a hairline shows the edge while hovering or dragging.
          className="group absolute -right-3 top-0 z-10 flex h-full w-4 cursor-col-resize touch-none items-center justify-center outline-none"
        >
          <div
            className={`absolute inset-y-3 w-px transition-colors ${dragging ? "bg-accent/50" : "group-hover:bg-foreground/10 group-focus-visible:bg-accent/50"}`}
          />
          <div
            className={`relative w-1 rounded-full transition-all duration-150 ${
              dragging ? "h-14 bg-accent" : "h-10 bg-foreground/15 group-hover:h-14 group-hover:bg-accent/70 group-focus-visible:bg-accent"
            }`}
          />
        </div>
      </aside>
    </>
  );
}

/** The phone top bar's middle: the page you're on (its icon and name, `pageNameFor`), or the logo
    on pages that aren't in the tool list. */
function MobileBarTitle({ path }: { path: string }) {
  // The page's own trail (`PageBar`), once it's mounted; until then (and on the server) the name
  // worked out from the address below.
  const page = useCurrentCrumbs();
  if (page && page.crumbs.length > 0 && path !== DASHBOARD_PATH) return <MobileBarCrumbs page={page} />;
  return <MobileBarName path={path} />;
}

/** The phone top bar's middle from a page's crumbs: the logo, then "… / Tunes / Setlists" (the
    page and the one above it; anything further up behind "…"), and the page's ? when it has one.
    Tapping the page's own name scrolls back to the top. */
function MobileBarCrumbs({ page }: { page: PageCrumbs }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link href={DASHBOARD_PATH} aria-label="Dashboard" className="-mx-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
        <LogoMark size={22} />
      </Link>
      <span className="text-foreground/30">/</span>
      <CrumbTrail
        crumbs={page.crumbs}
        icon={page.icon}
        variant="compact"
        onCurrentClick={() => document.querySelector("[data-page-scroll]")?.scrollTo({ top: 0, behavior: "smooth" })}
      />
      {page.intro && <IntroButton onClick={page.intro.show} label={page.intro.label} />}
    </div>
  );
}

function MobileBarName({ path }: { path: string }) {
  const found = pageNameFor(path);
  const item = found ? { href: found.href, label: found.label.length > 24 && found.short ? found.short : found.label, Icon: found.icon } : null;
  if (path === DASHBOARD_PATH || !item) {
    const logo = (
      <Link href={DASHBOARD_PATH} aria-label="Dashboard" className="flex h-10 items-center rounded-md px-1">
        <Logo height={24} />
      </Link>
    );
    // On the dashboard the logo stands in for the page's name, so it's the page's heading.
    return path === DASHBOARD_PATH ? <h1 className="flex">{logo}</h1> : logo;
  }
  const { Icon } = item;
  const inner = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-muted" />
      {/* Only very long names use the short one: "Chords" alone would be unclear up here. */}
      <span className="truncate">{item.label}</span>
    </>
  );
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* A 40px target, a little more than the mark itself. */}
      <Link href={DASHBOARD_PATH} aria-label="Dashboard" className="-mx-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
        <LogoMark size={22} />
      </Link>
      <span className="text-foreground/30">/</span>
      {/* The section's name goes to the section (Library → /tunes, a tool → the tool), so from a
          tune, a chart or a Shed Log day one tap gets you back to its start. Pages with nowhere
          further up (a profile, a shared link) show the name alone. */}
      {item.href ? (
        <Link
          href={item.href}
          aria-current={path === item.href ? "page" : undefined}
          onClick={(e) => {
            // Already there: back to the top instead of reloading the page.
            if (path !== item.href) return;
            e.preventDefault();
            document.querySelector("[data-page-scroll]")?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="-mx-1 flex h-10 min-w-0 items-center gap-1.5 rounded-md px-1 text-sm font-medium hover:bg-surface-hover"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex h-10 min-w-0 items-center gap-1.5 text-sm font-medium">{inner}</span>
      )}
    </div>
  );
}

/** The account page's tabs in its Settings group (`AccountPage`'s `NAV`). */
const SETTINGS_TABS = new Set(["general", "appearance", "sidebar", "dashboard", "tools", "practice"]);

/** The sidebar footer's "Settings" row, always in view (the ⋮ menus have it too), with a palette
    button at its end that goes straight to Appearance (theme, text size). Signed out there are no
    account settings, so it's one "Theme and display" row opening the theme dialog. Collapsed: one
    icon button. */
function SettingsRow({
  collapsed = false,
  large = false,
  signedIn,
  onOpenTheme,
  onNavigate,
}: {
  collapsed?: boolean;
  large?: boolean;
  signedIn: boolean;
  onOpenTheme: () => void;
  onNavigate?: () => void;
}) {
  const iconCls = navIconClass(large);
  // Highlighted on the account page's Settings group (`/settings` redirects there too).
  const tab = useSearchParams()?.get("tab");
  const active = usePathname() === "/account" && !!tab && SETTINGS_TABS.has(tab);
  if (!signedIn) {
    return collapsed ? (
      <button type="button" onClick={onOpenTheme} aria-label="Theme and display" title="Theme and display" className={`${navIconButtonClass(false)} text-muted`}>
        <PaletteIcon className="h-4 w-4" />
      </button>
    ) : (
      <button type="button" onClick={onOpenTheme} className={navRowClass(false, large)}>
        <span data-nav-icon className="flex shrink-0 text-muted">
          <PaletteIcon className={iconCls} />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">Theme and display</span>
      </button>
    );
  }
  if (collapsed) {
    return (
      <Link href="/account?tab=general" onClick={onNavigate} aria-label="Settings" title="Settings" aria-current={active ? "page" : undefined} className={`${navIconButtonClass(active)} text-muted`}>
        <GearIcon className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <div className="relative flex items-center">
      <Link href="/account?tab=general" onClick={onNavigate} aria-current={active ? "page" : undefined} className={`${navRowClass(active, large)} ${large ? "pr-14" : "pr-10"}`}>
        <span data-nav-icon className="flex shrink-0 text-muted">
          <GearIcon className={iconCls} />
        </span>
        <span className="min-w-0 flex-1 truncate">Settings</span>
      </Link>
      <Link
        href="/account?tab=appearance"
        onClick={onNavigate}
        aria-label="Theme and appearance"
        title="Theme and appearance"
        className={`absolute right-1 flex items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${large ? "h-10 w-10" : "h-7 w-7"}`}
      >
        <PaletteIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** The version under the logo: "v0.9.0" and a small Beta tag, linking to what's new (with a dot
    when there's a version this device hasn't seen there yet). */
function VersionTag({ onNavigate }: { onNavigate?: () => void }) {
  const unseen = useChangelogUnseen();
  return (
    <Link
      href="/changelog"
      onClick={onNavigate}
      title={DESKTOP_VERSION ? `What's new — soniroll desktop ${DESKTOP_VERSION} (website v${APP_VERSION})` : "What's new"}
      className="relative mt-0.5 flex w-fit items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1 pointer-coarse:after:absolute pointer-coarse:after:-inset-y-3 pointer-coarse:after:-inset-x-1 text-[10px] font-semibold leading-none text-muted hover:text-foreground"
    >
      {DESKTOP_VERSION ? `v${DESKTOP_VERSION}` : VERSION_LABEL.replace(/ beta$/, "")}
      {DESKTOP_VERSION ? (
        <span className="rounded-sm bg-foreground/[0.05] px-1 py-px text-[9px] font-semibold text-muted">Desktop</span>
      ) : (
        CHANNEL === "beta" && <span className="rounded-sm bg-foreground/[0.05] px-1 py-px text-[9px] font-semibold text-muted">Beta</span>
      )}
      {unseen && (
        <span className="flex items-center gap-1 rounded-sm bg-accent px-1 py-px text-[9px] font-semibold text-accent-foreground">
          <span className="h-1 w-1 rounded-full bg-accent-foreground" /> New
        </span>
      )}
    </Link>
  );
}
