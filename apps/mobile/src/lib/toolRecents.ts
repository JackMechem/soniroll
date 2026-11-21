import AsyncStorage from '@react-native-async-storage/async-storage';
import { NAV_LINKS_DATA, hrefToSlug } from '@jam-practice/core/navLinks';
import { usePathname } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import { currentStoreMode, onStoreModeChange, scopedKey, useStoreMode } from './accountScope';

/** The tools opened most recently on this device (their nav hrefs, newest first) — Home's
    "Jump back in" row. Device-local, like the chart/tune recents (`chordChartRecents.ts`), and kept
    apart per sign-in like every store here (`accountScope.ts`): signed in, the account's list
    (`…:account`, gone on sign-out), so the next person to sign in doesn't see what you opened. */
const KEY = 'jam-practice-tool-recents';
const MAX = 8;

let value: string[] = [];
let loaded = false;
let generation = 0;
const listeners = new Set<() => void>();

function set(next: string[]) {
  value = next;
  for (const l of listeners) l();
  if (currentStoreMode() !== 'loading') AsyncStorage.setItem(scopedKey(KEY), JSON.stringify(next)).catch(() => {});
}

onStoreModeChange(() => {
  generation++;
  value = [];
  loaded = false;
  for (const l of listeners) l();
  load();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function load() {
  if (loaded || currentStoreMode() === 'loading') return;
  loaded = true;
  const gen = generation;
  AsyncStorage.getItem(scopedKey(KEY))
    .then((raw) => {
      if (gen !== generation) return;
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        set([...value, ...parsed.filter((x): x is string => typeof x === 'string' && !value.includes(x))].slice(0, MAX));
      }
    })
    .catch(() => {});
}

const SLUG_TO_HREF = new Map(NAV_LINKS_DATA.map((l) => [hrefToSlug(l.href), l.href]));

/** Mounted once (in `_layout.tsx`): notes every tool screen (`/tool/<slug>`) that's opened. */
export function useRecordToolVisits() {
  const pathname = usePathname();
  useStoreMode();
  useEffect(() => {
    load();
    const m = /^\/tool\/([^/]+)$/.exec(pathname);
    const href = m ? SLUG_TO_HREF.get(m[1]) : undefined;
    if (href) set([href, ...value.filter((h) => h !== href)].slice(0, MAX));
  }, [pathname]);
}

/** Recently opened tools' hrefs, newest first. */
export function useRecentTools(): string[] {
  useStoreMode();
  useEffect(load, []);
  return useSyncExternalStore(subscribe, () => value);
}
