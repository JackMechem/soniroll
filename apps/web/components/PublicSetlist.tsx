"use client";

import Link from "next/link";
import { useState } from "react";
import { setlistHref } from "@/components/library/setlistParts";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ChordChartIcon, DownloadIcon, PencilIcon, SlidesIcon } from "@/components/tools";
import type { PublicTune } from "@/lib/profileTunes";
import { useSaveSetlist } from "@/lib/useSaveSetlist";
import { setlistKey } from "@jam-practice/core/setlistKeys";

/**
 * Someone's setlist as a reader sees it — on a setlist post and on a shared link. Two actions up
 * top: **View all charts** (`/setlist-charts`, one chart per page) and **Save as my setlist** (a
 * copy that's yours from then on, charts included — `useSaveSetlist`); then the tunes in order,
 * each opening the reader at that tune. Your own setlist shows **Edit setlist** instead of Save,
 * since what's shown here *is* your setlist (it updates as you change it).
 */
export default function PublicSetlist({
  title,
  tunes,
  isMine,
  ownSetlistId,
  chartsParam,
}: {
  title: string;
  tunes: PublicTune[];
  isMine: boolean;
  ownSetlistId?: string | null;
  /** Which setlist the chart reader opens: `post=<id>` or `shared=<id>`. */
  chartsParam: string;
}) {
  const save = useSaveSetlist();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const chartCount = tunes.filter((t) => t.linkedChart).length;
  const chartsHref = (start = 0) => `/setlist-charts?${chartsParam}&start=${start}`;

  async function doSave() {
    setSaving(true);
    try {
      setSavedId(await save(title, tunes));
    } finally {
      setSaving(false);
    }
  }

  const secondary = "flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface py-2.5 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Link href={chartsHref()} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-accent-foreground hover:bg-accent-hover">
          <SlidesIcon className="h-4 w-4" />
          View all charts
        </Link>
        {isMine ? (
          ownSetlistId ? (
            <Link href={setlistHref(ownSetlistId)} className={secondary}>
              <PencilIcon className="h-4 w-4" />
              Edit setlist
            </Link>
          ) : null
        ) : savedId ? (
          <Link href={setlistHref(savedId)} className={secondary}>
            <DownloadIcon className="h-4 w-4" />
            Saved — open it
          </Link>
        ) : (
          <button type="button" onClick={() => void doSave()} disabled={saving} className={secondary}>
            {saving ? <LoadingSpinner size="sm" /> : <DownloadIcon className="h-4 w-4" />}
            {saving ? "Saving…" : "Save as my setlist"}
          </button>
        )}
      </div>
      {!isMine && !savedId && chartCount > 0 && (
        <p className="text-xs text-muted">
          Saving copies the {chartCount} chart{chartCount === 1 ? "" : "s"} into a &ldquo;{title}&rdquo; playlist and adds any tunes you don&apos;t have.
        </p>
      )}

      <ol className="overflow-hidden rounded-lg bg-surface">
        {tunes.map((t, i) => {
          const tempo = t.setTempo ?? t.tempos.find((x) => x.enabled)?.value;
          const detail = [
            setlistKey({ overrideRoot: t.setKey, chartKey: t.linkedChart?.key, tuneKeys: t.keys.filter((k) => k.enabled).map((k) => k.value) }),
            tempo ? `${tempo} BPM` : null,
            t.timeSignature || null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={`${t.id}-${i}`} className={i ? "border-t border-foreground/10" : ""}>
              <Link href={chartsHref(i)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover">
                <span className="w-6 text-right text-sm tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted">{detail}</span>
                </span>
                {t.linkedChart && <ChordChartIcon className="h-4 w-4 shrink-0 text-muted" />}
              </Link>
              {/* The owner's recordings of this tune — playable by anyone the setlist is shared with. */}
              {t.recordings && t.recordings.length > 0 && (
                <ul className="flex flex-col gap-2 px-3 pb-3 pl-12">
                  {t.recordings.map((r) => (
                    <li key={r.id} className="flex flex-col gap-1 rounded-md bg-foreground/[0.05] p-2">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      {r.url && <audio controls preload="none" src={r.url} className="h-9 w-full" />}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
