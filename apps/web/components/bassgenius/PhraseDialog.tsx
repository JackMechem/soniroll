"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import TranscriptionScore from "@/components/notation/Score";
import { CloseIcon } from "@/components/tools";
import type { BassPhrase } from "@/lib/bassLine";
import { noteName } from "@/lib/bassInsights";
import type { Transcription } from "@/lib/bassTranscription";
import { prettyQuality } from "@/lib/iRealPro";

const noop = () => {};
const INTERVALS = ["the same key", "up a half step", "up a whole step", "up a minor 3rd", "up a major 3rd", "up a 4th", "up a tritone", "down a 4th", "down a major 3rd", "down a minor 3rd", "down a whole step", "down a half step"];

/**
 * How one phrase of a modelled player's chorus was made: where it came from in their
 * transcriptions (a snippet, in its own key), the chart's chords against theirs bar by bar, the key
 * and octave it was moved to, how well their notes fit these changes, and anything adjusted — or,
 * for a Computer phrase, why nothing of theirs was used. Then the phrase as it's played here.
 */
export default function PhraseDialog({
  phrase,
  previous,
  bars,
  playerName,
  median,
  source,
  played,
  onClose,
}: {
  phrase: BassPhrase;
  /** The phrase before it in the chorus, to tell whether the line carries straight on. */
  previous: BassPhrase | null;
  /** The phrase's bars in the chorus (1-based). */
  bars: { from: number; to: number };
  playerName: string;
  /** The player's usual register (MIDI). */
  median: number;
  /** The transcription it came from, if any. */
  source: Transcription | null;
  /** The phrase as played, as a transcription (the chorus's bars it covers). */
  played: Transcription | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const src = phrase.source;
  const barsLabel = bars.from === bars.to ? `Bar ${bars.from}` : `Bars ${bars.from}–${bars.to}`;
  let snippet: Transcription | null = null;
  let srcBars = { from: 0, to: 0 };
  if (src && source) {
    const m0 = Math.floor(src.startBeat / 4);
    const m1 = Math.ceil((src.startBeat + phrase.length) / 4);
    srcBars = { from: m0 + 1, to: m1 };
    snippet = { ...source, measures: source.measures.slice(m0, m1) };
  }
  const carriesOn =
    !!src && !!previous?.source && previous.source.transcription === src.transcription && previous.source.startBeat + previous.length === src.startBeat && previous.source.shift === src.shift;
  const chartBars = phrase.chartChords.split(" | ");
  const srcChordBars = src ? src.sourceChords.split(" | ") : [];

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-overlay p-3 sm:p-8" onClick={onClose}>
      <div role="dialog" aria-label={`How ${barsLabel.toLowerCase()} were made`} className="w-full max-w-3xl rounded-xl ring-1 ring-foreground/[0.06] bg-background p-4 text-left shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">{barsLabel} · how it was made</p>
            <h2 className="text-xl font-semibold tracking-tight">
              {src
                ? `From ${src.title}, ${srcBars.from === srcBars.to ? `bar ${srcBars.from}` : `bars ${srcBars.from}–${srcBars.to}`}`
                : phrase.learned
                  ? `Written new, in ${phrase.learned.player}'s style`
                  : "Walked by the Computer"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg bg-surface p-4">
            <h3 className="mb-2 text-sm font-semibold">Why this</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {src ? (
                <>
                  <li>
                    {carriesOn
                      ? `${playerName}'s line carries straight on from the phrase before — the same passage of ${src.title}, unbroken.`
                      : `The best fit for these changes in ${playerName}'s transcriptions. Jumping to a new spot costs more than carrying on, so a new passage is only used when it fits clearly better.`}
                  </li>
                  <li>
                    {Math.round(src.fit * 100)}% of {playerName}&apos;s notes here are chord tones, scale tones or passing notes of this chart&apos;s chords
                    {src.fit < 0.8 ? " — a looser fit, kept because the line carries on." : "."}
                  </li>
                  <li>
                    {src.shift ? `Moved ${INTERVALS[src.shift]} to the chart's key` : "In the same key as written"}
                    {src.octave
                      ? `, ${Math.abs(src.octave) === 1 ? "an octave" : `${Math.abs(src.octave)} octaves`} ${src.octave > 0 ? "higher" : "lower"} — to join the line before and stay near ${playerName}'s usual register (around ${noteName(median)})`
                      : ", in the octave it was written"}
                    .
                  </li>
                  {src.refitted > 0 && (
                    <li>
                      {src.refitted} note{src.refitted === 1 ? " was" : "s were"} moved to the matching chord tone where this chart&apos;s chord quality differs from{" "}
                      {playerName}&apos;s (or onto a slash chord&apos;s bass).
                    </li>
                  )}
                  {src.folded > 0 && (
                    <li>
                      {src.folded} note{src.folded === 1 ? " was" : "s were"} moved an octave to stay in the bass&apos;s range.
                    </li>
                  )}
                </>
              ) : phrase.learned ? (
                phrase.learned.points.map((pt) => <li key={pt}>{pt}</li>)
              ) : (
                <li>
                  Nothing in {playerName}&apos;s transcriptions fitted these changes well enough here, so the Computer walked it — roots on the downbeats, chord
                  and scale tones, approach notes — in {playerName}&apos;s register (around {noteName(median)}).
                </li>
              )}
              {phrase.leadIn && <li>Its last note was changed into a half-step lead-in to the next phrase, which starts somewhere else.</li>}
            </ul>
          </section>

          <section className="rounded-lg bg-surface p-4">
            <h3 className="mb-2 text-sm font-semibold">Chords</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <th className="w-28 py-1 pr-3 text-left text-xs font-medium text-muted">This chart</th>
                    {chartBars.map((b, i) => (
                      <td key={i} className="border-l border-foreground/10 px-2 py-1 font-medium">
                        {pretty(b)}
                      </td>
                    ))}
                  </tr>
                  {src && (
                    <tr>
                      <th className="py-1 pr-3 text-left text-xs font-medium text-muted">
                        {playerName}&apos;s chords{src.shift ? " (as written)" : ""}
                      </th>
                      {chartBars.map((_, i) => (
                        <td key={i} className="border-l border-foreground/10 px-2 py-1 text-muted">
                          {pretty(srcChordBars[i] ?? "")}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {src && <p className="mt-2 text-xs text-muted">Chord symbols in transcriptions are often loose; the match leans on what the notes actually outline.</p>}
          </section>

          {snippet && (
            <section className="rounded-lg bg-surface p-3 sm:p-4">
              <h3 className="mb-1 px-1 text-sm font-semibold">
                In {src!.title} <span className="text-sm font-normal text-muted">(as written{src!.shift ? `, before moving ${INTERVALS[src!.shift]}` : ""})</span>
              </h3>
              <TranscriptionScore transcription={snippet} firstBar={srcBars.from} cursor={null} playing={null} mode="select" onSelect={noop} onAdd={noop} onReplace={noop} onChordClick={noop} />
            </section>
          )}

          {played && (
            <section className="rounded-lg bg-surface p-3 sm:p-4">
              <h3 className="mb-1 px-1 text-sm font-semibold">As played here</h3>
              <TranscriptionScore transcription={played} firstBar={bars.from} cursor={null} playing={null} mode="select" onSelect={noop} onAdd={noop} onReplace={noop} onChordClick={noop} />
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** "Bb6 G-7" with each symbol's quality prettified. */
function pretty(bar: string): string {
  return bar
    .split(" ")
    .map((sym) => {
      const m = /^([A-G][b#]?)(.*)$/.exec(sym);
      return m ? m[1].replace("b", "♭").replace("#", "♯") + prettyQuality(m[2]) : sym;
    })
    .join("  ");
}
