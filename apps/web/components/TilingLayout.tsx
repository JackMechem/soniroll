"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Flyout, { FlyoutItem } from "@/components/Flyout";
import { OPEN_PALETTE_EVENT } from "@/components/CommandPalette";
import { CrumbTrail } from "@/components/PageBar";
import NextPaneContexts from "@/components/panes/NextPaneContexts";
import { IntroButton } from "@/components/help/ToolIntro";
import { NewTabIcon } from "@/components/tabs/tabParts";
import { newTab } from "@/lib/useTabs";
import {
  ChevronLeftIcon,
  CloseIcon,
  DotsVerticalIcon,
  ExternalLinkIcon,
  GearIcon,
  HelpIcon,
  HomeIcon,
  MaximizeIcon,
  MinimizeIcon,
  findToolLink,
} from "@/components/tools";
import { prefersReducedMotion } from "@/lib/logoAnimation";
import { PaneCrumbStoreContext, createCrumbStore, useCurrentCrumbs } from "@/lib/pageCrumbs";
import {
  type PaneNav,
  type PaneRouter,
  PaneContext,
  PaneIdContext,
  PaneNavContext,
  PaneTitleSlotContext,
  markPaneBack,
} from "@/lib/paneContext";
import { type DividerRect, type PaneLeaf, type PaneRect, allPanes, collectLeaves, layoutRects, parentSplit } from "@/lib/tilingLayout";
import { canShowInPane, renderPaneHref } from "@/lib/toolRegistry";
import { useNotesConfig } from "@/lib/useShedNotes";
import {
  SIDE_MAX_WIDTH,
  SIDE_MIN_WIDTH,
  closePane,
  closeSideFromHistory,
  dockFloat,
  flipPane,
  floatPane,
  focusPane,
  keepOnlyPane,
  navigateMain,
  navigatePane,
  paneBack,
  panesActive,
  paneCanGoBack,
  paneDetach,
  requestSplit,
  resizePanes,
  routeChanged,
  setFloatWidth,
  swapPane,
  takeFocusRequest,
  toggleMaximize,
  useTilingState,
} from "@/lib/useTilingLayout";

/** The pane bar's name and icon before the page has set its own trail. */
const PANE_PAGES: Record<string, { label: string; icon: (props: { className?: string }) => React.JSX.Element }> = {
  "/dashboard": { label: "Dashboard", icon: HomeIcon },
  "/account": { label: "Account", icon: GearIcon },
  "/help": { label: "Help", icon: HelpIcon },
};

