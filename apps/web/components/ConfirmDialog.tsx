"use client";

import { useEffect, useId } from "react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  /** The button that backs out (when "Cancel" would read oddly, e.g. next to "Cancel plan"). */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        className="flex w-full flex-col gap-4 rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-left text-foreground shadow-2xl shadow-black/20 sm:max-w-sm sm:rounded-xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <h2 id={`${id}-title`} className="text-base font-semibold">{title}</h2>
          <p id={`${id}-message`} className="text-sm text-muted">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          {/* Focus starts on the safe choice, so Enter never deletes by accident. */}
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md bg-danger px-4 text-sm font-medium text-background hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
