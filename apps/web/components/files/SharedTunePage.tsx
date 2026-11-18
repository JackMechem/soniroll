"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useMemo, useState } from "react";
import ChordChart from "@/components/ChordChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import { FilePreviewDialog, FileRow, fileDetail, type PreviewFile } from "@/components/files/FileParts";
import { ChartPaper } from "@/components/library/chartView";
import { Chip, KeyBadge } from "@/components/library/ui";
import { toOwnTune } from "@/components/PublicTuneList";
import { CheckIcon, ChordChartIcon, DownloadIcon, FileIcon, MicIcon } from "@/components/tools";
import { errorText, filesApi } from "@/lib/files";
import { KEY_NAMES, keyPitchClass, transposeSong, type IRealSong } from "@/lib/iRealPro";
import { SIGN_IN_PATH } from "@/lib/landing";
import { formatDuration } from "@/lib/recordings";
import { nameId } from "@/lib/standards";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { displayKey } from "@jam-practice/core/setlistKeys";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";
import { useDeviceCopy } from "@/lib/storageMove";

/**
 * A tune someone shared by link (`/tune/<id>`) — open to anyone, signed in or not. The tune as it
 * is now: its keys, tempos and time signature, its chord chart (transposable), the files attached
 * to it (open in place or download) and its recordings. **Save to my tunes** adds it to Tunes I
 * Know (or uses yours if you already have a tune with that name), imports the chart into a "Shared
 * with me" playlist, and — signed in — copies the files into your account.
 */
