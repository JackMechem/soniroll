"use client";

import { useRef, useState } from "react";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import StandardsPicker from "@/components/StandardsPicker";
import SwitchRow from "@/components/SwitchRow";
import TunesManager from "@/components/TunesManager";
import TuneEditorModal from "@/components/TuneEditorModal";
import { ChecklistIcon, ListIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/tools";
import { csvToTunes, downloadTunesCsv } from "@/lib/csv";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { DEFAULT_TIME_SIGNATURE, Tune, makeId } from "@/lib/types";

function blankTune(name = ""): Tune {
  return {
    id: makeId(),
    name,
    tempos: [],
    keys: [],
    timeSignature: DEFAULT_TIME_SIGNATURE,
    notes: "",
  };
}

type Editing = { tune: Tune; isNew: boolean };

export default function TunesPanel({
  onDeleteTune,
  onClearAll,
  pickFromStandards,
  onPickFromStandardsChange,
}: {
  onDeleteTune: (id: string) => void;
  onClearAll: () => void;
  /** Whether random picks come from the whole standards library instead of this list — a
      Jam-Practice-specific concept. Omit both this and `onPickFromStandardsChange` (as the
      Public Profile editor does — see `components/PublicProfileEditor.tsx` — tune management is
      the same everywhere, but "pick from standards" is only meaningful for Jam Practice's own
      random-tune-picker) to hide that row entirely rather than showing a toggle that wouldn't do
      anything where it's reused. */
  pickFromStandards?: boolean;
  onPickFromStandardsChange?: (value: boolean) => void;
}) {
  const [tunes, setTunes] = useSyncedTunes();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function saveTune(tune: Tune) {
    setTunes((prev) =>
      prev.some((t) => t.id === tune.id)
        ? prev.map((t) => (t.id === tune.id ? tune : t))
        : [...prev, tune],
    );
    setEditing(null);
    setPickerOpen(false);
  }

  function toggle(tuneId: string, field: "tempos" | "keys", itemId: string) {
    setTunes((prev) =>
      prev.map((t) =>
        t.id === tuneId
          ? {
              ...t,
              [field]: t[field].map((item) =>
                item.id === itemId ? { ...item, enabled: !item.enabled } : item,
              ),
            }
          : t,
      ),
    );
  }

  function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = csvToTunes(String(reader.result ?? ""));
      setTunes((prev) => [...prev, ...imported]);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const chip = (enabled: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
      enabled
        ? "bg-foreground/[0.05] text-foreground hover:bg-surface-hover"
        : "border border-dashed border-foreground/15 text-muted line-through hover:text-foreground"
    }`;

  return (
    <>
      <CollapsiblePanel
        id="jam-tunes"
        title="Tunes I Know"
        summary={`${tunes.length} tune${tunes.length === 1 ? "" : "s"}`}
        wide
        icon={ListIcon}
        action={
          <>
            <button
              type="button"
              onClick={() => setManagerOpen(true)}
              disabled={tunes.length === 0}
              aria-label="Manage tunes"
              title="Manage tunes"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
            >
              <ChecklistIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label="Add tune"
              title="Add tune"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground hover:bg-accent-hover"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </>
        }
      >
        {onPickFromStandardsChange && (
          <SwitchRow
            label="Pick from all jazz standards"
            checked={pickFromStandards ?? false}
            onChange={onPickFromStandardsChange}
            hint="Draws from the ~630 built-in jazz standards instead of your own tune list below."
          />
        )}

        {tunes.length === 0 ? (
          <p className="text-sm text-muted">
            No tunes yet. Press + to search jazz standards or create your own.
          </p>
        ) : (
          <ul className="flex max-h-[20.5rem] flex-col gap-2 overflow-y-auto pr-1">
            {tunes.map((tune) => (
              <li
                key={tune.id}
                className="flex flex-col gap-2.5 rounded-md bg-foreground/[0.05] p-3 transition-colors hover:border-foreground/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-tight">{tune.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted">{tune.timeSignature}</p>
                  </div>
                  <div className="-mr-1 -mt-1 flex shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing({ tune, isNew: false })}
                      aria-label={`Edit ${tune.name}`}
                      title="Edit"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTune(tune.id)}
                      aria-label={`Delete ${tune.name}`}
                      title="Delete"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {tune.tempos.length + tune.keys.length === 0 ? (
                  <p className="text-xs text-muted">No tempos or keys</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tune.tempos.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={t.enabled}
                        onClick={() => toggle(tune.id, "tempos", t.id)}
                        className={chip(t.enabled)}
                      >
                        {t.value} <span className="text-[0.65rem] opacity-70">BPM</span>
                      </button>
                    ))}
                    {tune.keys.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        aria-pressed={k.enabled}
                        onClick={() => toggle(tune.id, "keys", k.id)}
                        className={chip(k.enabled)}
                      >
                        {k.value}
                      </button>
                    ))}
                  </div>
                )}

                {tune.notes && (
                  <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted">
                    {tune.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => downloadTunesCsv(tunes)}
            disabled={tunes.length === 0}
            className="rounded-md bg-foreground/[0.05] px-3 py-1.5 hover:bg-surface-hover disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-foreground/[0.05] px-3 py-1.5 hover:bg-surface-hover"
          >
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            disabled={tunes.length === 0}
            className="ml-auto rounded-md bg-foreground/[0.05] px-3 py-1.5 text-danger hover:bg-surface-hover disabled:opacity-50"
          >
            Clear all
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={importCsv}
            className="hidden"
          />
        </div>
      </CollapsiblePanel>

      {managerOpen && (
        <TunesManager
          onClose={() => setManagerOpen(false)}
          onEdit={(tune) => setEditing({ tune, isNew: false })}
          onDeleteTune={onDeleteTune}
        />
      )}
      {pickerOpen && (
        <StandardsPicker
          onClose={() => setPickerOpen(false)}
          onCreateCustom={(name) => setEditing({ tune: blankTune(name), isNew: true })}
        />
      )}
      {confirmingClear && (
        <ConfirmDialog
          title="Clear all tunes?"
          message={`This removes all ${tunes.length} tune${tunes.length === 1 ? "" : "s"} from your list so you can start from scratch. It can't be undone — export a CSV first if you want a backup.`}
          confirmLabel="Clear all"
          onConfirm={() => {
            onClearAll();
            setConfirmingClear(false);
          }}
          onCancel={() => setConfirmingClear(false)}
        />
      )}
      {editing && (
        <TuneEditorModal
          key={editing.tune.id}
          initial={editing.tune}
          isNew={editing.isNew}
          onSave={saveTune}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
