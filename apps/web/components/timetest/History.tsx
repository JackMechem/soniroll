"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SUB_LABELS } from "@/components/metronome/MetronomeOptions";
import { STATUS_COLOR, signedMs, type TakeSummary } from "@/lib/timeTest/timing";

// The history's shape is shared with the app (`@jam-practice/core/timeTestTiming`).
export type { TakeSummary } from "@/lib/timeTest/timing";
export { HISTORY_LIMIT } from "@/lib/timeTest/timing";

/** Past takes, newest first, with a strip of recent scores. */
export default function History({ takes, onClear }: { takes: TakeSummary[]; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (takes.length === 0) return <p className="text-sm text-muted">Record a take and its results show up here, so you can see yourself improve.</p>;
  const recent = takes.slice(-30);
  return (
    <>
      <div className="flex h-16 items-end gap-1 rounded-md bg-foreground/[0.05] p-2" role="img" aria-label="Scores of recent takes">
        {recent.map((t) => (
          <div
            key={t.at}
            title={`${Math.round(t.score)}: ${new Date(t.at).toLocaleString()}`}
            className="min-w-1 flex-1 rounded-t-sm"
            style={{ height: `${Math.max(4, t.score)}%`, background: STATUS_COLOR[t.withinPct >= 80 ? "good" : t.withinPct >= 50 ? "warning" : "critical"] }}
          />
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-foreground/10 rounded-md bg-foreground/[0.05]">
        {[...takes]
          .reverse()
          .slice(0, 40)
          .map((t) => (
            <li key={t.at} className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2.5 text-sm">
              <span className="font-medium">
                {t.bpm} BPM · {t.meter} · {t.notes === 0 ? "Mixed" : (SUB_LABELS[t.notes] ?? `${t.notes} per beat`)}
              </span>
              <span className="text-right font-semibold tabular-nums">{Math.round(t.score)}</span>
              <span className="text-xs text-muted">
                {new Date(t.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
                {new Date(t.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {Math.round(t.seconds)} s
              </span>
              <span className="text-right text-xs tabular-nums text-muted">
                {Math.round(t.withinPct)}% · {signedMs(t.meanMs)} · ±{t.stdMs.toFixed(1)}
              </span>
            </li>
          ))}
      </ul>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-start rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-hover hover:text-danger"
      >
        Clear history
      </button>
      {confirming && (
        <ConfirmDialog
          title="Clear history?"
          message="Every take's results will be removed. This can't be undone."
          confirmLabel="Clear"
          onConfirm={() => {
            setConfirming(false);
            onClear();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
