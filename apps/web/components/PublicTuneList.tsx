"use client";

import { useMemo } from "react";
import { BookIcon, CheckIcon, PlusIcon } from "@/components/tools";
import { PublicTune } from "@/lib/profileTunes";
import { nameId } from "@/lib/standards";
import { Tune, makeId } from "@/lib/types";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";

function chip(enabled: boolean): string {
  return `rounded-md px-2.5 py-1 text-xs font-medium tabular-nums ${
    enabled ? "bg-foreground/[0.05] text-foreground" : "border border-dashed border-foreground/15 text-muted line-through"
  }`;
}

/** Turns a `PublicTune` (someone else's data, as returned by `getPublicByUsername`) into a fresh,
    independent `Tune` for the viewer's own list — new ids throughout, never sharing an id with the
    original or with anything already in the target list, since from here on it's the viewer's own
    tune to edit or delete freely. `notes` is always empty: a public profile never exposes it in
    the first place (see `lib/profileTunes.ts`), so there's nothing to copy. */
export function toOwnTune(source: PublicTune): Tune {
  return {
    id: makeId(),
    name: source.name,
    tempos: source.tempos.map((t) => ({ id: makeId(), value: t.value, enabled: t.enabled })),
    keys: source.keys.map((k) => ({ id: makeId(), value: k.value, enabled: k.enabled })),
    timeSignature: source.timeSignature,
    notes: "",
  };
}

/** A read-only tune list styled like Jam Practice's own tune rows (`TunesTab.tsx`/`TunesPanel.tsx`
    — name, time signature, tempo/key chips), used to render a public profile's "Tunes" and "Tunes
    to Learn" sections (`PublicProfilePage.tsx`). The same component serves both sections — which
    list a tune is shown *under* doesn't change what a viewer can do with it. `canAdd` (true only
    for a signed-in viewer looking at someone *else's* profile) shows two per-row actions, each
    copying that row into one of the *viewer's own* lists (`toOwnTune` above) — "Add" into their
    own tunes, "Learn" into their own Tunes to Learn — disabled once a tune with the same name is
    already in that target list (matched the same name-insensitive way the jazz-standards picker
    already checks for a tune you already have, `lib/standards.ts`'s `nameId`). */
export default function PublicTuneList({
  tunes,
  canAdd,
}: {
  tunes: PublicTune[];
  canAdd: boolean;
}) {
  const [myTunes, setMyTunes] = useSyncedTunes();
  const [tunesToLearn, setTunesToLearn] = useTunesToLearn();

  const haveAsTune = useMemo(() => new Set(myTunes.map((t) => nameId(t.name))), [myTunes]);
  const haveAsLearn = useMemo(
    () => new Set(tunesToLearn.map((t) => nameId(t.name))),
    [tunesToLearn],
  );

  return (
    <ul className="flex flex-col gap-2">
      {tunes.map((tune) => {
        const inMyTunes = haveAsTune.has(nameId(tune.name));
        const inTunesToLearn = haveAsLearn.has(nameId(tune.name));
        return (
          <li key={tune.id} className="flex flex-col gap-2.5 rounded-md bg-foreground/[0.05] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">{tune.name}</p>
                <p className="mt-0.5 text-xs tabular-nums text-muted">{tune.timeSignature}</p>
              </div>
              {canAdd && (
                <div className="-mr-1 -mt-1 flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setMyTunes((prev) => [...prev, toOwnTune(tune)])}
                    disabled={inMyTunes}
                    title="Add to my tunes"
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
                  >
                    {inMyTunes ? (
                      <CheckIcon className="h-3.5 w-3.5" />
                    ) : (
                      <PlusIcon className="h-3.5 w-3.5" />
                    )}
                    {inMyTunes ? "Added" : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTunesToLearn((prev) => [...prev, toOwnTune(tune)])}
                    disabled={inTunesToLearn}
                    title="Add to my Tunes to Learn list"
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
                  >
                    {inTunesToLearn ? (
                      <CheckIcon className="h-3.5 w-3.5" />
                    ) : (
                      <BookIcon className="h-3.5 w-3.5" />
                    )}
                    {inTunesToLearn ? "Learning" : "Learn"}
                  </button>
                </div>
              )}
            </div>
            {tune.tempos.length + tune.keys.length === 0 ? (
              <p className="text-xs text-muted">No tempos or keys</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tune.tempos.map((t) => (
                  <span key={t.id} className={chip(t.enabled)}>
                    {t.value} <span className="text-[0.65rem] opacity-70">BPM</span>
                  </span>
                ))}
                {tune.keys.map((k) => (
                  <span key={k.id} className={chip(k.enabled)}>
                    {k.value}
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
