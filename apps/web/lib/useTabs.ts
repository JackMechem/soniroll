"use client";

import { useSyncExternalStore } from "react";
import { confirmLeave } from "@/lib/leaveGuards";
import { type Layout, allPanes, cloneLayout, collectLeaves, findPane, readLayout } from "@/lib/tilingLayout";
import { normalizePaneHref } from "@/lib/toolRegistry";
import { getTilingState, showTabLayout, subscribeTiling } from "@/lib/useTilingLayout";

/**
 * Tabs: each one a view of its own — one page, or a split of several with a side view — saved as
 * one `Layout` (`lib/tilingLayout.ts`). Only the active tab is on screen; switching puts another
 * tab's layout on screen through `showTabLayout` (`lib/useTilingLayout.ts`), and the tab you left
 * keeps a copy of what it showed. Its pages unmount (a tool with its own engine — the Metronome,
 * Metric Modulation, the Tuner — keeps running in the background dock; anything else stops, as
 * when you go to another page).
 *
 * Saved through `useSyncedSettings` (`components/tabs/TabsSync.tsx`): signed in in the account,
 * signed out in this browser, under `jam-practice-tabs` as `{ tabs: SavedTab[] }` — no merge
 * between the two (signing in switches which list is read). With one tab nothing is saved (`[]`):
 * the one tab is just the screen, kept on this device under `jam-practice-tiling` as before, so
 * today's layout is the first tab the moment a second one opens. Which tab is open is this
 * device's own (`jam-practice-active-tab`, per store), so two devices can each be on a different tab.
 *
 * - The tab on screen is this device's: another device's change to it is ignored here (and the
 *   next change here writes over it). Changes to the other tabs, and new or closed tabs, show
 *   straight away.
 * - A device whose tab isn't in the list (new to it, or its tab was closed elsewhere) joins the
 *   tab showing its page, or its screen becomes a new tab (`join`).
 */

export const TABS_KEY = "jam-practice-tabs";
const ACTIVE_KEY = "jam-practice-active-tab";
export const MAX_TABS = 12;
/** What a new tab opens. */
export const NEW_TAB_HREF = "/dashboard";
/** The one tab while there's only one (nothing saved). */
export const LIVE_TAB_ID = "live";

/** A saved tab: `href` is its address (its active pane's, or its one page); `layout` only when it
    has more than one page (a split or the side view). `name` only once renamed. */
export type SavedTab = { id: string; name?: string; href: string; layout?: Layout };
export type TabsSettings = { tabs: SavedTab[] };
export const TABS_DEFAULTS: TabsSettings = { tabs: [] };

/** What the tab strip and the phone's tab list show. `mainHref` names the tab until it's renamed. */
export type TabView = { id: string; name: string | null; href: string; mainHref: string; panes: number };
export type TabsView = { tabs: TabView[]; activeId: string };

type Writer = (patch: Partial<TabsSettings>) => void;

/** Fewer than two: one tab, the live screen (nothing saved). */
let tabs: SavedTab[] = [];
let activeId: string | null = null;
let writer: Writer | null = null;
/** False until the store's real value is in hand (an account's still loading): no writes then. */
let writable = false;
/** Which store `tabs` came from ("account" or "local"); a change means signing in or out. */
let scope: string | null = null;
/** The last list written or read, as JSON: the store echoing our own write isn't news. */
let lastJson = "[]";
let navigateReal: ((href: string) => void) | null = null;
let view: TabsView | null = null;
let viewKey = "";
let subscribed = false;
const listeners = new Set<() => void>();

const SERVER_VIEW: TabsView = { tabs: [{ id: LIVE_TAB_ID, name: null, href: "/", mainHref: "/", panes: 1 }], activeId: LIVE_TAB_ID };

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** The tab this device last had open, per store (the account's tabs and this browser's own are
    different lists). */