export default function SharedTunePage({ id }: { id: string }) {
  const shared = useQuery(filesApi.getSharedTune, { id });
  const [previewKey, setPreviewKey] = useState("");
  const [open, setOpen] = useState<PreviewFile | null>(null);

  const chart = (shared?.tune.linkedChart ?? null) as IRealSong | null;
  const shownChart = useMemo(() => {
    if (!chart || !previewKey) return chart;
    const semis = (KEY_NAMES.indexOf(previewKey) - keyPitchClass(chart.key) + 12) % 12;
    return semis ? transposeSong(chart, semis) : chart;
  }, [chart, previewKey]);

  if (shared === undefined) {
    return (
      <Shell>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </Shell>
    );
  }
  if (shared === null) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <h1 className="text-xl font-semibold">This tune isn&apos;t available</h1>
          <p className="text-sm text-muted">It isn&apos;t shared anymore, or the link is wrong.</p>
        </div>
      </Shell>
    );
  }

  const { tune, files, recordings } = shared;
  const firstKey = tune.keys.find((k) => k.enabled)?.value ?? chart?.key ?? null;

  return (
    <Shell>
      <header className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-muted">
          Tune
          {shared.ownerUsername && (
            <>
              {" · shared by "}
              <Link href={`/u/${shared.ownerUsername}`} className="text-accent hover:underline">
                @{shared.ownerUsername}
              </Link>
            </>
          )}
        </p>
        <div className="flex items-center gap-4">
          <KeyBadge label={firstKey} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-2xl font-semibold tracking-tight">{tune.name}</h1>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tune.timeSignature && <Chip>{tune.timeSignature}</Chip>}
              {tune.tempos.filter((t) => t.enabled).map((t) => (
                <Chip key={t.id}>{t.value} BPM</Chip>
              ))}
              {tune.keys.length > 0 && <Chip>Keys: {tune.keys.map((k) => displayKey(k.value)).join(", ")}</Chip>}
            </div>
          </div>
        </div>
        {shared.isMine ? (
          <Link href={`/tunes/tune?id=${encodeURIComponent(shared.ownTuneId ?? "")}`} className="self-start rounded-md bg-foreground/[0.05] px-3 py-2 text-sm font-medium hover:bg-surface-hover">
            This is your tune — open it
          </Link>
        ) : (
          <SaveTune shareId={shared.id} tune={tune} chart={chart} files={files} />
        )}
      </header>

      {shownChart && (
      <ChartPaper
        top={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <ChordChartIcon className="h-4 w-4 text-muted" />
              Chord chart
            </h2>
            {chart && (
              <Select
                value={previewKey}
                onChange={setPreviewKey}
                options={[{ value: "", label: `Original (${chart.key || "—"})` }, ...KEY_NAMES.map((k) => ({ value: k, label: k }))]}
                className="min-w-32"
              />
            )}
          </div>
        }
      >
        <ChordChart song={shownChart} hideHeader />
      </ChartPaper>
      )}

      {files.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <FileIcon className="h-4 w-4 text-muted" /> Files <span className="text-xs tabular-nums text-muted">{files.length}</span>
          </h2>
          <div className="flex flex-col">
            {files.map((f) => (
              <FileRow
                key={f.id}
                name={f.name}
                mimeType={f.mimeType}
                detail={fileDetail(f)}
                onOpen={() => setOpen(f)}
                trailing={
                  f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.name} aria-label={`Download ${f.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
                      <DownloadIcon className="h-4 w-4" />
                    </a>
                  ) : null
                }
              />
            ))}
          </div>
        </section>
      )}

      {recordings.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <MicIcon className="h-4 w-4 text-muted" /> Recordings <span className="text-xs tabular-nums text-muted">{recordings.length}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {recordings.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 rounded-md bg-foreground/[0.05] p-2.5">
                <span className="truncate text-sm font-medium">
                  {r.name} <span className="font-normal text-muted">· {formatDuration(r.durationSec)}</span>
                </span>
                {r.url && <audio controls preload="none" src={r.url} className="h-9 w-full" />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && <FilePreviewDialog file={open} onClose={() => setOpen(null)} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-8">{children}</main>;
}

type SharedTune = NonNullable<FunctionReturnType<typeof filesApi.getSharedTune>>["tune"];

/** "Save to my tunes": the tune (or yours of the same name), its chart, and — signed in — its files. */
function SaveTune({ shareId, tune, chart, files }: { shareId: string; tune: SharedTune; chart: IRealSong | null; files: { url: string | null; name: string; mimeType: string }[] }) {
  const fileCount = files.length;
  const { isAuthenticated } = useConvexAuth();
  const [myTunes, setMyTunes] = useSyncedTunes();
  const [learn] = useTunesToLearn();
  const { importSongs } = useChordChartsLibrary(null);
  const copyFiles = useAction(filesApi.copySharedFiles);
  // Free accounts keep the files on this device; a plan copies them online.
  const { toDevice, copyToDevice } = useDeviceCopy();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ tuneId: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const existing: Tune | undefined = [...myTunes, ...learn].find((t) => nameId(t.name) === nameId(tune.name));
      const target = existing ?? toOwnTune(tune);
      let chartId: string | undefined;
      if (chart && !target.chordChartId) {
        try {
          chartId = (await importSongs([chart], "Shared with me")).ids[0] ?? undefined;
        } catch {
          // The tune still saves without its chart.
        }
      }
      const linked = chartId ? { ...target, chordChartId: chartId } : target;
      if (!existing) setMyTunes((prev) => [...prev, linked]);
      else if (chartId) setMyTunes((prev) => prev.map((t) => (t.id === existing.id ? linked : t)));

      const notes: string[] = [existing ? `Added to your "${existing.name}"` : "Added to Tunes I Know"];
      if (chartId) notes.push("chart in “Shared with me”");
      if (fileCount && isAuthenticated) {
        let copied = 0;
        let skipped = 0;
        if (toDevice) {
          for (const f of files) {
            try {
              await copyToDevice(f, target.id);
              copied += 1;
            } catch {
              skipped += 1;
            }
          }
        } else ({ copied, skipped } = await copyFiles({ shareId, tuneId: target.id }));
        if (copied) notes.push(`${copied} file${copied === 1 ? "" : "s"} copied`);
        if (skipped) notes.push(toDevice ? `${skipped} couldn't be saved` : `${skipped} didn't fit in your storage`);
      }
      setSaved({ tuneId: target.id, note: notes.join(" · ") });
    } catch (e) {
      setError(errorText(e, "Couldn't save the tune."));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/tunes/tune?id=${encodeURIComponent(saved.tuneId)}`} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
          <CheckIcon className="h-4 w-4" /> Saved — open it
        </Link>
        <span className="text-sm text-muted">{saved.note}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? <LoadingSpinner size="sm" inline label="Saving" /> : <DownloadIcon className="h-4 w-4" />}
          {saving ? "Saving…" : "Save to my tunes"}
        </button>
        {fileCount > 0 && !isAuthenticated && (
          <span className="text-sm text-muted">
            <Link href={SIGN_IN_PATH} className="font-medium text-accent hover:underline">
              Sign in
            </Link>{" "}
            to copy its files too.
          </span>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
