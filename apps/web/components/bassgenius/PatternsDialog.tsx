"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CloseIcon } from "@/components/tools";
import { analyzeInsights, noteName, type Share, type Where } from "@/lib/bassInsights";
import { usePlayerTranscriptionRows } from "@/lib/useBassPlayers";

/**
 * "Patterns": what Bass Genius notices in a player's transcriptions — one transcription, or all of
 * a player's — from `analyzeInsights`: register and rhythm, what they land on at chord changes, how
 * they lead into new chords and across common progressions, their bar shapes (arpeggios, scale runs,
 * approaches), phrases they repeat, and bars that don't fit their written chord symbol.
 */
export default function PatternsDialog({
  playerId,
  playerName,
  transcriptionId,
  onClose,
}: {
  playerId: string;
  playerName: string;
  /** One transcription, or null for all of the player's. */
  transcriptionId: string | null;
  onClose: () => void;
}) {
  const rows = usePlayerTranscriptionRows(playerId, playerName);
  const picked = useMemo(() => rows?.filter((r) => !transcriptionId || r.id === transcriptionId).map((r) => r.data), [rows, transcriptionId]);
  const insights = useMemo(() => (picked ? analyzeInsights(picked) : null), [picked]);
  const title = transcriptionId ? (picked?.[0]?.title ?? "Transcription") : `All of ${playerName}'s transcriptions`;
  const single = !!transcriptionId;
  const at = (w?: Where) => (w ? (single ? `bar ${w.bar}` : `${w.title}, bar ${w.bar}`) : "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const totalMoves = insights ? insights.motion.steps + insights.motion.skips + insights.motion.leaps + insights.motion.repeats : 0;
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  // Portaled to <body>: inside the page it would sit under the sidebar (the page column is its own
  // stacking context).
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-overlay p-3 sm:p-8" onClick={onClose}>
      <div role="dialog" aria-label={`Patterns: ${title}`} className="w-full max-w-3xl rounded-xl ring-1 ring-foreground/[0.06] bg-background p-4 text-left shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">Patterns · {playerName}</p>
            <h2 className="truncate text-xl font-semibold tracking-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {!insights ? (
          <LoadingSpinner label="Reading the transcriptions…" showLabel />
        ) : insights.notes === 0 ? (
          <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">No notes to look at yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-foreground/[0.05] bg-foreground/10 sm:grid-cols-4">
              <Stat label="Bars" value={String(insights.bars)} />
              <Stat label="Notes" value={String(insights.notes)} />
              <Stat label="Range" value={insights.range ? `${noteName(insights.range.low)}–${noteName(insights.range.high)}` : "—"} />
              <Stat label="Usual register" value={insights.range ? `around ${noteName(insights.range.median)}` : "—"} />
            </div>

            <Card title="Rhythm" hint="How the notes are divided.">
              <Bars shares={insights.rhythm} at={at} />
            </Card>

            <Card title="Landing on a new chord" hint="What's played on the first beat of each chord, as a degree of that chord.">
              <Bars shares={insights.downbeats.slice(0, 8)} at={at} />
            </Card>

            <Card title="Beat by beat" hint="What kind of note lands on each beat of the bar.">
              <div className="grid gap-3 sm:grid-cols-2">
                {insights.beats.map((b) => (
                  <div key={b.beat}>
                    <p className="mb-1 text-xs font-medium text-muted">Beat {b.beat}</p>
                    <Bars shares={b.shares} at={at} compact />
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Getting into the next chord" hint="How the last note before a chord change leads to the change's first note.">
              <Bars shares={insights.approaches} at={at} />
            </Card>

            {insights.transitions.length > 0 && (
              <Card title="Across common changes" hint="For the chord changes that come up most: the usual way in, and the line across the bar line (degrees of each chord, | = the change).">
                <div className="flex flex-col gap-3">
                  {insights.transitions.map((t) => (
                    <div key={t.change} className="rounded-md bg-foreground/[0.05] p-3">
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{t.change}</p>
                        <span className="text-xs text-muted">{t.count}×</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Bars shares={t.approaches} at={at} compact />
                        <ul className="flex flex-col gap-1 text-sm">
                          {t.lines.map((l) => (
                            <li key={l.label} className="flex items-baseline justify-between gap-2">
                              <span className="font-mono">{l.label}</span>
                              <span className="text-xs text-muted">
                                {l.count}× · {at(l.example)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {insights.shapes.length > 0 && (
              <Card title="Shapes through a bar" hint="Bars of one chord with four notes, as degrees of the chord — arpeggios, scale runs and approach notes.">
                <div className="flex flex-col gap-3">
                  {insights.shapes.map((f) => (
                    <div key={f.family}>
                      <p className="mb-1 text-xs font-medium text-muted">
                        {f.family} · {f.bars} bar{f.bars === 1 ? "" : "s"}
                      </p>
                      <ul className="flex flex-col divide-y divide-foreground/10 rounded-md bg-foreground/[0.05]">
                        {f.items.map((s) => (
                          <li key={s.label} className="flex items-baseline gap-3 px-3 py-1.5 text-sm">
                            <span className="w-28 shrink-0 font-mono font-medium">{s.label}</span>
                            <span className="min-w-0 flex-1 truncate text-muted">{s.kind}</span>
                            <span className="shrink-0 text-xs text-muted">
                              {s.count}× · {at(s.example)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card title="Motion" hint="How the line moves from note to note.">
              <Bars
                shares={[
                  { label: "Steps (1–2 semitones)", count: insights.motion.steps, pct: pct(insights.motion.steps, totalMoves) },
                  { label: "Skips (a 3rd)", count: insights.motion.skips, pct: pct(insights.motion.skips, totalMoves) },
                  { label: "Leaps (a 4th or more)", count: insights.motion.leaps, pct: pct(insights.motion.leaps, totalMoves) },
                  { label: "Repeated notes", count: insights.motion.repeats, pct: pct(insights.motion.repeats, totalMoves) },
                ]}
                at={at}
              />
              <p className="mt-2 text-xs text-muted">
                Up {pct(insights.motion.up, insights.motion.up + insights.motion.down)}% of the time, down{" "}
                {pct(insights.motion.down, insights.motion.up + insights.motion.down)}%.
              </p>
            </Card>

            {insights.licks.length > 0 && (
              <Card title="Phrases that come back" hint="Five-note figures with the same intervals and rhythm, in any key.">
                <ul className="flex flex-col divide-y divide-foreground/10 rounded-md bg-foreground/[0.05]">
                  {insights.licks.map((l) => (
                    <li key={l.intervals + l.rhythm} className="px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium">{l.notes}</span>
                        <span className="text-xs text-muted">{l.count}×</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                        <span className="font-mono">{l.intervals}</span>
                        <span>{l.rhythm}</span>
                        <span>{l.examples.map((w) => at(w)).join(" · ")}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {insights.suspectBars.length > 0 && (
              <Card title="Bars that don't fit their chord symbol" hint="The line here doesn't sit on the written chord — often a chord symbol in the wrong bar. These patterns (and the bass's matching) read the chords as written.">
                <p className="text-sm">{groupBars(insights.suspectBars, single)}</p>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="truncate font-semibold">{value}</p>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-surface p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted">{hint}</p>
      {children}
    </section>
  );
}

function Bars({ shares, at, compact = false }: { shares: Share[]; at: (w?: Where) => string; compact?: boolean }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {shares.map((s) => (
        <li key={s.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">{s.label}</span>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {s.pct}%{!compact && s.example ? ` · e.g. ${at(s.example)}` : ""}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, s.pct)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "bars 14, 26, 41–48" (per transcription when there are several). */
function groupBars(list: Where[], single: boolean): string {
  const byTitle = new Map<string, number[]>();
  for (const w of list) byTitle.set(w.title, [...(byTitle.get(w.title) ?? []), w.bar]);
  return [...byTitle.entries()]
    .map(([title, bars]) => {
      const runs: string[] = [];
      for (let i = 0; i < bars.length; ) {
        let j = i;
        while (j + 1 < bars.length && bars[j + 1] === bars[j] + 1) j++;
        runs.push(i === j ? String(bars[i]) : `${bars[i]}–${bars[j]}`);
        i = j + 1;
      }
      return `${single ? "" : `${title}: `}bar${bars.length === 1 ? "" : "s"} ${runs.join(", ")}`;
    })
    .join(" · ");
}
