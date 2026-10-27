import { useSyncExternalStore } from "react";

/** The desktop app's router: the browser's own history, read through `useSyncExternalStore`.
    The `next/link` and `next/navigation` stand-ins are built on it, so the website's components
    navigate here exactly as they do on the site. */

type Location = { pathname: string; search: string; hash: string };

const listeners = new Set<() => void>();
let current = read();

function read(): Location {
  const { pathname, search, hash } = window.location;
  return { pathname, search, hash };
}

function notify() {
  const next = read();
  if (next.pathname === current.pathname && next.search === current.search && next.hash === current.hash) return;
  current = next;
  for (const listener of listeners) listener();
}

window.addEventListener("popstate", notify);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocation(): Location {
  return useSyncExternalStore(subscribe, () => current);
}

export function getLocation(): Location {
  return current;
}

export function navigate(href: string, { replace = false, scroll = true } = {}) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) {
    window.open(url.toString(), "_blank");
    return;
  }
  const target = url.pathname + url.search + url.hash;
  if (replace) window.history.replaceState(window.history.state, "", target);
  else window.history.pushState(null, "", target);
  notify();
  if (scroll && !url.hash) window.scrollTo(0, 0);
}

// Website code sometimes calls history.pushState/replaceState itself (the split-screen layout
// keeps the address bar in sync that way); keep the router in step.
for (const method of ["pushState", "replaceState"] as const) {
  const original = window.history[method].bind(window.history);
  window.history[method] = (...args: Parameters<History["pushState"]>) => {
    original(...args);
    queueMicrotask(notify);
  };
}
