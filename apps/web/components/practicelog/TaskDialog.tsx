"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AttachmentList } from "@/components/practicelog/Attachments";
import { CloseIcon, TrashIcon } from "@/components/tools";
import { type DayTask, formatLongDate, isDateKey } from "@/lib/practiceLog";

const LABEL = "text-xs font-medium text-muted";
const INPUT = "h-9 w-full min-w-0 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40";

/** Make or edit a one-off task: what, which day, how long, optionally when, notes and attachments. */
export default function TaskDialog({
  initial,
  date,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  initial: DayTask;
  date: string;
  isNew: boolean;
  onSave: (task: DayTask, date: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [task, setTask] = useState(initial);
  const [day, setDay] = useState(date);
  const set = (patch: Partial<DayTask>) => setTask((t) => ({ ...t, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    onSave({ ...task, title: task.title.trim() || "Practice" }, day);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-overlay p-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-label={isNew ? "New task" : "Edit task"} className="flex w-full max-w-md flex-col gap-4 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 text-foreground shadow-2xl shadow-black/20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{isNew ? "New task" : "Edit task"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>What to practice</span>
          <input
            autoFocus
            value={task.title}
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="e.g. Transcribe a chorus"
            className={INPUT}
          />
        </label>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 flex flex-col gap-1.5">
            <span className={LABEL}>Day</span>
            <input type="date" value={day} onChange={(e) => isDateKey(e.target.value) && setDay(e.target.value)} className={INPUT} />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>Minutes</span>
            <div className="flex h-9 items-center overflow-hidden rounded-md bg-background">
              <button type="button" onClick={() => set({ minutes: Math.max(0, task.minutes - 5) })} aria-label="Less" className="h-full w-9 shrink-0 text-muted hover:bg-surface-hover hover:text-foreground">
                −
              </button>
              <input
                inputMode="decimal"
                value={task.minutes}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) set({ minutes: Math.min(600, Math.max(0, n)) });
                }}
                className="min-w-0 flex-1 bg-transparent text-center font-medium tabular-nums outline-none"
              />
              <button type="button" onClick={() => set({ minutes: Math.min(600, task.minutes + 5) })} aria-label="More" className="h-full w-9 shrink-0 text-muted hover:bg-surface-hover hover:text-foreground">
                +
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>At (optional)</span>
            <input type="time" value={task.time ?? ""} onChange={(e) => set({ time: e.target.value || null })} className={INPUT} />
          </label>
        </div>
        <textarea
          value={task.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value })}
          rows={2}
          placeholder="Notes (optional)"
          aria-label="Notes"
          className="resize-y rounded-md bg-foreground/[0.05] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <AttachmentList items={task.attachments ?? []} onChange={(attachments) => set({ attachments })} />
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="-ml-2 flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-danger hover:bg-surface-hover"
            >
              <TrashIcon className="h-4 w-4" /> Delete
            </button>
          )}
          <span className="ml-auto truncate text-xs text-muted">{formatLongDate(day)}</span>
          <button type="button" onClick={save} className="h-9 shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            {isNew ? "Add task" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
