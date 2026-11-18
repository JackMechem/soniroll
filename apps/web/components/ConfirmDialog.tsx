"use client";

import { useEffect } from "react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-label={title}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
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
