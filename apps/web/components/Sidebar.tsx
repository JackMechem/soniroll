"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import AccountMenu from "@/components/AccountMenu";
import { OPEN_PALETTE_EVENT, useSearchExtras, type SearchItem } from "@/components/CommandPalette";
import Flyout, { FlyoutItem } from "@/components/Flyout";
import PracticeTimerWidget from "@/components/PracticeTimerWidget";
import ThemeModal from "@/components/ThemeModal";
import AnimatedLogo from "@/components/AnimatedLogo";
import Logo, { LogoMark } from "@/components/Logo";
import { APP_VERSION, CHANNEL, VERSION_LABEL } from "@/lib/version";
import { useChangelogUnseen } from "@/lib/useChangelogUnseen";
import { DASHBOARD_PATH, LANDING_PATH } from "@/lib/landing";
import PracticeLogNavCard from "@/components/practicelog/PracticeLogNavCard";
import ShedNotesNavCard from "@/components/shednotes/ShedNotesNavCard";
import DashboardNavCard from "@/components/DashboardNavCard";
import { SupportRow, SUPPORT_PATH } from "@/components/support/SupportParts";
import { PlansRow } from "@/components/plans/PlansRow";
import { DesktopAppRow, DOWNLOAD_PATH } from "@/components/download/DesktopAppRow";
import { PLAN_HREF } from "@/lib/storagePlan";
import {
  CATEGORY_COLORS,
  BugIcon,
  FeedbackIcon,
  GearIcon,
  MegaphoneIcon,
  CloudIcon,
  DownloadIcon,
  HeartIcon,
  HelpIcon,
  ShieldIcon,
  DocumentIcon,
  ShareIcon,
  UserIcon,
  NAV_LINKS,
  SearchIcon,
  findToolLink,
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
import { FeedbackBarButton, showFeedbackFab, useFeedbackFabHidden } from "@/components/feedback/FeedbackFab";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { collectLeaves } from "@/lib/tilingLayout";
import { TOOL_COMPONENTS } from "@/lib/toolRegistry";
import { useFavorites } from "@/lib/useFavorites";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { openInSplit, useTilingState } from "@/lib/useTilingLayout";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";

const STORAGE_KEY = "jam-practice-sidebar";
const DEFAULT_WIDTH = 244;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const COLLAPSED_WIDTH = 68;

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

/** A pane split side by side ("row") or top and bottom ("col"). */
function SplitIcon({ direction }: { direction: "row" | "col" }) {
  return (
    <svg {...svgProps("h-4 w-4 text-muted")}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={direction === "row" ? "M12 4v16" : "M3 12h18"} />
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

function clamp(n: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

type Layout = { width: number; collapsed: boolean };

const DEFAULT_LAYOUT: Layout = { width: DEFAULT_WIDTH, collapsed: false };
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
  const { width, collapsed } = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  return collapsed ? COLLAPSED_WIDTH : width;
}

/** Hides the sidebar down to its icon strip (in the header, after the ⋮ menu), or, collapsed,
    brings it back (under the logo). */
function SidebarCollapseButton({ collapsed }: { collapsed: boolean }) {
  const label = collapsed ? "Show the sidebar" : "Hide the sidebar";
  return (
    <button
      type="button"
      onClick={() => updateLayout({ collapsed: !collapsed })}
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${collapsed ? "mx-auto mb-2 h-8 w-8" : "h-8 w-8"}`}
    >
      {/* Just a chevron: ‹ hides the sidebar, › brings it back. */}
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={collapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
      </svg>
    </button>
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

/** The library's other pages (chord charts, the setlist chart reader, files, recordings), which
    the sidebar files under Library (`/tunes`). */
function isLibraryPath(path: string) {
  return path === "/chord-charts" || path.startsWith("/chord-charts/") || path === "/setlist-charts" || path === "/files" || path === "/recordings" || path.startsWith("/recordings/");
}

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
    <div className={`flex flex-col gap-0.5 ${star ? "rounded-lg bg-accent/[0.08] p-1.5 pt-2" : ""}`}>
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
  // Which link counts as "active" — normally just the real URL, but while "Advanced layouts" is
  // genuinely in effect (on, and desktop-sized — the same condition `AppShell.tsx` gates
  // `TilingLayout` on), focusing a different pane no longer moves Next's own `usePathname()` (see
  // `lib/useTilingLayout.ts`'s `syncAddressBar` for why — routing that through Next's router was
  // traced to a real pane-losing-its-state bug), so the sidebar has to read the *active pane's own
  // href* directly instead, or it would silently stop following pane focus changes.
  const tilingState = useTilingState();
  const isDesktop = useIsDesktop();
  const activePaneHref =
    tilingState.enabled && isDesktop && tilingState.tree && tilingState.activePaneId
      ? collectLeaves(tilingState.tree).find((l) => l.id === tilingState.activePaneId)?.href
      : undefined;
  const effectivePathname = activePaneHref ?? pathname;
  const navRef = useRef<HTMLElement>(null);
  // Bring the page you're on into view in a long list (the sidebar, or the phone menu as it
  // opens), so you can see where you are and what's next to it. Only when it's out of sight.
  useEffect(() => {
    const row = navRef.current?.querySelector('[aria-current="page"]');
    if (!row) return;
    const r = row.getBoundingClientRect();
    if (r.top < 96 || r.bottom > window.innerHeight - 140) row.scrollIntoView({ block: "center" });
  }, [effectivePathname, collapsed]);
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
    if (!isDesktop || !href || !TOOL_COMPONENTS[href]) return;
    e.preventDefault();
    const current = TOOL_COMPONENTS[effectivePathname] ? effectivePathname : DASHBOARD_PATH;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Open", onSelect: () => router.push(href) },
        { label: "Open in split screen, side by side", icon: <SplitIcon direction="row" />, onSelect: () => openInSplit(href, "right", current) },
        { label: "Open in split screen, top and bottom", icon: <SplitIcon direction="col" />, onSelect: () => openInSplit(href, "down", current) },
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
      <nav ref={navRef} onContextMenu={onNavContextMenu} className="flex h-full flex-col items-center gap-2 overflow-y-auto overflow-x-hidden pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
      {favoriteItems.length > 0 && (
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

/** Advanced-layouts toggle logic shared by the desktop and mobile options flyouts (mobile only
    ever reaches this via a href that's never actually reachable there — `AppShell.tsx` disables
    tiling outright below the `lg` breakpoint regardless — but the toggle itself is still harmless
    to expose, consistent with this being "the one place Advanced layouts lives" rather than
    special-casing mobile out of a shared helper for no real benefit).

    Turning it *on* also resets the pane tree to a single fresh pane right here, seeded from
    `usePathname()` — the page you're actually looking at this instant, not whatever was last
    saved. Fixes a real bug reported directly ("when I initially turned the feature on, the tool I
    was using stopped displaying and there was text saying 'unknown tool'"): `TilingLayout`'s own
    seeding effect only ever fires when there's *no* saved tree at all, so turning the feature back
    on after having used (and left) it earlier silently resumed whatever stale tree was last saved.
    Falls back to the first tileable tool (`TILEABLE_LINKS[0]`) if you happen to enable it from a
    page that isn't a tool at all (e.g. the home page). */
export default function Sidebar() {
  const { width, collapsed } = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  const [dragging, setDragging] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const fabHidden = useFeedbackFabHidden();
  const currentPath = usePathname();
  const [site] = useSiteSettings();
  // Signed in, the theme lives on the Settings page; signed out, it's the theme dialog.
  const { isAuthenticated } = useConvexAuth();
  const openSettings = () => (isAuthenticated ? router.push("/account?tab=general") : setThemeOpen(true));
  const settingsIcon = isAuthenticated ? GearIcon : PaletteIcon;
  const settingsLabel = isAuthenticated ? "Settings" : "Theme and display";
  const onHelp = currentPath === "/help";

  const setWidth = (w: number) => updateLayout({ width: clamp(w) });

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) setMobileOpen(false);
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
    if (collapsed) {
      updateLayout({ collapsed: false, width: MIN_WIDTH });
    }
  }

  function onDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const left = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    setWidth(e.clientX - left);
  }

  function onKeyResize(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") setWidth(width - 16);
    else if (e.key === "ArrowRight") setWidth(width + 16);
    else return;
    e.preventDefault();
  }

  const shownWidth = collapsed ? COLLAPSED_WIDTH : width;

  return (
    <>
      {/* Phones: a top bar with the menu and the logo (pages leave 4.5rem at the top for it). The
          practice timer's badge, when one runs, sits at its right end. */}
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
        <FeedbackBarButton />
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
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  openFeedback();
                }}
                aria-label="Send feedback"
                title="Send feedback"
                className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <FeedbackIcon className="h-5 w-5" />
              </button>
              <Link
              href="/help"
              onClick={() => setMobileOpen(false)}
              aria-label="Help"
              title="Help"
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
            >
              <HelpIcon className="h-5 w-5" />
            </Link>
              <Flyout icon={DotsIcon} label="Menu options" align="end">
                {(close) => (
                  <>
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
          <div className="mt-1 flex flex-col gap-1 border-t border-foreground/10 pt-2">
            <PracticeTimerWidget />
            <PlansRow large path={currentPath} onNavigate={() => setMobileOpen(false)} />
            {site.sidebarSupport && <SupportRow large active={currentPath === SUPPORT_PATH} onNavigate={() => setMobileOpen(false)} />}
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

      <aside
        style={{ width: shownWidth }}
        className={`relative hidden shrink-0 flex-col border-r border-foreground/10 bg-surface p-2 lg:flex ${
          dragging ? "" : "transition-[width] duration-150"
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
                  icon={MegaphoneIcon}
                  label={`What's new · v${APP_VERSION}`}
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
          <SidebarCollapseButton collapsed={false} />
          </div>
          )}
        </div>
        {collapsed && <SidebarCollapseButton collapsed />}
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
          <DesktopAppRow collapsed={collapsed} active={currentPath === DOWNLOAD_PATH} />
          <PlansRow collapsed={collapsed} path={currentPath} />
          {site.sidebarSupport && <SupportRow collapsed={collapsed} active={currentPath === SUPPORT_PATH} />}
          <SettingsRow collapsed={collapsed} signedIn={isAuthenticated} onOpenTheme={() => setThemeOpen(true)} />
          {collapsed && (
            <div className="flex flex-col items-center gap-1 pb-1">
              <Flyout icon={DotsIcon} label="Sidebar options" align="start">
                {(close) => (
                  <>
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
                      label={`What's new · v${APP_VERSION}`}
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
          title="Drag to resize · double-click to reset"
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

/** The phone top bar's middle: the page you're on (its icon and name), or the logo on pages that
    aren't in the tool list. Library pages all count as Library. */
/** The phone top bar's name for pages that aren't a tool or a Library/Community/Lessons page. */
const PAGE_TITLES: { match: (path: string) => boolean; label: string; href?: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { match: (p) => p === "/account" || p === "/settings", label: "Account", href: "/account", icon: GearIcon },
  { match: (p) => p.startsWith("/u/"), label: "Profile", icon: UserIcon },
  { match: (p) => p === "/help" || p.startsWith("/help/"), label: "Help", href: "/help", icon: HelpIcon },
  { match: (p) => p === "/changelog", label: "What's new", href: "/changelog", icon: MegaphoneIcon },
  { match: (p) => p === "/feedback", label: "Feedback", href: "/feedback", icon: FeedbackIcon },
  { match: (p) => p === SUPPORT_PATH, label: "Support", href: SUPPORT_PATH, icon: HeartIcon },
  { match: (p) => p === "/plans", label: "Storage plans", href: "/plans", icon: CloudIcon },
  { match: (p) => p === DOWNLOAD_PATH, label: "Desktop app", href: DOWNLOAD_PATH, icon: DownloadIcon },
  { match: (p) => p === "/credits", label: "Credits", href: "/credits", icon: HeartIcon },
  { match: (p) => p === "/privacy", label: "Privacy", href: "/privacy", icon: ShieldIcon },
  { match: (p) => p === "/terms", label: "Terms", href: "/terms", icon: DocumentIcon },
  { match: (p) => p === "/admin" || p.startsWith("/admin/"), label: "Admin", href: "/admin", icon: ShieldIcon },
  { match: (p) => p === "/reset-password", label: "Reset password", icon: ShieldIcon },
  { match: (p) => /^\/(setlist|routine|tune|file|note)\//.test(p), label: "Shared", icon: ShareIcon },
];

function MobileBarTitle({ path }: { path: string }) {
  const link =
    findToolLink(isLibraryPath(path) || path.startsWith("/tunes/") ? "/tunes" : path) ??
    NAV_LINKS.find((l) => l.href !== "/" && (path.startsWith(`${l.href}/`) || (l.href === "/community" && path.startsWith("/post"))));
  const page = link ? null : PAGE_TITLES.find((t) => t.match(path));
  const item = link
    ? { href: link.href, label: link.label.length > 24 && link.short ? link.short : link.label, Icon: link.icon }
    : page
      ? { href: page.href, label: page.label, Icon: page.icon }
      : null;
  if (path === DASHBOARD_PATH || !item) {
    return (
      <Link href={DASHBOARD_PATH} aria-label="Dashboard" className="flex items-center rounded-md px-1 py-1">
        <Logo height={24} />
      </Link>
    );
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
      <Link href={DASHBOARD_PATH} aria-label="Dashboard" className="flex shrink-0 items-center rounded-md p-1">
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
      <Link href="/account?tab=general" onClick={onNavigate} aria-label="Settings" title="Settings" className={`${navIconButtonClass(false)} text-muted`}>
        <GearIcon className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <div className="relative flex items-center">
      <Link href="/account?tab=general" onClick={onNavigate} className={`${navRowClass(false, large)} ${large ? "pr-14" : "pr-10"}`}>
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
      title="What's new"
      className="mt-0.5 flex w-fit items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1 text-[10px] font-semibold leading-none text-muted hover:text-foreground"
    >
      {VERSION_LABEL.replace(/ beta$/, "")}
      {CHANNEL === "beta" && <span className="rounded-sm bg-foreground/[0.05] px-1 py-px text-[9px] font-semibold text-muted">Beta</span>}
      {unseen && (
        <span className="flex items-center gap-1 rounded-sm bg-accent px-1 py-px text-[9px] font-semibold text-accent-foreground">
          <span className="h-1 w-1 rounded-full bg-accent-foreground" /> New
        </span>
      )}
    </Link>
  );
}