function activeIds(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ACTIVE_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function readActiveId(): string | null {
  return scope ? (activeIds()[scope] ?? null) : null;
}

function storeActiveId(id: string | null) {
  if (!scope) return;
  try {
    const all = activeIds();
    if (id) all[scope] = id;
    else delete all[scope];
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable
  }
}

/** What's on screen, as a saved tab (without its id and name). */
function liveTab(): { href: string; layout?: Layout } {
  const { layout, routeHref } = getTilingState();
  if (!layout.tree) return { href: routeHref };
  const leaves = collectLeaves(layout.tree);
  if (leaves.length === 1 && !layout.float) return { href: leaves[0].href };
  const active = findPane(layout, layout.activePaneId) ?? leaves[0];
  return { href: active.href, layout };
}

function withLive(tab: SavedTab): SavedTab {
  return { id: tab.id, ...(tab.name ? { name: tab.name } : {}), ...liveTab() };
}

function isTabMode() {
  return tabs.length >= 2 && activeId !== null && tabs.some((t) => t.id === activeId);
}

/** Copies the screen into the active tab; true if that changed it. */
function refreshActive(): boolean {
  if (!isTabMode()) return false;
  const i = tabs.findIndex((t) => t.id === activeId);
  const next = withLive(tabs[i]);
  if (JSON.stringify(next) === JSON.stringify(tabs[i])) return false;
  tabs = tabs.map((t, j) => (j === i ? next : t));
  return true;
}

function save() {
  const value = isTabMode() ? tabs : [];
  const json = JSON.stringify(value);
  if (json === lastJson) return;
  lastJson = json;
  if (writer && writable) writer({ tabs: value });
}

function tabView(tab: SavedTab): TabView {
  const layout = tab.layout;
  const leaves = collectLeaves(layout?.tree ?? null);
  const main = layout ? (leaves.find((l) => l.id === layout.mainPaneId) ?? leaves[0]) : undefined;
  return { id: tab.id, name: tab.name ?? null, href: tab.href, mainHref: main?.href ?? tab.href, panes: layout ? allPanes(layout).length : 1 };
}

function emit() {
  const next: TabsView = isTabMode()
    ? { tabs: tabs.map((t) => tabView(t.id === activeId ? withLive(t) : t)), activeId: activeId! }
    : { tabs: [tabView({ id: LIVE_TAB_ID, ...liveTab() })], activeId: LIVE_TAB_ID };
  const key = JSON.stringify(next);
  if (key === viewKey && view) return;
  viewKey = key;
  view = next;
  for (const listener of listeners) listener();
}

function ensureSubscribed() {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  subscribeTiling(() => {
    if (refreshActive()) save();
    emit();
  });
}

function subscribe(listener: () => void) {
  ensureSubscribed();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getView(): TabsView {
  ensureSubscribed();
  if (!view) emit();
  return view!;
}

/** The tabs and which one is on screen (one tab, `LIVE_TAB_ID`, while there's only one). */
export function useTabs(): TabsView {
  return useSyncExternalStore(subscribe, getView, () => SERVER_VIEW);
}

export function getTabs(): TabsView {
  return getView();
}

// ——— Reading the saved list (`TabsSync`) ———

function validTabs(raw: unknown): SavedTab[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedTab[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, name, href, layout } = item as Record<string, unknown>;
    if (typeof id !== "string" || seen.has(id) || typeof href !== "string" || !href.startsWith("/")) continue;
    seen.add(id);
    const l = layout ? readLayout(layout, normalizePaneHref) : null;
    out.push({
      id,
      ...(typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 60) } : {}),
      href: normalizePaneHref(href),
      ...(l?.tree ? { layout: l } : {}),
    });
  }
  return out.slice(0, MAX_TABS);
}

/**
 * This device joins the list: the tab it had open last (with the page it's on in that tab's main
 * pane, as when a saved split is opened at an address); else the tab already showing the page
 * it's on; else what's on screen becomes a new tab at the end. So a device's screen is always one
 * of the tabs, and opening soniroll somewhere new never changes a tab set up elsewhere.
 */
function join(list: SavedTab[]) {
  if (list.length < 2) {
    tabs = [];
    activeId = null;
    emit();
    return;
  }
  tabs = list;
  const here = getTilingState().routeHref;
  const target =
    list.find((t) => t.id === readActiveId()) ??
    list.find((t) => (t.layout ? allPanes(t.layout).some((p) => p.href === here) : t.href === here));
  if (!target && list.length < MAX_TABS) {
    const tab: SavedTab = { id: newId(), ...liveTab() };
    tabs = [...list, tab];
    activeId = tab.id;
    storeActiveId(tab.id);
    save();
    emit();
    return;
  }
  const pick = target ?? list[0];
  activeId = pick.id;
  storeActiveId(pick.id);
  const live = liveTab();
  const saved = { href: pick.href, ...(pick.layout ? { layout: pick.layout } : {}) };
  if (JSON.stringify(live) !== JSON.stringify(saved)) showTabLayout(pick.layout ?? null, pick.href, { keepAddress: true });
  if (refreshActive()) save();
  emit();
}

/** The saved list from the store in use (`TabsSync`, on every change). `ready` is false while an
    account's value is still loading. */
export function receiveSavedTabs(raw: unknown, storeScope: string, ready: boolean, write: Writer) {
  ensureSubscribed();
  writer = write;
  if (!ready) {
    writable = false;
    return;
  }
  writable = true;
  const json = JSON.stringify(Array.isArray(raw) ? raw : []);
  if (storeScope !== scope) {
    // First load, or signed in or out: this store's tabs.
    scope = storeScope;
    lastJson = json;
    join(validTabs(raw));
    return;
  }
  if (json === lastJson) return;
  lastJson = json;
  const list = validTabs(raw);
  if (list.length < 2) {
    // Closed down to one tab elsewhere: here, what's on screen is the one tab.
    tabs = [];
    activeId = null;
    emit();
    return;
  }
  if (!activeId || !list.some((t) => t.id === activeId)) {
    join(list);
    return;
  }
  // The tab on screen stays as this device has it.
  tabs = list.map((t) => (t.id === activeId ? withLive(t) : t));
  emit();
}

/** How tabs reach Next's router when a switch needs a real navigation (phones). */
export function setTabNavigator(fn: ((href: string) => void) | null) {
  navigateReal = fn;
}

// ——— Actions ———

