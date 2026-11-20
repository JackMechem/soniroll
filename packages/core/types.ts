export type Tempo = {
  id: string;
  value: number;
  enabled: boolean;
};

export type Key = {
  id: string;
  value: string;
  enabled: boolean;
};

export type Tune = {
  id: string;
  name: string;
  tempos: Tempo[];
  keys: Key[];
  timeSignature: string;
  notes: string;
  /** The id of one of this tune's *owner's own* `chordChartSongs` rows, if they've linked one —
      added for mobile's "link a chord chart to a tune" feature. Deliberately optional, with no
      Convex schema change behind it: a `Tune` round-trips as one opaque JSON blob inside
      `syncedSettings.value` (see `lib/useSyncedTunes.ts`), never validated field-by-field by
      Convex itself, so an old tune (or one saved from the web app, which doesn't set this field)
      simply doesn't have it — nothing to migrate, nothing that can break existing data. Only
      meaningful to the tune's own owner directly (it's a private library reference); a *public*
      view of a tune (`PublicTune` below) instead carries a fully-resolved `linkedChart` snapshot,
      not this raw id, so a viewer who doesn't own the referenced chart can still see it. */
  chordChartId?: string;
  /** Every chart linked to the tune, main (`chordChartId`) first — only stored when there are two
      or more, so a big library stays small. Read with `tuneChartIds` and write with `withChartIds`
      (`tuneLibrary.ts`), never directly. */
  chordChartIds?: string[];
  /** The tune's tags (any number), for filtering in the Library. */
  tags?: string[];
};

export const DEFAULT_TIME_SIGNATURE = "4/4";

export function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