function paneTitle(href: string) {
  const path = href.split(/[?#]/)[0];
  const link = findToolLink(path);
  if (link) return { label: link.label, icon: link.icon };
  return PANE_PAGES[path] ?? null;
}

const pathOf = (href: string) => href.split(/[?#]/)[0];

/** A pane's address as a page of its own (a note in the side view is Shed Notes with that note). */
function pageHrefOf(href: string) {
  const url = new URL(href, "http://x");
  if (url.pathname !== "/shed-notes" || url.searchParams.get("view") !== "note") return href;
  url.searchParams.delete("view");
  return `${url.pathname}${url.search}`;
}

/** `href` as an in-app address, resolved against the pane's own (a relative `?tab=x` stays in the
    pane's page); null for another site. */
function resolveHref(href: string, base: string): string | null {
  try {
    const url = new URL(href, window.location.origin + base);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

const desktopQuery = "(min-width: 1024px)";
function subscribeDesktop(cb: () => void) {
  const mql = window.matchMedia(desktopQuery);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
/** Read straight from the window (not after an effect, like `useIsDesktop`), so a side view that
    floats on a desktop never draws a frame as a phone's full-screen one. */
function useDesktopWindow() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => false);
}

/** What the real router rendered: the page (`children`) is shown in a pane only at this address. */
function RouteTracker() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  useEffect(() => {
    routeChanged(`${pathname}${search ? `?${search}` : ""}`);
  }, [pathname, search]);
  return null;
}

type Frame = {
  key: string;
  leaf: PaneLeaf | null;
  /** Shows the real page (`children`). */
  page: boolean;
  kind: "plain" | "tree" | "float";
};

/**
 * Split screen and the side view, one system (state and API: `lib/useTilingLayout.ts`).
 *
 * Mounted once by `AppShell` around the page, always — with nothing split it's just the page. Every
 * pane is a flat, keyed child of one box, placed from the layout tree with absolute positions, so
 * splitting, closing, swapping, flipping, floating or docking a pane moves boxes around without
 * remounting anything (a metronome keeps running; the page you were on stays as it was when the
 * first pane opens beside it — it's still Next's own `children`, in the "page" frame).
 *
 * Each pane is its own little browser: its address is `leaf.href`, and inside it `usePathname`,
 * `useSearchParams` and `useRouter` are the pane's (`NextPaneContexts`), links open in it (the
 * click listener below), and its Back goes through its own history. The address bar follows the
 * active pane (`syncAddressBar`, never Next's router). The sidebar, ⌘K and links outside the panes
 * open pages in the main pane (the tree pane last clicked).
 *
 * Phones have no split screen: the page shows as usual, and the side view covers it, full screen,
 * with Back (a real history entry, so the phone's Back gesture closes it).
 */
export default function TilingLayout({ children }: { children: React.ReactNode }) {
  const { layout, pageLeafId, routeHref } = useTilingState();
  const desktop = useDesktopWindow();
  const router = useRouter();
  const pathname = usePathname();
  const hostRef = useRef<HTMLDivElement>(null);
  const panes = allPanes(layout);
  const sideFloat = layout.float;

  // Links open in the pane they're in; outside the panes (sidebar, menus) in the main pane. One
  // listener on the document, in the capture phase, so it runs before Next's <Link> handler (which
  // then sees the click handled). Portaled menus aren't inside their pane's box, so the pane that
  // last got a pointer press inside it (through React's tree) is remembered for the click.
  const pressedPane = useRef<string | null>(null);
  const stateRef = useRef({ layout });
  useEffect(() => {
    stateRef.current = { layout };
  });
  useEffect(() => {
    const onPointerDown = () => {
      pressedPane.current = null; // a pane's own handler (after this one) sets it again
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const raw = a.getAttribute("href");
      if (!raw || raw.startsWith("#")) return;
      const { layout: l } = stateRef.current;
      const inPane = (a.closest("[data-pane-id]") as HTMLElement | null)?.dataset.paneId ?? pressedPane.current;
      const paneIds = new Set(allPanes(l).map((p) => p.id));
      const pane = inPane && paneIds.has(inPane) ? inPane : null;
      const inSide = pane !== null && pane === l.float?.leaf.id;
      // The side view's own links stay in it. Anything else only while the screen is split (on
      // a desktop), or shows a lone pane that isn't the real page (another tab's: `panesActive`);
      // otherwise a link is an ordinary page navigation (the side view stays open).
      if (!inSide && !panesActive()) return;
      const base = (pane && allPanes(l).find((p) => p.id === pane)?.href) || "/";
      const href = resolveHref(raw, base);
      if (!href) return;
      if (!canShowInPane(href)) {
        // A page a pane can't show: the window goes there, into this pane (`routeChanged`).
        if (pane) focusPane(pane);
        return;
      }
      e.preventDefault();
      if (pane) navigatePane(pane, href);
      else navigateMain(href);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  // Phones: the Back gesture leaves the side view's history entry.
  useEffect(() => {
    const onPop = () => closeSideFromHistory();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Escape: a full-screen pane goes back to its place; else the side view closes — when the key
  // comes from inside it (or from nowhere in particular), not from a menu, a dialog or a vim editor.
  const notesCfg = useNotesConfig();
  const vim = notesCfg.config.vimMode;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const l = stateRef.current.layout;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(".cm-editor") && vim) return;
      if (document.querySelector('[role="menu"], [role="dialog"]')) return;
      const inPane = (target?.closest("[data-pane-id]") as HTMLElement | null)?.dataset.paneId ?? null;
      const fromNowhere = !target || target === document.body;
      if (l.maximizedId && (fromNowhere || inPane === l.maximizedId)) {
        toggleMaximize(l.maximizedId);
        return;
      }
      if (l.sideId && (inPane === l.sideId || (fromNowhere && l.activePaneId === l.sideId))) closePane(l.sideId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vim]);

  // A pane just opened gets keyboard focus (Space, shortcuts), unless focus is already in it.
  useEffect(() => {
    const id = takeFocusRequest();
    if (!id) return;
    const el = hostRef.current?.querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(id)}"]`);
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  });

  // Which panes are drawn. The real page keeps the key "page" whatever pane it's in, so it never
  // remounts as panes open and close around it; the others by id, in a fixed order (moving a
  // box in the DOM can restart media in it).
  const frames: Frame[] = [];
  const pageIsShown = (leaf: PaneLeaf) => leaf.id === pageLeafId && leaf.href === routeHref;
  if (!layout.tree) {
    frames.push({ key: "page", leaf: null, page: true, kind: "plain" });
  } else if (!desktop) {
    // Phones: the page as usual, and the side view over it.
    frames.push({ key: "page", leaf: null, page: true, kind: "plain" });
    if (sideFloat) frames.push({ key: sideFloat.leaf.id, leaf: sideFloat.leaf, page: false, kind: "float" });
  } else {
    const shown = panes.map((leaf) => ({ leaf, page: pageIsShown(leaf), kind: (leaf.id === sideFloat?.leaf.id ? "float" : "tree") as Frame["kind"] }));
    const pageFrame = shown.find((f) => f.leaf.id === pageLeafId);
    if (pageFrame) frames.push({ key: "page", ...pageFrame });
    for (const f of shown.filter((f) => f !== pageFrame).sort((a, b) => (a.leaf.id < b.leaf.id ? -1 : 1))) frames.push({ key: f.leaf.id, ...f });
  }

  const leafCount = collectLeaves(layout.tree).length;
  // Split: the tree's panes get bars. One tree pane (with the side view over it) is just the page.
  const split = desktop && leafCount > 1;
  const rects = layout.tree && split ? layoutRects(layout.tree) : null;

  return (
    <div ref={hostRef} data-pane-host className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Suspense fallback={null}>
        <RouteTracker />
      </Suspense>
      {frames.map((f) => (
        <PaneFrame
          key={f.key}
          leaf={f.leaf}
          kind={f.kind}
          chrome={f.leaf !== null && (f.kind === "float" || (f.kind === "tree" && split))}
          desktop={desktop}
          rect={f.leaf && f.kind === "tree" ? rects?.panes.get(f.leaf.id) ?? null : null}
          floatWidth={f.kind === "float" ? sideFloat?.width ?? 560 : null}
          maximized={f.leaf !== null && layout.maximizedId === f.leaf.id}
          active={f.leaf !== null && layout.activePaneId === f.leaf.id}
          isSide={f.leaf !== null && layout.sideId === f.leaf.id}
          inSplit={f.leaf !== null && f.kind === "tree" && leafCount > 1}
          splitDirection={f.leaf ? parentSplit(layout.tree, f.leaf.id)?.direction ?? null : null}
          canFloat={f.kind === "tree" && leafCount > 1}
          routeKey={f.kind === "plain" || (f.kind === "tree" && !split) ? pathname : null}
          realRouter={router}
          onPressed={(id) => (pressedPane.current = id)}
        >
          {f.page ? children : null}
        </PaneFrame>
      ))}
      {rects?.dividers.map((d) => <Divider key={d.split.id} divider={d} hostRef={hostRef} hidden={layout.maximizedId !== null} />)}
    </div>
  );
}

const GUTTER = 8;

function rectStyle(r: PaneRect): React.CSSProperties {
  const half = GUTTER / 2;
  const l = r.edges.l ? half : 0;
  const t = r.edges.t ? half : 0;
  const rr = r.edges.r ? half : 0;
  const b = r.edges.b ? half : 0;
  return {
    left: `calc(${r.x * 100}% + ${l}px)`,
    top: `calc(${r.y * 100}% + ${t}px)`,
    width: `calc(${r.w * 100}% - ${l + rr}px)`,
    height: `calc(${r.h * 100}% - ${t + b}px)`,
  };
}

/** One pane: a bar (Back, the page's trail, its controls) over the page, which scrolls under the
    bar like a phone screen under its top bar. A pane is a size container (`@container/pane`,
    `data-pane`): `sm:`/`md:` follow its width and `lg:`+ is off inside it (`app/globals.css`), so
    every page's phone/tablet layout fits it unchanged. Without `chrome` (nothing split; or a single
    pane left) it's just the page, laid out as a normal page. */
function PaneFrame({
  leaf,
  kind,
  chrome,
  desktop,
  rect,
  floatWidth,
  maximized,
  active,
  isSide,
  inSplit,
  splitDirection,
  canFloat,
  routeKey,
  realRouter,
  onPressed,
  children,
}: {
  leaf: PaneLeaf | null;
  kind: Frame["kind"];
  chrome: boolean;
  desktop: boolean;
  rect: PaneRect | null;
  floatWidth: number | null;
  maximized: boolean;
  active: boolean;
  isSide: boolean;
  inSplit: boolean;
  splitDirection: "row" | "col" | null;
  canFloat: boolean;
  routeKey: string | null;
  realRouter: ReturnType<typeof useRouter>;
  onPressed: (id: string) => void;
  children: React.ReactNode;
}) {
  const id = leaf?.id ?? null;
  const href = leaf?.href ?? null;
  const [paneEl, setPaneEl] = useState<HTMLDivElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLSpanElement | null>(null);
  const [crumbStore] = useState(createCrumbStore);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The pane's own router: links and `router.push` change what this pane shows.
  const realRouterRef = useRef(realRouter);
  const hrefRef = useRef(href);
  useEffect(() => {
    realRouterRef.current = realRouter;
    hrefRef.current = href;
  });
  const paneRouter = useMemo<PaneRouter | null>(() => {
    if (!id) return null;
    const go = (to: string, replace: boolean) => {
      const resolved = resolveHref(to, hrefRef.current ?? "/");
      if (!resolved) {
        window.location.assign(to);
        return;
      }
      if (navigatePane(id, resolved, { replace })) return;
      // A page a pane can't show: the window goes there, in this pane (`routeChanged`).
      focusPane(id);
      if (replace) realRouterRef.current.replace(resolved);
      else realRouterRef.current.push(resolved);
    };
    const back = () => paneBack(id);
    markPaneBack(back, () => paneCanGoBack(id));
    return { push: (to) => go(to, false), replace: (to) => go(to, true), back, forward: () => {} };
  }, [id]);

  // Inside a pane (`chrome`, or a lone pane left after closing the others): the pane's own address.
  const nav = useMemo<PaneNav | null>(() => {
    if (!href) return null;
    const [path, search = ""] = href.split("#")[0].split("?");
    return { pathname: path, search, router: chrome ? paneRouter : null };
  }, [href, chrome, paneRouter]);

  // The page in it: the real page (`children`), or the pane's from `PANE_ROUTES`. Made once per
  // address, so resizing or another pane changing doesn't re-render it.
  const content = useMemo(() => {
    if (children) return children;
    if (!href) return null;
    return renderPaneHref(href) ?? <Unavailable href={href} id={id} />;
  }, [children, href, id]);

  // A new page in the pane starts at its top.
  const path = href ? pathOf(href) : null;
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [path]);

  // The plain page slides in on every route change (the page transition).
  const first = useRef(true);
  useLayoutEffect(() => {
    if (routeKey === null) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const page = scrollRef.current;
    if (!page || prefersReducedMotion()) return;
    page.scrollTop = 0;
    const slide = page.animate([{ opacity: 0, transform: "translateX(36px) scale(0.985)" }, { opacity: 1, transform: "none" }], {
      duration: 480,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
    return () => slide.cancel();
  }, [routeKey]);

  const isFloat = kind === "float";
  const phoneSide = isFloat && !desktop;
  let box: string;
  let style: React.CSSProperties | undefined;
  if (!chrome) {
    box = "relative flex min-h-0 min-w-0 flex-1 flex-col";
  } else if (phoneSide) {
    box = "fixed inset-0 z-[65] flex flex-col bg-background pt-[env(safe-area-inset-top)]";
  } else if (maximized) {
    box = "absolute inset-0 z-[35] flex flex-col bg-background";
  } else if (isFloat) {
    box = "absolute inset-y-0 right-0 z-30 flex flex-col bg-background shadow-2xl shadow-black/25 ring-1 ring-foreground/10";
    style = { width: `min(${floatWidth ?? 560}px, calc(100% - 3rem))` };
  } else {
    box = "absolute flex flex-col";
    style = rect ? rectStyle(rect) : { inset: 0 };
  }

  return (
    <div
      ref={setPaneEl}
      data-pane={chrome ? "" : undefined}
      data-pane-id={chrome && id ? id : undefined}
      data-pane-active={chrome && active ? "" : undefined}
      aria-label={chrome ? (isSide ? "Side view" : "Pane") : undefined}
      role={chrome ? "region" : undefined}
      tabIndex={chrome ? -1 : undefined}
      onPointerDownCapture={
        id
          ? () => {
              onPressed(id);
              if (chrome) focusPane(id);
            }
          : undefined
      }
      onFocusCapture={chrome && id && !active ? () => focusPane(id) : undefined}
      style={style}
      className={`${chrome ? "@container/pane overflow-hidden outline-none" : ""} ${box}`}
    >
      {isFloat && desktop && !maximized && <FloatResizer width={floatWidth ?? 560} />}
      <div
        ref={scrollRef}
        data-page-scroll={chrome ? undefined : ""}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background"
      >
        {chrome && leaf ? (
          <PaneBar
            leaf={leaf}
            paneEl={paneEl}
            crumbStore={crumbStore}
            setTitleSlot={setTitleSlot}
            desktop={desktop}
            active={active}
            isFloat={isFloat}
            isSide={isSide}
            maximized={maximized}
            inSplit={inSplit}
            splitDirection={splitDirection}
            canFloat={canFloat}
          />
        ) : null}
        <PaneIdContext.Provider value={chrome ? id : null}>
          <PaneContext.Provider value={chrome ? paneEl : null}>
            <PaneTitleSlotContext.Provider value={chrome ? titleSlot : null}>
              <PaneCrumbStoreContext.Provider value={chrome ? crumbStore : null}>
                <PaneNavContext.Provider value={nav}>
                  <NextPaneContexts nav={nav}>
                    <Fragment key={children ? "page" : path}>{content}</Fragment>
                  </NextPaneContexts>
                </PaneNavContext.Provider>
              </PaneCrumbStoreContext.Provider>
            </PaneTitleSlotContext.Provider>
          </PaneContext.Provider>
        </PaneIdContext.Provider>
      </div>
    </div>
  );
}

const iconButton =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground";

/** A pane's bar, the phone top bar's twin (3.5rem, see-through, the page scrolling under it):
    Back (inside the pane), the page's trail, its "?", then full screen, ⋮ and ×. On a phone the
    side view's bar is Back, the trail and ⋮ — Back is the one way out. */
function PaneBar({
  leaf,
  paneEl,
  crumbStore,
  setTitleSlot,
  desktop,
  active,
  isFloat,
  isSide,
  maximized,
  inSplit,
  splitDirection,
  canFloat,
}: {
  leaf: PaneLeaf;
  paneEl: HTMLDivElement | null;
  crumbStore: ReturnType<typeof createCrumbStore>;
  setTitleSlot: (el: HTMLSpanElement | null) => void;
  desktop: boolean;
  active: boolean;
  isFloat: boolean;
  isSide: boolean;
  maximized: boolean;
  inSplit: boolean;
  splitDirection: "row" | "col" | null;
  canFloat: boolean;
}) {
  const page = useCurrentCrumbs(crumbStore);
  const title = paneTitle(leaf.href);
  const TitleIcon = title?.icon;
  const atTopLeft = useAtTopLeft(paneEl);
  const canBack = (leaf.back?.length ?? 0) > 0;
  const showBack = canBack || !desktop;
  const detach = paneDetach(leaf.id);
  const url = new URL(leaf.href, "http://x");
  const noteView = url.pathname === "/shed-notes" && url.searchParams.get("view") === "note";

  const split = (edge: "right" | "down") => {
    requestSplit(leaf.id, edge);
    window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
  };
  const openAsPage = () => {
    if (noteView) {
      url.searchParams.delete("view");
      navigatePane(leaf.id, `${url.pathname}?${url.searchParams}`, { replace: true });
    }
    keepOnlyPane(leaf.id);
  };

  return (
    <div
      className={`sticky top-0 z-20 -mb-14 flex h-14 shrink-0 items-center gap-1.5 border-b border-foreground/10 bg-background/90 px-3 backdrop-blur sm:px-4 ${
        atTopLeft && !maximized ? "pl-[calc(0.75rem+var(--sidebar-toggle-room,0px))] sm:pl-[calc(1rem+var(--sidebar-toggle-room,0px))]" : ""
      }`}
    >
      {showBack && (
        <button
          type="button"
          onClick={() => paneBack(leaf.id)}
          title={canBack ? "Back" : "Back to the page"}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-foreground/[0.05] pl-1.5 pr-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Back
        </button>
      )}
      <div className={`ml-1 flex min-w-0 flex-1 items-center gap-2 text-sm font-medium transition-colors ${active || !desktop ? "text-foreground" : "text-muted"}`}>
        {page && page.crumbs.length > 0 ? (
          <CrumbTrail crumbs={page.crumbs} icon={page.icon} variant="compact" />
        ) : (
          <>
            {TitleIcon && <TitleIcon className="h-4 w-4 shrink-0 text-muted" />}
            <span className="truncate">{title?.label ?? ""}</span>
          </>
        )}
        {page?.intro && <IntroButton onClick={page.intro.show} label={page.intro.label} />}
        <span ref={setTitleSlot} className="flex shrink-0 items-center empty:hidden" />
      </div>
      {desktop && (
        <button type="button" onClick={() => toggleMaximize(leaf.id)} aria-label={maximized ? "Exit full screen" : "Full screen"} title={maximized ? "Exit full screen (Esc)" : "Full screen"} className={iconButton}>
          {maximized ? <MinimizeIcon className="h-4 w-4" /> : <MaximizeIcon className="h-4 w-4" />}
        </button>
      )}
      <Flyout icon={DotsVerticalIcon} label="Pane options" align="end">
        {(closeMenu) => {
          const run = (fn: () => void) => () => {
            closeMenu();
            fn();
          };
          return (
            <>
              {desktop && inSplit && splitDirection && (
                <>
                  <FlyoutItem icon={SideBySideIcon} label="Side by side" checked={splitDirection === "row"} onSelect={run(() => splitDirection !== "row" && flipPane(leaf.id))} />
                  <FlyoutItem icon={StackedIcon} label="Above and below" checked={splitDirection === "col"} onSelect={run(() => splitDirection !== "col" && flipPane(leaf.id))} />
                  <FlyoutItem icon={SwapIcon} label="Swap places" onSelect={run(() => swapPane(leaf.id))} />
                </>
              )}
              {/* The side view: over the page or beside it. Any other pane can become it. */}
              {desktop && (isFloat || isSide) && (
                <>
                  <FlyoutItem icon={OverlayIcon} label="Over the page" checked={isFloat} onSelect={run(() => !isFloat && floatPane(leaf.id))} />
                  <FlyoutItem icon={PushIcon} label="Beside the page" checked={!isFloat} onSelect={run(() => isFloat && dockFloat())} />
                </>
              )}
              {desktop && !isFloat && !isSide && canFloat && <FlyoutItem icon={OverlayIcon} label="Float over the page" onSelect={run(() => floatPane(leaf.id))} />}
              {desktop && !isFloat && (
                <>
                  <FlyoutItem icon={SideBySideIcon} label="Open another beside it…" onSelect={run(() => split("right"))} />
                  <FlyoutItem icon={StackedIcon} label="Open another below it…" onSelect={run(() => split("down"))} />
                </>
              )}
              <FlyoutItem icon={ExternalLinkIcon} label={noteView ? "Open in Shed Notes" : "Open as a page"} onSelect={run(openAsPage)} />
              {desktop && <FlyoutItem icon={NewTabIcon} label="Open in a new tab" onSelect={run(() => newTab(pageHrefOf(leaf.href), { after: true }))} />}
              {detach && (
                <FlyoutItem
                  icon={CloseIcon}
                  label={detach.label}
                  onSelect={run(() => {
                    detach.run();
                    closePane(leaf.id);
                  })}
                />
              )}
            </>
          );
        }}
      </Flyout>
      {desktop && (
        <button type="button" onClick={() => closePane(leaf.id)} aria-label="Close this pane" title={isSide ? "Close (Esc)" : "Close this pane"} className={`${iconButton} -mr-1 hover:text-danger`}>
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** The divider between two panes: drag to resize (each side keeps at least a small phone's width
    while there's room), double-click for half and half, arrow keys when focused. */
function Divider({ divider, hostRef, hidden }: { divider: DividerRect; hostRef: React.RefObject<HTMLDivElement | null>; hidden: boolean }) {
  const { split } = divider;
  const row = split.direction === "row";
  const [dragging, setDragging] = useState(false);
  const f = split.sizes[0] / 100;
  const style: React.CSSProperties = row
    ? { left: `calc(${(divider.x + divider.w * f) * 100}% - ${GUTTER / 2}px)`, top: `${divider.y * 100}%`, width: GUTTER, height: `${divider.h * 100}%` }
    : { top: `calc(${(divider.y + divider.h * f) * 100}% - ${GUTTER / 2}px)`, left: `${divider.x * 100}%`, height: GUTTER, width: `${divider.w * 100}%` };

  const splitBox = useCallback(() => {
    const host = hostRef.current?.getBoundingClientRect();
    if (!host) return null;
    return { left: host.left + divider.x * host.width, top: host.top + divider.y * host.height, width: divider.w * host.width, height: divider.h * host.height };
  }, [hostRef, divider.x, divider.y, divider.w, divider.h]);

  function setPct(pct: number) {
    const box = splitBox();
    if (!box) return;
    const total = row ? box.width : box.height;
    const minPct = Math.min(50, Math.max(15, ((row ? 320 : 200) / total) * 100));
    const clamped = Math.round(Math.min(100 - minPct, Math.max(minPct, pct)) * 10) / 10;
    resizePanes(split.id, [clamped, 100 - clamped]);
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const box = splitBox();
    if (!box) return;
    setPct(row ? ((e.clientX - box.left) / box.width) * 100 : ((e.clientY - box.top) / box.height) * 100);
  }

  return (
    <div
      role="separator"
      aria-orientation={row ? "vertical" : "horizontal"}
      aria-label={row ? "Resize the panes side to side" : "Resize the panes up and down"}
      aria-valuenow={Math.round(split.sizes[0])}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      title="Drag to resize · double-click for half and half"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={onMove}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => resizePanes(split.id, [50, 50])}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 2;
        if ((row && e.key === "ArrowLeft") || (!row && e.key === "ArrowUp")) setPct(split.sizes[0] - step);
        else if ((row && e.key === "ArrowRight") || (!row && e.key === "ArrowDown")) setPct(split.sizes[0] + step);
        else return;
        e.preventDefault();
      }}
      style={style}
      className={`group absolute z-[25] flex touch-none items-center justify-center outline-none ${row ? "cursor-col-resize" : "cursor-row-resize"} ${hidden ? "hidden" : ""}`}
    >
      <div className={`rounded-full transition-colors group-hover:bg-accent group-focus-visible:bg-accent ${dragging ? "bg-accent" : "bg-foreground/10"} ${row ? "h-full w-0.5" : "h-0.5 w-full"}`} />
    </div>
  );
}

/** The side view's left edge, when it floats over the page: drag to make it wider or narrower. */
function FloatResizer({ width }: { width: number }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the side view"
      aria-valuemin={SIDE_MIN_WIDTH}
      aria-valuemax={SIDE_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const host = e.currentTarget.closest("[data-pane-host]")?.getBoundingClientRect();
        if (host) setFloatWidth(host.right - e.clientX);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setFloatWidth(width + 24);
        else if (e.key === "ArrowRight") setFloatWidth(width - 24);
        else return;
        e.preventDefault();
      }}
      className="group absolute -left-2 top-0 z-30 flex h-full w-4 cursor-col-resize touch-none items-center justify-center outline-none"
    >
      <div className={`h-10 w-1 rounded-full transition-colors ${dragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/60 group-focus-visible:bg-accent"}`} />
    </div>
  );
}

/** A saved pane whose page can't be shown in a pane (it was the real page when it was saved). */
function Unavailable({ href, id }: { href: string; id: string | null }) {
  const router = useRouter();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 pt-20 text-center text-sm text-muted">
      <p>This page can&apos;t be shown in split screen.</p>
      <button
        type="button"
        onClick={() => {
          if (id) focusPane(id);
          router.push(href);
        }}
        className="flex h-9 items-center rounded-md bg-foreground/[0.05] px-3 font-medium text-foreground transition-colors hover:bg-surface-hover"
      >
        Open it here
      </button>
    </div>
  );
}

/** Whether a pane sits in the window's top-left corner (where the hidden sidebar's menu button is). */
function useAtTopLeft(el: HTMLElement | null) {
  const [at, setAt] = useState(false);
  useEffect(() => {
    if (!el) return;
    const check = () => {
      const r = el.getBoundingClientRect();
      setAt(r.left < 8 && r.top < 8);
    };
    const observer = new ResizeObserver(check);
    observer.observe(el);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [el]);
  return at;
}

function svg(className?: string) {
  return { viewBox: "0 0 24 24", className, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
}

/** Two panes side by side. */
function SideBySideIcon({ className }: { className?: string }) {
  return (
    <svg {...svg(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </svg>
  );
}

/** Two panes, one above the other. */
function StackedIcon({ className }: { className?: string }) {
  return (
    <svg {...svg(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 12h18" />
    </svg>
  );
}

/** Two arrows passing each other: swap places. */
function SwapIcon({ className }: { className?: string }) {
  return (
    <svg {...svg(className)}>
      <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
    </svg>
  );
}

/** Two panels side by side: the page and the view pushed beside it. */
function PushIcon({ className }: { className?: string }) {
  return (
    <svg {...svg(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M14 4v16" />
    </svg>
  );
}

/** A panel floating over the page. */
function OverlayIcon({ className }: { className?: string }) {
  return (
    <svg {...svg(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <rect x="12" y="7" width="7" height="10" rx="1" />
    </svg>
  );
}