/** Makes the one tab (the screen) a real tab, before a second one is added. */
function materialize() {
  if (isTabMode()) return;
  const id = newId();
  tabs = [{ id, ...liveTab() }];
  activeId = id;
  storeActiveId(id);
}

function resolveId(id: string) {
  return id === LIVE_TAB_ID ? activeId : id;
}

function goTo(id: string) {
  refreshActive();
  const target = tabs.find((t) => t.id === id);
  if (!target) return;
  activeId = id;
  storeActiveId(id);
  const go = showTabLayout(target.layout ?? null, target.href);
  refreshActive();
  save();
  emit();
  if (go) navigateReal?.(go);
}

export function tabCount(): number {
  return isTabMode() ? tabs.length : 1;
}

/** Shows another tab (after asking, if the page on screen has unsaved work). */
export function switchTab(id: string) {
  if (!isTabMode() || id === activeId || !tabs.some((t) => t.id === id)) return;
  confirmLeave(() => goTo(id));
}

/** The tab at this position (0-based; -1 = the last one), for the keyboard shortcuts. */
export function switchToIndex(index: number) {
  if (!isTabMode()) return;
  const tab = index < 0 ? tabs[tabs.length - 1] : tabs[index];
  if (tab) switchTab(tab.id);
}

/** The tab before or after the active one (wrapping round). */
export function switchBy(step: number) {
  if (!isTabMode()) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  switchTab(tabs[(i + step + tabs.length) % tabs.length].id);
}

/**
 * Opens `href` (the dashboard by default) in a new tab and shows it. `after`: right after the
 * active tab (opening a page in a new tab) rather than at the end (New tab). False when it can't
 * (the limit, or the account's tabs are still loading).
 */
export function newTab(href: string = NEW_TAB_HREF, { after = false }: { after?: boolean } = {}): boolean {
  if (!writable || tabCount() >= MAX_TABS) return false;
  confirmLeave(() => {
    materialize();
    refreshActive();
    const tab: SavedTab = { id: newId(), href: normalizePaneHref(href) };
    const i = after ? tabs.findIndex((t) => t.id === activeId) + 1 : tabs.length;
    tabs = [...tabs.slice(0, i), tab, ...tabs.slice(i)];
    goTo(tab.id);
  });
  return true;
}

/** A copy of a tab (its pages and layout, its name), right after it; the screen stays put. */
export function duplicateTab(id: string): boolean {
  if (!writable || tabCount() >= MAX_TABS) return false;
  materialize();
  refreshActive();
  const realId = resolveId(id);
  const i = tabs.findIndex((t) => t.id === realId);
  if (i < 0) return false;
  const src = tabs[i];
  const copy: SavedTab = { id: newId(), ...(src.name ? { name: src.name } : {}), href: src.href, ...(src.layout ? { layout: cloneLayout(src.layout) } : {}) };
  tabs = [...tabs.slice(0, i + 1), copy, ...tabs.slice(i + 1)];
  save();
  emit();
  return true;
}

/** Closes a tab. Closing the one on screen shows the next one (or the one before). Down to one
    tab, nothing's saved any more and the one left is just the screen. */
export function closeTab(id: string) {
  if (!isTabMode()) return;
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  if (id !== activeId) {
    tabs = tabs.filter((t) => t.id !== id);
    settle();
    return;
  }
  confirmLeave(() => {
    const j = tabs.findIndex((t) => t.id === id);
    if (j < 0) return;
    const next = tabs[j + 1] ?? tabs[j - 1];
    tabs = tabs.filter((t) => t.id !== id);
    activeId = null;
    if (next) goTo(next.id);
    settle();
  });
}

/** Closes every tab but this one. */
export function closeOtherTabs(id: string) {
  if (!isTabMode() || !tabs.some((t) => t.id === id)) return;
  const keep = () => {
    tabs = tabs.filter((t) => t.id === id);
    settle();
  };
  if (id === activeId) keep();
  else
    confirmLeave(() => {
      goTo(id);
      keep();
    });
}

/** After closing: one tab left is just the screen again (nothing saved). */
function settle() {
  if (tabs.length < 2) {
    tabs = [];
    activeId = null;
    storeActiveId(null);
  }
  save();
  emit();
}

/** Names a tab (empty: back to its page's name). */
export function renameTab(id: string, name: string) {
  const realId = resolveId(id);
  if (!isTabMode() || !realId) return;
  const clean = name.trim().slice(0, 60);
  tabs = tabs.map((t) => {
    if (t.id !== realId) return t;
    return { id: t.id, ...(clean ? { name: clean } : {}), href: t.href, ...(t.layout ? { layout: t.layout } : {}) };
  });
  save();
  emit();
}

/** Moves a tab to position `to` (0-based, in the list without it). */
export function moveTab(id: string, to: number) {
  if (!isTabMode()) return;
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  const rest = tabs.filter((t) => t.id !== id);
  const at = Math.max(0, Math.min(rest.length, to));
  const next = [...rest.slice(0, at), tab, ...rest.slice(at)];
  if (next.every((t, i) => t === tabs[i])) return;
  tabs = next;
  save();
  emit();
}
