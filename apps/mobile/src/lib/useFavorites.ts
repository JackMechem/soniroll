import { useConvexAuth } from '@convex-dev/auth/react';

import { createLocalStore } from './localStore';
import { useSyncedSettings } from './useSyncedSettings';

const FAVORITES_KEY = 'jam-practice-favorites';
const DEFAULT_FAVORITES = { hrefs: [] as string[] };

/** Signed out, favorites are kept on this phone under their own key (not the synced key's local
    cache, which holds the last signed-in account's list). No merge either way: signing in shows the
    account's favorites, signing out shows the phone's again — the app's usual rule. */
const deviceFavorites = createLocalStore<string[]>('jam-practice-favorites-device', [], (raw) =>
  Array.isArray(raw) ? raw.filter((h): h is string => typeof h === 'string') : [],
);

/**
 * The native sibling of `apps/web/lib/useFavorites.ts`. Signed in it uses the same `syncedSettings`
 * key (`"jam-practice-favorites"`) as the website, so a tool starred here is starred there too.
 * Signed out (the website keeps none), the star still works: the list lives on this phone.
 */
export function useFavorites() {
  const { isAuthenticated } = useConvexAuth();
  const [{ hrefs }, updateFavorites, ready] = useSyncedSettings(FAVORITES_KEY, DEFAULT_FAVORITES);
  const device = deviceFavorites.useStore();

  function toggleFavorite(href: string) {
    if (!isAuthenticated) {
      void deviceFavorites.update((list) => (list.includes(href) ? list.filter((h) => h !== href) : [...list, href]));
      return;
    }
    updateFavorites({
      hrefs: hrefs.includes(href) ? hrefs.filter((h) => h !== href) : [...hrefs, href],
    });
  }

  return {
    favorites: isAuthenticated ? hrefs : device.value,
    toggleFavorite,
    isAuthenticated,
    ready: isAuthenticated ? ready : device.loaded,
  };
}
