"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CloseIcon, GearIcon, HelpIcon, HomeIcon, findToolLink } from "@/components/tools";
import { PaneContext, PaneTitleSlotContext } from "@/lib/paneContext";
import { PaneCrumbStoreContext, createCrumbStore, useCurrentCrumbs } from "@/lib/pageCrumbs";
import { CrumbTrail } from "@/components/PageBar";
import { IntroButton } from "@/components/help/ToolIntro";
import { TOOL_COMPONENTS } from "@/lib/toolRegistry";
import {
  type PaneSplit,
  type PaneTree,
  collectLeaves,
  createLeaf,
  removePane,
  resizeSplit,
  updateLeafHref,
} from "@/lib/tilingLayout";
import {
  syncAddressBar,
  updateTilingState,
  useTilingState,
} from "@/lib/useTilingLayout";


/** The name and icon shown in a pane's top bar: the tool's own (as in the sidebar), or the page's
    for the few non-tool pages a pane can show. */
const PANE_PAGES: Record<string, { label: string; icon: (props: { className?: string }) => React.JSX.Element }> = {
  "/dashboard": { label: "Dashboard", icon: HomeIcon },
  "/": { label: "Dashboard", icon: HomeIcon },
  "/account": { label: "Account", icon: GearIcon },
  "/help": { label: "Help", icon: HelpIcon },
};

function paneTitle(href: string) {
  const link = findToolLink(href);
  if (link) return { label: link.label, icon: link.icon };
  return PANE_PAGES[href] ?? null;
}

/** One pane: its own top bar (the page's name and the close button) over the tool, which is
    mounted via `TOOL_COMPONENTS`.

    A pane behaves like a phone or tablet screen of its own width (FB-22): it's a size container
    named `pane` (`@container/pane`) marked `data-pane`, and `app/globals.css` makes the `sm:`/`md:`
    variants follow the pane's width and `lg:` and up never apply inside one. Every page's
    phone/tablet layout is built to sit under the phone top bar (`Sidebar.tsx`: 3.5rem, see-through,
    the page scrolling under it; pages leave 4.5rem at the top and stick their own bars at 3.5rem),
    so the pane's bar is that bar's twin — same height, same look — and the page needs no changes.
    The bar holds the close button, so it can't land on top of the tool's own header buttons any
    more (it used to be absolutely positioned over the page's top-right corner), and it sits in the
    same place in every pane. The page's name is dimmed in the panes that aren't active.

    Container queries re-run whenever the pane's width changes (the window, the sidebar or the
    divider), so the layout follows a resize with no JavaScript. */
