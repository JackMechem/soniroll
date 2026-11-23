"use client";

import { useSyncExternalStore } from "react";
import {
  BACK_LIMIT,
  EMPTY_LAYOUT,
  type Layout,
  type PaneEdge,
  type PaneLeaf,
  allPanes,
  collectLeaves,
  createLeaf,
  findPane,
  flipSplit,
  insertAtEdge,
  insertBeside,
  parentSplit,
  readLayout,
  removePane,
  resizeSplit,
  swapSplit,
  updateLeaf,
} from "@/lib/tilingLayout";
import { canShowInPane, normalizePaneHref } from "@/lib/toolRegistry";

/**
 * Split screen and the side view: one system (`components/TilingLayout.tsx` draws it). Everything
 * on screen is one `Layout` (`lib/tilingLayout.ts`), saved on this device under
 * `jam-practice-tiling` (a device preference like the sidebar's width, not account data).
 *
 * Opening something beside the page always goes through `openBeside(href, { mode })`:
 * - `mode: "side"` (the default) opens it in the side view — over the page or beside it (this
 *   device's choice, `jam-practice-note-peek`), full screen on phones with a Back that's a real
 *   history entry. Opened from inside the side view (`from` = its pane id) it goes there with Back.
 * - `mode: "right" | "down" | "left" | "up"` splits the pane it's opened from (or the main one).
 * Phones have no split screen: every mode opens the side view there.
 *
 * Panes are rendered flat (one keyed element per pane, positioned from the tree), so splitting,
 * closing, swapping, flipping or floating a pane never remounts another one — a running metronome
 * keeps going. The pane showing the real page (Next's own `children`) is `pageLeafId`.
 */

const STORAGE_KEY = "jam-practice-tiling";
const SIDE_PREFS_KEY = "jam-practice-note-peek";

export type PendingSplit = { paneId: string; edge: PaneEdge } | null;

/** Taking a note off what it was opened from (an attached note), shown in the pane's ⋮ menu. */
export type PaneDetach = { label: string; run: () => void };

export type TilingState = {
  layout: Layout;
  /** An edge request waiting for the ⌘K palette's pick (`requestSplit`). Not saved. */
  pendingSplit: PendingSplit;
  /** The pane showing the real page (Next's `children`) while its address is the real route's.
      Not saved: worked out again from the address on load. */
  pageLeafId: string | null;
  /** The address the real router last rendered (`children`). */
  routeHref: string;
};

export type SideMode = "overlay" | "push";
type SidePrefs = { mode: SideMode; width: number };

export const SIDE_MIN_WIDTH = 360;
export const SIDE_MAX_WIDTH = 900;
const DEFAULT_SIDE_PREFS: SidePrefs = { mode: "overlay", width: 560 };
export const clampSideWidth = (w: number) => Math.round(Math.min(SIDE_MAX_WIDTH, Math.max(SIDE_MIN_WIDTH, w)));

const SERVER_STATE: TilingState = { layout: EMPTY_LAYOUT, pendingSplit: null, pageLeafId: null, routeHref: "/" };

let state: TilingState | null = null;
/** A pane just opened, for `TilingLayout` to move keyboard focus into. */
let focusRequest: string | null = null;
let sidePrefs: SidePrefs | null = null;
const detachers = new Map<string, PaneDetach>();
const listeners = new Set<() => void>();

const isDesktopWindow = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
const locationHref = () => (typeof window === "undefined" ? "/" : window.location.pathname + window.location.search);

