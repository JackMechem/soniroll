"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/tools";
import FeedbackForm, { OPEN_FEEDBACK_EVENT, type FeedbackKind, type FeedbackTarget } from "@/components/feedback/FeedbackForm";

/** The app-wide feedback dialog, opened by `openFeedback()` (mounted once in `AppChrome`). */
export default function FeedbackDialog() {
  const [open, setOpen] = useState<{ kind?: FeedbackKind; target?: FeedbackTarget } | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => setOpen((e as CustomEvent).detail ?? {});
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const report = !!open.target;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-4" onClick={() => setOpen(null)}>
      <div
        role="dialog"
        aria-label={report ? "Report" : "Send feedback"}
        className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface p-5 shadow-2xl sm:max-w-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{report ? "Report" : "Send feedback"}</h2>
            {!report && <p className="text-sm text-muted">Bugs, ideas, complaints — it all goes straight to the person who builds soniroll.</p>}
          </div>
          <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <FeedbackForm compact initialKind={open.kind} target={open.target} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} />
      </div>
    </div>
  );
}
