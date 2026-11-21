"use client";

import { mainChartId, removeChartFromTune, replaceMainChart } from "@jam-practice/core/tuneLibrary";
import { useEffect, useState } from "react";
import { KeyPicker, MeterPicker, TempoPicker } from "@/components/TuneFields";
import { sortByText } from "@jam-practice/core/sortText";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { Tune } from "@/lib/types";

const inputClass = "rounded-md bg-foreground/[0.05] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm";

export default function TuneEditorModal({
  initial,
  isNew,
  onSave,
  onClose,
}: {
  initial: Tune;
  isNew: boolean;
  onSave: (tune: Tune) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Tune>(initial);
  const { allSongs } = useChordChartsLibrary(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function save() {
    if (!draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim() });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={isNew ? "New tune" : "Edit tune"}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface text-left text-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-5 sm:px-6">
          <h2 className="text-base font-semibold">{isNew ? "New tune" : "Edit tune"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground sm:h-8 sm:w-8"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-xs font-medium text-muted">Name</span>
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="e.g. Autumn Leaves"
              className={inputClass}
            />
          </label>

          <div className="flex flex-col gap-2 text-sm">
            <span className="text-xs font-medium text-muted">Time signature</span>
            <MeterPicker
              value={draft.timeSignature}
              onChange={(timeSignature) => setDraft((d) => ({ ...d, timeSignature }))}
            />
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <span className="text-xs font-medium text-muted">Tempos (BPM)</span>
            <TempoPicker
              tempos={draft.tempos}
              onChange={(tempos) => setDraft((d) => ({ ...d, tempos }))}
            />
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <span className="text-xs font-medium text-muted">Keys</span>
            <KeyPicker keys={draft.keys} onChange={(keys) => setDraft((d) => ({ ...d, keys }))} />
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-xs font-medium text-muted">Notes</span>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="e.g. watch the bridge modulation"
              rows={3}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-xs font-medium text-muted">Linked chord chart</span>
            <select
              value={mainChartId(draft) ?? ""}
              onChange={(e) =>
                setDraft((d) => {
                  const main = mainChartId(d);
                  // Changes the main chart (any others stay linked); None unlinks the main one.
                  return e.target.value ? replaceMainChart(d, e.target.value) : main ? removeChartFromTune(d, main) : d;
                })
              }
              className={inputClass}
            >
              <option value="">None</option>
              {allSongs.length === 0 ? (
                <option value="" disabled>
                  (no charts in your library yet)
                </option>
              ) : (
                sortByText(allSongs, (s) => s.title).map((song) => (
                  <option key={song.id} value={song.id}>
                    {song.title}
                    {song.composer ? ` — ${song.composer}` : ""}
                  </option>
                ))
              )}
            </select>
            <span className="text-xs text-muted">
              Posting this tune to Community brings its linked chart along automatically.
            </span>
          </label>
        </div>

        {/* Outside the scrolling body, so Add tune is always in reach (on a phone the form is
            several screens tall). */}
        <div className="flex justify-end gap-2 border-t border-foreground/10 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!draft.name.trim()}
            className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isNew ? "Add tune" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