function read(): TilingState {
  if (state) return state;
  let layout = EMPTY_LAYOUT;
  try {
    layout = readLayout(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"), normalizePaneHref);
  } catch {
    // unreadable storage: the plain page
  }
  // A phone opens the side view as a page of its own (with a history entry); one left open isn't
  // brought back on a phone.
  if (layout.float && !isDesktopWindow()) layout = withoutFloat(layout);
  const here = locationHref();
  const placed = placeAddress(layout, here);
  state = { layout: placed.layout, pendingSplit: null, pageLeafId: placed.pageLeafId, routeHref: here };
  state = { ...state, layout: normalize(state.layout, state) };
  return state;
}

/** The window's address (`here`, what the real router renders) in `layout`: the pane already
    showing it is the real page; if none does (typed, or a link from elsewhere) it goes in the main
    pane, as the real page — the address is what was asked for. */
function placeAddress(layout: Layout, here: string): { layout: Layout; pageLeafId: string | null } {
  const panes = allPanes(layout);
  const active = panes.find((l) => l.id === layout.activePaneId);
  let page = active?.href === here ? active : panes.find((l) => l.href === here);
  if (!page && layout.tree) {
    const leaves = collectLeaves(layout.tree);
    const target = leaves.find((l) => l.id === layout.activePaneId) ?? leaves.find((l) => l.id === layout.mainPaneId) ?? leaves[0];
    page = { ...target, href: here, back: [...(target.back ?? []), target.href].slice(-BACK_LIMIT) };
    const moved = page;
    layout = { ...layout, tree: updateLeaf(layout.tree, target.id, () => moved), activePaneId: target.id, mainPaneId: target.id };
  }
  return { layout, pageLeafId: page?.id ?? null };
}

function withoutFloat(layout: Layout): Layout {
  if (!layout.float) return layout;
  const id = layout.float.leaf.id;
  return { ...layout, float: null, sideId: layout.sideId === id ? null : layout.sideId, maximizedId: layout.maximizedId === id ? null : layout.maximizedId };
}

/** Keeps the layout consistent: ids that point at panes, the float only beside a tree, the plain
    page once only the real page is left. */
function normalize(layout: Layout, s: Pick<TilingState, "pageLeafId" | "routeHref">): Layout {
  let l = layout;
  if (!l.tree && l.float) l = { ...l, tree: l.float.leaf, float: null };
  if (!l.tree) return EMPTY_LAYOUT;
  const leaves = collectLeaves(l.tree);
  const panes = allPanes(l);
  const ids = new Set(panes.map((p) => p.id));
  const keep = (id: string | null) => (id && ids.has(id) ? id : null);
  const mainPaneId = l.mainPaneId && leaves.some((x) => x.id === l.mainPaneId) ? l.mainPaneId : leaves[0].id;
  l = {
    ...l,
    sideId: keep(l.sideId),
    activePaneId: keep(l.activePaneId) ?? mainPaneId,
    mainPaneId,
    maximizedId: panes.length > 1 ? keep(l.maximizedId) : null,
  };
  // Only the real page left, at the real page's address: that's just the page again.
  if (panes.length === 1 && panes[0].id === s.pageLeafId && panes[0].href === s.routeHref) return EMPTY_LAYOUT;
  return l;
}

function save(layout: Layout) {
  try {
    if (layout.tree) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable
  }
}

function set(patch: Partial<TilingState>, opts: { sync?: boolean } = {}) {
  const prev = read();
  const next: TilingState = { ...prev, ...patch };
  next.layout = normalize(next.layout, next);
  if (!next.layout.tree) next.pageLeafId = null;
  for (const id of detachers.keys()) if (!findPane(next.layout, id)) detachers.delete(id);
  state = next;
  if (next.layout !== prev.layout) save(next.layout);
  if (opts.sync !== false) {
    // The active pane's address; on a phone only the side view's or the page's (no split screen there).
    const active = findPane(next.layout, next.layout.activePaneId);
    const shown = isDesktopWindow() || active?.id === next.layout.float?.leaf.id ? active : undefined;
    if (shown) syncAddressBar(shown.href);
    else if (prev.layout.tree) syncAddressBar(next.routeHref);
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every change to the layout or the real route (tabs keep the active tab's copy current). */
export const subscribeTiling = subscribe;

export function useTilingState(): TilingState {
  return useSyncExternalStore(subscribe, read, () => SERVER_STATE);
}

export function getTilingState(): TilingState {
  return read();
}

/** How many panes are on screen (the tree's and the float). */
export function paneCount(layout: Layout = read().layout): number {
  return allPanes(layout).length;
}

/** The screen is split (two or more tiled panes, on a desktop-sized window): links and the sidebar
    open pages in panes. With only the side view over the page, the page navigates as usual. Also
    true for a lone pane that isn't the real page (another tab's page, or what's left after
    closing the others): Next's router is still on the page from before, so a link to that page
    wouldn't change anything — the pane follows links instead. */
export function panesActive(): boolean {
  if (!isDesktopWindow()) return false;
  const s = read();
  const leaves = collectLeaves(s.layout.tree);
  if (leaves.length > 1) return true;
  return leaves.length === 1 && !(leaves[0].id === s.pageLeafId && leaves[0].href === s.routeHref);
}

/** The address bar follows the active pane, through the History API rather than Next's router:
    a router navigation re-renders the real route and once remounted the pane showing it (a
    running metronome stopped). Marked `__pane` so the desktop app's router doesn't treat it as a
    navigation either; Next keeps its own state (`__NA`) and ignores it. */
export function syncAddressBar(href: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname + window.location.search + window.location.hash === href) return;
  window.history.replaceState({ ...(window.history.state ?? {}), __pane: true }, "", href);
}

// ——— The side view's look on this device ———

function getSidePrefs(): SidePrefs {
  if (sidePrefs) return sidePrefs;
  sidePrefs = DEFAULT_SIDE_PREFS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(SIDE_PREFS_KEY) ?? "null");
    if (stored) {
      sidePrefs = {
        mode: stored.mode === "push" ? "push" : "overlay",
        width: typeof stored.width === "number" ? clampSideWidth(stored.width) : DEFAULT_SIDE_PREFS.width,
      };
    }
  } catch {
    // ignore unreadable storage
  }
  return sidePrefs;
}

function setSidePrefs(patch: Partial<SidePrefs>) {
  sidePrefs = { ...getSidePrefs(), ...patch };
  try {
    window.localStorage.setItem(SIDE_PREFS_KEY, JSON.stringify(sidePrefs));
  } catch {
    // storage unavailable
  }
}

function hostWidth(): number {
  return (document.querySelector("[data-pane-host]") as HTMLElement | null)?.clientWidth || window.innerWidth;
}

// ——— Opening things ———

export type BesideMode = "side" | PaneEdge;

export type OpenBesideOptions = {
  /** "side" (default): the side view. An edge: split the pane it's opened from (or the main pane). */
  mode?: BesideMode;
  /** The pane it's opened from (`usePaneId()`); none = the page itself or the app's chrome. */
  from?: string | null;
  /** Shown as "Take off …" in the pane's ⋮ menu while it shows this (an attached note). */
  detach?: PaneDetach | null;
};

/**
 * Opens `href` beside what's showing (see the top of this file). Returns false, changing nothing,
 * when a pane can't show that page (`canShowInPane`) — the caller then opens it as a page.
 *
 *     openBeside("/shed-log/task?routine=r1&task=t1")              // the side view
 *     openBeside("/metronome", { mode: "right" })                  // split, side by side
 *     openBeside(noteHref(id), { from: usePaneId() })              // from inside the side view: Back works
 */
export function openBeside(rawHref: string, options: OpenBesideOptions = {}): boolean {
  if (!canShowInPane(rawHref)) return false;
  const href = normalizePaneHref(rawHref);
  const s = read();
  let layout = s.layout;
  let pageLeafId = s.pageLeafId;
  const desktop = isDesktopWindow();
  const mode: BesideMode = desktop ? (options.mode ?? "side") : "side";
  // Nothing beside the page yet: the page becomes the first pane (the real page, not remounted).
  if (!layout.tree) {
    const base = createLeaf(s.routeHref);
    layout = { ...EMPTY_LAYOUT, tree: base, activePaneId: base.id, mainPaneId: base.id };
    pageLeafId = base.id;
  }
  let targetId: string;
  if (mode === "side") {
    const side = findPane(layout, layout.sideId);
    if (side) {
      targetId = side.id;
      layout = navigateIn(layout, side.id, href, false);
    } else {
      const leaf = createLeaf(href);
      targetId = leaf.id;
      const prefs = getSidePrefs();
      if (!desktop || prefs.mode === "overlay") {
        layout = { ...layout, float: { leaf, width: prefs.width } };
      } else {
        layout = { ...layout, tree: insertAtEdge(layout.tree!, "right", leaf, (prefs.width / hostWidth()) * 100) };
      }
      layout = { ...layout, sideId: leaf.id };
      // A phone's Back closes it (the history entry the full-screen view adds).
      if (!desktop) window.history.pushState({ ...(window.history.state ?? {}), __pane: true, __paneSide: true }, "", href);
    }
  } else {
    const leaves = collectLeaves(layout.tree);
    const from = options.from && leaves.some((l) => l.id === options.from) ? options.from : layout.mainPaneId ?? leaves[0].id;
    const leaf = createLeaf(href);
    targetId = leaf.id;
    layout = { ...layout, tree: insertBeside(layout.tree!, from, mode, leaf), mainPaneId: leaf.id };
  }
  layout = { ...layout, activePaneId: targetId, maximizedId: layout.maximizedId === targetId ? targetId : null };
  if (options.detach) detachers.set(targetId, options.detach);
  else detachers.delete(targetId);
  focusRequest = targetId;
  set({ layout, pageLeafId });
  return true;
}

/** The old name for a split from the sidebar's right-click menu. */
export function openInSplit(href: string, edge: PaneEdge) {
  return openBeside(href, { mode: edge });
}

function navigateIn(layout: Layout, paneId: string, href: string, replace: boolean): Layout {
  const change = (l: PaneLeaf): PaneLeaf =>
    l.href === href ? l : { ...l, href, back: replace ? l.back : [...(l.back ?? []), l.href].slice(-BACK_LIMIT) };
  if (layout.float?.leaf.id === paneId) return { ...layout, float: { ...layout.float, leaf: change(layout.float.leaf) } };
  return layout.tree ? { ...layout, tree: updateLeaf(layout.tree, paneId, change) } : layout;
}

/** A link or `router.push` inside a pane: that pane goes to `href` (Back returns), and becomes the
    active one. Returns false when a pane can't show it (the caller navigates the window). */
export function navigatePane(paneId: string, rawHref: string, { replace = false } = {}): boolean {
  if (!canShowInPane(rawHref)) return false;
  const href = normalizePaneHref(rawHref);
  const s = read();
  if (!findPane(s.layout, paneId)) return false;
  detachers.delete(paneId);
  const layout = navigateIn(s.layout, paneId, href, replace);
  const isTree = collectLeaves(layout.tree).some((l) => l.id === paneId);
  set({ layout: { ...layout, activePaneId: paneId, ...(isTree ? { mainPaneId: paneId } : {}) } });
  return true;
}

/** The sidebar, ⌘K and links outside the panes: open `href` in the main pane (the tree pane last
    clicked) while the screen is split. False when it isn't, or a pane can't show it. */
export function navigateMain(href: string): boolean {
  if (!panesActive()) return false;
  const s = read();
  const main = s.layout.mainPaneId;
  if (!main) return false;
  if (!navigatePane(main, href)) return false;
  const after = read();
  if (after.layout.maximizedId && after.layout.maximizedId !== main) set({ layout: { ...after.layout, maximizedId: null } });
  return true;
}

/** Whether Back inside this pane has somewhere to go. */
export function paneCanGoBack(paneId: string): boolean {
  return (findPane(read().layout, paneId)?.back?.length ?? 0) > 0;
}

/** Back inside a pane: the page it showed before. With nothing before it, the side view closes
    on a phone (it's a page of its own there); otherwise nothing happens. */
export function paneBack(paneId: string) {
  const s = read();
  const leaf = findPane(s.layout, paneId);
  if (!leaf) return;
  const back = leaf.back ?? [];
  if (!back.length) {
    if (!isDesktopWindow() && s.layout.sideId === paneId) closePane(paneId);
    return;
  }
  const change = (l: PaneLeaf): PaneLeaf => ({ ...l, href: back[back.length - 1], back: back.slice(0, -1) });
  const layout = s.layout.float?.leaf.id === paneId ? { ...s.layout, float: { ...s.layout.float, leaf: change(s.layout.float.leaf) } } : { ...s.layout, tree: updateLeaf(s.layout.tree!, paneId, change) };
  detachers.delete(paneId);
  set({ layout: { ...layout, activePaneId: paneId } });
}

// ——— Pane controls ———

export function focusPane(paneId: string) {
  const s = read();
  if (s.layout.activePaneId === paneId && (s.layout.mainPaneId === paneId || s.layout.float?.leaf.id === paneId)) return;
  const isTree = collectLeaves(s.layout.tree).some((l) => l.id === paneId);
  if (!isTree && s.layout.float?.leaf.id !== paneId) return;
  set({ layout: { ...s.layout, activePaneId: paneId, ...(isTree ? { mainPaneId: paneId } : {}) } });
}

/** Closes a pane. The side view on a phone goes back through its history entry. */
export function closePane(paneId: string) {
  const s = read();
  const { layout } = s;
  if (!isDesktopWindow() && layout.float?.leaf.id === paneId && (window.history.state as { __paneSide?: boolean } | null)?.__paneSide) {
    window.history.back(); // the popstate closes it (`closeSideFromHistory`)
    return;
  }
  removeFromLayout(paneId);
}

function removeFromLayout(paneId: string) {
  const s = read();
  const { layout } = s;
  let next: Layout;
  if (layout.float?.leaf.id === paneId) {
    next = { ...layout, float: null };
  } else {
    if (!layout.tree) return;
    const tree = removePane(layout.tree, paneId);
    next = tree ? { ...layout, tree } : layout.float ? { ...layout, tree: layout.float.leaf, float: null } : EMPTY_LAYOUT;
  }
  if (next.activePaneId === paneId) next = { ...next, activePaneId: null };
  if (next.mainPaneId === paneId) next = { ...next, mainPaneId: null };
  detachers.delete(paneId);
  // Closing the real page's pane: whatever's left shows from the pane list (nothing remounts).
  set({ layout: next, pageLeafId: s.pageLeafId === paneId ? null : s.pageLeafId });
}

/** The phone's Back left the side view's history entry: close it. */
export function closeSideFromHistory() {
  const s = read();
  if (!s.layout.float || isDesktopWindow()) return;
  if ((window.history.state as { __paneSide?: boolean } | null)?.__paneSide) return;
  removeFromLayout(s.layout.float.leaf.id);
}

/** Only this pane stays ("Open as a page"); the others close. */
export function keepOnlyPane(paneId: string) {
  const s = read();
  const leaf = findPane(s.layout, paneId);
  if (!leaf) return;
  set({ layout: { ...EMPTY_LAYOUT, tree: leaf, activePaneId: leaf.id, mainPaneId: leaf.id } });
}

/** Full screen for now (over the other panes, which keep running), or back. */
export function toggleMaximize(paneId: string) {
  const s = read();
  set({ layout: { ...s.layout, maximizedId: s.layout.maximizedId === paneId ? null : paneId, activePaneId: paneId } }, { sync: false });
}

/** Side by side ⇄ above and below, for the split holding this pane. */
export function flipPane(paneId: string) {
  const s = read();
  const split = parentSplit(s.layout.tree, paneId);
  if (!split || !s.layout.tree) return;
  set({ layout: { ...s.layout, tree: flipSplit(s.layout.tree, split.id) } }, { sync: false });
}

/** This pane and the one beside it change places. */
export function swapPane(paneId: string) {
  const s = read();
  const split = parentSplit(s.layout.tree, paneId);
  if (!split || !s.layout.tree) return;
  set({ layout: { ...s.layout, tree: swapSplit(s.layout.tree, split.id) } }, { sync: false });
}

export function resizePanes(splitId: string, sizes: [number, number]) {
  const s = read();
  if (!s.layout.tree) return;
  set({ layout: { ...s.layout, tree: resizeSplit(s.layout.tree, splitId, sizes) } }, { sync: false });
}

export function setFloatWidth(width: number) {
  const s = read();
  if (!s.layout.float) return;
  const w = clampSideWidth(width);
  setSidePrefs({ width: w });
  set({ layout: { ...s.layout, float: { ...s.layout.float, width: w } } }, { sync: false });
}

/** A pane of the split becomes the side view over the page ("Over the page"). A float already
    there takes its place in the split. */
export function floatPane(paneId: string) {
  const s = read();
  const { layout } = s;
  if (!layout.tree || layout.float?.leaf.id === paneId) return;
  const leaf = collectLeaves(layout.tree).find((l) => l.id === paneId);
  if (!leaf || collectLeaves(layout.tree).length < 2) return;
  const tree = layout.float ? updateLeaf(layout.tree, paneId, () => layout.float!.leaf) : removePane(layout.tree, paneId);
  if (!tree) return;
  setSidePrefs({ mode: "overlay" });
  set({ layout: { ...layout, tree, float: { leaf, width: getSidePrefs().width }, sideId: leaf.id, activePaneId: leaf.id } });
}

/** The side view over the page moves into the split, beside everything ("Beside the page"). */
export function dockFloat() {
  const s = read();
  const { layout } = s;
  if (!layout.float || !layout.tree) return;
  const { leaf, width } = layout.float;
  setSidePrefs({ mode: "push" });
  set({ layout: { ...layout, float: null, tree: insertAtEdge(layout.tree, "right", leaf, (width / hostWidth()) * 100), activePaneId: leaf.id } });
}

/** This pane becomes where `openBeside` opens things (a split pane made the side view). */
export function makeSide(paneId: string) {
  const s = read();
  if (!findPane(s.layout, paneId)) return;
  set({ layout: { ...s.layout, sideId: paneId } }, { sync: false });
}

export function paneDetach(paneId: string): PaneDetach | null {
  return detachers.get(paneId) ?? null;
}

/** The pane just opened (once), to move keyboard focus into it. */
export function takeFocusRequest(): string | null {
  const id = focusRequest;
  focusRequest = null;
  return id;
}

// ——— The real router ———

/** The real route changed (a browser Back/Forward, or a page a pane can't show): the main pane
    shows it — as the real page, so it isn't rendered twice. On a phone the side view closes. */
export function routeChanged(href: string) {
  const s = read();
  if (s.routeHref === href) return;
  if (!s.layout.tree) {
    state = { ...s, routeHref: href };
    for (const listener of listeners) listener();
    return;
  }
  let layout = s.layout;
  if (!isDesktopWindow()) {
    layout = withoutFloat(layout);
    const main = layout.mainPaneId ?? collectLeaves(layout.tree)[0].id;
    set({ routeHref: href, pageLeafId: main, layout: { ...layout, tree: updateLeaf(layout.tree!, main, (l) => ({ ...l, href })) } }, { sync: false });
    return;
  }
  const target = layout.activePaneId && collectLeaves(layout.tree).some((l) => l.id === layout.activePaneId) ? layout.activePaneId : layout.mainPaneId!;
  const tree = updateLeaf(layout.tree!, target, (l) => (l.href === href ? l : { ...l, href, back: [...(l.back ?? []), l.href].slice(-BACK_LIMIT) }));
  set({ routeHref: href, pageLeafId: target, layout: { ...layout, tree, activePaneId: target, mainPaneId: target, maximizedId: layout.maximizedId === target ? target : null } }, { sync: false });
}

// ——— Tabs ———

/**
 * Puts a tab's layout on screen (`lib/useTabs.ts`): `saved` (a split or the side view), or just
 * the page at `href` (a tab with one page). The panes it had before go (unmounted: tools with an
 * engine of their own, like the Metronome, keep running and show in the background dock).
 *
 * - Switching (the default): the address bar follows the tab's active pane. On a desktop its
 *   panes render from `PANE_ROUTES` (the real page only where a pane already shows the window's
 *   address), so nothing goes through Next's router. Returns an address the real router must go to
 *   instead, or null: on a phone (which shows only the main pane, as the real page), or a lone page
 *   a pane can't show (admin, legal…).
 * - `keepAddress`: loading the tab after the page opened (the account's tabs arriving): the
 *   window's address stays and goes in the main pane, as when a saved split is opened at an address.
 */
export function showTabLayout(saved: Layout | null, href: string, { keepAddress = false }: { keepAddress?: boolean } = {}): string | null {
  const s = read();
  const desktop = isDesktopWindow();
  let layout: Layout;
  if (saved?.tree) {
    layout = saved;
  } else {
    const leaf = createLeaf(normalizePaneHref(href));
    layout = { ...EMPTY_LAYOUT, tree: leaf, activePaneId: leaf.id, mainPaneId: leaf.id };
  }
  if (!desktop) layout = withoutFloat(layout);
  focusRequest = null;
  if (keepAddress) {
    const placed = placeAddress(layout, s.routeHref);
    set({ layout: placed.layout, pageLeafId: placed.pageLeafId, pendingSplit: null });
    return null;
  }
  const leaves = collectLeaves(layout.tree);
  if (desktop) {
    const panes = allPanes(layout);
    const active = findPane(layout, layout.activePaneId) ?? leaves[0];
    const page = active.href === s.routeHref ? active : panes.find((l) => l.href === s.routeHref);
    const lone = leaves.length === 1 && !layout.float ? leaves[0] : null;
    if (lone && !canShowInPane(lone.href) && lone.href !== s.routeHref) {
      set({ layout, pageLeafId: lone.id, pendingSplit: null }, { sync: false });
      return lone.href;
    }
    set({ layout, pageLeafId: page?.id ?? null, pendingSplit: null });
    return null;
  }
  const main = leaves.find((l) => l.id === layout.mainPaneId) ?? leaves[0];
  set({ layout, pageLeafId: main.id, pendingSplit: null }, { sync: false });
  return main.href === s.routeHref ? null : main.href;
}

// ——— Splitting from the ⌘K palette ———

/** A pane's "Split right…/down…": remembers which pane and which way while the ⌘K palette is open
    on its behalf (`components/CommandPalette.tsx` calls `applyPendingSplit` with the pick). */
export function requestSplit(paneId: string, edge: PaneEdge) {
  set({ pendingSplit: { paneId, edge } }, { sync: false });
}

export function clearPendingSplit() {
  if (read().pendingSplit) set({ pendingSplit: null }, { sync: false });
}

/** The palette's pick, when a split is waiting for one: opens it there and returns true. */
export function applyPendingSplit(href: string): boolean {
  const s = read();
  if (!s.pendingSplit) return false;
  const { paneId, edge } = s.pendingSplit;
  set({ pendingSplit: null }, { sync: false });
  return openBeside(href, { mode: edge, from: paneId });
}
