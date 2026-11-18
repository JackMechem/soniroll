"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { filterNavLinks } from "@jam-practice/core/navLinks";
import {
  BookIcon,
  CalendarIcon,
  ChordChartIcon,
  EyeIcon,
  CATEGORY_COLORS,
  FeedbackIcon,
  FileIcon,
  GearIcon,
  CloudIcon,
  DownloadIcon,
  HeartIcon,
  HelpIcon,
  HomeIcon,
  ListIcon,
  MegaphoneIcon,
  MicIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  SetlistIcon,
  ShieldIcon,
  SlidersIcon,
  UserIcon,
  UsersIcon,
  filterLinks,
  groupByCategory,
  svgProps,
} from "@/components/tools";
import { TUNE_LIST_LABEL, tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { chartHref, searchCharts, useChartTitles } from "@/components/library/useChartSearch";
import { displayKey } from "@jam-practice/core/setlistKeys";
import { ICON_BY_ID } from "@/components/help/helpParts";
import { HELP_TOPICS } from "@/lib/helpContent";
import {
  applyPendingSplit,
  clearPendingSplit,
  syncAddressBar,
  useTilingState,
} from "@/lib/useTilingLayout";

export const OPEN_PALETTE_EVENT = "open-command-palette";

type Icon = React.ComponentType<{ className?: string }>;
export type SearchItem = { href: string; label: string; detail?: string; icon: Icon };
type Item = SearchItem;

/** Pages and settings the palette finds besides the tools: `words` are what people might type
    for them ("theme", "dark mode", "goal"). `account` ones only show signed in. */
const PAGES: { group: "Pages" | "Settings"; href: string; label: string; detail?: string; words: string; icon: Icon; account?: boolean }[] = [
  { group: "Pages", href: "/dashboard", label: "Dashboard", words: "home start today", icon: HomeIcon },
  { group: "Pages", href: "/tunes/list?list=tunes", label: "Tunes I Know", detail: "Library", words: "library tunes repertoire songs list", icon: ListIcon },
  { group: "Pages", href: "/tunes/list?list=learn", label: "Tunes to Learn", detail: "Library", words: "library tunes learning wishlist songs list", icon: BookIcon },
  { group: "Pages", href: "/tunes?tab=setlists", label: "Setlists", detail: "Library", words: "library gig set list", icon: SetlistIcon },
  { group: "Pages", href: "/tunes?tab=files", label: "Files", detail: "Library", words: "library uploads pdf storage images documents", icon: FileIcon, account: true },
  { group: "Pages", href: "/recordings", label: "Recordings", detail: "Library", words: "library takes audio recorded clips", icon: MicIcon, account: true },
  { group: "Pages", href: "/community/new", label: "New post", detail: "Community", words: "community post share", icon: PlusIcon, account: true },
  { group: "Pages", href: "/community/liked", label: "Liked posts", detail: "Community", words: "community likes hearts saved favorites", icon: HeartIcon, account: true },
  { group: "Pages", href: "/community/following", label: "Following and followers", detail: "Community", words: "community people friends follow", icon: UsersIcon, account: true },
  { group: "Pages", href: "/community/posts", label: "My posts", detail: "Community", words: "community posts shared", icon: NoteIcon, account: true },
  { group: "Pages", href: "/help", label: "Help", words: "how guide manual faq docs instructions", icon: HelpIcon },
  { group: "Pages", href: "/changelog", label: "What's new", detail: "Changelog", words: "changelog updates releases version news", icon: MegaphoneIcon },
  { group: "Pages", href: "/feedback", label: "Send feedback", words: "feedback bug report idea contact problem suggestion", icon: FeedbackIcon },
  { group: "Pages", href: "/support", label: "Support soniroll", words: "donate donation coffee tip money", icon: HeartIcon },
  { group: "Pages", href: "/download", label: "Download the desktop app", words: "desktop app download install mac macos windows linux nixos appimage computer native", icon: DownloadIcon },
  { group: "Pages", href: "/plans", label: "Storage plans", words: "storage plan subscription subscribe cloud online sync files space gb upgrade billing", icon: CloudIcon },
  { group: "Settings", href: "/account?tab=profile", label: "Profile", detail: "Account", words: "account settings username picture avatar banner bio instruments public private", icon: UserIcon, account: true },
  { group: "Settings", href: "/account?tab=general", label: "General", detail: "Settings", words: "settings preferences features turn off hide clock confetti celebrations bug report button reset", icon: GearIcon, account: true },
  { group: "Settings", href: "/account?tab=appearance", label: "Appearance", detail: "Settings", words: "settings theme dark mode light colors colours font text size bigger smaller classic look motion display", icon: EyeIcon, account: true },
  { group: "Settings", href: "/account?tab=sidebar", label: "Sidebar", detail: "Settings", words: "settings menu hide tools folded streak", icon: ListIcon, account: true },
  { group: "Settings", href: "/account?tab=dashboard", label: "Dashboard settings", detail: "Settings", words: "settings home cards layout edit", icon: HomeIcon, account: true },
  { group: "Settings", href: "/account?tab=tools", label: "Tool settings", detail: "Settings", words: "settings tool pages stats option descriptions intros chips", icon: SlidersIcon, account: true },
  { group: "Settings", href: "/account?tab=practice", label: "Shed Log settings", detail: "Settings", words: "settings daily goal minutes practice sounds week", icon: CalendarIcon, account: true },
  { group: "Settings", href: "/account?tab=storage", label: "Storage plan", detail: "Account", words: "storage plan subscription subscribe cancel billing payment receipts card upgrade gb cloud", icon: CloudIcon, account: true },
  { group: "Settings", href: "/account?tab=security", label: "Sign-in & security", detail: "Account", words: "account settings password email google login sign in", icon: ShieldIcon, account: true },
];

/** Signed out, the theme and text size are on the account page too (no other settings). */
const SIGNED_OUT_APPEARANCE: (typeof PAGES)[number] = {
  group: "Settings",
  href: "/account",
  label: "Theme and display",
  detail: "Settings",
  words: "settings appearance theme dark mode light colors colours font text size classic look motion",
  icon: EyeIcon,
};

/** Words that ask for help ("help metronome", "how tuner"): the rest of the query picks topics. */
const HELP_WORDS = new Set(["help", "how", "?"]);

/**
 * What a search finds besides the tools — shared by the / palette and the phone menu's search, so
 * both reach the same things: pages and settings (once something's typed), "help <tool>" topics,
 * your tunes (both lists, each saying which) and your chord charts by title (a few at most; a
 * library can hold 1,500+). `charts: false` leaves the charts out (picking a tool for a split pane).
 */
export function useSearchExtras(query: string, { charts: withCharts = true }: { charts?: boolean } = {}) {
  const { isAuthenticated } = useConvexAuth();
  const lists = useTuneLists();
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tunes: Item[] = words.length
    ? (["tunes", "learn"] as TuneListId[])
        .flatMap((list) =>
          lists[list].tunes
            .filter((t) => words.every((w) => t.name.toLowerCase().includes(w)))
            .map((t) => ({ href: tuneHref(list, t.id), label: t.name, detail: TUNE_LIST_LABEL[list], icon: NoteIcon })),
        )
        .slice(0, 6)
    : [];
  const chartTitles = useChartTitles();
  const charts: Item[] = (withCharts ? searchCharts(chartTitles, query, 5) : []).map((c) => ({
    href: chartHref(c.id),
    label: c.title,
    detail: c.key ? `Chart in ${displayKey(c.key)}` : "Chart",
    icon: ChordChartIcon,
  }));
  // Pages and settings, only once something's typed (an empty search lists the tools).
  const pageItems = words.length
    ? filterNavLinks(
        PAGES.filter((p) => isAuthenticated || !p.account)
          .concat(isAuthenticated ? [] : [SIGNED_OUT_APPEARANCE])
          .map((p) => ({ ...p, description: `${p.detail ?? ""} ${p.words}` })),
        query,
      )
    : [];
  const pageGroups = (["Pages", "Settings"] as const)
    .map((g) => ({
      category: g as string,
      items: pageItems
        .filter((p) => p.group === g)
        .map((p): Item => ({ href: p.href, label: p.label, detail: p.detail === p.group ? undefined : p.detail, icon: p.icon })),
    }))
    .filter((g) => g.items.length);
  // "help <tool>": that tool's (or page's) help topic.
  const helpRest = words.filter((w) => !HELP_WORDS.has(w));
  const help: Item[] =
    words.some((w) => HELP_WORDS.has(w)) && helpRest.length
      ? filterNavLinks(
          HELP_TOPICS.map((t) => ({ label: t.title, description: t.tagline, id: t.id })),
          helpRest.join(" "),
        )
          .slice(0, 5)
          .map((t) => ({ href: `/help?topic=${t.id}`, label: t.label, icon: ICON_BY_ID[t.id] ?? HelpIcon }))
      : [];
  return { words, tunes, charts, pageGroups, help };
}

function EnterIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { pendingSplit } = useTilingState();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = filterLinks(query);
  const { words, help: helpItems, pageGroups, tunes: tuneItems, charts: chartItems } = useSearchExtras(query, { charts: !pendingSplit });
  // How many of the typed words are in a result's name — groups are ordered by their best one,
  // so "theme" or "files" put the page first, while a tool's name keeps the tool on top (ties
  // keep the tools first).
  const nameScore = (label: string) => words.filter((w) => label.toLowerCase().includes(w)).length;
  const groups: { category: string; items: Item[] }[] = [
    // Tool groups in the order of their best match, so "shed log" puts the Shed Log first rather
    // than a tool that only mentions it.
    ...groupByCategory(results).sort((x, y) => results.indexOf(x.items[0]) - results.indexOf(y.items[0])),
    ...(helpItems.length ? [{ category: "Help", items: helpItems }] : []),
    ...pageGroups,
    ...(tuneItems.length ? [{ category: "Your tunes", items: tuneItems }] : []),
  ]
    .map((g, i) => ({ g, i, score: words.length ? Math.max(...g.items.map((it) => nameScore(it.label))) : 0 }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ g }) => g)
    .concat(chartItems.length ? [{ category: "Your chord charts", items: chartItems }] : []);
  // The order results actually render in — grouped by category, not `results`' own flat order
  // (`filterLinks` returns matches in `NAV_LINKS`' declaration order, which isn't the same as
  // `CATEGORIES`' display order `groupByCategory` reorders them into). `go`/`activeIndex`/arrow-key
  // navigation all need to index into *this*, not `results` directly — indexing into `results`
  // while assigning each row's index during the `groups` render loop (the bug this replaces,
  // reported directly: "the search menu doesn't always open the tool I click on") meant `go(i)`
  // almost always resolved to a different tool than the one actually at position `i` on screen.
  const ordered = groups.flatMap((g) => g.items);
  const activeIndex = Math.min(active, Math.max(0, ordered.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function go(index: number) {
    const target = ordered[index];
    if (!target) return;
    // An edge button in `components/TilingLayout.tsx` opened this palette on a pane's behalf
    // (`requestSplit`) — picking a result here splits that pane instead of navigating the whole
    // page. `applyPendingSplit` already updates the pane tree itself; this only still owns moving
    // the URL, same as an ordinary pick. Uses `syncAddressBar` (raw History API), not
    // `router.replace` — routing a tiling-internal address-bar update through Next's own router
    // was traced to a real bug (see `TilingLayout.tsx`'s own doc comment): navigating to a URL
    // matching a `TOOL_COMPONENTS` entry remounts that tool wherever else it's already showing,
    // which would lose a sibling pane's running state the instant a split picked a tool that
    // happened to already be open elsewhere.
    if (applyPendingSplit(target.href)) {
      syncAddressBar(target.href);
    } else {
      router.push(target.href);
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(ordered.length - 1, activeIndex + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay px-4 pt-[18vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Search"
        className="w-full max-w-2xl overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface text-foreground shadow-2xl shadow-black/30"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-foreground/10 px-4 py-3.5">
          <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={pendingSplit ? "Pick a tool to tile…" : "Search tools, tunes, charts, pages and settings…"}
            aria-label="Search tools"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
        </div>

        <ul ref={listRef} role="listbox" className="max-h-96 overflow-y-auto p-1.5">
          {ordered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches that. Try another word, like “chords”, “theme”, “help tuner” or a tune’s name.</li>}
          {(() => {
            let index = -1;
            return groups.map(({ category, items }) => (
              <li key={category} role="presentation">
                <p className="px-3 pb-1 pt-3 text-xs font-medium text-muted first:pt-1">
                  {category === "Community" ? "Library and people" : category}
                </p>
                <ul role="presentation">
                  {items.map(({ href, label, detail, icon: Icon }) => {
                    index++;
                    const i = index;
                    return (
                      <li
                        key={href}
                        role="option"
                        aria-selected={i === activeIndex}
                        data-index={i}
                        onPointerMove={() => setActive(i)}
                        onClick={() => go(i)}
                        className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${
                          i === activeIndex ? "bg-surface-hover" : ""
                        }`}
                      >
                        <span className="flex shrink-0" style={{ color: CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? "var(--accent)" }}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {label}
                          {detail && <span className="ml-2 text-xs text-muted">{detail}</span>}
                        </span>
                        {i === activeIndex && (
                          <span className="flex items-center gap-2 text-sm text-muted">
                            Open
                            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-foreground/[0.05] text-foreground">
                              <EnterIcon className="h-3.5 w-3.5" />
                            </span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ));
          })()}
        </ul>
        {/* The keys, so they're discoverable. */}
        <div className="flex items-center gap-4 border-t border-foreground/10 px-4 py-2 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Key>↑</Key><Key>↓</Key> to move</span>
          <span className="flex items-center gap-1.5"><Key>Enter</Key> to open</span>
          <span className="flex items-center gap-1.5"><Key>Esc</Key> to close</span>
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-sm bg-foreground/[0.08] px-1.5 py-0.5 font-sans text-[11px] text-foreground">{children}</kbd>;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      setOpen(true);
    }
    // The sidebar's search box opens the same menu.
    const onOpenRequest = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  function close() {
    setOpen(false);
    // Covers every way the palette can close without a pick (Escape, clicking the backdrop) — a
    // pick already clears this itself (`applyPendingSplit`), so this is a no-op then; it only
    // matters for the "opened a pane's split picker, then backed out" case, so a *later*, ordinary
    // "/" search doesn't inherit a stale pane/direction from one that was abandoned.
    clearPendingSplit();
  }

  return open ? <Palette onClose={close} /> : null;
}
