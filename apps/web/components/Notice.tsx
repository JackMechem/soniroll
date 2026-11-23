"use client";

import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/tools";
import { dismissNotice, useNotice } from "@/lib/notice";

/** The notice from `showNotice` (`lib/notice.ts`): a small bar at the bottom middle of the window,
    with its action (Undo…) and ×. Mounted once by `AppShell`. */
export default function Notice() {
  const notice = useNotice();
  if (!notice) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[96] flex justify-center px-4" aria-live="polite">
      <div
        key={notice.id}
        role="status"
        className="log-toast pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-foreground py-2 pl-4 pr-2 text-sm text-background shadow-2xl"
      >
        <span className="min-w-0 flex-1">{notice.text}</span>
        {notice.action && (
          <button
            type="button"
            onClick={() => {
              notice.action!.run();
              dismissNotice(notice.id);
            }}
            className="h-8 shrink-0 rounded-md px-2.5 font-semibold text-background underline-offset-2 hover:underline"
          >
            {notice.action.label}
          </button>
        )}
        <button type="button" onClick={() => dismissNotice(notice.id)} aria-label="Dismiss" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-background/70 hover:text-background">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
