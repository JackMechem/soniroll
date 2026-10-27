import { useMemo } from "react";
import { getLocation, getRouteParams, navigate, useLocation } from "../router";

/** Stand-in for `next/navigation`, on top of the desktop router. */

const router = {
  push: (href: string, options?: { scroll?: boolean }) => navigate(href, options),
  replace: (href: string, options?: { scroll?: boolean }) => navigate(href, { ...options, replace: true }),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => {},
  prefetch: () => {},
};

export function useRouter() {
  return router;
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
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
