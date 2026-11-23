/**
 * The pure data model for split screen and the side view (no React). One `Layout` object holds
 * everything on screen, so it can be saved as is (`lib/useTilingLayout.ts` keeps it in
 * localStorage) and each tab holds one (`lib/useTabs.ts`).
 *
 * - `tree`: the tiled panes. A `PaneTree` is a binary tree: a `PaneLeaf` shows one page (`href`,
 *   with its own Back list); a `PaneSplit` holds two children side by side (`"row"`) or one above
 *   the other (`"col"`), `sizes` a `[first, second]` percentage pair summing to 100. `null` is the
 *   plain page, no panes at all.
 * - `float`: the side view floating over the panes ("Over the page"), or null. Its width is in px.
 * - `sideId`: the pane things open in "beside" (`openBeside`'s side mode) — the float, or a pane in
 *   the tree when the side view is docked beside the page. Null when there's no side view.
 * - `activePaneId`: the pane last clicked (keyboard shortcuts, the address bar);
 *   `mainPaneId`: the tree pane last clicked (the sidebar opens pages there, never in the float).
 * - `maximizedId`: a pane shown over all the others for now (full screen); the others keep running.
 */

export type PaneEdge = "up" | "down" | "left" | "right";

export type PaneLeaf = {
  type: "leaf";
  id: string;
  href: string;
  /** Where Back goes inside this pane (newest last). */
  back?: string[];
};

export type PaneSplit = {
  type: "split";
  id: string;
  direction: "row" | "col";
  sizes: [number, number];
  children: [PaneTree, PaneTree];
};

export type PaneTree = PaneLeaf | PaneSplit;

export type FloatPane = { leaf: PaneLeaf; width: number };

export type Layout = {
  v: 2;
  tree: PaneTree | null;
  float: FloatPane | null;
  sideId: string | null;
  activePaneId: string | null;
  mainPaneId: string | null;
  maximizedId: string | null;
};

export const EMPTY_LAYOUT: Layout = { v: 2, tree: null, float: null, sideId: null, activePaneId: null, mainPaneId: null, maximizedId: null };

export const BACK_LIMIT = 20;

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function createLeaf(href: string): PaneLeaf {
  return { type: "leaf", id: newId(), href };
}

/** Puts `leaf` beside the pane `targetId` along `edge` ("left"/"up" put it first, "right"/"down"
    second). `sizes` is the new pair (default half and half). Unchanged if `targetId` isn't a leaf
    of the tree. */
export function insertBeside(tree: PaneTree, targetId: string, edge: PaneEdge, leaf: PaneLeaf, sizes: [number, number] = [50, 50]): PaneTree {
  const direction: "row" | "col" = edge === "left" || edge === "right" ? "row" : "col";
  const first = edge === "left" || edge === "up";
  function recurse(node: PaneTree): PaneTree {
    if (node.type === "leaf") {
      if (node.id !== targetId) return node;
      return { type: "split", id: newId(), direction, sizes, children: first ? [leaf, node] : [node, leaf] };
    }
    const a = recurse(node.children[0]);
    const b = recurse(node.children[1]);
    return a === node.children[0] && b === node.children[1] ? node : { ...node, children: [a, b] };
  }
  return recurse(tree);
}

/** Splits the leaf `targetId` with a new pane showing `newHref` (see `insertBeside`). */
export function splitLeaf(tree: PaneTree, targetId: string, edge: PaneEdge, newHref: string): { tree: PaneTree; newPaneId: string } {
  const leaf = createLeaf(newHref);
  return { tree: insertBeside(tree, targetId, edge, leaf), newPaneId: leaf.id };
}

/** Puts `leaf` along one edge of the whole tree (the side view docked beside everything). */
export function insertAtEdge(tree: PaneTree, edge: PaneEdge, leaf: PaneLeaf, leafPercent: number): PaneTree {
  const direction: "row" | "col" = edge === "left" || edge === "right" ? "row" : "col";
  const first = edge === "left" || edge === "up";
  const pct = Math.min(80, Math.max(20, leafPercent));
  return {
    type: "split",
    id: newId(),
    direction,
    sizes: first ? [pct, 100 - pct] : [100 - pct, pct],
    children: first ? [leaf, tree] : [tree, leaf],
  };
}

const REMOVE = Symbol("remove");

/** Removes the leaf `targetId`; its parent split collapses into the sibling. `null` when it was
    the only leaf. */
