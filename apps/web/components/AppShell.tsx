"use client";

import TilingLayout from "@/components/TilingLayout";
import PracticeLogGlobal from "@/components/practicelog/PracticeLogGlobal";
import { useRecordToolVisits } from "@/lib/toolRecents";

/** The main area beside the sidebar: the page Next.js resolved (`children`), inside
    `TilingLayout`, which also draws split-screen panes and the side view around it when there are
    any (`lib/useTilingLayout.ts`). With nothing open beside it, it's just the page, sliding in on
    each route change. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  useRecordToolVisits();
  return (
    <>
      <PracticeLogGlobal />
      <TilingLayout>{children}</TilingLayout>
    </>
  );
}
