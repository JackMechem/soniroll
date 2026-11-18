"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

type Pending = { kind: "back" } | { kind: "go"; run: () => void };

/** Puts one extra history entry (same URL) on top, so the browser's Back lands on it first and
    can be asked about instead of leaving straight away. Next's own `pushState` patch copies its
    router state into the entry, so Next treats it as the same page. */
function pushGuard(guarded: { current: boolean }) {
  if (guarded.current) return;
  window.history.pushState({ leaveGuard: true }, "");
  guarded.current = true;
}

/**
 * Asks before leaving a page with unsaved work (the chart editor). While `dirty`:
 * - closing or reloading the tab gets the browser's own "Leave site?" prompt (`beforeunload`);
 * - browser Back, and clicks on links anywhere on the page (the sidebar and so on), open a
 *   "Leave without saving?" dialog first.
 * `requestLeave(action)` is the page's own way out (Close, Escape): it asks only if something
 * changed. `leave(action)` goes without asking (after a save). Both first take the extra history
 * entry back off, so Back from the next page doesn't land on this page twice.
 * Render `dialog` once.
 */
export function useLeaveGuard(dirty: boolean, message = "Your changes haven't been saved.") {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const guarded = useRef(false);
  const afterPop = useRef<(() => void) | null>(null);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });

  // Catch Back from the moment there's something to lose.
  useEffect(() => {
    if (dirty) pushGuard(guarded);
  }, [dirty]);

  useEffect(() => {
    const onPop = () => {
      if (!guarded.current) return;
      // Back took the extra entry off: we're on this page's own entry again.
      guarded.current = false;
      const then = afterPop.current;
      afterPop.current = null;
      if (then) then();
      else if (dirtyRef.current) setPending({ kind: "back" });
      else window.history.back(); // nothing to lose any more: carry on back
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // Links elsewhere on the page (sidebar, top bar): ask first. Capture phase on the document runs
    // before React's own handlers, so Next's <Link> never sees the click.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return; // another site: beforeunload asks
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ kind: "go", run: () => router.push(url.pathname + url.search + url.hash) });
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, router]);

  function leave(action: () => void) {
    setPending(null);
    if (guarded.current) {
      afterPop.current = action;
      window.history.back();
    } else {
      action();
    }
  }

  function requestLeave(action: () => void) {
    if (dirty) setPending({ kind: "go", run: action });
    else leave(action);
  }

  const dialog = pending ? (
    <ConfirmDialog
      title="Leave without saving?"
      message={message}
      confirmLabel="Leave"
      onConfirm={() => {
        if (pending.kind === "back") {
          setPending(null);
          window.history.back();
        } else {
          leave(pending.run);
        }
      }}
      onCancel={() => {
        // Stayed after a Back: put the extra entry back so the next Back asks again.
        if (pending.kind === "back") pushGuard(guarded);
        setPending(null);
      }}
    />
  ) : null;

  return { requestLeave, leave, dialog };
}
