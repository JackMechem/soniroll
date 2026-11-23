"use client";

import { useEffect, useState } from "react";

/** A small dialog asking for a line of text (e.g. a new name). */
export default function PromptDialog({
  title,
  initialValue,
  confirmLabel = "Save",
  placeholder,
  allowEmpty = false,
  onSubmit,
  onCancel,
}: {
  title: string;
  initialValue: string;
  confirmLabel?: string;
  placeholder?: string;
  /** Lets an empty value through (e.g. clearing an optional description). */
  allowEmpty?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);

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

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed || allowEmpty) onSubmit(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label={title}
        className="flex w-full flex-col gap-4 rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-left text-foreground shadow-2xl shadow-black/20 sm:max-w-sm sm:rounded-xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Stops the Enter's keypress from clicking whatever gets focus next (a confirm
            // dialog opened by `onSubmit` focuses its Cancel button).
            e.preventDefault();
            submit();
          }}
          className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!allowEmpty && !value.trim()}
            className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
