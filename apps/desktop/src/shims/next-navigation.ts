import { useContext, useMemo } from "react";
import { PaneNavContext } from "@/lib/paneContext";
import { getLocation, getRouteParams, navigate, useLocation } from "../router";

/** Stand-in for `next/navigation`, on top of the desktop router. Inside a split-screen pane the
    pane's own address and router (`PaneNavContext`, set by the website's `TilingLayout`). */

const router = {
  push: (href: string, options?: { scroll?: boolean }) => navigate(href, options),
  replace: (href: string, options?: { scroll?: boolean }) => navigate(href, { ...options, replace: true }),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => {},
  prefetch: () => {},
};

export function useRouter() {
  const pane = useContext(PaneNavContext)?.router;
  return useMemo(() => (pane ? { ...router, ...pane } : router), [pane]);
}

export function usePathname(): string {
  const pane = useContext(PaneNavContext);
  const { pathname } = useLocation();
  return pane ? pane.pathname : pathname;
}

export function useSearchParams(): URLSearchParams {
  const pane = useContext(PaneNavContext);
  const { search } = useLocation();
  const s = pane ? pane.search : search;
  return useMemo(() => new URLSearchParams(s), [s]);
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  useLocation();
  return getRouteParams() as T;
}

export function redirect(href: string): never {
  navigate(href, { replace: true });
  throw new Error(`Redirected to ${href}`);
}

export function notFound(): never {
  throw new Error(`Not found: ${getLocation().pathname}`);
}
