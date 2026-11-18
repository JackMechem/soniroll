"use client";

import { useEffect, useState } from "react";
import { HelpIcon } from "@/components/tools";

export type HelpGroup = {
  heading: string;
  /** Pairs of [keys or gesture, what it does]. */
  items: [string, string][];
};

/** A "?" button that opens a dialog listing a tool's controls. */
export default function HelpButton({ title, groups }: { title: string; groups: HelpGroup[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title} help`}
        title="Help and controls"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <HelpIcon className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label={`${title} help`}
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl ring-1 ring-foreground/[0.06] bg-surface text-left text-foreground shadow-2xl shadow-black/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
              <h2 className="text-lg font-semibold">{title} controls</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-hover"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-6 overflow-y-auto px-5 pb-6 pt-4 sm:px-6">
              {groups.map((group) => (
                <section key={group.heading} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-muted">
                    {group.heading}
                  </h3>
                  <dl className="flex flex-col">
                    {group.items.map(([keys, action]) => (
                      <div
                        key={keys}
                        className="flex flex-col gap-1 border-b border-background/70 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4"
                      >
                        <dt className="shrink-0 sm:w-56">
                          <kbd className="rounded bg-background px-2 py-1 font-sans text-xs font-medium">
                            {keys}
                          </kbd>
                        </dt>
                        <dd className="text-sm text-muted">{action}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
