import { useConvexAuth } from "@convex-dev/auth/react";
import { useMemo } from "react";
import { currentToolHref } from "@jam-practice/core/navLinks";
import { useSyncedSettings } from "./useSyncedSettings";

const FAVORITES_KEY = "jam-practice-favorites";
const DEFAULT_FAVORITES = { hrefs: [] as string[] };

/**
 * Favorited tools (the star next to each one in the sidebar, and the "Favorites" section it puts
 * them in) — deliberately an **account-only** feature, unlike every other setting in this app:
 * signed out, `favorites` is always `[]` and the star/section don't render at all (see
 * `Sidebar.tsx`), rather than falling back to a local-only list the way `useSyncedSettings`'s own
 * signed-out branch normally would. That's a direct request, not an oversight — which tools you
 * reach for most is tied to *you*, not a particular browser. Still built on the same generic
 * `useSyncedSettings`/`syncedSettings` Convex table as everything else rather than a bespoke
 * mechanism; the signed-out local branch technically still exists underneath (so nothing breaks
 * if this ever needs to support it later), it's just never surfaced.
 */
export function useFavorites() {
  const { isAuthenticated } = useConvexAuth();
  const [{ hrefs: stored }, updateFavorites] = useSyncedSettings(FAVORITES_KEY, DEFAULT_FAVORITES);
  // A starred tool that was folded into another (Bass Genius, Drum Generator) stars the tool that
  // replaced it.
  const hrefs = useMemo(() => [...new Set(stored.map(currentToolHref))], [stored]);

  function toggleFavorite(href: string) {
    updateFavorites({
      hrefs: hrefs.includes(href) ? stored.filter((h) => currentToolHref(h) !== href) : [...stored, href],
    });
  }

  return {
    favorites: isAuthenticated ? hrefs : DEFAULT_FAVORITES.hrefs,
    toggleFavorite,
    isAuthenticated,
  };
}
