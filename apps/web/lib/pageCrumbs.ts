"use client";

import { createContext, useContext, useEffect, useId, useSyncExternalStore } from "react";

/** One step in a page's trail ("Library / Tunes / Setlists / Gig"). The last crumb is the page
    you're on; the others link up the page's own structure (where its back button used to go), not
    the browser's history, so a trail is the same however you got there. A crumb with `onClick`
    and no `href` is a button (a view inside the same page, e.g. an editor over a chart). */
export type Crumb = {
  label: string;
  href?: string;
  onClick?: () => void;
  /** A shorter name for the phone's top bar when the label is long (a tool's `short`). */
  short?: string;
};

export type CrumbIcon = React.ComponentType<{ className?: string }>;

/** What a page tells the phone's top bar (and a split-screen pane's bar): its trail, its icon,
    and its intro "?" if it has one. */
export type PageCrumbs = {
  crumbs: Crumb[];
  icon?: CrumbIcon;
  intro?: { label: string; show: () => void };
};

/** The pages that have set their crumbs, newest last; the newest one wins (a page that opens a
    view with its own bar over itself, then closes it, gets its own trail back). Only a change to
    what's shown (labels, links, icon) gives a new snapshot and notifies, so a page re-rendering
    every frame (a running tool) doesn't re-render the bar showing it — and a pane, whose bar is the
    page's parent, doesn't loop (a new snapshot on every render made React re-render the pane, so
    the page, so a new snapshot…). The newest click handlers are kept in place on the same
    snapshot. */
export function createCrumbStore() {
  type Entry = { id: string; key: string; snapshot: PageCrumbs };
  let entries: Entry[] = [];
  const listeners = new Set<() => void>();
  let current: PageCrumbs | null = null;
  const icons = new WeakMap<object, number>();
  let nextIcon = 1;
  const iconKey = (icon?: CrumbIcon) => {
    if (!icon) return 0;
    if (!icons.has(icon)) icons.set(icon, nextIcon++);
    return icons.get(icon)!;
  };
  const keyOf = (v: PageCrumbs) =>
    `${iconKey(v.icon)}|${v.intro?.label ?? ""}|${v.crumbs.map((c) => `${c.label}\u0000${c.href ?? ""}\u0000${c.onClick ? 1 : 0}\u0000${c.short ?? ""}`).join("\u0001")}`;
  const publish = () => {
    const top = entries[entries.length - 1];
    const next = top ? top.snapshot : null;
    if (next === current) return;
    current = next;
    listeners.forEach((l) => l());
  };
  return {
    get: () => current,
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    set(id: string, value: PageCrumbs) {
      const key = keyOf(value);
      const found = entries.find((e) => e.id === id);
      if (found && found.key === key) {
        // Same trail: the same snapshot, with this render's handlers (nothing re-renders).
        Object.assign(found.snapshot, value);
        return;
      }
      const entry: Entry = { id, key, snapshot: { ...value } };
      entries = found ? entries.map((e) => (e === found ? entry : e)) : [...entries, entry];
      publish();
    },
    remove(id: string) {
      if (!entries.some((e) => e.id === id)) return;
      entries = entries.filter((e) => e.id !== id);
      publish();
    },
  };
}

export type CrumbStore = ReturnType<typeof createCrumbStore>;

/** The whole window's page (the phone top bar reads it). */
const pageStore = createCrumbStore();

/** Inside a split-screen pane: that pane's own store, so its bar shows its page's trail (and the
    window's top bar isn't touched — it's hidden while panes are on anyway). */
export const PaneCrumbStoreContext = createContext<CrumbStore | null>(null);

/** Set this page's trail for the phone's top bar or its pane's bar (`PageBar` calls it). Set after
    mount, so the server and the first render show the bar's own fallback (no hydration mismatch). */
export function usePageCrumbs(value: PageCrumbs | null) {
  const paneStore = useContext(PaneCrumbStoreContext);
  const store = paneStore ?? pageStore;
  const id = useId();
  useEffect(() => {
    if (value) store.set(id, value);
    else store.remove(id);
  });
  useEffect(() => () => store.remove(id), [store, id]);
}

/** The trail the current page set (null on the server, before the page's effect has run, or on a
    page that sets none). */
export function useCurrentCrumbs(store: CrumbStore = pageStore): PageCrumbs | null {
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}
