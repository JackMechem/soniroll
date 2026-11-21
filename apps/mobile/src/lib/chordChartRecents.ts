import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { currentStoreMode, onStoreModeChange, scopedKey, useStoreMode } from './accountScope';

/** The last few chord charts *and tunes* opened on this device, in one history — the Library's
    "Recently opened" row shows both, the Chord Charts screen's "Recent" section just the charts
    (in practice: tonight's set list). Stored as one list of strings: a chart is its plain id (the
    original format, so history saved before tunes were added still reads correctly), a tune is
    `t:<id>`. A tiny module-level store rather than `useDeviceSettings`,
    since it's written from one screen (the chart viewer) and read from another (the library
    list), and `useDeviceSettings` keeps a separate copy per mounted hook. Device-local on purpose:
    what you just played on this phone — and kept apart per sign-in like every store here
    (`accountScope.ts`), so another account signing in doesn't see yours. */
const KEY = 'jam-practice-chord-charts-recent';
const MAX = 16;
const CHART_MAX = 8;
const TUNE_PREFIX = 't:';

export type RecentItem = { kind: 'chart' | 'tune'; id: string };

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
  if (listeners.size) load();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function record(entry: string) {
  set([entry, ...value.filter((r) => r !== entry)].slice(0, MAX));
}

function forget(entry: string) {
  if (value.includes(entry)) set(value.filter((r) => r !== entry));
}

export const recordRecentChart = (id: string) => record(id);
export const forgetRecentChart = (id: string) => forget(id);
export const recordRecentTune = (id: string) => record(TUNE_PREFIX + id);
export const forgetRecentTune = (id: string) => forget(TUNE_PREFIX + id);

function toItem(entry: string): RecentItem {
  return entry.startsWith(TUNE_PREFIX) ? { kind: 'tune', id: entry.slice(TUNE_PREFIX.length) } : { kind: 'chart', id: entry };
}

// Derived lists are cached per underlying array so `useSyncExternalStore` gets a stable snapshot.
let derivedFor: string[] | null = null;
let chartIds: string[] = [];
let items: RecentItem[] = [];
function derive() {
  if (derivedFor !== value) {
    derivedFor = value;
    items = value.map(toItem);
    chartIds = items.filter((i) => i.kind === 'chart').map((i) => i.id).slice(0, CHART_MAX);
  }
}

/** Charts only, most recent first. */
export function useRecentCharts(): string[] {
  useRecentLoad();
  return useSyncExternalStore(subscribe, () => {
    derive();
    return chartIds;
  });
}

/** Charts and tunes together, most recent first. */
export function useRecentItems(): RecentItem[] {
  useRecentLoad();
  return useSyncExternalStore(subscribe, () => {
    derive();
    return items;
  });
}

function load() {
  if (loaded || currentStoreMode() === 'loading') return;
  loaded = true;
  const gen = generation;
  AsyncStorage.getItem(scopedKey(KEY))
    .then((raw) => {
      if (gen !== generation) return;
      const parsed = raw ? JSON.parse(raw) : null;
      // A chart opened before storage finished loading stays at the front.
      if (Array.isArray(parsed)) {
        set([...value, ...parsed.filter((x): x is string => typeof x === 'string' && !value.includes(x))].slice(0, MAX));
      }
    })
    .catch(() => {});
}

function useRecentLoad() {
  const mode = useStoreMode();
  useEffect(() => {
    if (mode === currentStoreMode()) load();
  }, [mode]);
}
