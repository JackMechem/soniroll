"use client";

import { useState } from "react";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/tools";
import type { Subtask } from "@/lib/practiceLog";
import { TOUCH_TEXT } from "@/components/practicelog/touch";

/** A task's checklist: small checkboxes, and — when `onAdd` is given — a "+ subtask" box. */
export default function Subtasks({
  items,
  isDone,
  onToggle,
  onAdd,
  onRemove,
  color = "var(--accent)",
}: {
  items: Subtask[];
  isDone: (id: string) => boolean;
  onToggle: (id: string) => void;
  onAdd?: (title: string) => void;
  onRemove?: (id: string) => void;
  color?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  if (!items.length && !onAdd) return null;
  const doneCount = items.filter((x) => isDone(x.id)).length;
  return (
    <div className="mt-1.5 flex flex-col gap-0.5">
      {items.map((x) => {
        const done = isDone(x.id);
        return (
          <div key={x.id} className="group/sub flex items-center gap-2 text-sm pointer-coarse:min-h-9">
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              aria-label={`${x.title} done`}
              onClick={() => onToggle(x.id)}
              className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-[1.5px] pointer-coarse:h-5 pointer-coarse:w-5 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 ${done ? "log-check border-transparent text-white" : "border-foreground/25 hover:border-foreground/50"}`}
              style={done ? { background: color } : undefined}
            >
              {done && <CheckIcon className="h-3 w-3" />}
            </button>
            <span className={`min-w-0 flex-1 truncate ${done ? "text-muted line-through" : ""}`}>{x.title}</span>
            {onRemove && (
              <button type="button" onClick={() => onRemove(x.id)} aria-label={`Remove ${x.title}`} className="rounded-sm p-1 text-muted hover:text-foreground lg:p-0.5 lg:opacity-0 lg:group-hover/sub:opacity-100">
                <CloseIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
      {items.length > 1 && <span className="text-xs tabular-nums text-muted">{doneCount}/{items.length} subtasks</span>}
      {onAdd &&
        (adding ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setAdding(false);
              setTitle("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) {
                onAdd(title.trim());
                setTitle("");
              } else if (e.key === "Escape") setAdding(false);
            }}
            enterKeyHint="done"
            placeholder="Add a subtask"
            className="h-8 w-full rounded-md bg-foreground/[0.05] px-2 text-sm outline-none focus:ring-2 focus:ring-accent/40 pointer-coarse:text-base"
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`flex items-center gap-1 self-start text-xs font-medium text-muted hover:text-foreground ${TOUCH_TEXT}`}>
            <PlusIcon className="h-3 w-3" /> Subtask
          </button>
        ))}
    </div>
  );
}
