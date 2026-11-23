"use client";

import { useContext, useMemo } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  NavigationPromisesContext,
  PathParamsContext,
  PathnameContext,
  ReadonlyURLSearchParams,
  SearchParamsContext,
  createDevToolsInstrumentedPromise,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { PaneNav } from "@/lib/paneContext";

const NO_PARAMS = {};

/**
 * Inside a split-screen pane, Next's own `usePathname()`, `useSearchParams()` and `useRouter()`
 * give the pane's address and router instead of the window's: a page in a pane reads its own
 * `?tab=` (the Library kept switching back to Tunes when another pane changed the real address),
 * and its `router.push` changes what the pane shows. These are Next's internal contexts (the same
 * ones its hooks read); with `nav` null they pass the outer values through unchanged, so a page
 * keeps exactly the same element tree whether or not it's in a pane (no remount when the first
 * pane opens beside it). The desktop app swaps this file for a pass-through (its `next/navigation`
 * stand-in reads `PaneNavContext` itself).
 */
export default function NextPaneContexts({ nav, children }: { nav: PaneNav | null; children: React.ReactNode }) {
  const outerRouter = useContext(AppRouterContext);
  const outerPathname = useContext(PathnameContext);
  const outerSearch = useContext(SearchParamsContext);
  const outerParams = useContext(PathParamsContext);
  const outerPromises = useContext(NavigationPromisesContext);
  const search = nav?.search;
  const searchParams = useMemo(() => (search === undefined ? null : new URLSearchParams(search)), [search]);
  const pathname = nav?.pathname;
  // In development Next's hooks read these promises first (and its own segments below build on
  // them), so a pane gets a set of its own.
  const promises = useMemo(
    () =>
      outerPromises && pathname !== undefined && searchParams
        ? {
            ...outerPromises,
            pathname: createDevToolsInstrumentedPromise("pathname", pathname),
            searchParams: createDevToolsInstrumentedPromise("searchParams", new ReadonlyURLSearchParams(searchParams)),
            params: createDevToolsInstrumentedPromise("params", NO_PARAMS),
          }
        : null,
    [outerPromises, pathname, searchParams],
  );
  const paneRouter = nav?.router;
  const router = useMemo(
    () =>
      paneRouter && outerRouter
        ? { ...outerRouter, push: paneRouter.push, replace: paneRouter.replace, back: paneRouter.back, forward: paneRouter.forward }
        : outerRouter,
    [paneRouter, outerRouter],
  );
  return (
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value={nav ? nav.pathname : outerPathname}>
        <SearchParamsContext.Provider value={nav ? searchParams : outerSearch}>
          <PathParamsContext.Provider value={nav ? NO_PARAMS : outerParams}>
            <NavigationPromisesContext.Provider value={nav ? promises : outerPromises}>{children}</NavigationPromisesContext.Provider>
          </PathParamsContext.Provider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}
