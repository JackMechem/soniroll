import { sortByText } from '@jam-practice/core/sortText';
import type { Tune } from '@jam-practice/core/types';
import { useCallback } from 'react';

import { useDeviceSettings } from '@/lib/useDeviceSettings';

export type TuneOrder = 'new' | 'name';
export const TUNE_ORDERS: { value: TuneOrder; label: string }[] = [
  { value: 'new', label: 'Recent' },
  { value: 'name', label: 'A–Z' },
];

const KEY = 'jam-practice-library-tune-order';
const DEFAULTS: { order: TuneOrder } = { order: 'new' };

/** The order tunes are listed in on the Tunes tab and each list's See all page (newest added first,
    or A–Z), remembered on this phone. Returns `[order, setOrder, ordered(tunes)]`. */
export function useTuneOrder(): [TuneOrder, (order: TuneOrder) => void, (tunes: Tune[]) => Tune[]] {
  const [{ order }, update] = useDeviceSettings(KEY, DEFAULTS);
  // A list's newest tunes are at its end.
  const ordered = useCallback((tunes: Tune[]) => (order === 'name' ? sortByText(tunes, (t) => t.name) : [...tunes].reverse()), [order]);
  return [order, (next) => update({ order: next }), ordered];
}
