"use client";

import { useState } from "react";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import Hint from "@/components/Hint";
import { AUDIO_ONLY, useFilePicker } from "@/components/files/FilePicker";
import PromptDialog from "@/components/PromptDialog";
import { DownloadIcon, ListIcon, PencilIcon, PlayIcon, TrashIcon, UploadIcon } from "@/components/tools";
import { formatDuration, formatRecordedAt } from "@/lib/recordings";
import { type TunerTake, deleteTake, downloadTake, renameTake } from "@/lib/tunerTakes";

/** Bigger files take long to read and a lot of memory to analyse. */
const MAX_FILE_BYTES = 40 * 1024 * 1024;

/**
 * The Tuner's takes, as a chip above the dial (like other tools' History): open one in the tuner,
 * rename, download or delete it, or open an audio file from this device. The dialogs live outside
 * the popover, which closes when you click into them.
 */
export default function TakesChip({
  takes,
  openId,
  onOpen,
  onOpenFile,
  onDeleted,
}: {
  takes: TunerTake[] | null;
  /** The take open in the tuner right now. */
  openId: string | null;
  onOpen: (take: TunerTake) => void;
  onOpenFile: (file: File) => void;
  onDeleted: (id: string) => void;
}) {
  const [popover, setPopover] = useState(false);
  const [renaming, setRenaming] = useState<TunerTake | null>(null);
  const [deleting, setDeleting] = useState<TunerTake | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // "Open a file": one of your files or recordings (signed in), or one from this device.
  const picker = useFilePicker({
    filter: AUDIO_ONLY,
    title: "Open a file in the Tuner",
    onFile: (file) => {
      if (file.size > MAX_FILE_BYTES) {
        setFileError("That file is too big. Pick one under 40 MB.");
        setPopover(true);
        return;
      }
      setFileError(null);
      onOpenFile(file);
    },
  });
  const count = takes?.length ?? 0;

  const body = (
    <>
        <Hint>
          Takes are kept in this browser, on this device only. They aren&apos;t uploaded or saved to your account, and clearing the browser&apos;s data
          deletes them. Play one to watch the needle follow it, with a graph of how sharp or flat each note was.
        </Hint>
        <button
          type="button"
          onClick={() => {
            setPopover(false);
            picker.open();
          }}
          className="flex h-9 items-center justify-center gap-2 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover"
        >
          <UploadIcon className="h-4 w-4" />
          Open a file
        </button>
        {fileError && <p className="text-xs text-danger">{fileError}</p>}

        {takes === null ? null : takes.length === 0 ? (
          <p className="text-sm text-muted">No takes yet. Press Record to make one, or open an audio file.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/10">
            {takes.map((take) => {
              const isOpen = take.id === openId;
              return (
                <li key={take.id} className="flex items-center gap-1 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPopover(false);
                      onOpen(take);
                    }}
                    aria-label={`Play ${take.name} in the tuner`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${isOpen ? "border-accent bg-accent text-accent-foreground" : "border-foreground/15 text-muted"}`}>
                      <PlayIcon className="ml-0.5 h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{take.name}</span>
                      <span className="block text-xs tabular-nums text-muted">
                        {formatRecordedAt(take.added)} · {formatDuration(take.meta.durationSec)}
                      </span>
                    </span>
                  </button>
                  <IconButton label={`Rename ${take.name}`} onClick={() => setRenaming(take)}>
                    <PencilIcon className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={`Download ${take.name}`} onClick={() => void downloadTake(take)}>
                    <DownloadIcon className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={`Delete ${take.name}`} danger onClick={() => setDeleting(take)}>
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
    </>
  );

  return (
    <>
      {/* A chip like other tools' History, even before the first take ("None yet"): it also
          opens an audio file. */}
      <CollapsiblePanel
        id="tuner-takes"
        title="Takes"
        icon={ListIcon}
        summary={count === 0 ? "None yet" : `${count} take${count === 1 ? "" : "s"}`}
        open={popover}
        onOpenChange={setPopover}
      >
        {body}
      </CollapsiblePanel>

      {picker.elements}
      {renaming && (
        <PromptDialog
          title="Rename take"
          initialValue={renaming.name}
          onSubmit={(name) => {
            void renameTake(renaming.id, name);
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          message="It's deleted from this device for good."
          confirmLabel="Delete"
          onConfirm={() => {
            void deleteTake(deleting.id);
            onDeleted(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover ${danger ? "hover:text-danger" : "hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