export function removePane(tree: PaneTree, targetId: string): PaneTree | null {
  function recurse(node: PaneTree): PaneTree | typeof REMOVE {
    if (node.type === "leaf") return node.id === targetId ? REMOVE : node;
    const [a, b] = node.children;
    const resA = recurse(a);
    if (resA === REMOVE) return b;
    const resB = recurse(b);
    if (resB === REMOVE) return a;
    if (resA === a && resB === b) return node;
    return { ...node, children: [resA, resB] };
  }
  const result = recurse(tree);
  return result === REMOVE ? null : result;
}

/** Changes one split node, leaving the rest of the tree as it was. */
export function updateSplit(tree: PaneTree, splitId: string, fn: (s: PaneSplit) => PaneSplit): PaneTree {
  if (tree.type === "leaf") return tree;
  if (tree.id === splitId) return fn(tree);
  const a = updateSplit(tree.children[0], splitId, fn);
  const b = updateSplit(tree.children[1], splitId, fn);
  return a === tree.children[0] && b === tree.children[1] ? tree : { ...tree, children: [a, b] };
}

export function resizeSplit(tree: PaneTree, splitId: string, sizes: [number, number]): PaneTree {
  return updateSplit(tree, splitId, (s) => ({ ...s, sizes }));
}

/** Side by side ⇄ one above the other. */
export function flipSplit(tree: PaneTree, splitId: string): PaneTree {
  return updateSplit(tree, splitId, (s) => ({ ...s, direction: s.direction === "row" ? "col" : "row" }));
}

/** The two sides change places (their sizes go with them). */
export function swapSplit(tree: PaneTree, splitId: string): PaneTree {
  return updateSplit(tree, splitId, (s) => ({ ...s, sizes: [s.sizes[1], s.sizes[0]], children: [s.children[1], s.children[0]] }));
}

/** Changes one leaf (its href, its Back list), or puts another leaf in its place. */
export function updateLeaf(tree: PaneTree, leafId: string, fn: (l: PaneLeaf) => PaneLeaf): PaneTree {
  if (tree.type === "leaf") return tree.id === leafId ? fn(tree) : tree;
  const a = updateLeaf(tree.children[0], leafId, fn);
  const b = updateLeaf(tree.children[1], leafId, fn);
  return a === tree.children[0] && b === tree.children[1] ? tree : { ...tree, children: [a, b] };
}

export function updateLeafHref(tree: PaneTree, leafId: string, href: string): PaneTree {
  return updateLeaf(tree, leafId, (l) => ({ ...l, href }));
}

/** Every leaf, left to right / top to bottom. */
export function collectLeaves(tree: PaneTree | null): PaneLeaf[] {
  if (!tree) return [];
  if (tree.type === "leaf") return [tree];
  return [...collectLeaves(tree.children[0]), ...collectLeaves(tree.children[1])];
}

/** The split directly holding `leafId`, or null (the leaf is the whole tree, or isn't in it). */
export function parentSplit(tree: PaneTree | null, leafId: string): PaneSplit | null {
  if (!tree || tree.type === "leaf") return null;
  if (tree.children.some((c) => c.type === "leaf" && c.id === leafId)) return tree;
  return parentSplit(tree.children[0], leafId) ?? parentSplit(tree.children[1], leafId);
}

/** Every pane, the float last. */
export function allPanes(layout: Layout): PaneLeaf[] {
  return [...collectLeaves(layout.tree), ...(layout.float ? [layout.float.leaf] : [])];
}

export function findPane(layout: Layout, id: string | null): PaneLeaf | undefined {
  if (!id) return undefined;
  return allPanes(layout).find((l) => l.id === id);
}

/** Where each tree pane and each divider goes, as fractions of the whole area (0–1) plus which
    of its edges meet a divider (those give up half the divider's width). */
export type PaneRect = { x: number; y: number; w: number; h: number; edges: { l: boolean; t: boolean; r: boolean; b: boolean } };
export type DividerRect = { split: PaneSplit; x: number; y: number; w: number; h: number };

export function layoutRects(tree: PaneTree): { panes: Map<string, PaneRect>; dividers: DividerRect[] } {
  const panes = new Map<string, PaneRect>();
  const dividers: DividerRect[] = [];
  function walk(node: PaneTree, x: number, y: number, w: number, h: number, edges: PaneRect["edges"]) {
    if (node.type === "leaf") {
      panes.set(node.id, { x, y, w, h, edges });
      return;
    }
    const f = node.sizes[0] / 100;
    if (node.direction === "row") {
      walk(node.children[0], x, y, w * f, h, { ...edges, r: true });
      walk(node.children[1], x + w * f, y, w * (1 - f), h, { ...edges, l: true });
    } else {
      walk(node.children[0], x, y, w, h * f, { ...edges, b: true });
      walk(node.children[1], x, y + h * f, w, h * (1 - f), { ...edges, t: true });
    }
    dividers.push({ split: node, x, y, w, h });
  }
  walk(tree, 0, 0, 1, 1, { l: false, t: false, r: false, b: false });
  return { panes, dividers };
}