function Pane({
  href,
  active,
  canClose,
  onFocus,
  onClose,
}: {
  href: string;
  active: boolean;
  canClose: boolean;
  onFocus: () => void;
  onClose: () => void;
}) {
  const Component = TOOL_COMPONENTS[href];
  const title = paneTitle(href);
  const TitleIcon = title?.icon;
  // The pane's box, for phone-style sheets to portal into (`lib/paneContext.ts`).
  const [paneEl, setPaneEl] = useState<HTMLDivElement | null>(null);
  // Beside the page's name in the bar: where the page puts its intro "?" (`ToolLayout`).
  const [titleSlot, setTitleSlot] = useState<HTMLSpanElement | null>(null);
  // The page's own trail (`PageBar`, e.g. "Library / Tunes / Setlists"), shown in place of the
  // name once the page has set it.
  const [crumbStore] = useState(createCrumbStore);
  const page = useCurrentCrumbs(crumbStore);

  return (
    <div
      ref={setPaneEl}
      data-pane
      // The pane that gets keyboard shortcuts when nothing has focus (`keyIsForPane`).
      data-pane-active={active ? "" : undefined}
      onPointerDownCapture={onFocus}
      className="@container/pane relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      {/* Like `AppShell`'s page scroller (a flex column, so pages' `flex-1` fills it). The bar is
          sticky inside it with a negative margin, so the page starts under it and scrolls beneath
          it, as on a phone, while the scrollbar runs the full height beside it. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        <div className="sticky top-0 z-20 -mb-14 flex h-14 shrink-0 items-center gap-2 border-b border-foreground/10 bg-background/90 px-4 backdrop-blur sm:px-6">
          <div className={`flex min-w-0 flex-1 items-center gap-2 text-sm font-medium transition-colors ${active ? "text-foreground" : "text-muted"}`}>
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
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close this pane"
              title="Close this pane"
              className="-mr-2.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        {Component ? (
          <PaneContext.Provider value={paneEl}>
            <PaneTitleSlotContext.Provider value={titleSlot}>
              <PaneCrumbStoreContext.Provider value={crumbStore}>
                <Component />
              </PaneCrumbStoreContext.Provider>
            </PaneTitleSlotContext.Provider>
          </PaneContext.Provider>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4 pt-20 text-center text-sm text-muted">
            <p>This tool isn&apos;t available anymore.</p>
            <p className="text-xs">Close this pane, or right-click a page in the sidebar to open another.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** A resizable divider between two sibling panes — the exact same drag mechanics as
    `components/Sidebar.tsx`'s own resize handle (`setPointerCapture`, an absolute pointer-position
    -to-size mapping on every move rather than a drag-origin delta), just computing a percentage
    of the split container instead of an absolute pixel width. */
function SplitContainer({
  node,
  onResize,
  children,
}: {
  node: PaneSplit;
  onResize: (sizes: [number, number]) => void;
  children: [React.ReactNode, React.ReactNode];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const row = node.direction === "row";

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = row
      ? ((e.clientX - rect.left) / rect.width) * 100
      : ((e.clientY - rect.top) / rect.height) * 100;
    // Neither side below 20%, nor narrower than a small phone (a pane lays out like one) or
    // shorter than a usable strip, while there's room for that.
    const minPct = Math.min(50, Math.max(20, ((row ? 320 : 200) / (row ? rect.width : rect.height)) * 100));
    const clamped = Math.min(100 - minPct, Math.max(minPct, pct));
    onResize([clamped, 100 - clamped]);
  }

  return (
    // The panes shrink (by their share) to make room for the divider; held at full basis they
    // ran 8px past the window, cutting into the right pane's close button.
    <div
      ref={containerRef}
      className={`flex h-full w-full min-h-0 min-w-0 ${row ? "flex-row" : "flex-col"}`}
    >
      <div
        style={{ flexBasis: `${node.sizes[0]}%` }}
        className="h-full min-h-0 w-full min-w-0 shrink grow-0 overflow-hidden"
      >
        {children[0]}
      </div>
      <div
        role="separator"
        aria-orientation={row ? "vertical" : "horizontal"}
        aria-label={row ? "Resize panes horizontally" : "Resize panes vertically"}
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        className={`group z-10 flex shrink-0 touch-none items-center justify-center outline-none ${
          row ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"
        }`}
      >
        <div
          className={`transition-colors group-hover:bg-accent group-focus-visible:bg-accent ${
            dragging ? "bg-accent" : "bg-surface-hover"
          } ${row ? "h-full w-0.5" : "h-0.5 w-full"}`}
        />
      </div>
      <div
        style={{ flexBasis: `${node.sizes[1]}%` }}
        className="h-full min-h-0 w-full min-w-0 shrink grow-0 overflow-hidden"
      >
        {children[1]}
      </div>
    </div>
  );
}

function PaneNode({
  node,
  activeId,
  canClose,
  onFocus,
  onClose,
  onResize,
}: {
  node: PaneTree;
  activeId: string;
  /** Whether *any* pane can be closed right now — false when this is the only pane left, since
      closing it would have nothing to collapse into (`removePane` would just no-op anyway, but
      showing a close button that does nothing is its own small confusion worth avoiding). */
  canClose: boolean;
  onFocus: (id: string) => void;
  onClose: (targetId: string) => void;
  onResize: (splitId: string, sizes: [number, number]) => void;
}) {
  if (node.type === "leaf") {
    return (
      <Pane
        href={node.href}
        active={node.id === activeId}
        canClose={canClose}
        onFocus={() => onFocus(node.id)}
        onClose={() => onClose(node.id)}
      />
    );
  }
  return (
    <SplitContainer node={node} onResize={(sizes) => onResize(node.id, sizes)}>
      <PaneNode
        node={node.children[0]}
        activeId={activeId}
        canClose={canClose}
        onFocus={onFocus}
        onClose={onClose}
        onResize={onResize}
      />
      <PaneNode
        node={node.children[1]}
        activeId={activeId}
        canClose={canClose}
        onFocus={onFocus}
        onClose={onClose}
        onResize={onResize}
      />
    </SplitContainer>
  );
}

/**
 * "Advanced layouts" — an opt-in tiling window manager for the main content area. Off by default
 * (`lib/useTilingLayout.ts`'s `enabled`); `AppShell.tsx` only ever mounts this component once
 * that's true *and* the screen is desktop-sized (that check lives in `AppShell`, not here — see
 * its own comment for why). Every pane renders its tool directly from `TOOL_COMPONENTS`, bypassing
 * the Next.js router entirely for the panes that aren't "the one matching the current URL" —
 * there's no way to have Next's own router simultaneously render several different routes' pages
 * at once, so this keeps its own tree of live, lazily-imported tool components instead, and only
 * *reflects* the active pane's href into the real URL (via `router.replace`, never `push` — tiling
 * around shouldn't flood the back button with history entries) so a copied link still opens the
 * right tool for whoever you send it to. That link only ever restores a single tool, never the
 * whole tiled arrangement — the arrangement itself is this browser's own `localStorage`,
 * deliberately not something encoded in the URL.
 *
 * The sidebar (and the `/` command palette, which navigates through the same Next.js router) stay
 * in sync *both* ways: this component's own navigation calls move the URL to match whichever pane
 * is active, and clicking a sidebar nav link or picking a result from `/` search retargets the
 * *active* pane's tool instead of doing nothing visible (Next still resolves that route's real
 * page into `children`, which `AppShell` ignores the whole time tiling is on, so without this a
 * click just silently went nowhere from the user's point of view). The `pathname`-watching effect
 * below is what closes that loop: it compares the live URL against the active pane's own href on
 * every render, and only ever acts when they've drifted apart — which happens from an outside
 * navigation, never from this component's own `router.replace` calls (those always set the URL to
 * exactly what the pane's href already just became), so there's no feedback loop.
 *
 * An edge button doesn't open any UI of its own — `requestPaneSplit` just records which pane and
 * which direction (`lib/useTilingLayout.ts`'s `requestSplit`) and opens the *real* `/` command
 * palette on the pane's behalf; `CommandPalette.tsx`'s own `go()` checks for that pending request
 * and performs the split instead of its usual navigation when one exists.
 */
export default function TilingLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const state = useTilingState();
  // The last pathname this component actually reacted to — *not* just "whatever `active.href`
  // currently says," which is what the outside-navigation effect below used to compare against
  // directly. That compared-every-render approach is what caused a real bug, reported directly
  // ("if i have 2 windows open... go back to the metronome it will refresh the window and the
  // metronome will stop"): focusing a different pane used to call `router.replace()` purely to
  // keep the address bar in sync, and that alone — regardless of which pane or tool — was traced
  // to remounting whichever `TOOL_COMPONENTS` entry the navigation targeted (confirmed with
  // instance-id tracing: `Pane`/`AppShell` stayed perfectly stable while the tool component
  // underneath got a fresh instance, losing all its state, exactly when and only when
  // `router.replace`/`push` targeted that tool's own href). Focus/close/split now update the
  // address bar via `syncAddressBar` (raw History API, bypassing Next's router entirely — see its
  // own doc comment) instead, which never triggers that remount, but also never updates Next's own
  // `usePathname()` — so comparing `pathname` against the active pane's href on *every* render
  // (including ones only triggered by `activePaneId` changing from a focus click) would misfire,
  // treating our own now-stale `pathname` as a fake "outside navigation" and overwriting the pane
  // we just focused. Tracking the last `pathname` *value itself* this effect has seen fixes that:
  // it only reacts when Next's own router genuinely moved (a sidebar Link, `/` search, or
  // browser back/forward), which is the only case it needs to catch.
  const lastSeenPathnameRef = useRef(pathname);

  // Split screen with a single pane isn't split screen: go back to the plain page (also covers a
  // single-pane layout left over from the old "Advanced layouts" toggle).
  useEffect(() => {
    if (!state.tree) return;
    const leaves = collectLeaves(state.tree);
    if (leaves.length !== 1) return;
    updateTilingState({ enabled: false, tree: null, activePaneId: null });
    if (leaves[0].href !== window.location.pathname || leaves[0].href !== pathname) router.replace(leaves[0].href);
  }, [state.tree, pathname, router]);

  // Seed a single pane showing wherever you currently are — a fallback for the rare case this
  // mounts with no tree at all (normally `AdvancedLayoutsButton`'s own click handler already seeds
  // one at the exact moment "Advanced layouts" is turned on, using the page you were on then; this
  // only matters if that somehow didn't happen first).
  useEffect(() => {
    if (state.tree) return;
    const root = createLeaf(pathname);
    updateTilingState({ tree: root, activePaneId: root.id });
  }, [state.tree, pathname]);

  // An outside navigation (a sidebar Link, or picking a result in `/` search) changed the real URL
  // without going through any of this component's own handlers below — retarget the active pane's
  // tool to match, the same way clicking a nav link already does in the non-tiling page.
  useEffect(() => {
    if (pathname === lastSeenPathnameRef.current) return;
    lastSeenPathnameRef.current = pathname;
    if (!state.tree || !state.activePaneId) return;
    const active = collectLeaves(state.tree).find((l) => l.id === state.activePaneId);
    if (!active || active.href === pathname) return;
    updateTilingState({ tree: updateLeafHref(state.tree, state.activePaneId, pathname) });
  }, [pathname, state.tree, state.activePaneId]);

  if (!state.tree || !state.activePaneId) {
    // The brief instant before the seeding effect above runs — nothing meaningful to show yet.
    return null;
  }

  function focusPane(id: string) {
    if (id === state.activePaneId) return; // already active — nothing to do
    const leaf = collectLeaves(state.tree!).find((l) => l.id === id);
    updateTilingState({ activePaneId: id });
    if (leaf) syncAddressBar(leaf.href);
  }

  function closePane(targetId: string) {
    const next = removePane(state.tree!, targetId);
    if (!next) return; // the only pane left — nothing to collapse into
    const leaves = collectLeaves(next);
    // Down to one pane: split screen is over — back to the plain page.
    if (leaves.length === 1) {
      updateTilingState({ enabled: false, tree: null, activePaneId: null });
      router.replace(leaves[0].href);
      return;
    }
    const stillActive = leaves.some((l) => l.id === state.activePaneId);
    const nextActive = stillActive ? leaves.find((l) => l.id === state.activePaneId)! : leaves[0];
    updateTilingState({ tree: next, activePaneId: nextActive.id });
    syncAddressBar(nextActive.href);
  }

  function resizeSplitNode(splitId: string, sizes: [number, number]) {
    updateTilingState({ tree: resizeSplit(state.tree!, splitId, sizes) });
  }

  return (
    <PaneNode
      node={state.tree}
      activeId={state.activePaneId}
      canClose={collectLeaves(state.tree).length > 1}
      onFocus={focusPane}
      onClose={closePane}
      onResize={resizeSplitNode}
    />
  );
}
