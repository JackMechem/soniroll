"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { svgProps } from "@/components/tools";
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** One pane: the actual tool (mounted via `TOOL_COMPONENTS`), a small split button centered on
    each of its four edges (hover-revealed — `opacity-0 group-hover:opacity-100`, the same
    reveal-on-hover convention `Sidebar.tsx`'s own favorite star already uses — so they don't
    clutter the tool's own UI the rest of the time), and an always-visible close button in the
    corner once there's more than one pane to collapse back into. Clicking an edge button doesn't
    open any UI of its own — per a direct follow-up request, it opens the exact same `/` command
    palette every other search in this app uses (`onRequestSplit`, implemented by `TilingLayout`
    below), rather than a bespoke mini-popover.

    There used to be an "active pane" accent ring here too, gated to only show once there's more
    than one pane — but even gated correctly, it kept being reported as an unwanted border (most
    recently specifically on Community/Account while genuinely tiled with a sibling, where it *was*
    behaving as designed), so it's been removed outright rather than re-tuned a third time; the
    sidebar already reflects which pane is active (`Sidebar.tsx`'s `NavItems`), so this wasn't the
    only way to tell. */
function Pane({
  href,
  canClose,
  onFocus,
  onClose,
}: {
  href: string;
  canClose: boolean;
  onFocus: () => void;
  onClose: () => void;
}) {
  const Component = TOOL_COMPONENTS[href];

  return (
    <div
      onPointerDownCapture={onFocus}
      className="group relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      {canClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close this pane"
          title="Close this pane"
          // `right-3 top-3` rather than the tighter `right-2 top-2` every other corner button in
          // this app uses — a pane tiled at the *right* edge of the whole tiling area has this
          // button sitting right where `AppShell`'s own `lg:rounded-xl` outer corner curves
          // inward, which at the tighter inset read as badly/awkwardly positioned (reported
          // directly, with a screenshot). The extra inset clears that corner; it's a no-op for
          // every other pane position, which has plenty of room either way.
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-md bg-surface/90 text-muted hover:bg-surface-hover hover:text-danger"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {Component ? (
          <Component />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center text-sm text-muted">
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
    const clamped = Math.min(80, Math.max(20, pct));
    onResize([clamped, 100 - clamped]);
  }

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full min-h-0 min-w-0 ${row ? "flex-row" : "flex-col"}`}
    >
      <div
        style={{ flexBasis: `${node.sizes[0]}%` }}
        className="h-full min-h-0 w-full min-w-0 shrink-0 grow-0 overflow-hidden"
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
        className="h-full min-h-0 w-full min-w-0 shrink-0 grow-0 overflow-hidden"
      >
        {children[1]}
      </div>
    </div>
  );
}

function PaneNode({
  node,
  canClose,
  onFocus,
  onClose,
  onResize,
}: {
  node: PaneTree;
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
        canClose={canClose}
        onFocus={onFocus}
        onClose={onClose}
        onResize={onResize}
      />
      <PaneNode
        node={node.children[1]}
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
      canClose={collectLeaves(state.tree).length > 1}
      onFocus={focusPane}
      onClose={closePane}
      onResize={resizeSplitNode}
    />
  );
}