/** A copy of `layout` with new ids for every pane and split (a duplicated tab), so the two never
    share a pane id (panes are keyed by id). */
export function cloneLayout(layout: Layout): Layout {
  const ids = new Map<string, string>();
  const map = (id: string) => {
    if (!ids.has(id)) ids.set(id, newId());
    return ids.get(id)!;
  };
  const cloneTree = (t: PaneTree): PaneTree =>
    t.type === "leaf"
      ? { ...t, id: map(t.id), ...(t.back ? { back: [...t.back] } : {}) }
      : { ...t, id: map(t.id), children: [cloneTree(t.children[0]), cloneTree(t.children[1])] };
  const remap = (id: string | null) => (id ? map(id) : null);
  return {
    v: 2,
    tree: layout.tree ? cloneTree(layout.tree) : null,
    float: layout.float ? { leaf: cloneTree(layout.float.leaf) as PaneLeaf, width: layout.float.width } : null,
    sideId: remap(layout.sideId),
    activePaneId: remap(layout.activePaneId),
    mainPaneId: remap(layout.mainPaneId),
    maximizedId: remap(layout.maximizedId),
  };
}

function validTree(node: unknown): node is PaneTree {
  if (!node || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  if (n.type === "leaf") return typeof n.id === "string" && typeof n.href === "string";
  if (n.type !== "split" || typeof n.id !== "string" || (n.direction !== "row" && n.direction !== "col")) return false;
  const sizes = n.sizes as unknown;
  const children = n.children as unknown;
  return Array.isArray(sizes) && sizes.length === 2 && sizes.every((s) => typeof s === "number") && Array.isArray(children) && children.length === 2 && children.every(validTree);
}

/** Reads a saved layout: the current shape (`v: 2`), or the older `{ enabled, tree,
    activePaneId }` split screen, kept as it was. Anything unreadable gives the plain page.
    `fixHref` maps retired addresses (`findToolLink`'s old hrefs) to today's. */
export function readLayout(stored: unknown, fixHref: (href: string) => string = (h) => h): Layout {
  if (!stored || typeof stored !== "object") return EMPTY_LAYOUT;
  const s = stored as Record<string, unknown>;
  const fixTree = (t: PaneTree): PaneTree =>
    t.type === "leaf"
      ? { type: "leaf", id: t.id, href: fixHref(t.href), ...(Array.isArray(t.back) ? { back: t.back.filter((b): b is string => typeof b === "string").slice(-BACK_LIMIT) } : {}) }
      : { ...t, children: [fixTree(t.children[0]), fixTree(t.children[1])] };
  // The old shape: split screen only, on while `enabled`.
  if (s.v !== 2) {
    if (s.enabled !== true || !validTree(s.tree)) return EMPTY_LAYOUT;
    const tree = fixTree(s.tree);
    const leaves = collectLeaves(tree);
    if (leaves.length < 2) return EMPTY_LAYOUT;
    const active = leaves.find((l) => l.id === s.activePaneId)?.id ?? leaves[0].id;
    return { ...EMPTY_LAYOUT, tree, activePaneId: active, mainPaneId: active };
  }
  const tree = validTree(s.tree) ? fixTree(s.tree) : null;
  const f = s.float as Record<string, unknown> | null | undefined;
  const float =
    f && typeof f === "object" && validTree(f.leaf) && f.leaf.type === "leaf"
      ? { leaf: fixTree(f.leaf) as PaneLeaf, width: typeof f.width === "number" ? f.width : 560 }
      : null;
  const layout: Layout = { ...EMPTY_LAYOUT, tree, float };
  const ids = new Set(allPanes(layout).map((l) => l.id));
  const pick = (v: unknown) => (typeof v === "string" && ids.has(v) ? v : null);
  const leaves = collectLeaves(tree);
  const sideId = pick(s.sideId);
  const activePaneId = pick(s.activePaneId) ?? leaves[0]?.id ?? float?.leaf.id ?? null;
  const mainPaneId = leaves.some((l) => l.id === s.mainPaneId) ? (s.mainPaneId as string) : (leaves[0]?.id ?? null);
  return { ...layout, sideId, activePaneId, mainPaneId, maximizedId: pick(s.maximizedId) };
}
