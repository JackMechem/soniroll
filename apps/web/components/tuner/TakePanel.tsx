"use client";

import { useMemo } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CloseIcon, PauseIcon, PlayIcon } from "@/components/tools";
import PitchGraph, { ZOOMS, formatClock } from "@/components/tuner/PitchGraph";
import type { OpenTake } from "@/components/tuner/useTakePlayback";
import { notesOf, summarise } from "@/lib/pitchTrack";
import { formatRecordedAt } from "@/lib/recordings";

/** The take open in the Tuner: play it through the needle, and its pitch over time underneath. */
export default function TakePanel({
  open,
  name,
  pos,
  playing,
  zoom,
  onZoom,
  refA,
  minRms,
  transpose,
  onToggle,
  onSeek,
  onClose,
}: {
  open: OpenTake;
  /** Its current name (it may have been renamed since it was opened). */
  name: string;
  pos: number;
  playing: boolean;
  zoom: number;
  onZoom: (zoom: number) => void;
  refA: number;
  minRms: number;
  transpose: number;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onClose: () => void;
}) {
  const { track, duration, error, take } = open;
  const notes = useMemo(() => (track ? notesOf(track, refA, minRms) : []), [track, refA, minRms]);
  const summary = summarise(notes);
  const analysing = !!track && track.done < track.freq.length;
  const progress = track && track.freq.length ? Math.round((track.done / track.freq.length) * 100) : 0;
  // Zoom levels that change what's shown: nothing wider than the whole take.
  const shown = Math.min(zoom, duration ?? zoom);
  const zoomIn = [...ZOOMS].reverse().find((z) => z < shown);
  const zoomOut = zoom < (duration ?? 0) ? ZOOMS.find((z) => z > zoom) : undefined;
  const source = take.meta.source === "file" ? "Opened file" : take.meta.source === "recording" ? "From your recordings" : "Recorded here";

  return (
    <section aria-label={`Take: ${name}`} className="flex w-full flex-col gap-3 rounded-lg bg-surface p-3 text-left sm:p-4 xl:w-[44rem]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{name}</h2>
          <p className="text-xs text-muted">
            {source} · {formatRecordedAt(take.added)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the take and go back to listening"
          title="Close the take"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : duration === null ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner label="Opening the take" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggle}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
            >
              {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
            </button>
            <span className="text-sm tabular-nums">
              {formatClock(pos, true)} <span className="text-muted">/ {formatClock(duration, true)}</span>
            </span>
            <div className="ml-auto flex items-center gap-1" role="group" aria-label="Zoom">
              <button
                type="button"
                onClick={() => zoomOut !== undefined && onZoom(zoomOut)}
                disabled={zoomOut === undefined}
                aria-label="Zoom out"
                className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground/[0.05] text-lg leading-none transition-colors hover:bg-surface-hover disabled:opacity-40"
              >
                −
              </button>
              <span className="w-9 text-center text-xs tabular-nums text-muted">{zoom >= duration ? "All" : `${zoom} s`}</span>
              <button
                type="button"
                onClick={() => zoomIn !== undefined && onZoom(zoomIn)}
                disabled={zoomIn === undefined}
                aria-label="Zoom in"
                className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground/[0.05] text-lg leading-none transition-colors hover:bg-surface-hover disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          <PitchGraph
            track={track}
            notes={notes}
            duration={duration}
            pos={pos}
            zoom={zoom}
            refA={refA}
            minRms={minRms}
            transpose={transpose}
            onSeek={onSeek}
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-live="polite">
            {analysing || !track ? (
              <div className="flex items-center gap-2">
                <LoadingSpinner size="sm" inline label="Reading the pitch" />
                Reading the pitch… {progress}%
              </div>
            ) : summary.notes === 0 ? (
              <span>No clear notes in this take.</span>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {summary.notes} note{summary.notes === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--tune-in)" }} aria-hidden />
                  {summary.inTune} in tune
                </span>
                <span>{summary.sharp} sharp ♯</span>
                <span>{summary.flat} flat ♭</span>
                <span>
                  Average {summary.average >= 0.5 ? "+" : summary.average <= -0.5 ? "−" : ""}
                  {Math.abs(Math.round(summary.average))} cents
                </span>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
