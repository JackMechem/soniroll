"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import TilingLayout from "@/components/TilingLayout";
import PracticeLogGlobal from "@/components/practicelog/PracticeLogGlobal";
import { prefersReducedMotion } from "@/lib/logoAnimation";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useRecordToolVisits } from "@/lib/toolRecents";
import { useTilingState } from "@/lib/useTilingLayout";

/** Wraps `children` (the page Next.js actually resolved for the current URL) in the one div every
    route already rendered inside before "Advanced layouts" existed — unless that's turned on
    *and* the screen is desktop-sized, in which case `children` is dropped entirely in favor of
    `TilingLayout`'s own tree of panes (see that component's own doc comment for why there's no
    way to reconcile "the real Next.js page" with "several independently-chosen tools on screen at
    once"). The `useIsDesktop()` check lives here, not inside `TilingLayout` — per an explicit
    request to disable the feature *completely* on mobile, this is what makes sure `TilingLayout`
    (and its own effects — the tree-seeding one in particular) never even mounts on a phone, not
    just that its UI looks different there. If `enabled` is somehow `true` in storage from an
    earlier desktop session on the same browser profile, a phone-width visit here is still just
    the plain page, same as if the toggle were off — not a degraded tiling view. Reads the same
    `useTilingState()` the tiling layout itself does, so flipping "Advanced layouts" off/on from
    the sidebar swaps between the two instantly, no reload needed. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { enabled } = useTilingState();
  const isDesktop = useIsDesktop();
  useRecordToolVisits();

  if (!enabled || !isDesktop)
    return (
      <>
        <PracticeLogGlobal />
        <AnimatedPage>{children}</AnimatedPage>
      </>
    );

  return (
    <>
      <PracticeLogGlobal />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <TilingLayout />
      </div>
    </>
  );
}

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/** The page transition: on every route change the new page slides in from the right, while the
    sidebar logo's sticks strike (`AnimatedLogo`). Runs in a layout effect, so the new page never
    shows un-animated for a frame; Web Animations only (no re-renders, nothing left behind);
    skipped under reduced motion and on the first load. */
function AnimatedPage({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pageRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const page = pageRef.current;
    if (!page || prefersReducedMotion()) return;
    page.scrollTop = 0;
    const slide = page.animate(
      [
        { opacity: 0, transform: "translateX(36px) scale(0.985)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 480, easing: EASE_OUT },
    );
    return () => slide.cancel();
  }, [pathname]);

  // Phones: room under the page for the floating bug-report button (bottom right), so the last
  // row, a footer link or a tool's option chips can always sit clear of it.
  return (
    <div ref={pageRef} data-page-scroll className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      {children}
    </div>
  );
}
